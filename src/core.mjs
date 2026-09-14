import crypto from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROFILE_FILE = "profile.json";

function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function safeWorkspacePath(workspaceDir, targetValue, { allowMissingLeaf = false } = {}) {
  const workspace = await realpath(path.resolve(workspaceDir));
  const target = path.resolve(workspace, targetValue);
  if (!inside(workspace, target)) throw new Error("path_outside_workspace");
  const relative = path.relative(workspace, target);
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = workspace;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error("symlink_not_allowed");
      const resolved = await realpath(cursor);
      if (resolved !== workspace && !inside(workspace, resolved)) throw new Error("path_outside_workspace");
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissingLeaf && index === parts.length - 1) return { workspace, target };
      throw error;
    }
  }
  return { workspace, target };
}

async function readWorkspaceFile(workspaceDir, targetValue) {
  const { target } = await safeWorkspacePath(workspaceDir, targetValue);
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try { return await handle.readFile("utf8"); } finally { await handle.close(); }
}

async function writeWorkspaceFile(workspaceDir, targetValue, contents) {
  const { target } = await safeWorkspacePath(workspaceDir, targetValue, { allowMissingLeaf: true });
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW || 0), 0o600);
  try { await handle.writeFile(contents, "utf8"); } finally { await handle.close(); }
  return target;
}

export async function ensureProfile(profileDir, provider = "managed") {
  const root = path.resolve(profileDir);
  await mkdir(path.join(root, "sessions"), { recursive: true });
  const file = path.join(root, PROFILE_FILE);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const profile = {
      version: 1,
      name: "Маняша",
      provider,
      managedAccess: { status: "not_activated", expiresAt: null },
      permissions: { files: "ask", write: "ask", externalActions: "confirm" },
      createdAt: new Date().toISOString(),
    };
    await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
    return profile;
  }
}

export async function setProvider(profileDir, provider) {
  if (!new Set(["managed", "byok", "local"]).has(provider)) throw new Error("provider_invalid");
  const profile = await ensureProfile(profileDir);
  const updated = { ...profile, provider, updatedAt: new Date().toISOString() };
  await writeFile(path.join(path.resolve(profileDir), PROFILE_FILE), `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  return updated;
}

function lineDiff(left, right) {
  const leftLines = left.split(/\r?\n/);
  const rightLines = right.split(/\r?\n/);
  const count = Math.max(leftLines.length, rightLines.length);
  const changes = [];
  for (let index = 0; index < count; index += 1) {
    if (leftLines[index] !== rightLines[index]) changes.push({ line: index + 1, left: leftLines[index] ?? "", right: rightLines[index] ?? "" });
  }
  return changes;
}

export async function compareFiles({ profileDir, workspaceDir, left, right, out, allowRead, allowWrite }) {
  if (!allowRead) throw new Error("read_permission_required");
  if (!allowWrite) throw new Error("write_permission_required");
  const workspace = await realpath(path.resolve(workspaceDir));
  const leftPath = (await safeWorkspacePath(workspace, left)).target;
  const rightPath = (await safeWorkspacePath(workspace, right)).target;
  const outPath = (await safeWorkspacePath(workspace, out, { allowMissingLeaf: true })).target;
  const profile = await ensureProfile(profileDir);
  const [leftText, rightText] = await Promise.all([readWorkspaceFile(workspace, left), readWorkspaceFile(workspace, right)]);
  const changes = lineDiff(leftText, rightText);
  const result = [
    "# Сравнение файлов",
    "",
    `- Первый файл: \`${path.basename(leftPath)}\``,
    `- Второй файл: \`${path.basename(rightPath)}\``,
    `- Отличающихся строк: ${changes.length}`,
    "",
    ...changes.flatMap((change) => [`## Строка ${change.line}`, "", `- Было: ${change.left || "[пусто]"}`, `- Стало: ${change.right || "[пусто]"}`, ""]),
  ].join("\n");
  await writeWorkspaceFile(workspace, out, result);
  const session = {
    id: crypto.randomUUID(),
    kind: "compare_files",
    provider: profile.provider,
    workspace,
    inputs: [leftPath, rightPath],
    output: outPath,
    changes: changes.length,
    permissions: { read: true, write: true },
    createdAt: new Date().toISOString(),
  };
  await writeFile(path.join(path.resolve(profileDir), "sessions", `${session.id}.json`), `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  return session;
}

export async function listSessions(profileDir) {
  await ensureProfile(profileDir);
  const folder = path.join(path.resolve(profileDir), "sessions");
  const files = (await readdir(folder)).filter((file) => file.endsWith(".json")).sort().reverse();
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(folder, file), "utf8"))));
}
