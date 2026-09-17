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
  it("lists a recursive directory tree with depth and entry limits", async () => {
    const { root, service } = await fixture();
    await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });
    await fs.writeFile(path.join(root, "top.txt"), "top", "utf8");
    await fs.writeFile(path.join(root, "src", "main.ts"), "main", "utf8");
    await fs.writeFile(path.join(root, "src", "nested", "deep.ts"), "deep", "utf8");

    const tree = await service.listTree(root, 2, 10);
    expect(tree.truncated).toBe(false);
    expect(tree.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: "src", type: "directory", depth: 1 }),
      expect.objectContaining({ relativePath: path.join("src", "main.ts"), type: "file", depth: 2 }),
      expect.objectContaining({ relativePath: "top.txt", type: "file", depth: 1 }),
    ]));
    expect(tree.entries.some((entry) => entry.relativePath.endsWith("deep.ts"))).toBe(false);

    const limited = await service.listTree(root, 3, 2);
    expect(limited.entries).toHaveLength(2);
    expect(limited.truncated).toBe(true);
  });

  it("reads byte ranges with paging metadata", async () => {
    const { root, service } = await fixture();
    const file = path.join(root, "range.txt");
    await fs.writeFile(file, "abcdef", "utf8");

    expect(await service.readTextRange(file, 2, 3)).toEqual({
      content: "cde",
      startOffset: 2,
      nextOffset: 5,
      totalBytes: 6,
      hasMore: true,
    });
  });

  it("supports negative offsets from the end of a text file", async () => {
    const { root, service } = await fixture();
    const file = path.join(root, "tail.txt");
    await fs.writeFile(file, "abcdef", "utf8");

    expect(await service.readTextRange(file, -3, 3)).toEqual({
      content: "def",
      startOffset: 3,
      nextOffset: 6,
      totalBytes: 6,
      hasMore: false,
    });
  });

  it("rejects oversized unpaged reads and requires ranged access", async () => {
    const { root, service } = await fixture();
    const file = path.join(root, "large.txt");
    await fs.writeFile(file, "x".repeat(1024 * 1024 + 1), "utf8");

    await expect(service.readText(file)).rejects.toThrow(/too large.*offset.*length/i);
    const page = await service.readTextRange(file, 0, 1024);
    expect(page.content).toHaveLength(1024);
    expect(page.hasMore).toBe(true);
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

  it("limits the combined size of multi-file reads", async () => {
    const { root, service } = await fixture();
    const files = ["a.txt", "b.txt", "c.txt"].map((name) => path.join(root, name));
    for (const file of files) {
      await fs.writeFile(file, "x".repeat(800 * 1024), "utf8");
    }

    await expect(service.readMultiple(files)).rejects.toThrow(/combined.*too large/i);
  });

  it("appends text without rewriting existing content", async () => {
    const { root, service } = await fixture();
    const file = path.join(root, "append.txt");

    await service.writeText(file, "alpha");
    await service.writeText(file, "\nbeta", "append");
    expect(await fs.readFile(file, "utf8")).toBe("alpha\nbeta");
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

  it("moves directories with their contents", async () => {
    const { root, service } = await fixture();
    const source = path.join(root, "source-dir");
    const destination = path.join(root, "destination-dir");
    await fs.mkdir(path.join(source, "nested"), { recursive: true });
    await fs.writeFile(path.join(source, "nested", "note.txt"), "moved", "utf8");

    await service.move(source, destination);
    expect(await fs.readFile(path.join(destination, "nested", "note.txt"), "utf8")).toBe("moved");
    await expect(fs.stat(source)).rejects.toThrow();
  });

  it("refuses destructive overlapping moves", async () => {
    const { root, service } = await fixture();
    const parent = path.join(root, "parent");
    const source = path.join(parent, "source");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "keep.txt"), "keep", "utf8");

    await expect(service.move(source, parent, true)).rejects.toThrow(/overlap/i);
    expect(await fs.readFile(path.join(source, "keep.txt"), "utf8")).toBe("keep");

    const childDestination = path.join(source, "..nested-destination");
    await expect(service.move(source, childDestination, true)).rejects.toThrow(/overlap/i);
    expect(await fs.readFile(path.join(source, "keep.txt"), "utf8")).toBe("keep");
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
