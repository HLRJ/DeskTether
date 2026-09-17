import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Policy, PolicyError } from "../src/policy.js";

describe("Policy", () => {
  const root = path.resolve("workspace");

  it("accepts paths inside an allowed root", () => {
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    expect(policy.assertPath(path.join(root, "project"))).toContain("project");
  });

  it("rejects paths outside every allowed root", () => {
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    expect(() => policy.assertPath(path.resolve("outside"))).toThrow(PolicyError);
  });

  it("accepts valid child names that begin with two dots", () => {
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    expect(policy.assertPath(path.join(root, "..cache", "file.txt")))
      .toBe(path.resolve(root, "..cache", "file.txt"));
  });

  it("rejects symlink or junction traversal outside an allowed root", async () => {
    const allowed = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-policy-allowed-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-policy-outside-"));
    const link = path.join(allowed, "escape");
    await fs.symlink(outside, link, process.platform === "win32" ? "junction" : "dir");

    const policy = new Policy({ allowedRoots: [allowed], blockedCommands: [] });
    expect(() => policy.assertPath(path.join(link, "secret.txt"))).toThrow(PolicyError);
  });

  it("maps legacy blockedCommands to DENY", () => {
    const policy = new Policy({ allowedRoots: [root], blockedCommands: ["shutdown"] });
    expect(policy.evaluateCommand("SHUTDOWN /s").decision).toBe("DENY");
    expect(() => policy.assertCommand("shutdown /s")).toThrow(PolicyError);
  });

  it("applies DENY before ALLOW and CONFIRM", () => {
    const policy = new Policy({
      allowedRoots: [root],
      blockedCommands: [],
      denyCommands: ["git push"],
      allowCommands: ["git push"],
      confirmCommands: ["git"],
    });
    expect(policy.evaluateCommand("git push origin main").decision).toBe("DENY");
  });

  it("applies explicit ALLOW before CONFIRM", () => {
    const policy = new Policy({
      allowedRoots: [root],
      blockedCommands: [],
      allowCommands: ["git status"],
      confirmCommands: ["git"],
    });
    expect(policy.evaluateCommand("git status").decision).toBe("ALLOW");
    expect(policy.evaluateCommand("git push origin main").decision).toBe("CONFIRM");
  });

  it("does not let an explicit ALLOW bypass broader CONFIRM through shell composition", () => {
    const policy = new Policy({
      allowedRoots: [root],
      blockedCommands: [],
      allowCommands: ["git status"],
      confirmCommands: ["git"],
    });

    expect(policy.evaluateCommand("git status && git push").decision).toBe("CONFIRM");
    expect(policy.evaluateCommand("git status > status.txt").decision).toBe("CONFIRM");
    expect(policy.evaluateCommand("git status $(git push)").decision).toBe("CONFIRM");
  });

  it("defaults unmatched commands to ALLOW", () => {
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    expect(policy.evaluateCommand("Get-Location").decision).toBe("ALLOW");
  });
});
