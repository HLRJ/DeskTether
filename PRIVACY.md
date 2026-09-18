# DeskTether Privacy

DeskTether is a local-first MCP bridge. This privacy note describes the behavior of the open-source DeskTether software itself.

## Data processed locally

Depending on the tools you enable and invoke, DeskTether may process local information such as:

- file and directory paths;
- text file contents;
- process and PowerShell commands;
- stdout and stderr;
- process identifiers and runtime metadata;
- Git status, diff, and log output;
- local search results;
- DeskTether audit records.

DeskTether processes this information on the machine where it is running.

## Data sent to an MCP client

When an MCP client such as ChatGPT invokes a DeskTether tool, the requested tool result is returned to that client. If you connect DeskTether through OpenAI Secure MCP Tunnel, MCP traffic is transported through that configured OpenAI connection.

DeskTether does not add independent analytics or telemetry to send tool data to the DeskTether project maintainer.

## Local audit log

DeskTether records local JSONL audit entries for tool activity. By default the audit file is stored under the current Windows user's profile unless you configure another path.

Audit records may contain tool arguments, including command text. Do not place reusable passwords, API keys, access tokens, or other long-lived secrets directly in commands.

The one-time DeskTether `confirmationToken` is removed before audit persistence.

V0.2.4 inherits the V0.2.3 audit rotation behavior: 10 MiB per file with three backups by default.

## Tunnel credentials

`CONTROL_PLANE_TUNNEL_ID` and `CONTROL_PLANE_API_KEY` are read from the runtime environment by the tunnel setup. DeskTether's repository does not require you to store real tunnel credentials in source files, and real credentials should never be committed to Git.

## Filesystem boundaries

DeskTether restricts file-oriented capabilities to configured allowed roots and checks canonical paths to reduce junction and symlink escape risks. This is a risk-reduction boundary, not a full operating-system sandbox.

## Third-party services

If you connect DeskTether to ChatGPT, OpenAI Secure MCP Tunnel, GitHub, or another MCP client or service, data handled by those services is also subject to their own terms and privacy policies.

## Your control

You control:

- which local machine runs DeskTether;
- which filesystem roots are allowed;
- which command rules are ALLOW, CONFIRM, or DENY;
- whether Secure MCP Tunnel is started;
- when DeskTether is stopped;
- the local audit-log location.

## Contact and issues

For security or privacy issues related to the open-source project, use the project issue tracker:

https://github.com/HLRJ/DeskTether/issues
