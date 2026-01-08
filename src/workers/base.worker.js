/**
 * Base Worker - Abstract class for agent workers
 */
import "dotenv/config";
import { Kafka } from "kafkajs";
import { TOPICS } from "../kafka/client.js";
import { createTaskResponse, serialize, deserialize } from "../kafka/messages.js";
import { HealthMonitor } from "../utils/health.js";
import { DeadLetterHandler } from "../utils/dead-letter.js";
import { RetryConfig, withRetry } from "../utils/retry.js";

export class BaseWorker {
  constructor(agentType, inputTopic, options = {}) {
    this.agentType = agentType;
    this.inputTopic = inputTopic;
    this.options = {
      maxRetries: options.maxRetries || 3,
      healthHeartbeatMs: options.healthHeartbeatMs || 30000,
      ...options,
    };

    const kafka = new Kafka({
      clientId: `${process.env.KAFKA_CLIENT_ID}-${agentType}`,
      brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
    });

    this.producer = kafka.producer();
    this.consumer = kafka.consumer({ groupId: `mas-${agentType}` });
    
    this.healthMonitor = new HealthMonitor(agentType, this.producer);
    this.deadLetterHandler = new DeadLetterHandler(this.producer);
    this.retryConfig = new RetryConfig({ maxRetries: this.options.maxRetries });
  }

  async start() {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.inputTopic, fromBeginning: false });

    // Start health heartbeat
    this.healthMonitor.startHeartbeat(this.options.healthHeartbeatMs);

    console.log(`🤖 ${this.agentType} worker started, listening on ${this.inputTopic}`);

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const task = deserialize(message.value);
        const retryCount = parseInt(message.headers?.["x-retry-count"]?.toString() || "0");
        
        console.log(`📥 ${this.agentType} received task: ${task.correlationId} (retry: ${retryCount})`);

        const startTime = this.healthMonitor.recordTaskStart();

        try {
          // Execute with retry
          const result = await withRetry(
            () => this.processTask(task),
            this.retryConfig
          );

          const response = createTaskResponse(task.correlationId, this.agentType, result);

          await this.producer.send({
            topic: TOPICS.RESPONSES,
            messages: [{ key: task.correlationId, value: serialize(response) }],
          });

          this.healthMonitor.recordTaskComplete(startTime, true);
          console.log(`📤 ${this.agentType} sent response: ${task.correlationId}`);
          
        } catch (error) {
          this.healthMonitor.recordTaskComplete(startTime, false);
          
          const newRetryCount = retryCount + 1;
          
          if (newRetryCount <= this.options.maxRetries && this.retryConfig.isRetryable(error)) {
            // Retry by re-sending to same topic
            this.healthMonitor.recordRetry();
            console.log(`🔄 Retrying task ${task.correlationId} (attempt ${newRetryCount})`);
            
            await this.producer.send({
              topic: this.inputTopic,
              messages: [{
                key: task.correlationId,
                value: serialize(task),
                headers: { "x-retry-count": String(newRetryCount) },
              }],
            });
          } else {
            // Send to dead letter queue
            await this.deadLetterHandler.sendToDeadLetter(task, error, {
              originalTopic: this.inputTopic,
              agentType: this.agentType,
              retryCount: newRetryCount,
            });

            // Send error response
            const response = createTaskResponse(
              task.correlationId,
              this.agentType,
              null,
              error.message
            );
            await this.producer.send({
              topic: TOPICS.RESPONSES,
              messages: [{ key: task.correlationId, value: serialize(response) }],
            });
          }
          
          console.error(`❌ ${this.agentType} error:`, error.message);
        }
      },
    });
  }

  // Override in subclasses
  async processTask(_task) {
    throw new Error("processTask must be implemented");
  }

  async stop() {
    this.healthMonitor.stopHeartbeat();
    await this.consumer.disconnect();
    await this.producer.disconnect();
    console.log(`🛑 ${this.agentType} worker stopped`);
  }

  getHealth() {
    return this.healthMonitor.getHealth();
  }
}
