/**
 * Multi-LLM Orchestrator
 * Routes tasks to appropriate models and handles fallbacks
 */
import { chat, chatWithReasoning, selectModel, MODELS, TASK_MODELS } from "./openrouter.js";

/**
 * Multi-LLM Manager
 */
export class MultiLLM {
  constructor(config = {}) {
    this.defaultModel = config.defaultModel || TASK_MODELS.DEFAULT;
    this.preferFree = config.preferFree ?? true;
    this.fallbackEnabled = config.fallbackEnabled ?? true;
    this.maxRetries = config.maxRetries || 2;
    
    // Model usage tracking
    this.usage = {
      calls: 0,
      tokens: { prompt: 0, completion: 0 },
      byModel: {},
    };
  }

  /**
   * Simple completion
   */
  async complete(prompt, options = {}) {
    const messages = [{ role: "user", content: prompt }];
    return this.chat(messages, options);
  }

  /**
   * Chat completion with model selection
   */
  async chat(messages, options = {}) {
    const model = options.model || this.selectModelForTask(options.task);
    
    let lastError;
    const modelsToTry = this.getModelFallbacks(model);

    for (const tryModel of modelsToTry) {
      try {
        const result = await chat(messages, {
          ...options,
          model: tryModel,
        });

        this.trackUsage(tryModel, result.usage);
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`[MultiLLM] ${tryModel.id} failed:`, error.message);
        
        if (!this.fallbackEnabled) break;
      }
    }

    throw lastError || new Error("All models failed");
  }

  /**
   * Reasoning-enabled completion
   */
  async reason(prompt, options = {}) {
    const model = options.model || selectModel("reasoning", { 
      preferFree: this.preferFree,
      needsReasoning: true,
    });

    if (!model.reasoning) {
      // Fallback to regular completion with explicit reasoning request
      return this.complete(
        `Think step by step and explain your reasoning:\n\n${prompt}`,
        { ...options, model }
      );
    }

    const result = await chat(
      [{ role: "user", content: prompt }],
      { ...options, model, reasoning: true }
    );

    this.trackUsage(model, result.usage);
    return result;
  }


  /**
   * Multi-turn reasoning conversation
   */
  async reasonChain(initialPrompt, followUps = [], options = {}) {
    const model = options.model || selectModel("reasoning", {
      preferFree: this.preferFree,
      needsReasoning: true,
    });

    const result = await chatWithReasoning(initialPrompt, followUps, {
      ...options,
      model,
    });

    return result;
  }

  /**
   * Analyze with best model for analysis tasks
   */
  async analyze(content, analysisType, options = {}) {
    const model = selectModel("analysis", { preferFree: this.preferFree });
    
    const prompt = this.buildAnalysisPrompt(content, analysisType);
    return this.complete(prompt, { ...options, model });
  }

  /**
   * Sentiment analysis optimized
   */
  async analyzeSentiment(text, context = {}) {
    const model = selectModel("sentiment", { preferFree: this.preferFree });
    
    const prompt = `Analyze the sentiment of this text.
${context.marketTitle ? `Context: Related to market "${context.marketTitle}"` : ""}

Text: ${text.slice(0, 3000)}

Respond in JSON:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    const result = await this.complete(prompt, { model, temperature: 0 });
    
    try {
      const content = result.content.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(content);
    } catch {
      return { sentiment: "NEUTRAL", confidence: 0.5, reasoning: "Parse error" };
    }
  }

  /**
   * Build analysis prompt based on type
   */
  buildAnalysisPrompt(content, type) {
    const prompts = {
      market: `Analyze this market data and provide insights:\n${content}`,
      news: `Analyze this news article for trading relevance:\n${content}`,
      risk: `Analyze the risk factors in this scenario:\n${content}`,
      trend: `Identify trends and patterns in this data:\n${content}`,
    };
    
    return prompts[type] || `Analyze the following:\n${content}`;
  }

  /**
   * Select model for task
   */
  selectModelForTask(task) {
    if (!task) return this.defaultModel;
    return selectModel(task, { preferFree: this.preferFree });
  }

  /**
   * Get fallback models
   */
  getModelFallbacks(primaryModel) {
    const models = [primaryModel];
    
    if (!this.fallbackEnabled) return models;

    // Add fallbacks based on cost tier
    if (primaryModel.costTier === "high") {
      models.push(MODELS.GEMINI_PRO, MODELS.DEEPSEEK_V3);
    } else if (primaryModel.costTier === "medium") {
      models.push(MODELS.DEEPSEEK_V3, MODELS.DEVSTRAL);
    }
    
    // Always add free fallback
    if (primaryModel.costTier !== "free") {
      models.push(MODELS.DEVSTRAL);
    }

    return models.slice(0, this.maxRetries + 1);
  }

  /**
   * Track usage
   */
  trackUsage(model, usage) {
    this.usage.calls++;
    
    if (usage) {
      this.usage.tokens.prompt += usage.prompt_tokens || 0;
      this.usage.tokens.completion += usage.completion_tokens || 0;
    }

    if (!this.usage.byModel[model.id]) {
      this.usage.byModel[model.id] = { calls: 0, tokens: 0 };
    }
    this.usage.byModel[model.id].calls++;
    this.usage.byModel[model.id].tokens += (usage?.total_tokens || 0);
  }

  /**
   * Get usage stats
   */
  getUsage() {
    return { ...this.usage };
  }

  /**
   * Reset usage stats
   */
  resetUsage() {
    this.usage = {
      calls: 0,
      tokens: { prompt: 0, completion: 0 },
      byModel: {},
    };
  }
}

// Singleton instance
let instance = null;

export function getMultiLLM(config = {}) {
  if (!instance) {
    instance = new MultiLLM(config);
  }
  return instance;
}

export default { MultiLLM, getMultiLLM };
