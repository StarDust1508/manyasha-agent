import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("macOS installer survives quarantine on copied launchers", async () => {
  const source = await readFile(new URL("../scripts/install-macos.sh", import.meta.url), "utf8");
  assert.match(source, /xattr -d com\.apple\.quarantine/);
  assert.match(source, /node "\$INSTALL_ROOT\/src\/cli\.mjs" setup/);
  assert.doesNotMatch(source, /"\$INSTALL_ROOT\/bin\/manyasha" setup/);
});

test("Windows installer uses an isolated local profile and the pinned Hermes commit", async () => {
  const source = await readFile(new URL("../scripts/install-windows.ps1", import.meta.url), "utf8");
  assert.match(source, /LOCALAPPDATA/);
  assert.match(source, /5eb99eb2844b22ebb723711b8e6a0bbb80bb5f04/);
  assert.match(source, /GetEnvironmentVariable\("Path", "User"\)/);
  assert.match(source, /node \(Join-Path \$InstallRoot "src\\cli\.mjs"\) setup/);
});

test("runtime paths select Windows executables without changing the macOS path", async () => {
  const cli = await readFile(new URL("../src/cli.mjs", import.meta.url), "utf8");
  const hermes = await readFile(new URL("../scripts/pinned-hermes.mjs", import.meta.url), "utf8");
  assert.match(cli, /process\.platform === "win32"/);
  assert.match(hermes, /process\.platform === "win32" \? "Scripts" : "bin"/);
  assert.match(hermes, /process\.platform === "win32" \? "hermes\.exe" : "hermes"/);
});
