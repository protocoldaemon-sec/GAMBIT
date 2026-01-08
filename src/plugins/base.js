/**
 * Gambit Plugin Base
 * Base classes and utilities for the plugin system
 */
import { z } from "zod";

/**
 * Create an action definition
 * @param {Object} config Action configuration
 * @returns {Object} Action object
 */
export function createAction(config) {
  return {
    name: config.name,
    description: config.description,
    similes: config.similes || [],
    examples: config.examples || [],
    schema: config.schema,
    handler: config.handler,
  };
}

/**
 * Create a plugin definition
 * @param {Object} config Plugin configuration
 * @returns {Object} Plugin object
 */
export function createPlugin(config) {
  return {
    name: config.name,
    description: config.description || "",
    methods: config.methods || {},
    actions: config.actions || [],
    initialize: config.initialize || function() {},
  };
}

/**
 * Merge multiple plugins into one
 * @param {Array} plugins Array of plugins
 * @returns {Object} Merged plugin
 */
export function mergePlugins(plugins) {
  const merged = {
    name: "gambit-merged",
    methods: {},
    actions: [],
  };

  for (const plugin of plugins) {
    Object.assign(merged.methods, plugin.methods);
    merged.actions.push(...plugin.actions);
  }

  return merged;
}

/**
 * Get all actions from plugins
 * @param {Array} plugins Array of plugins
 * @returns {Array} All actions
 */
export function getAllActions(plugins) {
  return plugins.flatMap(p => p.actions);
}

/**
 * Common token addresses
 */
export const TOKENS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
};

/**
 * Jupiter API endpoints
 */
export const JUPITER_API = {
  QUOTE: "https://quote-api.jup.ag/v6/quote",
  SWAP: "https://quote-api.jup.ag/v6/swap",
  PRICE: "https://price.jup.ag/v6/price",
  TOKENS: "https://token.jup.ag/all",
};

export default { createAction, createPlugin, mergePlugins, getAllActions, TOKENS, JUPITER_API };
