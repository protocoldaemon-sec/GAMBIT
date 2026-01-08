/**
 * Monte Carlo Simulation Engine
 * Simulates price paths and outcome distributions for prediction markets
 */
import { streamSimulationResult, supabase, TABLES } from "../supabase/client.js";

export class MonteCarloSimulator {
  constructor(config = {}) {
    this.iterations = config.iterations || 10000;
    this.timeHorizon = config.timeHorizon || 30; // days
    this.confidenceLevel = config.confidenceLevel || 0.95;
  }

  // Generate random normal using Box-Muller transform
  randomNormal(mean = 0, stdDev = 1) {
    let u1 = Math.random();
    let u2 = Math.random();
    // Avoid log(0)
    while (u1 === 0) u1 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z;
  }

  // Simulate price path using Geometric Brownian Motion
  simulatePricePath(initialPrice, volatility, drift = 0, steps = null) {
    steps = steps || this.timeHorizon;
    const dt = 1 / 252; // daily
    const path = [initialPrice];

    for (let i = 1; i <= steps; i++) {
      const dW = this.randomNormal(0, Math.sqrt(dt));
      const dS = path[i - 1] * (drift * dt + volatility * dW);
      let newPrice = path[i - 1] + dS;
      // Clamp to [0, 1] for prediction market probabilities
      newPrice = Math.max(0.01, Math.min(0.99, newPrice));
      path.push(newPrice);
    }

    return path;
  }

  // Run full Monte Carlo simulation
  async runSimulation(params, simulationId = null) {
    const { initialPrice, volatility, drift, positionSize, side } = params;
    const results = [];

    // Create simulation record in Supabase
    let simId = simulationId;
    if (!simId) {
      const { data } = await supabase.from(TABLES.SIMULATIONS).insert({
        type: "monte_carlo",
        market_ticker: params.ticker || "UNKNOWN",
        config: params,
        status: "running",
      }).select().single();
      simId = data?.id;
    }

    for (let i = 0; i < this.iterations; i++) {
      const path = this.simulatePricePath(initialPrice, volatility, drift);
      const finalPrice = path[path.length - 1];

      // Calculate P&L
      const entryPrice = initialPrice;
      const pnl = side === "yes"
        ? (finalPrice - entryPrice) * positionSize
        : (entryPrice - finalPrice) * positionSize;

      const result = {
        iteration: i,
        finalPrice,
        pnl,
        maxPrice: Math.max(...path),
        minPrice: Math.min(...path),
        maxDrawdown: this.calculateMaxDrawdown(path, side),
      };

      results.push(result);

      // Stream every 100th result to Supabase
      if (simId && i % 100 === 0) {
        await streamSimulationResult(simId, i, result);
      }
    }

    const summary = this.calculateSummary(results, positionSize);

    // Update simulation status
    if (simId) {
      await supabase.from(TABLES.SIMULATIONS).update({
        status: "completed",
        summary,
        completed_at: new Date().toISOString(),
      }).eq("id", simId);
    }

    return { simulationId: simId, results, summary };
  }

  calculateMaxDrawdown(path, side) {
    let maxDrawdown = 0;
    let peak = path[0];

    for (const price of path) {
      if (side === "yes") {
        peak = Math.max(peak, price);
        maxDrawdown = Math.max(maxDrawdown, (peak - price) / peak);
      } else {
        peak = Math.min(peak, price);
        maxDrawdown = Math.max(maxDrawdown, (price - peak) / (1 - peak));
      }
    }

    return maxDrawdown;
  }

  calculateSummary(results, positionSize) {
    const pnls = results.map((r) => r.pnl).sort((a, b) => a - b);
    const n = pnls.length;

    // VaR calculations
    const var95Index = Math.max(0, Math.floor(n * 0.05));
    const var99Index = Math.max(0, Math.floor(n * 0.01));

    const var95 = -pnls[var95Index];
    const var99 = -pnls[var99Index];

    // CVaR (Expected Shortfall) - handle edge case
    const cvar95 = var95Index > 0 
      ? -pnls.slice(0, var95Index).reduce((a, b) => a + b, 0) / var95Index
      : var95;

    // Statistics
    const meanPnl = pnls.reduce((a, b) => a + b, 0) / n;
    const variance = pnls.reduce((a, b) => a + Math.pow(b - meanPnl, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Win rate
    const winRate = pnls.filter((p) => p > 0).length / n;

    // Percentiles
    const p5 = pnls[Math.floor(n * 0.05)];
    const p25 = pnls[Math.floor(n * 0.25)];
    const p50 = pnls[Math.floor(n * 0.5)];
    const p75 = pnls[Math.floor(n * 0.75)];
    const p95 = pnls[Math.floor(n * 0.95)];

    // Sharpe ratio - avoid division by zero
    const sharpeRatio = stdDev > 0 ? meanPnl / stdDev : 0;

    return {
      iterations: n,
      meanPnl,
      stdDev,
      var95,
      var99,
      cvar95,
      winRate,
      maxProfit: pnls[n - 1],
      maxLoss: pnls[0],
      percentiles: { p5, p25, p50, p75, p95 },
      sharpeRatio,
    };
  }
}
