import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeTool } from "../src/handler.js";
import { createRuntime } from "../src/runtime.js";
import { getToolDefinitions } from "../src/tool-catalog.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-powershell-"));
  const runtime = createRuntime({
    allowedRoots: [root],
    blockedCommands: ["shutdown"],
    auditPath: path.join(root, "audit.jsonl"),
  });
  return { root, runtime };
}

const names = [
  "powershell_start",
  "powershell_read",
  "powershell_input",
  "powershell_list",
  "powershell_terminate",
];

describe("PowerShell MCP tools", () => {
  it("registers the explicit PowerShell tool family", () => {
    const catalog = new Set(getToolDefinitions().map((tool) => tool.name));
    for (const name of names) expect(catalog.has(name)).toBe(true);
  });
  it("starts and reads a PowerShell session through the existing session manager", async () => {
    const { root, runtime } = await fixture();
    const started = await executeTool(runtime, "powershell_start", {
      command: "Write-Output 'desk-tether-ready'",
      cwd: root,
    });
    expect(started.isError).toBeUndefined();
    const session = JSON.parse(started.content[0]!.text) as { id: string };

    let output = "";
    for (let i = 0; i < 20 && !output.includes("desk-tether-ready"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const read = await executeTool(runtime, "powershell_read", { sessionId: session.id });
      const view = JSON.parse(read.content[0]!.text) as { output: string };
      output = view.output;
    }
    expect(output).toContain("desk-tether-ready");
  });

  it("rejects blocked commands before PowerShell process spawn", async () => {
    const { root, runtime } = await fixture();
    const result = await executeTool(runtime, "powershell_start", { command: "shutdown /s", cwd: root });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("blocked by policy");
    expect(runtime.processes.list()).toHaveLength(0);
  });
});