import os from "node:os";
import { getDeviceInfo } from "@desktether/core";
import {
  DESKTETHER_PROTOCOL_VERSION,
  type AgentToRelayMessage,
  type RelayToAgentMessage,
  type ToolResponseMessage,
} from "@desktether/protocol";
import WebSocket from "ws";

const relayUrl = process.env.DESKTETHER_RELAY_URL ?? "ws://127.0.0.1:3100/device";
const token = process.env.DESKTETHER_DEVICE_TOKEN ?? "local-dev-token";
const configuredDeviceId = process.env.DESKTETHER_DEVICE_ID;

const defaultDeviceId = `${os.hostname()}-${process.arch}`
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, "-");

const deviceId = configuredDeviceId ?? defaultDeviceId;
let socket: WebSocket | undefined;
let heartbeat: NodeJS.Timeout | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let reconnectAttempt = 0;
let shuttingDown = false;

function send(message: AgentToRelayMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}
function respond(requestId: string, response: Omit<ToolResponseMessage, "type" | "requestId">): void {
  send({
    type: "tool.response",
    requestId,
    ...response,
  });
}

async function handleMessage(message: RelayToAgentMessage): Promise<void> {
  if (message.type === "relay.ready") {
    reconnectAttempt = 0;
    console.log(`[device-agent] connected as ${message.deviceId}`);
    return;
  }

  if (message.type !== "tool.request") return;

  if (message.tool !== "device_info") {
    respond(message.requestId, {
      ok: false,
      error: `Tool not enabled for remote V0.3.0: ${message.tool}`,
    });
    return;
  }

  try {
    respond(message.requestId, { ok: true, result: getDeviceInfo() });
  } catch (error) {
    respond(message.requestId, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
function scheduleReconnect(): void {
  if (shuttingDown || reconnectTimer) return;

  reconnectAttempt += 1;
  const delayMs = Math.min(5_000, 500 * 2 ** Math.min(reconnectAttempt - 1, 4));
  console.log(`[device-agent] reconnecting in ${delayMs}ms`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connect();
  }, delayMs);
}

function connect(): void {
  if (shuttingDown) return;

  console.log(`[device-agent] connecting to ${relayUrl}`);
  socket = new WebSocket(relayUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  socket.on("open", () => {
    const hello: AgentToRelayMessage = {
      type: "device.hello",
      protocolVersion: DESKTETHER_PROTOCOL_VERSION,
      deviceId,
      device: getDeviceInfo(),
    };
    send(hello);
    heartbeat = setInterval(() => {
      send({ type: "device.heartbeat", sentAt: new Date().toISOString() });
    }, 5_000);
  });

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as RelayToAgentMessage;
      void handleMessage(message);
    } catch (error) {
      console.error("[device-agent] invalid relay message", error);
    }
  });

  socket.on("close", (code, reason) => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    console.log(`[device-agent] disconnected code=${code} reason=${reason.toString()}`);
    scheduleReconnect();
  });

  socket.on("error", (error) => {
    console.error("[device-agent] websocket error", error.message);
  });
}
function shutdown(signal: string): void {
  shuttingDown = true;
  if (heartbeat) clearInterval(heartbeat);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log(`[device-agent] shutting down on ${signal}`);

  if (socket && socket.readyState < WebSocket.CLOSING) {
    socket.close(1000, "agent shutdown");
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log(`[device-agent] protocol=${DESKTETHER_PROTOCOL_VERSION} deviceId=${deviceId}`);
connect();
