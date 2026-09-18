import { McpServer } from "@modelcontextprotocol/server";
import { DESKTETHER_APP_PROFILE } from "./app-profile.js";
import { executeTool } from "./handler.js";
import { createRuntimeFromEnv, type DeskTetherRuntime } from "./runtime.js";
import { getToolDefinitions } from "./tool-catalog.js";

const SERVER_INSTRUCTIONS = [
  "DeskTether exposes controlled access to a local Windows machine.",
  "Prefer read-only inspection tools before write or execution tools.",
  "Treat write, process, PowerShell, termination, and move tools as potentially side-effecting.",
  "Some commands may require a one-time DeskTether confirmation token before execution.",
  "Respect allowed-root path boundaries and do not treat DeskTether as an operating-system sandbox.",
  "Do not place reusable secrets directly in command text because command text may be audited locally.",
].join(" ");

export function createServer(runtime: DeskTetherRuntime = createRuntimeFromEnv()): McpServer {
  const server = new McpServer(
    {
      name: DESKTETHER_APP_PROFILE.name,
      version: DESKTETHER_APP_PROFILE.version,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  for (const tool of getToolDefinitions()) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as any,
        annotations: tool.annotations,
        _meta: tool._meta,
      },
      async (args: any) => (await executeTool(runtime, tool.name, args as Record<string, unknown>)) as any,
    );
  }

  return server;
}
