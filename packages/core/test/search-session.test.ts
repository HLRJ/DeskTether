import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../src/audit.js";
import { Policy } from "../src/policy.js";
import { SearchSessionManager } from "../src/sessions/search-session.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-search-"));
  await fs.mkdir(path.join(root, "nested"));
  await fs.writeFile(path.join(root, "nested", "notes.txt"), "alpha\nneedle here\nomega\n", "utf8");
  const manager = new SearchSessionManager(new Policy({ allowedRoots: [root], blockedCommands: [] }), new AuditLog(path.join(root, "audit.jsonl")));
  return { root, manager };
}

async function waitForDone(manager: SearchSessionManager, id: string) {
  for (let i = 0; i < 40 && manager.read(id).status === "running"; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
}

describe("SearchSessionManager", () => {
  it("finds files and content with paged results", async () => {
    const { root, manager } = await fixture();
    const files = manager.start({ root, pattern: "notes", mode: "files" });
    await waitForDone(manager, files.id);
    expect(manager.read(files.id, 0, 10).results[0]?.path).toMatch(/notes\.txt$/);
    const content = manager.start({ root, pattern: "needle", mode: "content" });
    await waitForDone(manager, content.id);
    expect(manager.read(content.id, 0, 10).results[0]).toEqual(expect.objectContaining({ line: 2, preview: "needle here" }));
  });

  it("supports regex code search with include and exclude globs", async () => {
    const { root, manager } = await fixture();
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "main.ts"), "const needle42 = 1;\n", "utf8");
    await fs.writeFile(path.join(root, "src", "main.js"), "const needle42 = 1;\n", "utf8");
    await fs.writeFile(path.join(root, "src", "skip.test.ts"), "const needle42 = 1;\n", "utf8");

    const session = manager.start({
      root,
      pattern: "needle\\d+",
      mode: "regex",
      include: ["**/*.ts"],
      exclude: ["**/*.test.ts"],
      caseSensitive: true,
    });
    await waitForDone(manager, session.id);

    const page = manager.read(session.id, 0, 10);
    expect(page.status).toBe("completed");
    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.path).toMatch(/main\.ts$/);
    expect(page.results[0]?.preview).toContain("needle42");
  });

  it("can cancel a running search", async () => {
    const { root, manager } = await fixture();
    const session = manager.start({ root, pattern: "anything", mode: "content" });
    manager.cancel(session.id);
    expect(manager.read(session.id).status).toBe("cancelled");
  });

  it("lists search session metadata", async () => {
    const { root, manager } = await fixture();
    const first = manager.start({ root, pattern: "notes", mode: "files" });
    const second = manager.start({ root, pattern: "needle", mode: "content" });
    await waitForDone(manager, first.id);
    await waitForDone(manager, second.id);

    expect(manager.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: first.id,
        root: path.resolve(root),
        pattern: "notes",
        mode: "files",
        status: "completed",
        total: 1,
      }),
      expect.objectContaining({
        id: second.id,
        root: path.resolve(root),
        pattern: "needle",
        mode: "content",
        status: "completed",
        total: 1,
      }),
    ]));
  });
});