import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AuditLog } from "../audit.js";
import { ConfirmationStore } from "../confirmation.js";
import { Policy } from "../policy.js";

export type ProcessSessionStatus = "running" | "exited" | "terminated";

export interface ProcessReadOffsets {
  stdoutOffset?: number;
  stderrOffset?: number;
}

export interface ProcessSessionView {
  id: string;
  command: string;
  cwd: string;
  status: ProcessSessionStatus;
  pid: number;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  output: string;
  stdout: string;
  stderr: string;
  stdoutOffset: number;
  stderrOffset: number;
  truncatedBeforeOffset: { stdout: number; stderr: number };
}
export interface ConfirmationRequiredView {
  status: "confirmation_required";
  command: string;
  cwd: string;
  confirmationToken: string;
  expiresInSeconds: number;
}

export type ProcessStartResult = ProcessSessionView | ConfirmationRequiredView;

export interface ProcessSessionManagerOptions {
  confirmations?: ConfirmationStore;
  maxBufferBytes?: number;
  maxSessions?: number;
  retentionMs?: number;
  now?: () => number;
}

class StreamBuffer {
  private data = Buffer.alloc(0);
  private startOffset = 0;
  private endOffset = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer | string): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.endOffset += bytes.length;
    this.data = Buffer.concat([this.data, bytes]);
    if (this.data.length > this.maxBytes) {
      const overflow = this.data.length - this.maxBytes;
      this.data = this.data.subarray(overflow);
      this.startOffset += overflow;
    }
  }

  read(offset?: number): {
    text: string;
    nextOffset: number;
    truncatedBeforeOffset: number;
  } {
    const requested = offset ?? this.startOffset;
    const effective = Math.min(Math.max(requested, this.startOffset), this.endOffset);
    const relative = effective - this.startOffset;
    return {
      text: this.data.subarray(relative).toString("utf8"),
      nextOffset: this.endOffset,
      truncatedBeforeOffset: this.startOffset,
    };
  }
}

interface ProcessSession {
  id: string;
  command: string;
  cwd: string;
  status: ProcessSessionStatus;
  pid: number;
  startedAt: string;
  endedAt: string | null;
  endedAtMs: number | null;
  exitCode: number | null;
  child: ChildProcessWithoutNullStreams;
  stdout: StreamBuffer;
  stderr: StreamBuffer;
}

export class ProcessSessionManager {
  private readonly sessions = new Map<string, ProcessSession>();
  private readonly confirmations: ConfirmationStore;
  private readonly maxBufferBytes: number;
  private readonly maxSessions: number;
  private readonly retentionMs: number;
  private readonly now: () => number;

  constructor(
    private readonly policy: Policy,
    private readonly audit: AuditLog,
    options: ProcessSessionManagerOptions = {},
  ) {
    this.confirmations = options.confirmations ?? new ConfirmationStore();
    this.maxBufferBytes = options.maxBufferBytes ?? 1024 * 1024;
    this.maxSessions = options.maxSessions ?? 32;
    this.retentionMs = options.retentionMs ?? 30 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  async start(
    command: string,
    cwd: string,
    confirmationToken?: string,
  ): Promise<ProcessStartResult> {
    this.pruneExpired();
    const started = this.now();
    const safeCommand = this.policy.assertCommand(command);
    const safeCwd = this.policy.assertPath(cwd);
    const evaluation = this.policy.evaluateCommand(safeCommand);

    if (evaluation.decision === "CONFIRM") {
      if (!confirmationToken) {
        const issued = this.confirmations.issue(safeCommand, safeCwd);
        return {
          status: "confirmation_required",
          command: safeCommand,
          cwd: safeCwd,
          confirmationToken: issued.token,
          expiresInSeconds: issued.expiresInSeconds,
        };
      }
      this.confirmations.consume(confirmationToken, safeCommand, safeCwd);
    }

    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum process session count reached: ${this.maxSessions}`);
    }

    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const args = process.platform === "win32"
      ? ["-NoProfile", "-Command", safeCommand]
      : ["-lc", safeCommand];
    const child = spawn(shell, args, {
      cwd: safeCwd,
      stdio: "pipe",
      windowsHide: true,
    });
    const id = randomUUID();
    const session: ProcessSession = {
      id,
      command: safeCommand,
      cwd: safeCwd,
      status: "running",
      pid: child.pid ?? 0,
      startedAt: new Date(started).toISOString(),
      endedAt: null,
      endedAtMs: null,
      exitCode: null,
      child,
      stdout: new StreamBuffer(this.maxBufferBytes),
      stderr: new StreamBuffer(this.maxBufferBytes),
    };
    this.sessions.set(id, session);

    child.stdout.on("data", (chunk: Buffer) => session.stdout.append(chunk));
    child.stderr.on("data", (chunk: Buffer) => session.stderr.append(chunk));
    child.on("close", (code) => {
      session.exitCode = code;
      const ended = this.now();
      session.endedAtMs = ended;
      session.endedAt = new Date(ended).toISOString();
      if (session.status === "running") session.status = "exited";
      this.scheduleCleanup(id);
    });

    await this.audit.append({
      tool: "start_process",
      args: { command: safeCommand, cwd: safeCwd },
      status: "success",
      durationMs: this.now() - started,
    });
    return this.view(session);
  }

  read(id: string, offsets: ProcessReadOffsets = {}): ProcessSessionView {
    this.pruneExpired();
    return this.view(this.requireSession(id), offsets);
  }

  list(): ProcessSessionView[] {
    this.pruneExpired();
    return [...this.sessions.values()].map((session) => this.view(session));
  }

  write(id: string, input: string): void {
    this.pruneExpired();
    const session = this.requireSession(id);
    if (session.status !== "running") {
      throw new Error(`Session is not running: ${id}`);
    }
    session.child.stdin.write(input);
  }

  async terminate(id: string): Promise<void> {
    this.pruneExpired();
    const session = this.requireSession(id);
    if (session.status === "running") {
      session.status = "terminated";
      const ended = this.now();
      session.endedAtMs = ended;
      session.endedAt = new Date(ended).toISOString();
      session.child.kill();
      this.scheduleCleanup(id);
    }
    await this.audit.append({
      tool: "terminate_process",
      args: { sessionId: id },
      status: "success",
      durationMs: 0,
    });
  }

  private pruneExpired(): void {
    const cutoff = this.now() - this.retentionMs;
    for (const [id, session] of this.sessions) {
      if (
        session.status !== "running"
        && session.endedAtMs !== null
        && session.endedAtMs <= cutoff
      ) {
        this.sessions.delete(id);
      }
    }
  }

  private scheduleCleanup(id: string): void {
    if (this.retentionMs <= 0) {
      this.sessions.delete(id);
      return;
    }
    const timer = setTimeout(() => {
      const session = this.sessions.get(id);
      if (!session || session.status === "running" || session.endedAtMs === null) {
        return;
      }
      if (this.now() - session.endedAtMs >= this.retentionMs) {
        this.sessions.delete(id);
      }
    }, this.retentionMs);
    timer.unref?.();
  }

  private requireSession(id: string): ProcessSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown process session: ${id}`);
    return session;
  }

  private view(
    session: ProcessSession,
    offsets: ProcessReadOffsets = {},
  ): ProcessSessionView {
    const stdout = session.stdout.read(offsets.stdoutOffset);
    const stderr = session.stderr.read(offsets.stderrOffset);
    return {
      id: session.id,
      command: session.command,
      cwd: session.cwd,
      status: session.status,
      pid: session.pid,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      exitCode: session.exitCode,
      output: stdout.text + stderr.text,
      stdout: stdout.text,
      stderr: stderr.text,
      stdoutOffset: stdout.nextOffset,
      stderrOffset: stderr.nextOffset,
      truncatedBeforeOffset: {
        stdout: stdout.truncatedBeforeOffset,
        stderr: stderr.truncatedBeforeOffset,
      },
    };
  }
}
