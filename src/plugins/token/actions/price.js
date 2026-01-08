/**
 * Price Actions
 * Fetch token prices from Jupiter
 */
import { z } from "zod";
import { createAction, TOKENS } from "../../base.js";
import { fetchPrice, fetchPrices } from "../tools/price.js";

export const fetchPriceAction = createAction({
  name: "FETCH_PRICE",
  description: "Fetch current price for a token from Jupiter.",
  similes: ["price check", "token price", "how much is", "price of"],
  examples: [
    [
      {
        input: { mint: TOKENS.SOL },
        output: {
          status: "success",
          mint: TOKENS.SOL,
          price: 150.25,
          vsToken: TOKENS.USDC,
          mintSymbol: "SOL",
        },
        explanation: "Get SOL price in USDC",
      },
    ],
  ],
  schema: z.object({
    mint: z.string().min(32, "Invalid mint address"),
    vsToken: z.string().optional().describe("Quote token (default: USDC)"),
  }),
  handler: async (ctx, input) => {
    const result = await fetchPrice(input.mint, input.vsToken);
    return { status: "success", ...result };
  },
});

export const fetchPricesAction = createAction({
  name: "FETCH_PRICES",
  description: "Fetch prices for multiple tokens at once.",
  similes: ["prices", "multiple prices", "batch prices"],
  schema: z.object({
    mints: z.array(z.string()).min(1).describe("Array of mint addresses"),
    vsToken: z.string().optional().describe("Quote token (default: USDC)"),
  }),
  handler: async (ctx, input) => {
    const result = await fetchPrices(input.mints, input.vsToken);
    return { status: "success", ...result };
  },
});

export default { fetchPriceAction, fetchPricesAction };
