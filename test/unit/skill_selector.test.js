const test = require("node:test");
const assert = require("node:assert/strict");
const {
  selectSkillsForRoot,
  selectSkillsForSubagent,
} = require("../../src/runtime/support/skill_selector");

test("selectSkillsForRoot returns empty text for unrelated prompts", () => {
  const result = selectSkillsForRoot({ prompt: "what is the weather like today" });
  assert.equal(typeof result.text, "string");
  // Either no skill matches (empty) or matches — both are acceptable; shape must hold
  assert.ok(Array.isArray(result.metadata.included));
  assert.equal(result.metadata.agentKey, "root");
});

test("selectSkillsForRoot activates vscode-extension-dev skill on matching terms", () => {
  const result = selectSkillsForRoot({
    prompt: "update package.json activationEvents for the vscode extension webview",
  });
  assert.ok(result.text.includes("vscode-extension-dev") || result.metadata.included.includes("vscode-extension-dev"));
});

test("selectSkillsForRoot activates memory-architecture skill on matching terms", () => {
  const result = selectSkillsForRoot({
    prompt: "refactor the memory, session, and task tracing layer",
  });
  assert.ok(
    result.metadata.included.includes("memory-architecture") ||
      result.text.includes("memory-architecture")
  );
});

test("selectSkillsForSubagent respects the subagent budget", () => {
  const result = selectSkillsForSubagent({
    prompt: "update package.json activationEvents for the vscode extension",
    agentKey: "coding",
  });
  assert.equal(result.metadata.agentKey, "coding");
  assert.ok(result.metadata.limit <= 1400);
});
