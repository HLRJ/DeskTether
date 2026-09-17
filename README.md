# DeskTether

**Securely connect AI agents to your local machine.**

DeskTether is an open-source, Windows-first MCP bridge that exposes carefully scoped local-computer capabilities to AI clients. V0.2 adds explicit PowerShell MCP actions and an OpenAI Secure MCP Tunnel bootstrap path on top of the V0.1 local capability layer.

> **Status:** V0.2 development release. Local MCP runs over stdio, and the included Windows scripts can attach that stdio server to OpenAI Secure MCP Tunnel without exposing a public inbound port. Final ChatGPT Web write-action use still depends on workspace eligibility.

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
- Blocked command-prefix policy
- Persistent JSONL audit log
- Text file read/write and directory listing- Long-running terminal sessions with buffered output and stdin
- Explicit PowerShell start/read/input/list/terminate tools
- System process listing and PID termination
- Cancellable, paged file/content search sessions
- Read-only Git `status`, `diff`, and `log`
- Device/runtime information
- MCP TypeScript SDK v2 over stdio
- OpenAI Secure MCP Tunnel bootstrap with pinned tunnel-client verification

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

After creating the OpenAI tunnel and runtime key, set `CONTROL_PLANE_TUNNEL_ID` and `CONTROL_PLANE_API_KEY`, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\tunnel\Connect-DeskTetherTunnel.ps1 `
  -DoctorOnly

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\tunnel\Connect-DeskTetherTunnel.ps1
```

See [`docs/secure-mcp-tunnel.md`](docs/secure-mcp-tunnel.md) for the complete setup and current ChatGPT plan/workspace requirements.
## Configuration

| Variable | Meaning | Default |
|---|---|---|
| `DESKTETHER_ALLOWED_ROOTS` | Allowed filesystem roots; separate Windows roots with `;` | current working directory |
| `DESKTETHER_BLOCKED_COMMANDS` | Comma-separated command prefixes rejected before spawn | destructive system commands |
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

DeskTether should be treated as a local execution bridge, not as a sandbox. It reduces risk with explicit allowed filesystem roots, blocked command prefixes, structured tool schemas, audit logs, and an authenticated outbound tunnel, but a permitted PowerShell session can still execute powerful commands.

Do **not** expose DeskTether itself with direct port forwarding or a public reverse proxy. Use the supported Secure MCP Tunnel path for remote ChatGPT access.

The audit log records the tool name, arguments, result class, duration, and timestamp. Secrets should not be passed directly as PowerShell command text or tool arguments because they may appear in local audit records.

## Development

```powershell
pnpm test
pnpm test:tunnel
pnpm typecheck
pnpm build
```
Core capabilities live in `packages/core`. The MCP transport adapter lives in `apps/mcp-server`. The tunnel scripts live in `scripts/tunnel`. This keeps local-computer logic independent from ChatGPT/tunnel plumbing.

## Roadmap

- **V0.1** — filesystem, policy, audit, terminal/process sessions, streaming search, Git inspection, stdio MCP
- **V0.2** — explicit PowerShell tools + OpenAI Secure MCP Tunnel bootstrap
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
