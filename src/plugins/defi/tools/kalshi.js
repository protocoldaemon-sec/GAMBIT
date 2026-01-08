/**
 * Kalshi Tools
 * Prediction market operations via official Kalshi TypeScript SDK
 * 
 * Features:
 * - Sub-penny pricing support (prices in cents with 4 decimal precision)
 * - Comprehensive error handling with retry strategies
 * - Exchange status awareness
 */
import {
  Configuration,
  MarketsApi,
  EventsApi,
  SeriesApi,
  PortfolioApi,
  ExchangeApi,
} from "kalshi-typescript";

// ============================================
// ERROR CODES & HANDLING
// ============================================

/**
 * Kalshi API Error Codes
 */
export const KalshiErrorCodes = {
  // Order Reject Reasons (103)
  UNKNOWN_SYMBOL: 1,
  EXCHANGE_CLOSED: 2,
  ORDER_EXCEEDS_LIMIT: 3,
  TOO_LATE_TO_ENTER: 4,
  DUPLICATE_ORDER: 6,
  UNSUPPORTED_ORDER_CHARACTERISTIC: 11,
  OTHER: 99,
  
  // Cancel Reject Reasons (102)
  TOO_LATE_TO_CANCEL: 0,
  UNKNOWN_ORDER: 1,
  
  // Business Reject Reasons (380)
  BUSINESS_OTHER: 0,
  UNKNOWN_ID: 1,
  UNKNOWN_SECURITY: 2,
  UNSUPPORTED_MESSAGE_TYPE: 3,
  APPLICATION_NOT_AVAILABLE: 4,
  CONDITIONALLY_REQUIRED_FIELD_MISSING: 5,
};

/**
 * Retry strategies based on error type
 */
const RetryStrategies = {
  SESSION_ERROR: { retry: false, action: "Fix protocol issue before retry" },
  RATE_LIMIT: { retry: true, backoff: "exponential", maxRetries: 5 },
  EXCHANGE_CLOSED: { retry: false, action: "Wait for market open" },
  INSUFFICIENT_FUNDS: { retry: false, action: "Check balance before retry" },
  UNKNOWN_SYMBOL: { retry: false, action: "Verify symbol, don't retry" },
  NETWORK_ERROR: { retry: true, backoff: "exponential", maxRetries: 3 },
};

/**
 * Custom Kalshi Error class
 */
export class KalshiError extends Error {
  constructor(message, code, retryable = false, details = {}) {
    super(message);
    this.name = "KalshiError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Parse and handle Kalshi API errors
 */
function handleApiError(error) {
  const status = error.response?.status;
  const data = error.response?.data;
  
  // Rate limiting
  if (status === 429) {
    throw new KalshiError(
      "Rate limit exceeded",
      "RATE_LIMIT",
      true,
      { retryAfter: error.response?.headers?.["retry-after"] }
    );
  }
  
  // Exchange closed
  if (status === 503 || data?.code === KalshiErrorCodes.EXCHANGE_CLOSED) {
    throw new KalshiError(
      "Exchange is closed or under maintenance",
      "EXCHANGE_CLOSED",
      false,
      { estimatedResume: data?.exchange_estimated_resume_time }
    );
  }
  
  // Authentication errors
  if (status === 401 || status === 403) {
    throw new KalshiError(
      "Authentication failed - check API key and signature",
      "AUTH_ERROR",
      false
    );
  }
  
  // Unknown symbol
  if (data?.code === KalshiErrorCodes.UNKNOWN_SYMBOL) {
    throw new KalshiError(
      `Unknown market symbol: ${data?.symbol || "unknown"}`,
      "UNKNOWN_SYMBOL",
      false
    );
  }
  
  // Order exceeds limit
  if (data?.code === KalshiErrorCodes.ORDER_EXCEEDS_LIMIT) {
    throw new KalshiError(
      "Order exceeds position or size limit",
      "ORDER_EXCEEDS_LIMIT",
      false,
      { limit: data?.limit }
    );
  }
  
  // Generic error
  throw new KalshiError(
    data?.message || error.message || "Unknown Kalshi API error",
    data?.code || "UNKNOWN",
    false,
    data
  );
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry non-retryable errors
      if (error instanceof KalshiError && !error.retryable) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// ============================================
// SUB-PENNY PRICING UTILITIES
// ============================================

/**
 * Convert cents to dollars with sub-penny precision
 * Kalshi uses 4 decimal places for sub-penny pricing
 * Example: 123 (in API) = 0.0123 dollars = 1.23 cents
 */
export function centsToSubpenny(cents) {
  if (cents === null || cents === undefined) return null;
  // API returns price * 10000 for sub-penny precision
  return cents / 10000;
}

/**
 * Convert dollars to cents for API calls
 * Example: 0.0123 dollars = 123 (API format)
 */
export function dollarsToCents(dollars) {
  if (dollars === null || dollars === undefined) return null;
  return Math.round(dollars * 10000);
}

/**
 * Convert standard cents (1-99) to dollars
 * For markets without sub-penny pricing
 */
export function standardCentsToDollars(cents) {
  if (cents === null || cents === undefined) return null;
  return cents / 100;
}

/**
 * Format price for display
 * @param {number} price - Price in dollars
 * @param {boolean} subpenny - Whether to show sub-penny precision
 */
export function formatPrice(price, subpenny = false) {
  if (price === null || price === undefined) return "N/A";
  if (subpenny) {
    return `$${price.toFixed(4)}`;
  }
  return `$${price.toFixed(2)}`;
}

// ============================================
// CONFIGURATION
// ============================================

// Initialize configuration
function getConfig() {
  const apiKey = process.env.KALSHI_API_KEY;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;
  
  if (!apiKey || !privateKey) {
    throw new KalshiError(
      "KALSHI_API_KEY and KALSHI_PRIVATE_KEY are required",
      "CONFIG_ERROR",
      false
    );
  }

  return new Configuration({
    apiKey,
    privateKeyPem: privateKey,
    basePath: process.env.KALSHI_API_URL || "https://api.elections.kalshi.com/trade-api/v2",
  });
}

// Lazy-loaded API instances
let marketsApi = null;
let eventsApi = null;
let seriesApi = null;
let portfolioApi = null;
let exchangeApi = null;

function getMarketsApi() {
  if (!marketsApi) marketsApi = new MarketsApi(getConfig());
  return marketsApi;
}

function getEventsApi() {
  if (!eventsApi) eventsApi = new EventsApi(getConfig());
  return eventsApi;
}

function getSeriesApi() {
  if (!seriesApi) seriesApi = new SeriesApi(getConfig());
  return seriesApi;
}

function getPortfolioApi() {
  if (!portfolioApi) portfolioApi = new PortfolioApi(getConfig());
  return portfolioApi;
}

function getExchangeApi() {
  if (!exchangeApi) exchangeApi = new ExchangeApi(getConfig());
  return exchangeApi;
}

/**
 * Reset API instances (useful for testing or config changes)
 */
export function resetApiInstances() {
  marketsApi = null;
  eventsApi = null;
  seriesApi = null;
  portfolioApi = null;
  exchangeApi = null;
}

// ============================================
// MARKETS API
// ============================================

/**
 * Get available markets
 */
export async function getMarkets(_ctx, options = {}) {
  const { 
    limit = 100, 
    cursor, 
    eventTicker, 
    seriesTicker, 
    status,
    tickers,
    minCloseTs,
    maxCloseTs,
  } = options;

  return withRetry(async () => {
    try {
      const { data } = await getMarketsApi().getMarkets(
        limit,
        cursor,
        eventTicker,
        seriesTicker,
        maxCloseTs,
        minCloseTs,
        status,
        tickers
      );

      return {
        markets: data.markets?.map(formatMarket) || [],
        cursor: data.cursor,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get single market by ticker
 */
export async function getMarket(_ctx, ticker) {
  return withRetry(async () => {
    try {
      const { data } = await getMarketsApi().getMarket(ticker);
      return formatMarket(data.market);
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get market orderbook
 */
export async function getOrderbook(_ctx, ticker, depth = 10) {
  return withRetry(async () => {
    try {
      const { data } = await getMarketsApi().getMarketOrderbook(ticker, depth);
      
      return {
        ticker,
        yes: data.orderbook?.yes?.map(([price, quantity]) => ({
          price: standardCentsToDollars(price),
          priceCents: price,
          quantity,
        })) || [],
        no: data.orderbook?.no?.map(([price, quantity]) => ({
          price: standardCentsToDollars(price),
          priceCents: price,
          quantity,
        })) || [],
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get market trades history
 */
export async function getMarketHistory(_ctx, ticker, options = {}) {
  const { limit = 100, cursor, minTs, maxTs } = options;

  return withRetry(async () => {
    try {
      const { data } = await getMarketsApi().getTrades(
        limit,
        cursor,
        ticker,
        minTs,
        maxTs
      );

      return {
        ticker,
        trades: data.trades?.map(t => ({
          tradeId: t.trade_id,
          ticker: t.ticker,
          yesPrice: standardCentsToDollars(t.yes_price),
          noPrice: standardCentsToDollars(t.no_price),
          yesPriceCents: t.yes_price,
          noPriceCents: t.no_price,
          count: t.count,
          takerSide: t.taker_side,
          createdTime: t.created_time,
        })) || [],
        cursor: data.cursor,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get market candlesticks
 */
export async function getCandlesticks(_ctx, seriesTicker, marketTicker, options = {}) {
  const { startTs, endTs, periodInterval = "1h" } = options;

  return withRetry(async () => {
    try {
      const { data } = await getMarketsApi().getMarketCandlesticks(
        seriesTicker,
        marketTicker,
        startTs,
        endTs,
        periodInterval
      );

      return {
        ticker: marketTicker,
        candlesticks: data.candlesticks?.map(c => ({
          timestamp: c.end_period_ts,
          open: standardCentsToDollars(c.open),
          high: standardCentsToDollars(c.high),
          low: standardCentsToDollars(c.low),
          close: standardCentsToDollars(c.close),
          openCents: c.open,
          highCents: c.high,
          lowCents: c.low,
          closeCents: c.close,
          volume: c.volume,
        })) || [],
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}


// ============================================
// EVENTS API
// ============================================

/**
 * Get events
 */
export async function getEvents(_ctx, options = {}) {
  const { 
    limit = 100, 
    cursor, 
    withNestedMarkets = false,
    status,
    seriesTicker,
    minCloseTs,
  } = options;

  return withRetry(async () => {
    try {
      const { data } = await getEventsApi().getEvents(
        limit,
        cursor,
        withNestedMarkets,
        status,
        seriesTicker,
        minCloseTs
      );

      return {
        events: data.events?.map(e => ({
          eventTicker: e.event_ticker,
          seriesTicker: e.series_ticker,
          title: e.title,
          subtitle: e.subtitle,
          category: e.category,
          mutuallyExclusive: e.mutually_exclusive,
          strikeDate: e.strike_date,
          markets: e.markets?.map(formatMarket),
        })) || [],
        cursor: data.cursor,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get single event
 */
export async function getEvent(_ctx, eventTicker, withNestedMarkets = true) {
  return withRetry(async () => {
    try {
      const { data } = await getEventsApi().getEvent(eventTicker, withNestedMarkets);
      
      return {
        eventTicker: data.event?.event_ticker,
        seriesTicker: data.event?.series_ticker,
        title: data.event?.title,
        subtitle: data.event?.subtitle,
        category: data.event?.category,
        mutuallyExclusive: data.event?.mutually_exclusive,
        markets: data.event?.markets?.map(formatMarket) || data.markets?.map(formatMarket),
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get event metadata
 */
export async function getEventMetadata(_ctx, eventTicker) {
  return withRetry(async () => {
    try {
      const { data } = await getEventsApi().getEventMetadata(eventTicker);
      return data;
    } catch (error) {
      handleApiError(error);
    }
  });
}

// ============================================
// SERIES API
// ============================================

/**
 * Get series
 */
export async function getSeries(_ctx, options = {}) {
  const { limit = 100, cursor } = options;

  return withRetry(async () => {
    try {
      const { data } = await getSeriesApi().getSeries(limit, cursor);

      return {
        series: data.series?.map(s => ({
          seriesTicker: s.ticker,
          title: s.title,
          category: s.category,
          frequency: s.frequency,
          tags: s.tags,
        })) || [],
        cursor: data.cursor,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get single series
 */
export async function getSeriesDetail(_ctx, seriesTicker) {
  return withRetry(async () => {
    try {
      const { data } = await getSeriesApi().getSeries(1, undefined);
      // Filter for specific series
      const series = data.series?.find(s => s.ticker === seriesTicker);
      return series ? {
        seriesTicker: series.ticker,
        title: series.title,
        category: series.category,
        frequency: series.frequency,
        tags: series.tags,
      } : null;
    } catch (error) {
      handleApiError(error);
    }
  });
}

// ============================================
// PORTFOLIO API (Authenticated)
// ============================================

/**
 * Get user balance
 */
export async function getBalance(_ctx) {
  return withRetry(async () => {
    try {
      const { data } = await getPortfolioApi().getBalance();
      
      return {
        balance: standardCentsToDollars(data.balance),
        balanceCents: data.balance,
        portfolioValue: standardCentsToDollars(data.portfolio_value),
        portfolioValueCents: data.portfolio_value,
        payoutValue: standardCentsToDollars(data.payout_value),
        payoutValueCents: data.payout_value,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get user positions
 */
export async function getPositions(_ctx, options = {}) {
  const { limit = 100, cursor, ticker, eventTicker, countFilter } = options;

  return withRetry(async () => {
    try {
      const { data } = await getPortfolioApi().getPositions(
        cursor,
        limit,
        countFilter,
        ticker,
        eventTicker
      );

      return {
        positions: data.market_positions?.map(p => ({
          ticker: p.ticker,
          eventTicker: p.event_ticker,
          position: p.position,
          totalTraded: p.total_traded,
          realizedPnl: standardCentsToDollars(p.realized_pnl),
          realizedPnlCents: p.realized_pnl,
          feesPaid: standardCentsToDollars(p.fees_paid),
          feesPaidCents: p.fees_paid,
          restingOrdersCount: p.resting_orders_count,
        })) || [],
        eventPositions: data.event_positions,
        cursor: data.cursor,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get user fills (executed trades)
 */
export async function getFills(_ctx, options = {}) {
  const { limit = 100, cursor, ticker, orderId, minTs, maxTs } = options;

  return withRetry(async () => {
    try {
      const { data } = await getPortfolioApi().getFills(
        ticker,
        orderId,
        minTs,
        maxTs,
        limit,
        cursor
      );

      return {
        fills: data.fills?.map(f => ({
          tradeId: f.trade_id,
          orderId: f.order_id,
          ticker: f.ticker,
          side: f.side,
          action: f.action,
          count: f.count,
          yesPrice: standardCentsToDollars(f.yes_price),
          noPrice: standardCentsToDollars(f.no_price),
          yesPriceCents: f.yes_price,
          noPriceCents: f.no_price,
          isTaker: f.is_taker,
          createdTime: f.created_time,
        })) || [],
        cursor: data.cursor,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get user settlements
 */
export async function getSettlements(_ctx, options = {}) {
  const { limit = 100, cursor, ticker, eventTicker, minTs, maxTs } = options;

  return withRetry(async () => {
    try {
      const { data } = await getPortfolioApi().getSettlements(
        limit,
        cursor,
        ticker,
        eventTicker,
        minTs,
        maxTs
      );

      return {
        settlements: data.settlements?.map(s => ({
          ticker: s.ticker,
          eventTicker: s.event_ticker,
          noTotalCost: standardCentsToDollars(s.no_total_cost),
          noTotalCostCents: s.no_total_cost,
          yesTotalCost: standardCentsToDollars(s.yes_total_cost),
          yesTotalCostCents: s.yes_total_cost,
          revenue: standardCentsToDollars(s.revenue),
          revenueCents: s.revenue,
          settledTime: s.settled_time,
          marketResult: s.market_result,
        })) || [],
        cursor: data.cursor,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}


// ============================================
// EXCHANGE API
// ============================================

/**
 * Get exchange status
 * Check this before trading to ensure exchange is active
 */
export async function getExchangeStatus(_ctx) {
  return withRetry(async () => {
    try {
      const { data } = await getExchangeApi().getExchangeStatus();
      return {
        tradingActive: data.trading_active,
        exchangeActive: data.exchange_active,
        estimatedResumeTime: data.exchange_estimated_resume_time,
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Check if trading is currently allowed
 * Throws KalshiError if exchange is closed
 */
export async function ensureTradingActive(_ctx) {
  const status = await getExchangeStatus(_ctx);
  
  if (!status.exchangeActive) {
    throw new KalshiError(
      "Exchange is under maintenance",
      "EXCHANGE_CLOSED",
      false,
      { estimatedResume: status.estimatedResumeTime }
    );
  }
  
  if (!status.tradingActive) {
    throw new KalshiError(
      "Trading is currently closed (outside trading hours)",
      "TRADING_CLOSED",
      false,
      { estimatedResume: status.estimatedResumeTime }
    );
  }
  
  return status;
}

/**
 * Get exchange schedule
 */
export async function getExchangeSchedule(_ctx) {
  return withRetry(async () => {
    try {
      const { data } = await getExchangeApi().getExchangeSchedule();
      return data.schedule;
    } catch (error) {
      handleApiError(error);
    }
  });
}

/**
 * Get exchange announcements
 */
export async function getExchangeAnnouncements(_ctx) {
  return withRetry(async () => {
    try {
      const { data } = await getExchangeApi().getExchangeAnnouncements();
      return {
        announcements: data.announcements?.map(a => ({
          title: a.title,
          message: a.message,
          type: a.type,
          createdTime: a.created_time,
        })) || [],
      };
    } catch (error) {
      handleApiError(error);
    }
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format market response with both dollar and cent values
 */
function formatMarket(m) {
  if (!m) return null;
  
  return {
    ticker: m.ticker,
    eventTicker: m.event_ticker,
    seriesTicker: m.series_ticker,
    title: m.title,
    subtitle: m.subtitle,
    status: m.status,
    // Prices in dollars (API returns cents)
    yesPrice: standardCentsToDollars(m.yes_bid),
    noPrice: standardCentsToDollars(m.no_bid),
    yesBid: standardCentsToDollars(m.yes_bid),
    yesAsk: standardCentsToDollars(m.yes_ask),
    noBid: standardCentsToDollars(m.no_bid),
    noAsk: standardCentsToDollars(m.no_ask),
    lastPrice: standardCentsToDollars(m.last_price),
    previousYesPrice: standardCentsToDollars(m.previous_yes_bid),
    previousPrice: standardCentsToDollars(m.previous_price),
    // Raw cents values for precision
    yesBidCents: m.yes_bid,
    yesAskCents: m.yes_ask,
    noBidCents: m.no_bid,
    noAskCents: m.no_ask,
    lastPriceCents: m.last_price,
    // Volume and interest
    volume: m.volume,
    volume24h: m.volume_24h,
    openInterest: m.open_interest,
    liquidity: m.liquidity,
    // Timestamps
    closeTime: m.close_time,
    expirationTime: m.expiration_time,
    latestExpirationTime: m.latest_expiration_time,
    // Settlement
    result: m.result,
    settlementValue: standardCentsToDollars(m.settlement_value),
    settlementValueCents: m.settlement_value,
    // Market structure
    category: m.category,
    riskLimitCents: m.risk_limit_cents,
    riskLimit: standardCentsToDollars(m.risk_limit_cents),
    strikeType: m.strike_type,
    floorStrike: m.floor_strike,
    capStrike: m.cap_strike,
    // Tick size for sub-penny markets
    tickSize: m.tick_size,
    minTickSizeCents: m.min_tick_size,
    // Rules
    rules: m.rules_primary,
    // Fees
    feeWaiverExpirationTime: m.fee_waiver_expiration_time,
    // Flags
    canCloseEarly: m.can_close_early,
    expirationValue: m.expiration_value,
  };
}

/**
 * Search markets by query
 */
export async function searchMarkets(_ctx, query, options = {}) {
  const { limit = 50, status = "open" } = options;
  
  // Get all markets and filter client-side
  // (Kalshi API doesn't have full-text search)
  const { markets } = await getMarkets(_ctx, { limit: 1000, status });
  
  const queryLower = query.toLowerCase();
  const filtered = markets.filter(m => 
    m.title?.toLowerCase().includes(queryLower) ||
    m.subtitle?.toLowerCase().includes(queryLower) ||
    m.ticker?.toLowerCase().includes(queryLower)
  );

  return {
    query,
    total: filtered.length,
    markets: filtered.slice(0, limit),
  };
}

/**
 * Get market with full context (event + series)
 */
export async function getMarketWithContext(_ctx, ticker) {
  const market = await getMarket(_ctx, ticker);
  
  let event = null;

  if (market.eventTicker) {
    try {
      event = await getEvent(_ctx, market.eventTicker, false);
    } catch (e) {
      // Event might not exist
    }
  }

  return {
    market,
    event,
  };
}

/**
 * Validate price is within valid range (0-100 cents)
 */
export function validatePrice(priceCents) {
  if (priceCents < 1 || priceCents > 99) {
    throw new KalshiError(
      `Invalid price: ${priceCents} cents. Must be between 1-99 cents.`,
      "INVALID_PRICE",
      false
    );
  }
  return true;
}

/**
 * Validate order quantity
 */
export function validateQuantity(quantity, maxQuantity = 100000) {
  if (quantity < 1) {
    throw new KalshiError(
      "Quantity must be at least 1",
      "INVALID_QUANTITY",
      false
    );
  }
  if (quantity > maxQuantity) {
    throw new KalshiError(
      `Quantity ${quantity} exceeds maximum ${maxQuantity}`,
      "ORDER_EXCEEDS_LIMIT",
      false
    );
  }
  return true;
}

// Export all functions
export default {
  // Error handling
  KalshiError,
  KalshiErrorCodes,
  // Pricing utilities
  centsToSubpenny,
  dollarsToCents,
  standardCentsToDollars,
  formatPrice,
  validatePrice,
  validateQuantity,
  // Configuration
  resetApiInstances,
  // Markets
  getMarkets,
  getMarket,
  getOrderbook,
  getMarketHistory,
  getCandlesticks,
  searchMarkets,
  getMarketWithContext,
  // Events
  getEvents,
  getEvent,
  getEventMetadata,
  // Series
  getSeries,
  getSeriesDetail,
  // Portfolio
  getBalance,
  getPositions,
  getFills,
  getSettlements,
  // Exchange
  getExchangeStatus,
  ensureTradingActive,
  getExchangeSchedule,
  getExchangeAnnouncements,
};
