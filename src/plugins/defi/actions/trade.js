/**
 * DeFi Trade Actions
 * Kalshi prediction market trading + DFlow token swaps
 */
import { z } from "zod";
import { createAction } from "../../base.js";
import { getDFlowClient, TOKENS } from "../tools/dflow.js";
import { getUserWallet } from "../../../auth/user-wallet.js";

export const getQuoteAction = createAction({
  name: "GET_SWAP_QUOTE",
  description: "Get a quote for a token swap via DFlow Trade API.",
  similes: ["quote swap", "price check", "how much for swap"],
  examples: [
    [
      {
        input: { inputMint: "SOL", outputMint: "USDC", amount: 1000000000 },
        output: {
          status: "success",
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          inAmount: "1000000000",
          outAmount: "150000000",
          priceImpactPct: 0.01,
        },
        explanation: "Get quote for swapping 1 SOL to USDC",
      },
    ],
  ],
  schema: z.object({
    inputMint: z.string().describe("Input token mint or symbol (SOL, USDC, USDT)"),
    outputMint: z.string().describe("Output token mint or symbol"),
    amount: z.number().positive().describe("Amount in smallest units (lamports for SOL)"),
    slippageBps: z.number().optional().default(50).describe("Slippage tolerance in basis points"),
  }),
  handler: async (ctx, input) => {
    const client = getDFlowClient();
    
    // Resolve token symbols to mints
    const inMint = TOKENS[input.inputMint.toUpperCase()] || input.inputMint;
    const outMint = TOKENS[input.outputMint.toUpperCase()] || input.outputMint;
    
    const quote = await client.getQuote({
      inputMint: inMint,
      outputMint: outMint,
      amount: input.amount,
      slippageBps: input.slippageBps,
    });
    
    return { status: "success", ...quote };
  },
});

export const executeTradeAction = createAction({
  name: "EXECUTE_SWAP",
  description: "Execute a token swap via DFlow Trade API.",
  similes: ["swap tokens", "trade tokens", "execute swap", "swap sol", "swap usdc"],
  examples: [
    [
      {
        input: { userId: "user123", inputMint: "SOL", outputMint: "USDC", amount: 1000000000 },
        output: {
          status: "success",
          signature: "5abc...",
          inAmount: "1000000000",
          outAmount: "150000000",
        },
        explanation: "Swap 1 SOL to USDC",
      },
    ],
  ],
  schema: z.object({
    userId: z.string().describe("User ID"),
    inputMint: z.string().describe("Input token mint or symbol"),
    outputMint: z.string().describe("Output token mint or symbol"),
    amount: z.number().positive().describe("Amount in smallest units"),
    slippageBps: z.number().optional().default(50).describe("Slippage tolerance in bps"),
  }),
  handler: async (ctx, input) => {
    const client = getDFlowClient();
    
    // Resolve token symbols
    const inMint = TOKENS[input.inputMint.toUpperCase()] || input.inputMint;
    const outMint = TOKENS[input.outputMint.toUpperCase()] || input.outputMint;
    
    // Get user wallet for signing
    const wallet = await getUserWallet(input.userId);
    
    // Execute swap
    const result = await client.swap({
      inputMint: inMint,
      outputMint: outMint,
      amount: input.amount,
      slippageBps: input.slippageBps,
    });

    return {
      status: result.status === "closed" ? "success" : result.status,
      signature: result.signature,
      quote: result.quote,
      fills: result.fills,
      qtyIn: result.qtyIn?.toString(),
      qtyOut: result.qtyOut?.toString(),
    };
  },
});

export const getPositionsAction = createAction({
  name: "GET_SOL_PRICE",
  description: "Get current SOL/USDC price via DFlow.",
  similes: ["sol price", "solana price", "how much is sol"],
  examples: [
    [
      {
        input: { amount: 1 },
        output: {
          status: "success",
          price: 150.25,
          inAmount: 1,
          outAmount: 150.25,
        },
        explanation: "Get SOL price in USDC",
      },
    ],
  ],
  schema: z.object({
    amount: z.number().optional().default(1).describe("Amount of SOL to price"),
  }),
  handler: async (ctx, input) => {
    const client = getDFlowClient();
    const price = await client.getSolUsdcPrice(input.amount);
    return { status: "success", ...price };
  },
});

export const cancelOrderAction = createAction({
  name: "GET_ORDER_STATUS",
  description: "Get status of a DFlow order by signature.",
  similes: ["order status", "check order", "trade status"],
  schema: z.object({
    signature: z.string().describe("Transaction signature"),
    executionMode: z.enum(["sync", "async"]).optional().default("async").describe("Execution mode"),
  }),
  handler: async (ctx, input) => {
    const client = getDFlowClient();
    const result = await client.monitorOrder(input.signature, input.executionMode, { timeout: 5000 });
    return { status: "success", ...result };
  },
});

export default { getQuoteAction, executeTradeAction, getPositionsAction, cancelOrderAction };
