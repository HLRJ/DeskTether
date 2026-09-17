import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { createRuntimeFromEnv } from "../src/runtime.js";

const keys = [
  "DESKTETHER_ALLOWED_ROOTS",
  "DESKTETHER_BLOCKED_COMMANDS",
  "DESKTETHER_DENY_COMMANDS",
  "DESKTETHER_CONFIRM_COMMANDS",
  "DESKTETHER_ALLOW_COMMANDS",
  "DESKTETHER_AUDIT_PATH",
] as const;

const original = new Map(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("createRuntimeFromEnv", () => {
  it("loads legacy and three-state command policies together", () => {
    process.env.DESKTETHER_ALLOWED_ROOTS = path.resolve(".");
    process.env.DESKTETHER_BLOCKED_COMMANDS = "legacy-block";
    process.env.DESKTETHER_DENY_COMMANDS = "git push --force";
    process.env.DESKTETHER_CONFIRM_COMMANDS = "git";
    process.env.DESKTETHER_ALLOW_COMMANDS = "git status";

    const runtime = createRuntimeFromEnv();

    expect(runtime.policy.evaluateCommand("legacy-block now").decision).toBe("DENY");
    expect(runtime.policy.evaluateCommand("git push --force origin main").decision).toBe("DENY");
    expect(runtime.policy.evaluateCommand("git status").decision).toBe("ALLOW");
    expect(runtime.policy.evaluateCommand("git push origin main").decision).toBe("CONFIRM");
  });
});
