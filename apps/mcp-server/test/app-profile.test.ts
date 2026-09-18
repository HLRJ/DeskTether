import { describe, expect, it } from "vitest";
import { DESKTETHER_APP_PROFILE, validateChatGptReadiness } from "../src/app-profile.js";
import { getToolDefinitions } from "../src/tool-catalog.js";

describe("DeskTether ChatGPT app profile", () => {
  it("publishes the V0.2.4 app identity and public project links", () => {
    expect(DESKTETHER_APP_PROFILE.name).toBe("DeskTether");
    expect(DESKTETHER_APP_PROFILE.version).toBe("0.2.4");
    expect(DESKTETHER_APP_PROFILE.description).toContain("Windows");
    expect(DESKTETHER_APP_PROFILE.homepageUrl).toBe("https://github.com/HLRJ/DeskTether");
    expect(DESKTETHER_APP_PROFILE.privacyPolicyUrl).toMatch(/PRIVACY\.md$/);
    expect(DESKTETHER_APP_PROFILE.supportUrl).toMatch(/\/issues$/);
  });

  it("passes the local ChatGPT readiness validator", () => {
    expect(validateChatGptReadiness(getToolDefinitions())).toEqual([]);
  });
});
