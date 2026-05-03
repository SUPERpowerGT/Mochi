const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SESSION_COMPACTION_POLICY,
  compactSessionHistory,
} = require("../../src/runtime/memory/session_compactor");

function makeUserMessage(text) {
  return { type: "message", role: "user", content: [{ text }] };
}

function makeAssistantMessage(text) {
  return { type: "message", role: "assistant", content: [{ text }] };
}

test("compactSessionHistory is a no-op when history is under threshold", () => {
  const session = {
    history: [makeUserMessage("hi"), makeAssistantMessage("hello")],
    summary: "",
  };
  const { changed } = compactSessionHistory(session, {
    compactWhenHistoryItemsOver: 10,
    keepRecentHistoryItems: 5,
  });
  assert.equal(changed, false);
  assert.equal(session.history.length, 2);
});

test("compactSessionHistory keeps most recent N items and writes summary", () => {
  const history = [];
  for (let i = 0; i < 30; i += 1) {
    history.push(makeUserMessage(`q ${i}`));
    history.push(makeAssistantMessage(`a ${i}`));
  }
  const session = { history, summary: "" };
  const { changed } = compactSessionHistory(session, {
    compactWhenHistoryItemsOver: 20,
    keepRecentHistoryItems: 6,
    maxSessionSummaryChars: 3000,
    maxCompactedItemChars: 80,
  });
  assert.equal(changed, true);
  assert.ok(session.history.length <= 10);
  assert.ok(session.summary.length > 0);
  assert.ok(session.compaction);
  assert.ok(session.compaction.compactedAt);
});

test("compactSessionHistory handles non-array history gracefully", () => {
  const session = { history: null };
  const { changed } = compactSessionHistory(session);
  assert.equal(changed, false);
});

test("compactSessionHistory respects DEFAULT_SESSION_COMPACTION_POLICY", () => {
  const n = DEFAULT_SESSION_COMPACTION_POLICY.compactWhenHistoryItemsOver + 10;
  const history = Array.from({ length: n }, (_, i) => makeUserMessage(`msg ${i}`));
  const session = { history, summary: "" };
  const { changed } = compactSessionHistory(session);
  assert.equal(changed, true);
  assert.ok(
    session.history.length <= DEFAULT_SESSION_COMPACTION_POLICY.keepRecentHistoryItems + 2
  );
});

test("compactSessionHistory preserves paired tool calls at the boundary", () => {
  const history = [];
  for (let i = 0; i < 30; i += 1) history.push(makeUserMessage(`m ${i}`));
  history.push({ type: "function_call", callId: "c1", name: "read_file" });
  history.push({ type: "function_call_result", callId: "c1", output: { ok: true } });
  history.push(makeAssistantMessage("final"));
  const session = { history, summary: "" };
  compactSessionHistory(session, {
    compactWhenHistoryItemsOver: 20,
    keepRecentHistoryItems: 4,
  });
  // Either both or neither of the call/result pair should remain in recent history
  const recentCallIds = session.history
    .filter((item) => item.callId === "c1")
    .map((item) => item.type);
  const hasCall = recentCallIds.includes("function_call");
  const hasResult = recentCallIds.includes("function_call_result");
  assert.equal(hasCall, hasResult);
});
