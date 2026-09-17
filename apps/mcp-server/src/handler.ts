import {
  getDeviceInfo,
  gitDiff,
  gitLog,
  gitStatus,
  killProcess,
  listProcesses,
  type AuditRecord,
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

function auditArgs(args: Record<string, unknown>): Record<string, unknown> {
  const { confirmationToken: _confirmationToken, ...safe } = args;
  return safe;
}

function auditMetadata(
  runtime: DeskTetherRuntime,
  name: string,
  args: Record<string, unknown>,
  value?: unknown,
): Partial<AuditRecord> {
  const metadata: Partial<AuditRecord> = {};
  const result = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;

  if ((name === "start_process" || name === "powershell_start") && typeof args.command === "string") {
    metadata.decision = runtime.policy.evaluateCommand(args.command).decision;
    if (metadata.decision === "CONFIRM") {
      metadata.confirmationRequired = result?.status === "confirmation_required";
      metadata.confirmationConsumed = Boolean(args.confirmationToken)
        && metadata.confirmationRequired === false;
    }
  }

  const resultSessionId = typeof result?.id === "string" ? result.id : undefined;
  const argumentSessionId = typeof args.sessionId === "string" ? args.sessionId : undefined;
  metadata.sessionId = resultSessionId ?? argumentSessionId;

  if (typeof result?.exitCode === "number" || result?.exitCode === null) {
    metadata.exitCode = result.exitCode as number | null;
  }
  return metadata;
}

async function dispatch(runtime: DeskTetherRuntime, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "device_info":
      return getDeviceInfo();
    case "list_directory":
      if (args.depth !== undefined || args.maxEntries !== undefined) {
        return runtime.filesystem.listTree(
          String(args.path),
          args.depth === undefined ? 1 : Number(args.depth),
          args.maxEntries === undefined ? 500 : Number(args.maxEntries),
        );
      }
      return runtime.filesystem.list(String(args.path));
    case "read_text_file":
      if (args.offset !== undefined || args.length !== undefined) {
        return runtime.filesystem.readTextRange(
          String(args.path),
          args.offset === undefined ? 0 : Number(args.offset),
          args.length === undefined ? 64 * 1024 : Number(args.length),
        );
      }
      return runtime.filesystem.readText(String(args.path));
    case "write_text_file":
      await runtime.filesystem.writeText(
        String(args.path),
        String(args.content),
        args.mode === "append" ? "append" : "rewrite",
      );
      return { ok: true };
    case "read_multiple_files":
      return runtime.filesystem.readMultiple((args.paths as unknown[]).map(String));
    case "create_directory":
      await runtime.filesystem.createDirectory(String(args.path));
      return { ok: true };
    case "move_file":
      await runtime.filesystem.move(
        String(args.source),
        String(args.destination),
        args.overwrite === true,
      );
      return { ok: true };
    case "get_file_info":
      return runtime.filesystem.getInfo(String(args.path));
    case "edit_block":
      return runtime.filesystem.editBlock(
        String(args.path),
        String(args.oldText),
        String(args.newText),
        args.expectedReplacements === undefined ? 1 : Number(args.expectedReplacements),
      );
    case "start_process":
    case "powershell_start":
      return runtime.processes.start(
        String(args.command),
        String(args.cwd),
        args.confirmationToken === undefined ? undefined : String(args.confirmationToken),
      );
    case "read_process_output":
    case "powershell_read":
      return runtime.processes.read(String(args.sessionId), {
        stdoutOffset: args.stdoutOffset === undefined ? undefined : Number(args.stdoutOffset),
        stderrOffset: args.stderrOffset === undefined ? undefined : Number(args.stderrOffset),
      });
    case "write_process_input":
    case "powershell_input":
      runtime.processes.write(String(args.sessionId), String(args.input));
      return { ok: true };
    case "terminate_process":
    case "powershell_terminate":
      await runtime.processes.terminate(String(args.sessionId));
      return { ok: true };
    case "list_sessions":
    case "powershell_list":
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
        mode: args.mode as "files" | "content" | "regex",
        maxResults: args.maxResults === undefined ? undefined : Number(args.maxResults),
        include: args.include as string[] | undefined,
        exclude: args.exclude as string[] | undefined,
        caseSensitive: args.caseSensitive === undefined ? undefined : Boolean(args.caseSensitive),
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
    case "list_searches":
      return runtime.searches.list();
    case "search_code":
      return runtime.searches.start({
        root: String(args.root),
        pattern: String(args.pattern),
        mode: "regex",
        maxResults: args.maxResults === undefined ? undefined : Number(args.maxResults),
        include: args.include as string[] | undefined,
        exclude: args.exclude as string[] | undefined,
        caseSensitive: args.caseSensitive === undefined ? undefined : Boolean(args.caseSensitive),
      });
    case "get_recent_activity":
      return runtime.audit.recent(args.limit === undefined ? 50 : Number(args.limit));
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
      args: auditArgs(args),
      status: "success",
      durationMs: Date.now() - started,
      ...auditMetadata(runtime, name, args, value),
    });
    return textResult(value);
  } catch (error) {
    const status = error instanceof Error && error.name === "PolicyError" ? "rejected" : "error";
    await runtime.audit.append({
      tool: name,
      args: auditArgs(rawArgs),
      status,
      durationMs: Date.now() - started,
      error: errorMessage(error),
      ...auditMetadata(runtime, name, rawArgs),
    });
    return textResult(errorMessage(error), true);
  }
}
