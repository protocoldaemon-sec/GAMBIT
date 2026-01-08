/**
 * Trading Decision Graph
 * LangGraph workflow for trading decisions with risk management
 * Compatible with LangSmith Studio
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { getMarket } from "../plugins/defi/tools/kalshi.js";
import { KellyCriterion } from "../quant/kelly.js";
import { RegimeDetector } from "../quant/regime-detector.js";
import { MonteCarloSimulator } from "../simulation/monte-carlo.js";
import { getMultiLLM } from "../llm/index.js";

// State definition
const TradingState = Annotation.Root({
  // Input
  ticker: Annotation({ reducer: (_, b) => b }),
  portfolioValue: Annotation({ reducer: (_, b) => b, default: () => 10000 }),
  riskTolerance: Annotation({ reducer: (_, b) => b, default: () => 0.02 }),
  
  // Market data
  market: Annotation({ reducer: (_, b) => b }),
  
  // Analysis
  regime: Annotation({ reducer: (_, b) => b }),
  simulation: Annotation({ reducer: (_, b) => b }),
  kelly: Annotation({ reducer: (_, b) => b }),
  
  // Output
  decision: Annotation({ reducer: (_, b) => b }),
  
  // Metadata
  messages: Annotation({ reducer: (a, b) => [...(a || []), ...b], default: () => [] }),
});

// Node: Fetch market
async function fetchMarketNode(state) {
  const { ticker } = state;
  
  console.log(`[Graph] Fetching market: ${ticker}`);
  
  try {
    const market = await getMarket(null, ticker);
    return {
      market,
      messages: [{ role: "system", content: `Market ${ticker}: YES=${market.yesPrice}` }],
    };
  } catch (error) {
    return {
      market: null,
      messages: [{ role: "system", content: `Error: ${error.message}` }],
    };
  }
}

// Node: Detect regime
async function detectRegimeNode(state) {
  const { market } = state;
  
  if (!market) {
    return { regime: null, messages: [{ role: "system", content: "No market data for regime" }] };
  }
  
  console.log(`[Graph] Detecting market regime`);
  
  // Simplified regime detection based on price
  const price = market.yesPrice;
  let regime = "NEUTRAL";
  
  if (price > 0.7) regime = "RISK_ON";
  else if (price < 0.3) regime = "RISK_OFF";
  
  return {
    regime: {
      current: regime,
      confidence: Math.abs(price - 0.5) * 2,
      recommendation: {
        RISK_ON: { kellyMultiplier: 1.0, strategy: "TREND_FOLLOWING" },
        NEUTRAL: { kellyMultiplier: 0.5, strategy: "MEAN_REVERSION" },
        RISK_OFF: { kellyMultiplier: 0.25, strategy: "DEFENSIVE" },
      }[regime],
    },
    messages: [{ role: "system", content: `Regime: ${regime}` }],
  };
}


// Node: Run simulation
async function runSimulationNode(state) {
  const { market, portfolioValue } = state;
  
  if (!market) {
    return { simulation: null, messages: [{ role: "system", content: "No market for simulation" }] };
  }
  
  console.log(`[Graph] Running Monte Carlo simulation`);
  
  const simulator = new MonteCarloSimulator({ iterations: 1000 });
  
  try {
    const result = await simulator.runSimulation({
      ticker: market.ticker,
      initialPrice: market.yesPrice,
      volatility: 0.3,
      drift: 0,
      positionSize: portfolioValue * 0.1,
      side: "yes",
    });
    
    return {
      simulation: {
        var95: result.summary.var95,
        var99: result.summary.var99,
        expectedPnl: result.summary.meanPnl,
        winRate: result.summary.winRate,
        sharpe: result.summary.sharpeRatio,
      },
      messages: [{
        role: "system",
        content: `Simulation: VaR95=${result.summary.var95.toFixed(2)}, WinRate=${(result.summary.winRate * 100).toFixed(0)}%`,
      }],
    };
  } catch (error) {
    return {
      simulation: null,
      messages: [{ role: "system", content: `Simulation error: ${error.message}` }],
    };
  }
}

// Node: Calculate Kelly
async function calculateKellyNode(state) {
  const { market, regime, portfolioValue, riskTolerance } = state;
  
  if (!market) {
    return { kelly: null, messages: [{ role: "system", content: "No market for Kelly" }] };
  }
  
  console.log(`[Graph] Calculating Kelly criterion`);
  
  const kellyCalc = new KellyCriterion();
  
  // Estimate probability (simplified - in production use ML model)
  const estimatedProb = market.yesPrice + (Math.random() - 0.5) * 0.1;
  
  const kelly = kellyCalc.calculateRegimeAdjustedKelly({
    currentPrice: market.yesPrice,
    estimatedProbability: Math.max(0.1, Math.min(0.9, estimatedProb)),
    side: "yes",
    regime: regime?.current || "NEUTRAL",
    volatility: 0.3,
    confidence: regime?.confidence || 0.5,
  });
  
  return {
    kelly: {
      fraction: kelly.adjustedKelly,
      betSize: kellyCalc.calculateBetSize(portfolioValue, kelly.adjustedKelly),
      edge: kelly.edgePercent,
      recommendation: kelly.finalRecommendation,
    },
    messages: [{
      role: "system",
      content: `Kelly: ${(kelly.adjustedKelly * 100).toFixed(1)}% of portfolio`,
    }],
  };
}

// Node: Make decision
async function makeDecisionNode(state) {
  const { market, regime, simulation, kelly, portfolioValue, riskTolerance } = state;
  
  console.log(`[Graph] Making trading decision`);
  
  const llm = getMultiLLM();
  
  const prompt = `Make a trading decision based on this analysis.

Market: ${market?.title || "Unknown"}
Current Price: YES=${market?.yesPrice}, NO=${market?.noPrice}

Regime: ${regime?.current || "UNKNOWN"} (${((regime?.confidence || 0) * 100).toFixed(0)}% confidence)
Strategy: ${regime?.recommendation?.strategy || "N/A"}

Simulation Results:
- VaR 95%: $${simulation?.var95?.toFixed(2) || "N/A"}
- Win Rate: ${((simulation?.winRate || 0) * 100).toFixed(0)}%
- Expected P&L: $${simulation?.expectedPnl?.toFixed(2) || "N/A"}

Kelly Analysis:
- Recommended Size: ${((kelly?.fraction || 0) * 100).toFixed(1)}% of portfolio
- Edge: ${kelly?.edge?.toFixed(1) || 0}%
- Bet Size: $${kelly?.betSize?.recommendedBetSize?.toFixed(2) || "N/A"}

Portfolio: $${portfolioValue}
Risk Tolerance: ${(riskTolerance * 100).toFixed(0)}% per trade

Respond in JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "side": "yes" | "no" | null,
  "size": number (in dollars),
  "confidence": 0.0-1.0,
  "reasoning": "explanation",
  "risks": ["risk1", "risk2"]
}`;

  try {
    const result = await llm.reason(prompt);
    const content = result.content.replace(/```json\n?|\n?```/g, "").trim();
    const decision = JSON.parse(content);
    
    return {
      decision: {
        ...decision,
        market: market?.ticker,
        timestamp: new Date().toISOString(),
      },
      messages: [{
        role: "assistant",
        content: `Decision: ${decision.action}${decision.side ? ` ${decision.side.toUpperCase()}` : ""} $${decision.size || 0}`,
      }],
    };
  } catch (error) {
    return {
      decision: {
        action: "HOLD",
        side: null,
        size: 0,
        confidence: 0,
        reasoning: "Decision failed",
        risks: ["Analysis error"],
      },
      messages: [{ role: "system", content: `Decision error: ${error.message}` }],
    };
  }
}

// Build graph
const workflow = new StateGraph(TradingState)
  .addNode("fetchMarket", fetchMarketNode)
  .addNode("detectRegime", detectRegimeNode)
  .addNode("runSimulation", runSimulationNode)
  .addNode("calculateKelly", calculateKellyNode)
  .addNode("makeDecision", makeDecisionNode)
  .addEdge(START, "fetchMarket")
  .addEdge("fetchMarket", "detectRegime")
  .addEdge("detectRegime", "runSimulation")
  .addEdge("runSimulation", "calculateKelly")
  .addEdge("calculateKelly", "makeDecision")
  .addEdge("makeDecision", END);

// Export compiled graph
export const graph = workflow.compile();

export default graph;
