import fs from "node:fs/promises";
import path from "node:path";
import { AuditLog, type AuditStatus } from "./audit.js";
import { Policy } from "./policy.js";

export interface FileEntry {
  name: string;
  type: "file" | "directory" | "other";
}

export interface DirectoryTreeEntry extends FileEntry {
  relativePath: string;
  depth: number;
}

export interface DirectoryTreeResult {
  entries: DirectoryTreeEntry[];
  truncated: boolean;
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

export interface TextReadPage {
  content: string;
  startOffset: number;
  nextOffset: number;
  totalBytes: number;
  hasMore: boolean;
}

const MAX_TEXT_READ_BYTES = 1024 * 1024;

function utf8SequenceLength(byte: number): number {
  if ((byte & 0x80) === 0) return 1;
  if ((byte & 0xe0) === 0xc0) return 2;
  if ((byte & 0xf0) === 0xe0) return 3;
  if ((byte & 0xf8) === 0xf0) return 4;
  return 1;
}

function trimIncompleteUtf8Tail(buffer: Buffer): Buffer {
  if (buffer.length === 0) return buffer;
  let leadIndex = buffer.length - 1;
  while (leadIndex > 0 && (buffer[leadIndex]! & 0xc0) === 0x80) leadIndex -= 1;
  const expected = utf8SequenceLength(buffer[leadIndex]!);
  const available = buffer.length - leadIndex;
  return available < expected ? buffer.subarray(0, leadIndex) : buffer;
}

function isSameOrInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === ""
    || (!path.isAbsolute(relative)
      && relative !== ".."
      && !relative.startsWith(`..${path.sep}`));
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
  async listTree(
    directory: string,
    maxDepth = 1,
    maxEntries = 500,
  ): Promise<DirectoryTreeResult> {
    return this.run("list_directory", { path: directory, depth: maxDepth, maxEntries }, async () => {
      if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 20) {
        throw new Error("depth must be an integer between 1 and 20.");
      }
      if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 5000) {
        throw new Error("maxEntries must be an integer between 1 and 5000.");
      }

      const root = this.policy.assertPath(directory);
      const entries: DirectoryTreeEntry[] = [];
      let truncated = false;

      const walk = async (current: string, depth: number): Promise<void> => {
        if (truncated || depth > maxDepth) return;
        const dirents = await fs.readdir(current, { withFileTypes: true });
        dirents.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of dirents) {
          if (entries.length >= maxEntries) {
            truncated = true;
            return;
          }

          const fullPath = path.join(current, entry.name);
          entries.push({
            name: entry.name,
            relativePath: path.relative(root, fullPath),
            depth,
            type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
          });

          if (entry.isDirectory() && depth < maxDepth) {
            await walk(fullPath, depth + 1);
            if (truncated) return;
          }
        }
      };

      await walk(root, 1);
      return { entries, truncated };
    });
  }

  async readText(filePath: string): Promise<string> {
    return this.run("read_file", { path: filePath }, async () => {
      const resolved = this.policy.assertPath(filePath);
      const stat = await fs.stat(resolved);
      if (stat.size > MAX_TEXT_READ_BYTES) {
        throw new Error(
          `Text file is too large for an unpaged read (${stat.size} bytes); use offset and length.`,
        );
      }
      return fs.readFile(resolved, "utf8");
    });
  }

  async readTextRange(
    filePath: string,
    offset = 0,
    length = 64 * 1024,
  ): Promise<TextReadPage> {
    return this.run("read_file", { path: filePath, offset, length }, async () => {
      if (!Number.isInteger(offset)) throw new Error("offset must be an integer.");
      if (!Number.isInteger(length) || length <= 0 || length > MAX_TEXT_READ_BYTES) {
        throw new Error(`length must be between 1 and ${MAX_TEXT_READ_BYTES} bytes.`);
      }

      const resolved = this.policy.assertPath(filePath);
      const stat = await fs.stat(resolved);
      const requestedStart = offset < 0
        ? Math.max(0, stat.size + offset)
        : Math.min(offset, stat.size);
      const bytesToRead = Math.min(length, stat.size - requestedStart);
      const handle = await fs.open(resolved, "r");
      try {
        const buffer = Buffer.alloc(bytesToRead);
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, requestedStart);
        let page = buffer.subarray(0, bytesRead);
        let startOffset = requestedStart;

        while (page.length > 0 && (page[0]! & 0xc0) === 0x80) {
          page = page.subarray(1);
          startOffset += 1;
        }
        const completePage = trimIncompleteUtf8Tail(page);

        const nextOffset = startOffset + completePage.length;
        return {
          content: completePage.toString("utf8"),
          startOffset,
          nextOffset,
          totalBytes: stat.size,
          hasMore: nextOffset < stat.size,
        };
      } finally {
        await handle.close();
      }
    });
  }

  async readMultiple(filePaths: string[]): Promise<MultipleFileRead[]> {
    return this.run("read_multiple_files", { paths: filePaths }, async () => {
      const resolved = filePaths.map((filePath) => this.policy.assertPath(filePath));
      const stats = await Promise.all(resolved.map((filePath) => fs.stat(filePath)));

      for (let index = 0; index < stats.length; index += 1) {
        if (stats[index]!.size > MAX_TEXT_READ_BYTES) {
          throw new Error(
            `File is too large for read_multiple_files: ${resolved[index]} (${stats[index]!.size} bytes).`,
          );
        }
      }

      const totalBytes = stats.reduce((sum, stat) => sum + stat.size, 0);
      if (totalBytes > 2 * MAX_TEXT_READ_BYTES) {
        throw new Error(
          `Combined read is too large (${totalBytes} bytes); reduce the file batch.`,
        );
      }

      return Promise.all(resolved.map(async (filePath) => ({
        path: filePath,
        content: await fs.readFile(filePath, "utf8"),
      })));
    });
  }

  async writeText(
    filePath: string,
    content: string,
    mode: "rewrite" | "append" = "rewrite",
  ): Promise<void> {
    return this.run("write_file", { path: filePath, mode }, async () => {
      const resolved = this.policy.assertPath(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      if (mode === "append") {
        await fs.appendFile(resolved, content, "utf8");
      } else {
        await fs.writeFile(resolved, content, "utf8");
      }
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
      if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
        throw new Error(`Source must be a file or directory: ${safeSource}`);
      }

      const destinationContainsSource = isSameOrInside(safeDestination, safeSource);
      const sourceContainsDestination = sourceStat.isDirectory()
        && isSameOrInside(safeSource, safeDestination);
      if (destinationContainsSource || sourceContainsDestination) {
        throw new Error("Source and destination paths overlap; move was refused.");
      }

      try {
        await fs.stat(safeDestination);
        if (!overwrite) {
          throw new Error(`Destination already exists: ${safeDestination}`);
        }
        await fs.rm(safeDestination, { recursive: true, force: true });
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
