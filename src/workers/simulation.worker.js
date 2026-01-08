/**
 * Simulation Worker
 */
import { BaseWorker } from "./base.worker.js";
import { TOPICS } from "../kafka/client.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { simulationAgent } from "../agents/simulation.js";

class SimulationWorker extends BaseWorker {
  constructor() {
    super("simulation", TOPICS.SIMULATION);
    this.model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  }

  async processTask(task) {
    const { query } = task.payload;

    const prompt = `You are the simulation agent. Run Monte Carlo simulations and predictions.
Available tools: run_monte_carlo, run_stress_test, predict_outcome
User query: ${query}`;

    const boundModel = this.model.bindTools(simulationAgent.tools);
    const response = await boundModel.invoke([new HumanMessage(prompt)]);

    if (response.tool_calls?.length > 0) {
      const toolResults = [];
      for (const toolCall of response.tool_calls) {
        const tool = simulationAgent.tools.find((t) => t.name === toolCall.name);
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

const worker = new SimulationWorker();
worker.start().catch(console.error);
