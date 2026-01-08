/**
 * Solana Agent
 * Handles on-chain operations using native @solana/web3.js
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getFreeAgentModel } from "../llm/index.js";
import { 
  getWalletBalance, 
  getTokenBalance, 
  transferSol,
  transferToken,
  getTransaction,
  getConnection 
} from "../solana/client.js";
import { getUserKeypair } from "../auth/user-wallet.js";

const getBalance = tool(
  async ({ address }) => {
    try {
      const balance = await getWalletBalance(address);
      return JSON.stringify({
        address: balance.address,
        balance: `${balance.sol.toFixed(4)} SOL`,
        lamports: balance.lamports,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_sol_balance",
    description: "Get SOL balance for a wallet address",
    schema: z.object({
      address: z.string().describe("Wallet address"),
    }),
  }
);

const getTokenBalanceTool = tool(
  async ({ mintAddress, ownerAddress }) => {
    try {
      const balance = await getTokenBalance(mintAddress, ownerAddress);
      return JSON.stringify(balance);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_token_balance",
    description: "Get SPL token balance for a wallet",
    schema: z.object({
      mintAddress: z.string().describe("Token mint address"),
      ownerAddress: z.string().describe("Owner wallet address"),
    }),
  }
);

const transferSolTool = tool(
  async ({ userId, recipient, amount }) => {
    try {
      const keypair = await getUserKeypair(userId);
      const result = await transferSol(keypair, recipient, amount);

      return JSON.stringify({
        success: true,
        signature: result.signature,
        recipient,
        amount: `${amount} SOL`,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "transfer_sol",
    description: "Transfer SOL to another wallet",
    schema: z.object({
      userId: z.string().describe("User ID"),
      recipient: z.string().describe("Recipient wallet address"),
      amount: z.number().describe("Amount in SOL"),
    }),
  }
);

const transferTokenTool = tool(
  async ({ userId, recipient, mintAddress, amount }) => {
    try {
      const keypair = await getUserKeypair(userId);
      const result = await transferToken(keypair, recipient, mintAddress, amount);

      return JSON.stringify({
        success: true,
        signature: result.signature,
        recipient,
        mintAddress,
        amount,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "transfer_token",
    description: "Transfer SPL tokens to another wallet",
    schema: z.object({
      userId: z.string().describe("User ID"),
      recipient: z.string().describe("Recipient wallet address"),
      mintAddress: z.string().describe("Token mint address"),
      amount: z.number().describe("Amount to transfer"),
    }),
  }
);

const getTransactionTool = tool(
  async ({ signature }) => {
    try {
      const tx = await getTransaction(signature);

      if (!tx) {
        return JSON.stringify({ error: "Transaction not found" });
      }

      return JSON.stringify(tx);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_transaction",
    description: "Get transaction details by signature",
    schema: z.object({
      signature: z.string().describe("Transaction signature"),
    }),
  }
);

export const solanaAgent = {
  name: "solana",
  description: "Handles on-chain Solana operations including transfers and balance queries",
  tools: [
    getBalance,
    getTokenBalanceTool,
    transferSolTool,
    transferTokenTool,
    getTransactionTool,
  ],
  model: getFreeAgentModel(),
};
