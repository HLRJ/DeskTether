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

describe("V0.2.3 foundation MCP tools", () => {
  it("supports recursive listing, ranged reads, and append writes", async () => {
    const { root, runtime } = await fixture();
    await fs.mkdir(path.join(root, "src", "nested"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "main.ts"), "abcdef", "utf8");

    const listed = await executeTool(runtime, "list_directory", {
      path: root,
      depth: 2,
      maxEntries: 20,
    });
    const tree = jsonResult<{ entries: Array<{ relativePath: string }>; truncated: boolean }>(listed);
    expect(tree.truncated).toBe(false);
    expect(tree.entries.some((entry) => entry.relativePath.endsWith("main.ts"))).toBe(true);

    const ranged = await executeTool(runtime, "read_text_file", {
      path: path.join(root, "src", "main.ts"),
      offset: 2,
      length: 3,
    });
    expect(jsonResult<{ content: string }>(ranged).content).toBe("cde");

    const appendPath = path.join(root, "append.txt");
    await executeTool(runtime, "write_text_file", { path: appendPath, content: "alpha" });
    await executeTool(runtime, "write_text_file", {
      path: appendPath,
      content: "\nbeta",
      mode: "append",
    });
    expect(await fs.readFile(appendPath, "utf8")).toBe("alpha\nbeta");
  });

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

  it("starts regex code searches with glob filters", async () => {
    const { root, runtime } = await fixture();
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "main.ts"), "const needle42 = 1;\n", "utf8");
    await fs.writeFile(path.join(root, "src", "main.js"), "const needle42 = 1;\n", "utf8");

    const started = await executeTool(runtime, "search_code", {
      root,
      pattern: "needle\\d+",
      include: ["**/*.ts"],
      caseSensitive: true,
    });
    const search = jsonResult<{ id: string }>(started);

    let page: { status: string; results: Array<{ path: string }> } = {
      status: "running",
      results: [],
    };
    for (let index = 0; index < 40 && page.status === "running"; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const read = await executeTool(runtime, "get_search_results", {
        sessionId: search.id,
        offset: 0,
        length: 10,
      });
      page = jsonResult<typeof page>(read);
    }

    expect(page.status).toBe("completed");
    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.path).toMatch(/main\.ts$/);
  });

  it("returns recent audited tool activity", async () => {
    const { runtime } = await fixture();
    await executeTool(runtime, "device_info", {});
    const recent = await executeTool(runtime, "get_recent_activity", { limit: 10 });
    const records = jsonResult<Array<{ tool: string }>>(recent);
    expect(records.some((record) => record.tool === "device_info")).toBe(true);
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
