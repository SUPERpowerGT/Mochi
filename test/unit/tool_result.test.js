const test = require("node:test");
const assert = require("node:assert/strict");
const { createToolResult, truncateText } = require("../../src/runtime/tools/tool_result");

test("createToolResult sets required defaults", () => {
  const result = createToolResult({ ok: true, action: "read_file" });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "workspace");
  assert.equal(result.action, "read_file");
  assert.equal(result.path, "");
  assert.equal(result.data, null);
});

test("createToolResult coerces ok to boolean", () => {
  assert.equal(createToolResult({ ok: 1, action: "x" }).ok, true);
  assert.equal(createToolResult({ ok: 0, action: "x" }).ok, false);
});

test("createToolResult falls back summary to message", () => {
  const result = createToolResult({ ok: true, action: "x", message: "done" });
  assert.equal(result.summary, "done");
});

test("createToolResult keeps explicit summary", () => {
  const result = createToolResult({
    ok: true,
    action: "x",
    message: "msg",
    summary: "sum",
  });
  assert.equal(result.summary, "sum");
});

test("truncateText returns input unchanged when shorter than limit", () => {
  assert.equal(truncateText("hello", 100), "hello");
});

test("truncateText truncates with marker", () => {
  const result = truncateText("x".repeat(500), 100);
  assert.ok(result.endsWith("...[truncated]"));
  assert.ok(result.length <= 100);
  assert.ok(result.length >= 90);
});

test("truncateText returns empty string for non-string input", () => {
  assert.equal(truncateText(null), "");
  assert.equal(truncateText(42), "");
});
