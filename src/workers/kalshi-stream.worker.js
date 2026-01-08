/**
 * Kalshi Stream Worker
 * Streams real-time market data from Kalshi WebSocket to Kafka
 */
import "dotenv/config";
import { KalshiWebSocket } from "../plugins/defi/tools/kalshi-ws.js";
import { getKafkaProducer, TOPICS } from "../kafka/client.js";

const WATCHED_MARKETS = process.env.KALSHI_WATCHED_MARKETS?.split(",") || [];

class KalshiStreamWorker {
  constructor() {
    this.ws = new KalshiWebSocket({
      environment: process.env.KALSHI_ENVIRONMENT || "production",
      autoReconnect: true,
    });
    this.producer = null;
    this.running = false;
  }

  async start() {
    console.log("[KalshiStream] Starting worker...");
    
    // Initialize Kafka producer
    this.producer = await getKafkaProducer();
    
    // Setup WebSocket event handlers
    this.setupEventHandlers();
    
    // Connect to Kalshi WebSocket
    await this.ws.connect();
    console.log("[KalshiStream] Connected to Kalshi WebSocket");
    
    // Subscribe to watched markets
    await this.subscribeToMarkets();
    
    this.running = true;
    console.log("[KalshiStream] Worker started successfully");
  }

  setupEventHandlers() {
    this.ws.on("connected", () => {
      console.log("[KalshiStream] WebSocket connected");
    });

    this.ws.on("disconnected", ({ code, reason }) => {
      console.log(`[KalshiStream] WebSocket disconnected: ${code} - ${reason}`);
    });

    this.ws.on("reconnecting", ({ attempt, maxAttempts, delay }) => {
      console.log(`[KalshiStream] Reconnecting (${attempt}/${maxAttempts}) in ${delay}ms`);
    });

    this.ws.on("error", (error) => {
      console.error("[KalshiStream] WebSocket error:", error.message);
    });

    // Market data events
    this.ws.on("orderbook_snapshot", async (data) => {
      await this.publishEvent("orderbook.snapshot", data);
    });

    this.ws.on("orderbook_delta", async (data) => {
      await this.publishEvent("orderbook.delta", data);
    });

    this.ws.on("ticker", async (data) => {
      await this.publishEvent("ticker", data);
    });

    this.ws.on("trade", async (data) => {
      await this.publishEvent("trade", data);
    });

    this.ws.on("fill", async (data) => {
      await this.publishEvent("fill", data);
    });

    this.ws.on("subscribed", ({ channel, ticker }) => {
      console.log(`[KalshiStream] Subscribed to ${channel} for ${ticker}`);
    });
  }

  async subscribeToMarkets() {
    if (WATCHED_MARKETS.length === 0) {
      console.log("[KalshiStream] No markets configured. Set KALSHI_WATCHED_MARKETS env var.");
      return;
    }

    console.log(`[KalshiStream] Subscribing to ${WATCHED_MARKETS.length} markets...`);
    
    for (const ticker of WATCHED_MARKETS) {
      try {
        await this.ws.subscribeAll(ticker.trim());
        console.log(`[KalshiStream] Subscribed to ${ticker}`);
      } catch (error) {
        console.error(`[KalshiStream] Failed to subscribe to ${ticker}:`, error.message);
      }
    }
  }

  async publishEvent(eventType, data) {
    if (!this.producer) return;

    try {
      await this.producer.send({
        topic: TOPICS.MARKET_DATA,
        messages: [{
          key: data.ticker || "kalshi",
          value: JSON.stringify({
            source: "kalshi",
            type: eventType,
            data,
            timestamp: Date.now(),
          }),
        }],
      });
    } catch (error) {
      console.error(`[KalshiStream] Failed to publish ${eventType}:`, error.message);
    }
  }

  async stop() {
    console.log("[KalshiStream] Stopping worker...");
    this.running = false;
    this.ws.disconnect();
    
    if (this.producer) {
      await this.producer.disconnect();
    }
    
    console.log("[KalshiStream] Worker stopped");
  }
}

// Start worker
const worker = new KalshiStreamWorker();

worker.start().catch((error) => {
  console.error("[KalshiStream] Failed to start:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => worker.stop());
process.on("SIGTERM", () => worker.stop());
