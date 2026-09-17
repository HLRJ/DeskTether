import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../src/audit.js";
import { Policy, PolicyError } from "../src/policy.js";
import { ProcessSessionManager } from "../src/sessions/process-session.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-proc-"));
  const policy = new Policy({ allowedRoots: [root], blockedCommands: ["shutdown"] });
  return { root, manager: new ProcessSessionManager(policy, new AuditLog(path.join(root, "audit.jsonl"))) };
}

async function waitUntilExited(manager: ProcessSessionManager, id: string) {
  for (let i = 0; i < 40 && manager.read(id).status === "running"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("ProcessSessionManager", () => {
  it("captures command output", async () => {
    const { root, manager } = await fixture();
    const session = await manager.start("node -p 42", root);
    await waitUntilExited(manager, session.id);
    expect(manager.read(session.id).output.trim()).toBe("42");
  });

  it("terminates a long-running command", async () => {
    const { root, manager } = await fixture();
    const session = await manager.start(`node -e "setInterval(function(){},1000)"`, root);
    expect(manager.list().map((item) => item.id)).toContain(session.id);
    await manager.terminate(session.id);
    expect(manager.read(session.id).status).toBe("terminated");
  });

  it("rejects blocked commands before spawning", async () => {
    const { root, manager } = await fixture();
    await expect(manager.start("shutdown /s /t 0", root)).rejects.toBeInstanceOf(PolicyError);
  });
});