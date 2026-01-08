/**
 * Elasticsearch Integration
 * Inspired by OneStop's event-driven search architecture
 * 
 * Provides full-text search, analytics, and real-time indexing
 * for prediction market data
 */

/**
 * Elasticsearch Client
 * Connects to Elasticsearch for market search and analytics
 */
export class ElasticsearchClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.ELASTICSEARCH_URL || "http://localhost:9200";
    this.username = config.username || process.env.ELASTICSEARCH_USERNAME;
    this.password = config.password || process.env.ELASTICSEARCH_PASSWORD;
    
    // Index names
    this.indices = {
      markets: "gambit-markets",
      trades: "gambit-trades",
      signals: "gambit-signals",
      news: "gambit-news",
      analytics: "gambit-analytics",
    };
  }

  /**
   * Get auth headers
   */
  getHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (this.username && this.password) {
      const auth = Buffer.from(`${this.username}:${this.password}`).toString("base64");
      headers["Authorization"] = `Basic ${auth}`;
    }
    return headers;
  }

  /**
   * Make request to Elasticsearch
   */
  async request(method, path, body = null) {
    const options = {
      method,
      headers: this.getHeaders(),
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Elasticsearch error: ${error}`);
    }

    return response.json();
  }

  /**
   * Initialize indices with mappings
   */
  async initializeIndices() {
    // Markets index
    await this.createIndexIfNotExists(this.indices.markets, {
      mappings: {
        properties: {
          ticker: { type: "keyword" },
          title: { type: "text", analyzer: "english" },
          description: { type: "text", analyzer: "english" },
          category: { type: "keyword" },
          status: { type: "keyword" },
          yesPrice: { type: "float" },
          noPrice: { type: "float" },
          volume: { type: "long" },
          openInterest: { type: "long" },
          closeTime: { type: "date" },
          createdAt: { type: "date" },
          updatedAt: { type: "date" },
          tags: { type: "keyword" },
          sentiment: { type: "keyword" },
          regime: { type: "keyword" },
        },
      },
    });

    // Trades index
    await this.createIndexIfNotExists(this.indices.trades, {
      mappings: {
        properties: {
          userId: { type: "keyword" },
          ticker: { type: "keyword" },
          side: { type: "keyword" },
          quantity: { type: "integer" },
          price: { type: "float" },
          totalCost: { type: "float" },
          fee: { type: "float" },
          status: { type: "keyword" },
          signature: { type: "keyword" },
          timestamp: { type: "date" },
          pnl: { type: "float" },
          kellyFraction: { type: "float" },
          regime: { type: "keyword" },
        },
      },
    });

    // Signals index
    await this.createIndexIfNotExists(this.indices.signals, {
      mappings: {
        properties: {
          ticker: { type: "keyword" },
          action: { type: "keyword" },
          side: { type: "keyword" },
          confidence: { type: "float" },
          sentiment: { type: "keyword" },
          sentimentScore: { type: "float" },
          liquidityScore: { type: "float" },
          newsCount: { type: "integer" },
          regime: { type: "keyword" },
          timestamp: { type: "date" },
          reasoning: { type: "text" },
        },
      },
    });

    // News index
    await this.createIndexIfNotExists(this.indices.news, {
      mappings: {
        properties: {
          url: { type: "keyword" },
          title: { type: "text", analyzer: "english" },
          content: { type: "text", analyzer: "english" },
          source: { type: "keyword" },
          publishedAt: { type: "date" },
          sentiment: { type: "keyword" },
          sentimentScore: { type: "float" },
          relatedTickers: { type: "keyword" },
          topics: { type: "keyword" },
          indexedAt: { type: "date" },
        },
      },
    });

    console.log("[Elasticsearch] Indices initialized");
  }

  /**
   * Create index if not exists
   */
  async createIndexIfNotExists(index, settings) {
    try {
      await this.request("HEAD", `/${index}`);
    } catch {
      await this.request("PUT", `/${index}`, settings);
      console.log(`[Elasticsearch] Created index: ${index}`);
    }
  }


  /**
   * Index a document
   */
  async index(indexName, id, document) {
    const path = id ? `/${indexName}/_doc/${id}` : `/${indexName}/_doc`;
    const method = id ? "PUT" : "POST";
    return this.request(method, path, document);
  }

  /**
   * Bulk index documents
   */
  async bulkIndex(indexName, documents) {
    const body = documents.flatMap(doc => [
      { index: { _index: indexName, _id: doc.id } },
      doc,
    ]);

    const ndjson = body.map(line => JSON.stringify(line)).join("\n") + "\n";
    
    const response = await fetch(`${this.baseUrl}/_bulk`, {
      method: "POST",
      headers: { ...this.getHeaders(), "Content-Type": "application/x-ndjson" },
      body: ndjson,
    });

    return response.json();
  }

  /**
   * Search documents
   */
  async search(indexName, query) {
    return this.request("POST", `/${indexName}/_search`, query);
  }

  /**
   * Full-text search markets
   */
  async searchMarkets(queryText, options = {}) {
    const { limit = 20, category, status = "active", minVolume } = options;

    const must = [
      {
        multi_match: {
          query: queryText,
          fields: ["title^3", "description", "tags^2"],
          fuzziness: "AUTO",
        },
      },
    ];

    if (status) {
      must.push({ term: { status } });
    }

    if (category) {
      must.push({ term: { category } });
    }

    if (minVolume) {
      must.push({ range: { volume: { gte: minVolume } } });
    }

    const result = await this.search(this.indices.markets, {
      size: limit,
      query: { bool: { must } },
      sort: [{ _score: "desc" }, { volume: "desc" }],
    });

    return {
      total: result.hits.total.value,
      markets: result.hits.hits.map(hit => ({
        ...hit._source,
        score: hit._score,
      })),
    };
  }

  /**
   * Search news articles
   */
  async searchNews(queryText, options = {}) {
    const { limit = 20, sentiment, daysBack = 7, tickers } = options;

    const must = [
      {
        multi_match: {
          query: queryText,
          fields: ["title^3", "content"],
          fuzziness: "AUTO",
        },
      },
      {
        range: {
          publishedAt: {
            gte: `now-${daysBack}d`,
          },
        },
      },
    ];

    if (sentiment) {
      must.push({ term: { sentiment } });
    }

    if (tickers && tickers.length > 0) {
      must.push({ terms: { relatedTickers: tickers } });
    }

    const result = await this.search(this.indices.news, {
      size: limit,
      query: { bool: { must } },
      sort: [{ publishedAt: "desc" }],
    });

    return {
      total: result.hits.total.value,
      articles: result.hits.hits.map(hit => hit._source),
    };
  }

  /**
   * Get market analytics aggregations
   */
  async getMarketAnalytics(ticker, options = {}) {
    const { daysBack = 30 } = options;

    const result = await this.search(this.indices.trades, {
      size: 0,
      query: {
        bool: {
          must: [
            { term: { ticker } },
            { range: { timestamp: { gte: `now-${daysBack}d` } } },
          ],
        },
      },
      aggs: {
        total_volume: { sum: { field: "totalCost" } },
        avg_price: { avg: { field: "price" } },
        trade_count: { value_count: { field: "signature" } },
        by_side: {
          terms: { field: "side" },
          aggs: {
            volume: { sum: { field: "totalCost" } },
            avg_price: { avg: { field: "price" } },
          },
        },
        by_regime: {
          terms: { field: "regime" },
          aggs: {
            count: { value_count: { field: "signature" } },
            avg_pnl: { avg: { field: "pnl" } },
          },
        },
        price_over_time: {
          date_histogram: {
            field: "timestamp",
            calendar_interval: "day",
          },
          aggs: {
            avg_price: { avg: { field: "price" } },
            volume: { sum: { field: "totalCost" } },
          },
        },
        pnl_stats: {
          stats: { field: "pnl" },
        },
      },
    });

    return {
      ticker,
      period: `${daysBack} days`,
      totalVolume: result.aggregations.total_volume.value,
      avgPrice: result.aggregations.avg_price.value,
      tradeCount: result.aggregations.trade_count.value,
      bySide: result.aggregations.by_side.buckets,
      byRegime: result.aggregations.by_regime.buckets,
      priceHistory: result.aggregations.price_over_time.buckets,
      pnlStats: result.aggregations.pnl_stats,
    };
  }

  /**
   * Get signal performance analytics
   */
  async getSignalPerformance(options = {}) {
    const { daysBack = 30 } = options;

    const result = await this.search(this.indices.signals, {
      size: 0,
      query: {
        range: { timestamp: { gte: `now-${daysBack}d` } },
      },
      aggs: {
        by_action: {
          terms: { field: "action" },
          aggs: {
            avg_confidence: { avg: { field: "confidence" } },
            count: { value_count: { field: "ticker" } },
          },
        },
        by_sentiment: {
          terms: { field: "sentiment" },
          aggs: {
            count: { value_count: { field: "ticker" } },
            avg_confidence: { avg: { field: "confidence" } },
          },
        },
        by_regime: {
          terms: { field: "regime" },
          aggs: {
            count: { value_count: { field: "ticker" } },
          },
        },
        confidence_distribution: {
          histogram: {
            field: "confidence",
            interval: 0.1,
          },
        },
      },
    });

    return {
      period: `${daysBack} days`,
      byAction: result.aggregations.by_action.buckets,
      bySentiment: result.aggregations.by_sentiment.buckets,
      byRegime: result.aggregations.by_regime.buckets,
      confidenceDistribution: result.aggregations.confidence_distribution.buckets,
    };
  }


  /**
   * Index market data
   */
  async indexMarket(market) {
    return this.index(this.indices.markets, market.ticker, {
      ...market,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Index trade
   */
  async indexTrade(trade) {
    return this.index(this.indices.trades, trade.signature, {
      ...trade,
      timestamp: trade.timestamp || new Date().toISOString(),
    });
  }

  /**
   * Index signal
   */
  async indexSignal(signal) {
    return this.index(this.indices.signals, null, {
      ...signal,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Index news article
   */
  async indexNews(article) {
    // Generate ID from URL hash
    const id = Buffer.from(article.url).toString("base64").slice(0, 20);
    return this.index(this.indices.news, id, {
      ...article,
      indexedAt: new Date().toISOString(),
    });
  }

  /**
   * Find similar markets
   */
  async findSimilarMarkets(ticker, options = {}) {
    const { limit = 5 } = options;

    // Get the source market
    const market = await this.request("GET", `/${this.indices.markets}/_doc/${ticker}`);
    
    if (!market.found) {
      throw new Error(`Market ${ticker} not found`);
    }

    // More Like This query
    const result = await this.search(this.indices.markets, {
      size: limit,
      query: {
        more_like_this: {
          fields: ["title", "description", "tags"],
          like: [{ _index: this.indices.markets, _id: ticker }],
          min_term_freq: 1,
          min_doc_freq: 1,
        },
      },
    });

    return {
      source: market._source,
      similar: result.hits.hits.map(hit => ({
        ...hit._source,
        score: hit._score,
      })),
    };
  }

  /**
   * Get trending topics from news
   */
  async getTrendingTopics(options = {}) {
    const { daysBack = 7, limit = 20 } = options;

    const result = await this.search(this.indices.news, {
      size: 0,
      query: {
        range: { publishedAt: { gte: `now-${daysBack}d` } },
      },
      aggs: {
        topics: {
          terms: {
            field: "topics",
            size: limit,
          },
        },
        sources: {
          terms: {
            field: "source",
            size: 10,
          },
        },
        sentiment_trend: {
          date_histogram: {
            field: "publishedAt",
            calendar_interval: "day",
          },
          aggs: {
            sentiment: {
              terms: { field: "sentiment" },
            },
          },
        },
      },
    });

    return {
      topics: result.aggregations.topics.buckets,
      sources: result.aggregations.sources.buckets,
      sentimentTrend: result.aggregations.sentiment_trend.buckets,
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const health = await this.request("GET", "/_cluster/health");
      return {
        status: health.status,
        clusterName: health.cluster_name,
        numberOfNodes: health.number_of_nodes,
        activeShards: health.active_shards,
      };
    } catch (error) {
      return { status: "unavailable", error: error.message };
    }
  }
}

// Singleton instance
let instance = null;

export function getElasticsearchClient(config = {}) {
  if (!instance) {
    instance = new ElasticsearchClient(config);
  }
  return instance;
}

export default { ElasticsearchClient, getElasticsearchClient };
