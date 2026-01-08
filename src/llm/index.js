/**
 * LLM Module
 * Multi-LLM support via OpenRouter
 */
export { 
  MODELS, 
  TASK_MODELS, 
  createClient, 
  getClient, 
  chat, 
  chatWithReasoning, 
  selectModel 
} from "./openrouter.js";

export { MultiLLM, getMultiLLM } from "./multi-llm.js";

export default {
  // Convenience re-exports
};
