/**
 * LLM Module
 * Multi-LLM support via OpenRouter
 */
export { 
  MODELS, 
  TASK_MODELS, 
  FREE_MODEL,
  createClient, 
  getClient, 
  chat, 
  chatWithReasoning, 
  selectModel 
} from "./openrouter.js";

export { MultiLLM, getMultiLLM } from "./multi-llm.js";

import { ChatOpenAI } from "@langchain/openai";
import { FREE_MODEL } from "./openrouter.js";

/**
 * Get a free ChatOpenAI model for agents
 * Uses OpenRouter with free tier models
 */
export function getFreeAgentModel(options = {}) {
  return new ChatOpenAI({
    modelName: FREE_MODEL.id,
    temperature: options.temperature ?? 0,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.SITE_URL || "https://gambit.app",
        "X-Title": "Gambit",
      },
    },
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

export default {
  getFreeAgentModel,
};
