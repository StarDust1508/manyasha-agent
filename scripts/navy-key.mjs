#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = process.env.MANYASHA_NAVY_ENV_SOURCE;
if (!sourcePath) process.exit(2);
const source = await readFile(path.resolve(sourcePath), "utf8");
const line = source.split(/\r?\n/).find((item) => item.trim().startsWith("OPENAI_API_KEY="));
if (!line) process.exit(3);
let value = line.slice(line.indexOf("=") + 1).trim();
if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
if (!value) process.exit(4);
process.stdout.write(value);
