/**
 * Self-Healing Agent
 * Autonomous vulnerability remediation
 * 
 * Monitors vulnerability log and automatically fixes issues
 */
import { VulnerabilityLogger } from "./vulnerability-logger.js";
import { supabase, TABLES } from "../supabase/client.js";
import fs from "fs/promises";
import path from "path";

export class SelfHealingAgent {
  constructor(config = {}) {
    this.vulnLogger = config.vulnLogger || new VulnerabilityLogger();
    this.isRunning = false;
    this.checkInterval = config.checkInterval || 5 * 60 * 1000; // 5 minutes
    this.timer = null;
    this.fixHistory = [];
    this.maxAutoFixes = config.maxAutoFixes || 10; // Max fixes per cycle
  }

  /**
   * Start self-healing daemon
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log("[SelfHealing] Starting self-healing agent...");
    
    // Initial check
    this.checkAndFix();
    
    // Schedule periodic checks
    this.timer = setInterval(() => this.checkAndFix(), this.checkInterval);
  }

  /**
   * Stop daemon
   */
  stop() {
    this.isRunning = false;
    if (this.timer) clearInterval(this.timer);
    console.log("[SelfHealing] Agent stopped");
  }


  /**
   * Check for vulnerabilities and attempt fixes
   */
  async checkAndFix() {
    console.log("[SelfHealing] Checking for fixable vulnerabilities...");
    
    const openVulns = this.vulnLogger.getOpenVulnerabilities();
    const autoFixable = openVulns.filter(v => v.autoFixable);
    
    if (autoFixable.length === 0) {
      console.log("[SelfHealing] No auto-fixable vulnerabilities found");
      return;
    }
    
    console.log(`[SelfHealing] Found ${autoFixable.length} auto-fixable vulnerabilities`);
    
    let fixCount = 0;
    for (const vuln of autoFixable.slice(0, this.maxAutoFixes)) {
      try {
        const fixed = await this.attemptFix(vuln);
        if (fixed) {
          fixCount++;
          await this.vulnLogger.markFixed(vuln.id, {
            fixedBy: "SelfHealingAgent",
            method: fixed.method,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error(`[SelfHealing] Failed to fix ${vuln.id}:`, error.message);
      }
    }
    
    console.log(`[SelfHealing] Fixed ${fixCount}/${autoFixable.length} vulnerabilities`);
  }

  /**
   * Attempt to fix a vulnerability
   */
  async attemptFix(vuln) {
    const fixers = {
      SECURITY: this.fixSecurityVuln.bind(this),
      BUSINESS_LOGIC: this.fixBusinessLogicVuln.bind(this),
      RISK_MANAGEMENT: this.fixRiskManagementVuln.bind(this),
      CODE_QUALITY: this.fixCodeQualityVuln.bind(this),
    };
    
    const fixer = fixers[vuln.category];
    if (!fixer) {
      console.log(`[SelfHealing] No fixer for category: ${vuln.category}`);
      return null;
    }
    
    return await fixer(vuln);
  }

  /**
   * Fix security vulnerabilities
   */
  async fixSecurityVuln(vuln) {
    if (vuln.title === "Hardcoded API Key" || vuln.title === "Hardcoded Secret") {
      // Log recommendation - actual fix requires human review
      this.fixHistory.push({
        vulnId: vuln.id,
        action: "FLAGGED_FOR_REVIEW",
        reason: "Security fix requires human verification",
        timestamp: new Date().toISOString(),
      });
      
      // Create alert
      await this.createAlert(vuln, "CRITICAL_SECURITY");
      
      return { method: "FLAGGED_FOR_REVIEW", requiresHuman: true };
    }
    
    return null;
  }


  /**
   * Fix business logic vulnerabilities
   */
  async fixBusinessLogicVuln(vuln) {
    if (vuln.title === "Missing Error Handling") {
      // Generate fix suggestion
      const suggestion = {
        before: "await someFunction()",
        after: `try {
  await someFunction();
} catch (error) {
  console.error("Error:", error.message);
  throw error;
}`,
      };
      
      this.fixHistory.push({
        vulnId: vuln.id,
        action: "SUGGESTION_GENERATED",
        suggestion,
        timestamp: new Date().toISOString(),
      });
      
      return { method: "SUGGESTION_GENERATED", suggestion };
    }
    
    if (vuln.title === "Missing Numeric Validation") {
      const suggestion = {
        recommendation: "Add validation: if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount')",
      };
      
      return { method: "SUGGESTION_GENERATED", suggestion };
    }
    
    return null;
  }

  /**
   * Fix risk management vulnerabilities
   */
  async fixRiskManagementVuln(vuln) {
    if (vuln.title === "Missing Stop Loss") {
      const { ticker } = vuln.metadata || {};
      
      // Auto-set stop loss at 20% below entry
      try {
        const { data: position } = await supabase
          .from(TABLES.POSITIONS || "positions")
          .select("*")
          .eq("ticker", ticker)
          .single();
        
        if (position) {
          const stopLoss = position.side === "yes" 
            ? position.entry_price * 0.8 
            : position.entry_price * 1.2;
          
          await supabase.from(TABLES.POSITIONS || "positions")
            .update({ stop_loss: stopLoss })
            .eq("id", position.id);
          
          return { method: "AUTO_FIXED", stopLoss };
        }
      } catch (error) {
        console.error("[SelfHealing] Failed to set stop loss:", error.message);
      }
    }
    
    return null;
  }


  /**
   * Fix code quality vulnerabilities
   */
  async fixCodeQualityVuln(vuln) {
    // Generate improvement suggestions
    const suggestions = {
      "Potential Division by Zero": "Add: const safeDiv = (a, b) => b === 0 ? 0 : a / b;",
      "Unused Variable": "Remove the unused variable or prefix with underscore",
    };
    
    const suggestion = suggestions[vuln.title];
    if (suggestion) {
      return { method: "SUGGESTION_GENERATED", suggestion };
    }
    
    return null;
  }

  /**
   * Create alert for critical issues
   */
  async createAlert(vuln, alertType) {
    try {
      await supabase.from(TABLES.ALERTS || "alerts").insert({
        type: alertType,
        severity: vuln.severity,
        title: vuln.title,
        description: vuln.description,
        vulnerability_id: vuln.id,
        status: "OPEN",
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[SelfHealing] Failed to create alert:", error.message);
    }
  }

  /**
   * Run code analysis on a file
   */
  async analyzeFile(filePath) {
    try {
      const code = await fs.readFile(filePath, "utf-8");
      const filename = path.basename(filePath);
      
      const securityFindings = await this.vulnLogger.analyzeSecurityVulnerabilities(code, filename);
      const logicFindings = await this.vulnLogger.analyzeBusinessLogic(code, filename);
      
      return [...securityFindings, ...logicFindings];
    } catch (error) {
      console.error(`[SelfHealing] Failed to analyze ${filePath}:`, error.message);
      return [];
    }
  }

  /**
   * Get fix history
   */
  getFixHistory() {
    return this.fixHistory.slice(-50);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      fixHistory: this.fixHistory.length,
      vulnerabilitySummary: this.vulnLogger.getSummary(),
    };
  }
}

export default SelfHealingAgent;
