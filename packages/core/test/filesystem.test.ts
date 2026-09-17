import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../src/audit.js";
import { FileSystemService } from "../src/filesystem.js";
import { Policy, PolicyError } from "../src/policy.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-fs-"));
  const service = new FileSystemService(
    new Policy({ allowedRoots: [root], blockedCommands: [] }),
    new AuditLog(path.join(root, "audit.jsonl")),
  );
  return { root, service };
}

describe("FileSystemService", () => {
  it("reads, writes, and lists inside an allowed root", async () => {
    const { root, service } = await fixture();
    await service.writeText(path.join(root, "hello.txt"), "hello");
    expect(await service.readText(path.join(root, "hello.txt"))).toBe("hello");
    expect(await service.list(root)).toContainEqual(
      expect.objectContaining({ name: "hello.txt", type: "file" }),
    );
  });
  it("reads multiple files after validating every path", async () => {
    const { root, service } = await fixture();
    const a = path.join(root, "a.txt");
    const b = path.join(root, "b.txt");
    await fs.writeFile(a, "A", "utf8");
    await fs.writeFile(b, "B", "utf8");

    expect(await service.readMultiple([a, b])).toEqual([
      { path: path.resolve(a), content: "A" },
      { path: path.resolve(b), content: "B" },
    ]);

    await expect(
      service.readMultiple([a, path.resolve(root, "..", "forbidden.txt")]),
    ).rejects.toBeInstanceOf(PolicyError);
  });

  it("creates nested directories recursively", async () => {
    const { root, service } = await fixture();
    const nested = path.join(root, "a", "b", "c");
    await service.createDirectory(nested);
    expect((await fs.stat(nested)).isDirectory()).toBe(true);
  });
  it("moves files and refuses overwrite unless explicitly allowed", async () => {
    const { root, service } = await fixture();
    const source = path.join(root, "source.txt");
    const destination = path.join(root, "destination.txt");
    await fs.writeFile(source, "source", "utf8");
    await fs.writeFile(destination, "destination", "utf8");

    await expect(service.move(source, destination)).rejects.toThrow(/already exists/i);
    expect(await fs.readFile(source, "utf8")).toBe("source");

    await service.move(source, destination, true);
    expect(await fs.readFile(destination, "utf8")).toBe("source");
    await expect(fs.stat(source)).rejects.toThrow();
  });

  it("refuses to move a file onto itself even when overwrite is enabled", async () => {
    const { root, service } = await fixture();
    const source = path.join(root, "same.txt");
    await fs.writeFile(source, "keep-me", "utf8");

    await expect(service.move(source, source, true)).rejects.toThrow(/same path/i);
    expect(await fs.readFile(source, "utf8")).toBe("keep-me");
  });

  it("returns file and directory metadata", async () => {
    const { root, service } = await fixture();
    const file = path.join(root, "info.txt");
    await fs.writeFile(file, "hello", "utf8");

    const info = await service.getInfo(file);
    expect(info).toEqual(expect.objectContaining({
      path: path.resolve(file),
      name: "info.txt",
      type: "file",
      size: 5,
    }));
    expect(info.createdAt).toMatch(/T/);
    expect(info.modifiedAt).toMatch(/T/);
  });
  it("edits an exact block only when the expected replacement count matches", async () => {
    const { root, service } = await fixture();
    const file = path.join(root, "edit.txt");
    await fs.writeFile(file, "alpha\nbeta\nalpha\n", "utf8");

    await service.editBlock(file, "beta", "BETA");
    expect(await fs.readFile(file, "utf8")).toBe("alpha\nBETA\nalpha\n");

    await expect(service.editBlock(file, "alpha", "ALPHA")).rejects.toThrow(/expected 1.*found 2/i);
    expect(await fs.readFile(file, "utf8")).toBe("alpha\nBETA\nalpha\n");

    await service.editBlock(file, "alpha", "ALPHA", 2);
    expect(await fs.readFile(file, "utf8")).toBe("ALPHA\nBETA\nALPHA\n");
  });

  it("rejects access outside an allowed root", async () => {
    const { root, service } = await fixture();
    await expect(
      service.readText(path.resolve(root, "..", "forbidden.txt")),
    ).rejects.toBeInstanceOf(PolicyError);
  });
});
