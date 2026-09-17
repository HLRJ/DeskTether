import { describe, expect, it } from "vitest";
import path from "node:path";
import { Policy, PolicyError } from "../src/policy.js";

describe("Policy", () => {
  it("accepts paths inside an allowed root", () => {
    const root = path.resolve("G:/Codes");
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    expect(policy.assertPath(path.join(root, "DeskTether"))).toContain("DeskTether");
  });

  it("rejects paths outside every allowed root", () => {
    const policy = new Policy({ allowedRoots: [path.resolve("G:/Codes")], blockedCommands: [] });
    expect(() => policy.assertPath(path.resolve("C:/Windows"))).toThrow(PolicyError);
  });

  it("rejects blocked command prefixes case-insensitively", () => {
    const policy = new Policy({ allowedRoots: [path.resolve("G:/Codes")], blockedCommands: ["shutdown", "format"] });
    expect(() => policy.assertCommand("SHUTDOWN /s /t 0")).toThrow(PolicyError);
    expect(policy.assertCommand("git status")).toBe("git status");
  });
});