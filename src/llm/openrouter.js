/**
 * OpenRouter Multi-LLM Client
 * Supports multiple models including reasoning-enabled models
 */
import OpenAI from "openai";

// Available models with their capabilities
export const MODELS = {
  // Reasoning models
  DEEPSEEK_V3: {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    reasoning: true,
    costTier: "low",
  },
  NEMOTRON: {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    name: "Nemotron 3 Nano",
    reasoning: true,
    costTier: "free",
  },
  
  // Free models
  DEVSTRAL: {
    id: "mistralai/devstral-2512:free",
    name: "Devstral",
    reasoning: false,
    costTier: "free",
  },
  DEEPSEEK_NEX: {
    id: "nex-agi/deepseek-v3.1-nex-n1:free",
    name: "DeepSeek NEX",
    reasoning: false,
    costTier: "free",
  },
  
  // Premium models
  GPT4O: {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    reasoning: false,
    costTier: "high",
  },
  CLAUDE_SONNET: {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    reasoning: false,
    costTier: "high",
  },
  GEMINI_PRO: {
    id: "google/gemini-2.5-pro-preview",
    name: "Gemini 2.5 Pro",
    reasoning: false,
    costTier: "medium",
  },
};

// Model selection by task
export const TASK_MODELS = {
  REASONING: MODELS.NEMOTRON,      // Free reasoning model
  ANALYSIS: MODELS.DEVSTRAL,       // Free
  CODING: MODELS.DEVSTRAL,         // Free
  GENERAL: MODELS.DEEPSEEK_NEX,    // Free
  SENTIMENT: MODELS.NEMOTRON,      // Free
  DEFAULT: MODELS.DEVSTRAL,        // Free
};

// Free model for agents
export const FREE_MODEL = MODELS.DEVSTRAL;

/**
 * Create OpenRouter client
 */
export function createClient(apiKey = null) {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKey || process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      "HTTP-Referer": process.env.SITE_URL || "https://gambit.app",
      "X-Title": "Gambit",
    },
  });
}

let defaultClient = null;

export function getClient() {
  if (!defaultClient) {
    defaultClient = createClient();
  }
  return defaultClient;
}


/**
 * Chat completion with optional reasoning
 */
export async function chat(messages, options = {}) {
  const client = getClient();
  const model = options.model || TASK_MODELS.DEFAULT;
  const enableReasoning = options.reasoning && model.reasoning;

  const requestOptions = {
    model: model.id,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
  };

  if (enableReasoning) {
    requestOptions.reasoning = { enabled: true };
  }

  const response = await client.chat.completions.create(requestOptions);
  const message = response.choices[0].message;

  return {
    content: message.content,
    reasoning: message.reasoning_details || null,
    model: model.id,
    usage: response.usage,
  };
}

/**
 * Chat with reasoning chain (multi-turn)
 */
export async function chatWithReasoning(initialPrompt, followUps = [], options = {}) {
  const client = getClient();
  const model = options.model || TASK_MODELS.REASONING;

  if (!model.reasoning) {
    throw new Error(`Model ${model.id} does not support reasoning`);
  }

  const messages = [{ role: "user", content: initialPrompt }];
  const responses = [];

  // First call with reasoning
  const firstResponse = await client.chat.completions.create({
    model: model.id,
    messages,
    reasoning: { enabled: true },
  });

  const firstMessage = firstResponse.choices[0].message;
  responses.push({
    content: firstMessage.content,
    reasoning: firstMessage.reasoning_details,
  });

  // Add assistant response with reasoning details
  messages.push({
    role: "assistant",
    content: firstMessage.content,
    reasoning_details: firstMessage.reasoning_details,
  });

  // Process follow-ups
  for (const followUp of followUps) {
    messages.push({ role: "user", content: followUp });

    const response = await client.chat.completions.create({
      model: model.id,
      messages,
      reasoning: { enabled: true },
    });

    const message = response.choices[0].message;
    responses.push({
      content: message.content,
      reasoning: message.reasoning_details,
    });

    messages.push({
      role: "assistant",
      content: message.content,
      reasoning_details: message.reasoning_details,
    });
  }

  return {
    responses,
    fullConversation: messages,
    model: model.id,
  };
}

/**
 * Select best model for task
 */
export function selectModel(task, options = {}) {
  const { preferFree = false, needsReasoning = false } = options;

  if (needsReasoning) {
    return preferFree ? MODELS.NEMOTRON : MODELS.DEEPSEEK_V3;
  }

  const taskModel = TASK_MODELS[task.toUpperCase()];
  if (taskModel) {
    if (preferFree && taskModel.costTier !== "free") {
      return MODELS.DEVSTRAL;
    }
    return taskModel;
  }

  return preferFree ? MODELS.DEVSTRAL : TASK_MODELS.DEFAULT;
}

export default { 
  MODELS, 
  TASK_MODELS, 
  FREE_MODEL,
  createClient, 
  getClient, 
  chat, 
  chatWithReasoning, 
  selectModel 
};
