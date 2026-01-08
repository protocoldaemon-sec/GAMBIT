/**
 * Federated Orchestrator
 * Routes tasks to specialized agents and coordinates multi-agent workflows
 */
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

import { marketDiscoveryAgent } from "./agents/market-discovery.js";
import { tradingAgent } from "./agents/trading.js";
import { analyticsAgent } from "./agents/analytics.js";
import { simulationAgent } from "./agents/simulation.js";
import { riskAgent } from "./agents/risk.js";

const agents = {
  market_discovery: marketDiscoveryAgent,
  trading: tradingAgent,
  analytics: analyticsAgent,
  simulation: simulationAgent,
  risk: riskAgent,
};

const routerModel = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

// Router decides which agent(s) should handle the request
async function routeRequest(state) {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];

  const routerPrompt = `You are a router for a prediction market multi-agent system.
Available agents:
- market_discovery: Find and explore prediction markets
- trading: Execute trades via DFlow
- analytics: Analyze market trends and data
- simulation: Run Monte Carlo simulations and predictions
- risk: Calculate risk metrics and position sizing

Based on the user request, return a JSON array of agent names to invoke.
User request: ${lastMessage.content}

Return only valid JSON array, e.g. ["market_discovery"] or ["simulation", "risk"]`;

  const response = await routerModel.invoke([new HumanMessage(routerPrompt)]);
  const agentNames = JSON.parse(response.content);

  return { ...state, selectedAgents: agentNames };
}

// Execute selected agents
async function executeAgents(state) {
  const { messages, selectedAgents } = state;
  const lastMessage = messages[messages.length - 1];
  const results = [];

  for (const agentName of selectedAgents) {
    const agent = agents[agentName];
    if (!agent) continue;

    const agentPrompt = `You are the ${agent.name} agent. ${agent.description}.
Use your tools to help with: ${lastMessage.content}`;

    const response = await agent.model.bindTools(agent.tools).invoke([
      new HumanMessage(agentPrompt),
    ]);

    results.push({ agent: agentName, response: response.content });
  }

  return { ...state, agentResults: results };
}

// Synthesize final response
async function synthesize(state) {
  const { messages, agentResults } = state;
  const lastMessage = messages[messages.length - 1];

  const synthesisPrompt = `Synthesize these agent results into a coherent response:
User query: ${lastMessage.content}
Agent results: ${JSON.stringify(agentResults, null, 2)}`;

  const response = await routerModel.invoke([new HumanMessage(synthesisPrompt)]);

  return {
    ...state,
    messages: [...messages, new AIMessage(response.content)],
  };
}

// Build the graph
export function createOrchestrator() {
  const graph = new StateGraph({
    channels: {
      messages: { value: (a, b) => [...a, ...b], default: () => [] },
      selectedAgents: { value: (_, b) => b, default: () => [] },
      agentResults: { value: (_, b) => b, default: () => [] },
    },
  });

  graph.addNode("router", routeRequest);
  graph.addNode("execute", executeAgents);
  graph.addNode("synthesize", synthesize);

  graph.setEntryPoint("router");
  graph.addEdge("router", "execute");
  graph.addEdge("execute", "synthesize");
  graph.addEdge("synthesize", END);

  return graph.compile();
}
