/**
 * Kafka Message Types & Helpers
 */
import { v4 as uuidv4 } from "uuid";

export const MessageType = {
  TASK_REQUEST: "TASK_REQUEST",
  TASK_RESPONSE: "TASK_RESPONSE",
  AGENT_HEARTBEAT: "AGENT_HEARTBEAT",
};

export function createTaskRequest(agentType, payload, correlationId = null) {
  return {
    id: uuidv4(),
    correlationId: correlationId || uuidv4(),
    type: MessageType.TASK_REQUEST,
    agentType,
    payload,
    timestamp: Date.now(),
  };
}

export function createTaskResponse(correlationId, agentType, result, error = null) {
  return {
    id: uuidv4(),
    correlationId,
    type: MessageType.TASK_RESPONSE,
    agentType,
    result,
    error,
    timestamp: Date.now(),
  };
}

export function serialize(message) {
  return JSON.stringify(message);
}

export function deserialize(buffer) {
  return JSON.parse(buffer.toString());
}
