const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getHistoryItemCallId,
  isFunctionCallItem,
  isFunctionCallResultItem,
  stripLegacyInjectedContext,
  sanitizeHistoryItem,
  dropUnpairedToolHistoryItems,
  sanitizeStoredHistory,
} = require("../../src/runtime/support/history_sanitizer");

test("getHistoryItemCallId handles camelCase and snake_case keys", () => {
  assert.equal(getHistoryItemCallId({ callId: "abc" }), "abc");
  assert.equal(getHistoryItemCallId({ call_id: "xyz" }), "xyz");
  assert.equal(getHistoryItemCallId(null), null);
  assert.equal(getHistoryItemCallId({}), null);
});

test("isFunctionCallItem and isFunctionCallResultItem recognise types", () => {
  assert.equal(isFunctionCallItem({ type: "function_call" }), true);
  assert.equal(isFunctionCallItem({ type: "message" }), false);
  assert.equal(isFunctionCallResultItem({ type: "function_call_result" }), true);
  assert.equal(isFunctionCallResultItem({}), false);
});

test("stripLegacyInjectedContext removes legacy memory section", () => {
  const text = "Hello\n\n---\nMemory context:\nstuff";
  assert.equal(stripLegacyInjectedContext(text), "Hello");
});

test("stripLegacyInjectedContext removes legacy editor section", () => {
  const text = "Do it\n\n---\nEditor context:\nselection";
  assert.equal(stripLegacyInjectedContext(text), "Do it");
});

test("stripLegacyInjectedContext returns original if no markers", () => {
  assert.equal(stripLegacyInjectedContext("plain text"), "plain text");
  assert.equal(stripLegacyInjectedContext(""), "");
});

test("sanitizeHistoryItem cleans user message content", () => {
  const item = {
    type: "message",
    role: "user",
    content: [
      { text: "hello\n\n---\nMemory context:\ndata" },
    ],
  };
  const sanitized = sanitizeHistoryItem(item);
  assert.notEqual(sanitized, item);
  assert.equal(sanitized.content[0].text, "hello");
});

test("sanitizeHistoryItem returns input unchanged for non-user items", () => {
  const item = { type: "message", role: "assistant", content: [{ text: "hi" }] };
  assert.equal(sanitizeHistoryItem(item), item);
});

test("dropUnpairedToolHistoryItems removes orphan tool calls", () => {
  const history = [
    { type: "function_call", callId: "1", name: "read" },
    { type: "function_call_result", call_id: "1", output: { ok: true } },
    { type: "function_call", callId: "2", name: "write" },
  ];
  const result = dropUnpairedToolHistoryItems(history);
  assert.equal(result.length, 2);
  assert.equal(result[0].callId, "1");
});

test("dropUnpairedToolHistoryItems removes orphan tool results", () => {
  const history = [
    { type: "function_call_result", callId: "99", output: {} },
    { type: "message", role: "user", content: [{ text: "hi" }] },
  ];
  const result = dropUnpairedToolHistoryItems(history);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "message");
});

test("sanitizeStoredHistory reports changed when items are stripped", () => {
  const history = [
    {
      type: "message",
      role: "user",
      content: [{ text: "hi\n\n---\nMemory context:\nX" }],
    },
    { type: "function_call_result", callId: "zzz", output: {} },
  ];
  const { history: out, changed } = sanitizeStoredHistory(history);
  assert.equal(changed, true);
  assert.equal(out.length, 1);
  assert.equal(out[0].content[0].text, "hi");
});

test("sanitizeStoredHistory handles non-array input", () => {
  const { history, changed } = sanitizeStoredHistory(null);
  assert.deepEqual(history, []);
  assert.equal(changed, false);
});
