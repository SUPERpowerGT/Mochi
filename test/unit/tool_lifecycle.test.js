const test = require("node:test");
const assert = require("node:assert/strict");
const { recordRunStop, wrapToolsWithLifecycle } = require("../../src/runtime/support/tool_lifecycle");

test("wrapToolsWithLifecycle returns an array of wrapped tools", () => {
  const tools = [
    { name: "read_file", execute: async () => ({ ok: true }) },
    { name: "write_file", execute: async () => ({ ok: true }) },
  ];
  const wrapped = wrapToolsWithLifecycle(tools);
  assert.equal(wrapped.length, 2);
  assert.equal(wrapped[0].name, "read_file");
  assert.equal(typeof wrapped[0].execute, "function");
});

test("wrapped tool records preToolUse and postToolUse events on success", async () => {
  const runState = { trace: { lifecycleEvents: [] } };
  const tool = {
    name: "write_file",
    execute: async () => ({ ok: true, action: "write_file", path: "foo.js" }),
  };
  const [wrapped] = wrapToolsWithLifecycle([tool], { getRunState: () => runState });
  await wrapped.execute({ relativePath: "foo.js", content: "hi" });
  assert.equal(runState.trace.lifecycleEvents.length, 2);
  assert.equal(runState.trace.lifecycleEvents[0].phase, "preToolUse");
  assert.equal(runState.trace.lifecycleEvents[1].phase, "postToolUse");
  assert.equal(runState.trace.lifecycleEvents[1].ok, true);
});

test("wrapped tool returns blocked output when access is denied", async () => {
  const runState = { trace: { lifecycleEvents: [] } };
  const tool = { name: "delete_file", execute: async () => ({ ok: true }) };
  const [wrapped] = wrapToolsWithLifecycle([tool], {
    getRunState: () => runState,
    requestToolAccess: () => ({ allowed: false, message: "busy" }),
  });
  const output = await wrapped.execute({ relativePath: "foo.js" });
  assert.equal(output.ok, false);
  assert.match(output.message, /busy/);
  assert.equal(output.data.blockedByToolRun, true);
});

test("wrapped tool sanitises args (replaces content with byte count)", async () => {
  const runState = { trace: { lifecycleEvents: [] } };
  const tool = { name: "write_file", execute: async () => ({ ok: true }) };
  const [wrapped] = wrapToolsWithLifecycle([tool], { getRunState: () => runState });
  await wrapped.execute({ relativePath: "a", content: "hello" });
  const preEvent = runState.trace.lifecycleEvents[0];
  assert.equal(preEvent.args.contentBytes, 5);
  assert.equal(preEvent.args.content, undefined);
});

test("wrapped tool classifies delete_file as high risk", async () => {
  const runState = { trace: { lifecycleEvents: [] } };
  const tool = { name: "delete_file", execute: async () => ({ ok: true }) };
  const [wrapped] = wrapToolsWithLifecycle([tool], { getRunState: () => runState });
  await wrapped.execute({ relativePath: "foo" });
  assert.equal(runState.trace.lifecycleEvents[0].risk, "high");
});

test("wrapped tool classifies run_command as medium risk requiring approval", async () => {
  const runState = { trace: { lifecycleEvents: [] } };
  const tool = { name: "run_command", execute: async () => ({ ok: true }) };
  const [wrapped] = wrapToolsWithLifecycle([tool], { getRunState: () => runState });
  await wrapped.execute({ command: "npm", args: ["test"] });
  assert.equal(runState.trace.lifecycleEvents[0].risk, "medium");
  assert.equal(runState.trace.lifecycleEvents[0].policy.requiresApproval, true);
});

test("recordRunStop summarises lifecycle into trace.lifecycle", () => {
  const trace = {
    toolCalls: [],
    verification: { status: "passed" },
    lifecycleEvents: [
      { phase: "preToolUse", risk: "high", policy: { mutatesWorkspace: true, requiresApproval: true } },
      { phase: "postToolUse", ok: true, policy: {} },
    ],
  };
  const lifecycle = recordRunStop(trace);
  assert.equal(lifecycle.toolUseCount, 1);
  assert.equal(lifecycle.highRiskToolUseCount, 1);
  assert.equal(lifecycle.approvalRequiredToolUseCount, 1);
  assert.equal(lifecycle.verificationStatus, "passed");
  assert.ok(lifecycle.stoppedAt);
});
