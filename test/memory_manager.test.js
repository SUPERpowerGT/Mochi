const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { MemoryManager } = require("../src/runtime/memory/memory_manager");
const { createSessionId, createWorkspaceId } = require("../src/runtime/memory/memory_utils");

function createMemoryManager() {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-memory-"));
  return new MemoryManager({
    storageRoot,
    getWorkspaceRoot: () => storageRoot,
    baseSessionId: "session-a",
  });
}

test("memory policy defaults to reading persistent and cross-session memory", () => {
  const manager = createMemoryManager();

  assert.deepEqual(manager.getMemoryPolicy("session-a"), {
    isolateSession: false,
    disablePersistentMemory: false,
    privateWindow: false,
  });
});

test("memory policy updates are scoped by base session id", () => {
  const manager = createMemoryManager();

  const sessionAPolicy = manager.setMemoryPolicy("session-a", {
    disablePersistentMemory: true,
  });

  assert.deepEqual(sessionAPolicy, {
    isolateSession: false,
    disablePersistentMemory: true,
    privateWindow: false,
  });
  assert.deepEqual(manager.getMemoryPolicy("session-a"), sessionAPolicy);
  assert.deepEqual(manager.getMemoryPolicy("session-b"), {
    isolateSession: false,
    disablePersistentMemory: false,
    privateWindow: false,
  });
});

test("private window mode isolates the current window and disables persistent reads", async () => {
  const manager = createMemoryManager();

  const privatePolicy = await manager.setPrivateWindowModeForUi("session-a", true);
  assert.deepEqual(privatePolicy, {
    isolateSession: true,
    disablePersistentMemory: true,
    privateWindow: true,
  });

  const normalPolicy = await manager.setPrivateWindowModeForUi("session-a", false);
  assert.deepEqual(normalPolicy, {
    isolateSession: false,
    disablePersistentMemory: false,
    privateWindow: false,
  });
});

test("getMemoryControlsForUi reports the current policy and creates session memory", async () => {
  const manager = createMemoryManager();
  manager.setMemoryPolicy("session-a", {
    isolateSession: true,
    disablePersistentMemory: true,
  });

  const controls = await manager.getMemoryControlsForUi("session-a");

  assert.equal(controls.baseSessionId, "session-a");
  assert.equal(controls.policy.isolateSession, true);
  assert.equal(controls.policy.disablePersistentMemory, true);
  assert.equal(controls.counts.messages, 0);
  assert.equal(controls.sessionId, `session-a:${controls.workspaceId}`);
});

test("clearCurrentSessionMemoryForUi preserves current chat messages", async () => {
  const manager = createMemoryManager();
  const workspaceRoot = manager.getWorkspaceRoot();
  const workspaceId = createWorkspaceId(workspaceRoot);
  const sessionId = createSessionId("session-a", workspaceId);
  await manager.sessionStore.getOrCreateSession(sessionId, workspaceId);
  await manager.sessionStore.setHistory(sessionId, createMessageHistory(), "remember this");

  await manager.clearCurrentSessionMemoryForUi("session-a");
  const messages = await manager.getCurrentSessionMessagesForUi("session-a");
  const controls = await manager.getMemoryControlsForUi("session-a");

  assert.deepEqual(messages, [
    { role: "user", text: "remember this" },
    { role: "assistant", text: "remembered" },
  ]);
  assert.equal(controls.counts.messages, 2);
  assert.equal(controls.session.summary, "");
  assert.equal(controls.counts.tasks, 0);
});

test("clearAllMemoryForUi preserves chat sessions and messages", async () => {
  const manager = createMemoryManager();
  const workspaceRoot = manager.getWorkspaceRoot();
  const workspaceId = createWorkspaceId(workspaceRoot);
  const sessionId = createSessionId("session-a", workspaceId);
  await manager.sessionStore.getOrCreateSession(sessionId, workspaceId);
  await manager.sessionStore.setHistory(sessionId, createMessageHistory(), "remember this");

  await manager.clearAllMemoryForUi();
  const messages = await manager.getCurrentSessionMessagesForUi("session-a");
  const sessions = await manager.listCurrentWorkspaceSessionsForUi();
  const controls = await manager.getMemoryControlsForUi("session-a");

  assert.deepEqual(messages, [
    { role: "user", text: "remember this" },
    { role: "assistant", text: "remembered" },
  ]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].messageCount, 2);
  assert.equal(controls.counts.messages, 2);
  assert.equal(controls.counts.tasks, 0);
  assert.equal(controls.counts.userPreferences, 0);
});

test("destroyCurrentWindowArtifactsForUi deletes only the current window session artifacts", async () => {
  const manager = createMemoryManager();
  const workspaceRoot = manager.getWorkspaceRoot();
  const workspaceId = createWorkspaceId(workspaceRoot);
  const sessionAId = createSessionId("session-a", workspaceId);
  const sessionBId = createSessionId("session-b", workspaceId);
  await manager.sessionStore.getOrCreateSession(sessionAId, workspaceId);
  await manager.sessionStore.getOrCreateSession(sessionBId, workspaceId);
  await manager.sessionStore.setHistory(sessionAId, createMessageHistory(), "remember this");
  await manager.sessionStore.setHistory(sessionBId, createMessageHistory(), "remember this elsewhere");
  await manager.sessionStore.updateSession(sessionAId, (item) => {
    item.summary = "private session summary";
    item.lastRunTrace = { id: "trace-a" };
    item.activeTaskId = "task-a";
    item.focusedTaskId = "task-a";
  });
  await manager.taskStore.store.update((current) => {
    current.tasks["task-a"] = {
      id: "task-a",
      sessionId: sessionAId,
      workspaceId,
      title: "Current window task",
      status: "active",
      sessionIds: [sessionAId],
    };
    current.tasks["task-b"] = {
      id: "task-b",
      sessionId: sessionBId,
      workspaceId,
      title: "Other window task",
      status: "active",
      sessionIds: [sessionBId],
    };
    return current;
  });

  const controls = await manager.destroyCurrentWindowArtifactsForUi("session-a");
  const sessionBMessages = await manager.getCurrentSessionMessagesForUi("session-b");
  const remainingTasks = await manager.taskStore.store.read();

  assert.equal(controls.sessionId, sessionAId);
  assert.equal(controls.counts.messages, 0);
  assert.equal(controls.counts.tasks, 0);
  assert.equal(controls.session.summary, "");
  assert.deepEqual(sessionBMessages, [
    { role: "user", text: "remember this" },
    { role: "assistant", text: "remembered" },
  ]);
  assert.equal(Boolean(remainingTasks.tasks["task-a"]), false);
  assert.equal(Boolean(remainingTasks.tasks["task-b"]), true);
});

test("finalizeRun applies persistent memory policy for the run base session", async () => {
  const manager = createMemoryManager();
  const workspaceRoot = manager.getWorkspaceRoot();
  const workspaceId = createWorkspaceId(workspaceRoot);
  const sessionAId = createSessionId("session-a", workspaceId);
  const sessionBId = createSessionId("session-b", workspaceId);
  await manager.sessionStore.getOrCreateSession(sessionAId, workspaceId);
  await manager.setPrivateWindowModeForUi("session-a", true);
  const memoryState = await manager.prepareRun("please implement this feature", {
    baseSessionId: "session-b",
  });

  await manager.finalizeRun({
    baseSessionId: "session-b",
    sessionId: sessionBId,
    taskId: memoryState.taskId,
    taskPlan: memoryState.taskPlan,
    prompt: "please implement this feature",
    reply: "implemented",
    history: createMessageHistory(),
    trace: { status: "completed" },
  });

  const sessionBTasks = await manager.taskStore.listTasksForSession(sessionBId);
  assert.equal(sessionBTasks.length, 1);
  assert.equal(sessionBTasks[0].summary.includes("implemented"), true);
});

test("granular memory clear methods clear only their memory category", async () => {
  const manager = createMemoryManager();
  const workspaceRoot = manager.getWorkspaceRoot();
  const workspaceId = createWorkspaceId(workspaceRoot);
  const sessionId = createSessionId("session-a", workspaceId);
  const session = await manager.sessionStore.getOrCreateSession(sessionId, workspaceId);
  await manager.sessionStore.setHistory(sessionId, createMessageHistory(), "remember this");
  await manager.sessionStore.updateSession(sessionId, (item) => {
    item.summary = "summary memory";
    item.summaryUpdatedAt = new Date().toISOString();
    item.lastTurn = { kind: "work" };
    item.lastRunTrace = { id: "trace-1" };
    item.activeTaskId = "task-1";
    item.focusedTaskId = "task-1";
  });
  await manager.taskStore.store.update((current) => {
    current.tasks["task-1"] = {
      id: "task-1",
      sessionId,
      workspaceId,
      title: "Task memory",
      status: "active",
      summary: "task summary",
      updatedAt: new Date().toISOString(),
      sessionIds: [sessionId],
    };
    return current;
  });
  await manager.workspaceStore.getOrCreateWorkspace(workspaceId, workspaceRoot);
  await manager.userStore.setPreference("preferredLanguage", "zh-CN");

  await manager.clearCurrentSessionSummaryMemoryForUi("session-a");
  let controls = await manager.getMemoryControlsForUi("session-a");
  assert.equal(controls.session.summary, "");
  assert.equal(controls.counts.messages, 2);
  assert.equal(controls.counts.tasks, 1);
  assert.equal(controls.counts.workspaceMemory, 1);
  assert.equal(controls.counts.userPreferences, 1);

  await manager.clearCurrentTraceAndRoutingMemoryForUi("session-a");
  const afterTraceClear = await manager.sessionStore.getSession(session.id);
  assert.equal(afterTraceClear.lastRunTrace, null);
  assert.equal(afterTraceClear.lastTurn, null);
  assert.equal(afterTraceClear.activeTaskId, null);
  assert.equal(afterTraceClear.focusedTaskId, null);

  await manager.clearCurrentTaskMemoryForUi("session-a");
  controls = await manager.getMemoryControlsForUi("session-a");
  assert.equal(controls.counts.tasks, 0);
  assert.equal(controls.counts.workspaceMemory, 1);
  assert.equal(controls.counts.userPreferences, 1);

  await manager.clearCurrentWorkspaceMemoryForUi("session-a");
  controls = await manager.getMemoryControlsForUi("session-a");
  assert.equal(controls.counts.workspaceMemory, 0);
  assert.equal(controls.counts.userPreferences, 1);

  await manager.clearUserMemoryForUi("session-a");
  controls = await manager.getMemoryControlsForUi("session-a");
  assert.equal(controls.counts.userPreferences, 0);
  assert.deepEqual(await manager.getCurrentSessionMessagesForUi("session-a"), [
    { role: "user", text: "remember this" },
    { role: "assistant", text: "remembered" },
  ]);
});

function createMessageHistory() {
  return [
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "remember this" }],
    },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "remembered" }],
    },
  ];
}
