/**
 * Market Intelligence
 * Combines news, sentiment, and market data for trading decisions
 */
import { searchNews, fetchArticle } from "./scraper.js";
import { aggregateSentiment, generateSignal } from "./sentiment.js";
import { getMarket, getOrderbook } from "../plugins/defi/tools/kalshi.js";
import { supabase, TABLES } from "../supabase/client.js";

/**
 * Generate search queries from market title
 */
export function generateSearchQueries(marketTitle) {
  // Extract key terms from market title
  const queries = [marketTitle];

  // Common patterns for prediction markets
  const patterns = [
    /will\s+(.+?)\s+(?:win|lose|pass|fail)/i,
    /(.+?)\s+(?:election|vote|poll)/i,
    /(.+?)\s+(?:price|rate|index)/i,
    /(.+?)\s+(?:before|by|in)\s+\d+/i,
  ];

  for (const pattern of patterns) {
    const match = marketTitle.match(pattern);
    if (match?.[1]) {
      queries.push(match[1].trim());
    }
  }

  // Add current events context
  const keywords = marketTitle.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  if (keywords.length > 0) {
    queries.push(keywords.join(" ") + " news");
  }

  return [...new Set(queries)].slice(0, 3);
}

/**
 * Fetch market intelligence for a specific market
 */
export async function getMarketIntelligence(ticker, options = {}) {
  const { fetchContent = true, maxArticles = 10 } = options;

  // Get market data
  const market = await getMarket(null, ticker);
  const orderbook = await getOrderbook(null, ticker);

  // Generate search queries
  const queries = generateSearchQueries(market.title);

  // Search news
  const allArticles = [];
  for (const query of queries) {
    const results = await searchNews(query, { limit: 5 });
    allArticles.push(...results.articles);
  }

  // Deduplicate by URL
  const uniqueArticles = [];
  const seen = new Set();
  for (const article of allArticles) {
    if (!seen.has(article.url)) {
      seen.add(article.url);
      uniqueArticles.push(article);
    }
  }

  // Fetch full content for top articles
  const articlesWithContent = [];
  if (fetchContent) {
    for (const article of uniqueArticles.slice(0, maxArticles)) {
      try {
        const full = await fetchArticle(article.url);
        articlesWithContent.push({ ...article, ...full });
      } catch {
        articlesWithContent.push(article);
      }
    }
  } else {
    articlesWithContent.push(...uniqueArticles.slice(0, maxArticles));
  }


  // Analyze sentiment
  const sentiment = await aggregateSentiment(articlesWithContent, {
    marketTitle: market.title,
  });

  // Generate trading signal
  const signal = generateSignal(sentiment, {
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    volume: market.volume,
    openInterest: market.openInterest,
  });

  // Calculate liquidity metrics
  const liquidity = calculateLiquidity(orderbook, market);

  const intelligence = {
    ticker,
    market: {
      title: market.title,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      openInterest: market.openInterest,
      closeTime: market.closeTime,
    },
    liquidity,
    news: {
      articleCount: articlesWithContent.length,
      queries,
      articles: articlesWithContent.map(a => ({
        title: a.title,
        source: a.source,
        url: a.url,
        publishedAt: a.publishedAt,
      })),
    },
    sentiment: {
      overall: sentiment.overallSentiment,
      confidence: sentiment.confidence,
      breakdown: sentiment.breakdown,
    },
    signal,
    generatedAt: new Date().toISOString(),
  };

  // Store intelligence
  await storeIntelligence(intelligence);

  return intelligence;
}

/**
 * Calculate liquidity metrics from orderbook
 */
function calculateLiquidity(orderbook, market) {
  const yesBids = orderbook.yes || [];
  const noBids = orderbook.no || [];

  // Calculate depth
  const yesDepth = yesBids.reduce((sum, [price, qty]) => sum + qty, 0);
  const noDepth = noBids.reduce((sum, [price, qty]) => sum + qty, 0);

  // Calculate spread
  const bestYesBid = yesBids[0]?.[0] || 0;
  const bestNoBid = noBids[0]?.[0] || 0;
  const spread = Math.abs(1 - bestYesBid - bestNoBid);

  // Liquidity score (0-1)
  const depthScore = Math.min(1, (yesDepth + noDepth) / 10000);
  const spreadScore = Math.max(0, 1 - spread * 10);
  const volumeScore = Math.min(1, (market.volume || 0) / 100000);

  const liquidityScore = (depthScore * 0.4 + spreadScore * 0.3 + volumeScore * 0.3);

  return {
    score: liquidityScore,
    yesDepth,
    noDepth,
    spread,
    rating: liquidityScore > 0.7 ? "HIGH" : liquidityScore > 0.4 ? "MEDIUM" : "LOW",
  };
}

/**
 * Store intelligence in database
 */
async function storeIntelligence(intel) {
  try {
    await supabase.from(TABLES.MARKET_INTELLIGENCE || "market_intelligence").insert({
      ticker: intel.ticker,
      market_title: intel.market.title,
      yes_price: intel.market.yesPrice,
      sentiment: intel.sentiment.overall,
      sentiment_confidence: intel.sentiment.confidence,
      liquidity_score: intel.liquidity.score,
      signal_action: intel.signal.action,
      signal_side: intel.signal.side,
      signal_strength: intel.signal.signalStrength,
      article_count: intel.news.articleCount,
      raw_data: intel,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[MarketIntel] Failed to store:", error.message);
  }
}

export default { generateSearchQueries, getMarketIntelligence, calculateLiquidity };
