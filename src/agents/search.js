/**
 * Search Agent
 * Full-text search and analytics powered by Elasticsearch
 * Inspired by OneStop's data discovery patterns
 */
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getElasticsearchClient } from "../search/elasticsearch.js";

const es = getElasticsearchClient();

const searchMarkets = tool(
  async ({ query, category, minVolume, limit }) => {
    try {
      const result = await es.searchMarkets(query, {
        category,
        minVolume,
        limit: limit || 10,
      });

      return JSON.stringify({
        total: result.total,
        markets: result.markets.map(m => ({
          ticker: m.ticker,
          title: m.title,
          yesPrice: m.yesPrice,
          volume: m.volume,
          score: m.score,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "search_markets",
    description: "Full-text search for prediction markets by keywords, category, or volume",
    schema: z.object({
      query: z.string().describe("Search query (e.g., 'election', 'fed rate')"),
      category: z.string().optional().describe("Filter by category"),
      minVolume: z.number().optional().describe("Minimum trading volume"),
      limit: z.number().optional().describe("Max results to return"),
    }),
  }
);

const searchNews = tool(
  async ({ query, sentiment, daysBack, tickers, limit }) => {
    try {
      const result = await es.searchNews(query, {
        sentiment,
        daysBack: daysBack || 7,
        tickers,
        limit: limit || 10,
      });

      return JSON.stringify({
        total: result.total,
        articles: result.articles.map(a => ({
          title: a.title,
          source: a.source,
          sentiment: a.sentiment,
          publishedAt: a.publishedAt,
          topics: a.topics,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "search_news",
    description: "Search indexed news articles with sentiment and topic filtering",
    schema: z.object({
      query: z.string().describe("Search query"),
      sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
      daysBack: z.number().optional().describe("Days to look back (default: 7)"),
      tickers: z.array(z.string()).optional().describe("Filter by related market tickers"),
      limit: z.number().optional(),
    }),
  }
);

const getMarketAnalytics = tool(
  async ({ ticker, daysBack }) => {
    try {
      const analytics = await es.getMarketAnalytics(ticker, {
        daysBack: daysBack || 30,
      });

      return JSON.stringify({
        ticker: analytics.ticker,
        period: analytics.period,
        totalVolume: analytics.totalVolume,
        avgPrice: analytics.avgPrice?.toFixed(4),
        tradeCount: analytics.tradeCount,
        bySide: analytics.bySide,
        pnlStats: analytics.pnlStats,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_market_analytics",
    description: "Get trading analytics and statistics for a specific market",
    schema: z.object({
      ticker: z.string().describe("Market ticker"),
      daysBack: z.number().optional().describe("Analysis period in days"),
    }),
  }
);

const getSignalPerformance = tool(
  async ({ daysBack }) => {
    try {
      const performance = await es.getSignalPerformance({
        daysBack: daysBack || 30,
      });

      return JSON.stringify({
        period: performance.period,
        byAction: performance.byAction,
        bySentiment: performance.bySentiment,
        byRegime: performance.byRegime,
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_signal_performance",
    description: "Get performance analytics for trading signals",
    schema: z.object({
      daysBack: z.number().optional().describe("Analysis period in days"),
    }),
  }
);

const findSimilarMarkets = tool(
  async ({ ticker, limit }) => {
    try {
      const result = await es.findSimilarMarkets(ticker, {
        limit: limit || 5,
      });

      return JSON.stringify({
        source: {
          ticker: result.source.ticker,
          title: result.source.title,
        },
        similar: result.similar.map(m => ({
          ticker: m.ticker,
          title: m.title,
          yesPrice: m.yesPrice,
          similarity: m.score,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "find_similar_markets",
    description: "Find markets similar to a given market based on title and description",
    schema: z.object({
      ticker: z.string().describe("Source market ticker"),
      limit: z.number().optional().describe("Number of similar markets to return"),
    }),
  }
);

const getTrendingTopics = tool(
  async ({ daysBack, limit }) => {
    try {
      const trending = await es.getTrendingTopics({
        daysBack: daysBack || 7,
        limit: limit || 20,
      });

      return JSON.stringify({
        topics: trending.topics.map(t => ({
          topic: t.key,
          count: t.doc_count,
        })),
        sources: trending.sources.map(s => ({
          source: s.key,
          count: s.doc_count,
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "get_trending_topics",
    description: "Get trending topics from indexed news articles",
    schema: z.object({
      daysBack: z.number().optional().describe("Days to analyze"),
      limit: z.number().optional().describe("Number of topics to return"),
    }),
  }
);

export const searchAgent = {
  name: "search",
  description: "Full-text search and analytics for markets, news, and trading signals",
  tools: [
    searchMarkets,
    searchNews,
    getMarketAnalytics,
    getSignalPerformance,
    findSimilarMarkets,
    getTrendingTopics,
  ],
  model: new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 }),
};
