const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function readVscodeIgnore() {
  return fs.readFileSync(path.join(__dirname, "..", ".vscodeignore"), "utf8");
}

test(".vscodeignore excludes local-only artifacts from packaged VSIX", () => {
  const ignore = readVscodeIgnore();

  for (const pattern of [
    "doc/**",
    "test/**",
    "test-report.json",
    "test-report.md",
    "scripts/run_test_report.js",
    "node_modules/**/test/**",
    "node_modules/**/tests/**",
    "node_modules/**/__tests__/**",
    "*.vsix",
    ".env",
    ".env.*",
    ".mochi/**",
    "coverage/**",
    "mochi-memory/**",
    "memory/**",
  ]) {
    assert.match(ignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), pattern);
  }
});
