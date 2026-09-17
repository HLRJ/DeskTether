import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { killProcess, listProcesses } from "../src/processes.js";

describe("process helpers", () => {
  it("lists system processes", async () => {
    const processes = await listProcesses();
    expect(processes.length).toBeGreaterThan(0);
    expect(processes.some((item) => Number.isInteger(item.pid) && item.name.length > 0)).toBe(true);
  });

  it("kills a child process by pid", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(function(){},1000)"], { windowsHide: true });
    if (!child.pid) throw new Error("child pid was not assigned");
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await killProcess(child.pid);
    await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error("child did not exit")), 2000)),
    ]);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});