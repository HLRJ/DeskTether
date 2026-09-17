import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeTool } from "../src/handler.js";
import { createRuntime } from "../src/runtime.js";
import { getToolDefinitions } from "../src/tool-catalog.js";

async function fixture(options: { confirmCommands?: string[] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-powershell-"));
  const runtime = createRuntime({
    allowedRoots: [root],
    blockedCommands: ["shutdown"],
    confirmCommands: options.confirmCommands,
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
  it("supports incremental PowerShell output reads by offset", async () => {
    const { root, runtime } = await fixture();
    const started = await executeTool(runtime, "powershell_start", {
      command: `node -e "process.stdout.write('abcdef')"`,
      cwd: root,
    });
    const session = JSON.parse(started.content[0]!.text) as { id: string };

    let full: { stdout: string; stdoutOffset: number } | undefined;
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const read = await executeTool(runtime, "powershell_read", { sessionId: session.id });
      full = JSON.parse(read.content[0]!.text) as { stdout: string; stdoutOffset: number };
      if (full.stdout.includes("abcdef")) break;
    }
    expect(full?.stdout).toContain("abcdef");
    expect(full?.stdoutOffset).toBe(6);

    const tailResult = await executeTool(runtime, "powershell_read", {
      sessionId: session.id,
      stdoutOffset: 3,
    });
    const tail = JSON.parse(tailResult.content[0]!.text) as { stdout: string };
    expect(tail.stdout).toBe("def");
  });

  it("returns a confirmation token before a CONFIRM command and consumes it on retry", async () => {
    const { root, runtime } = await fixture({ confirmCommands: ["node"] });
    const pendingResult = await executeTool(runtime, "powershell_start", {
      command: "node -p 42",
      cwd: root,
    });
    const pending = JSON.parse(pendingResult.content[0]!.text) as {
      status: string;
      confirmationToken: string;
    };
    expect(pending.status).toBe("confirmation_required");
    expect(runtime.processes.list()).toHaveLength(0);

    const started = await executeTool(runtime, "powershell_start", {
      command: "node -p 42",
      cwd: root,
      confirmationToken: pending.confirmationToken,
    });
    const session = JSON.parse(started.content[0]!.text) as { status: string; id: string };
    expect(session.status).toBe("running");
    expect(runtime.processes.list()).toHaveLength(1);
  });

  it("rejects blocked commands before PowerShell process spawn", async () => {
    const { root, runtime } = await fixture();
    const result = await executeTool(runtime, "powershell_start", { command: "shutdown /s", cwd: root });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("blocked by policy");
    expect(runtime.processes.list()).toHaveLength(0);
  });
});
