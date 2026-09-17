import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AuditLog } from "../audit.js";
import { Policy } from "../policy.js";

export type SearchMode = "files" | "content" | "regex";
export type SearchStatus = "running" | "completed" | "cancelled" | "failed";

export interface SearchResult {
  path: string;
  line?: number;
  preview?: string;
}

export interface SearchOptions {
  root: string;
  pattern: string;
  mode: SearchMode;
  maxResults?: number;
  include?: string[];
  exclude?: string[];
  caseSensitive?: boolean;
}

interface ResolvedSearchOptions {
  root: string;
  pattern: string;
  mode: SearchMode;
  maxResults: number;
  include: string[];
  exclude: string[];
  caseSensitive: boolean;
}

interface SearchSession {
  id: string;
  root: string;
  pattern: string;
  mode: SearchMode;
  createdAt: string;
  status: SearchStatus;
  results: SearchResult[];
  error?: string;
  cancelled: boolean;
}

export interface SearchSessionSummary {
  id: string;
  root: string;
  pattern: string;
  mode: SearchMode;
  createdAt: string;
  status: SearchStatus;
  total: number;
  error?: string;
}

export interface SearchPage {
  id: string;
  status: SearchStatus;
  results: SearchResult[];
  total: number;
  error?: string;
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replaceAll("\\", "/");
  let source = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    if (char === "*") {
      if (normalized[index + 1] === "*") {
        index += 1;
        if (normalized[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if ("\\.^$+{}()|[]".includes(char)) source += "\\" + char;
    else source += char;
  }

  return new RegExp(source + "$");
}

function matchesGlobs(relativePath: string, patterns: string[]): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

export class SearchSessionManager {
  private readonly sessions = new Map<string, SearchSession>();

  constructor(
    private readonly policy: Policy,
    private readonly audit: AuditLog,
  ) {}

  start(options: SearchOptions): Pick<SearchPage, "id" | "status"> {
    const root = this.policy.assertPath(options.root);
    const session: SearchSession = {
      id: randomUUID(),
      root,
      pattern: options.pattern,
      mode: options.mode,
      createdAt: new Date().toISOString(),
      status: "running",
      results: [],
      cancelled: false,
    };
    this.sessions.set(session.id, session);
    void this.audit.append({
      tool: "start_search",
      args: {
        root,
        pattern: options.pattern,
        mode: options.mode,
        include: options.include ?? [],
        exclude: options.exclude ?? [],
        caseSensitive: options.caseSensitive ?? false,
      },
      status: "success",
      durationMs: 0,
    });
    void this.scan(session, {
      root,
      pattern: options.pattern,
      mode: options.mode,
      maxResults: options.maxResults ?? 1000,
      include: options.include ?? [],
      exclude: options.exclude ?? [],
      caseSensitive: options.caseSensitive ?? false,
    });
    return { id: session.id, status: session.status };
  }

  read(id: string, offset = 0, length = 100): SearchPage {
    const session = this.requireSession(id);
    return {
      id,
      status: session.status,
      results: session.results.slice(offset, offset + length),
      total: session.results.length,
      error: session.error,
    };
  }

  cancel(id: string): void {
    const session = this.requireSession(id);
    session.cancelled = true;
    if (session.status === "running") session.status = "cancelled";
  }

  list(): SearchSessionSummary[] {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      root: session.root,
      pattern: session.pattern,
      mode: session.mode,
      createdAt: session.createdAt,
      status: session.status,
      total: session.results.length,
      error: session.error,
    }));
  }

  private async scan(session: SearchSession, options: ResolvedSearchOptions): Promise<void> {
    try {
      const regex = options.mode === "regex"
        ? new RegExp(options.pattern, options.caseSensitive ? "" : "i")
        : undefined;
      await this.walk(session, options, options.root, regex);
      if (session.status === "running") session.status = "completed";
    } catch (error) {
      session.status = "failed";
      session.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async walk(
    session: SearchSession,
    options: ResolvedSearchOptions,
    directory: string,
    regex?: RegExp,
  ): Promise<void> {
    if (session.cancelled || session.results.length >= options.maxResults) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (session.cancelled || session.results.length >= options.maxResults) return;
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".worktrees") continue;
      const fullPath = path.join(directory, entry.name);
      if (path.resolve(fullPath) === this.audit.path) continue;
      if (entry.isDirectory()) {
        await this.walk(session, options, fullPath, regex);
        continue;
      }
      if (!entry.isFile()) continue;

      const relativePath = path.relative(options.root, fullPath);
      if (options.exclude.length > 0 && matchesGlobs(relativePath, options.exclude)) continue;
      if (options.include.length > 0 && !matchesGlobs(relativePath, options.include)) continue;

      if (options.mode === "files") {
        const name = options.caseSensitive ? entry.name : entry.name.toLowerCase();
        const needle = options.caseSensitive ? options.pattern : options.pattern.toLowerCase();
        if (name.includes(needle)) session.results.push({ path: fullPath });
        continue;
      }
      await this.searchContent(session, options, fullPath, regex);
    }
  }

  private async searchContent(
    session: SearchSession,
    options: ResolvedSearchOptions,
    filePath: string,
    regex?: RegExp,
  ): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 2 * 1024 * 1024) return;
      const text = await fs.readFile(filePath, "utf8");
      const needle = options.caseSensitive ? options.pattern : options.pattern.toLowerCase();
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (session.cancelled || session.results.length >= options.maxResults) return;
        const matched = options.mode === "regex"
          ? Boolean(regex?.test(line))
          : (options.caseSensitive ? line : line.toLowerCase()).includes(needle);
        if (matched) {
          session.results.push({ path: filePath, line: index + 1, preview: line.trim() });
        }
      }
    } catch {
      // Skip files that cannot be decoded or read.
    }
  }

  private requireSession(id: string): SearchSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Unknown search session: ${id}`);
    return session;
  }
}