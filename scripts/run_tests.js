#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");

function runTests(targets = []) {
  const selectedTargets = targets.length ? targets : ["test"];
  const testFiles = selectedTargets
    .flatMap((target) => collectTestFiles(path.resolve(repoRoot, target)))
    .sort();

  if (!testFiles.length) {
    process.stderr.write(`No test files found for: ${selectedTargets.join(", ")}\n`);
    process.exitCode = 1;
    return [];
  }

  for (const file of testFiles) {
    require(file);
  }

  return testFiles;
}

function collectTestFiles(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return [];
  }

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return isTestFile(targetPath) ? [targetPath] : [];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  return fs.readdirSync(targetPath)
    .flatMap((entry) => collectTestFiles(path.join(targetPath, entry)));
}

function isTestFile(filePath) {
  return /\.test\.js$/.test(path.basename(filePath));
}

if (require.main === module) {
  runTests(process.argv.slice(2));
}

module.exports = {
  collectTestFiles,
  runTests,
};
