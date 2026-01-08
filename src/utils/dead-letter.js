/**
 * Dead Letter Queue handler
 */
import { TOPICS } from "../kafka/client.js";

export class DeadLetterHandler {
  constructor(producer) {
    this.producer = producer;
  }

  async sendToDeadLetter(originalMessage, error, metadata = {}) {
    const deadLetterMessage = {
      originalMessage,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
      },
      metadata: {
        ...metadata,
        sentToDLQ: Date.now(),
        retryCount: metadata.retryCount || 0,
      },
    };

    try {
      await this.producer.send({
        topic: TOPICS.DEAD_LETTER,
        messages: [{
          key: originalMessage.correlationId || "unknown",
          value: JSON.stringify(deadLetterMessage),
          headers: {
            "x-original-topic": metadata.originalTopic || "unknown",
            "x-error-type": error.name || "Error",
            "x-retry-count": String(metadata.retryCount || 0),
          },
        }],
      });

      console.log(`💀 Message sent to DLQ: ${originalMessage.correlationId}`);
      return true;
    } catch (dlqError) {
      console.error(`Failed to send to DLQ: ${dlqError.message}`);
      return false;
    }
  }
}

// DLQ Consumer for reprocessing
export class DeadLetterConsumer {
  constructor(kafka, handlers = {}) {
    this.consumer = kafka.consumer({ groupId: "mas-dlq-processor" });
    this.handlers = handlers;
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPICS.DEAD_LETTER, fromBeginning: true });

    console.log("💀 DLQ Consumer started");

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const dlqMessage = JSON.parse(message.value.toString());
        console.log(`💀 DLQ message received: ${dlqMessage.originalMessage?.correlationId}`);
        
        // Log for manual inspection
        console.log("  Error:", dlqMessage.error?.message);
        console.log("  Retry count:", dlqMessage.metadata?.retryCount);
        
        // Call custom handler if provided
        if (this.handlers.onMessage) {
          await this.handlers.onMessage(dlqMessage);
        }
      },
    });
  }

  async stop() {
    await this.consumer.disconnect();
  }
}
