import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../src/audit.js";

describe("AuditLog", () => {
  it("appends JSONL records", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-audit-"));
    const file = path.join(dir, "audit.jsonl");
    const audit = new AuditLog(file);
    await audit.append({ tool: "read_file", status: "success", durationMs: 12 });
    const raw = await fs.readFile(file, "utf8");
    const record = JSON.parse(raw.trim());
    expect(record.tool).toBe("read_file");
    expect(record.status).toBe("success");
    expect(record.timestamp).toMatch(/^\d{4}-/);
  });

  it("rotates JSONL files and reads recent activity newest first", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-audit-"));
    const file = path.join(dir, "audit.jsonl");
    const audit = new AuditLog(file, { maxBytes: 1, maxBackups: 2 });

    await audit.append({ tool: "first", status: "success", durationMs: 1 });
    await audit.append({ tool: "second", status: "success", durationMs: 1 });
    await audit.append({ tool: "third", status: "success", durationMs: 1 });

    expect(await fs.stat(path.join(dir, "audit.1.jsonl"))).toBeDefined();
    expect(await fs.stat(path.join(dir, "audit.2.jsonl"))).toBeDefined();
    expect((await audit.recent(3)).map((record) => record.tool))
      .toEqual(["third", "second", "first"]);
    expect((await audit.recent(2)).map((record) => record.tool))
      .toEqual(["third", "second"]);
  });
});