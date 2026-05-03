const test = require("node:test");
const assert = require("node:assert/strict");
const {
  looksLikeClarification,
  removeClarificationBeforeToolExecution,
} = require("../../src/runtime/support/clarification_gate");

test("looksLikeClarification detects Chinese clarification phrases", () => {
  assert.equal(looksLikeClarification("请确认一下"), true);
  assert.equal(looksLikeClarification("你想要保留哪一个？"), true);
  assert.equal(looksLikeClarification("需要我继续吗"), true);
});

test("looksLikeClarification detects English clarification phrases", () => {
  assert.equal(looksLikeClarification("Please confirm"), true);
  assert.equal(looksLikeClarification("Would you like me to continue?"), true);
  assert.equal(looksLikeClarification("Could you clarify the scope?"), true);
});

test("looksLikeClarification returns false for normal assistant text", () => {
  assert.equal(looksLikeClarification("I'll fix the bug right now."), false);
  assert.equal(looksLikeClarification(""), false);
});

test("removeClarificationBeforeToolExecution removes clarification before tool call", () => {
  const history = [
    { type: "message", role: "user", content: [{ text: "fix it" }] },
    {
      type: "message",
      role: "assistant",
      content: [{ text: "Would you like me to proceed?" }],
    },
    { type: "function_call", callId: "c1", name: "edit_file" },
    { type: "function_call_result", callId: "c1", output: { ok: true } },
  ];
  const result = removeClarificationBeforeToolExecution(history);
  const hasClarification = result.some(
    (i) =>
      i.type === "message" &&
      i.role === "assistant" &&
      i.content[0].text.includes("Would you like")
  );
  assert.equal(hasClarification, false);
});

test("removeClarificationBeforeToolExecution keeps clarification if followed by user reply instead of tool call", () => {
  const history = [
    { type: "message", role: "user", content: [{ text: "fix it" }] },
    {
      type: "message",
      role: "assistant",
      content: [{ text: "Would you like me to continue?" }],
    },
    { type: "message", role: "user", content: [{ text: "yes" }] },
  ];
  const result = removeClarificationBeforeToolExecution(history);
  assert.equal(result.length, 3);
});

test("removeClarificationBeforeToolExecution preserves non-clarification assistant messages", () => {
  const history = [
    { type: "message", role: "assistant", content: [{ text: "Here is the result." }] },
    { type: "function_call", callId: "c1", name: "edit" },
  ];
  const result = removeClarificationBeforeToolExecution(history);
  assert.equal(result.length, 2);
});

test("removeClarificationBeforeToolExecution handles non-array input", () => {
  assert.deepEqual(removeClarificationBeforeToolExecution(null), []);
});
