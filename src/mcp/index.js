/**
 * Gambit MCP Adapter
 * Model Context Protocol server for exposing Gambit actions as MCP tools
 * Based on solana-agent-kit adapter pattern
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Convert Zod schema to MCP-compatible shape
 */
export function zodToMCPShape(schema) {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error("MCP tools require an object schema at the top level");
  }

  const shape = schema.shape;
  const result = {};

  for (const [key, value] of Object.entries(shape)) {
    result[key] = value instanceof z.ZodOptional ? value.unwrap() : value;
  }

  return { result, keys: Object.keys(result) };
}

/**
 * Create MCP server from Gambit actions
 */
export function createMcpServer(actions, gambitContext, options) {
  const server = new McpServer({
    name: options.name,
    version: options.version,
  });

  for (const action of actions) {
    const { result } = zodToMCPShape(action.schema);

    server.tool(action.name, action.description, result, async (params) => {
      try {
        const result = await action.handler(gambitContext, params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`[MCP] Error in ${action.name}:`, error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : "Unknown error",
            },
          ],
        };
      }
    });

    // Add examples as prompts
    if (action.examples?.length > 0) {
      server.prompt(`${action.name}-examples`, { showIndex: z.string().optional() }, (args) => {
        const showIndex = args.showIndex ? parseInt(args.showIndex) : undefined;
        const examples = action.examples.flat();
        const selected = typeof showIndex === "number" ? [examples[showIndex]] : examples;

        const text = selected
          .map((ex, idx) => `Example ${idx + 1}:\nInput: ${JSON.stringify(ex.input, null, 2)}\nOutput: ${JSON.stringify(ex.output, null, 2)}\nExplanation: ${ex.explanation}`)
          .join("\n\n");

        return {
          messages: [{ role: "user", content: { type: "text", text: `Examples for ${action.name}:\n${text}` } }],
        };
      });
    }
  }

  return server;
}

/**
 * Start MCP server with stdio transport
 */
export async function startMcpServer(actions, gambitContext, options) {
  try {
    const server = createMcpServer(actions, gambitContext, options);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log(`[MCP] Server started: ${options.name} v${options.version}`);
    return server;
  } catch (error) {
    console.error("[MCP] Failed to start server:", error);
    throw error;
  }
}

export default { createMcpServer, startMcpServer, zodToMCPShape };
