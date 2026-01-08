/**
 * Market Actions
 * Kalshi market discovery and analysis
 */
import { z } from "zod";
import { createAction } from "../../base.js";
import { getMarkets, getMarket, getOrderbook, getMarketHistory } from "../tools/kalshi.js";

export const listMarketsAction = createAction({
  name: "LIST_KALSHI_MARKETS",
  description: "List available Kalshi prediction markets.",
  similes: ["show markets", "list markets", "available markets", "what markets"],
  examples: [
    [
      {
        input: { limit: 10, status: "open" },
        output: {
          status: "success",
          markets: [
            { ticker: "PRES-2024", title: "Presidential Election 2024", yesPrice: 0.55 },
          ],
        },
        explanation: "List 10 open Kalshi markets",
      },
    ],
  ],
  schema: z.object({
    limit: z.number().min(1).max(100).optional().default(50),
    status: z.enum(["open", "closed", "settled"]).optional().default("open"),
    cursor: z.string().optional(),
  }),
  handler: async (ctx, input) => {
    const result = await getMarkets(ctx, input);
    return { status: "success", ...result };
  },
});

export const getMarketAction = createAction({
  name: "GET_KALSHI_MARKET",
  description: "Get details for a specific Kalshi market.",
  similes: ["market details", "show market", "market info"],
  examples: [
    [
      {
        input: { ticker: "PRES-2024" },
        output: {
          status: "success",
          ticker: "PRES-2024",
          title: "Presidential Election 2024",
          yesPrice: 0.55,
          noPrice: 0.45,
          volume: 1000000,
        },
        explanation: "Get details for PRES-2024 market",
      },
    ],
  ],
  schema: z.object({
    ticker: z.string().describe("Market ticker"),
  }),
  handler: async (ctx, input) => {
    const result = await getMarket(ctx, input.ticker);
    return { status: "success", ...result };
  },
});

export const getOrderbookAction = createAction({
  name: "GET_KALSHI_ORDERBOOK",
  description: "Get orderbook for a Kalshi market.",
  similes: ["orderbook", "order book", "bids asks"],
  schema: z.object({
    ticker: z.string().describe("Market ticker"),
  }),
  handler: async (ctx, input) => {
    const result = await getOrderbook(ctx, input.ticker);
    return { status: "success", ...result };
  },
});

export const getMarketHistoryAction = createAction({
  name: "GET_KALSHI_HISTORY",
  description: "Get trade history for a Kalshi market.",
  similes: ["market history", "trade history", "past trades"],
  schema: z.object({
    ticker: z.string().describe("Market ticker"),
    limit: z.number().min(1).max(1000).optional().default(100),
  }),
  handler: async (ctx, input) => {
    const result = await getMarketHistory(ctx, input.ticker, { limit: input.limit });
    return { status: "success", ...result };
  },
});

export default { listMarketsAction, getMarketAction, getOrderbookAction, getMarketHistoryAction };
