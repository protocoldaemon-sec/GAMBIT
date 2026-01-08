/**
 * Kalshi-DFlow Federated Multi-Agent System
 * CLI Client for sending requests
 */
import "dotenv/config";
import { Kafka } from "kafkajs";
import { v4 as uuidv4 } from "uuid";
import { TOPICS, initKafka } from "./kafka/client.js";
import { createTaskRequest, serialize, deserialize } from "./kafka/messages.js";

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID}-client`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: `mas-client-${uuidv4()}` });

async function sendQuery(query) {
  const correlationId = uuidv4();
  const task = createTaskRequest("orchestrator", { query }, correlationId);

  await producer.send({
    topic: TOPICS.REQUESTS,
    messages: [{ key: correlationId, value: serialize(task) }],
  });

  console.log(`📤 Sent query: ${query}`);
  return correlationId;
}

async function main() {
  await initKafka();
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.RESPONSES, fromBeginning: false });

  console.log("🚀 Kalshi-DFlow MAS Client\n");

  // Example queries
  const queries = [
    "What prediction markets are currently available?",
    "Analyze the trend for the presidential election market",
    "Get a quote to buy $100 of YES on FED-RATE",
  ];

  // Listen for responses
  consumer.run({
    eachMessage: async ({ message }) => {
      const response = deserialize(message.value);
      console.log(`\n📥 Response from ${response.agentType}:`);
      console.log(JSON.stringify(response.result, null, 2));
    },
  });

  // Send queries with delay
  for (const query of queries) {
    await sendQuery(query);
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Keep running to receive responses
  console.log("\n⏳ Waiting for responses... (Ctrl+C to exit)\n");
}

main().catch(console.error);
