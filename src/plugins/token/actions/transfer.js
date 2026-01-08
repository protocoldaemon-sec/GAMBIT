/**
 * Transfer Action
 * Transfer SOL or SPL tokens to another address
 */
import { z } from "zod";
import { createAction } from "../../base.js";
import { transfer } from "../tools/transfer.js";

export default createAction({
  name: "TRANSFER",
  description: "Transfer SOL or SPL tokens to another wallet address.",
  similes: ["send tokens", "transfer funds", "send money", "send sol", "transfer tokens"],
  examples: [
    [
      {
        input: { to: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk", amount: 1 },
        output: {
          status: "success",
          message: "Transfer completed successfully",
          amount: 1,
          recipient: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk",
          token: "SOL",
          transaction: "5UfgJ5vVZxUxefDGqzqkVLHzHxVTyYH9StYyHKgvHYmXJgqJKxEqy9k4Rz9LpXrHF9kUZB7",
        },
        explanation: "Transfer 1 SOL to the recipient address",
      },
    ],
    [
      {
        input: {
          to: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk",
          amount: 100,
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
        output: {
          status: "success",
          message: "Transfer completed successfully",
          amount: 100,
          recipient: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk",
          token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          transaction: "4VfgJ5vVZxUxefDGqzqkVLHzHxVTyYH9StYyHKgvHYmXJgqJKxEqy9k4Rz9LpXrHF9kUZB7",
        },
        explanation: "Transfer 100 USDC tokens to the recipient address",
      },
    ],
  ],
  schema: z.object({
    userId: z.string().describe("User ID for wallet access"),
    to: z.string().min(32, "Invalid Solana address"),
    amount: z.number().positive("Amount must be positive"),
    mint: z.string().optional().describe("Token mint address (omit for SOL)"),
  }),
  handler: async (ctx, input) => {
    const tx = await transfer(ctx, input.userId, input.to, input.amount, input.mint);

    return {
      status: "success",
      message: "Transfer completed successfully",
      amount: input.amount,
      recipient: input.to,
      token: input.mint || "SOL",
      transaction: tx,
    };
  },
});
