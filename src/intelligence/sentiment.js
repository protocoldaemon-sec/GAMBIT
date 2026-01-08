/**
 * Sentiment Analysis
 * Analyzes news sentiment for market prediction
 * Uses Multi-LLM via OpenRouter
 */
import { getMultiLLM, MODELS } from "../llm/index.js";

/**
 * Analyze sentiment of text
 */
export async function analyzeSentiment(text, context = {}) {
  const { marketTitle, side } = context;
  const llm = getMultiLLM();

  const prompt = `Analyze the sentiment of this news content in relation to a prediction market.

Market: "${marketTitle || "Unknown"}"
${side ? `Position being considered: ${side.toUpperCase()}` : ""}

News Content:
${text.slice(0, 3000)}

Respond in JSON format:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 0.0-1.0,
  "relevance": 0.0-1.0,
  "keyPoints": ["point1", "point2"],
  "impact": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "brief explanation"
}`;

  const result = await llm.complete(prompt, { 
    task: "sentiment",
    temperature: 0,
  });
  
  try {
    const content = result.content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(content);
  } catch {
    return {
      sentiment: "NEUTRAL",
      confidence: 0.5,
      relevance: 0.5,
      keyPoints: [],
      impact: "LOW",
      reasoning: "Failed to parse sentiment",
    };
  }
}

/**
 * Analyze multiple articles and aggregate sentiment
 */
export async function aggregateSentiment(articles, context = {}) {
  if (articles.length === 0) {
    return {
      overallSentiment: "NEUTRAL",
      confidence: 0,
      articleCount: 0,
      breakdown: { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 },
    };
  }

  const sentiments = [];
  
  for (const article of articles.slice(0, 10)) {
    const text = article.content || article.title + " " + (article.description || "");
    const sentiment = await analyzeSentiment(text, context);
    sentiments.push({ article, sentiment });
  }

  // Aggregate
  const breakdown = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 };
  let totalConfidence = 0;
  let totalRelevance = 0;

  for (const { sentiment } of sentiments) {
    breakdown[sentiment.sentiment]++;
    totalConfidence += sentiment.confidence * sentiment.relevance;
    totalRelevance += sentiment.relevance;
  }

  // Determine overall sentiment
  let overallSentiment = "NEUTRAL";
  const maxCount = Math.max(breakdown.BULLISH, breakdown.BEARISH, breakdown.NEUTRAL);
  
  if (breakdown.BULLISH === maxCount && breakdown.BULLISH > breakdown.BEARISH) {
    overallSentiment = "BULLISH";
  } else if (breakdown.BEARISH === maxCount && breakdown.BEARISH > breakdown.BULLISH) {
    overallSentiment = "BEARISH";
  }

  return {
    overallSentiment,
    confidence: totalRelevance > 0 ? totalConfidence / totalRelevance : 0,
    articleCount: sentiments.length,
    breakdown,
    details: sentiments,
  };
}


/**
 * Generate trading signal from sentiment
 */
export function generateSignal(sentiment, marketData) {
  const { overallSentiment, confidence, breakdown } = sentiment;
  const { yesPrice, noPrice, volume, openInterest } = marketData;

  // Calculate sentiment score (-1 to 1)
  const total = breakdown.BULLISH + breakdown.BEARISH + breakdown.NEUTRAL;
  const sentimentScore = total > 0 
    ? (breakdown.BULLISH - breakdown.BEARISH) / total 
    : 0;

  // Liquidity factor
  const liquidityScore = Math.min(1, (volume || 0) / 100000);
  const spreadScore = 1 - Math.abs((yesPrice || 0.5) - 0.5) * 2;

  // Combined signal
  const signalStrength = sentimentScore * confidence * 0.6 + liquidityScore * 0.2 + spreadScore * 0.2;

  let action = "HOLD";
  let side = null;

  if (signalStrength > 0.3 && confidence > 0.6) {
    action = "BUY";
    side = "yes";
  } else if (signalStrength < -0.3 && confidence > 0.6) {
    action = "BUY";
    side = "no";
  }

  return {
    action,
    side,
    signalStrength,
    confidence,
    factors: {
      sentiment: sentimentScore,
      liquidity: liquidityScore,
      spread: spreadScore,
    },
    reasoning: generateReasoning(overallSentiment, confidence, marketData),
  };
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(sentiment, confidence, marketData) {
  const reasons = [];

  if (sentiment === "BULLISH") {
    reasons.push("News sentiment is positive");
  } else if (sentiment === "BEARISH") {
    reasons.push("News sentiment is negative");
  } else {
    reasons.push("News sentiment is mixed/neutral");
  }

  if (confidence > 0.7) {
    reasons.push("High confidence in sentiment analysis");
  } else if (confidence < 0.4) {
    reasons.push("Low confidence - limited relevant news");
  }

  if (marketData.volume > 50000) {
    reasons.push("Good market liquidity");
  } else if (marketData.volume < 10000) {
    reasons.push("Low liquidity - caution advised");
  }

  return reasons.join(". ");
}

export default { analyzeSentiment, aggregateSentiment, generateSignal };
