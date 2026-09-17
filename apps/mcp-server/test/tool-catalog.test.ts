import { describe, expect, it } from "vitest";
import { getToolDefinitions } from "../src/tool-catalog.js";

const expectedTools = [
  "device_info",
  "list_directory",
  "read_text_file",
  "write_text_file",
  "read_multiple_files",
  "create_directory",
  "move_file",
  "get_file_info",
  "edit_block",
  "start_process",
  "read_process_output",
  "write_process_input",
  "terminate_process",
  "list_sessions",
  "powershell_start",
  "powershell_read",
  "powershell_input",
  "powershell_terminate",
  "powershell_list",
  "list_processes",
  "kill_process",
  "start_search",
  "get_search_results",
  "stop_search",
  "list_searches",
  "search_code",
  "get_recent_activity",
  "git_status",
  "git_diff",
  "git_log",
];
describe("DeskTether MCP tool catalog", () => {
  it("registers the V0.2.3 tool surface exactly once", () => {
    const definitions = getToolDefinitions();
    expect(definitions.map((tool) => tool.name).sort()).toEqual([...expectedTools].sort());
    expect(new Set(definitions.map((tool) => tool.name)).size).toBe(expectedTools.length);
  });

  it("requires a path for file reads", () => {
    const readTool = getToolDefinitions().find((tool) => tool.name === "read_text_file");
    expect(readTool).toBeDefined();
    expect(readTool?.inputSchema.safeParse({}).success).toBe(false);
    expect(readTool?.inputSchema.safeParse({ path: "example.txt" }).success).toBe(true);
  });
});