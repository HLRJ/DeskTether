import fs from "node:fs/promises";
import path from "node:path";
import type { CommandDecision } from "./policy.js";

export type AuditStatus = "success" | "rejected" | "error";

export interface AuditRecord {
  timestamp?: string;
  tool: string;
  status: AuditStatus;
  durationMs: number;
  args?: Record<string, unknown>;
  error?: string;
  decision?: CommandDecision;
  confirmationRequired?: boolean;
  confirmationConsumed?: boolean;
  sessionId?: string;
  exitCode?: number | null;
}

export interface StoredAuditRecord extends AuditRecord {
  timestamp: string;
}

export interface AuditLogOptions {
  maxBytes?: number;
  maxBackups?: number;
}

export class AuditLog {
  private readonly maxBytes: number;
  private readonly maxBackups: number;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    options: AuditLogOptions = {},
  ) {
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    this.maxBackups = options.maxBackups ?? 3;
  }

  get path(): string {
    return path.resolve(this.filePath);
  }
  async append(record: AuditRecord): Promise<void> {
    const task = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const payload: StoredAuditRecord = {
        ...record,
        timestamp: record.timestamp ?? new Date().toISOString(),
      };
      const line = `${JSON.stringify(payload)}\n`;
      await this.rotateIfNeeded(Buffer.byteLength(line));
      await fs.appendFile(this.filePath, line, "utf8");
    });

    this.writeChain = task.catch(() => undefined);
    await task;
  }

  async recent(limit = 50): Promise<StoredAuditRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error("limit must be an integer between 1 and 1000.");
    }

    await this.writeChain;
    const records: StoredAuditRecord[] = [];
    const files = [
      this.filePath,
      ...Array.from({ length: this.maxBackups }, (_, index) => this.backupPath(index + 1)),
    ];

    for (const file of files) {
      let raw: string;
      try {
        raw = await fs.readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }

      const lines = raw.split(/\r?\n/).filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
          records.push(JSON.parse(lines[index]!) as StoredAuditRecord);
        } catch {
          continue;
        }
        if (records.length >= limit) return records;
      }
    }

    return records;
  }
  private async rotateIfNeeded(incomingBytes: number): Promise<void> {
    let currentBytes = 0;
    try {
      currentBytes = (await fs.stat(this.filePath)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (currentBytes === 0 || currentBytes + incomingBytes <= this.maxBytes) return;

    if (this.maxBackups <= 0) {
      await fs.rm(this.filePath, { force: true });
      return;
    }

    await fs.rm(this.backupPath(this.maxBackups), { force: true });
    for (let index = this.maxBackups; index >= 2; index -= 1) {
      try {
        await fs.rename(this.backupPath(index - 1), this.backupPath(index));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    try {
      await fs.rename(this.filePath, this.backupPath(1));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private backupPath(index: number): string {
    const parsed = path.parse(this.filePath);
    return path.join(parsed.dir, `${parsed.name}.${index}${parsed.ext}`);
  }
}
