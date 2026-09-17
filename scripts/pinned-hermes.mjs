#!/usr/bin/env node
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".runtime", "hermes-venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "hermes.exe" : "hermes");
const platformDataRoot = process.platform === "win32"
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Manyasha")
  : path.join(os.homedir(), "Library", "Application Support", "Manyasha");
const dataRoot = path.resolve(process.env.MANYASHA_DATA_DIR || platformDataRoot);
const hermesHome = path.resolve(process.env.MANYASHA_HERMES_HOME || path.join(dataRoot, "hermes-profile"));
const isolatedHome = path.resolve(process.env.MANYASHA_ISOLATED_HOME || path.join(dataRoot, "hermes-home"));
const workspace = path.resolve(process.env.MANYASHA_WORKSPACE || path.join(root, "demo", "hermes-workspace"));
const originalHome = process.env.HOME || "";

function dotenvValue(source, key) {
  const line = source.split(/\r?\n/).find((item) => item.trim().startsWith(`${key}=`));
  if (!line) return "";
  const raw = line.slice(line.indexOf("=") + 1).trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  return raw;
}

async function providerEnvironment() {
  const sourcePath = process.env.MANYASHA_NAVY_ENV_SOURCE;
  if (!sourcePath) throw new Error("MANYASHA_NAVY_ENV_SOURCE_required");
  const source = await readFile(path.resolve(sourcePath), "utf8");
  let apiKey = dotenvValue(source, "OPENAI_API_KEY");
  let baseUrl = dotenvValue(source, "OPENAI_BASE_URL");
  if (source.trimStart().startsWith("{")) {
    const parsed = JSON.parse(source);
    apiKey = String(parsed?.provider?.navy?.options?.apiKey || "");
    baseUrl = String(parsed?.provider?.navy?.options?.baseURL || "");
  }
  if (!apiKey || !baseUrl) throw new Error("Navy_provider_values_missing");
  if (new URL(baseUrl).origin !== "https://api.navy") throw new Error("unexpected_provider_origin");
  // The named Hermes provider obtains the short-lived value through key_cmd.
  // Only the source path enters the process environment; the key is not copied
  // into this profile, config, command arguments, or distribution.
  return { MANYASHA_NAVY_ENV_SOURCE: sourcePath, MANYASHA_AGENT_ROOT: root };
}

async function run(args, extraEnv = {}, interactive = false) {
  await mkdir(isolatedHome, { recursive: true, mode: 0o700 });
  let executable = runtime;
  let executableArgs = args;
  if (process.platform === "darwin" && originalHome && process.env.MANYASHA_HERMES_USE_SANDBOX === "1") {
    const sandboxProfile = path.join(root, ".runtime", "manyasha-hermes.sb");
    const pythonRoot = path.resolve(await realpath(path.join(root, ".runtime", "hermes-venv", "bin", "python")), "../../..");
    const quoted = (value) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    await writeFile(sandboxProfile, [
      "(version 1)",
      "(deny default)",
      "(allow process*)",
      `(allow process-exec (subpath "/usr") (subpath "/bin") (subpath "${quoted(root)}") (subpath "${quoted(pythonRoot)}"))`,
      "(allow ipc*)",
      "(allow system-socket)",
      "(allow user-preference-read)",
      "(allow network*)",
      "(allow sysctl-read)",
      "(allow mach-lookup)",
      `(allow file-read* (subpath "/System") (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/Library") (subpath "/private/etc") (subpath "/private/var") (subpath "/dev") (subpath "${quoted(root)}") (subpath "${quoted(pythonRoot)}"))`,
      `(allow file-write* (subpath "${quoted(root)}"))`,
      "",
    ].join("\n"), { mode: 0o600 });
    executable = "/usr/bin/sandbox-exec";
    executableArgs = ["-f", sandboxProfile, runtime, ...args];
  }
  const child = spawn(executable, executableArgs, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
      HERMES_HOME: hermesHome,
      HOME: isolatedHome,
      HERMES_WRITE_SAFE_ROOT: workspace,
      HERMES_INTERACTIVE: interactive ? "1" : "0",
    },
  });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  if (code !== 0) throw new Error(`pinned_hermes_exit_${code}`);
}

const command = process.argv[2] || "run";
if (command === "run") {
  const provider = await providerEnvironment();
  await run([
    "chat", "--query-file", path.join(workspace, "task.txt"), "--oneshot", "--quiet",
    "--provider", "navy", "--model", "gpt-5.6-terra", "--toolsets", "file",
    "--in", workspace, "--ignore-rules", "--run-budget", "180", "--max-turns", "10",
  ], provider);
} else if (command === "chat") {
  const provider = await providerEnvironment();
  await run([
    "chat", "--provider", "navy", "--model", "gpt-5.6-terra", "--toolsets", "file",
    "--in", workspace, "--ignore-rules", "--run-budget", "180", "--max-turns", "20",
  ], provider, true);
} else if (command === "dashboard") {
  await run(["dashboard", "--host", "127.0.0.1", "--port", "8788", "--isolated", "--no-open", "--skip-build"]);
} else if (command === "sessions") {
  await run(["sessions", "list"]);
} else {
  throw new Error("command_must_be_chat_run_dashboard_or_sessions");
}
