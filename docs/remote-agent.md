# DeskTether Remote Agent (V0.3)

The Remote Agent extends the public DeskTether runtime with an outbound WebSocket connection to DeskTether Cloud.

## Current V0.3.0 scope

Remote execution is intentionally limited to:

- `device_info`

High-risk tools such as terminal execution, process killing and filesystem writes are not enabled remotely in this milestone.

## Local development

Start the private DeskTether Cloud relay first:

```powershell
cd G:\Codes\DeskTether-Cloud
pnpm relay
```
Then start the public agent:

```powershell
cd G:\Codes\DeskTether\.worktrees\v0.3-remote-agent
pnpm agent
```

Default development configuration:

```text
Relay URL:  ws://127.0.0.1:3100/device
Token:      local-dev-token
Protocol:   0.3
```

The development token is only for localhost testing. V0.3.1 replaces it with one-time pairing and a revocable device credential.

The agent sends heartbeats and reconnects with bounded exponential backoff when the relay is unavailable.
