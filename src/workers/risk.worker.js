/**
 * Risk Management Worker
 */
import { BaseWorker } from "./base.worker.js";
import { TOPICS } from "../kafka/client.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { riskAgent } from "../agents/risk.js";

class RiskWorker extends BaseWorker {
  constructor() {
    super("risk", TOPICS.RISK);
    this.model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  }

  async processTask(task) {
    const { query } = task.payload;

    const prompt = `You are the risk management agent. Calculate risk metrics and position sizing.
Available tools: calculate_risk_metrics, calculate_position_size, assess_portfolio_risk
User query: ${query}`;

    const boundModel = this.model.bindTools(riskAgent.tools);
    const response = await boundModel.invoke([new HumanMessage(prompt)]);

    if (response.tool_calls?.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        const tool = riskAgent.tools.find((t) => t.name === toolCall.name);
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

const worker = new RiskWorker();
worker.start().catch(console.error);
