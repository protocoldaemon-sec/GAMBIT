/**
 * Market Discovery Worker
 */
import { BaseWorker } from "./base.worker.js";
import { TOPICS } from "../kafka/client.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { marketDiscoveryAgent } from "../agents/market-discovery.js";

class MarketDiscoveryWorker extends BaseWorker {
  constructor() {
    super("market_discovery", TOPICS.MARKET_DISCOVERY);
    this.model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  }

  async processTask(task) {
    const { query } = task.payload;

    const prompt = `You are the market discovery agent. Find and explore prediction markets.
Available tools: list_markets, get_market_details
User query: ${query}`;

    const boundModel = this.model.bindTools(marketDiscoveryAgent.tools);
    const response = await boundModel.invoke([new HumanMessage(prompt)]);

    // Execute tool calls if any
    if (response.tool_calls?.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        const tool = marketDiscoveryAgent.tools.find((t) => t.name === toolCall.name);
        if (tool) {
          const result = await tool.invoke(toolCall.args);
          toolResults.push({ tool: toolCall.name, result });
        }
      }
      return { response: response.content, toolResults };
    }

    return { response: response.content };
  }
}

const worker = new MarketDiscoveryWorker();
worker.start().catch(console.error);
