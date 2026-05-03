#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const setupModelPath = path.join(__dirname, "setup_model.js");

console.warn("scripts/setup_openai.js is deprecated. Use scripts/setup_model.js instead.");
const result = spawnSync(process.execPath, [setupModelPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message || String(result.error));
  process.exitCode = 1;
} else {
  process.exitCode = result.status || 0;
}
