/**
 * Continuous Learning Trainer
 * 24/7 model retraining daemon
 * 
 * Adapts to market volatility, updates HMM, recalibrates Kelly
 */
import { supabase, TABLES } from "../supabase/client.js";
import { HiddenMarkovModel } from "../quant/hmm.js";
import { RegimeDetector } from "../quant/regime-detector.js";
import { KellyCriterion } from "../quant/kelly.js";
import { MonteCarloSimulator } from "../simulation/monte-carlo.js";

export class ContinuousTrainer {
  constructor(config = {}) {
    this.hmm = new HiddenMarkovModel();
    this.regimeDetector = new RegimeDetector();
    this.kelly = new KellyCriterion();
    this.simulator = new MonteCarloSimulator({ iterations: 5000 });
    
    // Training intervals (ms)
    this.intervals = {
      hmm: config.hmmInterval || 6 * 60 * 60 * 1000, // 6 hours
      regime: config.regimeInterval || 1 * 60 * 60 * 1000, // 1 hour
      kelly: config.kellyInterval || 30 * 60 * 1000, // 30 minutes
      simulation: config.simInterval || 15 * 60 * 1000, // 15 minutes
    };
    
    this.isRunning = false;
    this.timers = {};
    this.trainingLog = [];
    this.modelVersions = {};
  }

  /**
   * Start continuous training daemon
   */
  async start() {
    if (this.isRunning) {
      console.log("[Trainer] Already running");
      return;
    }
    
    this.isRunning = true;
    console.log("[Trainer] Starting continuous learning daemon...");
    
    // Load existing models
    await this.loadModels();
    
    // Initial training
    await this.runAllTraining();
    
    // Schedule periodic training
    this.timers.hmm = setInterval(() => this.trainHMM(), this.intervals.hmm);
    this.timers.regime = setInterval(() => this.updateRegime(), this.intervals.regime);
    this.timers.kelly = setInterval(() => this.recalibrateKelly(), this.intervals.kelly);
    this.timers.simulation = setInterval(() => this.runSimulations(), this.intervals.simulation);
    
    console.log("[Trainer] Daemon started with intervals:", this.intervals);
  }

  /**
   * Stop daemon
   */
  stop() {
    this.isRunning = false;
    Object.values(this.timers).forEach(timer => clearInterval(timer));
    this.timers = {};
    console.log("[Trainer] Daemon stopped");
  }

  /**
   * Load existing models from storage
   */
  async loadModels() {
    try {
      const { data } = await supabase
        .from(TABLES.MODEL_VERSIONS || "model_versions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (data?.[0]) {
        const model = data[0];
        if (model.hmm_params) {
          this.hmm.importModel(model.hmm_params);
        }
        if (model.regime_state) {
          this.regimeDetector.importState(model.regime_state);
        }
        console.log("[Trainer] Loaded models from version:", model.version);
      }
    } catch (error) {
      console.log("[Trainer] No existing models found, using defaults");
    }
  }

  /**
   * Save models to storage
   */
  async saveModels() {
    const version = `v${Date.now()}`;
    
    try {
      await supabase.from(TABLES.MODEL_VERSIONS || "model_versions").insert({
        version,
        hmm_params: this.hmm.exportModel(),
        regime_state: this.regimeDetector.exportState(),
        training_log: this.trainingLog.slice(-100),
        created_at: new Date().toISOString(),
      });
      
      this.modelVersions[version] = {
        timestamp: new Date().toISOString(),
        metrics: this.getModelMetrics(),
      };
      
      console.log("[Trainer] Saved model version:", version);
    } catch (error) {
      console.error("[Trainer] Failed to save models:", error.message);
    }
  }

  /**
   * Run all training tasks
   */
  async runAllTraining() {
    console.log("[Trainer] Running full training cycle...");
    
    await this.trainHMM();
    await this.updateRegime();
    await this.recalibrateKelly();
    await this.runSimulations();
    await this.saveModels();
    
    console.log("[Trainer] Full training cycle complete");
  }

  /**
   * Train HMM with historical data
   */
  async trainHMM() {
    const startTime = Date.now();
    console.log("[Trainer] Training HMM...");
    
    try {
      // Fetch historical price data
      const { data: trades } = await supabase
        .from(TABLES.TRADES || "trades")
        .select("price, created_at")
        .order("created_at", { ascending: true })
        .limit(1000);
      
      if (!trades || trades.length < 100) {
        console.log("[Trainer] Insufficient data for HMM training");
        return;
      }
      
      // Calculate returns
      const returns = [];
      for (let i = 1; i < trades.length; i++) {
        const ret = (trades[i].price - trades[i - 1].price) / trades[i - 1].price;
        returns.push(ret);
      }
      
      // Train HMM
      const observations = this.hmm.discretizeReturns(returns);
      this.hmm.train(observations);
      
      const duration = Date.now() - startTime;
      this.logTraining("HMM", { dataPoints: trades.length, duration });
      
      console.log(`[Trainer] HMM trained with ${trades.length} data points in ${duration}ms`);
    } catch (error) {
      console.error("[Trainer] HMM training failed:", error.message);
      this.logTraining("HMM", { error: error.message });
    }
  }

  /**
   * Update regime detection
   */
  async updateRegime() {
    const startTime = Date.now();
    console.log("[Trainer] Updating regime detection...");
    
    try {
      // Fetch recent price history
      const { data: prices } = await supabase
        .from(TABLES.MARKET_DATA || "market_data")
        .select("price, volume, timestamp")
        .order("timestamp", { ascending: true })
        .limit(200);
      
      if (!prices || prices.length < 60) {
        console.log("[Trainer] Insufficient data for regime detection");
        return;
      }
      
      const priceHistory = prices.map(p => p.price);
      const volumeHistory = prices.map(p => p.volume);
      
      // Detect current regime
      const regime = this.regimeDetector.detectRegime(priceHistory, volumeHistory);
      
      // Check for regime shift
      const shift = this.regimeDetector.detectShift(regime.regime);
      
      if (shift.shifted) {
        console.log(`[Trainer] REGIME SHIFT DETECTED: ${shift.from} -> ${shift.to}`);
        
        // Store regime shift event
        await supabase.from(TABLES.EVENTS || "events").insert({
          type: "REGIME_SHIFT",
          data: shift,
          created_at: new Date().toISOString(),
        });
      }
      
      const duration = Date.now() - startTime;
      this.logTraining("REGIME", { regime: regime.regime, shift: shift.shifted, duration });
      
      console.log(`[Trainer] Current regime: ${regime.regime} (confidence: ${(regime.confidence * 100).toFixed(1)}%)`);
    } catch (error) {
      console.error("[Trainer] Regime update failed:", error.message);
      this.logTraining("REGIME", { error: error.message });
    }
  }

  /**
   * Recalibrate Kelly parameters
   */
  async recalibrateKelly() {
    const startTime = Date.now();
    console.log("[Trainer] Recalibrating Kelly criterion...");
    
    try {
      // Fetch recent trade performance
      const { data: trades } = await supabase
        .from(TABLES.TRADES || "trades")
        .select("*")
        .eq("status", "settled")
        .order("settled_at", { ascending: false })
        .limit(100);
      
      if (!trades || trades.length < 20) {
        console.log("[Trainer] Insufficient settled trades for Kelly calibration");
        return;
      }
      
      // Calculate actual win rate and edge
      const wins = trades.filter(t => t.pnl > 0).length;
      const actualWinRate = wins / trades.length;
      const avgWin = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins || 0;
      const losses = trades.filter(t => t.pnl <= 0);
      const avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) || 1;
      
      // Calculate realized Kelly
      const realizedKelly = (actualWinRate * avgWin - (1 - actualWinRate) * avgLoss) / avgWin;
      
      // Adjust Kelly parameters based on performance
      if (realizedKelly < 0) {
        this.kelly.maxKelly = Math.max(0.05, this.kelly.maxKelly * 0.8);
        console.log("[Trainer] Negative realized Kelly - reducing max position size");
      } else if (realizedKelly > 0.3) {
        this.kelly.maxKelly = Math.min(0.25, this.kelly.maxKelly * 1.1);
        console.log("[Trainer] Strong realized Kelly - slightly increasing max position size");
      }
      
      const duration = Date.now() - startTime;
      this.logTraining("KELLY", {
        actualWinRate,
        realizedKelly,
        maxKelly: this.kelly.maxKelly,
        duration,
      });
      
      console.log(`[Trainer] Kelly recalibrated: winRate=${(actualWinRate * 100).toFixed(1)}%, realizedKelly=${realizedKelly.toFixed(3)}`);
    } catch (error) {
      console.error("[Trainer] Kelly calibration failed:", error.message);
      this.logTraining("KELLY", { error: error.message });
    }
  }

  /**
   * Run Monte Carlo simulations for active positions
   */
  async runSimulations() {
    const startTime = Date.now();
    console.log("[Trainer] Running Monte Carlo simulations...");
    
    try {
      // Fetch active positions
      const { data: positions } = await supabase
        .from(TABLES.POSITIONS || "positions")
        .select("*")
        .eq("status", "open");
      
      if (!positions || positions.length === 0) {
        console.log("[Trainer] No active positions to simulate");
        return;
      }
      
      // Get current regime for volatility adjustment
      const regimeHistory = this.regimeDetector.regimeHistory;
      const currentRegime = regimeHistory[regimeHistory.length - 1]?.combined || "NEUTRAL";
      const volMultiplier = currentRegime === "RISK_OFF" ? 1.5 : 1.0;
      
      // Run simulations for each position
      for (const position of positions) {
        const result = await this.simulator.runSimulation({
          ticker: position.ticker,
          initialPrice: position.current_price,
          volatility: (position.volatility || 0.3) * volMultiplier,
          drift: 0,
          positionSize: position.size,
          side: position.side,
        });
        
        // Update position with new risk metrics
        await supabase.from(TABLES.POSITIONS || "positions").update({
          var_95: result.summary.var95,
          var_99: result.summary.var99,
          expected_pnl: result.summary.meanPnl,
          win_probability: result.summary.winRate,
          last_simulation: new Date().toISOString(),
        }).eq("id", position.id);
      }
      
      const duration = Date.now() - startTime;
      this.logTraining("SIMULATION", { positions: positions.length, duration });
      
      console.log(`[Trainer] Simulated ${positions.length} positions in ${duration}ms`);
    } catch (error) {
      console.error("[Trainer] Simulation failed:", error.message);
      this.logTraining("SIMULATION", { error: error.message });
    }
  }

  /**
   * Log training event
   */
  logTraining(type, data) {
    this.trainingLog.push({
      type,
      timestamp: new Date().toISOString(),
      ...data,
    });
    
    // Keep only last 1000 entries
    if (this.trainingLog.length > 1000) {
      this.trainingLog = this.trainingLog.slice(-1000);
    }
  }

  /**
   * Get model metrics
   */
  getModelMetrics() {
    return {
      hmm: {
        trainingHistory: this.hmm.trainingHistory.slice(-10),
        numStates: this.hmm.numStates,
      },
      regime: {
        currentRegime: this.regimeDetector.regimeHistory.slice(-1)[0]?.combined,
        historyLength: this.regimeDetector.regimeHistory.length,
      },
      kelly: {
        maxKelly: this.kelly.maxKelly,
      },
      trainingLog: this.trainingLog.slice(-20),
    };
  }

  /**
   * Get training status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervals: this.intervals,
      lastTraining: this.trainingLog.slice(-5),
      modelVersions: Object.keys(this.modelVersions).slice(-5),
    };
  }
}

export default ContinuousTrainer;
