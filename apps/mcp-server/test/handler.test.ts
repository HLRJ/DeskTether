import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeTool } from "../src/handler.js";
import { createRuntime } from "../src/runtime.js";

async function fixture(options: { confirmCommands?: string[] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-mcp-"));
  const auditPath = path.join(root, ".desktether-audit.jsonl");
  const runtime = createRuntime({
    allowedRoots: [root],
    blockedCommands: ["shutdown"],
    confirmCommands: options.confirmCommands,
    auditPath,
  });
  return { root, auditPath, runtime };
}

async function readAuditRecords(auditPath: string): Promise<Array<Record<string, unknown>>> {
  const raw = await fs.readFile(auditPath, "utf8");
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

describe("executeTool", () => {
  it("dispatches a file read through the core capability layer", async () => {
    const { root, runtime } = await fixture();
    const filePath = path.join(root, "hello.txt");
    await fs.writeFile(filePath, "hello DeskTether", "utf8");
    const result = await executeTool(runtime, "read_text_file", { path: filePath });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toBe("hello DeskTether");
  });

  it("returns an MCP error result and audits rejected access", async () => {
    const { auditPath, runtime } = await fixture();
    const result = await executeTool(runtime, "read_text_file", { path: os.tmpdir() });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("outside allowed roots");
    const audit = await fs.readFile(auditPath, "utf8");
    expect(audit).toContain('"tool":"read_text_file"');
    expect(audit).toContain('"status":"rejected"');
  });

  it("audits confirmation decisions without persisting confirmation tokens", async () => {
    const { root, auditPath, runtime } = await fixture({ confirmCommands: ["node"] });
    const pendingResult = await executeTool(runtime, "powershell_start", {
      command: "node -p 42",
      cwd: root,
    });
    const pending = JSON.parse(pendingResult.content[0]!.text) as {
      confirmationToken: string;
    };
    let records = await readAuditRecords(auditPath);
    let record = records.filter((item) => item.tool === "powershell_start").at(-1)!;
    expect(record.decision).toBe("CONFIRM");
    expect(record.confirmationRequired).toBe(true);
    expect(record.confirmationConsumed).toBe(false);

    const startedResult = await executeTool(runtime, "powershell_start", {
      command: "node -p 42",
      cwd: root,
      confirmationToken: pending.confirmationToken,
    });
    const started = JSON.parse(startedResult.content[0]!.text) as { id: string };

    records = await readAuditRecords(auditPath);
    record = records.filter((item) => item.tool === "powershell_start").at(-1)!;
    expect(record.decision).toBe("CONFIRM");
    expect(record.confirmationRequired).toBe(false);
    expect(record.confirmationConsumed).toBe(true);
    expect(record.sessionId).toBe(started.id);
    expect(JSON.stringify(records)).not.toContain(pending.confirmationToken);
  });

  it("audits session identity and final exit code on process reads", async () => {
    const { root, auditPath, runtime } = await fixture();
    const startedResult = await executeTool(runtime, "powershell_start", {
      command: "exit 7",
      cwd: root,
    });
    const started = JSON.parse(startedResult.content[0]!.text) as { id: string };

    let exitCode: number | null = null;
    for (let i = 0; i < 20 && exitCode === null; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const readResult = await executeTool(runtime, "powershell_read", { sessionId: started.id });
      const view = JSON.parse(readResult.content[0]!.text) as { exitCode: number | null };
      exitCode = view.exitCode;
    }
    expect(exitCode).toBe(7);

    const records = await readAuditRecords(auditPath);
    const record = records.filter((item) => item.tool === "powershell_read").at(-1)!;
    expect(record.sessionId).toBe(started.id);
    expect(record.exitCode).toBe(7);
  });
});
