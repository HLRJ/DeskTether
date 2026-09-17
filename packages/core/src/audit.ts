import fs from "node:fs/promises";
import path from "node:path";

export type AuditStatus = "success" | "rejected" | "error";

export interface AuditRecord {
  timestamp?: string;
  tool: string;
  status: AuditStatus;
  durationMs: number;
  args?: Record<string, unknown>;
  error?: string;
}

export class AuditLog {
  constructor(private readonly filePath: string) {}

  get path(): string {
    return path.resolve(this.filePath);
  }

  async append(record: AuditRecord): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const payload = {
      ...record,
      timestamp: record.timestamp ?? new Date().toISOString(),
    };    await fs.appendFile(this.filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }
}
