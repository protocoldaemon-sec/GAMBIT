/**
 * Intelligence Agent
 * Web browsing, news scraping, and sentiment analysis for prediction markets
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getFreeAgentModel } from "../llm/index.js";
import { searchNews, fetchArticle } from "../intelligence/scraper.js";
import { analyzeSentiment, aggregateSentiment, generateSignal } from "../intelligence/sentiment.js";
import { getMarketIntelligence, generateSearchQueries } from "../intelligence/market-intel.js";

const searchNewsTool = tool(
  async ({ query, limit }) => {
    try {
      const results = await searchNews(query, { limit: limit || 10 });
      return JSON.stringify({
        query,
        articleCount: results.articles.length,
        articles: results.articles.map(a => ({
          title: a.title,
          source: a.source,
          url: a.url,
          publishedAt: a.publishedAt,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "search_news",
    description: "Search for news articles related to a topic or market",
    schema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max articles to return"),
    }),
  }
);

const fetchArticleTool = tool(
  async ({ url }) => {
    try {
      const article = await fetchArticle(url);
      return JSON.stringify({
        title: article.title,
        description: article.description,
        content: article.content?.slice(0, 2000),
        publishedAt: article.publishedAt,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "fetch_article",
    description: "Fetch and extract content from a news article URL",
    schema: z.object({
      url: z.string().describe("Article URL to fetch"),
    }),
  }
);

const analyzeSentimentTool = tool(
  async ({ text, marketTitle, side }) => {
    try {
      const result = await analyzeSentiment(text, { marketTitle, side });
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "analyze_sentiment",
    description: "Analyze sentiment of text in relation to a prediction market",
    schema: z.object({
      text: z.string().describe("Text to analyze"),
      marketTitle: z.string().optional().describe("Market title for context"),
      side: z.enum(["yes", "no"]).optional().describe("Position being considered"),
    }),
  }
);


const getMarketIntelTool = tool(
  async ({ ticker, fetchContent }) => {
    try {
      const intel = await getMarketIntelligence(ticker, { 
        fetchContent: fetchContent !== false,
        maxArticles: 10,
      });
      
      return JSON.stringify({
        ticker: intel.ticker,
        market: intel.market,
        liquidity: intel.liquidity,
        sentiment: intel.sentiment,
        signal: intel.signal,
        newsCount: intel.news.articleCount,
        topHeadlines: intel.news.articles.slice(0, 5).map(a => a.title),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_market_intelligence",
    description: "Get comprehensive intelligence for a Kalshi market including news, sentiment, and trading signal",
    schema: z.object({
      ticker: z.string().describe("Kalshi market ticker"),
      fetchContent: z.boolean().optional().describe("Whether to fetch full article content"),
    }),
  }
);

const generateQueriesTool = tool(
  async ({ marketTitle }) => {
    const queries = generateSearchQueries(marketTitle);
    return JSON.stringify({ marketTitle, queries });
  },
  {
    name: "generate_search_queries",
    description: "Generate relevant search queries from a market title",
    schema: z.object({
      marketTitle: z.string().describe("Market title to generate queries from"),
    }),
  }
);

const compareMarketsTool = tool(
  async ({ tickers }) => {
    try {
      const results = [];
      
      for (const ticker of tickers.slice(0, 5)) {
        const intel = await getMarketIntelligence(ticker, { 
          fetchContent: false,
          maxArticles: 5,
        });
        
        results.push({
          ticker,
          title: intel.market.title,
          yesPrice: intel.market.yesPrice,
          sentiment: intel.sentiment.overall,
          sentimentConfidence: intel.sentiment.confidence,
          liquidity: intel.liquidity.rating,
          signal: intel.signal.action,
          signalStrength: intel.signal.signalStrength,
        });
      }
      
      // Rank by signal strength
      results.sort((a, b) => Math.abs(b.signalStrength) - Math.abs(a.signalStrength));
      
      return JSON.stringify({
        markets: results,
        topOpportunity: results[0],
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "compare_markets",
    description: "Compare multiple markets and rank by trading opportunity",
    schema: z.object({
      tickers: z.array(z.string()).describe("Array of market tickers to compare"),
    }),
  }
);

const webBrowseTool = tool(
  async ({ url }) => {
    try {
      // Try Firecrawl first
      if (process.env.FIRECRAWL_API_KEY) {
        const { scrapeUrl } = await import("../intelligence/firecrawl.js");
        const result = await scrapeUrl(url);
        return JSON.stringify({
          url,
          title: result.metadata?.title,
          content: result.markdown?.slice(0, 3000),
        });
      }
      
      // Fallback
      const { fetchPage, extractText, extractMetadata } = await import("../intelligence/scraper.js");
      const html = await fetchPage(url);
      const metadata = extractMetadata(html, url);
      const text = extractText(html);
      
      return JSON.stringify({
        url,
        title: metadata.title,
        description: metadata.description,
        content: text.slice(0, 3000),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "web_browse",
    description: "Browse a webpage and extract its content using Firecrawl",
    schema: z.object({
      url: z.string().describe("URL to browse"),
    }),
  }
);

const runNewsWorkflowTool = tool(
  async ({ query }) => {
    try {
      const { analyzeNewsWorkflow } = await import("../intelligence/workflows.js");
      const result = await analyzeNewsWorkflow(query);
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "run_news_workflow",
    description: "Run full news analysis workflow with LangGraph - searches, scrapes, and analyzes news",
    schema: z.object({
      query: z.string().describe("News search query"),
    }),
  }
);

const runMarketWorkflowTool = tool(
  async ({ ticker }) => {
    try {
      const { analyzeMarketWorkflow } = await import("../intelligence/workflows.js");
      const result = await analyzeMarketWorkflow(ticker);
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "run_market_workflow",
    description: "Run full market intelligence workflow - fetches market data, news, and generates trading signal",
    schema: z.object({
      ticker: z.string().describe("Kalshi market ticker"),
    }),
  }
);

const scanMarketsWorkflowTool = tool(
  async ({ tickers }) => {
    try {
      const { scanMarketsWorkflow } = await import("../intelligence/workflows.js");
      const result = await scanMarketsWorkflow(tickers);
      return JSON.stringify({
        scanned: result.scanned,
        opportunities: result.opportunities.length,
        topPick: result.topPick ? {
          ticker: result.topPick.ticker,
          signal: result.topPick.signal,
        } : null,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "scan_markets_workflow",
    description: "Scan multiple markets and rank trading opportunities",
    schema: z.object({
      tickers: z.array(z.string()).describe("Array of market tickers to scan"),
    }),
  }
);

export const intelligenceAgent = {
  name: "intelligence",
  description: "Web browsing, news scraping, and sentiment analysis for prediction markets",
  tools: [
    searchNewsTool,
    fetchArticleTool,
    analyzeSentimentTool,
    getMarketIntelTool,
    generateQueriesTool,
    compareMarketsTool,
    webBrowseTool,
    runNewsWorkflowTool,
    runMarketWorkflowTool,
    scanMarketsWorkflowTool,
  ],
  model: getFreeAgentModel(),
};
