import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AuditLog } from "../audit.js";
import { Policy } from "../policy.js";

export type SearchMode = "files" | "content";
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
      args: { root, pattern: options.pattern, mode: options.mode },
      status: "success",
      durationMs: 0,
    });
    void this.scan(session, { ...options, root, maxResults: options.maxResults ?? 1000 });
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

  private async scan(session: SearchSession, options: Required<SearchOptions>): Promise<void> {
    try {
      await this.walk(session, options, options.root);
      if (session.status === "running") session.status = "completed";
    } catch (error) {
      session.status = "failed";
      session.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async walk(session: SearchSession, options: Required<SearchOptions>, directory: string): Promise<void> {
    if (session.cancelled || session.results.length >= options.maxResults) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (session.cancelled || session.results.length >= options.maxResults) return;
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".worktrees") continue;
      const fullPath = path.join(directory, entry.name);
      if (path.resolve(fullPath) === this.audit.path) continue;
      if (entry.isDirectory()) {
        await this.walk(session, options, fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (options.mode === "files") {
        if (entry.name.toLowerCase().includes(options.pattern.toLowerCase())) session.results.push({ path: fullPath });
        continue;
      }
      await this.searchContent(session, options, fullPath);
    }
  }

  private async searchContent(session: SearchSession, options: Required<SearchOptions>, filePath: string): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 2 * 1024 * 1024) return;
      const text = await fs.readFile(filePath, "utf8");
      const needle = options.pattern.toLowerCase();
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (session.cancelled || session.results.length >= options.maxResults) return;
        if (line.toLowerCase().includes(needle)) session.results.push({ path: filePath, line: index + 1, preview: line.trim() });
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