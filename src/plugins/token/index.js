/**
 * Token Plugin
 * Handles token operations: balance, transfer, swap
 */
import { createPlugin } from "../base.js";

// Import actions
import transferAction from "./actions/transfer.js";
import tradeAction from "./actions/trade.js";
import { balanceAction, tokenBalanceAction, allBalancesAction } from "./actions/balance.js";
import { fetchPriceAction, fetchPricesAction } from "./actions/price.js";

// Import tools
import { getBalance, getTokenBalance, getAllBalances } from "./tools/balance.js";
import { transfer } from "./tools/transfer.js";
import { trade, getQuote } from "./tools/trade.js";
import { fetchPrice, fetchPrices } from "./tools/price.js";

const TokenPlugin = createPlugin({
  name: "token",
  description: "Token operations: balance, transfer, swap via Jupiter",

  methods: {
    // Balance
    getBalance,
    getTokenBalance,
    getAllBalances,

    // Transfer
    transfer,

    // Trade (Jupiter)
    trade,
    getQuote,

    // Price
    fetchPrice,
    fetchPrices,
  },

  actions: [
    balanceAction,
    tokenBalanceAction,
    allBalancesAction,
    transferAction,
    tradeAction,
    fetchPriceAction,
    fetchPricesAction,
  ],

  initialize() {
    console.log("[TokenPlugin] Initialized");
  },
});

export default TokenPlugin;
