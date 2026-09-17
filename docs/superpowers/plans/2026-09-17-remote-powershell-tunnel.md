# DeskTether Remote PowerShell Tunnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DeskTether ready for ChatGPT Web PowerShell control through OpenAI Secure MCP Tunnel without exposing a local inbound port.

**Architecture:** Keep DeskTether as a stdio MCP server. Add explicit PowerShell tool aliases over the existing policy-enforced session manager, then add pinned/verified Windows tunnel-client bootstrap scripts that connect the stdio server to the OpenAI tunnel control plane.

**Tech Stack:** Node.js 24, TypeScript 7, pnpm 11, Vitest 5, MCP Server SDK 2, Zod 4, Windows PowerShell 5.1+, OpenAI tunnel-client v0.0.14.

**Spec:** `docs/superpowers/specs/2026-09-17-remote-powershell-tunnel-design.md`

## Global Constraints

- No public HTTP listener is added to DeskTether.
- Existing V0.1 tool names remain compatible.
- PowerShell calls reuse `ProcessSessionManager`; no unrestricted second shell path.
- Tunnel runtime credentials come only from environment variables or user-local tunnel-client state.
- Official tunnel-client release is pinned to v0.0.14 and verified against its release SHA256 manifest.
- Full ChatGPT Web write actions remain subject to OpenAI workspace/plan eligibility.

---
### Task 1: Explicit PowerShell MCP tools

**Files:**
- Modify: `apps/mcp-server/src/tool-catalog.ts`
- Modify: `apps/mcp-server/src/handler.ts`
- Test: `apps/mcp-server/test/powershell-tools.test.ts`

**Interfaces:**
- Produces tools `powershell_start`, `powershell_read`, `powershell_input`, `powershell_list`, `powershell_terminate`.
- Each tool delegates to `runtime.processSessions` and therefore inherits Policy and Audit behavior.

- [x] **Step 1: Write failing catalog and handler tests** that assert all five names exist and that `powershell_start` followed by `powershell_read` returns output from `Write-Output 'desk-tether-ready'`.
- [x] **Step 2: Run** `pnpm --filter @desktether/mcp-server test -- powershell-tools.test.ts` and confirm failure because the tools are unknown.
- [x] **Step 3: Add minimal schemas and dispatch cases**; do not duplicate process/session logic.
- [x] **Step 4: Re-run targeted and full MCP tests** and confirm GREEN.
- [x] **Step 5: Commit** `feat: add explicit powershell mcp tools`.

### Task 2: Tested Windows tunnel bootstrap module

**Files:**
- Create: `scripts/tunnel/DeskTether.Tunnel.psm1`
- Create: `scripts/tunnel/test-tunnel-module.ps1`
- Modify: `package.json`

**Interfaces:**
- `Get-DeskTetherTunnelRelease` returns pinned version, archive name, checksum URL, and archive URL.
- `Get-DeskTetherMcpCommand -ProjectRoot` returns the compiled stdio MCP launch command.
- `Assert-DeskTetherTunnelEnvironment` requires `CONTROL_PLANE_TUNNEL_ID` and `CONTROL_PLANE_API_KEY` without printing values.

- [ ] **Step 1: Write a PowerShell test script** asserting v0.0.14 asset naming, MCP command path, and missing-secret rejection.
- [ ] **Step 2: Run** `powershell.exe -NoProfile -File scripts/tunnel/test-tunnel-module.ps1` and confirm RED because the module is absent.
- [ ] **Step 3: Implement only the tested helper functions** in the module.
- [ ] **Step 4: Add root script `test:tunnel` and run it GREEN**.
- [ ] **Step 5: Commit** `feat: add secure tunnel bootstrap helpers`.
### Task 3: Install and connect scripts

**Files:**
- Create: `scripts/tunnel/Install-TunnelClient.ps1`
- Create: `scripts/tunnel/Connect-DeskTetherTunnel.ps1`
- Modify: `.gitignore`
- Modify: `.env.example`

**Interfaces:**
- Installer downloads the exact v0.0.14 Windows amd64 archive and `SHA256SUMS.txt`, verifies the archive, then extracts under `.tools/tunnel-client/v0.0.14/`.
- Connector builds DeskTether, initializes a user-local tunnel-client profile using `node <repo>/apps/mcp-server/dist/index.js`, runs `doctor --explain`, and only then starts `tunnel-client run`.

- [ ] **Step 1: Extend the PowerShell test script** to syntax-parse both scripts and assert the repository never stores a runtime key literal.
- [ ] **Step 2: Run tests RED** because the scripts do not exist.
- [ ] **Step 3: Implement installer and connector**, sourcing shared helpers from `DeskTether.Tunnel.psm1`.
- [ ] **Step 4: Run `pnpm test:tunnel` GREEN**, then execute the installer on this Windows machine and verify `tunnel-client --version` reports `0.0.14`.
- [ ] **Step 5: Run connector preflight without credentials** and verify it fails safely before tunnel startup with names of missing variables only.
- [ ] **Step 6: Commit** `feat: add secure tunnel installer and connector`.

### Task 4: Documentation and release verification

**Files:**
- Modify: `README.md`
- Create: `docs/secure-mcp-tunnel.md`

**Interfaces:**
- Documentation gives exact local build/install commands, OpenAI tunnel prerequisites, ChatGPT app setup path, security defaults, and troubleshooting boundaries.

- [ ] **Step 1: Document the end-to-end flow** including the current Plus/full-MCP limitation and eligible Business/Enterprise/Edu requirement.
- [ ] **Step 2: Run** `pnpm test`, `pnpm test:tunnel`, `pnpm typecheck`, and `pnpm build` from repository root.
- [ ] **Step 3: Smoke-import the compiled MCP server** and assert the catalog includes all PowerShell tools.
- [ ] **Step 4: Scan staged files for OpenAI key patterns and reject any secret-bearing change.**
- [ ] **Step 5: Commit** `docs: document secure mcp tunnel setup`.

## Expected External Blocker

A live ChatGPT Web call cannot be completed on this machine until an eligible ChatGPT workspace provides custom full-MCP access and the OpenAI Platform organization provides a tunnel ID plus a runtime API key. The implementation must leave the repository and local machine ready at that boundary rather than weakening authentication or exposing PowerShell publicly.

