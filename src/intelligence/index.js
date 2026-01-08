/**
 * Intelligence Module
 * Web scraping, news analysis, and market intelligence
 */
export { fetchPage, extractText, searchNews, fetchArticle } from "./scraper.js";
export { analyzeSentiment, aggregateSentiment, generateSignal } from "./sentiment.js";
export { getMarketIntelligence, generateSearchQueries, calculateLiquidity } from "./market-intel.js";
export { scrapeUrl, scrapeUrls, crawlSite, extractNewsArticle } from "./firecrawl.js";
export { 
  analyzeNewsWorkflow, 
  analyzeMarketWorkflow, 
  scanMarketsWorkflow,
  buildNewsAnalysisWorkflow,
  buildMarketIntelWorkflow,
} from "./workflows.js";

export default {
  // Re-export for convenience
};
