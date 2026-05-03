const test = require("node:test");
const assert = require("node:assert/strict");

const { summarizeRunTrace } = require("../../src/runtime/support/trace_summary");
const { analyzeRunVerification } = require("../../src/runtime/support/verification_policy");

test("trace summary records denied high-risk tool use instead of reporting success", () => {
  const summary = summarizeRunTrace({
    status: "completed",
    approvals: [
      {
        id: "approval-1",
        status: "denied",
        tool: "delete_file",
      },
    ],
    lifecycleEvents: [
      {
        phase: "preToolUse",
        tool: "delete_file",
        risk: "high",
        policy: {
          mutatesWorkspace: true,
          requiresApproval: true,
        },
      },
      {
        phase: "postToolUse",
        tool: "delete_file",
        risk: "high",
        ok: false,
        policy: {
          approvalDenied: true,
        },
      },
    ],
  });

  assert.equal(summary.approvals.denied, 1);
  assert.equal(summary.tools.highRisk, 1);
  assert.equal(summary.tools.approvalDenied, 1);
  assert.match(summary.outcome, /denied|failed/i);
});

test("verification policy reports denied when mutation verification was blocked by approval", () => {
  const result = analyzeRunVerification({
    toolCalls: [
      {
        name: "write_file",
        status: "completed",
        output: {
          ok: true,
          action: "write_file",
          path: "src/extension/extension.js",
        },
      },
      {
        name: "run_command",
        status: "completed",
        output: {
          ok: false,
          action: "run_command",
          data: {
            command: "npm",
            args: ["test"],
            notRun: true,
          },
        },
      },
    ],
  });

  assert.equal(result.needed, true);
  assert.equal(result.status, "denied");
});
