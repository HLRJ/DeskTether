import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..", "..");
const buildCommand = process.platform === "win32"
  ? {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm -r build"],
    }
  : {
      command: "pnpm",
      args: ["-r", "build"],
    };

const build = spawnSync(buildCommand.command, buildCommand.args, {
  cwd: root,
  stdio: "ignore",
  shell: false,
});

if (build.status !== 0) {
  process.stderr.write("DeskTether build failed before ChatGPT readiness validation.\n");
  process.exit(build.status ?? 1);
}

const doctor = spawnSync(
  process.execPath,
  [path.join(root, "apps", "mcp-server", "dist", "chatgpt-doctor.js")],
  {
    cwd: root,
    stdio: "inherit",
    shell: false,
  },
);

process.exit(doctor.status ?? 1);
