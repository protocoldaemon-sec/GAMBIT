/**
 * Analytics Worker
 */
import { BaseWorker } from "./base.worker.js";
import { TOPICS } from "../kafka/client.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { analyticsAgent } from "../agents/analytics.js";

class AnalyticsWorker extends BaseWorker {
  constructor() {
    super("analytics", TOPICS.ANALYTICS);
    this.model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  }

  async processTask(task) {
    const { query } = task.payload;

    const prompt = `You are the analytics agent. Analyze market trends and data.
Available tools: analyze_market_trend, compare_markets
User query: ${query}`;

    const boundModel = this.model.bindTools(analyticsAgent.tools);
    const response = await boundModel.invoke([new HumanMessage(prompt)]);

    if (response.tool_calls?.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        const tool = analyticsAgent.tools.find((t) => t.name === toolCall.name);
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

const worker = new AnalyticsWorker();
worker.start().catch(console.error);
