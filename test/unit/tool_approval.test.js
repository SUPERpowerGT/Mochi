const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createApprovalDeniedResult,
  runWithApproval,
} = require("../../src/runtime/tools/tool_approval");

test("createApprovalDeniedResult returns an ok=false tool result", () => {
  const result = createApprovalDeniedResult({
    kind: "file",
    action: "delete_file",
    path: "foo.txt",
    message: "denied",
  });
  assert.equal(result.ok, false);
  assert.equal(result.action, "delete_file");
  assert.equal(result.path, "foo.txt");
  assert.equal(result.message, "denied");
});

test("runWithApproval runs directly when approval.allowed is true", async () => {
  const result = await runWithApproval({
    approval: { allowed: true },
    run: async () => "ok",
  });
  assert.equal(result, "ok");
});

test("runWithApproval runs directly when no approval is provided", async () => {
  const result = await runWithApproval({
    approval: null,
    run: async () => "direct",
  });
  assert.equal(result, "direct");
});

test("runWithApproval returns fallbackResult when requestApproval is missing", async () => {
  const result = await runWithApproval({
    approval: { allowed: false, approvalRequest: { reason: "x" } },
    requestApproval: null,
    fallbackResult: { ok: false, message: "no approver" },
    run: async () => "should-not-run",
  });
  assert.equal(result.message, "no approver");
});

test("runWithApproval proceeds when user approves", async () => {
  const result = await runWithApproval({
    approval: { allowed: false, approvalRequest: { reason: "x" } },
    requestApproval: async () => true,
    prompt: "ok",
    run: async () => "ran",
    deniedResult: { ok: false },
  });
  assert.equal(result, "ran");
});

test("runWithApproval returns deniedResult when user denies", async () => {
  const result = await runWithApproval({
    approval: { allowed: false, approvalRequest: { reason: "x" } },
    requestApproval: async () => false,
    prompt: "no",
    run: async () => "should-not-run",
    deniedResult: { ok: false, message: "denied" },
  });
  assert.equal(result.message, "denied");
});

test("runWithApproval supports function-valued deniedResult/fallbackResult", async () => {
  const result = await runWithApproval({
    approval: { allowed: false, approvalRequest: { reason: "x" } },
    requestApproval: async () => false,
    deniedResult: () => ({ ok: false, message: "dyn-denied" }),
    run: async () => "nope",
  });
  assert.equal(result.message, "dyn-denied");
});
