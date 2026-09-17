import fs from "node:fs/promises";
import path from "node:path";
import { AuditLog, type AuditStatus } from "./audit.js";
import { Policy } from "./policy.js";

export interface FileEntry {
  name: string;
  type: "file" | "directory" | "other";
}

export interface MultipleFileRead {
  path: string;
  content: string;
}

export interface FileInfo {
  path: string;
  name: string;
  type: "file" | "directory" | "other";
  size: number;
  createdAt: string;
  modifiedAt: string;
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

  async readMultiple(filePaths: string[]): Promise<MultipleFileRead[]> {
    return this.run("read_multiple_files", { paths: filePaths }, async () => {
      const resolved = filePaths.map((filePath) => this.policy.assertPath(filePath));
      return Promise.all(resolved.map(async (filePath) => ({
        path: filePath,
        content: await fs.readFile(filePath, "utf8"),
      })));
    });
  }

  async writeText(filePath: string, content: string): Promise<void> {
    return this.run("write_file", { path: filePath }, async () => {
      const resolved = this.policy.assertPath(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
    });
  }

  async createDirectory(directory: string): Promise<void> {
    return this.run("create_directory", { path: directory }, async () => {
      const resolved = this.policy.assertPath(directory);
      await fs.mkdir(resolved, { recursive: true });
    });
  }
  async move(source: string, destination: string, overwrite = false): Promise<void> {
    return this.run("move_file", { source, destination, overwrite }, async () => {
      const safeSource = this.policy.assertPath(source);
      const safeDestination = this.policy.assertPath(destination);
      const samePath = process.platform === "win32"
        ? safeSource.toLowerCase() === safeDestination.toLowerCase()
        : safeSource === safeDestination;
      if (samePath) {
        throw new Error("Source and destination resolve to the same path.");
      }

      const sourceStat = await fs.stat(safeSource);
      if (!sourceStat.isFile()) {
        throw new Error(`Source is not a file: ${safeSource}`);
      }

      try {
        await fs.stat(safeDestination);
        if (!overwrite) {
          throw new Error(`Destination already exists: ${safeDestination}`);
        }
        await fs.rm(safeDestination, { force: true });
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }

      await fs.mkdir(path.dirname(safeDestination), { recursive: true });
      await fs.rename(safeSource, safeDestination);
    });
  }

  async getInfo(targetPath: string): Promise<FileInfo> {
    return this.run("get_file_info", { path: targetPath }, async () => {
      const resolved = this.policy.assertPath(targetPath);
      const stat = await fs.stat(resolved);
      return {
        path: resolved,
        name: path.basename(resolved),
        type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      };
    });
  }
  async editBlock(
    filePath: string,
    oldText: string,
    newText: string,
    expectedReplacements = 1,
  ): Promise<{ replacements: number }> {
    return this.run(
      "edit_block",
      { path: filePath, expectedReplacements },
      async () => {
        if (!oldText) throw new Error("oldText must not be empty.");
        if (!Number.isInteger(expectedReplacements) || expectedReplacements <= 0) {
          throw new Error("expectedReplacements must be a positive integer.");
        }

        const resolved = this.policy.assertPath(filePath);
        const original = await fs.readFile(resolved, "utf8");
        if (original.includes("\0")) {
          throw new Error("edit_block only supports text files.");
        }

        const found = original.split(oldText).length - 1;
        if (found !== expectedReplacements) {
          throw new Error(
            `Expected ${expectedReplacements} replacement(s) but found ${found}; file was not changed.`,
          );
        }

        const updated = original.split(oldText).join(newText);
        await fs.writeFile(resolved, updated, "utf8");
        return { replacements: found };
      },
    );
  }
  private async run<T>(
    tool: string,
    args: Record<string, unknown>,
    operation: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await operation();
      await this.audit.append({
        tool,
        args,
        status: "success",
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      const status: AuditStatus = error instanceof Error && error.name === "PolicyError"
        ? "rejected"
        : "error";
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
