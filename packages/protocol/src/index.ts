export const DESKTETHER_PROTOCOL_VERSION = "0.3" as const;

export interface DeviceInfoPayload {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  nodeVersion: string;
}

export interface DeviceHelloMessage {
  type: "device.hello";
  protocolVersion: typeof DESKTETHER_PROTOCOL_VERSION;
  deviceId: string;
  device: DeviceInfoPayload;
}

export interface DeviceHeartbeatMessage {
  type: "device.heartbeat";
  sentAt: string;
}
export interface ToolRequestMessage {
  type: "tool.request";
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResponseMessage {
  type: "tool.response";
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface RelayReadyMessage {
  type: "relay.ready";
  deviceId: string;
  connectedAt: string;
}

export type AgentToRelayMessage =
  | DeviceHelloMessage
  | DeviceHeartbeatMessage
  | ToolResponseMessage;

export type RelayToAgentMessage =
  | ToolRequestMessage
  | RelayReadyMessage;
