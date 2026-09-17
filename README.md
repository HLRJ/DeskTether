# DeskTether

**Securely connect AI agents to your local machine.**

DeskTether is an open-source, Windows-first MCP bridge that exposes carefully scoped local-computer capabilities to AI clients. V0.1 focuses on files, terminal sessions, process inspection, streaming search, Git inspection, permission boundaries, and auditable execution.

> **Status:** early V0.1. The current transport is local MCP over stdio. Remote MCP / secure tunneling for browser-hosted ChatGPT is a later milestone.

## Why DeskTether

AI coding clients are useful when they can inspect and operate on the same machine as your projects, but unrestricted shell access is risky. DeskTether separates the MCP adapter from the local capability layer and puts path policy plus JSONL audit logging around operations.

```text
AI / MCP Client
      |
      | stdio (V0.1)
      v
DeskTether MCP Server
      |
      +-- Policy / Audit
      +-- Filesystem
      +-- Terminal Sessions
      +-- Process Tools
      +-- Streaming Search
      +-- Git Inspection
```

## V0.1 capabilities

- Allowed-root filesystem boundary
- Blocked command-prefix policy
- Persistent JSONL audit log
- Text file read/write and directory listing
- Long-running terminal sessions with buffered output and stdin
- System process listing and PID termination
- Cancellable, paged file/content search sessions
- Read-only Git `status`, `diff`, and `log`
- Device/runtime information
- MCP 2026 TypeScript SDK v2 over stdio

## MCP tools

| Group | Tools |
|---|---|
| Device | `device_info` |
| Files | `list_directory`, `read_text_file`, `write_text_file` |
| Terminal | `start_process`, `read_process_output`, `write_process_input`, `terminate_process`, `list_sessions` |
| Processes | `list_processes`, `kill_process` |
| Search | `start_search`, `get_search_results`, `stop_search` |
| Git | `git_status`, `git_diff`, `git_log` |

## Requirements

- Windows 10/11 or Windows Server for the primary V0.1 path
- Node.js 24+
- pnpm 11+
- Git for Git-related tools

## Quick start

```powershell
git clone https://github.com/HLRJ/DeskTether.git
cd DeskTether
pnpm install
pnpm test
pnpm build
```

Set the folders DeskTether is allowed to access before starting it:

```powershell
$env:DESKTETHER_ALLOWED_ROOTS="G:\Codes"
$env:DESKTETHER_BLOCKED_COMMANDS="format,diskpart,shutdown,shutdown.exe,restart-computer"
pnpm mcp
```

If `DESKTETHER_ALLOWED_ROOTS` is omitted, DeskTether allows only the current working directory tree.

## Configuration

| Variable | Meaning | Default |
|---|---|---|
| `DESKTETHER_ALLOWED_ROOTS` | Allowed filesystem roots; separate Windows roots with `;` | current working directory |
| `DESKTETHER_BLOCKED_COMMANDS` | Comma-separated command prefixes rejected before spawn | destructive system commands |
| `DESKTETHER_AUDIT_PATH` | JSONL audit file | `%USERPROFILE%\.desktether\audit.jsonl` |

Example for multiple roots on Windows:

```powershell
$env:DESKTETHER_ALLOWED_ROOTS="G:\Codes;G:\AINmg"
```

## Security model

DeskTether should be treated as a local execution bridge, not as a sandbox. V0.1 reduces risk with explicit allowed filesystem roots, blocked command prefixes, structured tool schemas, and audit logs, but a permitted shell can still execute powerful commands.

Do **not** expose the stdio process or a future HTTP transport directly to the public internet. Remote access will require an authenticated tunnel, device authorization, and stronger permission profiles before it is considered production-ready.

The audit log records the tool name, arguments, result class, duration, and timestamp. Secrets should not be passed directly as tool arguments unless you accept that they may appear in local audit records.

## Development

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Core capabilities live in `packages/core`. The MCP transport adapter lives in `apps/mcp-server`. This keeps local-computer logic independent from MCP transport details.

## Roadmap

- **V0.1** — filesystem, policy, audit, terminal/process sessions, streaming search, Git inspection, stdio MCP
- **V0.2** — Chrome DevTools / browser automation adapter
- **V0.3** — Windows screenshots, window discovery, keyboard/mouse and UI Automation
- **V0.4** — multi-device pairing, authenticated remote transport, permission profiles
- **V1.0** — hardened remote MCP bridge for multiple AI clients

## Project layout

```text
DeskTether/
├─ apps/
│  └─ mcp-server/
├─ packages/
│  └─ core/
├─ docs/
│  └─ superpowers/
├─ .env.example
├─ package.json
└─ pnpm-workspace.yaml
```

## License

Apache-2.0. See `LICENSE`.
