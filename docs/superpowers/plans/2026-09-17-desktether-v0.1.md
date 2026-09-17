# DeskTether V0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a tested Windows-first MCP server that safely exposes local filesystem, terminal/session, search, process, Git, device-info, permission, and audit capabilities.

**Architecture:** Use a pnpm TypeScript monorepo with a reusable packages/core capability layer and a thin pps/mcp-server adapter. All local operations flow through policy checks and append JSONL audit records; long-running operations use in-memory session registries.

**Tech Stack:** Node.js 24+, TypeScript, pnpm 11+, Vitest, @modelcontextprotocol/sdk, Zod.

**Spec:** docs/superpowers/specs/2026-09-17-desktether-v0.1-design.md

## Global Constraints
- Windows is the primary V0.1 execution platform; keep core APIs portable where practical.
- Default-deny filesystem access outside configured roots.
- No GUI automation, browser control, public tunnel, OAuth, or multi-device transport in V0.1.
- No production capability code is added before its behavior test fails for the expected reason.
- Every externally callable operation emits an audit record.

---

### Task 1: Monorepo foundation, policy, and audit
**Files:** Create root package/tsconfig/workspace files; create packages/core/src/policy.ts, udit.ts, index.ts; tests in packages/core/test/policy.test.ts and udit.test.ts.
**Interfaces:** Policy.create({allowedRoots, blockedCommands}), ssertPath(path), ssertCommand(command); AuditLog.append(record).
- [ ] Write tests proving allowed-root normalization, outside-root rejection, blocked-command rejection, and JSONL audit append.
- [ ] Run targeted tests and verify RED because modules do not exist.
- [ ] Implement the minimal policy and audit APIs.
- [ ] Re-run targeted tests and full package tests to verify GREEN.
- [ ] Commit eat: add policy and audit core.

### Task 2: Filesystem and device capabilities
**Files:** Create ilesystem.ts, device.ts; tests ilesystem.test.ts, device.test.ts.
**Interfaces:** FileSystemService.list/readText/writeText; getDeviceInfo().
- [ ] Write tests using a temp allowed root and proving reads/writes/listing plus denied escape paths.
- [ ] Verify RED, implement minimal services with policy + audit integration, then verify GREEN.
- [ ] Commit eat: add filesystem and device capabilities.

### Task 3: Terminal/process session manager
**Files:** Create sessions/process-session.ts, processes.ts; tests process-session.test.ts, processes.test.ts.
**Interfaces:** start(command,cwd) -> sessionId, ead(sessionId), write(sessionId,input), 	erminate(sessionId), list(); process listing/kill helpers.
- [ ] Write tests with a deterministic Node child process and blocked-command case.
- [ ] Verify RED, implement spawn-based session lifecycle with buffered output and policy checks, verify GREEN.
- [ ] Commit eat: add terminal session management.

### Task 4: Streaming search and Git helpers
**Files:** Create sessions/search-session.ts, git.ts; tests search-session.test.ts, git.test.ts.
**Interfaces:** cancellable search sessions returning paged matches; gitStatus, gitDiff, gitLog scoped to authorized working directories.
- [ ] Write RED tests against temp fixtures and a temp Git repository.
- [ ] Implement minimal recursive search with cancellation and Git subprocess helpers; verify GREEN.
- [ ] Commit eat: add search sessions and git helpers.

### Task 5: MCP server adapter and public project docs
**Files:** Create pps/mcp-server/src/server.ts, index.ts, package config; root README.md, LICENSE, .env.example.
**Interfaces:** MCP stdio server registers stable tool names mapping one-to-one to core services.
- [ ] Write a server registration test asserting required tool names and schemas are present.
- [ ] Verify RED, implement the MCP adapter, then verify test/build/typecheck GREEN.
- [ ] Document setup, security defaults, current tool catalog, and roadmap.
- [ ] Run pnpm test, pnpm typecheck, pnpm build from repository root.
- [ ] Commit eat: ship DeskTether v0.1 core.
