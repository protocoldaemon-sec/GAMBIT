/**
 * Gambit MCP Server
 * Entry point for running Gambit as an MCP server
 */
import "dotenv/config";
import { startMcpServer } from "./index.js";
import { allActions, initializePlugins } from "../plugins/index.js";
import { getConnection } from "../solana/client.js";

// Gambit context passed to all actions
const gambitContext = {
  connection: null,
  config: {
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
    KALSHI_API_KEY: process.env.KALSHI_API_KEY,
    DFLOW_API_KEY: process.env.DFLOW_API_KEY,
  },
};

async function main() {
  try {
    // Initialize connection
    gambitContext.connection = getConnection();

    // Initialize plugins
    initializePlugins();

    // Start MCP server
    await startMcpServer(allActions, gambitContext, {
      name: "gambit",
      version: "0.1.0",
    });

    console.log("[Gambit MCP] Server running");
    console.log(`[Gambit MCP] ${allActions.length} actions available`);
  } catch (error) {
    console.error("[Gambit MCP] Failed to start:", error);
    process.exit(1);
  }
}

main();
