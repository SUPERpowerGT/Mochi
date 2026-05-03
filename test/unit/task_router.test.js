const test = require("node:test");
const assert = require("node:assert/strict");
const { decideTaskRoute, scoreTaskAgainstPrompt } = require("../../src/runtime/memory/task_router");
const { DEFAULT_TASK_POLICY } = require("../../src/runtime/memory/task_policy");

test("scoreTaskAgainstPrompt returns 0 when task is null", () => {
  assert.equal(scoreTaskAgainstPrompt(null, "foo"), 0);
});

test("scoreTaskAgainstPrompt picks max of goal and lastUserPrompt overlap", () => {
  const task = { goal: "write docs", lastUserPrompt: "refactor memory module" };
  const score = scoreTaskAgainstPrompt(task, "refactor memory module");
  assert.equal(score, 1);
});

test("decideTaskRoute continues fresh active task", () => {
  const result = decideTaskRoute({
    currentTask: { id: "t1", turnCount: 0 },
    inactiveTasks: [],
    prompt: "do something else",
  });
  assert.equal(result.action, "continue");
  assert.equal(result.reason, "fresh-active-task");
});

test("decideTaskRoute continues on follow-up prompt", () => {
  const result = decideTaskRoute({
    currentTask: { id: "t1", turnCount: 3, goal: "write docs", lastUserPrompt: "" },
    inactiveTasks: [],
    prompt: "继续",
  });
  assert.equal(result.action, "continue");
  assert.equal(result.reason, "follow-up-prompt");
});

test("decideTaskRoute continues when prompt matches active task", () => {
  const result = decideTaskRoute({
    currentTask: {
      id: "t1",
      turnCount: 2,
      goal: "refactor memory selector module",
      lastUserPrompt: "refactor memory selector module",
    },
    inactiveTasks: [],
    prompt: "refactor memory selector module",
    policy: DEFAULT_TASK_POLICY,
  });
  assert.equal(result.action, "continue");
  assert.equal(result.reason, "matches-active-task");
});

test("decideTaskRoute reactivates when an inactive task strongly matches", () => {
  const result = decideTaskRoute({
    currentTask: { id: "t1", turnCount: 5, goal: "write docs", lastUserPrompt: "write docs" },
    inactiveTasks: [
      { id: "old1", goal: "fix memory selector bug", lastUserPrompt: "fix memory selector bug" },
    ],
    prompt: "fix memory selector bug",
    policy: DEFAULT_TASK_POLICY,
  });
  assert.equal(result.action, "reactivate");
  assert.equal(result.targetTask.id, "old1");
});

test("decideTaskRoute creates new task when nothing matches", () => {
  const result = decideTaskRoute({
    currentTask: { id: "t1", turnCount: 5, goal: "aaa", lastUserPrompt: "aaa" },
    inactiveTasks: [{ id: "old1", goal: "bbb", lastUserPrompt: "bbb" }],
    prompt: "zzzzz qqq",
    policy: DEFAULT_TASK_POLICY,
  });
  assert.equal(result.action, "create");
});
