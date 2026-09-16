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

export async function configureManagedAccess(profileDir, serverUrl, deviceToken) {
  const url = new URL(String(serverUrl || "").replace(/\/+$/, ""));
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) throw new Error("managed_server_url_invalid");
  const token = String(deviceToken || "").trim();
  if (token.length < 32) throw new Error("managed_device_token_invalid");
  const profile = await ensureProfile(profileDir);
  const updated = {
    ...profile,
    provider: "managed",
    managedAccess: { status: "ready", serverUrl: url.origin, deviceToken: token, configuredAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(path.resolve(profileDir), PROFILE_FILE), `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  return { ...updated, managedAccess: { ...updated.managedAccess, deviceToken: "configured" } };
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
  const files = (await readdir(folder)).filter((file) => file.endsWith(".json"));
  const sessions = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(folder, file), "utf8"))));
  return sessions.sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0));
}

function parseEnvFile(raw) {
  return Object.fromEntries(raw.split(/\r?\n/).filter((line) => line && !line.trim().startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(["'])|(["'])$/g, "")];
  }));
}

export async function loadNavyProvider(environment = process.env) {
  let baseURL = String(environment.MANYASHA_NAVY_BASE_URL || "").trim();
  let apiKey = String(environment.MANYASHA_NAVY_API_KEY || "").trim();
  if ((!baseURL || !apiKey) && environment.MANYASHA_NAVY_ENV_SOURCE) {
    const source = parseEnvFile(await readFile(path.resolve(environment.MANYASHA_NAVY_ENV_SOURCE), "utf8"));
    baseURL = baseURL || String(source.NAVY_BASE_URL || "https://api.navy/v1").trim();
    apiKey = apiKey || String(source.NAVY_API_KEY || "").trim();
  }
  if ((!baseURL || !apiKey) && environment.MANYASHA_NAVY_CONFIG_FILE) {
    const parsed = JSON.parse(await readFile(path.resolve(environment.MANYASHA_NAVY_CONFIG_FILE), "utf8"));
    const options = parsed?.provider?.navy?.options;
    baseURL = baseURL || String(options?.baseURL || "").trim();
    apiKey = apiKey || String(options?.apiKey || "").trim();
  }
  if (!baseURL || !apiKey) throw new Error("navy_provider_not_configured");
  const origin = new URL(baseURL).origin;
  if (origin !== "https://api.navy") throw new Error("navy_provider_origin_invalid");
  return { baseURL: baseURL.replace(/\/+$/, ""), apiKey };
}

function assistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((item) => typeof item === "string" ? item : String(item?.text || "")).join(" ").trim();
  return "";
}

export async function runConversationTask({
  profileDir,
  prompt,
  sessionId,
  model = process.env.MANYASHA_AGENT_MODEL || "gpt-5.6-terra",
  provider,
  fetchImpl = fetch,
  signal,
}) {
  const cleanPrompt = String(prompt || "").trim().slice(0, 20_000);
  if (!cleanPrompt) throw new Error("prompt_required");
  const profile = await ensureProfile(profileDir);
  const folder = path.join(path.resolve(profileDir), "sessions");
  let session = null;
  if (sessionId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(sessionId))) throw new Error("session_id_invalid");
    try { session = JSON.parse(await readFile(path.join(folder, `${sessionId}.json`), "utf8")); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    if (session && session.kind !== "conversation") throw new Error("session_kind_invalid");
  }
  const now = new Date().toISOString();
  session ||= {
    id: crypto.randomUUID(),
    kind: "conversation",
    provider: profile.provider,
    model,
    title: cleanPrompt.slice(0, 72),
    status: "running",
    messages: [],
    capabilities: { typedText: true, files: false, externalActions: false },
    permissions: { files: "not_requested", externalActions: "blocked" },
    createdAt: now,
  };
  session.status = "running";
  session.updatedAt = now;
  session.model = model;
  session.messages.push({ role: "user", content: cleanPrompt, createdAt: now });
  const file = path.join(folder, `${session.id}.json`);
  await writeFile(file, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  try {
    const config = provider || (profile.provider === "managed" && profile.managedAccess?.status === "ready"
      ? {
          baseURL: `${String(profile.managedAccess.serverUrl).replace(/\/+$/, "")}/api/manyasha/control/agent/model/v1`,
          apiKey: String(profile.managedAccess.deviceToken),
        }
      : await loadNavyProvider());
    const response = await fetchImpl(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Ты Маняша — личный ИИ-помощник. Отвечай по-русски, ясно и предметно. Показывай допущения, не выдумывай источники и не утверждай, что прочитала файлы или выполнила внешнее действие, если в этой сессии доступны только сообщения. Для отправки, публикации, оплаты, календаря и доступа к личным сервисам всегда требуется отдельное разрешение пользователя." },
          ...session.messages.map(({ role, content }) => ({ role, content })),
        ],
        max_tokens: 1_200,
        temperature: 0.35,
        stream: false,
      }),
      signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body?.error?.message || `model_http_${response.status}`));
    const content = assistantText(body);
    if (!content) throw new Error("model_empty_response");
    session.messages.push({ role: "assistant", content, createdAt: new Date().toISOString() });
    session.status = "completed";
    session.updatedAt = new Date().toISOString();
    session.providerRequestId = body?.id || null;
    await writeFile(file, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    return session;
  } catch (error) {
    session.status = signal?.aborted ? "cancelled" : "failed";
    session.updatedAt = new Date().toISOString();
    session.error = signal?.aborted ? "cancelled_by_user" : String(error?.message || "task_failed").slice(0, 500);
    await writeFile(file, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    throw error;
  }
}
