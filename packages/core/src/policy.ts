import path from "node:path";

export interface PolicyOptions {
  allowedRoots: string[];
  blockedCommands: string[];
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export class Policy {
  private readonly allowedRoots: string[];
  private readonly blockedCommands: string[];

  constructor(options: PolicyOptions) {
    this.allowedRoots = options.allowedRoots.map((root) => path.resolve(root));
    this.blockedCommands = options.blockedCommands.map((command) => command.trim().toLowerCase()).filter(Boolean);
  }

  assertPath(candidate: string): string {
    const resolved = path.resolve(candidate);
    const allowed = this.allowedRoots.some((root) => {
      const relative = path.relative(root, resolved);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
    if (!allowed) throw new PolicyError(`Path is outside allowed roots: ${resolved}`);
    return resolved;
  }

  assertCommand(command: string): string {
    const trimmed = command.trim();
    const normalized = trimmed.toLowerCase();
    const blocked = this.blockedCommands.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
    if (blocked) throw new PolicyError(`Command is blocked by policy: ${trimmed}`);
    return trimmed;
  }
}