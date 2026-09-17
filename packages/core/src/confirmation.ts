import { randomUUID } from "node:crypto";

export interface ConfirmationIssue {
  token: string;
  expiresAt: number;
  expiresInSeconds: number;
}

interface ConfirmationRecord {
  command: string;
  cwd: string;
  expiresAt: number;
}

export class ConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmationError";
  }
}

export interface ConfirmationStoreOptions {
  ttlMs?: number;
  now?: () => number;
}

export class ConfirmationStore {
  private readonly records = new Map<string, ConfirmationRecord>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: ConfirmationStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 300_000;
    this.now = options.now ?? Date.now;
  }

  issue(command: string, cwd: string): ConfirmationIssue {
    const token = randomUUID();
    const expiresAt = this.now() + this.ttlMs;
    this.records.set(token, { command, cwd, expiresAt });
    return {
      token,
      expiresAt,
      expiresInSeconds: Math.ceil(this.ttlMs / 1000),
    };
  }

  consume(token: string, command: string, cwd: string): true {
    const record = this.records.get(token);
    if (!record) throw new ConfirmationError("Unknown or already used confirmation token.");

    if (record.expiresAt < this.now()) {
      this.records.delete(token);
      throw new ConfirmationError("Confirmation token expired.");
    }

    if (record.command !== command || record.cwd !== cwd) {
      throw new ConfirmationError("Confirmation token does not match command and cwd.");
    }

    this.records.delete(token);
    return true;
  }
}
