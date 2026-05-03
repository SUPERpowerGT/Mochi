const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRunTrace,
  finalizeRunTrace,
  recordAgentUpdate,
  recordApprovalRequested,
  recordApprovalResolved,
  recordToolCalled,
  recordToolOutput,
  recordSubagentRun,
  describeToolOutput,
  getStreamToolCallId,
} = require("../../src/runtime/support/run_trace_recorder");

test("createRunTrace has expected starting shape", () => {
  const trace = createRunTrace("hello");
  assert.equal(trace.prompt, "hello");
  assert.equal(trace.status, "running");
  assert.deepEqual(trace.toolCalls, []);
  assert.deepEqual(trace.approvals, []);
  assert.deepEqual(trace.subagentRuns, []);
  assert.deepEqual(trace.lifecycleEvents, []);
  assert.ok(trace.startedAt);
});

test("recordAgentUpdate appends to agentUpdates", () => {
  const trace = createRunTrace("p");
  recordAgentUpdate(trace, "Coding");
  assert.equal(trace.agentUpdates.length, 1);
  assert.equal(trace.agentUpdates[0].agent, "Coding");
});

test("recordToolCalled adds a started call entry", () => {
  const trace = createRunTrace("p");
  recordToolCalled(trace, { toolName: "read_file", callId: "c1", args: { path: "foo" } });
  assert.equal(trace.toolCalls.length, 1);
  assert.equal(trace.toolCalls[0].status, "started");
  assert.equal(trace.toolCalls[0].callId, "c1");
});

test("recordToolOutput marks matching call as completed", () => {
  const trace = createRunTrace("p");
  recordToolCalled(trace, { toolName: "read_file", callId: "c1", args: {} });
  recordToolOutput(trace, {
    toolName: "read_file",
    callId: "c1",
    output: { ok: true, action: "read_file", path: "foo.js", message: "done" },
  });
  assert.equal(trace.toolCalls.length, 1);
  assert.equal(trace.toolCalls[0].status, "completed");
  assert.equal(trace.toolCalls[0].path, "foo.js");
});

test("recordToolOutput marks call as failed when ok=false", () => {
  const trace = createRunTrace("p");
  recordToolCalled(trace, { toolName: "write_file", callId: "c2", args: {} });
  recordToolOutput(trace, {
    toolName: "write_file",
    callId: "c2",
    output: { ok: false, message: "oops" },
  });
  assert.equal(trace.toolCalls[0].status, "failed");
});

test("recordApprovalRequested and recordApprovalResolved cycle", () => {
  const trace = createRunTrace("p");
  const id = recordApprovalRequested(trace, {
    tool: "delete_file",
    action: "delete_file",
    relativePath: "foo",
  });
  assert.ok(id);
  assert.equal(trace.approvals[0].status, "requested");
  recordApprovalResolved(trace, id, true);
  assert.equal(trace.approvals[0].status, "approved");
});

test("recordApprovalResolved records denial and error", () => {
  const trace = createRunTrace("p");
  const id = recordApprovalRequested(trace, { tool: "delete_dir" });
  recordApprovalResolved(trace, id, false, new Error("denied"));
  assert.equal(trace.approvals[0].status, "denied");
  assert.equal(trace.approvals[0].error, "denied");
});

test("recordSubagentRun deep-copies the subagent run", () => {
  const trace = createRunTrace("p");
  const subagent = {
    agentKey: "coding",
    trace: { toolCalls: [{ name: "read_file" }] },
  };
  recordSubagentRun(trace, subagent);
  subagent.trace.toolCalls[0].name = "mutated";
  assert.equal(trace.subagentRuns[0].trace.toolCalls[0].name, "read_file");
});

test("finalizeRunTrace sets status, finishedAt, verification", () => {
  const trace = createRunTrace("p");
  const out = finalizeRunTrace(trace, { status: "completed", reply: "hi" });
  assert.equal(out.status, "completed");
  assert.ok(out.finishedAt);
  assert.equal(out.replyPreview, "hi");
  assert.ok(out.verification);
});

test("describeToolOutput prefers summary, falls back to message", () => {
  assert.equal(describeToolOutput({ summary: "S" }), "S");
  assert.equal(describeToolOutput({ message: "M" }), "M");
  assert.equal(describeToolOutput(null), "");
});

test("describeToolOutput truncates long strings", () => {
  const out = describeToolOutput("x".repeat(300));
  assert.ok(out.endsWith("..."));
  assert.ok(out.length <= 140);
});

test("getStreamToolCallId prefers rawItem.callId", () => {
  assert.equal(getStreamToolCallId({}, { callId: "a", call_id: "b" }), "a");
  assert.equal(getStreamToolCallId({}, { call_id: "b" }), "b");
  assert.equal(getStreamToolCallId({ id: "x" }, {}), "x");
  assert.equal(getStreamToolCallId({}, {}), "");
});
