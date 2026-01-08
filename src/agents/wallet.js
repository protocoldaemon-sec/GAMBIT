/**
 * Wallet Agent
 * Handles deposits, withdrawals, and balance queries
 * 
 * The agent only knows:
 * 1. User's agent address (vanity wallet)
 * 2. User's external wallet (from deposit history)
 * 3. Kalshi deposit address
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getFreeAgentModel } from "../llm/index.js";
import {
  getAgentBalance,
  withdrawSol,
  withdrawUsdc,
  depositToKalshi,
  getTransactionHistory,
  getUserExternalWallet,
} from "../wallet/treasury.js";
import { getUserPublicKey } from "../auth/user-wallet.js";

const checkBalance = tool(
  async ({ userId }) => {
    try {
      const balance = await getAgentBalance(userId);
      const externalWallet = await getUserExternalWallet(userId);

      return JSON.stringify({
        agentWallet: balance.address,
        balances: {
          sol: `${balance.sol.toFixed(4)} SOL`,
          usdc: `${balance.usdc.toFixed(2)} USDC`,
        },
        registeredExternalWallet: externalWallet || "Not registered (deposit first)",
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "check_balance",
    description: "Check the agent wallet balance (SOL and USDC)",
    schema: z.object({
      userId: z.string().describe("User ID"),
    }),
  }
);

const withdrawToUser = tool(
  async ({ userId, amount, token }) => {
    try {
      let result;
      if (token === "SOL") {
        result = await withdrawSol(userId, amount);
      } else if (token === "USDC") {
        result = await withdrawUsdc(userId, amount);
      } else {
        throw new Error("Unsupported token. Use SOL or USDC.");
      }

      return JSON.stringify({
        success: true,
        message: `Sent ${amount} ${token} back to your wallet`,
        to: result.to,
        signature: result.signature,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "withdraw_to_user",
    description: "Withdraw funds back to user's external wallet (repay/pay back)",
    schema: z.object({
      userId: z.string().describe("User ID"),
      amount: z.number().describe("Amount to withdraw"),
      token: z.enum(["SOL", "USDC"]).describe("Token to withdraw"),
    }),
  }
);

const fundKalshi = tool(
  async ({ userId, amount }) => {
    try {
      const result = await depositToKalshi(userId, amount);

      return JSON.stringify({
        success: true,
        message: `Deposited ${amount} USDC to Kalshi for trading`,
        signature: result.signature,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "fund_kalshi",
    description: "Deposit USDC to Kalshi for prediction market trading",
    schema: z.object({
      userId: z.string().describe("User ID"),
      amount: z.number().describe("Amount of USDC to deposit"),
    }),
  }
);

const getHistory = tool(
  async ({ userId, limit }) => {
    try {
      const history = await getTransactionHistory(userId, limit || 10);

      return JSON.stringify({
        transactions: history.map((tx) => ({
          type: tx.tx_type,
          amount: tx.amount,
          token: tx.token_mint ? "USDC" : "SOL",
          status: tx.status,
          signature: tx.tx_signature,
          date: tx.created_at,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_transaction_history",
    description: "Get transaction history (deposits, withdrawals, trades)",
    schema: z.object({
      userId: z.string().describe("User ID"),
      limit: z.number().optional().describe("Number of transactions to return"),
    }),
  }
);

const getDepositAddress = tool(
  async ({ userId }) => {
    try {
      const agentAddress = await getUserPublicKey(userId);

      return JSON.stringify({
        depositAddress: agentAddress,
        instructions: [
          "Send SOL or USDC to this address to fund your trading account",
          "Your wallet address will be automatically registered for withdrawals",
          "Minimum deposit: 0.01 SOL or 1 USDC",
        ],
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_deposit_address",
    description: "Get the agent wallet address for deposits",
    schema: z.object({
      userId: z.string().describe("User ID"),
    }),
  }
);

export const walletAgent = {
  name: "wallet",
  description: "Manages deposits, withdrawals, and balances. Can withdraw to user wallet or deposit to Kalshi.",
  tools: [checkBalance, withdrawToUser, fundKalshi, getHistory, getDepositAddress],
  model: getFreeAgentModel(),
};
