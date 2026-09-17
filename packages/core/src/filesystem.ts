import fs from "node:fs/promises";
import path from "node:path";
import { AuditLog, type AuditStatus } from "./audit.js";
import { Policy } from "./policy.js";

export interface FileEntry {
  name: string;
  type: "file" | "directory" | "other";
}

export class FileSystemService {
  constructor(
    private readonly policy: Policy,
    private readonly audit: AuditLog,
  ) {}

  async list(directory: string): Promise<FileEntry[]> {
    return this.run("list_directory", { path: directory }, async () => {
      const resolved = this.policy.assertPath(directory);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      }));
    });
  }

  async readText(filePath: string): Promise<string> {
    return this.run("read_file", { path: filePath }, async () => {
      return fs.readFile(this.policy.assertPath(filePath), "utf8");
    });
  }

  async writeText(filePath: string, content: string): Promise<void> {
    return this.run("write_file", { path: filePath }, async () => {
      const resolved = this.policy.assertPath(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
    });
  }

  private async run<T>(tool: string, args: Record<string, unknown>, operation: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      const result = await operation();
      await this.audit.append({ tool, args, status: "success", durationMs: Date.now() - started });
      return result;
    } catch (error) {
      const status: AuditStatus = error instanceof Error && error.name === "PolicyError" ? "rejected" : "error";
      await this.audit.append({
        tool,
        args,
        status,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}