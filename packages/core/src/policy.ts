import fs from "node:fs";
import path from "node:path";

export type CommandDecision = "ALLOW" | "CONFIRM" | "DENY";

export interface CommandEvaluation {
  command: string;
  decision: CommandDecision;
  matchedRule?: string;
}

export interface PolicyOptions {
  allowedRoots: string[];
  blockedCommands: string[];
  denyCommands?: string[];
  confirmCommands?: string[];
  allowCommands?: string[];
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

function normalizeRules(rules: string[] = []): string[] {
  return rules.map((rule) => rule.trim().toLowerCase()).filter(Boolean);
}

function matchesRule(command: string, rule: string): boolean {
  return command === rule || command.startsWith(rule + " ");
}

function matchesAllowRule(command: string, rule: string): boolean {
  if (!matchesRule(command, rule)) return false;
  const suffix = command.slice(rule.length);
  if (!suffix) return true;
  return !/[;&|><`\r\n]/.test(suffix) && !suffix.includes("$(");
}

function canonicalizePath(candidate: string): string {
  const resolved = path.resolve(candidate);
  let current = resolved;
  const missingSegments: string[] = [];

  while (true) {
    try {
      const real = fs.realpathSync.native(current);
      return path.resolve(real, ...missingSegments);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;

      const parent = path.dirname(current);
      if (parent === current) return resolved;
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ""
    || (!path.isAbsolute(relative)
      && relative !== ".."
      && !relative.startsWith(`..${path.sep}`));
}

export class Policy {
  private readonly allowedRoots: string[];
  private readonly denyCommands: string[];
  private readonly confirmCommands: string[];
  private readonly allowCommands: string[];

  constructor(options: PolicyOptions) {
    this.allowedRoots = options.allowedRoots.map((root) => canonicalizePath(root));
    this.denyCommands = normalizeRules([
      ...options.blockedCommands,
      ...(options.denyCommands ?? []),
    ]);
    this.confirmCommands = normalizeRules(options.confirmCommands);
    this.allowCommands = normalizeRules(options.allowCommands);
  }

  assertPath(candidate: string): string {
    const resolved = path.resolve(candidate);
    let canonical: string;
    try {
      canonical = canonicalizePath(resolved);
    } catch {
      throw new PolicyError(`Path could not be safely resolved: ${resolved}`);
    }

    const allowed = this.allowedRoots.some((root) => isInside(root, canonical));
    if (!allowed) throw new PolicyError(`Path is outside allowed roots: ${resolved}`);
    return resolved;
  }

  evaluateCommand(command: string): CommandEvaluation {
    const trimmed = command.trim();
    const normalized = trimmed.toLowerCase();

    const denied = this.denyCommands.find((rule) => matchesRule(normalized, rule));
    if (denied) return { command: trimmed, decision: "DENY", matchedRule: denied };

    const allowed = this.allowCommands.find((rule) => matchesAllowRule(normalized, rule));
    if (allowed) return { command: trimmed, decision: "ALLOW", matchedRule: allowed };

    const confirmed = this.confirmCommands.find((rule) => matchesRule(normalized, rule));
    if (confirmed) return { command: trimmed, decision: "CONFIRM", matchedRule: confirmed };

    return { command: trimmed, decision: "ALLOW" };
  }

  assertCommand(command: string): string {
    const evaluation = this.evaluateCommand(command);
    if (evaluation.decision === "DENY") {
      throw new PolicyError(`Command is blocked by policy: ${evaluation.command}`);
    }
    return evaluation.command;
  }
}
