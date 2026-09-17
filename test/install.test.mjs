import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("macOS installer survives quarantine on copied launchers", async () => {
  const source = await readFile(new URL("../scripts/install-macos.sh", import.meta.url), "utf8");
  assert.match(source, /xattr -d com\.apple\.quarantine/);
  assert.match(source, /node "\$INSTALL_ROOT\/src\/cli\.mjs" setup/);
  assert.doesNotMatch(source, /"\$INSTALL_ROOT\/bin\/manyasha" setup/);
});
