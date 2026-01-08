/**
 * Retry utilities with exponential backoff
 */

export class RetryConfig {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.retryableErrors = options.retryableErrors || [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "RATE_LIMIT",
    ];
  }

  isRetryable(error) {
    if (!error) return false;
    
    // Check error code
    if (this.retryableErrors.includes(error.code)) return true;
    
    // Check for rate limiting
    if (error.status === 429) return true;
    
    // Check for temporary server errors
    if (error.status >= 500 && error.status < 600) return true;
    
    // Check error message
    const message = error.message?.toLowerCase() || "";
    return message.includes("timeout") || 
           message.includes("rate limit") ||
           message.includes("temporarily unavailable");
  }

  getDelay(attempt) {
    const delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.min(delay + jitter, this.maxDelay);
  }
}

export async function withRetry(fn, config = new RetryConfig()) {
  let lastError;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === config.maxRetries || !config.isRetryable(error)) {
        throw error;
      }
      
      const delay = config.getDelay(attempt);
      console.log(`⏳ Retry ${attempt + 1}/${config.maxRetries} after ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Circuit breaker for downstream services
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailure = null;
    this.successCount = 0;
  }

  async execute(fn) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = "HALF_OPEN";
        this.successCount = 0;
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = "CLOSED";
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.log(`🔴 Circuit breaker OPEN after ${this.failures} failures`);
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }
}
