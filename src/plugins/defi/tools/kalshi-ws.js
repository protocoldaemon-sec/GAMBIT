/**
 * Kalshi WebSocket Client
 * Real-time market data streaming via WebSocket
 * 
 * Features:
 * - RSA-PSS authentication
 * - Auto-reconnect with exponential backoff
 * - Orderbook state management
 * - Sub-penny pricing support
 */
import WebSocket from "ws";
import crypto from "crypto";
import { EventEmitter } from "events";
import { KalshiError, standardCentsToDollars } from "./kalshi.js";

// WebSocket URLs
const WS_URLS = {
  production: "wss://api.elections.kalshi.com/trade-api/ws/v2",
  demo: "wss://demo-api.kalshi.co/trade-api/ws/v2",
};

// WebSocket Error Codes
const WS_ERROR_CODES = {
  INVALID_SUBSCRIPTION: "invalid_subscription",
  UNKNOWN_MARKET: "unknown_market",
  RATE_LIMITED: "rate_limited",
  AUTH_FAILED: "auth_failed",
};

/**
 * Kalshi WebSocket Client
 * Handles real-time market data streaming
 */
export class KalshiWebSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.apiKey = options.apiKey || process.env.KALSHI_API_KEY;
    this.privateKey = options.privateKey || process.env.KALSHI_PRIVATE_KEY;
    this.environment = options.environment || "production";
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.subscriptions = new Map(); // channel -> Set of tickers
    this.orderbooks = new Map(); // ticker -> orderbook state
    this.messageId = 0;
    this.pendingCommands = new Map(); // id -> { resolve, reject }
  }

  /**
   * Get WebSocket URL based on environment
   */
  getWsUrl() {
    return WS_URLS[this.environment] || WS_URLS.production;
  }

  /**
   * Generate RSA-PSS signature for authentication
   */
  generateSignature(timestamp, method, path) {
    const message = `${timestamp}${method}${path}`;
    
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(message);
    sign.end();
    
    return sign.sign(
      {
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      "base64"
    );
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

      const wsUrl = this.getWsUrl();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = "/trade-api/ws/v2";
      const signature = this.generateSignature(timestamp, "GET", path);

      // Build authenticated URL
      const authUrl = `${wsUrl}?api_key=${this.apiKey}&timestamp=${timestamp}&signature=${encodeURIComponent(signature)}`;

      this.ws = new WebSocket(authUrl);

      this.ws.on("open", () => {
        this.connected = true;
        this.authenticated = true;
        this.reconnectAttempts = 0;
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data);
      });

      this.ws.on("close", (code, reason) => {
        this.connected = false;
        this.authenticated = false;
        this.emit("disconnected", { code, reason: reason.toString() });
        
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
        // Resubscribe to previous channels
        await this.resubscribeAll();
      } catch (error) {
        this.emit("error", error);
      }
    }, delay);
  }

  /**
   * Resubscribe to all previous subscriptions after reconnect
   */
  async resubscribeAll() {
    for (const [channel, tickers] of this.subscriptions) {
      for (const ticker of tickers) {
        await this.subscribe(channel, ticker);
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
    this.authenticated = false;
    this.subscriptions.clear();
    this.orderbooks.clear();
  }

  /**
   * Send command to WebSocket server
   */
  sendCommand(cmd, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const id = ++this.messageId;
      const message = {
        id,
        cmd,
        params,
      };

      this.pendingCommands.set(id, { resolve, reject });

      // Timeout for command response
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${cmd}`));
        }
      }, 10000);

      this.ws.send(JSON.stringify(message));
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle command responses
      if (message.id && this.pendingCommands.has(message.id)) {
        const { resolve, reject } = this.pendingCommands.get(message.id);
        this.pendingCommands.delete(message.id);
        
        if (message.error) {
          reject(new Error(message.error.message || "Command failed"));
        } else {
          resolve(message);
        }
        return;
      }

      // Handle channel messages
      const { type, msg } = message;

      switch (type) {
        case "subscribed":
          this.handleSubscribed(msg);
          break;
        case "unsubscribed":
          this.handleUnsubscribed(msg);
          break;
        case "orderbook_snapshot":
          this.handleOrderbookSnapshot(msg);
          break;
        case "orderbook_delta":
          this.handleOrderbookDelta(msg);
          break;
        case "ticker":
          this.handleTicker(msg);
          break;
        case "trade":
          this.handleTrade(msg);
          break;
        case "fill":
          this.handleFill(msg);
          break;
        case "error":
          this.handleError(msg);
          break;
        default:
          this.emit("message", message);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }


  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Subscribe to a channel for a market ticker
   * @param {string} channel - Channel name: orderbook_delta, ticker, trade, fill
   * @param {string} marketTicker - Market ticker to subscribe to
   */
  async subscribe(channel, marketTicker) {
    const result = await this.sendCommand("subscribe", {
      channels: [channel],
      market_ticker: marketTicker,
    });

    // Track subscription
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel).add(marketTicker);

    return result;
  }

  /**
   * Unsubscribe from a channel for a market ticker
   */
  async unsubscribe(channel, marketTicker) {
    const result = await this.sendCommand("unsubscribe", {
      channels: [channel],
      market_ticker: marketTicker,
    });

    // Remove from tracking
    if (this.subscriptions.has(channel)) {
      this.subscriptions.get(channel).delete(marketTicker);
    }

    return result;
  }

  /**
   * Subscribe to orderbook updates for a market
   */
  async subscribeOrderbook(marketTicker) {
    return this.subscribe("orderbook_delta", marketTicker);
  }

  /**
   * Subscribe to ticker updates for a market
   */
  async subscribeTicker(marketTicker) {
    return this.subscribe("ticker", marketTicker);
  }

  /**
   * Subscribe to trade updates for a market
   */
  async subscribeTrades(marketTicker) {
    return this.subscribe("trade", marketTicker);
  }

  /**
   * Subscribe to fill updates (authenticated - your fills only)
   */
  async subscribeFills(marketTicker) {
    return this.subscribe("fill", marketTicker);
  }

  /**
   * Subscribe to all channels for a market
   */
  async subscribeAll(marketTicker) {
    await Promise.all([
      this.subscribeOrderbook(marketTicker),
      this.subscribeTicker(marketTicker),
      this.subscribeTrades(marketTicker),
      this.subscribeFills(marketTicker),
    ]);
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================

  handleSubscribed(msg) {
    this.emit("subscribed", {
      channel: msg.channel,
      ticker: msg.market_ticker,
    });
  }

  handleUnsubscribed(msg) {
    this.emit("unsubscribed", {
      channel: msg.channel,
      ticker: msg.market_ticker,
    });
  }

  handleOrderbookSnapshot(msg) {
    const ticker = msg.market_ticker;
    
    // Initialize orderbook state
    const orderbook = {
      ticker,
      yes: new Map(), // price -> quantity
      no: new Map(),
      seq: msg.seq,
      timestamp: Date.now(),
    };

    // Parse yes side
    if (msg.yes) {
      for (const [price, quantity] of msg.yes) {
        orderbook.yes.set(price, quantity);
      }
    }

    // Parse no side
    if (msg.no) {
      for (const [price, quantity] of msg.no) {
        orderbook.no.set(price, quantity);
      }
    }

    this.orderbooks.set(ticker, orderbook);

    this.emit("orderbook_snapshot", {
      ticker,
      orderbook: this.formatOrderbook(orderbook),
    });
  }

  handleOrderbookDelta(msg) {
    const ticker = msg.market_ticker;
    const orderbook = this.orderbooks.get(ticker);

    if (!orderbook) {
      // No snapshot yet, request one
      this.emit("orderbook_delta", { ticker, delta: msg, needsSnapshot: true });
      return;
    }

    // Apply delta
    if (msg.price !== undefined && msg.delta !== undefined) {
      const side = msg.side === "yes" ? orderbook.yes : orderbook.no;
      const currentQty = side.get(msg.price) || 0;
      const newQty = currentQty + msg.delta;

      if (newQty <= 0) {
        side.delete(msg.price);
      } else {
        side.set(msg.price, newQty);
      }
    }

    orderbook.seq = msg.seq;
    orderbook.timestamp = Date.now();

    this.emit("orderbook_delta", {
      ticker,
      delta: {
        side: msg.side,
        price: standardCentsToDollars(msg.price),
        priceCents: msg.price,
        delta: msg.delta,
        seq: msg.seq,
      },
      orderbook: this.formatOrderbook(orderbook),
    });
  }


  handleTicker(msg) {
    this.emit("ticker", {
      ticker: msg.market_ticker,
      yesPrice: standardCentsToDollars(msg.yes_price),
      noPrice: standardCentsToDollars(msg.no_price),
      yesBid: standardCentsToDollars(msg.yes_bid),
      yesAsk: standardCentsToDollars(msg.yes_ask),
      noBid: standardCentsToDollars(msg.no_bid),
      noAsk: standardCentsToDollars(msg.no_ask),
      // Raw cents for precision
      yesPriceCents: msg.yes_price,
      noPriceCents: msg.no_price,
      yesBidCents: msg.yes_bid,
      yesAskCents: msg.yes_ask,
      noBidCents: msg.no_bid,
      noAskCents: msg.no_ask,
      volume: msg.volume,
      volume24h: msg.volume_24h,
      openInterest: msg.open_interest,
      timestamp: msg.ts,
    });
  }

  handleTrade(msg) {
    this.emit("trade", {
      ticker: msg.market_ticker,
      tradeId: msg.trade_id,
      yesPrice: standardCentsToDollars(msg.yes_price),
      noPrice: standardCentsToDollars(msg.no_price),
      yesPriceCents: msg.yes_price,
      noPriceCents: msg.no_price,
      count: msg.count,
      takerSide: msg.taker_side,
      timestamp: msg.ts,
    });
  }

  handleFill(msg) {
    this.emit("fill", {
      ticker: msg.market_ticker,
      orderId: msg.order_id,
      tradeId: msg.trade_id,
      side: msg.side,
      action: msg.action,
      count: msg.count,
      yesPrice: standardCentsToDollars(msg.yes_price),
      noPrice: standardCentsToDollars(msg.no_price),
      yesPriceCents: msg.yes_price,
      noPriceCents: msg.no_price,
      isTaker: msg.is_taker,
      timestamp: msg.ts,
    });
  }

  handleError(msg) {
    const error = new KalshiError(
      msg.message || "WebSocket error",
      msg.code || "WS_ERROR",
      false,
      msg
    );
    this.emit("ws_error", error);
  }

  // ============================================
  // ORDERBOOK UTILITIES
  // ============================================

  /**
   * Format orderbook for external use
   */
  formatOrderbook(orderbook) {
    const formatSide = (side) => {
      return Array.from(side.entries())
        .map(([price, quantity]) => ({
          price: standardCentsToDollars(price),
          priceCents: price,
          quantity,
        }))
        .sort((a, b) => b.price - a.price); // Descending by price
    };

    return {
      ticker: orderbook.ticker,
      yes: formatSide(orderbook.yes),
      no: formatSide(orderbook.no),
      seq: orderbook.seq,
      timestamp: orderbook.timestamp,
    };
  }

  /**
   * Get current orderbook state for a ticker
   */
  getOrderbook(ticker) {
    const orderbook = this.orderbooks.get(ticker);
    return orderbook ? this.formatOrderbook(orderbook) : null;
  }

  /**
   * Get best bid/ask for a ticker
   */
  getBestPrices(ticker) {
    const orderbook = this.orderbooks.get(ticker);
    if (!orderbook) return null;

    const yesBids = Array.from(orderbook.yes.keys()).sort((a, b) => b - a);
    const noAsks = Array.from(orderbook.no.keys()).sort((a, b) => a - b);

    return {
      ticker,
      yesBestBid: yesBids[0] ? standardCentsToDollars(yesBids[0]) : null,
      yesBestBidCents: yesBids[0] || null,
      noBestAsk: noAsks[0] ? standardCentsToDollars(noAsks[0]) : null,
      noBestAskCents: noAsks[0] || null,
      spreadCents: yesBids[0] && noAsks[0] ? noAsks[0] - yesBids[0] : null,
      spread: yesBids[0] && noAsks[0] ? standardCentsToDollars(noAsks[0] - yesBids[0]) : null,
    };
  }

  /**
   * Get mid price for a ticker
   */
  getMidPrice(ticker) {
    const prices = this.getBestPrices(ticker);
    if (!prices || !prices.yesBestBid || !prices.noBestAsk) return null;
    return (prices.yesBestBid + (1 - prices.noBestAsk)) / 2;
  }

  // ============================================
  // CONNECTION STATUS
  // ============================================

  isConnected() {
    return this.connected;
  }

  isAuthenticated() {
    return this.authenticated;
  }

  getSubscriptions() {
    const result = {};
    for (const [channel, tickers] of this.subscriptions) {
      result[channel] = Array.from(tickers);
    }
    return result;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let wsInstance = null;

/**
 * Get or create WebSocket instance
 */
export function getKalshiWs(options = {}) {
  if (!wsInstance) {
    wsInstance = new KalshiWebSocket(options);
  }
  return wsInstance;
}

/**
 * Create new WebSocket instance (for multiple connections)
 */
export function createKalshiWs(options = {}) {
  return new KalshiWebSocket(options);
}

export default KalshiWebSocket;
