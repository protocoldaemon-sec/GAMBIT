/**
 * Health Monitor Worker
 * Aggregates health from all agents and exposes HTTP endpoint
 */
import "dotenv/config";
import http from "http";
import { Kafka } from "kafkajs";
import { TOPICS } from "../kafka/client.js";
import { HealthAggregator } from "../utils/health.js";
import { deserialize } from "../kafka/messages.js";

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID}-health-monitor`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "mas-health-monitor" });
const healthAggregator = new HealthAggregator();

// HTTP server for health endpoint
const PORT = process.env.HEALTH_PORT || 3001;

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/health" || req.url === "/") {
    const health = healthAggregator.getSystemHealth();
    const statusCode = health.status === "HEALTHY" ? 200 : 
                       health.status === "DEGRADED" ? 200 : 503;
    res.writeHead(statusCode);
    res.end(JSON.stringify(health, null, 2));
  } else if (req.url === "/health/agents") {
    const health = healthAggregator.getSystemHealth();
    res.writeHead(200);
    res.end(JSON.stringify(health.agents, null, 2));
  } else if (req.url === "/health/stale") {
    const stale = healthAggregator.getStaleAgents();
    res.writeHead(200);
    res.end(JSON.stringify({ staleAgents: stale }, null, 2));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

async function start() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.HEALTH, fromBeginning: false });

  console.log("🏥 Health Monitor started");

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`🌐 Health endpoint: http://localhost:${PORT}/health`);
  });

  // Listen for heartbeats
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const healthMessage = JSON.parse(message.value.toString());
        
        if (healthMessage.type === "HEARTBEAT") {
          healthAggregator.updateAgentHealth(healthMessage.agent, healthMessage.health);
          console.log(`💓 Heartbeat from ${healthMessage.agent}: ${healthMessage.health.status}`);
        }
      } catch (error) {
        console.error("Failed to process health message:", error.message);
      }
    },
  });

  // Periodic stale check
  setInterval(() => {
    const stale = healthAggregator.getStaleAgents();
    if (stale.length > 0) {
      console.log(`⚠️ Stale agents detected: ${stale.join(", ")}`);
    }
  }, 60000);
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down health monitor...");
  server.close();
  await consumer.disconnect();
  process.exit(0);
});

start().catch(console.error);
