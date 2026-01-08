/**
 * Search Indexer Worker
 * Inspired by OneStop's event-driven indexing architecture
 * 
 * Consumes events from Kafka and indexes to Elasticsearch
 * for real-time search and analytics
 */
import "dotenv/config";
import { Kafka } from "kafkajs";
import { getElasticsearchClient } from "../search/elasticsearch.js";

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID}-search-indexer`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "gambit-search-indexer" });
const es = getElasticsearchClient();

// Topics to consume for indexing
const INDEX_TOPICS = {
  "agent.market-discovery": "markets",
  "agent.trading": "trades",
  "agent.responses": "signals",
  "agent.intelligence": "news",
};

/**
 * Process market discovery events
 */
async function processMarketEvent(message) {
  const data = JSON.parse(message.value.toString());
  
  if (data.result?.markets) {
    // Bulk index markets
    for (const market of data.result.markets) {
      await es.indexMarket({
        ticker: market.ticker,
        title: market.title,
        description: market.description,
        category: market.category,
        status: market.status || "active",
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        volume: market.volume,
        openInterest: market.openInterest,
        closeTime: market.closeTime,
        tags: extractTags(market.title),
      });
    }
    console.log(`[SearchIndexer] Indexed ${data.result.markets.length} markets`);
  }
}

/**
 * Process trading events
 */
async function processTradeEvent(message) {
  const data = JSON.parse(message.value.toString());
  
  if (data.result?.signature) {
    await es.indexTrade({
      userId: data.userId,
      ticker: data.result.ticker || data.payload?.ticker,
      side: data.result.side,
      quantity: data.result.quantity,
      price: data.result.price,
      totalCost: data.result.totalCost,
      fee: data.result.fee,
      status: data.result.status,
      signature: data.result.signature,
      pnl: data.result.pnl,
      kellyFraction: data.result.kellyFraction,
      regime: data.result.regime,
    });
    console.log(`[SearchIndexer] Indexed trade: ${data.result.signature}`);
  }
}

/**
 * Process signal events from responses
 */
async function processSignalEvent(message) {
  const data = JSON.parse(message.value.toString());
  
  // Look for trading signals in responses
  if (data.result?.signal || data.result?.action) {
    const signal = data.result.signal || data.result;
    
    await es.indexSignal({
      ticker: data.ticker || signal.ticker,
      action: signal.action,
      side: signal.side,
      confidence: signal.confidence,
      sentiment: signal.sentiment,
      sentimentScore: signal.sentimentScore,
      liquidityScore: signal.liquidityScore,
      newsCount: signal.newsCount,
      regime: signal.regime,
      reasoning: signal.reasoning,
    });
    console.log(`[SearchIndexer] Indexed signal for: ${signal.ticker}`);
  }
}

/**
 * Process intelligence/news events
 */
async function processNewsEvent(message) {
  const data = JSON.parse(message.value.toString());
  
  if (data.result?.articles) {
    for (const article of data.result.articles) {
      await es.indexNews({
        url: article.url,
        title: article.title,
        content: article.content?.slice(0, 5000),
        source: article.source,
        publishedAt: article.publishedAt,
        sentiment: article.sentiment,
        sentimentScore: article.sentimentScore,
        relatedTickers: article.relatedTickers || [],
        topics: extractTopics(article.title, article.content),
      });
    }
    console.log(`[SearchIndexer] Indexed ${data.result.articles.length} articles`);
  }
}

/**
 * Extract tags from market title
 */
function extractTags(title) {
  if (!title) return [];
  
  const keywords = [
    "election", "president", "congress", "senate",
    "fed", "rate", "inflation", "gdp", "unemployment",
    "crypto", "bitcoin", "ethereum",
    "sports", "nfl", "nba", "mlb",
    "weather", "hurricane", "temperature",
  ];
  
  const titleLower = title.toLowerCase();
  return keywords.filter(kw => titleLower.includes(kw));
}

/**
 * Extract topics from news content
 */
function extractTopics(title, content) {
  const text = `${title || ""} ${content || ""}`.toLowerCase();
  
  const topicKeywords = {
    politics: ["election", "president", "congress", "senate", "vote", "poll"],
    economy: ["fed", "rate", "inflation", "gdp", "jobs", "unemployment", "recession"],
    crypto: ["bitcoin", "ethereum", "crypto", "blockchain", "defi"],
    markets: ["stock", "market", "trading", "investor", "wall street"],
    technology: ["ai", "tech", "software", "startup", "innovation"],
  };
  
  const topics = [];
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      topics.push(topic);
    }
  }
  
  return topics;
}

/**
 * Message handler
 */
async function handleMessage({ topic, message }) {
  try {
    switch (topic) {
      case "agent.market-discovery":
        await processMarketEvent(message);
        break;
      case "agent.trading":
        await processTradeEvent(message);
        break;
      case "agent.responses":
        await processSignalEvent(message);
        break;
      case "agent.intelligence":
        await processNewsEvent(message);
        break;
    }
  } catch (error) {
    console.error(`[SearchIndexer] Error processing ${topic}:`, error.message);
  }
}

/**
 * Start worker
 */
async function start() {
  // Initialize Elasticsearch indices
  await es.initializeIndices();
  
  // Connect to Kafka
  await consumer.connect();
  
  // Subscribe to topics
  for (const topic of Object.keys(INDEX_TOPICS)) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
  
  console.log("[SearchIndexer] Started - consuming from:", Object.keys(INDEX_TOPICS).join(", "));
  
  // Run consumer
  await consumer.run({
    eachMessage: handleMessage,
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[SearchIndexer] Shutting down...");
  await consumer.disconnect();
  process.exit(0);
});

start().catch(console.error);
