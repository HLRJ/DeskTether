import { describe, expect, it } from "vitest";
import { getDeviceInfo } from "../src/device.js";

describe("getDeviceInfo", () => {
  it("returns stable host metadata", () => {
    const info = getDeviceInfo();
    expect(info.hostname.length).toBeGreaterThan(0);
    expect(info.platform.length).toBeGreaterThan(0);
    expect(info.arch.length).toBeGreaterThan(0);
    expect(info.nodeVersion).toMatch(/^v?\d+/);
  });
});