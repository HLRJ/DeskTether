import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Policy, PolicyError } from "../src/policy.js";
import { gitDiff, gitLog, gitStatus } from "../src/git.js";

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

async function repoFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-git-"));
  git(root, "init");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "DeskTether Test");
  await fs.writeFile(path.join(root, "note.txt"), "v1\n", "utf8");
  git(root, "add", "note.txt");
  git(root, "commit", "-m", "initial");
  const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
  return { root, policy };
}
describe("git helpers", () => {
  it("reports status, diff, and recent commits", async () => {
    const { root, policy } = await repoFixture();
    await fs.writeFile(path.join(root, "note.txt"), "v2\n", "utf8");
    expect(await gitStatus(root, policy)).toContain("note.txt");
    expect(await gitDiff(root, policy)).toContain("-v1");
    expect(await gitLog(root, policy, 5)).toContain("initial");
  });

  it("rejects repositories outside allowed roots", async () => {
    const { policy } = await repoFixture();
    await expect(gitStatus(os.tmpdir(), policy)).rejects.toBeInstanceOf(PolicyError);
  });
});
