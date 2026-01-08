/**
 * Trade Action - Jupiter Swap
 * Swap tokens using Jupiter Exchange
 */
import { z } from "zod";
import { createAction, TOKENS } from "../../base.js";
import { trade } from "../tools/trade.js";

export default createAction({
  name: "TRADE",
  description: "Swap tokens using Jupiter Exchange. Supports SOL and any SPL token.",
  similes: ["swap tokens", "exchange tokens", "trade tokens", "convert tokens", "swap sol"],
  examples: [
    [
      {
        input: { outputMint: TOKENS.USDC, inputAmount: 1 },
        output: {
          status: "success",
          message: "Trade executed successfully",
          transaction: "5UfgJ5vVZxUxefDGqzqkVLHzHxVTyYH9StYyHKgvHYmXJgqJKxEqy9k4Rz9LpXrHF9kUZB7",
          inputAmount: 1,
          inputToken: "SOL",
          outputToken: TOKENS.USDC,
        },
        explanation: "Swap 1 SOL for USDC",
      },
    ],
    [
      {
        input: { outputMint: TOKENS.SOL, inputAmount: 100, inputMint: TOKENS.USDC, slippageBps: 100 },
        output: {
          status: "success",
          message: "Trade executed successfully",
          transaction: "4VfgJ5vVZxUxefDGqzqkVLHzHxVTyYH9StYyHKgvHYmXJgqJKxEqy9k4Rz9LpXrHF9kUZB7",
          inputAmount: 100,
          inputToken: TOKENS.USDC,
          outputToken: TOKENS.SOL,
        },
        explanation: "Swap 100 USDC for SOL with 1% slippage",
      },
    ],
  ],
  schema: z.object({
    userId: z.string().describe("User ID for wallet access"),
    outputMint: z.string().min(32, "Invalid output mint address"),
    inputAmount: z.number().positive("Input amount must be positive"),
    inputMint: z.string().min(32, "Invalid input mint address").optional(),
    slippageBps: z.number().min(0).max(10000).optional(),
  }),
  handler: async (ctx, input) => {
    const tx = await trade(
      ctx,
      input.userId,
      input.outputMint,
      input.inputAmount,
      input.inputMint || TOKENS.SOL,
      input.slippageBps
    );

    return {
      status: "success",
      message: "Trade executed successfully",
      transaction: tx,
      inputAmount: input.inputAmount,
      inputToken: input.inputMint || "SOL",
      outputToken: input.outputMint,
    };
  },
});
