import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeTool } from "../src/handler.js";
import { createRuntime } from "../src/runtime.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-basic-"));
  const runtime = createRuntime({
    allowedRoots: [root],
    blockedCommands: [],
    auditPath: path.join(root, "audit.jsonl"),
  });
  return { root, runtime };
}

function jsonResult<T>(result: Awaited<ReturnType<typeof executeTool>>): T {
  return JSON.parse(result.content[0]!.text) as T;
}

describe("V0.2.2 basic MCP tools", () => {
  it("reads multiple text files", async () => {
    const { root, runtime } = await fixture();
    const a = path.join(root, "a.txt");
    const b = path.join(root, "b.txt");
    await fs.writeFile(a, "A", "utf8");
    await fs.writeFile(b, "B", "utf8");
    const result = await executeTool(runtime, "read_multiple_files", { paths: [a, b] });
    expect(result.isError).toBeUndefined();
    expect(jsonResult<Array<{ content: string }>>(result).map((item) => item.content))
      .toEqual(["A", "B"]);
  });

  it("creates directories, reports info, moves files, and edits exact blocks", async () => {
    const { root, runtime } = await fixture();
    const directory = path.join(root, "nested", "dir");
    expect((await executeTool(runtime, "create_directory", { path: directory })).isError)
      .toBeUndefined();

    const source = path.join(directory, "source.txt");
    await fs.writeFile(source, "hello world", "utf8");
    const infoResult = await executeTool(runtime, "get_file_info", { path: source });
    expect(jsonResult<{ type: string; size: number }>(infoResult))
      .toEqual(expect.objectContaining({ type: "file", size: 11 }));

    const editResult = await executeTool(runtime, "edit_block", {
      path: source,
      oldText: "world",
      newText: "DeskTether",
    });
    expect(jsonResult<{ replacements: number }>(editResult).replacements).toBe(1);
    expect(await fs.readFile(source, "utf8")).toBe("hello DeskTether");

    const destination = path.join(root, "moved.txt");
    const moveResult = await executeTool(runtime, "move_file", {
      source,
      destination,
    });
    expect(moveResult.isError).toBeUndefined();
    expect(await fs.readFile(destination, "utf8")).toBe("hello DeskTether");
  });

  it("lists active and completed search sessions", async () => {
    const { root, runtime } = await fixture();
    await fs.writeFile(path.join(root, "notes.txt"), "needle", "utf8");
    const started = await executeTool(runtime, "start_search", {
      root,
      pattern: "notes",
      mode: "files",
    });
    const search = jsonResult<{ id: string }>(started);

    const listed = await executeTool(runtime, "list_searches", {});
    const summaries = jsonResult<Array<{ id: string; pattern: string }>>(listed);
    expect(summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: search.id, pattern: "notes" }),
    ]));
  });
});
