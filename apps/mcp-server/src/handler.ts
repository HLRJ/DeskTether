import {
  getDeviceInfo,
  gitDiff,
  gitLog,
  gitStatus,
  killProcess,
  listProcesses,
} from "@desktether/core";
import { getToolDefinitions } from "./tool-catalog.js";
import type { DeskTetherRuntime } from "./runtime.js";

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function textResult(value: unknown, isError = false): McpToolResult {
  const text = typeof value === "string"
    ? value
    : value === undefined
      ? "OK"
      : JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
async function dispatch(runtime: DeskTetherRuntime, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "device_info":
      return getDeviceInfo();
    case "list_directory":
      return runtime.filesystem.list(String(args.path));
    case "read_text_file":
      return runtime.filesystem.readText(String(args.path));
    case "write_text_file":
      await runtime.filesystem.writeText(String(args.path), String(args.content));
      return { ok: true };
    case "start_process":
      return runtime.processes.start(String(args.command), String(args.cwd));
    case "read_process_output":
      return runtime.processes.read(String(args.sessionId));
    case "write_process_input":
      runtime.processes.write(String(args.sessionId), String(args.input));
      return { ok: true };
    case "terminate_process":
      await runtime.processes.terminate(String(args.sessionId));
      return { ok: true };
    case "list_sessions":
      return runtime.processes.list();
    case "list_processes":
      return listProcesses();
    case "kill_process":
      await killProcess(Number(args.pid));
      return { ok: true };
    case "start_search":
      return runtime.searches.start({
        root: String(args.root),
        pattern: String(args.pattern),
        mode: args.mode as "files" | "content",
        maxResults: args.maxResults === undefined ? undefined : Number(args.maxResults),
      });
    case "get_search_results":
      return runtime.searches.read(
        String(args.sessionId),
        args.offset === undefined ? 0 : Number(args.offset),
        args.length === undefined ? 100 : Number(args.length),
      );
    case "stop_search":
      runtime.searches.cancel(String(args.sessionId));
      return { ok: true };
    case "git_status":
      return gitStatus(String(args.cwd), runtime.policy);
    case "git_diff":
      return gitDiff(String(args.cwd), runtime.policy);
    case "git_log":
      return gitLog(String(args.cwd), runtime.policy, args.limit === undefined ? 20 : Number(args.limit));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
export async function executeTool(
  runtime: DeskTetherRuntime,
  name: string,
  rawArgs: Record<string, unknown>,
): Promise<McpToolResult> {
  const started = Date.now();
  const definition = getToolDefinitions().find((tool) => tool.name === name);
  if (!definition) return textResult(`Unknown tool: ${name}`, true);

  try {
    const args = definition.inputSchema.parse(rawArgs) as Record<string, unknown>;
    const value = await dispatch(runtime, name, args);
    await runtime.audit.append({
      tool: name,
      args,
      status: "success",
      durationMs: Date.now() - started,
    });
    return textResult(value);
  } catch (error) {
    const status = error instanceof Error && error.name === "PolicyError" ? "rejected" : "error";
    await runtime.audit.append({
      tool: name,
      args: rawArgs,
      status,
      durationMs: Date.now() - started,
      error: errorMessage(error),
    });
    return textResult(errorMessage(error), true);
  }
}
