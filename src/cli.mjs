#!/usr/bin/env node
import path from "node:path";
import os from "node:os";
import { compareFiles, ensureProfile, setProvider } from "./core.mjs";
import { startGui } from "./gui.mjs";

const args = process.argv.slice(2);
const command = args[0] || "help";
const value = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const dataRoot = process.env.MANYASHA_DATA_DIR || path.join(os.homedir(), "Library", "Application Support", "Manyasha");
const defaultProfile = process.env.MANYASHA_PROFILE_DIR || path.join(dataRoot, "profile");
const profileDir = path.resolve(value("--profile", defaultProfile));

try {
  if (command === "setup") {
    const profile = await ensureProfile(profileDir, value("--provider", "managed"));
    console.log(`Маняша готова. Профиль: ${profileDir}. Источник модели: ${profile.provider}.`);
  } else if (command === "provider") {
    const profile = await setProvider(profileDir, value("--set", ""));
    console.log(`Источник модели: ${profile.provider}. История и сессии сохранены.`);
  } else if (command === "compare") {
    const workspaceDir = path.resolve(value("--workspace", process.cwd()));
    const session = await compareFiles({
      profileDir,
      workspaceDir,
      left: value("--left", ""),
      right: value("--right", ""),
      out: value("--out", "comparison.md"),
      allowRead: args.includes("--allow-read"),
      allowWrite: args.includes("--allow-write"),
    });
    console.log(`Готово: ${session.changes} отличий. Результат: ${session.output}`);
  } else if (command === "gui") {
    const port = Number(value("--port", "8787"));
    await startGui(profileDir, port);
    console.log(`GUI Маняши: http://127.0.0.1:${port}`);
  } else {
    console.log("Маняша 0.1\n\nsetup --profile DIR [--provider managed|byok|local]\nprovider --profile DIR --set managed|byok|local\ncompare --profile DIR --workspace DIR --left FILE --right FILE --out FILE --allow-read --allow-write\ngui --profile DIR [--port 8787]");
  }
} catch (error) {
  console.error(`Маняша: ${error instanceof Error ? error.message : "command_failed"}`);
  process.exitCode = 1;
}
