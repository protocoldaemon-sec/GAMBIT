/**
 * Kalshi Tools
 * Prediction market operations via Kalshi API
 */

const KALSHI_API = process.env.KALSHI_API_URL || "https://api.kalshi.com/trade-api/v2";

/**
 * Get available markets
 */
export async function getMarkets(ctx, options = {}) {
  const { limit = 50, status = "open", cursor } = options;

  const url = new URL(`${KALSHI_API}/markets`);
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set("status", status);
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    markets: data.markets?.map((m) => ({
      ticker: m.ticker,
      title: m.title,
      subtitle: m.subtitle,
      status: m.status,
      yesPrice: m.yes_bid,
      noPrice: m.no_bid,
      volume: m.volume,
      openInterest: m.open_interest,
      closeTime: m.close_time,
    })),
    cursor: data.cursor,
  };
}

/**
 * Get market details
 */
export async function getMarket(ctx, ticker) {
  const response = await fetch(`${KALSHI_API}/markets/${ticker}`, {
    headers: {
      Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error: ${response.status}`);
  }

  const data = await response.json();
  const m = data.market;

  return {
    ticker: m.ticker,
    title: m.title,
    subtitle: m.subtitle,
    status: m.status,
    yesPrice: m.yes_bid,
    noPrice: m.no_bid,
    volume: m.volume,
    openInterest: m.open_interest,
    closeTime: m.close_time,
    result: m.result,
    category: m.category,
    rules: m.rules_primary,
  };
}

/**
 * Get orderbook for a market
 */
export async function getOrderbook(ctx, ticker) {
  const response = await fetch(`${KALSHI_API}/markets/${ticker}/orderbook`, {
    headers: {
      Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    ticker,
    yes: data.orderbook?.yes || [],
    no: data.orderbook?.no || [],
  };
}

/**
 * Get market history/trades
 */
export async function getMarketHistory(ctx, ticker, options = {}) {
  const { limit = 100, cursor } = options;

  const url = new URL(`${KALSHI_API}/markets/${ticker}/trades`);
  url.searchParams.set("limit", limit.toString());
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    ticker,
    trades: data.trades?.map((t) => ({
      price: t.yes_price,
      count: t.count,
      side: t.taker_side,
      timestamp: t.created_time,
    })),
    cursor: data.cursor,
  };
}

export default { getMarkets, getMarket, getOrderbook, getMarketHistory };
