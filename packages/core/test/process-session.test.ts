import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../src/audit.js";
import { Policy, PolicyError } from "../src/policy.js";
import { ProcessSessionManager } from "../src/sessions/process-session.js";

async function fixture(policyOptions: {
  blockedCommands?: string[];
  confirmCommands?: string[];
  allowCommands?: string[];
  denyCommands?: string[];
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-proc-"));
  const policy = new Policy({
    allowedRoots: [root],
    blockedCommands: policyOptions.blockedCommands ?? ["shutdown"],
    confirmCommands: policyOptions.confirmCommands,
    allowCommands: policyOptions.allowCommands,
    denyCommands: policyOptions.denyCommands,
  });
  return { root, manager: new ProcessSessionManager(policy, new AuditLog(path.join(root, "audit.jsonl"))) };
}

async function waitUntilExited(
  manager: ProcessSessionManager,
  id: string,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (manager.read(id).status === "running") {
    if (Date.now() >= deadline) {
      throw new Error(`Process session did not exit within ${timeoutMs}ms: ${id}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe("ProcessSessionManager", () => {
  it("captures command output", async () => {
    const { root, manager } = await fixture();
    const session = await manager.start("node -p 42", root);
    expect(session.status).toBe("running");
    if (session.status !== "running") throw new Error("expected running session");
    await waitUntilExited(manager, session.id);
    expect(manager.read(session.id).output.trim()).toBe("42");
  });

  it("requires confirmation before spawning a CONFIRM command", async () => {
    const { root, manager } = await fixture({ confirmCommands: ["node"] });
    const pending = await manager.start("node -p 42", root);

    expect(pending.status).toBe("confirmation_required");
    expect(manager.list()).toHaveLength(0);
  });

  it("executes a CONFIRM command only after consuming its matching token", async () => {
    const { root, manager } = await fixture({ confirmCommands: ["node"] });
    const pending = await manager.start("node -p 42", root);
    if (pending.status !== "confirmation_required") throw new Error("expected confirmation");

    const session = await manager.start("node -p 42", root, pending.confirmationToken);
    expect(session.status).toBe("running");
    if (session.status !== "running") throw new Error("expected running session");
    await waitUntilExited(manager, session.id);
    expect(manager.read(session.id).output.trim()).toBe("42");
  });

  it("terminates a long-running command", async () => {
    const { root, manager } = await fixture();
    const session = await manager.start(`node -e "setInterval(function(){},1000)"`, root);
    expect(session.status).toBe("running");
    if (session.status !== "running") throw new Error("expected running session");
    expect(manager.list().map((item) => item.id)).toContain(session.id);
    await manager.terminate(session.id);
    expect(manager.read(session.id).status).toBe("terminated");
  });

  it("rejects blocked commands before spawning", async () => {
    const { root, manager } = await fixture();
    await expect(manager.start("shutdown /s /t 0", root)).rejects.toBeInstanceOf(PolicyError);
  });

  it("separates stdout and stderr and reports process metadata", async () => {
    const { root, manager } = await fixture();
    const session = await manager.start(
      `node -e "process.stdout.write('out'); process.stderr.write('err')"`,
      root,
    );
    if (session.status === "confirmation_required") throw new Error("unexpected confirmation");
    await waitUntilExited(manager, session.id);

    const view = manager.read(session.id);
    expect(view.stdout).toBe("out");
    expect(view.stderr).toBe("err");
    expect(view.pid).toBeGreaterThan(0);
    expect(view.startedAt).toMatch(/T/);
    expect(view.endedAt).toMatch(/T/);
    expect(view.exitCode).toBe(0);
  });

  it("supports offset reads and reports truncated output", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-buffer-"));
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    const manager = new ProcessSessionManager(
      policy,
      new AuditLog(path.join(root, "audit.jsonl")),
      { maxBufferBytes: 4 },
    );
    const session = await manager.start(`node -e "process.stdout.write('abcdef')"`, root);
    if (session.status === "confirmation_required") throw new Error("unexpected confirmation");
    await waitUntilExited(manager, session.id);

    const full = manager.read(session.id, { stdoutOffset: 0 });
    expect(full.stdout).toBe("cdef");
    expect(full.stdoutOffset).toBe(6);
    expect(full.truncatedBeforeOffset.stdout).toBe(2);

    const tail = manager.read(session.id, { stdoutOffset: 4 });
    expect(tail.stdout).toBe("ef");
  });

  it("rejects new sessions after the configured session limit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-limit-"));
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    const manager = new ProcessSessionManager(
      policy,
      new AuditLog(path.join(root, "audit.jsonl")),
      { maxSessions: 1 },
    );
    const first = await manager.start("node -p 1", root);
    if (first.status === "confirmation_required") throw new Error("unexpected confirmation");
    await waitUntilExited(manager, first.id);

    await expect(manager.start("node -p 2", root)).rejects.toThrow(/maximum process session/i);
  });

  it("removes finished sessions after the retention window", async () => {
    let now = 1_000;
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktether-retention-"));
    const policy = new Policy({ allowedRoots: [root], blockedCommands: [] });
    const manager = new ProcessSessionManager(
      policy,
      new AuditLog(path.join(root, "audit.jsonl")),
      { retentionMs: 100, now: () => now },
    );
    const session = await manager.start("node -p 1", root);
    if (session.status === "confirmation_required") throw new Error("unexpected confirmation");
    await waitUntilExited(manager, session.id);
    expect(manager.list()).toHaveLength(1);

    now += 101;
    expect(manager.list()).toHaveLength(0);
  });
});
