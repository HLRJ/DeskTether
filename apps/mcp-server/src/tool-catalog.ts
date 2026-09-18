import * as z from "zod/v4";

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject;
  annotations: ToolAnnotations;
  _meta: Record<string, unknown>;
}

interface ToolPresentation {
  title: string;
  invoking: string;
  invoked: string;
}

const TOOL_PRESENTATION: Record<string, ToolPresentation> = {
  device_info: { title: "Device Information", invoking: "Reading device information...", invoked: "Device information read" },
  list_directory: { title: "List Directory", invoking: "Listing directory...", invoked: "Directory listed" },
  read_text_file: { title: "Read Text File", invoking: "Reading file...", invoked: "File read" },
  write_text_file: { title: "Write Text File", invoking: "Writing file...", invoked: "File written" },
  read_multiple_files: { title: "Read Multiple Files", invoking: "Reading files...", invoked: "Files read" },
  create_directory: { title: "Create Directory", invoking: "Creating directory...", invoked: "Directory created" },
  move_file: { title: "Move File or Directory", invoking: "Moving path...", invoked: "Path moved" },
  get_file_info: { title: "Get File Information", invoking: "Reading file metadata...", invoked: "File metadata read" },
  edit_block: { title: "Edit Text Block", invoking: "Editing text block...", invoked: "Text block edited" },
  start_process: { title: "Start Process", invoking: "Starting process...", invoked: "Process started" },
  powershell_start: { title: "Start PowerShell", invoking: "Starting PowerShell...", invoked: "PowerShell started" },
  powershell_read: { title: "Read PowerShell Session", invoking: "Reading PowerShell output...", invoked: "PowerShell output read" },
  powershell_input: { title: "Write PowerShell Input", invoking: "Sending PowerShell input...", invoked: "PowerShell input sent" },
  powershell_terminate: { title: "Terminate PowerShell", invoking: "Terminating PowerShell...", invoked: "PowerShell terminated" },
  powershell_list: { title: "List PowerShell Sessions", invoking: "Listing PowerShell sessions...", invoked: "PowerShell sessions listed" },
  read_process_output: { title: "Read Process Output", invoking: "Reading process output...", invoked: "Process output read" },
  write_process_input: { title: "Write Process Input", invoking: "Sending process input...", invoked: "Process input sent" },
  terminate_process: { title: "Terminate Process Session", invoking: "Terminating process...", invoked: "Process terminated" },
  list_sessions: { title: "List Process Sessions", invoking: "Listing process sessions...", invoked: "Process sessions listed" },
  list_processes: { title: "List System Processes", invoking: "Listing system processes...", invoked: "System processes listed" },
  kill_process: { title: "Kill System Process", invoking: "Terminating system process...", invoked: "System process terminated" },
  start_search: { title: "Start Search", invoking: "Starting search...", invoked: "Search started" },
  get_search_results: { title: "Read Search Results", invoking: "Reading search results...", invoked: "Search results read" },
  stop_search: { title: "Stop Search", invoking: "Stopping search...", invoked: "Search stopped" },
  list_searches: { title: "List Searches", invoking: "Listing searches...", invoked: "Searches listed" },
  search_code: { title: "Search Code", invoking: "Searching code...", invoked: "Code search started" },
  get_recent_activity: { title: "Read Recent Activity", invoking: "Reading recent activity...", invoked: "Recent activity read" },
  git_status: { title: "Git Status", invoking: "Reading Git status...", invoked: "Git status read" },
  git_diff: { title: "Git Diff", invoking: "Reading Git diff...", invoked: "Git diff read" },
  git_log: { title: "Git Log", invoking: "Reading Git history...", invoked: "Git history read" },
};

const READ_ONLY_TOOLS = new Set([
  "device_info", "list_directory", "read_text_file", "read_multiple_files", "get_file_info",
  "powershell_read", "powershell_list", "read_process_output", "list_sessions", "list_processes",
  "start_search", "get_search_results", "stop_search", "list_searches", "search_code",
  "get_recent_activity", "git_status", "git_diff", "git_log",
]);

const DESTRUCTIVE_TOOLS = new Set([
  "write_text_file", "move_file", "edit_block", "start_process", "powershell_start",
  "powershell_input", "powershell_terminate", "write_process_input", "terminate_process", "kill_process",
]);

const IDEMPOTENT_TOOLS = new Set([
  ...[...READ_ONLY_TOOLS].filter((name) => name !== "start_search" && name !== "search_code"),
  "create_directory",
  "stop_search",
]);

const OPEN_WORLD_TOOLS = new Set([
  "start_process", "powershell_start", "powershell_input", "write_process_input",
]);

function decorateTool<T extends { name: string; description: string; inputSchema: z.ZodObject }>(
  tool: T,
): ToolDefinition {
  const presentation = TOOL_PRESENTATION[tool.name];
  if (!presentation) throw new Error(`Missing ChatGPT presentation metadata for tool: ${tool.name}`);

  const annotations: ToolAnnotations = {
    readOnlyHint: READ_ONLY_TOOLS.has(tool.name),
    destructiveHint: DESTRUCTIVE_TOOLS.has(tool.name),
    idempotentHint: IDEMPOTENT_TOOLS.has(tool.name),
    openWorldHint: OPEN_WORLD_TOOLS.has(tool.name),
  };

  return {
    ...tool,
    title: presentation.title,
    annotations,
    _meta: {
      "openai/toolInvocation/invoking": presentation.invoking,
      "openai/toolInvocation/invoked": presentation.invoked,
      "openai/widgetAccessible": false,
      "openai/resultCanProduceWidget": false,
      securitySchemes: [{ type: "noauth" }],
    },
  };
}

const noArgs = z.object({});
const pathOnly = z.object({ path: z.string().min(1) });
const sessionOnly = z.object({ sessionId: z.string().uuid() });
const sessionRead = z.object({
  sessionId: z.string().uuid(),
  stdoutOffset: z.number().int().nonnegative().optional(),
  stderrOffset: z.number().int().nonnegative().optional(),
});
const cwdOnly = z.object({ cwd: z.string().min(1) });

export function getToolDefinitions(): ToolDefinition[] {
  const tools = [
    { name: "device_info", description: "Get local device and runtime information.", inputSchema: noArgs },
    {
      name: "list_directory",
      description: "List an allowed directory, optionally recursively with depth and entry limits.",
      inputSchema: z.object({
        path: z.string().min(1),
        depth: z.number().int().min(1).max(20).optional(),
        maxEntries: z.number().int().min(1).max(5000).optional(),
      }),
    },
    {
      name: "read_text_file",
      description: "Read a UTF-8 text file, optionally by byte offset/length for large files.",
      inputSchema: z.object({
        path: z.string().min(1),
        offset: z.number().int().optional(),
        length: z.number().int().positive().max(1024 * 1024).optional(),
      }),
    },
    {
      name: "write_text_file",
      description: "Rewrite or append to a UTF-8 text file inside allowed roots.",
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
        mode: z.enum(["rewrite", "append"]).optional(),
      }),
    },
    {
      name: "read_multiple_files",
      description: "Read multiple UTF-8 text files after validating every path.",
      inputSchema: z.object({
        paths: z.array(z.string().min(1)).min(1).max(100),
      }),
    },
    {
      name: "create_directory",
      description: "Create a directory recursively inside allowed roots.",
      inputSchema: pathOnly,
    },
    {
      name: "move_file",
      description: "Move a file or directory inside allowed roots. Overwrite is disabled by default.",
      inputSchema: z.object({
        source: z.string().min(1),
        destination: z.string().min(1),
        overwrite: z.boolean().optional(),
      }),
    },
    {
      name: "get_file_info",
      description: "Get file or directory metadata inside allowed roots.",
      inputSchema: pathOnly,
    },
    {
      name: "edit_block",
      description: "Replace an exact text block only when the expected match count is met.",
      inputSchema: z.object({
        path: z.string().min(1),
        oldText: z.string().min(1),
        newText: z.string(),
        expectedReplacements: z.number().int().positive().max(1000).optional(),
      }),
    },
    {
      name: "start_process",
      description: "Start a command as a managed process session.",
      inputSchema: z.object({
        command: z.string().min(1),
        cwd: z.string().min(1),
        confirmationToken: z.string().uuid().optional(),
      }),
    },
    {
      name: "powershell_start",
      description: "Start a policy-enforced PowerShell session on Windows.",
      inputSchema: z.object({
        command: z.string().min(1),
        cwd: z.string().min(1),
        confirmationToken: z.string().uuid().optional(),
      }),
    },
    { name: "powershell_read", description: "Read buffered output and state for a PowerShell session.", inputSchema: sessionRead },
    {
      name: "powershell_input",
      description: "Write stdin to a running PowerShell session.",
      inputSchema: z.object({ sessionId: z.string().uuid(), input: z.string() }),
    },
    { name: "powershell_terminate", description: "Terminate a managed PowerShell session.", inputSchema: sessionOnly },
    { name: "powershell_list", description: "List managed PowerShell sessions.", inputSchema: noArgs },
    { name: "read_process_output", description: "Read buffered output and state for a process session.", inputSchema: sessionRead },
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
      description: "Start a cancellable file-name, text-content, or regex search.",
      inputSchema: z.object({
        root: z.string().min(1),
        pattern: z.string().min(1),
        mode: z.enum(["files", "content", "regex"]),
        maxResults: z.number().int().positive().max(10000).optional(),
        include: z.array(z.string().min(1)).max(100).optional(),
        exclude: z.array(z.string().min(1)).max(100).optional(),
        caseSensitive: z.boolean().optional(),
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
    { name: "list_searches", description: "List active and completed search sessions.", inputSchema: noArgs },
    {
      name: "search_code",
      description: "Start a regex code search with optional include/exclude glob filters.",
      inputSchema: z.object({
        root: z.string().min(1),
        pattern: z.string().min(1),
        include: z.array(z.string().min(1)).max(100).optional(),
        exclude: z.array(z.string().min(1)).max(100).optional(),
        caseSensitive: z.boolean().optional(),
        maxResults: z.number().int().positive().max(10000).optional(),
      }),
    },
    {
      name: "get_recent_activity",
      description: "Read recent local JSONL audit activity, newest first.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(1000).optional(),
      }),
    },
    { name: "git_status", description: "Show concise Git working-tree status.", inputSchema: cwdOnly },
    { name: "git_diff", description: "Show the unstaged Git diff.", inputSchema: cwdOnly },
    {
      name: "git_log",
      description: "Show recent Git commits.",
      inputSchema: z.object({ cwd: z.string().min(1), limit: z.number().int().positive().max(100).optional() }),
    },
  ];

  return tools.map((tool) => decorateTool(tool));
}
