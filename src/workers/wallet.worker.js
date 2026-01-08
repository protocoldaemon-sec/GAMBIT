/**
 * Wallet Worker
 * Handles deposit/withdrawal operations
 */
import { BaseWorker } from "./base.worker.js";
import { TOPICS } from "../kafka/client.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { walletAgent } from "../agents/wallet.js";

class WalletWorker extends BaseWorker {
  constructor() {
    super("wallet", TOPICS.WALLET);
    this.model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  }

  async processTask(task) {
    const { query, userId } = task.payload;

    const prompt = `You are the wallet agent for user ${userId}. Handle deposits, withdrawals, and balance queries.

Available tools:
- check_balance: Check SOL and USDC balance
- withdraw_to_user: Send funds back to user's wallet (use when user says "withdraw", "repay", "pay back", "send back")
- fund_kalshi: Deposit USDC to Kalshi for trading
- get_transaction_history: Get past transactions
- get_deposit_address: Get address for user to deposit

IMPORTANT: Always include userId="${userId}" in tool calls.

User query: ${query}`;

    const boundModel = this.model.bindTools(walletAgent.tools);
    const response = await boundModel.invoke([new HumanMessage(prompt)]);

    if (response.tool_calls?.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        // Inject userId if not provided
        if (!toolCall.args.userId) {
          toolCall.args.userId = userId;
        }
        
        const tool = walletAgent.tools.find((t) => t.name === toolCall.name);
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

const worker = new WalletWorker();
worker.start().catch(console.error);
