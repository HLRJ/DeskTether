import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeTool } from "../src/handler.js";
import { createRuntime } from "../src/runtime.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-mcp-"));
  const auditPath = path.join(root, ".desktether-audit.jsonl");
  const runtime = createRuntime({ allowedRoots: [root], blockedCommands: ["shutdown"], auditPath });
  return { root, auditPath, runtime };
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
});
