/**
 * Dead Letter Queue Worker
 * Processes failed messages for inspection and potential reprocessing
 */
import "dotenv/config";
import http from "http";
import { Kafka } from "kafkajs";
import { TOPICS } from "../kafka/client.js";
import { serialize } from "../kafka/messages.js";

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID}-dlq-processor`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "mas-dlq-processor" });
const producer = kafka.producer();

// In-memory store for DLQ messages (in production, use a database)
const dlqMessages = [];
const MAX_STORED = 1000;

const PORT = process.env.DLQ_PORT || 3002;

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url === "/dlq") {
    res.writeHead(200);
    res.end(JSON.stringify({
      count: dlqMessages.length,
      messages: dlqMessages.slice(-50), // Last 50
    }, null, 2));
  } 
  else if (req.method === "GET" && req.url === "/dlq/stats") {
    const stats = {
      total: dlqMessages.length,
      byAgent: {},
      byError: {},
    };

    for (const msg of dlqMessages) {
      const agent = msg.metadata?.agentType || "unknown";
      const errorType = msg.error?.message?.split(":")[0] || "unknown";
      
      stats.byAgent[agent] = (stats.byAgent[agent] || 0) + 1;
      stats.byError[errorType] = (stats.byError[errorType] || 0) + 1;
    }

    res.writeHead(200);
    res.end(JSON.stringify(stats, null, 2));
  }
  else if (req.method === "POST" && req.url?.startsWith("/dlq/retry/")) {
    const index = parseInt(req.url.split("/").pop());
    const message = dlqMessages[index];

    if (!message) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Message not found" }));
      return;
    }

    try {
      const originalTopic = message.metadata?.originalTopic;
      if (!originalTopic) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "No original topic found" }));
        return;
      }

      await producer.send({
        topic: originalTopic,
        messages: [{
          key: message.originalMessage?.correlationId,
          value: serialize(message.originalMessage),
          headers: { "x-retry-count": "0", "x-from-dlq": "true" },
        }],
      });

      // Remove from DLQ
      dlqMessages.splice(index, 1);

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: "Message requeued" }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }
  else if (req.method === "DELETE" && req.url?.startsWith("/dlq/")) {
    const index = parseInt(req.url.split("/").pop());
    
    if (index >= 0 && index < dlqMessages.length) {
      dlqMessages.splice(index, 1);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Message not found" }));
    }
  }
  else if (req.method === "DELETE" && req.url === "/dlq") {
    const count = dlqMessages.length;
    dlqMessages.length = 0;
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, cleared: count }));
  }
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

async function start() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.DEAD_LETTER, fromBeginning: true });

  console.log("💀 DLQ Worker started");

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`🌐 DLQ endpoint: http://localhost:${PORT}/dlq`);
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const dlqMessage = JSON.parse(message.value.toString());
        
        console.log(`💀 DLQ received: ${dlqMessage.originalMessage?.correlationId}`);
        console.log(`   Agent: ${dlqMessage.metadata?.agentType}`);
        console.log(`   Error: ${dlqMessage.error?.message}`);
        console.log(`   Retries: ${dlqMessage.metadata?.retryCount}`);

        // Store message
        dlqMessages.push({
          ...dlqMessage,
          receivedAt: Date.now(),
          index: dlqMessages.length,
        });

        // Trim if too many
        if (dlqMessages.length > MAX_STORED) {
          dlqMessages.shift();
        }
      } catch (error) {
        console.error("Failed to process DLQ message:", error.message);
      }
    },
  });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down DLQ worker...");
  server.close();
  await consumer.disconnect();
  await producer.disconnect();
  process.exit(0);
});

start().catch(console.error);
