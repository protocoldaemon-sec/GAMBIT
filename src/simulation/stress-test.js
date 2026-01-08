/**
 * Stress Testing Engine
 * Tests portfolio resilience under extreme market conditions
 */
import { supabase, TABLES } from "../supabase/client.js";
import { MonteCarloSimulator } from "./monte-carlo.js";

export class StressTestEngine {
  constructor() {
    this.simulator = new MonteCarloSimulator({ iterations: 1000 });
  }

  // Predefined stress scenarios
  static SCENARIOS = {
    MARKET_CRASH: {
      name: "Market Crash",
      description: "Sudden 50% probability shift against position",
      priceShock: -0.5,
      volatilityMultiplier: 3,
      liquidityDrop: 0.8,
    },
    VOLATILITY_SPIKE: {
      name: "Volatility Spike",
      description: "3x increase in market volatility",
      priceShock: 0,
      volatilityMultiplier: 3,
      liquidityDrop: 0.3,
    },
    LIQUIDITY_CRISIS: {
      name: "Liquidity Crisis",
      description: "90% drop in market liquidity",
      priceShock: -0.1,
      volatilityMultiplier: 2,
      liquidityDrop: 0.9,
    },
    BLACK_SWAN: {
      name: "Black Swan Event",
      description: "Extreme tail event with 6-sigma move",
      priceShock: -0.8,
      volatilityMultiplier: 5,
      liquidityDrop: 0.95,
    },
    FLASH_CRASH: {
      name: "Flash Crash",
      description: "Rapid price drop and recovery",
      priceShock: -0.3,
      volatilityMultiplier: 4,
      liquidityDrop: 0.7,
      recoveryPeriods: 5,
    },
    CORRELATION_BREAKDOWN: {
      name: "Correlation Breakdown",
      description: "Historical correlations fail",
      priceShock: -0.2,
      volatilityMultiplier: 2.5,
      liquidityDrop: 0.5,
      correlationShift: 0.8,
    },
  };

  // Run single stress scenario
  async runScenario(position, scenario) {
    const {
      ticker,
      side,
      entryPrice,
      positionSize,
      currentPrice,
      baseVolatility,
    } = position;

    const {
      priceShock,
      volatilityMultiplier,
      liquidityDrop,
      recoveryPeriods,
    } = scenario;

    // Apply shock
    const shockedPrice = Math.max(0.01, Math.min(0.99, currentPrice * (1 + priceShock)));
    const stressedVolatility = baseVolatility * volatilityMultiplier;

    // Calculate immediate P&L impact
    const immediatePnl = side === "yes"
      ? (shockedPrice - entryPrice) * positionSize
      : (entryPrice - shockedPrice) * positionSize;

    // Simulate recovery path
    const recoverySimulation = await this.simulator.runSimulation({
      ticker,
      initialPrice: shockedPrice,
      volatility: stressedVolatility,
      drift: 0,
      positionSize,
      side,
    });

    // Calculate slippage from liquidity drop
    const slippageCost = positionSize * liquidityDrop * 0.05; // 5% max slippage

    // Recovery analysis
    const recoveryTime = this.estimateRecoveryTime(
      recoverySimulation.results,
      entryPrice,
      side
    );

    return {
      scenario: scenario.name,
      shockedPrice,
      immediatePnl,
      slippageCost,
      totalImpact: immediatePnl - slippageCost,
      maxLoss: recoverySimulation.summary.maxLoss - slippageCost,
      recoveryTime,
      var95UnderStress: recoverySimulation.summary.var95,
      survivalProbability: recoverySimulation.summary.winRate,
    };
  }

  estimateRecoveryTime(results, targetPrice, side) {
    // Estimate periods to recover to entry price
    let totalRecoveryPeriods = 0;
    let recoveredCount = 0;

    for (const result of results) {
      if (side === "yes" && result.finalPrice >= targetPrice) {
        recoveredCount++;
      } else if (side === "no" && result.finalPrice <= targetPrice) {
        recoveredCount++;
      }
    }

    return recoveredCount / results.length; // Recovery probability
  }

  // Run all stress scenarios
  async runAllScenarios(position, simulationId = null) {
    // Create simulation record
    let simId = simulationId;
    if (!simId) {
      const { data } = await supabase.from(TABLES.SIMULATIONS).insert({
        type: "stress_test",
        market_ticker: position.ticker,
        config: position,
        status: "running",
      }).select().single();
      simId = data?.id;
    }

    const results = [];

    for (const [key, scenario] of Object.entries(StressTestEngine.SCENARIOS)) {
      console.log(`Running scenario: ${scenario.name}`);
      const result = await this.runScenario(position, scenario);
      results.push(result);

      // Store in Supabase
      if (simId) {
        await supabase.from(TABLES.STRESS_TESTS).insert({
          simulation_id: simId,
          scenario_name: scenario.name,
          parameters: scenario,
          pnl_impact: result.totalImpact,
          max_loss: result.maxLoss,
          recovery_time: Math.round(result.recoveryTime * 100),
        });
      }
    }

    // Summary
    const summary = {
      worstCase: results.reduce((min, r) => r.maxLoss < min.maxLoss ? r : min),
      averageImpact: results.reduce((sum, r) => sum + r.totalImpact, 0) / results.length,
      scenarioResults: results,
    };

    // Update simulation
    if (simId) {
      await supabase.from(TABLES.SIMULATIONS).update({
        status: "completed",
        summary,
        completed_at: new Date().toISOString(),
      }).eq("id", simId);
    }

    return { simulationId: simId, results, summary };
  }

  // Custom scenario builder
  createCustomScenario(params) {
    return {
      name: params.name || "Custom Scenario",
      description: params.description || "User-defined stress scenario",
      priceShock: params.priceShock || 0,
      volatilityMultiplier: params.volatilityMultiplier || 1,
      liquidityDrop: params.liquidityDrop || 0,
    };
  }
}
