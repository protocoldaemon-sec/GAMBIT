/**
 * Solana Worker
 * Handles on-chain Solana operations
 */
import { BaseWorker } from "./base.worker.js";
import { TOPICS } from "../kafka/client.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { solanaAgent } from "../agents/solana.js";

class SolanaWorker extends BaseWorker {
  constructor() {
    super("solana", TOPICS.SOLANA);
    this.model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  }

  async processTask(task) {
    const { query, userId } = task.payload;

    const prompt = `You are the Solana blockchain agent. Execute on-chain operations.
Available tools: get_sol_balance, get_token_balance, transfer_sol, transfer_token, get_transaction

IMPORTANT: Always include userId="${userId}" in tool calls that require it.

User query: ${query}`;

    const boundModel = this.model.bindTools(solanaAgent.tools);
    const response = await boundModel.invoke([new HumanMessage(prompt)]);

    if (response.tool_calls?.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        // Inject userId if not provided
        if (!toolCall.args.userId && userId) {
          toolCall.args.userId = userId;
        }
        
        const tool = solanaAgent.tools.find((t) => t.name === toolCall.name);
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

const worker = new SolanaWorker();
worker.start().catch(console.error);
