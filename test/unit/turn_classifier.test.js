const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTurn } = require("../../src/runtime/memory/turn_classifier");

test("classifyTurn marks empty prompt as conversation", () => {
  const result = classifyTurn({ prompt: "", currentTask: null });
  assert.equal(result.kind, "conversation");
  assert.equal(result.reason, "empty-turn");
});

test("classifyTurn detects work action verbs (English)", () => {
  const result = classifyTurn({ prompt: "fix the login bug", currentTask: null });
  assert.equal(result.kind, "work");
  assert.equal(result.reason, "work-action-signal");
});

test("classifyTurn detects work action verbs (Chinese)", () => {
  const result = classifyTurn({ prompt: "优化这段代码", currentTask: null });
  assert.equal(result.kind, "work");
});

test("classifyTurn recognises conversation like hello", () => {
  const result = classifyTurn({ prompt: "hello", currentTask: null });
  assert.equal(result.kind, "conversation");
});

test("classifyTurn treats short non-work prompts as conversation", () => {
  const result = classifyTurn({ prompt: "ok?", currentTask: null });
  assert.equal(result.kind, "conversation");
  assert.equal(result.reason, "short-non-work-turn");
});

test("classifyTurn treats follow-up after active task as work", () => {
  const result = classifyTurn({
    prompt: "继续",
    currentTask: { id: "t1", title: "bug fix" },
  });
  assert.equal(result.kind, "work");
  assert.equal(result.reason, "follow-up-to-active-work-item");
});

test("classifyTurn uses strong domain signals alone as work", () => {
  const result = classifyTurn({
    prompt: "workspace runtime memory session task file",
    currentTask: null,
  });
  assert.equal(result.kind, "work");
});

test("classifyTurn diagnostics include scores", () => {
  const result = classifyTurn({ prompt: "fix the bug", currentTask: null });
  assert.equal(typeof result.diagnostics.workActionScore, "number");
  assert.equal(typeof result.diagnostics.keywordCount, "number");
  assert.equal(typeof result.diagnostics.promptLength, "number");
});

test("classifyTurn default when no signals and task active", () => {
  const result = classifyTurn({
    prompt: "how nice today really interesting indeed",
    currentTask: { id: "t1" },
  });
  assert.equal(result.kind, "conversation");
  assert.equal(result.reason, "default-conversation-turn");
});
