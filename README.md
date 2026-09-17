# DeskTether

**Securely connect AI agents to your local machine.**

DeskTether is an open-source, Windows-first MCP bridge that exposes carefully scoped local-computer capabilities to AI clients. V0.2.1 hardens the V0.2 PowerShell and Secure MCP Tunnel path with three-state command policy, one-time confirmations, richer process sessions, safer audit metadata, and tunnel health/status UX.

> **Status:** V0.2.1 development release. Local MCP runs over stdio, and the included Windows scripts can attach that stdio server to OpenAI Secure MCP Tunnel without exposing a public inbound port. Final ChatGPT Web write-action use still depends on workspace eligibility.

## Why DeskTether

AI coding clients are useful when they can inspect and operate on the same machine as your projects, but unrestricted shell access is risky. DeskTether separates the MCP adapter from the local capability layer and puts path policy plus JSONL audit logging around operations.

```text
ChatGPT Web / MCP Client
          |
          | Secure MCP Tunnel or local stdio
          v
DeskTether MCP Server
          |
          +-- Policy / Audit
          +-- Filesystem
          +-- PowerShell / Terminal Sessions
          +-- Process Tools
          +-- Streaming Search
          +-- Git Inspection
```

## Capabilities

- Allowed-root filesystem boundary
- Three-state command policy: `ALLOW`, `CONFIRM`, and `DENY`
- One-time confirmation tokens bound to command + working directory
- Persistent JSONL audit log with confirmation/session metadata and token redaction
- Text file read/write and directory listing
- Long-running terminal sessions with bounded stdout/stderr buffers, offsets, stdin, PID, timing, and exit code
- Explicit PowerShell start/read/input/list/terminate tools
- System process listing and PID termination
- Cancellable, paged file/content search sessions
- Read-only Git `status`, `diff`, and `log`
- Device/runtime information
- MCP TypeScript SDK v2 over stdio
- OpenAI Secure MCP Tunnel bootstrap with pinned tunnel-client verification, doctor/start/status commands, PID file, and health probe

## MCP tools

| Group | Tools |
|---|---|
| Device | `device_info` |
| Files | `list_directory`, `read_text_file`, `write_text_file` |
| Terminal | `start_process`, `read_process_output`, `write_process_input`, `terminate_process`, `list_sessions` |
| PowerShell | `powershell_start`, `powershell_read`, `powershell_input`, `powershell_terminate`, `powershell_list` |
| Processes | `list_processes`, `kill_process` |
| Search | `start_search`, `get_search_results`, `stop_search` |
| Git | `git_status`, `git_diff`, `git_log` |

## Requirements

- Windows 10/11 or Windows Server for the primary path
- Node.js 24+
- pnpm 11+
- Git for Git-related tools

## Quick start

```powershell
git clone https://github.com/HLRJ/DeskTether.git
cd DeskTether
pnpm install
pnpm test
pnpm test:tunnel
pnpm build
```

Set the folders DeskTether is allowed to access before starting it:

```powershell
$env:DESKTETHER_ALLOWED_ROOTS=(Get-Location).Path
$env:DESKTETHER_BLOCKED_COMMANDS="format,diskpart,shutdown,shutdown.exe,restart-computer"
$env:DESKTETHER_CONFIRM_COMMANDS="remove-item -recurse,git push,npm publish,pnpm publish"
$env:DESKTETHER_ALLOW_COMMANDS="git status,pnpm test"
pnpm mcp
```

If `DESKTETHER_ALLOWED_ROOTS` is omitted, DeskTether allows only the current working directory tree.

## ChatGPT Web via Secure MCP Tunnel

DeskTether does not expose a public HTTP listener. The supported remote path uses OpenAI `tunnel-client`, which polls the tunnel control plane over outbound HTTPS and forwards MCP traffic to DeskTether over stdio.

```powershell
pnpm test:tunnel
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\tunnel\Install-TunnelClient.ps1
```

After creating the OpenAI tunnel and runtime key, set `CONTROL_PLANE_TUNNEL_ID` and `CONTROL_PLANE_API_KEY`, then use the V0.2.1 tunnel commands:

```powershell
pnpm tunnel:doctor
pnpm tunnel:start
```

In another terminal, inspect the live local tunnel state without reading or printing the API key:

```powershell
pnpm tunnel:status
```

See [`docs/secure-mcp-tunnel.md`](docs/secure-mcp-tunnel.md) for the complete setup and current ChatGPT plan/workspace requirements.
## Configuration

| Variable | Meaning | Default |
|---|---|---|
| `DESKTETHER_ALLOWED_ROOTS` | Allowed filesystem roots; separate Windows roots with `;` | current working directory |
| `DESKTETHER_BLOCKED_COMMANDS` | Legacy denylist; mapped to `DENY` | destructive system commands |
| `DESKTETHER_DENY_COMMANDS` | Additional command prefixes that are always rejected | empty |
| `DESKTETHER_CONFIRM_COMMANDS` | Command prefixes requiring one-time confirmation | selected destructive/publish/push commands |
| `DESKTETHER_ALLOW_COMMANDS` | Explicit safe prefixes that override broader `CONFIRM` rules | `git status,pnpm test` |
| `DESKTETHER_AUDIT_PATH` | JSONL audit file | `%USERPROFILE%\.desktether\audit.jsonl` |
| `CONTROL_PLANE_TUNNEL_ID` | OpenAI Secure MCP Tunnel identifier | none |
| `CONTROL_PLANE_API_KEY` | Runtime key used by tunnel-client | none |
| `TUNNEL_CLIENT_BIN` | Optional tunnel-client binary override | repository `.tools` path |

Example for multiple roots on Windows:

```powershell
$root1 = (Resolve-Path .).Path
$root2 = (Resolve-Path ..\another-project).Path
$env:DESKTETHER_ALLOWED_ROOTS="$root1;$root2"
```

## Security model

DeskTether should be treated as a local execution bridge, not as a sandbox. It reduces risk with explicit allowed filesystem roots, three-state command policy, one-time confirmation tokens, structured tool schemas, audit logs, and an authenticated outbound tunnel, but a permitted PowerShell session can still execute powerful commands.

Do **not** expose DeskTether itself with direct port forwarding or a public reverse proxy. Use the supported Secure MCP Tunnel path for remote ChatGPT access.

The audit log records tool, policy decision, confirmation state, session identity, exit code, result class, duration, and timestamp where applicable. DeskTether strips `confirmationToken` before audit persistence. Reusable secrets still should not be passed directly as PowerShell command text because command text itself may be audited.

## Development

```powershell
pnpm test
pnpm test:tunnel
pnpm typecheck
pnpm build
pnpm tunnel:status
```
Core capabilities live in `packages/core`. The MCP transport adapter lives in `apps/mcp-server`. The tunnel scripts live in `scripts/tunnel`. This keeps local-computer logic independent from ChatGPT/tunnel plumbing.

## Roadmap

- **V0.1** — filesystem, policy, audit, terminal/process sessions, streaming search, Git inspection, stdio MCP
- **V0.2** — explicit PowerShell tools + OpenAI Secure MCP Tunnel bootstrap
- **V0.2.1** — three-state permission engine, one-time confirmation, bounded session streaming, richer audit, tunnel doctor/start/status
- **V0.3** — Chrome DevTools / browser automation adapter
- **V0.4** — Windows screenshots, window discovery, keyboard/mouse and UI Automation
- **V0.5** — multi-device pairing, stronger permission profiles, local approval UX
- **V1.0** — hardened remote MCP bridge for multiple AI clients

## Project layout

```text
DeskTether/
├─ apps/
│  └─ mcp-server/
├─ packages/
│  └─ core/
├─ scripts/
│  └─ tunnel/
├─ docs/
│  ├─ secure-mcp-tunnel.md
│  └─ superpowers/
├─ .env.example
├─ package.json
└─ pnpm-workspace.yaml
```

## License

Apache-2.0. See `LICENSE`.
