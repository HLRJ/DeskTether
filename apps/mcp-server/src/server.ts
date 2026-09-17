import { McpServer } from "@modelcontextprotocol/server";
import { executeTool } from "./handler.js";
import { createRuntimeFromEnv, type DeskTetherRuntime } from "./runtime.js";
import { getToolDefinitions } from "./tool-catalog.js";

export function createServer(runtime: DeskTetherRuntime = createRuntimeFromEnv()): McpServer {
  const server = new McpServer({
    name: "DeskTether",
    version: "0.1.0",
  });

  for (const tool of getToolDefinitions()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema as any,
      },
      async (args: any) => (await executeTool(runtime, tool.name, args as Record<string, unknown>)) as any,
    );
  }

  return server;
}
