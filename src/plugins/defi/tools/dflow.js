/**
 * DFlow Trade API Integration
 * Unified interface for trading tokens and prediction markets on Solana via DFlow
 * 
 * Features:
 * - Imperative Swaps: Full control over route and execution
 * - Declarative Swaps: Intent-based with deferred route calculation
 * - Prediction Market Metadata: Events, markets, orderbooks, trades
 * - WebSocket Streaming: Real-time prices, trades, orderbook updates
 */
import { Connection, VersionedTransaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { EventEmitter } from "events";

// API Base URLs
const API_URLS = {
  swap: "https://quote-api.dflow.net",
  metadata: "https://prediction-markets-api.dflow.net/api/v1",
  websocket: "wss://prediction-markets-api.dflow.net/api/v1/ws",
};

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

// Market status enum
export const MARKET_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  SETTLED: "settled",
};

/**
 * DFlow Error class
 */
export class DFlowError extends Error {
  constructor(message, code, retryable = false, details = {}) {
    super(message);
    this.name = "DFlowError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (error instanceof DFlowError && !error.retryable) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * DFlow Trade Client
 */
export class DFlowClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.DFLOW_API_KEY;
    this.swapUrl = config.swapUrl || API_URLS.swap;
    this.metadataUrl = config.metadataUrl || API_URLS.metadata;
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
   * Handle API errors
   */
  handleApiError(response, errorText, endpoint) {
    const status = response.status;
    
    if (status === 429) {
      throw new DFlowError(
        "Rate limit exceeded",
        "RATE_LIMIT",
        true,
        { retryAfter: response.headers.get("retry-after") }
      );
    }
    
    if (status === 401 || status === 403) {
      throw new DFlowError(
        "Authentication failed - check API key",
        "AUTH_ERROR",
        false
      );
    }
    
    if (status === 404) {
      throw new DFlowError(
        `Resource not found: ${endpoint}`,
        "NOT_FOUND",
        false
      );
    }
    
    if (status >= 500) {
      throw new DFlowError(
        `Server error: ${errorText}`,
        "SERVER_ERROR",
        true
      );
    }
    
    throw new DFlowError(
      `DFlow API error: ${errorText}`,
      "API_ERROR",
      false,
      { status, endpoint }
    );
  }


  /**
   * Request an order quote and transaction (Imperative Swap)
   * @param {Object} params - Order parameters
   * @param {string} params.inputMint - Input token mint address
   * @param {string} params.outputMint - Output token mint address
   * @param {number|string} params.amount - Amount in smallest units (lamports/base units)
   * @param {number} params.slippageBps - Slippage tolerance in basis points (default: 50)
   * @param {string} params.userPublicKey - User's public key (optional, uses keypair if not provided)
   * @param {boolean} params.forJitoBundle - Enable Jito bundle for MEV protection
   */
  async requestOrder(params) {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps = 50,
      userPublicKey,
      forJitoBundle = false,
    } = params;

    const pubKey = userPublicKey || this.keypair?.publicKey?.toBase58();
    if (!pubKey) {
      throw new DFlowError(
        "No user public key provided and no keypair configured",
        "CONFIG_ERROR",
        false
      );
    }

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      queryParams.append("inputMint", inputMint);
      queryParams.append("outputMint", outputMint);
      queryParams.append("amount", amount.toString());
      queryParams.append("slippageBps", slippageBps.toString());
      queryParams.append("userPublicKey", pubKey);
      if (forJitoBundle) {
        queryParams.append("forJitoBundle", "true");
      }

      const response = await fetch(
        `${this.swapUrl}/order?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/order");
      }

      const data = await response.json();
      return {
        ...data,
        // Parse route plan for easier consumption
        routeSummary: data.routePlan?.map(r => ({
          venue: r.venue,
          inputMint: r.inputMint,
          outputMint: r.outputMint,
          inAmount: r.inAmount,
          outAmount: r.outAmount,
        })),
      };
    });
  }

  /**
   * Get imperative quote without transaction (for price checking)
   */
  async getQuote(params) {
    const { inputMint, outputMint, amount, slippageBps = 50 } = params;

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      queryParams.append("inputMint", inputMint);
      queryParams.append("outputMint", outputMint);
      queryParams.append("amount", amount.toString());
      queryParams.append("slippageBps", slippageBps.toString());

      const response = await fetch(
        `${this.swapUrl}/quote?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/quote");
      }

      return response.json();
    });
  }

  /**
   * Get declarative intent quote (deferred route calculation)
   * Better for larger orders with less slippage
   */
  async getIntentQuote(params) {
    const { inputMint, outputMint, amount, slippageBps = 50, userPublicKey } = params;

    const pubKey = userPublicKey || this.keypair?.publicKey?.toBase58();
    if (!pubKey) {
      throw new DFlowError(
        "No user public key provided for intent quote",
        "CONFIG_ERROR",
        false
      );
    }

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      queryParams.append("inputMint", inputMint);
      queryParams.append("outputMint", outputMint);
      queryParams.append("amount", amount.toString());
      queryParams.append("slippageBps", slippageBps.toString());
      queryParams.append("userPublicKey", pubKey);

      const response = await fetch(
        `${this.swapUrl}/intent?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/intent");
      }

      return response.json();
    });
  }

  /**
   * Submit declarative intent swap
   */
  async submitIntentSwap(intentQuote, keypair = null) {
    const signer = keypair || this.keypair;
    if (!signer) {
      throw new DFlowError("No keypair available for signing", "CONFIG_ERROR", false);
    }

    // Sign the open transaction
    const txBuffer = Buffer.from(intentQuote.openTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(txBuffer);
    transaction.sign([signer]);

    const signedTx = Buffer.from(transaction.serialize()).toString("base64");

    return withRetry(async () => {
      const response = await fetch(`${this.swapUrl}/intent-swap`, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify({
          signedOpenTransaction: signedTx,
          lastValidBlockHeight: intentQuote.lastValidBlockHeight,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/intent-swap");
      }

      return response.json();
    });
  }

  /**
   * Sign and submit a transaction
   * @param {Object} orderResponse - Response from requestOrder
   * @param {Keypair} keypair - Optional keypair to sign with (uses instance keypair if not provided)
   */
  async signAndSubmit(orderResponse, keypair = null) {
    const signer = keypair || this.keypair;
    if (!signer) {
      throw new DFlowError("No keypair available for signing", "CONFIG_ERROR", false);
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
        `${this.swapUrl}/order-status?signature=${signature}`,
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

  // ============================================
  // PREDICTION MARKET METADATA API
  // ============================================

  /**
   * Get prediction market events
   */
  async getEvents(options = {}) {
    const { limit = 50, cursor, status, seriesTicker } = options;

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      if (limit) queryParams.append("limit", limit.toString());
      if (cursor) queryParams.append("cursor", cursor.toString());
      if (status) queryParams.append("status", status);
      if (seriesTicker) queryParams.append("seriesTicker", seriesTicker);

      const response = await fetch(
        `${this.metadataUrl}/events?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/events");
      }

      return response.json();
    });
  }

  /**
   * Get single event by ticker
   */
  async getEvent(ticker) {
    return withRetry(async () => {
      const response = await fetch(
        `${this.metadataUrl}/events/${ticker}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/events/${ticker}`);
      }

      return response.json();
    });
  }

  /**
   * Get prediction markets
   */
  async getMarkets(options = {}) {
    const { limit = 50, cursor, status, eventTicker } = options;

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      if (limit) queryParams.append("limit", limit.toString());
      if (cursor) queryParams.append("cursor", cursor.toString());
      if (status) queryParams.append("status", status);
      if (eventTicker) queryParams.append("eventTicker", eventTicker);

      const response = await fetch(
        `${this.metadataUrl}/markets?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/markets");
      }

      return response.json();
    });
  }

  /**
   * Get single market by ticker
   */
  async getMarket(ticker) {
    return withRetry(async () => {
      const response = await fetch(
        `${this.metadataUrl}/markets/${ticker}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/markets/${ticker}`);
      }

      return response.json();
    });
  }

  /**
   * Get market by mint address
   */
  async getMarketByMint(mintAddress) {
    return withRetry(async () => {
      const response = await fetch(
        `${this.metadataUrl}/markets/mint/${mintAddress}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/markets/mint/${mintAddress}`);
      }

      return response.json();
    });
  }

  /**
   * Get markets batch by tickers
   */
  async getMarketsBatch(tickers) {
    return withRetry(async () => {
      const response = await fetch(`${this.metadataUrl}/markets/batch`, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify({ tickers }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/markets/batch");
      }

      return response.json();
    });
  }

  /**
   * Get outcome mints for a market
   */
  async getOutcomeMints(ticker) {
    return withRetry(async () => {
      const response = await fetch(
        `${this.metadataUrl}/markets/${ticker}/outcome-mints`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/markets/${ticker}/outcome-mints`);
      }

      return response.json();
    });
  }

  /**
   * Get market orderbook
   */
  async getOrderbook(ticker) {
    return withRetry(async () => {
      const response = await fetch(
        `${this.metadataUrl}/orderbook/${ticker}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/orderbook/${ticker}`);
      }

      return response.json();
    });
  }

  /**
   * Get orderbook by mint address
   */
  async getOrderbookByMint(mintAddress) {
    return withRetry(async () => {
      const response = await fetch(
        `${this.metadataUrl}/orderbook/mint/${mintAddress}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/orderbook/mint/${mintAddress}`);
      }

      return response.json();
    });
  }

  /**
   * Get market trades
   */
  async getTrades(ticker, options = {}) {
    const { limit = 50, cursor } = options;

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      if (limit) queryParams.append("limit", limit.toString());
      if (cursor) queryParams.append("cursor", cursor.toString());

      const response = await fetch(
        `${this.metadataUrl}/trades/${ticker}?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/trades/${ticker}`);
      }

      return response.json();
    });
  }

  /**
   * Get live data from Kalshi
   */
  async getLiveData(options = {}) {
    const { eventTicker, mintAddress } = options;

    return withRetry(async () => {
      let url = `${this.metadataUrl}/live-data`;
      if (eventTicker) {
        url = `${this.metadataUrl}/live-data/event/${eventTicker}`;
      } else if (mintAddress) {
        url = `${this.metadataUrl}/live-data/mint/${mintAddress}`;
      }

      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/live-data");
      }

      return response.json();
    });
  }

  /**
   * Get series templates
   */
  async getSeries(options = {}) {
    const { ticker } = options;

    return withRetry(async () => {
      let url = `${this.metadataUrl}/series`;
      if (ticker) {
        url = `${this.metadataUrl}/series/${ticker}`;
      }

      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/series");
      }

      return response.json();
    });
  }

  /**
   * Search events by title or ticker
   */
  async searchEvents(query, options = {}) {
    const { limit = 20 } = options;

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      queryParams.append("q", query);
      if (limit) queryParams.append("limit", limit.toString());

      const response = await fetch(
        `${this.metadataUrl}/search/events?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/search/events");
      }

      return response.json();
    });
  }

  /**
   * Get market candlesticks
   */
  async getMarketCandlesticks(ticker, options = {}) {
    const { interval = "1h", startTime, endTime } = options;

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      queryParams.append("interval", interval);
      if (startTime) queryParams.append("startTime", startTime.toString());
      if (endTime) queryParams.append("endTime", endTime.toString());

      const response = await fetch(
        `${this.metadataUrl}/markets/${ticker}/candlesticks?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, `/markets/${ticker}/candlesticks`);
      }

      return response.json();
    });
  }

  /**
   * Initialize prediction market (utility endpoint)
   */
  async initializePredictionMarket(params) {
    const { marketTicker, userPublicKey } = params;

    const pubKey = userPublicKey || this.keypair?.publicKey?.toBase58();
    if (!pubKey) {
      throw new DFlowError("No user public key provided", "CONFIG_ERROR", false);
    }

    return withRetry(async () => {
      const queryParams = new URLSearchParams();
      queryParams.append("marketTicker", marketTicker);
      queryParams.append("userPublicKey", pubKey);

      const response = await fetch(
        `${this.swapUrl}/initialize-prediction-market?${queryParams.toString()}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/initialize-prediction-market");
      }

      return response.json();
    });
  }

  /**
   * Get token list
   */
  async getTokenList(options = {}) {
    const { withDecimals = false } = options;

    return withRetry(async () => {
      const endpoint = withDecimals ? "/tokens/decimals" : "/tokens";
      const response = await fetch(
        `${this.swapUrl}${endpoint}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, endpoint);
      }

      return response.json();
    });
  }

  /**
   * Get venue list
   */
  async getVenueList() {
    return withRetry(async () => {
      const response = await fetch(
        `${this.swapUrl}/venues`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        const error = await response.text();
        this.handleApiError(response, error, "/venues");
      }

      return response.json();
    });
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
export async function getSwapQuote(_agent, inputMint, outputMint, amount, slippageBps = 50) {
  const client = getDFlowClient();
  return client.getQuote({ inputMint, outputMint, amount, slippageBps });
}

export async function executeSwap(_agent, inputMint, outputMint, amount, slippageBps = 50) {
  const client = getDFlowClient();
  return client.swap({ inputMint, outputMint, amount, slippageBps });
}

export async function getSolPrice(_agent) {
  const client = getDFlowClient();
  return client.getSolUsdcPrice(1);
}

// Prediction Market helper functions
export async function getPredictionMarkets(_agent, options = {}) {
  const client = getDFlowClient();
  return client.getMarkets(options);
}

export async function getPredictionMarketOrderbook(_agent, ticker) {
  const client = getDFlowClient();
  return client.getOrderbook(ticker);
}

export async function searchPredictionEvents(_agent, query, options = {}) {
  const client = getDFlowClient();
  return client.searchEvents(query, options);
}

// ============================================
// DFLOW WEBSOCKET CLIENT
// ============================================

/**
 * DFlow WebSocket Client for real-time prediction market data
 */
export class DFlowWebSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.wsUrl = options.wsUrl || API_URLS.websocket;
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.subscriptions = {
      prices: new Set(),
      trades: new Set(),
      orderbook: new Set(),
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      // Use dynamic import for ws in Node.js
      import("ws").then(({ default: WebSocket }) => {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit("connected");
          resolve();
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data);
        });

        this.ws.on("close", () => {
          this.connected = false;
          this.emit("disconnected");
          
          if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        });

        this.ws.on("error", (error) => {
          this.emit("error", error);
          if (!this.connected) {
            reject(error);
          }
        });
      }).catch(reject);
    });
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    
    this.emit("reconnecting", { 
      attempt: this.reconnectAttempts, 
      maxAttempts: this.maxReconnectAttempts,
      delay,
    });

    setTimeout(async () => {
      try {
        await this.connect();
        await this.resubscribeAll();
      } catch (error) {
        this.emit("error", error);
      }
    }, delay);
  }

  /**
   * Resubscribe to all previous subscriptions
   */
  async resubscribeAll() {
    for (const [channel, tickers] of Object.entries(this.subscriptions)) {
      if (tickers.size > 0) {
        await this.subscribe(channel, Array.from(tickers));
      }
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.autoReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.subscriptions = {
      prices: new Set(),
      trades: new Set(),
      orderbook: new Set(),
    };
  }

  /**
   * Send message to WebSocket server
   */
  send(message) {
    if (!this.connected || !this.ws) {
      throw new DFlowError("WebSocket not connected", "WS_NOT_CONNECTED", false);
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Subscribe to a channel
   * @param {string} channel - Channel name: prices, trades, orderbook
   * @param {string[]|boolean} tickers - Array of tickers or true for all
   */
  subscribe(channel, tickers = true) {
    const message = {
      type: "subscribe",
      channel,
    };

    if (tickers === true) {
      message.all = true;
    } else {
      message.tickers = Array.isArray(tickers) ? tickers : [tickers];
      // Track subscriptions
      for (const ticker of message.tickers) {
        this.subscriptions[channel]?.add(ticker);
      }
    }

    this.send(message);
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel, tickers = true) {
    const message = {
      type: "unsubscribe",
      channel,
    };

    if (tickers === true) {
      message.all = true;
      this.subscriptions[channel]?.clear();
    } else {
      message.tickers = Array.isArray(tickers) ? tickers : [tickers];
      for (const ticker of message.tickers) {
        this.subscriptions[channel]?.delete(ticker);
      }
    }

    this.send(message);
  }

  /**
   * Subscribe to price updates
   */
  subscribePrices(tickers = true) {
    this.subscribe("prices", tickers);
  }

  /**
   * Subscribe to trade updates
   */
  subscribeTrades(tickers = true) {
    this.subscribe("trades", tickers);
  }

  /**
   * Subscribe to orderbook updates
   */
  subscribeOrderbook(tickers = true) {
    this.subscribe("orderbook", tickers);
  }

  /**
   * Subscribe to all channels for specific tickers
   */
  subscribeAll(tickers) {
    this.subscribePrices(tickers);
    this.subscribeTrades(tickers);
    this.subscribeOrderbook(tickers);
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      const { channel } = message;

      switch (channel) {
        case "prices":
          this.emit("price", message);
          break;
        case "trades":
          this.emit("trade", message);
          break;
        case "orderbook":
          this.emit("orderbook", message);
          break;
        default:
          this.emit("message", message);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get current subscriptions
   */
  getSubscriptions() {
    return {
      prices: Array.from(this.subscriptions.prices),
      trades: Array.from(this.subscriptions.trades),
      orderbook: Array.from(this.subscriptions.orderbook),
    };
  }
}

// WebSocket singleton
let wsInstance = null;

export function getDFlowWs(options = {}) {
  if (!wsInstance) {
    wsInstance = new DFlowWebSocket(options);
  }
  return wsInstance;
}

export function createDFlowWs(options = {}) {
  return new DFlowWebSocket(options);
}

export default {
  DFlowClient,
  DFlowWebSocket,
  getDFlowClient,
  getDFlowWs,
  createDFlowWs,
  DFlowError,
  TOKENS,
  ORDER_STATUS,
  MARKET_STATUS,
  API_URLS,
  getSwapQuote,
  executeSwap,
  getSolPrice,
  getPredictionMarkets,
  getPredictionMarketOrderbook,
  searchPredictionEvents,
};
