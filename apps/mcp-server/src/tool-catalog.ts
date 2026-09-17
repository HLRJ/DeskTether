import * as z from "zod/v4";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject;
}

const noArgs = z.object({});
const pathOnly = z.object({ path: z.string().min(1) });
const sessionOnly = z.object({ sessionId: z.string().uuid() });
const cwdOnly = z.object({ cwd: z.string().min(1) });

export function getToolDefinitions(): ToolDefinition[] {
  return [
    { name: "device_info", description: "Get local device and runtime information.", inputSchema: noArgs },
    { name: "list_directory", description: "List entries in an allowed local directory.", inputSchema: pathOnly },
    { name: "read_text_file", description: "Read a UTF-8 text file inside allowed roots.", inputSchema: pathOnly },
    {
      name: "write_text_file",
      description: "Rewrite a UTF-8 text file inside allowed roots.",
      inputSchema: z.object({ path: z.string().min(1), content: z.string() }),
    },
    {
      name: "start_process",
      description: "Start a command as a managed process session.",
      inputSchema: z.object({ command: z.string().min(1), cwd: z.string().min(1) }),
    },
    {
      name: "powershell_start",
      description: "Start a policy-enforced PowerShell session on Windows.",
      inputSchema: z.object({ command: z.string().min(1), cwd: z.string().min(1) }),
    },
    { name: "powershell_read", description: "Read buffered output and state for a PowerShell session.", inputSchema: sessionOnly },
    {
      name: "powershell_input",
      description: "Write stdin to a running PowerShell session.",
      inputSchema: z.object({ sessionId: z.string().uuid(), input: z.string() }),
    },
    { name: "powershell_terminate", description: "Terminate a managed PowerShell session.", inputSchema: sessionOnly },
    { name: "powershell_list", description: "List managed PowerShell sessions.", inputSchema: noArgs },
    { name: "read_process_output", description: "Read buffered output and state for a process session.", inputSchema: sessionOnly },
    {
      name: "write_process_input",
      description: "Write stdin to a running process session.",
      inputSchema: z.object({ sessionId: z.string().uuid(), input: z.string() }),
    },
    { name: "terminate_process", description: "Terminate a managed process session.", inputSchema: sessionOnly },
    { name: "list_sessions", description: "List managed process sessions.", inputSchema: noArgs },
    { name: "list_processes", description: "List operating-system processes.", inputSchema: noArgs },
    {
      name: "kill_process",
      description: "Terminate an operating-system process by PID.",
      inputSchema: z.object({ pid: z.number().int().positive() }),
    },
    {
      name: "start_search",
      description: "Start a cancellable file-name or text-content search.",
      inputSchema: z.object({
        root: z.string().min(1),
        pattern: z.string().min(1),
        mode: z.enum(["files", "content"]),
        maxResults: z.number().int().positive().max(10000).optional(),
      }),
    },
    {
      name: "get_search_results",
      description: "Read a page of results from a search session.",
      inputSchema: z.object({
        sessionId: z.string().uuid(),
        offset: z.number().int().nonnegative().optional(),
        length: z.number().int().positive().max(1000).optional(),
      }),
    },
    { name: "stop_search", description: "Cancel a search session.", inputSchema: sessionOnly },
    { name: "git_status", description: "Show concise Git working-tree status.", inputSchema: cwdOnly },
    { name: "git_diff", description: "Show the unstaged Git diff.", inputSchema: cwdOnly },
    {
      name: "git_log",
      description: "Show recent Git commits.",
      inputSchema: z.object({ cwd: z.string().min(1), limit: z.number().int().positive().max(100).optional() }),
    },
  ];
}
