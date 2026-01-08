/**
 * Trading Worker
 */
import { BaseWorker } from "./base.worker.js";
import { TOPICS } from "../kafka/client.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { tradingAgent } from "../agents/trading.js";

class TradingWorker extends BaseWorker {
  constructor() {
    super("trading", TOPICS.TRADING);
    this.model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  }

  async processTask(task) {
    const { query } = task.payload;

    const prompt = `You are the trading agent. Execute trades via DFlow routing.
Available tools: get_quote, execute_trade
User query: ${query}`;

    const boundModel = this.model.bindTools(tradingAgent.tools);
    const response = await boundModel.invoke([new HumanMessage(prompt)]);

    if (response.tool_calls?.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        const tool = tradingAgent.tools.find((t) => t.name === toolCall.name);
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

const worker = new TradingWorker();
worker.start().catch(console.error);
