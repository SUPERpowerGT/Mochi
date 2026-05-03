const test = require("node:test");
const assert = require("node:assert/strict");
const { createCompactMemorySnapshot } = require("../../src/runtime/support/compact_snapshot");

test("createCompactMemorySnapshot returns empty object for null input", () => {
  assert.deepEqual(createCompactMemorySnapshot(null), {});
  assert.deepEqual(createCompactMemorySnapshot(undefined), {});
});

test("createCompactMemorySnapshot preserves top-level session identifiers", () => {
  const snapshot = createCompactMemorySnapshot({
    generatedAt: "2026-01-01T00:00:00Z",
    storageRoot: "/tmp/store",
    workspaceRoot: "/tmp/ws",
    sessionId: "s1",
  });
  assert.equal(snapshot.sessionId, "s1");
  assert.equal(snapshot.workspaceRoot, "/tmp/ws");
  assert.equal(snapshot.storage.root, "/tmp/store");
  assert.equal(snapshot.storage.localOnly, true);
});

test("createCompactMemorySnapshot truncates recentTasks to 8", () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({
    title: `task ${i}`,
    status: "active",
    turnCount: i,
  }));
  const snapshot = createCompactMemorySnapshot({ tasks });
  assert.equal(snapshot.recentTasks.length, 8);
  assert.equal(snapshot.taskCount, 20);
});

test("createCompactMemorySnapshot summarises session with flags", () => {
  const snapshot = createCompactMemorySnapshot({
    session: {
      summary: "did things",
      summaryUpdatedAt: "2026-01-01",
      history: [{}, {}, {}],
    },
  });
  assert.equal(snapshot.sessionSummary.hasSummary, true);
  assert.equal(snapshot.sessionSummary.retainedHistoryItems, 3);
});

test("createCompactMemorySnapshot builds focusedTask and activeTask when task is present", () => {
  const snapshot = createCompactMemorySnapshot({
    task: {
      title: "Write tests",
      goal: "50 tests",
      status: "in_progress",
      sessionIds: ["s1"],
      turnCount: 3,
    },
  });
  assert.equal(snapshot.focusedTask.title, "Write tests");
  assert.equal(snapshot.activeTask.turnCount, 3);
});
