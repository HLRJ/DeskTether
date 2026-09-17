import { describe, expect, it } from "vitest";
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
