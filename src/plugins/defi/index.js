/**
 * DeFi Plugin
 * Kalshi prediction markets + DFlow token swaps
 */
import { createPlugin } from "../base.js";

// Import actions
import { getQuoteAction, executeTradeAction, getPositionsAction, cancelOrderAction } from "./actions/trade.js";
import { listMarketsAction, getMarketAction, getOrderbookAction, getMarketHistoryAction } from "./actions/market.js";

// Import tools
import { 
  getDFlowClient, 
  getSwapQuote, 
  executeSwap, 
  getSolPrice,
  TOKENS,
  ORDER_STATUS 
} from "./tools/dflow.js";
import { getMarkets, getMarket, getOrderbook, getMarketHistory } from "./tools/kalshi.js";

const DefiPlugin = createPlugin({
  name: "defi",
  description: "Kalshi prediction markets + DFlow token swaps on Solana",

  methods: {
    // DFlow Swaps
    getDFlowClient,
    getSwapQuote,
    executeSwap,
    getSolPrice,

    // Kalshi Markets
    getMarkets,
    getMarket,
    getOrderbook,
    getMarketHistory,
  },

  actions: [
    // Trading
    getQuoteAction,
    executeTradeAction,
    getPositionsAction,
    cancelOrderAction,

    // Markets
    listMarketsAction,
    getMarketAction,
    getOrderbookAction,
    getMarketHistoryAction,
  ],

  // Export constants
  constants: {
    TOKENS,
    ORDER_STATUS,
  },

  initialize() {
    console.log("[DefiPlugin] Initialized with DFlow + Kalshi");
  },
});

export default DefiPlugin;
