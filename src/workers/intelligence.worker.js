/**
 * Intelligence Worker
 * Processes news and sentiment analysis tasks
 */
import "dotenv/config";
import { BaseWorker } from "./base.worker.js";
import { intelligenceAgent } from "../agents/intelligence.js";
import { getMarketIntelligence } from "../intelligence/market-intel.js";
import { searchNews } from "../intelligence/scraper.js";

class IntelligenceWorker extends BaseWorker {
  constructor() {
    super("intelligence", intelligenceAgent);
  }

  async processMessage(message) {
    const { action, payload } = message;

    switch (action) {
      case "GET_MARKET_INTEL":
        return await this.getMarketIntel(payload);
      
      case "SEARCH_NEWS":
        return await this.searchNews(payload);
      
      case "SCAN_MARKETS":
        return await this.scanMarkets(payload);
      
      default:
        return await super.processMessage(message);
    }
  }

  async getMarketIntel({ ticker, fetchContent = true }) {
    console.log(`[IntelWorker] Getting intelligence for ${ticker}`);
    
    const intel = await getMarketIntelligence(ticker, { fetchContent });
    
    return {
      success: true,
      ticker,
      sentiment: intel.sentiment,
      signal: intel.signal,
      liquidity: intel.liquidity,
      newsCount: intel.news.articleCount,
    };
  }

  async searchNews({ query, limit = 10 }) {
    console.log(`[IntelWorker] Searching news: ${query}`);
    
    const results = await searchNews(query, { limit });
    
    return {
      success: true,
      query,
      articleCount: results.articles.length,
      articles: results.articles,
    };
  }

  async scanMarkets({ tickers }) {
    console.log(`[IntelWorker] Scanning ${tickers.length} markets`);
    
    const results = [];
    
    for (const ticker of tickers) {
      try {
        const intel = await getMarketIntelligence(ticker, { 
          fetchContent: false,
          maxArticles: 5,
        });
        
        results.push({
          ticker,
          sentiment: intel.sentiment.overall,
          confidence: intel.sentiment.confidence,
          signal: intel.signal.action,
          signalStrength: intel.signal.signalStrength,
        });
      } catch (error) {
        console.error(`[IntelWorker] Failed to scan ${ticker}:`, error.message);
      }
    }
    
    // Sort by opportunity
    results.sort((a, b) => Math.abs(b.signalStrength) - Math.abs(a.signalStrength));
    
    return {
      success: true,
      scanned: results.length,
      opportunities: results.filter(r => r.signal !== "HOLD"),
      all: results,
    };
  }
}

// Start worker
const worker = new IntelligenceWorker();
worker.start().catch(console.error);

export default IntelligenceWorker;
