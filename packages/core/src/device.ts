import os from "node:os";

export interface DeviceInfo {
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  release: string;
  nodeVersion: string;
}

export function getDeviceInfo(): DeviceInfo {
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    nodeVersion: process.version,
  };
}