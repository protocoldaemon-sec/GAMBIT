/**
 * Orchestrator Worker
 * Routes tasks to agents and aggregates responses
 */
import "dotenv/config";
import { Kafka } from "kafkajs";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { TOPICS, initKafka } from "../kafka/client.js";
import { createTaskRequest, serialize, deserialize } from "../kafka/messages.js";

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID}-orchestrator`,
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "mas-orchestrator" });
const responseConsumer = kafka.consumer({ groupId: "mas-orchestrator-responses" });

const routerModel = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
const pendingRequests = new Map(); // correlationId -> { resolve, reject, responses, expectedAgents }

const AGENT_TOPICS = {
  market_discovery: TOPICS.MARKET_DISCOVERY,
  trading: TOPICS.TRADING,
  analytics: TOPICS.ANALYTICS,
  simulation: TOPICS.SIMULATION,
  risk: TOPICS.RISK,
  solana: TOPICS.SOLANA,
  wallet: TOPICS.WALLET,
};

async function routeToAgents(query, correlationId) {
  const routerPrompt = `You are a router for a prediction market multi-agent system.
Available agents:
- market_discovery: Find and explore prediction markets
- trading: Execute trades via DFlow
- analytics: Analyze market trends and data
- simulation: Run Monte Carlo simulations and predictions
- risk: Calculate risk metrics and position sizing
- solana: Execute on-chain Solana operations (swaps, staking)
- wallet: Handle deposits, withdrawals, balance checks (use for "withdraw", "repay", "pay back", "deposit", "balance")

Based on the user request, return a JSON array of agent names to invoke.
User request: ${query}

Return only valid JSON array, e.g. ["market_discovery"] or ["wallet"]`;

  const response = await routerModel.invoke([new HumanMessage(routerPrompt)]);
  const agentNames = JSON.parse(response.content);

  console.log(`🔀 Routing to agents: ${agentNames.join(", ")}`);

  for (const agentName of agentNames) {
    const topic = AGENT_TOPICS[agentName];
    if (!topic) continue;

    const task = createTaskRequest(agentName, { query }, correlationId);
    await producer.send({
      topic,
      messages: [{ key: correlationId, value: serialize(task) }],
    });
  }

  return agentNames;
}

async function synthesizeResponses(query, responses) {
  const synthesisPrompt = `Synthesize these agent results into a coherent response:
User query: ${query}
Agent results: ${JSON.stringify(responses, null, 2)}`;

  const response = await routerModel.invoke([new HumanMessage(synthesisPrompt)]);
  return response.content;
}

async function handleRequest(message) {
  const request = deserialize(message.value);
  const { correlationId, payload } = request;
  const { query } = payload;

  console.log(`\n📝 New request: ${query}`);

  const expectedAgents = await routeToAgents(query, correlationId);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(correlationId);
      reject(new Error("Request timeout"));
    }, 30000);

    pendingRequests.set(correlationId, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject,
      responses: [],
      expectedAgents,
      query,
    });
  });
}

async function handleResponse(message) {
  const response = deserialize(message.value);
  const { correlationId, agentType, result, error } = response;

  const pending = pendingRequests.get(correlationId);
  if (!pending) return;

  pending.responses.push({ agent: agentType, result, error });

  // Check if all responses received
  if (pending.responses.length >= pending.expectedAgents.length) {
    const synthesized = await synthesizeResponses(pending.query, pending.responses);
    console.log(`\n🤖 Final response:\n${synthesized}\n`);
    pending.resolve(synthesized);
    pendingRequests.delete(correlationId);
  }
}

async function start() {
  await initKafka();
  await producer.connect();
  await consumer.connect();
  await responseConsumer.connect();

  await consumer.subscribe({ topic: TOPICS.REQUESTS, fromBeginning: false });
  await responseConsumer.subscribe({ topic: TOPICS.RESPONSES, fromBeginning: false });

  console.log("🎯 Orchestrator started");

  consumer.run({ eachMessage: async ({ message }) => handleRequest(message) });
  responseConsumer.run({ eachMessage: async ({ message }) => handleResponse(message) });
}

start().catch(console.error);
