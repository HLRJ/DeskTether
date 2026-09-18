# DeskTether Secure MCP Tunnel

This guide connects the local DeskTether V0.2.4 stdio MCP server to supported ChatGPT custom MCP apps through OpenAI Secure MCP Tunnel.

## Architecture

```text
ChatGPT Web
    |
    v
OpenAI-hosted Secure MCP Tunnel endpoint
    |
    | outbound HTTPS polling only
    v
OpenAI tunnel-client on Windows
    |
    | stdio MCP
    v
DeskTether MCP Server
    |
    +-- Policy / allowed roots
    +-- JSONL audit log
    +-- PowerShell session manager
```

DeskTether does not open a public HTTP listener. The customer-run `tunnel-client` polls the OpenAI tunnel control plane and forwards MCP requests to DeskTether over stdio.

## Product prerequisite

As of 2026-09-18, full custom MCP support with write/modify actions is available to ChatGPT Business, Enterprise, and Edu workspaces. OpenAI also documents Developer Mode MCP support for Pro read/fetch use cases, but not full write/modify MCP. A personal Plus workspace cannot currently be assumed to attach a private full-MCP PowerShell app even when the local tunnel is technically ready. Verify the current requirements in OpenAI's Developer Mode documentation before deployment: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## Local prerequisites

- Windows x64
- Node.js 24+
- pnpm 11+
- Git
- outbound HTTPS access to GitHub release assets and OpenAI APIs

## 1. Build DeskTether

```powershell
pnpm install
pnpm test
pnpm test:tunnel
pnpm build
```

## 2. Install the official tunnel client

DeskTether pins OpenAI `tunnel-client` v0.0.14 for this release.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\tunnel\Install-TunnelClient.ps1
```

The installer downloads the matching Windows amd64 archive and `SHA256SUMS.txt`, verifies SHA256, then extracts under `.tools\tunnel-client\v0.0.14\`. `.tools/` is ignored by Git.

To use an independently installed binary instead:

```powershell
$env:TUNNEL_CLIENT_BIN="<path-to-tunnel-client.exe>"
```

## 3. Create OpenAI tunnel credentials

Create or inspect the tunnel at:

`https://platform.openai.com/settings/organization/tunnels`

Create a separate runtime API key with Tunnels Read + Use at:

`https://platform.openai.com/settings/organization/api-keys`

Do not use an admin key as the long-lived runtime key.

Set the values only in your local shell or another secret manager:

```powershell
$env:CONTROL_PLANE_TUNNEL_ID="tunnel_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$env:CONTROL_PLANE_API_KEY="<runtime-api-key>"
$env:DESKTETHER_ALLOWED_ROOTS=(Get-Location).Path
```

`CONTROL_PLANE_TUNNEL_ID` identifies the tunnel. `CONTROL_PLANE_API_KEY` is the runtime credential used by `doctor` and `run`; DeskTether never writes its value into the repository or generated MCP command.

## 4. Run doctor first

```powershell
pnpm tunnel:doctor
```

The script:

1. verifies the required environment variables are present;
2. installs the pinned tunnel client if needed;
3. builds DeskTether;
4. recreates a `desktether-local` tunnel-client profile using the official `sample_mcp_stdio_local` template;
5. points that profile at `node <repo>\apps\mcp-server\dist\index.js`;
6. runs `tunnel-client doctor --profile desktether-local --explain`.

The generated profile references the API key as `env:CONTROL_PLANE_API_KEY`; it does not contain the literal key.

## 5. Start and inspect the tunnel runtime

```powershell
pnpm tunnel:start
```

Keep that foreground process running while ChatGPT uses DeskTether. For stdio MCP, use only one active tunnel-client process for a given tunnel ID.

In another terminal, inspect local runtime health:

```powershell
pnpm tunnel:status
```

DeskTether runs the tunnel-client health listener on an ephemeral loopback port and stores only the PID plus resolved health URL under ignored `.tools/tunnel-state/` files. The status command is read-only and does not print the runtime API key.
## 6. Attach in ChatGPT Web

In an eligible ChatGPT workspace, enable developer mode and create a custom MCP app from the Apps settings. Choose the Secure MCP Tunnel you created, scan the tool catalog, and verify the five PowerShell actions appear:

- `powershell_start`
- `powershell_read`
- `powershell_input`
- `powershell_list`
- `powershell_terminate`

Write/modify actions may require confirmation in ChatGPT depending on workspace permissions and action context.

A useful first test prompt is:

```text
Use DeskTether to start PowerShell in the current DeskTether repository directory and run:
Get-Location
Then read the session output.
```

## Security notes

- Keep `DESKTETHER_ALLOWED_ROOTS` narrow. Prefer project directories instead of an entire drive.
- Use `DESKTETHER_DENY_COMMANDS`, `DESKTETHER_CONFIRM_COMMANDS`, and `DESKTETHER_ALLOW_COMMANDS` to tune command prefixes. Legacy `DESKTETHER_BLOCKED_COMMANDS` remains supported as DENY.
- Policy precedence is `DENY → explicit ALLOW → CONFIRM → default ALLOW`; this is risk reduction, not a PowerShell sandbox.
- CONFIRM returns a one-time token bound to the exact command and working directory. Tokens expire after five minutes and are consumed once.
- Every MCP action is written to the local JSONL audit log. Confirmation tokens are stripped before persistence.
- Do not pass reusable secrets as PowerShell command text because command text itself may be present in the local audit log.
- Never commit `CONTROL_PLANE_API_KEY`, `OPENAI_ADMIN_KEY`, or an exported profile containing literal credentials.
- Do not expose DeskTether itself through port forwarding or a public reverse proxy when Secure MCP Tunnel is available.

## Troubleshooting

If the connector script reports missing variables, set `CONTROL_PLANE_TUNNEL_ID` and `CONTROL_PLANE_API_KEY` in the same shell before running it.

If `pnpm tunnel:doctor` fails, resolve its reported tunnel permissions, organization/workspace association, proxy, or network issue before starting the tunnel.

If `pnpm tunnel:status` reports `stopped` or `unhealthy`, verify the foreground `pnpm tunnel:start` process is still running and inspect the tunnel-client output in that terminal.

Verify the installed client with:

```powershell
.\.tools\tunnel-client\v0.0.14\tunnel-client.exe --version
```

Expected release prefix: `0.0.14`.

If ChatGPT cannot see the app while the tunnel runtime is healthy, verify that the tunnel is associated with the same ChatGPT workspace and that the workspace is eligible for the required MCP permissions.