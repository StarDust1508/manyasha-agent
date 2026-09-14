import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareFiles, ensureProfile, listSessions, setProvider } from "../src/core.mjs";

test("terminal result persists in the same profile used by the GUI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "manyasha-agent-"));
  const profile = path.join(root, "profile");
  const workspace = path.join(root, "workspace");
  await ensureProfile(profile);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(workspace, { recursive: true }));
  await writeFile(path.join(workspace, "a.txt"), "Один\nДва\n");
  await writeFile(path.join(workspace, "b.txt"), "Один\nТри\n");
  const session = await compareFiles({ profileDir: profile, workspaceDir: workspace, left: "a.txt", right: "b.txt", out: "result.md", allowRead: true, allowWrite: true });
  assert.equal(session.changes, 1);
  assert.match(await readFile(path.join(workspace, "result.md"), "utf8"), /Строка 2/);
  assert.equal((await listSessions(profile))[0].id, session.id);
  const updated = await setProvider(profile, "local");
  assert.equal(updated.provider, "local");
  assert.equal((await listSessions(profile))[0].id, session.id);
});

test("file tools fail closed without explicit permissions or outside the workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "manyasha-agent-"));
  await assert.rejects(() => compareFiles({ profileDir: path.join(root, "profile"), workspaceDir: root, left: "a", right: "b", out: "c", allowRead: false, allowWrite: true }), /read_permission_required/);
  await assert.rejects(() => compareFiles({ profileDir: path.join(root, "profile"), workspaceDir: root, left: "../a", right: "b", out: "c", allowRead: true, allowWrite: true }), /path_outside_workspace/);
});

test("file tools reject symlinks in files and intermediate folders", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "manyasha-agent-links-"));
  const workspace = path.join(root, "workspace");
  const outside = path.join(root, "outside");
  await mkdir(workspace); await mkdir(outside);
  await writeFile(path.join(workspace, "safe.txt"), "safe\n");
  await writeFile(path.join(outside, "secret.txt"), "outside\n");
  await symlink(path.join(outside, "secret.txt"), path.join(workspace, "linked-file.txt"));
  await symlink(outside, path.join(workspace, "linked-folder"));
  await assert.rejects(() => compareFiles({ profileDir: path.join(root, "profile-a"), workspaceDir: workspace, left: "safe.txt", right: "linked-file.txt", out: "result.md", allowRead: true, allowWrite: true }), /symlink_not_allowed/);
  await assert.rejects(() => compareFiles({ profileDir: path.join(root, "profile-b"), workspaceDir: workspace, left: "safe.txt", right: "linked-folder\/secret.txt", out: "result.md", allowRead: true, allowWrite: true }), /symlink_not_allowed/);
  await assert.rejects(() => compareFiles({ profileDir: path.join(root, "profile-c"), workspaceDir: workspace, left: "safe.txt", right: "safe.txt", out: "linked-folder\/result.md", allowRead: true, allowWrite: true }), /symlink_not_allowed/);
});
