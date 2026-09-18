# DeskTether ChatGPT App Integration

This document describes the V0.2.4 ChatGPT Web integration profile.

> Product availability changes over time. The plan notes below reflect OpenAI documentation checked in September 2026. Verify the current OpenAI documentation before deployment.

## Goal

V0.2.4 prepares DeskTether to behave like a native ChatGPT MCP app in web conversations:

```text
ChatGPT Web
    |
    +-- DeskTether MCP App
    |      |
    |      +-- Files
    |      +-- PowerShell / Process
    |      +-- Search
    |      +-- Git
    |      +-- Audit
    |
    +-- GitHub / other apps
```

ChatGPT can select more than one app for a workflow. A typical DeskTether workflow can therefore combine local-machine tools with a GitHub app in the same conversation.

## V0.2.4 app profile

- App name: `DeskTether`
- Version: `0.2.4`
- Surface target: ChatGPT web
- MCP transport: local stdio bridged through OpenAI Secure MCP Tunnel
- Widget mode: none
- Tool UI: ChatGPT native tool-call presentation
- End-user OAuth: none in V0.2.4
- Project homepage: https://github.com/HLRJ/DeskTether
- Privacy policy: https://github.com/HLRJ/DeskTether/blob/main/PRIVACY.md
- Support: https://github.com/HLRJ/DeskTether/issues

V0.2.4 intentionally does not ship a custom Apps SDK widget. The goal is the native ChatGPT collaboration pattern where ChatGPT shows tool invocations and results inline while DeskTether performs local actions.

## Tool metadata

Every DeskTether tool now publishes:

- a human-readable title;
- a clear description;
- MCP safety annotations:
  - `readOnlyHint`
  - `destructiveHint`
  - `idempotentHint`
  - `openWorldHint`
- ChatGPT invocation text through `_meta`;
- `openai/widgetAccessible=false`;
- no-auth tool metadata because user authentication is not implemented at the individual MCP tool level in V0.2.4.

Risk annotations are conservative. Shell/process tools are treated as side-effecting, and tools that can overwrite data or terminate execution are marked destructive.

## Server instructions

The MCP server also publishes instructions telling the client to:

1. prefer read-only inspection before mutation;
2. treat process and PowerShell tools as potentially side-effecting;
3. respect DeskTether confirmation requirements;
4. respect allowed-root boundaries;
5. avoid placing long-lived secrets directly in command text.

These instructions complement, but do not replace, local enforcement in the Permission Engine.

## Local readiness check

Run:

```powershell
pnpm chatgpt:doctor
```

The command builds the project and returns a JSON readiness report containing:

- app identity;
- tool count;
- read-only tool count;
- destructive tool count;
- open-world tool count;
- widget mode;
- missing metadata or public-document errors.

A healthy result reports:

```json
{
  "status": "ready"
}
```

The doctor command does not connect to ChatGPT and does not read or print tunnel credentials.

## Secure MCP Tunnel

ChatGPT does not directly connect to a developer machine's local stdio MCP server. DeskTether uses the existing Secure MCP Tunnel flow:

```text
ChatGPT Web
    |
    v
OpenAI Secure MCP Tunnel
    |
    v
tunnel-client
    |
    v
DeskTether stdio MCP
    |
    v
Windows machine
```

Run:

```powershell
pnpm tunnel:doctor
pnpm tunnel:start
```

Then, from another terminal:

```powershell
pnpm tunnel:status
```

See [secure-mcp-tunnel.md](secure-mcp-tunnel.md) for the tunnel-specific setup.

## ChatGPT Developer Mode setup

According to OpenAI's current documentation, custom MCP apps are configured from ChatGPT web by enabling Developer Mode, creating a custom app, providing the MCP endpoint/metadata, and scanning tools.

Typical flow for an eligible workspace:

1. Start DeskTether through Secure MCP Tunnel.
2. Open ChatGPT web.
3. Enable Developer Mode for the eligible account/workspace.
4. Go to Apps and create a custom app.
5. Provide the Secure MCP Tunnel endpoint for DeskTether.
6. Choose the applicable authentication option.
7. Run Scan Tools.
8. Verify that the DeskTether tools are discovered with their titles and safety annotations.
9. Create the draft app.
10. Enable the app for testing.
11. In a chat, select or @mention DeskTether when a new tool call is required.

Exact UI labels may change as ChatGPT evolves.

## Current plan limitation

OpenAI documentation checked in September 2026 states that full custom MCP support, including write/modify actions, is available in beta for ChatGPT Business and Enterprise/Edu on web.

OpenAI also documents limited Developer Mode MCP support for Pro read/fetch use cases. Do not assume that a Plus account can test the complete DeskTether write/execute workflow merely because the Plugin Directory is visible.

For authoritative current requirements, review:

- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk
- https://help.openai.com/en/articles/11487775

## Example collaborative workflow

A target V0.2.4 conversation looks like:

```text
User:
Continue V0.3 development.

ChatGPT:
  DeskTether -> git_status
  DeskTether -> search_code
  DeskTether -> read_multiple_files
  DeskTether -> edit_block
  DeskTether -> powershell_start
  DeskTether -> powershell_read

  GitHub -> create_pull_request
```

DeskTether supplies local-machine execution. GitHub or another app can supply remote-service operations. ChatGPT performs the orchestration.

## What V0.2.4 does not add

V0.2.4 does not add:

- a custom iframe/widget UI;
- Browser Automation;
- Windows GUI Automation;
- multi-device pairing;
- per-user OAuth;
- public Plugin Directory publication.

Those remain separate product milestones.

## Submission preparation

Before a future public app/plugin submission, review the current OpenAI app submission requirements and make sure DeskTether has:

- a stable public privacy policy;
- support/contact information;
- clear tool descriptions;
- conservative tool annotations;
- a tested onboarding flow;
- a security review of write/execute tools;
- screenshots or demo material if required;
- any terms or additional policy documents required by the directory at that time.

V0.2.4 provides the technical and documentation foundation for that work.
