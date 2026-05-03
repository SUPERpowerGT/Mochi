const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_CONTEXT_BUDGET,
  limitText,
  budgetHistory,
  budgetContextSections,
} = require("../../src/runtime/support/context_budget");

test("limitText returns original when under budget", () => {
  assert.equal(limitText("short", 100), "short");
});

test("limitText truncates and appends marker when over budget", () => {
  const text = "a".repeat(50);
  const result = limitText(text, 20);
  assert.ok(result.endsWith("...[truncated]"));
  assert.equal(result.length, 20);
});

test("limitText handles null/undefined safely", () => {
  assert.equal(limitText(null, 10), "");
  assert.equal(limitText(undefined, 10), "");
});

test("limitText with maxChars=0 returns original", () => {
  assert.equal(limitText("hello", 0), "hello");
});

test("budgetHistory respects maxHistoryItems", () => {
  const history = Array.from({ length: 10 }, (_, i) => ({
    type: "message",
    role: "user",
    content: [{ text: `msg ${i}` }],
  }));
  const result = budgetHistory(history, { maxHistoryItems: 3, maxHistoryChars: 100000 });
  assert.ok(result.length <= 3);
});

test("budgetHistory respects maxHistoryChars", () => {
  const big = "x".repeat(2000);
  const history = [
    { type: "message", role: "user", content: [{ text: big }] },
    { type: "message", role: "user", content: [{ text: big }] },
    { type: "message", role: "user", content: [{ text: big }] },
  ];
  const result = budgetHistory(history, {
    maxHistoryItems: 10,
    maxHistoryChars: 3000,
  });
  assert.ok(result.length < history.length);
});

test("budgetHistory keeps tool call + result paired together", () => {
  const history = [
    { type: "message", role: "user", content: [{ text: "do it" }] },
    { type: "function_call", callId: "c1", name: "read" },
    { type: "function_call_result", callId: "c1", output: { ok: true, message: "done" } },
  ];
  const result = budgetHistory(history, { maxHistoryItems: 10, maxHistoryChars: 10000 });
  const callIds = result.filter((i) => i.callId).map((i) => i.callId);
  assert.deepEqual(callIds, ["c1", "c1"]);
});

test("budgetContextSections truncates each section per budget", () => {
  const result = budgetContextSections({
    memoryText: "m".repeat(5000),
    projectInstructionsText: "p".repeat(5000),
    runtimeGuidanceText: "r".repeat(5000),
    editorContext: "e".repeat(5000),
    budget: DEFAULT_CONTEXT_BUDGET,
  });
  assert.ok(result.memoryText.length <= DEFAULT_CONTEXT_BUDGET.maxMemoryChars);
  assert.ok(result.projectInstructionsText.length <= DEFAULT_CONTEXT_BUDGET.maxProjectInstructionChars);
  assert.ok(result.runtimeGuidanceText.length <= DEFAULT_CONTEXT_BUDGET.maxRuntimeGuidanceChars);
  assert.ok(result.editorContext.length <= DEFAULT_CONTEXT_BUDGET.maxEditorContextChars);
});

test("budgetContextSections handles empty input", () => {
  const result = budgetContextSections({});
  assert.equal(result.memoryText, "");
  assert.equal(result.projectInstructionsText, "");
});
