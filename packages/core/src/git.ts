import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Policy } from "./policy.js";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, policy: Policy, args: string[]): Promise<string> {
  const safeCwd = policy.assertPath(cwd);
  const { stdout } = await execFileAsync("git", ["-C", safeCwd, ...args], {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trimEnd();
}

export function gitStatus(cwd: string, policy: Policy): Promise<string> {
  return runGit(cwd, policy, ["status", "--short"]);
}

export function gitDiff(cwd: string, policy: Policy): Promise<string> {
  return runGit(cwd, policy, ["diff", "--no-ext-diff"]);
}

export function gitLog(cwd: string, policy: Policy, limit = 20): Promise<string> {
  const count = Math.max(1, Math.min(100, Math.trunc(limit)));
  return runGit(cwd, policy, ["log", "--oneline", "-n", String(count)]);
}
