/**
 * Health monitoring utilities
 */
import { Kafka } from "kafkajs";
import { TOPICS } from "../kafka/client.js";

export class HealthMonitor {
  constructor(agentType, producer) {
    this.agentType = agentType;
    this.producer = producer;
    this.startTime = Date.now();
    this.stats = {
      tasksProcessed: 0,
      tasksFailed: 0,
      tasksRetried: 0,
      avgProcessingTime: 0,
      lastHeartbeat: null,
    };
    this.processingTimes = [];
    this.heartbeatInterval = null;
  }

  startHeartbeat(intervalMs = 30000) {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
    
    // Send initial heartbeat
    this.sendHeartbeat();
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async sendHeartbeat() {
    const health = this.getHealth();
    this.stats.lastHeartbeat = Date.now();

    try {
      await this.producer.send({
        topic: TOPICS.HEALTH,
        messages: [{
          key: this.agentType,
          value: JSON.stringify({
            type: "HEARTBEAT",
            agent: this.agentType,
            timestamp: Date.now(),
            health,
          }),
        }],
      });
    } catch (error) {
      console.error(`Failed to send heartbeat: ${error.message}`);
    }
  }

  recordTaskStart() {
    return Date.now();
  }

  recordTaskComplete(startTime, success = true) {
    const duration = Date.now() - startTime;
    this.processingTimes.push(duration);
    
    // Keep only last 100 measurements
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }

    if (success) {
      this.stats.tasksProcessed++;
    } else {
      this.stats.tasksFailed++;
    }

    this.stats.avgProcessingTime = 
      this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  recordRetry() {
    this.stats.tasksRetried++;
  }

  getHealth() {
    const uptime = Date.now() - this.startTime;
    const successRate = this.stats.tasksProcessed > 0
      ? (this.stats.tasksProcessed / (this.stats.tasksProcessed + this.stats.tasksFailed)) * 100
      : 100;

    return {
      status: this.determineStatus(successRate),
      agent: this.agentType,
      uptime,
      uptimeHuman: this.formatUptime(uptime),
      stats: {
        ...this.stats,
        successRate: successRate.toFixed(2) + "%",
      },
      memory: process.memoryUsage(),
      timestamp: Date.now(),
    };
  }

  determineStatus(successRate) {
    if (successRate >= 95) return "HEALTHY";
    if (successRate >= 80) return "DEGRADED";
    return "UNHEALTHY";
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// Health aggregator for orchestrator
export class HealthAggregator {
  constructor() {
    this.agentHealth = new Map();
    this.staleThreshold = 60000; // 1 minute
  }

  updateAgentHealth(agentType, health) {
    this.agentHealth.set(agentType, {
      ...health,
      receivedAt: Date.now(),
    });
  }

  getSystemHealth() {
    const agents = {};
    let overallStatus = "HEALTHY";

    for (const [agent, health] of this.agentHealth) {
      const isStale = Date.now() - health.receivedAt > this.staleThreshold;
      
      agents[agent] = {
        ...health,
        stale: isStale,
        status: isStale ? "UNKNOWN" : health.status,
      };

      if (isStale || health.status === "UNHEALTHY") {
        overallStatus = "UNHEALTHY";
      } else if (health.status === "DEGRADED" && overallStatus !== "UNHEALTHY") {
        overallStatus = "DEGRADED";
      }
    }

    return {
      status: overallStatus,
      agents,
      timestamp: Date.now(),
    };
  }

  getStaleAgents() {
    const stale = [];
    for (const [agent, health] of this.agentHealth) {
      if (Date.now() - health.receivedAt > this.staleThreshold) {
        stale.push(agent);
      }
    }
    return stale;
  }
}
