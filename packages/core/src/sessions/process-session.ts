import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AuditLog } from "../audit.js";
import { Policy } from "../policy.js";

export type ProcessSessionStatus = "running" | "exited" | "terminated";

export interface ProcessSessionView {
  id: string;
  command: string;
  cwd: string;
  status: ProcessSessionStatus;
  output: string;
  exitCode: number | null;
}

interface ProcessSession extends ProcessSessionView {
  child: ChildProcessWithoutNullStreams;
}

export class ProcessSessionManager {
  private readonly sessions = new Map<string, ProcessSession>();

  constructor(
    private readonly policy: Policy,
    private readonly audit: AuditLog,
  ) {}

  async start(command: string, cwd: string): Promise<ProcessSessionView> {
    const started = Date.now();
    const safeCommand = this.policy.assertCommand(command);
    const safeCwd = this.policy.assertPath(cwd);
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const args = process.platform === "win32" ? ["-NoProfile", "-Command", safeCommand] : ["-lc", safeCommand];
    const child = spawn(shell, args, { cwd: safeCwd, stdio: "pipe", windowsHide: true });
    const id = randomUUID();
    const session: ProcessSession = { id, command: safeCommand, cwd: safeCwd, status: "running", output: "", exitCode: null, child };
    this.sessions.set(id, session);
    child.stdout.on("data", (chunk) => { session.output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { session.output += chunk.toString(); });
    child.on("close", (code) => {
      session.exitCode = code;
      if (session.status === "running") session.status = "exited";
    });
    await this.audit.append({ tool: "start_process", args: { command: safeCommand, cwd: safeCwd }, status: "success", durationMs: Date.now() - started });
    return this.view(session);
  }

  read(id: string): ProcessSessionView {
    return this.view(this.requireSession(id));
  }

  list(): ProcessSessionView[] {
    return [...this.sessions.values()].map((session) => this.view(session));
  }

  write(id: string, input: string): void {
    const session = this.requireSession(id);
    if (session.status !== "running") throw new Error(`Session is not running: ${id}`);
    session.child.stdin.write(input);
  }

  async terminate(id: string): Promise<void> {
    const session = this.requireSession(id);
    if (session.status === "running") {
      session.status = "terminated";
      session.child.kill();
    }
    await this.audit.append({ tool: "terminate_process", args: { sessionId: id }, status: "success", durationMs: 0 });
  }

  private requireSession(id: string): ProcessSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown process session: ${id}`);
    return session;
  }

  private view(session: ProcessSession): ProcessSessionView {
    const { child: _child, ...view } = session;
    return { ...view };
  }
}