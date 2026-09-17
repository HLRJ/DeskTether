import os from "node:os";
import path from "node:path";
import {
  AuditLog,
  FileSystemService,
  Policy,
  ProcessSessionManager,
  SearchSessionManager,
} from "@desktether/core";

export interface RuntimeOptions {
  allowedRoots: string[];
  blockedCommands: string[];
  auditPath: string;
}

export interface DeskTetherRuntime {
  policy: Policy;
  audit: AuditLog;
  filesystem: FileSystemService;
  processes: ProcessSessionManager;
  searches: SearchSessionManager;
}

export function createRuntime(options: RuntimeOptions): DeskTetherRuntime {
  const policy = new Policy({
    allowedRoots: options.allowedRoots,
    blockedCommands: options.blockedCommands,
  });
  const audit = new AuditLog(options.auditPath);
  return {
    policy,
    audit,
    filesystem: new FileSystemService(policy, audit),
    processes: new ProcessSessionManager(policy, audit),
    searches: new SearchSessionManager(policy, audit),
  };
}

export function createRuntimeFromEnv(): DeskTetherRuntime {
  const allowedRoots = (process.env.DESKTETHER_ALLOWED_ROOTS ?? process.cwd())
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  const blockedCommands = (process.env.DESKTETHER_BLOCKED_COMMANDS ?? "format,diskpart,shutdown,shutdown.exe,restart-computer")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const auditPath = process.env.DESKTETHER_AUDIT_PATH
    ?? path.join(os.homedir(), ".desktether", "audit.jsonl");
  return createRuntime({ allowedRoots, blockedCommands, auditPath });
}
