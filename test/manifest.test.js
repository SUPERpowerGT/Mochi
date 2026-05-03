const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
);

test("command activation events match contributed commands", () => {
  const contributedCommands = packageJson.contributes.commands.map((item) => item.command);
  const activationCommands = packageJson.activationEvents
    .filter((item) => item.startsWith("onCommand:"))
    .map((item) => item.slice("onCommand:".length));

  assert.deepEqual(new Set(activationCommands), new Set(contributedCommands));
});

test("memory and slash-backed commands are contributed", () => {
  const commands = new Set(packageJson.contributes.commands.map((item) => item.command));
  for (const command of [
    "localAgent.configureModelCredentials",
    "localAgent.openMemoryControls",
    "localAgent.openMemorySnapshot",
    "localAgent.openRawMemorySnapshot",
    "localAgent.openRuntimeLogs",
    "localAgent.togglePrivateWindowMode",
    "localAgent.togglePersistentMemoryRead",
    "localAgent.toggleSessionMemoryIsolation",
    "localAgent.destroyCurrentWindowArtifacts",
    "localAgent.clearCurrentSessionMemory",
    "localAgent.clearCurrentSessionSummaryMemory",
    "localAgent.clearCurrentTaskMemory",
    "localAgent.clearCurrentWorkspaceMemory",
    "localAgent.clearUserMemory",
    "localAgent.clearCurrentTraceMemory",
    "localAgent.clearAllMemory",
    "localAgent.selectWorkspaceFolder",
    "localAgent.sendSelection",
    "localAgent.applyLastReply",
  ]) {
    assert.equal(commands.has(command), true, command);
  }
});
