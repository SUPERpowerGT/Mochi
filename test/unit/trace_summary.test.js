const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeRunTrace } = require("../../src/runtime/support/trace_summary");

test("summarizeRunTrace returns null for non-object input", () => {
  assert.equal(summarizeRunTrace(null), null);
  assert.equal(summarizeRunTrace("nope"), null);
});

test("summarizeRunTrace counts approval statuses", () => {
  const trace = {
    status: "completed",
    toolCalls: [],
    approvals: [
      { status: "approved" },
      { status: "approved" },
      { status: "denied" },
      { status: "requested" },
    ],
  };
  const summary = summarizeRunTrace(trace);
  assert.equal(summary.approvals.approved, 2);
  assert.equal(summary.approvals.denied, 1);
  assert.equal(summary.approvals.pending, 1);
  assert.equal(summary.approvals.requested, 4);
});

test("summarizeRunTrace counts tool calls from lifecycle events", () => {
  const trace = {
    status: "completed",
    toolCalls: [],
    lifecycleEvents: [
      { phase: "preToolUse", risk: "high", tool: "delete_file", policy: { mutatesWorkspace: true, requiresApproval: true } },
      { phase: "preToolUse", risk: "low", tool: "read_file", policy: { mutatesWorkspace: false } },
      { phase: "postToolUse", ok: false, tool: "delete_file", policy: { approvalDenied: true } },
      { phase: "postToolUse", ok: true, tool: "read_file", policy: {} },
    ],
  };
  const summary = summarizeRunTrace(trace);
  assert.equal(summary.tools.total, 2);
  assert.equal(summary.tools.highRisk, 1);
  assert.equal(summary.tools.mutating, 1);
  assert.equal(summary.tools.failed, 1);
  assert.equal(summary.tools.approvalRequired, 1);
  assert.equal(summary.tools.approvalDenied, 1);
});

test("summarizeRunTrace falls back to toolCalls when no lifecycleEvents", () => {
  const trace = {
    status: "completed",
    toolCalls: [
      { name: "delete_file", status: "completed", output: { ok: true, action: "delete_file" } },
    ],
  };
  const summary = summarizeRunTrace(trace);
  assert.equal(summary.tools.total, 1);
  assert.equal(summary.tools.highRisk, 1);
});

test("summarizeRunTrace produces helpful outcome messages", () => {
  assert.match(
    summarizeRunTrace({ error: "boom", toolCalls: [], approvals: [] }).outcome,
    /failed/i
  );
  assert.match(
    summarizeRunTrace({
      status: "completed",
      toolCalls: [],
      approvals: [],
      verification: { needed: true, status: "passed" },
    }).outcome,
    /passed/i
  );
  assert.match(
    summarizeRunTrace({
      status: "completed",
      toolCalls: [],
      approvals: [],
      verification: { needed: true, status: "not_run" },
    }).outcome,
    /verification did not run/i
  );
});

test("summarizeRunTrace summarises subagent runs", () => {
  const trace = {
    status: "completed",
    toolCalls: [],
    approvals: [],
    subagentRuns: [
      {
        agentKey: "repo_guide",
        agentName: "Repo Guide",
        trace: { status: "completed", toolCalls: [{}, {}] },
        evidence: {
          toolUseCount: 2,
          usedWorkspaceTools: true,
          inspectedFiles: ["a.js"],
          listedPaths: ["src/"],
        },
        outputPreview: "...",
      },
    ],
  };
  const summary = summarizeRunTrace(trace);
  assert.equal(summary.subagents.length, 1);
  assert.equal(summary.subagents[0].agentKey, "repo_guide");
  assert.equal(summary.subagents[0].toolUseCount, 2);
  assert.equal(summary.subagents[0].usedWorkspaceTools, true);
});

test("summarizeRunTrace builds a policyTimeline from lifecycleEvents", () => {
  const trace = {
    status: "completed",
    toolCalls: [],
    approvals: [],
    lifecycleEvents: [
      { phase: "preToolUse", tool: "write_file", risk: "medium", policy: { decision: "observe", mutatesWorkspace: true, requiresApproval: false, requiresVerification: true } },
      { phase: "postToolUse", tool: "write_file", risk: "medium", ok: true, policy: { decision: "completed" } },
    ],
  };
  const summary = summarizeRunTrace(trace);
  assert.equal(summary.policyTimeline.length, 2);
  assert.equal(summary.policyTimeline[0].phase, "preToolUse");
  assert.equal(summary.policyTimeline[0].mutatesWorkspace, true);
});
