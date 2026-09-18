import type { ToolDefinition } from "./tool-catalog.js";

export const DESKTETHER_APP_PROFILE = {
  name: "DeskTether",
  title: "DeskTether",
  version: "0.2.4",
  description: "Securely connect ChatGPT and other MCP clients to a Windows machine with policy, confirmation, session, and audit controls.",
  homepageUrl: "https://github.com/HLRJ/DeskTether",
  privacyPolicyUrl: "https://github.com/HLRJ/DeskTether/blob/main/PRIVACY.md",
  supportUrl: "https://github.com/HLRJ/DeskTether/issues",
  transport: "OpenAI Secure MCP Tunnel + stdio",
  chatgptSurface: "web",
  widgetMode: "none",
} as const;

export function validateChatGptReadiness(tools: ToolDefinition[]): string[] {
  const errors: string[] = [];
  const names = new Set<string>();

  for (const tool of tools) {
    if (names.has(tool.name)) errors.push(`Duplicate tool name: ${tool.name}`);
    names.add(tool.name);

    if (!tool.title.trim()) errors.push(`Missing title: ${tool.name}`);
    if (!tool.description.trim()) errors.push(`Missing description: ${tool.name}`);

    const annotations = tool.annotations;
    for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
      if (typeof annotations[key] !== "boolean") {
        errors.push(`Missing annotation ${key}: ${tool.name}`);
      }
    }

    if (annotations.readOnlyHint && annotations.destructiveHint) {
      errors.push(`Tool cannot be both read-only and destructive: ${tool.name}`);
    }

    const invoking = tool._meta["openai/toolInvocation/invoking"];
    const invoked = tool._meta["openai/toolInvocation/invoked"];
    if (typeof invoking !== "string" || !invoking.trim()) {
      errors.push(`Missing invoking text: ${tool.name}`);
    }
    if (typeof invoked !== "string" || !invoked.trim()) {
      errors.push(`Missing invoked text: ${tool.name}`);
    }
    if (tool._meta["openai/widgetAccessible"] !== false) {
      errors.push(`Widget access must be disabled in V0.2.4: ${tool.name}`);
    }

    const schemes = tool._meta.securitySchemes;
    if (!Array.isArray(schemes) || schemes.length !== 1 || schemes[0]?.type !== "noauth") {
      errors.push(`Expected noauth tool security metadata: ${tool.name}`);
    }
  }

  return errors;
}
