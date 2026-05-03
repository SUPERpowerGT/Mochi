const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractTextDelta,
  mapStreamEventToActivity,
} = require("../../src/runtime/support/stream_event_mapper");

test("extractTextDelta returns text for output_text_delta", () => {
  const event = {
    type: "raw_model_stream_event",
    data: { type: "output_text_delta", delta: "hello" },
  };
  assert.equal(extractTextDelta(event), "hello");
});

test("extractTextDelta returns empty string for other events", () => {
  assert.equal(extractTextDelta({ type: "other" }), "");
  assert.equal(extractTextDelta(null), "");
  assert.equal(
    extractTextDelta({
      type: "raw_model_stream_event",
      data: { type: "something_else" },
    }),
    ""
  );
});

test("mapStreamEventToActivity handles agent_updated_stream_event", () => {
  const result = mapStreamEventToActivity({
    type: "agent_updated_stream_event",
    agent: { name: "Coding Agent" },
  });
  assert.equal(result.kind, "agent");
  assert.match(result.text, /Coding Agent/);
});

test("mapStreamEventToActivity handles tool_called event", () => {
  const result = mapStreamEventToActivity({
    type: "run_item_stream_event",
    name: "tool_called",
    item: { rawItem: { name: "read_file", arguments: {} } },
  });
  assert.equal(result.kind, "tool");
  assert.match(result.text, /Calling read_file/);
});

test("mapStreamEventToActivity handles tool_output event", () => {
  const result = mapStreamEventToActivity({
    type: "run_item_stream_event",
    name: "tool_output",
    item: {
      rawItem: { name: "read_file" },
      output: { ok: true, summary: "loaded foo.js" },
    },
  });
  assert.equal(result.kind, "tool");
  assert.match(result.text, /loaded foo.js/);
});

test("mapStreamEventToActivity handles tool_approval_requested event", () => {
  const result = mapStreamEventToActivity({
    type: "run_item_stream_event",
    name: "tool_approval_requested",
    item: { rawItem: { name: "delete_file" } },
  });
  assert.equal(result.kind, "approval");
  assert.match(result.text, /Waiting for approval/);
});

test("mapStreamEventToActivity handles handoff events", () => {
  const a = mapStreamEventToActivity({
    type: "run_item_stream_event",
    name: "handoff_requested",
    item: {},
  });
  const b = mapStreamEventToActivity({
    type: "run_item_stream_event",
    name: "handoff_occurred",
    item: {},
  });
  assert.equal(a.kind, "agent");
  assert.equal(b.kind, "agent");
});

test("mapStreamEventToActivity returns null for unrecognised events", () => {
  assert.equal(mapStreamEventToActivity(null), null);
  assert.equal(mapStreamEventToActivity({ type: "unknown" }), null);
});

test("mapStreamEventToActivity returns reasoning for reasoning_item_created", () => {
  const result = mapStreamEventToActivity({
    type: "run_item_stream_event",
    name: "reasoning_item_created",
    item: {},
  });
  assert.equal(result.kind, "reasoning");
});
