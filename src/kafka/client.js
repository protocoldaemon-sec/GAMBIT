/**
 * Kafka Client Configuration
 */
import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "kalshi-dflow-mas",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: "mas-agents" });

// Topic definitions
export const TOPICS = {
  REQUESTS: "agent.requests",
  MARKET_DISCOVERY: "agent.market-discovery",
  TRADING: "agent.trading",
  ANALYTICS: "agent.analytics",
  SIMULATION: "agent.simulation",
  RISK: "agent.risk",
  SOLANA: "agent.solana",
  WALLET: "agent.wallet",
  RESPONSES: "agent.responses",
  DEAD_LETTER: "agent.dead-letter",
  HEALTH: "agent.health",
  MARKET_DATA: "market.data",
  INTELLIGENCE: "agent.intelligence",
  SEARCH: "agent.search",
};

export async function initKafka() {
  const admin = kafka.admin();
  await admin.connect();

  const existingTopics = await admin.listTopics();
  const topicsToCreate = Object.values(TOPICS).filter(
    (t) => !existingTopics.includes(t)
  );

  if (topicsToCreate.length > 0) {
    await admin.createTopics({
      topics: topicsToCreate.map((topic) => ({
        topic,
        numPartitions: 3,
        replicationFactor: 1,
      })),
    });
    console.log(`Created topics: ${topicsToCreate.join(", ")}`);
  }

  await admin.disconnect();
}

export { kafka };

/**
 * Get connected Kafka producer
 */
export async function getKafkaProducer() {
  await producer.connect();
  return producer;
}

/**
 * Get connected Kafka consumer
 */
export async function getKafkaConsumer(groupId) {
  const cons = kafka.consumer({ groupId });
  await cons.connect();
  return cons;
}
