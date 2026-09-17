import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu?: number;
  memoryBytes?: number;
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  if (process.platform === "win32") {
    const script = "Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Json -Compress";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(stdout.trim() || "[]");
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => ({
      pid: Number(row.Id),
      name: String(row.ProcessName ?? ""),
      cpu: typeof row.CPU === "number" ? row.CPU : undefined,
      memoryBytes: typeof row.WorkingSet64 === "number" ? row.WorkingSet64 : undefined,
    }));
  }

  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,comm="]);
  return stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    return { pid: Number(match?.[1] ?? 0), name: match?.[2] ?? "unknown" };
  }).filter((item) => item.pid > 0);
}

export async function killProcess(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid pid: ${pid}`);
  process.kill(pid);
}