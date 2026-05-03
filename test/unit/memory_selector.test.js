const test = require("node:test");
const assert = require("node:assert/strict");
const { selectSubagentMemory } = require("../../src/runtime/support/memory_selector");

function makeState(overrides = {}) {
  return {
    memorySlices: {
      task: "task memory",
      workspace: "workspace memory",
      session: "session summary",
      user: "user preference",
      referencedTasks: "ref tasks",
      recentSessions: "recent sessions",
      ...overrides,
    },
  };
}

test("selectSubagentMemory for repo_guide orders sections with workspace first", () => {
  const result = selectSubagentMemory({
    agentKey: "repo_guide",
    memoryState: makeState(),
    projectInstructionsText: "instructions",
  });
  const workspaceIndex = result.text.indexOf("Workspace memory");
  const taskIndex = result.text.indexOf("Task memory");
  assert.ok(workspaceIndex >= 0);
  assert.ok(workspaceIndex < taskIndex);
});

test("selectSubagentMemory for coding puts task memory first", () => {
  const result = selectSubagentMemory({
    agentKey: "coding",
    memoryState: makeState(),
  });
  const taskIndex = result.text.indexOf("Task memory");
  const workspaceIndex = result.text.indexOf("Workspace memory");
  assert.ok(taskIndex >= 0);
  assert.ok(taskIndex < workspaceIndex);
});

test("selectSubagentMemory includes project instructions when provided", () => {
  const result = selectSubagentMemory({
    agentKey: "coding",
    memoryState: makeState(),
    projectInstructionsText: "project instructions text",
  });
  assert.match(result.text, /project instructions text/);
});

test("selectSubagentMemory returns empty text when all slices are empty", () => {
  const result = selectSubagentMemory({
    agentKey: "coding",
    memoryState: { memorySlices: {} },
  });
  assert.equal(result.text, "");
  assert.deepEqual(result.metadata.included, []);
});

test("selectSubagentMemory metadata reflects agentKey and limit", () => {
  const result = selectSubagentMemory({
    agentKey: "review",
    memoryState: makeState(),
  });
  assert.equal(result.metadata.agentKey, "review");
  assert.ok(result.metadata.limit > 0);
});

test("selectSubagentMemory for unknown agent key uses default limit", () => {
  const result = selectSubagentMemory({
    agentKey: "mystery",
    memoryState: makeState(),
  });
  assert.equal(result.metadata.agentKey, "mystery");
  assert.ok(result.text.length > 0);
});
