/**
 * Balance Action
 * Get SOL and token balances for a wallet
 */
import { z } from "zod";
import { createAction } from "../../base.js";
import { getBalance, getTokenBalance, getAllBalances } from "../tools/balance.js";

export const balanceAction = createAction({
  name: "GET_BALANCE",
  description: "Get SOL balance for a wallet address.",
  similes: ["check balance", "show balance", "how much sol", "wallet balance"],
  examples: [
    [
      {
        input: { address: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk" },
        output: {
          status: "success",
          address: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk",
          balance: "1.5 SOL",
          lamports: 1500000000,
        },
        explanation: "Get SOL balance for the specified address",
      },
    ],
  ],
  schema: z.object({
    address: z.string().min(32, "Invalid Solana address"),
  }),
  handler: async (ctx, input) => {
    const balance = await getBalance(ctx, input.address);
    return {
      status: "success",
      ...balance,
    };
  },
});

export const tokenBalanceAction = createAction({
  name: "GET_TOKEN_BALANCE",
  description: "Get SPL token balance for a wallet.",
  similes: ["check token balance", "how much usdc", "token holdings"],
  examples: [
    [
      {
        input: {
          address: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk",
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
        output: {
          status: "success",
          balance: 100,
          decimals: 6,
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
        explanation: "Get USDC balance for the specified address",
      },
    ],
  ],
  schema: z.object({
    address: z.string().min(32, "Invalid Solana address"),
    mint: z.string().min(32, "Invalid token mint address"),
  }),
  handler: async (ctx, input) => {
    const balance = await getTokenBalance(ctx, input.mint, input.address);
    return {
      status: "success",
      ...balance,
    };
  },
});

export const allBalancesAction = createAction({
  name: "GET_ALL_BALANCES",
  description: "Get all token balances for a wallet including SOL.",
  similes: ["show all balances", "portfolio", "all tokens", "holdings"],
  examples: [
    [
      {
        input: { address: "8x2dR8Mpzuz2YqyZyZjUbYWKSWesBo5jMx2Q9Y86udVk" },
        output: {
          status: "success",
          sol: { balance: 1.5, lamports: 1500000000 },
          tokens: [
            { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", balance: 100, symbol: "USDC" },
          ],
        },
        explanation: "Get all balances for the specified address",
      },
    ],
  ],
  schema: z.object({
    address: z.string().min(32, "Invalid Solana address"),
  }),
  handler: async (ctx, input) => {
    const balances = await getAllBalances(ctx, input.address);
    return {
      status: "success",
      ...balances,
    };
  },
});

export default balanceAction;
