/**
 * Regime Shift Detector
 * Detects market regime changes using multiple methods
 * 
 * Adaptive strategy based on detected regime
 */
import { HiddenMarkovModel } from "./hmm.js";

export class RegimeDetector {
  constructor(config = {}) {
    this.hmm = new HiddenMarkovModel(config.hmm);
    this.lookbackPeriod = config.lookbackPeriod || 60; // days
    this.volatilityWindow = config.volatilityWindow || 20;
    this.regimeHistory = [];
    
    // Regime thresholds
    this.thresholds = {
      highVolatility: config.highVolThreshold || 0.4,
      lowVolatility: config.lowVolThreshold || 0.15,
      trendStrength: config.trendThreshold || 0.6,
    };
  }

  /**
   * Calculate rolling volatility
   */
  calculateVolatility(returns, window = null) {
    window = window || this.volatilityWindow;
    if (returns.length < window) return 0;
    
    const recentReturns = returns.slice(-window);
    const mean = recentReturns.reduce((a, b) => a + b, 0) / window;
    const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / window;
    
    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  /**
   * Calculate trend strength using linear regression
   */
  calculateTrendStrength(prices) {
    const n = prices.length;
    if (n < 2) return 0;
    
    // Simple linear regression
    const xMean = (n - 1) / 2;
    const yMean = prices.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (prices[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }
    
    const slope = numerator / (denominator + 1e-10);
    
    // R-squared for trend strength
    const yPred = prices.map((_, i) => yMean + slope * (i - xMean));
    const ssRes = prices.reduce((sum, y, i) => sum + Math.pow(y - yPred[i], 2), 0);
    const ssTot = prices.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    
    const rSquared = 1 - ssRes / (ssTot + 1e-10);
    
    return {
      slope,
      rSquared,
      direction: slope > 0 ? 'UP' : 'DOWN',
      strength: Math.abs(rSquared),
    };
  }

  /**
   * Detect regime using multiple indicators
   */
  detectRegime(priceHistory, volumeHistory = null) {
    if (priceHistory.length < this.lookbackPeriod) {
      return { regime: 'UNKNOWN', confidence: 0, reason: 'Insufficient data' };
    }
    
    // Calculate returns
    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
      returns.push((priceHistory[i] - priceHistory[i - 1]) / priceHistory[i - 1]);
    }
    
    // 1. HMM-based regime detection
    const hmmRegime = this.hmm.predictRegime(returns.slice(-this.lookbackPeriod));
    
    // 2. Volatility-based regime
    const volatility = this.calculateVolatility(returns);
    let volRegime;
    if (volatility > this.thresholds.highVolatility) {
      volRegime = 'HIGH_VOL';
    } else if (volatility < this.thresholds.lowVolatility) {
      volRegime = 'LOW_VOL';
    } else {
      volRegime = 'NORMAL_VOL';
    }
    
    // 3. Trend-based regime
    const trend = this.calculateTrendStrength(priceHistory.slice(-this.lookbackPeriod));
    let trendRegime;
    if (trend.strength > this.thresholds.trendStrength) {
      trendRegime = trend.direction === 'UP' ? 'TRENDING_UP' : 'TRENDING_DOWN';
    } else {
      trendRegime = 'RANGING';
    }
    
    // 4. Combine signals
    const combinedRegime = this.combineRegimeSignals(hmmRegime, volRegime, trendRegime);
    
    // Store in history
    this.regimeHistory.push({
      timestamp: new Date().toISOString(),
      hmm: hmmRegime.currentRegime,
      volatility: volRegime,
      trend: trendRegime,
      combined: combinedRegime.regime,
      metrics: {
        volatility,
        trendStrength: trend.strength,
        hmmConfidence: hmmRegime.confidence,
      },
    });
    
    return combinedRegime;
  }

  /**
   * Combine multiple regime signals
   */
  combineRegimeSignals(hmmRegime, volRegime, trendRegime) {
    // Weight different signals
    const weights = { hmm: 0.4, volatility: 0.3, trend: 0.3 };
    
    // Map to numeric scores
    const hmmScore = { BULL: 1, SIDEWAYS: 0, BEAR: -1 }[hmmRegime.currentRegime] || 0;
    const volScore = { HIGH_VOL: -0.5, NORMAL_VOL: 0, LOW_VOL: 0.5 }[volRegime] || 0;
    const trendScore = { TRENDING_UP: 1, RANGING: 0, TRENDING_DOWN: -1 }[trendRegime] || 0;
    
    const combinedScore = 
      weights.hmm * hmmScore + 
      weights.volatility * volScore + 
      weights.trend * trendScore;
    
    // Determine final regime
    let regime;
    if (combinedScore > 0.3) {
      regime = 'RISK_ON';
    } else if (combinedScore < -0.3) {
      regime = 'RISK_OFF';
    } else {
      regime = 'NEUTRAL';
    }
    
    // Calculate confidence
    const confidence = Math.min(
      hmmRegime.confidence,
      Math.abs(combinedScore) / 1.5
    );
    
    return {
      regime,
      confidence,
      score: combinedScore,
      components: {
        hmm: hmmRegime.currentRegime,
        volatility: volRegime,
        trend: trendRegime,
      },
      probabilities: hmmRegime.probabilities,
      recommendation: this.getRegimeRecommendation(regime, volRegime),
    };
  }

  /**
   * Get trading recommendation based on regime
   */
  getRegimeRecommendation(regime, volRegime) {
    const recommendations = {
      RISK_ON: {
        positionSizing: 'FULL',
        kellyMultiplier: 1.0,
        strategy: 'TREND_FOLLOWING',
        hedging: 'MINIMAL',
      },
      RISK_OFF: {
        positionSizing: 'REDUCED',
        kellyMultiplier: 0.25,
        strategy: 'DEFENSIVE',
        hedging: 'AGGRESSIVE',
      },
      NEUTRAL: {
        positionSizing: 'MODERATE',
        kellyMultiplier: 0.5,
        strategy: 'MEAN_REVERSION',
        hedging: 'MODERATE',
      },
    };
    
    const rec = recommendations[regime] || recommendations.NEUTRAL;
    
    // Adjust for volatility
    if (volRegime === 'HIGH_VOL') {
      rec.kellyMultiplier *= 0.5;
      rec.positionSizing = 'REDUCED';
    }
    
    return rec;
  }

  /**
   * Detect regime shift
   */
  detectShift(currentRegime = null) {
    if (this.regimeHistory.length < 2) {
      return { shifted: false, reason: 'Insufficient history' };
    }
    
    const recent = this.regimeHistory.slice(-5);
    const previousRegime = recent[0].combined;
    const currentRegimeValue = currentRegime || recent[recent.length - 1].combined;
    
    if (previousRegime !== currentRegimeValue) {
      return {
        shifted: true,
        from: previousRegime,
        to: currentRegimeValue,
        timestamp: new Date().toISOString(),
        significance: this.calculateShiftSignificance(recent),
      };
    }
    
    return { shifted: false, currentRegime: currentRegimeValue };
  }

  /**
   * Calculate significance of regime shift
   */
  calculateShiftSignificance(recentHistory) {
    // Count regime changes in recent history
    let changes = 0;
    for (let i = 1; i < recentHistory.length; i++) {
      if (recentHistory[i].combined !== recentHistory[i - 1].combined) {
        changes++;
      }
    }
    
    // More changes = less significant (noisy)
    // Fewer changes = more significant (clear shift)
    return Math.max(0, 1 - changes / recentHistory.length);
  }

  /**
   * Train HMM with new data
   */
  trainModel(returns) {
    const observations = this.hmm.discretizeReturns(returns);
    this.hmm.train(observations);
    return this;
  }

  /**
   * Export state for persistence
   */
  exportState() {
    return {
      hmm: this.hmm.exportModel(),
      regimeHistory: this.regimeHistory.slice(-100), // Keep last 100
      thresholds: this.thresholds,
    };
  }

  /**
   * Import state
   */
  importState(state) {
    if (state.hmm) {
      this.hmm.importModel(state.hmm);
    }
    if (state.regimeHistory) {
      this.regimeHistory = state.regimeHistory;
    }
    if (state.thresholds) {
      this.thresholds = state.thresholds;
    }
    return this;
  }
}

export default RegimeDetector;
