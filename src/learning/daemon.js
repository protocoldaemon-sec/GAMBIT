/**
 * Gambit Learning Daemon
 * Main orchestrator for continuous learning and self-healing
 * 
 * Runs 24/7 to:
 * - Retrain models (HMM, regime detection)
 * - Recalibrate Kelly criterion
 * - Run Monte Carlo simulations
 * - Detect and fix vulnerabilities
 * - Adapt to market volatility
 */
import { ContinuousTrainer } from "./trainer.js";
import { SelfHealingAgent } from "./self-healing-agent.js";
import { VulnerabilityLogger } from "./vulnerability-logger.js";
import { supabase, TABLES } from "../supabase/client.js";

export class GambitDaemon {
  constructor(config = {}) {
    this.vulnLogger = new VulnerabilityLogger();
    this.trainer = new ContinuousTrainer(config.trainer);
    this.healer = new SelfHealingAgent({
      vulnLogger: this.vulnLogger,
      ...config.healer,
    });
    
    this.isRunning = false;
    this.startTime = null;
    this.healthCheckInterval = config.healthCheckInterval || 60000;
    this.healthTimer = null;
  }

  /**
   * Start the Gambit daemon
   */
  async start() {
    if (this.isRunning) {
      console.log("[Gambit] Already running");
      return;
    }
    
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║              GAMBIT - Continuous Learning                  ║");
    console.log("║        Adaptive Learning & Dynamic Decision Engine         ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    
    this.isRunning = true;
    this.startTime = new Date();
    
    // Start components
    await this.trainer.start();
    this.healer.start();
    
    // Start health monitoring
    this.healthTimer = setInterval(() => this.healthCheck(), this.healthCheckInterval);
    
    // Log startup
    await this.logEvent("DAEMON_STARTED", { startTime: this.startTime.toISOString() });
    
    console.log("[Gambit] Daemon fully operational");
  }


  /**
   * Stop the daemon
   */
  async stop() {
    console.log("[Gambit] Shutting down...");
    
    this.trainer.stop();
    this.healer.stop();
    
    if (this.healthTimer) clearInterval(this.healthTimer);
    
    await this.logEvent("DAEMON_STOPPED", {
      uptime: Date.now() - this.startTime.getTime(),
    });
    
    this.isRunning = false;
    console.log("[Gambit] Shutdown complete");
  }

  /**
   * Health check
   */
  async healthCheck() {
    const status = this.getStatus();
    
    // Check for issues
    const issues = [];
    
    if (!this.trainer.isRunning) {
      issues.push("Trainer not running");
    }
    
    if (!this.healer.isRunning) {
      issues.push("Self-healing agent not running");
    }
    
    const vulnSummary = this.vulnLogger.getSummary();
    if (vulnSummary.bySeverity.CRITICAL > 0) {
      issues.push(`${vulnSummary.bySeverity.CRITICAL} critical vulnerabilities`);
    }
    
    if (issues.length > 0) {
      console.warn("[Gambit] Health issues:", issues);
      await this.logEvent("HEALTH_WARNING", { issues });
    }
    
    // Store health status
    try {
      await supabase.from(TABLES.HEALTH_CHECKS || "health_checks").insert({
        component: "GAMBIT_DAEMON",
        status: issues.length === 0 ? "HEALTHY" : "DEGRADED",
        details: status,
        issues,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Ignore storage errors
    }
  }

  /**
   * Log event
   */
  async logEvent(type, data) {
    try {
      await supabase.from(TABLES.EVENTS || "events").insert({
        type,
        component: "GAMBIT_DAEMON",
        data,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Gambit] Failed to log event:", error.message);
    }
  }

  /**
   * Get daemon status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      trainer: this.trainer.getStatus(),
      healer: this.healer.getStatus(),
      vulnerabilities: this.vulnLogger.getSummary(),
    };
  }

  /**
   * Get model metrics
   */
  getModelMetrics() {
    return this.trainer.getModelMetrics();
  }

  /**
   * Force retrain all models
   */
  async forceRetrain() {
    console.log("[Gambit] Force retraining all models...");
    await this.trainer.runAllTraining();
  }

  /**
   * Analyze codebase for vulnerabilities
   */
  async analyzeCodebase(files) {
    console.log(`[Gambit] Analyzing ${files.length} files...`);
    
    const allFindings = [];
    for (const file of files) {
      const findings = await this.healer.analyzeFile(file);
      allFindings.push(...findings);
    }
    
    console.log(`[Gambit] Found ${allFindings.length} potential issues`);
    return allFindings;
  }
}

// CLI entry point
if (process.argv[1].includes("daemon.js")) {
  const daemon = new GambitDaemon();
  
  process.on("SIGINT", async () => {
    await daemon.stop();
    process.exit(0);
  });
  
  process.on("SIGTERM", async () => {
    await daemon.stop();
    process.exit(0);
  });
  
  daemon.start().catch(console.error);
}

export default GambitDaemon;
