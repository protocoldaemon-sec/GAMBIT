/**
 * Market Intelligence Graph
 * LangGraph workflow for market analysis
 * Compatible with LangSmith Studio
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { getMarket, getOrderbook } from "../plugins/defi/tools/kalshi.js";
import { searchNews } from "../intelligence/scraper.js";
import { getMultiLLM } from "../llm/index.js";

// State definition
const MarketIntelState = Annotation.Root({
  // Input
  ticker: Annotation({ reducer: (_, b) => b }),
  
  // Intermediate
  market: Annotation({ reducer: (_, b) => b }),
  orderbook: Annotation({ reducer: (_, b) => b }),
  news: Annotation({ reducer: (_, b) => b }),
  
  // Output
  analysis: Annotation({ reducer: (_, b) => b }),
  signal: Annotation({ reducer: (_, b) => b }),
  
  // Metadata
  messages: Annotation({ reducer: (a, b) => [...(a || []), ...b], default: () => [] }),
});

// Node: Fetch market data
async function fetchMarket(state) {
  const { ticker } = state;
  
  console.log(`[Graph] Fetching market: ${ticker}`);
  
  try {
    const market = await getMarket(null, ticker);
    const orderbook = await getOrderbook(null, ticker);
    
    return {
      market,
      orderbook,
      messages: [{
        role: "system",
        content: `Fetched market ${ticker}: YES=${market.yesPrice}, NO=${market.noPrice}`,
      }],
    };
  } catch (error) {
    return {
      market: null,
      orderbook: null,
      messages: [{ role: "system", content: `Error fetching market: ${error.message}` }],
    };
  }
}

// Node: Fetch related news
async function fetchNews(state) {
  const { market } = state;
  
  if (!market) {
    return { news: [], messages: [{ role: "system", content: "Skipping news - no market data" }] };
  }
  
  console.log(`[Graph] Fetching news for: ${market.title}`);
  
  try {
    const results = await searchNews(market.title, { limit: 5 });
    
    return {
      news: results.articles,
      messages: [{
        role: "system",
        content: `Found ${results.articles.length} news articles`,
      }],
    };
  } catch (error) {
    return {
      news: [],
      messages: [{ role: "system", content: `Error fetching news: ${error.message}` }],
    };
  }
}


// Node: Analyze with LLM
async function analyze(state) {
  const { market, news, orderbook } = state;
  
  if (!market) {
    return {
      analysis: { error: "No market data" },
      messages: [{ role: "system", content: "Cannot analyze - no market data" }],
    };
  }
  
  console.log(`[Graph] Analyzing market intelligence`);
  
  const llm = getMultiLLM();
  
  const prompt = `Analyze this prediction market and provide trading recommendation.

Market: ${market.title}
YES Price: ${market.yesPrice}
NO Price: ${market.noPrice}
Volume: ${market.volume}
Close Time: ${market.closeTime}

Recent Headlines:
${news.slice(0, 5).map(n => `- ${n.title}`).join("\n")}

Respond in JSON:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 0.0-1.0,
  "signal": "BUY_YES" | "BUY_NO" | "HOLD",
  "reasoning": "explanation",
  "keyFactors": ["factor1", "factor2"]
}`;

  try {
    const result = await llm.reason(prompt);
    const content = result.content.replace(/```json\n?|\n?```/g, "").trim();
    const analysis = JSON.parse(content);
    
    return {
      analysis,
      messages: [{
        role: "assistant",
        content: `Analysis complete: ${analysis.signal} (${analysis.confidence} confidence)`,
      }],
    };
  } catch (error) {
    return {
      analysis: { sentiment: "NEUTRAL", confidence: 0.5, signal: "HOLD", reasoning: "Analysis failed" },
      messages: [{ role: "system", content: `Analysis error: ${error.message}` }],
    };
  }
}

// Node: Generate trading signal
async function generateSignal(state) {
  const { analysis, market, orderbook } = state;
  
  console.log(`[Graph] Generating trading signal`);
  
  // Calculate liquidity
  const yesDepth = (orderbook?.yes || []).reduce((sum, [_, qty]) => sum + qty, 0);
  const noDepth = (orderbook?.no || []).reduce((sum, [_, qty]) => sum + qty, 0);
  const liquidityScore = Math.min(1, (yesDepth + noDepth) / 10000);
  
  // Adjust confidence by liquidity
  const adjustedConfidence = (analysis?.confidence || 0.5) * (0.5 + liquidityScore * 0.5);
  
  let signal = {
    action: "HOLD",
    side: null,
    confidence: adjustedConfidence,
    price: null,
    liquidity: liquidityScore,
  };
  
  if (adjustedConfidence > 0.6 && analysis?.signal) {
    if (analysis.signal === "BUY_YES") {
      signal = { ...signal, action: "BUY", side: "yes", price: market?.yesPrice };
    } else if (analysis.signal === "BUY_NO") {
      signal = { ...signal, action: "BUY", side: "no", price: market?.noPrice };
    }
  }
  
  signal.reasoning = analysis?.reasoning;
  signal.keyFactors = analysis?.keyFactors;
  
  return {
    signal,
    messages: [{
      role: "assistant",
      content: `Signal: ${signal.action}${signal.side ? ` ${signal.side.toUpperCase()}` : ""} @ ${signal.confidence.toFixed(2)} confidence`,
    }],
  };
}

// Build graph
const workflow = new StateGraph(MarketIntelState)
  .addNode("fetchMarket", fetchMarket)
  .addNode("fetchNews", fetchNews)
  .addNode("analyze", analyze)
  .addNode("generateSignal", generateSignal)
  .addEdge(START, "fetchMarket")
  .addEdge("fetchMarket", "fetchNews")
  .addEdge("fetchNews", "analyze")
  .addEdge("analyze", "generateSignal")
  .addEdge("generateSignal", END);

// Export compiled graph
export const graph = workflow.compile();

export default graph;
