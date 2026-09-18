#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DESKTETHER_APP_PROFILE, validateChatGptReadiness } from "./app-profile.js";
import { getToolDefinitions } from "./tool-catalog.js";

const tools = getToolDefinitions();
const errors = validateChatGptReadiness(tools);
const root = process.cwd();

for (const requiredPath of ["README.md", "README.zh-CN.md", "PRIVACY.md", "docs/chatgpt-app.md", "docs/secure-mcp-tunnel.md"]) {
  if (!fs.existsSync(path.join(root, requiredPath))) {
    errors.push(`Missing required public document: ${requiredPath}`);
  }
}

for (const packagePath of ["package.json", "apps/mcp-server/package.json", "packages/core/package.json"]) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, packagePath), "utf8")) as { version?: string };
    if (packageJson.version !== DESKTETHER_APP_PROFILE.version) {
      errors.push(
        `Version mismatch: ${packagePath} is ${packageJson.version ?? "missing"}, expected ${DESKTETHER_APP_PROFILE.version}`,
      );
    }
  } catch {
    errors.push(`Could not read package version: ${packagePath}`);
  }
}

const report = {
  status: errors.length === 0 ? "ready" : "not_ready",
  app: DESKTETHER_APP_PROFILE,
  tools: {
    total: tools.length,
    readOnly: tools.filter((tool) => tool.annotations.readOnlyHint).length,
    destructive: tools.filter((tool) => tool.annotations.destructiveHint).length,
    openWorld: tools.filter((tool) => tool.annotations.openWorldHint).length,
    widgetEnabled: tools.filter((tool) => tool._meta["openai/widgetAccessible"] === true).length,
  },
  errors,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (errors.length > 0) process.exitCode = 1;
