/**
 * LangGraph Workflows for Intelligence
 * Agent workflows for scraping and analysis
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { scrapeUrl, scrapeUrls, extractNewsArticle } from "./firecrawl.js";
import { searchNews } from "./scraper.js";
import { getMultiLLM } from "../llm/index.js";
import { getMarket, getOrderbook } from "../plugins/defi/tools/kalshi.js";

// ============================================
// NEWS ANALYSIS WORKFLOW
// ============================================

const NewsAnalysisState = Annotation.Root({
  query: Annotation,
  urls: Annotation,
  articles: Annotation,
  sentiment: Annotation,
  summary: Annotation,
});

async function searchNewsNode(state) {
  console.log("[Workflow] Searching news for:", state.query);
  
  const results = await searchNews(state.query, { limit: 10 });
  const urls = results.articles.map(a => a.url).slice(0, 5);
  
  return { urls };
}

async function scrapeArticlesNode(state) {
  console.log("[Workflow] Scraping", state.urls.length, "articles");
  
  const articles = [];
  for (const url of state.urls) {
    try {
      const article = await extractNewsArticle(url);
      articles.push(article);
    } catch (error) {
      console.warn(`[Workflow] Failed to scrape ${url}:`, error.message);
    }
  }
  
  return { articles };
}

async function analyzeArticlesNode(state) {
  console.log("[Workflow] Analyzing", state.articles.length, "articles");
  
  const llm = getMultiLLM();
  
  // Aggregate sentiment
  const sentiments = state.articles
    .filter(a => a.data?.sentiment)
    .map(a => a.data.sentiment);
  
  const sentimentCounts = {
    positive: sentiments.filter(s => s === "positive").length,
    negative: sentiments.filter(s => s === "negative").length,
    neutral: sentiments.filter(s => s === "neutral").length,
  };
  
  const dominant = Object.entries(sentimentCounts)
    .sort((a, b) => b[1] - a[1])[0][0];
  
  // Generate summary
  const articlesText = state.articles
    .map(a => `Title: ${a.data?.title}\nSummary: ${a.data?.summary || a.data?.mainContent?.slice(0, 500)}`)
    .join("\n\n");
  
  const summaryResult = await llm.complete(
    `Summarize these news articles about "${state.query}":\n\n${articlesText}\n\nProvide a concise summary of the key points and overall sentiment.`,
    { task: "analysis" }
  );
  
  return {
    sentiment: {
      dominant,
      counts: sentimentCounts,
      confidence: sentimentCounts[dominant] / sentiments.length,
    },
    summary: summaryResult.content,
  };
}


/**
 * Build news analysis workflow
 */
export function buildNewsAnalysisWorkflow() {
  const workflow = new StateGraph(NewsAnalysisState)
    .addNode("search", searchNewsNode)
    .addNode("scrape", scrapeArticlesNode)
    .addNode("analyze", analyzeArticlesNode)
    .addEdge(START, "search")
    .addEdge("search", "scrape")
    .addEdge("scrape", "analyze")
    .addEdge("analyze", END);

  return workflow.compile();
}

/**
 * Run news analysis workflow
 */
export async function analyzeNewsWorkflow(query) {
  const workflow = buildNewsAnalysisWorkflow();
  
  const result = await workflow.invoke({
    query,
    urls: [],
    articles: [],
    sentiment: null,
    summary: "",
  });

  return {
    query,
    articleCount: result.articles.length,
    sentiment: result.sentiment,
    summary: result.summary,
    articles: result.articles.map(a => ({
      url: a.url,
      title: a.data?.title,
      sentiment: a.data?.sentiment,
    })),
  };
}

// ============================================
// MARKET INTELLIGENCE WORKFLOW
// ============================================

const MarketIntelState = Annotation.Root({
  ticker: Annotation,
  market: Annotation,
  orderbook: Annotation,
  newsQuery: Annotation,
  news: Annotation,
  analysis: Annotation,
  signal: Annotation,
});

async function fetchMarketNode(state) {
  console.log("[Workflow] Fetching market:", state.ticker);
  
  const market = await getMarket(null, state.ticker);
  const orderbook = await getOrderbook(null, state.ticker);
  
  // Generate news query from market title
  const newsQuery = market.title;
  
  return { market, orderbook, newsQuery };
}

async function fetchNewsNode(state) {
  console.log("[Workflow] Fetching news for:", state.newsQuery);
  
  const newsResults = await searchNews(state.newsQuery, { limit: 5 });
  
  // Scrape top articles
  const articles = [];
  for (const article of newsResults.articles.slice(0, 3)) {
    try {
      const scraped = await scrapeUrl(article.url);
      articles.push({
        ...article,
        content: scraped.markdown?.slice(0, 2000),
      });
    } catch {
      articles.push(article);
    }
  }
  
  return { news: { articles, query: state.newsQuery } };
}

async function analyzeMarketNode(state) {
  console.log("[Workflow] Analyzing market intelligence");
  
  const llm = getMultiLLM();
  
  const prompt = `Analyze this prediction market and provide a trading recommendation.

Market: ${state.market.title}
Current YES Price: ${state.market.yesPrice}
Current NO Price: ${state.market.noPrice}
Volume: ${state.market.volume}
Close Time: ${state.market.closeTime}

Recent News:
${state.news.articles.map(a => `- ${a.title}`).join("\n")}

Provide analysis in JSON format:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 0.0-1.0,
  "signal": "BUY_YES" | "BUY_NO" | "HOLD",
  "reasoning": "explanation",
  "keyFactors": ["factor1", "factor2"]
}`;

  const result = await llm.reason(prompt);
  
  let analysis;
  try {
    const content = result.content.replace(/```json\n?|\n?```/g, "").trim();
    analysis = JSON.parse(content);
  } catch {
    analysis = {
      sentiment: "NEUTRAL",
      confidence: 0.5,
      signal: "HOLD",
      reasoning: result.content,
      keyFactors: [],
    };
  }
  
  return { analysis };
}


async function generateSignalNode(state) {
  console.log("[Workflow] Generating trading signal");
  
  const { analysis, market, orderbook } = state;
  
  // Calculate liquidity score
  const yesDepth = (orderbook.yes || []).reduce((sum, [_, qty]) => sum + qty, 0);
  const noDepth = (orderbook.no || []).reduce((sum, [_, qty]) => sum + qty, 0);
  const liquidityScore = Math.min(1, (yesDepth + noDepth) / 10000);
  
  // Combine analysis with liquidity
  const adjustedConfidence = analysis.confidence * (0.5 + liquidityScore * 0.5);
  
  let signal = {
    action: "HOLD",
    side: null,
    confidence: adjustedConfidence,
    price: null,
  };
  
  if (adjustedConfidence > 0.6) {
    if (analysis.signal === "BUY_YES") {
      signal = {
        action: "BUY",
        side: "yes",
        confidence: adjustedConfidence,
        price: market.yesPrice,
      };
    } else if (analysis.signal === "BUY_NO") {
      signal = {
        action: "BUY",
        side: "no",
        confidence: adjustedConfidence,
        price: market.noPrice,
      };
    }
  }
  
  return {
    signal: {
      ...signal,
      reasoning: analysis.reasoning,
      keyFactors: analysis.keyFactors,
      liquidity: liquidityScore,
    },
  };
}

/**
 * Build market intelligence workflow
 */
export function buildMarketIntelWorkflow() {
  const workflow = new StateGraph(MarketIntelState)
    .addNode("fetchMarket", fetchMarketNode)
    .addNode("fetchNews", fetchNewsNode)
    .addNode("analyze", analyzeMarketNode)
    .addNode("generateSignal", generateSignalNode)
    .addEdge(START, "fetchMarket")
    .addEdge("fetchMarket", "fetchNews")
    .addEdge("fetchNews", "analyze")
    .addEdge("analyze", "generateSignal")
    .addEdge("generateSignal", END);

  return workflow.compile();
}

/**
 * Run market intelligence workflow
 */
export async function analyzeMarketWorkflow(ticker) {
  const workflow = buildMarketIntelWorkflow();
  
  const result = await workflow.invoke({
    ticker,
    market: null,
    orderbook: null,
    newsQuery: "",
    news: null,
    analysis: null,
    signal: null,
  });

  return {
    ticker,
    market: {
      title: result.market.title,
      yesPrice: result.market.yesPrice,
      noPrice: result.market.noPrice,
      volume: result.market.volume,
    },
    newsCount: result.news.articles.length,
    analysis: result.analysis,
    signal: result.signal,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================
// MULTI-MARKET SCAN WORKFLOW
// ============================================

/**
 * Scan multiple markets and rank opportunities
 */
export async function scanMarketsWorkflow(tickers) {
  console.log("[Workflow] Scanning", tickers.length, "markets");
  
  const results = [];
  
  for (const ticker of tickers) {
    try {
      const intel = await analyzeMarketWorkflow(ticker);
      results.push(intel);
    } catch (error) {
      console.warn(`[Workflow] Failed to analyze ${ticker}:`, error.message);
    }
  }
  
  // Rank by signal confidence
  results.sort((a, b) => {
    if (a.signal.action === "HOLD" && b.signal.action !== "HOLD") return 1;
    if (a.signal.action !== "HOLD" && b.signal.action === "HOLD") return -1;
    return b.signal.confidence - a.signal.confidence;
  });
  
  return {
    scanned: results.length,
    opportunities: results.filter(r => r.signal.action !== "HOLD"),
    all: results,
    topPick: results[0],
  };
}

export default {
  buildNewsAnalysisWorkflow,
  analyzeNewsWorkflow,
  buildMarketIntelWorkflow,
  analyzeMarketWorkflow,
  scanMarketsWorkflow,
};
