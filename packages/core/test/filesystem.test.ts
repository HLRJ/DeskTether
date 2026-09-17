import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../src/audit.js";
import { FileSystemService } from "../src/filesystem.js";
import { Policy, PolicyError } from "../src/policy.js";

describe("FileSystemService", () => {
  it("reads, writes, and lists inside an allowed root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-fs-"));
    const service = new FileSystemService(new Policy({ allowedRoots: [root], blockedCommands: [] }), new AuditLog(path.join(root, "audit.jsonl")));
    await service.writeText(path.join(root, "hello.txt"), "hello");
    expect(await service.readText(path.join(root, "hello.txt"))).toBe("hello");
    expect(await service.list(root)).toContainEqual(expect.objectContaining({ name: "hello.txt", type: "file" }));
  });

  it("rejects access outside an allowed root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-fs-"));
    const service = new FileSystemService(new Policy({ allowedRoots: [root], blockedCommands: [] }), new AuditLog(path.join(root, "audit.jsonl")));
    await expect(service.readText(path.resolve(root, "..", "forbidden.txt"))).rejects.toBeInstanceOf(PolicyError);
  });
});