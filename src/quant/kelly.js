/**
 * Advanced Kelly Criterion Calculator
 * Optimal position sizing with regime-aware adjustments
 * 
 * Dynamic Kelly based on market conditions
 */

export class KellyCriterion {
  constructor(config = {}) {
    this.maxKelly = config.maxKelly || 0.25; // Never bet more than 25%
    this.minKelly = config.minKelly || 0.01; // Minimum position
    this.defaultFraction = config.defaultFraction || 0.5; // Half-Kelly default
    
    // Regime multipliers
    this.regimeMultipliers = {
      RISK_ON: 1.0,
      NEUTRAL: 0.5,
      RISK_OFF: 0.25,
    };
  }

  /**
   * Basic Kelly Criterion for binary outcomes
   * f* = (bp - q) / b
   * where b = odds, p = win probability, q = loss probability
   */
  calculateBasicKelly(winProbability, odds = 1) {
    const p = winProbability;
    const q = 1 - p;
    const b = odds;
    
    const kelly = (b * p - q) / b;
    
    return {
      fullKelly: kelly,
      halfKelly: kelly / 2,
      quarterKelly: kelly / 4,
      recommendation: kelly > 0 ? 'BET' : 'NO_BET',
      edge: b * p - q,
    };
  }

  /**
   * Kelly for prediction markets
   * Accounts for binary settlement (0 or 1)
   */
  calculatePredictionMarketKelly(currentPrice, estimatedProbability, side = 'yes') {
    let p, entryPrice, maxProfit, maxLoss;
    
    if (side === 'yes') {
      p = estimatedProbability;
      entryPrice = currentPrice;
      maxProfit = 1 - entryPrice; // Profit if settles YES
      maxLoss = entryPrice; // Loss if settles NO
    } else {
      p = 1 - estimatedProbability;
      entryPrice = 1 - currentPrice;
      maxProfit = 1 - entryPrice;
      maxLoss = entryPrice;
    }
    
    // Kelly formula: f* = (p * maxProfit - (1-p) * maxLoss) / maxProfit
    const kelly = (p * maxProfit - (1 - p) * maxLoss) / maxProfit;
    
    // Edge calculation
    const expectedValue = p * maxProfit - (1 - p) * maxLoss;
    const edgePercent = (expectedValue / entryPrice) * 100;
    
    return {
      fullKelly: Math.max(0, kelly),
      halfKelly: Math.max(0, kelly / 2),
      quarterKelly: Math.max(0, kelly / 4),
      expectedValue,
      edgePercent,
      breakEvenProbability: entryPrice,
      impliedEdge: estimatedProbability - currentPrice,
      recommendation: kelly > 0 ? 'BET' : 'NO_BET',
    };
  }

  /**
   * Regime-adjusted Kelly
   */
  calculateRegimeAdjustedKelly(params) {
    const {
      currentPrice,
      estimatedProbability,
      side,
      regime,
      volatility,
      confidence,
    } = params;
    
    // Base Kelly
    const baseKelly = this.calculatePredictionMarketKelly(
      currentPrice,
      estimatedProbability,
      side
    );
    
    // Regime adjustment
    const regimeMultiplier = this.regimeMultipliers[regime] || 0.5;
    
    // Volatility adjustment (reduce size in high vol)
    const volAdjustment = volatility > 0.4 ? 0.5 : volatility > 0.25 ? 0.75 : 1.0;
    
    // Confidence adjustment
    const confidenceAdjustment = Math.max(0.25, confidence);
    
    // Combined adjustment
    const totalAdjustment = regimeMultiplier * volAdjustment * confidenceAdjustment;
    
    const adjustedKelly = baseKelly.halfKelly * totalAdjustment;
    const clampedKelly = Math.max(this.minKelly, Math.min(this.maxKelly, adjustedKelly));
    
    return {
      ...baseKelly,
      adjustedKelly: clampedKelly,
      adjustments: {
        regime: regimeMultiplier,
        volatility: volAdjustment,
        confidence: confidenceAdjustment,
        total: totalAdjustment,
      },
      finalRecommendation: {
        fractionOfPortfolio: clampedKelly,
        maxPositionSize: clampedKelly,
        reasoning: this.generateReasoning(baseKelly, totalAdjustment, regime),
      },
    };
  }

  /**
   * Multi-position Kelly (for portfolio)
   * Accounts for correlation between positions
   */
  calculatePortfolioKelly(positions, correlationMatrix = null) {
    const n = positions.length;
    
    // Calculate individual Kellys
    const individualKellys = positions.map(pos => 
      this.calculatePredictionMarketKelly(
        pos.currentPrice,
        pos.estimatedProbability,
        pos.side
      )
    );
    
    // If no correlation matrix, assume independence
    if (!correlationMatrix) {
      // Simple sum with diversification benefit
      const totalKelly = individualKellys.reduce((sum, k) => sum + k.halfKelly, 0);
      const diversificationFactor = 1 / Math.sqrt(n); // Simplified
      
      return {
        positions: individualKellys,
        totalKelly,
        adjustedTotal: totalKelly * diversificationFactor,
        diversificationBenefit: 1 - diversificationFactor,
      };
    }
    
    // With correlation matrix - more sophisticated calculation
    // Using simplified mean-variance optimization
    const returns = individualKellys.map(k => k.expectedValue);
    const risks = positions.map(p => p.volatility || 0.3);
    
    // Calculate portfolio variance
    let portfolioVariance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const correlation = correlationMatrix[i]?.[j] || (i === j ? 1 : 0);
        portfolioVariance += risks[i] * risks[j] * correlation;
      }
    }
    
    const portfolioRisk = Math.sqrt(portfolioVariance);
    const portfolioReturn = returns.reduce((a, b) => a + b, 0) / n;
    
    // Optimal allocation using Sharpe-like ratio
    const optimalTotal = portfolioReturn / (portfolioRisk + 0.01);
    
    return {
      positions: individualKellys,
      portfolioReturn,
      portfolioRisk,
      optimalAllocation: Math.min(this.maxKelly * n, optimalTotal),
      sharpeRatio: portfolioReturn / portfolioRisk,
    };
  }

  /**
   * Generate human-readable reasoning
   */
  generateReasoning(baseKelly, adjustment, regime) {
    const reasons = [];
    
    if (baseKelly.fullKelly <= 0) {
      reasons.push('Negative edge - no bet recommended');
    } else if (baseKelly.edgePercent > 10) {
      reasons.push(`Strong edge of ${baseKelly.edgePercent.toFixed(1)}%`);
    } else if (baseKelly.edgePercent > 5) {
      reasons.push(`Moderate edge of ${baseKelly.edgePercent.toFixed(1)}%`);
    } else {
      reasons.push(`Small edge of ${baseKelly.edgePercent.toFixed(1)}%`);
    }
    
    if (regime === 'RISK_OFF') {
      reasons.push('Risk-off regime - reduced position size');
    } else if (regime === 'RISK_ON') {
      reasons.push('Risk-on regime - full position allowed');
    }
    
    if (adjustment < 0.5) {
      reasons.push('Significant adjustments applied due to market conditions');
    }
    
    return reasons.join('. ');
  }

  /**
   * Calculate optimal bet size given bankroll
   */
  calculateBetSize(bankroll, kellyFraction, minBet = 1, maxBet = null) {
    maxBet = maxBet || bankroll * this.maxKelly;
    
    const rawBet = bankroll * kellyFraction;
    const clampedBet = Math.max(minBet, Math.min(maxBet, rawBet));
    
    return {
      rawBetSize: rawBet,
      recommendedBetSize: clampedBet,
      percentOfBankroll: (clampedBet / bankroll) * 100,
      remainingBankroll: bankroll - clampedBet,
    };
  }
}

export default KellyCriterion;
