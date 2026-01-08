/**
 * DFlow Swap Graph
 * LangGraph workflow for token swaps via DFlow Trade API
 * Compatible with LangSmith Studio
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { getDFlowClient, TOKENS } from "../plugins/defi/tools/dflow.js";
import { getMultiLLM } from "../llm/index.js";

// State definition
const SwapState = Annotation.Root({
  // Input
  inputToken: Annotation({ reducer: (_, b) => b }),
  outputToken: Annotation({ reducer: (_, b) => b }),
  amount: Annotation({ reducer: (_, b) => b }),
  slippageBps: Annotation({ reducer: (_, b) => b, default: () => 50 }),
  
  // Quote
  quote: Annotation({ reducer: (_, b) => b }),
  
  // Analysis
  priceAnalysis: Annotation({ reducer: (_, b) => b }),
  recommendation: Annotation({ reducer: (_, b) => b }),
  
  // Execution
  execute: Annotation({ reducer: (_, b) => b, default: () => false }),
  result: Annotation({ reducer: (_, b) => b }),
  
  // Metadata
  messages: Annotation({ reducer: (a, b) => [...(a || []), ...b], default: () => [] }),
});

// Resolve token symbol to mint address
function resolveToken(token) {
  if (!token) return null;
  const upper = token.toUpperCase();
  return TOKENS[upper] || token;
}

// Node: Get quote
async function getQuoteNode(state) {
  const { inputToken, outputToken, amount, slippageBps } = state;
  
  console.log(`[DFlow Graph] Getting quote: ${amount} ${inputToken} -> ${outputToken}`);
  
  const client = getDFlowClient();
  
  try {
    const inputMint = resolveToken(inputToken);
    const outputMint = resolveToken(outputToken);
    
    const quote = await client.getQuote({
      inputMint,
      outputMint,
      amount,
      slippageBps,
    });
    
    return {
      quote: {
        ...quote,
        inputToken,
        outputToken,
        inputMint,
        outputMint,
      },
      messages: [{
        role: "system",
        content: `Quote: ${amount} ${inputToken} -> ${quote.outAmount} ${outputToken}`,
      }],
    };
  } catch (error) {
    return {
      quote: null,
      messages: [{ role: "system", content: `Quote error: ${error.message}` }],
    };
  }
}

// Node: Analyze price
async function analyzePriceNode(state) {
  const { quote, inputToken, outputToken, amount } = state;
  
  if (!quote) {
    return {
      priceAnalysis: null,
      messages: [{ role: "system", content: "No quote for analysis" }],
    };
  }
  
  console.log(`[DFlow Graph] Analyzing price`);
  
  // Calculate effective price
  const inAmount = Number(quote.inAmount);
  const outAmount = Number(quote.outAmount);
  
  // Adjust for decimals (SOL=9, USDC/USDT=6)
  const inDecimals = inputToken.toUpperCase() === "SOL" ? 9 : 6;
  const outDecimals = outputToken.toUpperCase() === "SOL" ? 9 : 6;
  
  const inHuman = inAmount / Math.pow(10, inDecimals);
  const outHuman = outAmount / Math.pow(10, outDecimals);
  const effectivePrice = outHuman / inHuman;
  
  const priceImpact = quote.priceImpactPct || 0;
  
  return {
    priceAnalysis: {
      inAmount: inHuman,
      outAmount: outHuman,
      effectivePrice,
      priceImpact,
      priceImpactWarning: priceImpact > 1,
      route: quote.routePlan || [],
    },
    messages: [{
      role: "system",
      content: `Price: ${effectivePrice.toFixed(4)} ${outputToken}/${inputToken}, Impact: ${priceImpact.toFixed(2)}%`,
    }],
  };
}


// Node: Generate recommendation
async function recommendNode(state) {
  const { quote, priceAnalysis, inputToken, outputToken, amount } = state;
  
  if (!quote || !priceAnalysis) {
    return {
      recommendation: { action: "SKIP", reason: "Missing data" },
      messages: [{ role: "system", content: "Cannot recommend without data" }],
    };
  }
  
  console.log(`[DFlow Graph] Generating recommendation`);
  
  const llm = getMultiLLM();
  
  const prompt = `Analyze this token swap and provide a recommendation.

Swap: ${priceAnalysis.inAmount} ${inputToken} -> ${priceAnalysis.outAmount} ${outputToken}
Effective Price: ${priceAnalysis.effectivePrice.toFixed(6)} ${outputToken}/${inputToken}
Price Impact: ${priceAnalysis.priceImpact.toFixed(4)}%
Slippage Tolerance: ${state.slippageBps} bps

Respond in JSON:
{
  "action": "EXECUTE" | "SKIP" | "REDUCE_SIZE",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "warnings": ["warning1", "warning2"],
  "suggestedSlippage": number (in bps, if different)
}`;

  try {
    const result = await llm.complete(prompt, { task: "analysis", temperature: 0 });
    const content = result.content.replace(/```json\n?|\n?```/g, "").trim();
    const recommendation = JSON.parse(content);
    
    return {
      recommendation,
      messages: [{
        role: "assistant",
        content: `Recommendation: ${recommendation.action} (${(recommendation.confidence * 100).toFixed(0)}% confidence)`,
      }],
    };
  } catch (error) {
    // Default recommendation based on price impact
    const action = priceAnalysis.priceImpact > 2 ? "REDUCE_SIZE" : 
                   priceAnalysis.priceImpact > 5 ? "SKIP" : "EXECUTE";
    
    return {
      recommendation: {
        action,
        confidence: 0.7,
        reasoning: `Price impact is ${priceAnalysis.priceImpact.toFixed(2)}%`,
        warnings: priceAnalysis.priceImpactWarning ? ["High price impact"] : [],
      },
      messages: [{ role: "system", content: `Auto-recommendation: ${action}` }],
    };
  }
}

// Node: Execute swap (conditional)
async function executeSwapNode(state) {
  const { execute, quote, recommendation } = state;
  
  // Only execute if explicitly requested and recommended
  if (!execute) {
    return {
      result: { executed: false, reason: "Execution not requested" },
      messages: [{ role: "system", content: "Swap not executed (dry run)" }],
    };
  }
  
  if (recommendation?.action === "SKIP") {
    return {
      result: { executed: false, reason: "Not recommended" },
      messages: [{ role: "system", content: "Swap skipped per recommendation" }],
    };
  }
  
  console.log(`[DFlow Graph] Executing swap`);
  
  const client = getDFlowClient();
  
  try {
    // Request fresh order with transaction
    const orderResponse = await client.requestOrder({
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      amount: quote.inAmount,
      slippageBps: state.slippageBps,
    });
    
    // Sign and submit
    const { signature, executionMode } = await client.signAndSubmit(orderResponse);
    
    // Monitor completion
    const result = await client.monitorOrder(signature, executionMode);
    
    return {
      result: {
        executed: true,
        signature,
        status: result.status,
        fills: result.fills,
        qtyIn: result.qtyIn?.toString(),
        qtyOut: result.qtyOut?.toString(),
      },
      messages: [{
        role: "assistant",
        content: `Swap executed: ${signature} (${result.status})`,
      }],
    };
  } catch (error) {
    return {
      result: { executed: false, error: error.message },
      messages: [{ role: "system", content: `Execution failed: ${error.message}` }],
    };
  }
}

// Build graph
const workflow = new StateGraph(SwapState)
  .addNode("getQuote", getQuoteNode)
  .addNode("analyzePrice", analyzePriceNode)
  .addNode("recommend", recommendNode)
  .addNode("executeSwap", executeSwapNode)
  .addEdge(START, "getQuote")
  .addEdge("getQuote", "analyzePrice")
  .addEdge("analyzePrice", "recommend")
  .addEdge("recommend", "executeSwap")
  .addEdge("executeSwap", END);

// Export compiled graph
export const graph = workflow.compile();

export default graph;
