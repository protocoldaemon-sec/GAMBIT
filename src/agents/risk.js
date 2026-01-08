/**
 * Risk Management Agent
 * Calculates risk metrics and provides position sizing recommendations
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getFreeAgentModel } from "../llm/index.js";
import { storeRiskMetrics } from "../supabase/client.js";
import { MonteCarloSimulator } from "../simulation/monte-carlo.js";

const calculateRiskMetrics = tool(
  async ({ ticker, positions, portfolioValue }) => {
    const simulator = new MonteCarloSimulator({ iterations: 5000 });
    const metrics = [];

    for (const pos of positions) {
      const result = await simulator.runSimulation({
        ticker: pos.ticker,
        initialPrice: pos.currentPrice,
        volatility: pos.volatility || 0.3,
        drift: 0,
        positionSize: pos.size,
        side: pos.side,
      });

      const metric = {
        market_ticker: pos.ticker,
        var_95: result.summary.var95,
        var_99: result.summary.var99,
        cvar_95: result.summary.cvar95,
        max_drawdown: result.results.reduce((max, r) => Math.max(max, r.maxDrawdown), 0),
        sharpe_ratio: result.summary.sharpeRatio,
        volatility: pos.volatility || 0.3,
        position_size: pos.size,
        metadata: { side: pos.side, currentPrice: pos.currentPrice },
      };

      metrics.push(metric);
      await storeRiskMetrics(metric);
    }

    // Portfolio-level metrics
    const totalVar95 = metrics.reduce((sum, m) => sum + m.var_95, 0);
    const portfolioRisk = totalVar95 / portfolioValue;

    return JSON.stringify({
      positions: metrics,
      portfolio: {
        totalVar95,
        portfolioRiskPercent: (portfolioRisk * 100).toFixed(2) + "%",
        diversificationBenefit: "Assuming no correlation",
      },
    });
  },
  {
    name: "calculate_risk_metrics",
    description: "Calculate VaR, CVaR, and other risk metrics for positions",
    schema: z.object({
      ticker: z.string().optional(),
      positions: z.array(z.object({
        ticker: z.string(),
        side: z.enum(["yes", "no"]),
        size: z.number(),
        currentPrice: z.number(),
        volatility: z.number().optional(),
      })).describe("Array of positions"),
      portfolioValue: z.number().describe("Total portfolio value"),
    }),
  }
);

const calculatePositionSize = tool(
  async ({ portfolioValue, riskPerTrade, entryPrice, stopLoss, side }) => {
    // Kelly Criterion simplified
    const winProb = side === "yes" ? entryPrice : 1 - entryPrice;
    const lossProb = 1 - winProb;
    const winAmount = 1 - entryPrice; // Profit if YES wins
    const lossAmount = entryPrice; // Loss if NO wins

    const kellyFraction = (winProb * winAmount - lossProb * lossAmount) / winAmount;
    const halfKelly = kellyFraction / 2; // Conservative

    // Risk-based sizing
    const riskAmount = portfolioValue * riskPerTrade;
    const stopDistance = Math.abs(entryPrice - stopLoss);
    const riskBasedSize = riskAmount / stopDistance;

    // Final recommendation
    const kellyBasedSize = portfolioValue * Math.max(0, halfKelly);
    const recommendedSize = Math.min(riskBasedSize, kellyBasedSize);

    return JSON.stringify({
      kellyFraction: kellyFraction.toFixed(4),
      halfKelly: halfKelly.toFixed(4),
      kellyBasedSize: kellyBasedSize.toFixed(2),
      riskBasedSize: riskBasedSize.toFixed(2),
      recommendedSize: recommendedSize.toFixed(2),
      maxRiskAmount: riskAmount.toFixed(2),
      reasoning: kellyFraction < 0
        ? "Negative Kelly suggests avoiding this trade"
        : "Using half-Kelly for conservative sizing",
    });
  },
  {
    name: "calculate_position_size",
    description: "Calculate optimal position size using Kelly Criterion and risk parameters",
    schema: z.object({
      portfolioValue: z.number().describe("Total portfolio value"),
      riskPerTrade: z.number().min(0.001).max(0.1).describe("Risk per trade as decimal (e.g., 0.02 for 2%)"),
      entryPrice: z.number().describe("Entry price/probability"),
      stopLoss: z.number().describe("Stop loss price"),
      side: z.enum(["yes", "no"]).describe("Position side"),
    }),
  }
);

const assessPortfolioRisk = tool(
  async ({ positions, portfolioValue, maxDrawdownTolerance }) => {
    // Aggregate risk assessment
    const totalExposure = positions.reduce((sum, p) => sum + p.size, 0);
    const leverageRatio = totalExposure / portfolioValue;

    // Concentration risk
    const largestPosition = Math.max(...positions.map((p) => p.size));
    const concentrationRisk = largestPosition / totalExposure;

    // Directional bias
    const yesExposure = positions.filter((p) => p.side === "yes").reduce((s, p) => s + p.size, 0);
    const noExposure = positions.filter((p) => p.side === "no").reduce((s, p) => s + p.size, 0);
    const directionalBias = (yesExposure - noExposure) / totalExposure;

    // Risk score (0-100)
    let riskScore = 0;
    riskScore += leverageRatio > 1 ? 30 : leverageRatio * 30;
    riskScore += concentrationRisk * 40;
    riskScore += Math.abs(directionalBias) * 30;

    const riskLevel = riskScore < 30 ? "LOW" : riskScore < 60 ? "MEDIUM" : "HIGH";

    return JSON.stringify({
      totalExposure,
      leverageRatio: leverageRatio.toFixed(2),
      concentrationRisk: (concentrationRisk * 100).toFixed(1) + "%",
      directionalBias: directionalBias.toFixed(2),
      riskScore: riskScore.toFixed(0),
      riskLevel,
      recommendations: [
        leverageRatio > 1 && "Consider reducing total exposure",
        concentrationRisk > 0.5 && "High concentration - diversify positions",
        Math.abs(directionalBias) > 0.5 && "Strong directional bias - consider hedging",
      ].filter(Boolean),
    });
  },
  {
    name: "assess_portfolio_risk",
    description: "Assess overall portfolio risk and provide recommendations",
    schema: z.object({
      positions: z.array(z.object({
        ticker: z.string(),
        side: z.enum(["yes", "no"]),
        size: z.number(),
      })),
      portfolioValue: z.number(),
      maxDrawdownTolerance: z.number().optional().describe("Max acceptable drawdown (e.g., 0.2 for 20%)"),
    }),
  }
);

export const riskAgent = {
  name: "risk",
  description: "Calculates risk metrics and provides position sizing recommendations",
  tools: [calculateRiskMetrics, calculatePositionSize, assessPortfolioRisk],
  model: getFreeAgentModel(),
};
