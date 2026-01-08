/**
 * DFlow Trade API Integration
 * Unified interface for trading tokens on Solana via DFlow
 */
import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Common token mints
export const TOKENS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
};

// Order status enum
export const ORDER_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  PENDING_CLOSE: "pendingClose",
  FAILED: "failed",
  OPEN_EXPIRED: "openExpired",
  OPEN_FAILED: "openFailed",
};

/**
 * DFlow Trade Client
 */
export class DFlowClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.DFLOW_API_KEY;
    this.baseUrl = config.baseUrl || "https://quote-api.dflow.net";
    this.rpcUrl = config.rpcUrl || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    this.connection = new Connection(this.rpcUrl, "confirmed");
    
    // Load keypair if provided
    if (config.privateKey) {
      this.keypair = Keypair.fromSecretKey(bs58.decode(config.privateKey));
    } else if (process.env.SOLANA_PRIVATE_KEY) {
      try {
        this.keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
      } catch {
        this.keypair = null;
      }
    }
  }

  /**
   * Get request headers
   */
  getHeaders(includeContentType = false) {
    const headers = {};
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }


  /**
   * Request an order quote and transaction
   * @param {Object} params - Order parameters
   * @param {string} params.inputMint - Input token mint address
   * @param {string} params.outputMint - Output token mint address
   * @param {number|string} params.amount - Amount in smallest units (lamports/base units)
   * @param {number} params.slippageBps - Slippage tolerance in basis points (default: 50)
   * @param {string} params.userPublicKey - User's public key (optional, uses keypair if not provided)
   */
  async requestOrder(params) {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps = 50,
      userPublicKey,
    } = params;

    const pubKey = userPublicKey || this.keypair?.publicKey?.toBase58();
    if (!pubKey) {
      throw new Error("No user public key provided and no keypair configured");
    }

    const queryParams = new URLSearchParams();
    queryParams.append("inputMint", inputMint);
    queryParams.append("outputMint", outputMint);
    queryParams.append("amount", amount.toString());
    queryParams.append("slippageBps", slippageBps.toString());
    queryParams.append("userPublicKey", pubKey);

    const response = await fetch(
      `${this.baseUrl}/order?${queryParams.toString()}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DFlow order request failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Get quote without transaction (for price checking)
   */
  async getQuote(params) {
    const { inputMint, outputMint, amount, slippageBps = 50 } = params;

    const queryParams = new URLSearchParams();
    queryParams.append("inputMint", inputMint);
    queryParams.append("outputMint", outputMint);
    queryParams.append("amount", amount.toString());
    queryParams.append("slippageBps", slippageBps.toString());

    const response = await fetch(
      `${this.baseUrl}/quote?${queryParams.toString()}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DFlow quote request failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Sign and submit a transaction
   * @param {Object} orderResponse - Response from requestOrder
   * @param {Keypair} keypair - Optional keypair to sign with (uses instance keypair if not provided)
   */
  async signAndSubmit(orderResponse, keypair = null) {
    const signer = keypair || this.keypair;
    if (!signer) {
      throw new Error("No keypair available for signing");
    }

    // Deserialize the transaction
    const transactionBuffer = Buffer.from(orderResponse.transaction, "base64");
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    // Sign the transaction
    transaction.sign([signer]);

    // Send to Solana
    const signature = await this.connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    return {
      signature,
      executionMode: orderResponse.executionMode,
      orderResponse,
    };
  }


  /**
   * Monitor order status
   * @param {string} signature - Transaction signature
   * @param {string} executionMode - "sync" or "async"
   * @param {Object} options - Monitoring options
   */
  async monitorOrder(signature, executionMode, options = {}) {
    const { timeout = 60000, pollInterval = 2000 } = options;
    const startTime = Date.now();

    if (executionMode === "sync") {
      return this.monitorSyncOrder(signature, timeout);
    } else {
      return this.monitorAsyncOrder(signature, timeout, pollInterval);
    }
  }

  /**
   * Monitor synchronous (atomic) order
   */
  async monitorSyncOrder(signature, timeout = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const statusResult = await this.connection.getSignatureStatuses([signature]);
      const status = statusResult.value[0];

      if (!status) {
        await this.sleep(1000);
        continue;
      }

      if (status.confirmationStatus === "finalized") {
        if (status.err) {
          return {
            status: ORDER_STATUS.FAILED,
            signature,
            error: status.err,
            slot: status.slot,
          };
        }
        return {
          status: ORDER_STATUS.CLOSED,
          signature,
          slot: status.slot,
          fills: [], // Sync orders don't have fill details from status
        };
      }

      await this.sleep(1000);
    }

    return {
      status: ORDER_STATUS.OPEN_EXPIRED,
      signature,
      error: "Timeout waiting for confirmation",
    };
  }

  /**
   * Monitor asynchronous (multi-transaction) order
   */
  async monitorAsyncOrder(signature, timeout = 60000, pollInterval = 2000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const response = await fetch(
        `${this.baseUrl}/order-status?signature=${signature}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        await this.sleep(pollInterval);
        continue;
      }

      const statusData = await response.json();
      const { status, fills = [] } = statusData;

      console.log(`[DFlow] Order status: ${status}, fills: ${fills.length}`);

      if (status === ORDER_STATUS.CLOSED || status === ORDER_STATUS.FAILED) {
        return {
          status,
          signature,
          fills,
          qtyIn: fills.reduce((acc, x) => acc + BigInt(x.qtyIn || 0), 0n),
          qtyOut: fills.reduce((acc, x) => acc + BigInt(x.qtyOut || 0), 0n),
        };
      }

      if (status === ORDER_STATUS.PENDING_CLOSE) {
        return {
          status,
          signature,
          fills,
          qtyIn: fills.reduce((acc, x) => acc + BigInt(x.qtyIn || 0), 0n),
          qtyOut: fills.reduce((acc, x) => acc + BigInt(x.qtyOut || 0), 0n),
        };
      }

      await this.sleep(pollInterval);
    }

    return {
      status: ORDER_STATUS.OPEN_EXPIRED,
      signature,
      error: "Timeout waiting for order completion",
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  /**
   * Execute a complete swap
   * High-level method that handles the full flow
   */
  async swap(params) {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps = 50,
      keypair,
      monitor = true,
    } = params;

    console.log(`[DFlow] Requesting swap: ${amount} ${inputMint} -> ${outputMint}`);

    // 1. Request order
    const orderResponse = await this.requestOrder({
      inputMint,
      outputMint,
      amount,
      slippageBps,
    });

    console.log(`[DFlow] Got quote: ${orderResponse.outAmount} output, mode: ${orderResponse.executionMode}`);

    // 2. Sign and submit
    const { signature, executionMode } = await this.signAndSubmit(orderResponse, keypair);
    console.log(`[DFlow] Submitted: ${signature}`);

    if (!monitor) {
      return {
        signature,
        executionMode,
        quote: orderResponse,
      };
    }

    // 3. Monitor completion
    const result = await this.monitorOrder(signature, executionMode);

    return {
      ...result,
      quote: orderResponse,
    };
  }

  /**
   * Swap SOL to USDC
   */
  async swapSolToUsdc(amountLamports, options = {}) {
    return this.swap({
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amount: amountLamports,
      ...options,
    });
  }

  /**
   * Swap USDC to SOL
   */
  async swapUsdcToSol(amountUsdc, options = {}) {
    // USDC has 6 decimals
    const amount = Math.floor(amountUsdc * 1_000_000);
    return this.swap({
      inputMint: TOKENS.USDC,
      outputMint: TOKENS.SOL,
      amount,
      ...options,
    });
  }

  /**
   * Get price quote for SOL/USDC
   */
  async getSolUsdcPrice(amountSol = 1) {
    const amountLamports = Math.floor(amountSol * 1_000_000_000);
    const quote = await this.getQuote({
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amount: amountLamports,
    });

    const outAmount = Number(quote.outAmount) / 1_000_000; // USDC has 6 decimals
    return {
      price: outAmount / amountSol,
      inAmount: amountSol,
      outAmount,
      priceImpact: quote.priceImpactPct,
    };
  }
}

// Singleton instance
let instance = null;

export function getDFlowClient(config = {}) {
  if (!instance) {
    instance = new DFlowClient(config);
  }
  return instance;
}

// Tool functions for MCP/Plugin integration
export async function getSwapQuote(agent, inputMint, outputMint, amount, slippageBps = 50) {
  const client = getDFlowClient();
  return client.getQuote({ inputMint, outputMint, amount, slippageBps });
}

export async function executeSwap(agent, inputMint, outputMint, amount, slippageBps = 50) {
  const client = getDFlowClient();
  return client.swap({ inputMint, outputMint, amount, slippageBps });
}

export async function getSolPrice(agent) {
  const client = getDFlowClient();
  return client.getSolUsdcPrice(1);
}

export default {
  DFlowClient,
  getDFlowClient,
  TOKENS,
  ORDER_STATUS,
  getSwapQuote,
  executeSwap,
  getSolPrice,
};
