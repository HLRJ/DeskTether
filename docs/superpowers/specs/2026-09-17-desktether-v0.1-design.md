# DeskTether V0.1 Design

## Purpose
DeskTether is a secure MCP bridge between AI agents and a user's local computer. V0.1 focuses on developer-grade local control: device metadata, filesystem access, terminal sessions, streaming search, process inspection, Git helpers, permissions, and audit logs.

## Architecture
The repository is a pnpm TypeScript monorepo. pps/mcp-server exposes MCP tools over stdio first; packages/core contains capability modules that can later be reused by a remote desktop agent. The public tool surface never performs raw filesystem or shell access directly; every operation passes through policy checks and audit recording.

## V0.1 Scope
- Device information and health metadata.
- Filesystem list/read/write with allowed-root enforcement.
- Terminal session lifecycle: start, read output, send input, terminate, list sessions.
- Streaming file/content search with cancellable sessions.
- Process listing and safe termination.
- Git status/diff/log helpers scoped to allowed roots.
- Permission engine with allowed roots and blocked command prefixes.
- JSONL audit log for all local actions.
- MCP server exposing the supported tools through stdio.

## Explicitly Out of Scope
- Mouse, keyboard, desktop screenshots, Windows UI Automation.
- Chrome DevTools and Playwright browser control.
- Public tunnel, OAuth, multi-device pairing, cloud relay.
- Arbitrary privileged Windows administration.

## Security Model
Default deny outside configured roots. Resolve and normalize paths before authorization. Shell commands are rejected when their executable or prefix matches a blocked-command rule. Destructive or privileged behavior is not exposed as a first-class tool in V0.1. Every tool invocation writes an audit record containing timestamp, tool, sanitized arguments, result status, and duration.

## Session Model
Long-running terminal and search operations return opaque session IDs. Later calls page output/results and can terminate the session. Session state is process-local in V0.1 and intentionally not persisted across agent restarts.

## Repository Shape
- pps/mcp-server: MCP registration and stdio transport.
- packages/core: policy, audit, filesystem, process sessions, search sessions, Git helpers, device info.
- 	ests: behavior tests organized by capability.
- docs: design, implementation plans, security notes, roadmap.

## Testing and Acceptance
Use Vitest. Every production capability starts with a failing behavior test. V0.1 is accepted when pnpm test, pnpm typecheck, and pnpm build pass on Windows; the MCP server starts over stdio; unauthorized paths and blocked commands are rejected; terminal/search sessions can be created and terminated; and audit records are emitted for successful and rejected operations.

## Roadmap
V0.2 adds Chrome DevTools/Playwright browser control. V0.3 adds Windows screenshots, window discovery, mouse/keyboard, and UI Automation. V0.4 adds secure tunnel, pairing, OAuth, and multi-device support. V1.0 stabilizes the cross-client contract for ChatGPT, Claude, Codex, Cursor, and other MCP clients.
