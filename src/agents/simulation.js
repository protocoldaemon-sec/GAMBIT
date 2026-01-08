/**
 * Simulation Agent
 * Runs Monte Carlo simulations and predictions
 */
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { MonteCarloSimulator } from "../simulation/monte-carlo.js";
import { StressTestEngine } from "../simulation/stress-test.js";

const simulator = new MonteCarloSimulator();
const stressEngine = new StressTestEngine();

const runMonteCarloSimulation = tool(
  async ({ ticker, initialPrice, volatility, positionSize, side, iterations }) => {
    const sim = new MonteCarloSimulator({ iterations: iterations || 10000 });
    const result = await sim.runSimulation({
      ticker,
      initialPrice,
      volatility,
      drift: 0,
      positionSize,
      side,
    });

    return JSON.stringify({
      simulationId: result.simulationId,
      summary: result.summary,
      message: `Completed ${result.summary.iterations} iterations. VaR95: $${result.summary.var95.toFixed(2)}, Win Rate: ${(result.summary.winRate * 100).toFixed(1)}%`,
    });
  },
  {
    name: "run_monte_carlo",
    description: "Run Monte Carlo simulation to predict outcome distribution and risk metrics",
    schema: z.object({
      ticker: z.string().describe("Market ticker"),
      initialPrice: z.number().min(0.01).max(0.99).describe("Current probability/price"),
      volatility: z.number().min(0.01).max(2).describe("Annualized volatility"),
      positionSize: z.number().describe("Position size in USD"),
      side: z.enum(["yes", "no"]).describe("Position side"),
      iterations: z.number().optional().describe("Number of iterations (default 10000)"),
    }),
  }
);

const runStressTest = tool(
  async ({ ticker, side, entryPrice, currentPrice, positionSize, baseVolatility }) => {
    const position = {
      ticker,
      side,
      entryPrice,
      currentPrice,
      positionSize,
      baseVolatility,
    };

    const result = await stressEngine.runAllScenarios(position);

    return JSON.stringify({
      simulationId: result.simulationId,
      worstCase: result.summary.worstCase,
      averageImpact: result.summary.averageImpact,
      scenarios: result.results.map((r) => ({
        scenario: r.scenario,
        impact: r.totalImpact,
        maxLoss: r.maxLoss,
      })),
    });
  },
  {
    name: "run_stress_test",
    description: "Run stress tests across multiple extreme market scenarios",
    schema: z.object({
      ticker: z.string().describe("Market ticker"),
      side: z.enum(["yes", "no"]).describe("Position side"),
      entryPrice: z.number().describe("Entry price"),
      currentPrice: z.number().describe("Current price"),
      positionSize: z.number().describe("Position size in USD"),
      baseVolatility: z.number().describe("Base volatility"),
    }),
  }
);

const predictOutcome = tool(
  async ({ ticker, currentPrice, volatility, daysToExpiry }) => {
    const sim = new MonteCarloSimulator({
      iterations: 5000,
      timeHorizon: daysToExpiry,
    });

    const result = await sim.runSimulation({
      ticker,
      initialPrice: currentPrice,
      volatility,
      drift: 0,
      positionSize: 100, // Normalized
      side: "yes",
    });

    // Calculate probability of settling YES (price > 0.5 at expiry)
    const yesProb = result.results.filter((r) => r.finalPrice > 0.5).length / result.results.length;

    return JSON.stringify({
      ticker,
      currentPrice,
      daysToExpiry,
      predictedYesProbability: yesProb,
      predictedNoProbability: 1 - yesProb,
      priceRange: {
        p5: result.summary.percentiles.p5,
        p50: result.summary.percentiles.p50,
        p95: result.summary.percentiles.p95,
      },
      confidence: "Based on Monte Carlo simulation with current volatility assumptions",
    });
  },
  {
    name: "predict_outcome",
    description: "Predict market outcome probability using Monte Carlo simulation",
    schema: z.object({
      ticker: z.string().describe("Market ticker"),
      currentPrice: z.number().describe("Current market price/probability"),
      volatility: z.number().describe("Estimated volatility"),
      daysToExpiry: z.number().describe("Days until market settles"),
    }),
  }
);

export const simulationAgent = {
  name: "simulation",
  description: "Runs Monte Carlo simulations and outcome predictions",
  tools: [runMonteCarloSimulation, runStressTest, predictOutcome],
  model: new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 }),
};
