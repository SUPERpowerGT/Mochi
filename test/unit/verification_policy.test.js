const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeRunVerification } = require("../../src/runtime/support/verification_policy");

test("analyzeRunVerification reports not_needed when no file changes", () => {
  const result = analyzeRunVerification({ toolCalls: [] });
  assert.equal(result.needed, false);
  assert.equal(result.status, "not_needed");
  assert.deepEqual(result.changedPaths, []);
});

test("analyzeRunVerification reports not_run when file changed but no command ran", () => {
  const trace = {
    toolCalls: [
      {
        name: "write_file",
        status: "completed",
        output: { ok: true, action: "write_file", path: "foo.js" },
      },
    ],
  };
  const result = analyzeRunVerification(trace);
  assert.equal(result.needed, true);
  assert.equal(result.status, "not_run");
  assert.deepEqual(result.changedPaths, ["foo.js"]);
});

test("analyzeRunVerification reports passed when verification command succeeds", () => {
  const trace = {
    toolCalls: [
      {
        name: "write_file",
        status: "completed",
        output: { ok: true, action: "write_file", path: "foo.js" },
      },
      {
        name: "run_command",
        status: "completed",
        output: {
          ok: true,
          action: "run_command",
          data: { command: "npm", args: ["test"], exitCode: 0 },
        },
      },
    ],
  };
  const result = analyzeRunVerification(trace);
  assert.equal(result.status, "passed");
});

test("analyzeRunVerification reports failed when command failed", () => {
  const trace = {
    toolCalls: [
      {
        name: "write_file",
        status: "completed",
        output: { ok: true, action: "write_file", path: "foo.js" },
      },
      {
        name: "run_command",
        status: "failed",
        output: { ok: false, action: "run_command", data: { command: "npm", args: ["test"], exitCode: 1 } },
      },
    ],
  };
  const result = analyzeRunVerification(trace);
  assert.equal(result.status, "failed");
});

test("analyzeRunVerification reports denied when command was not run (approval)", () => {
  const trace = {
    toolCalls: [
      {
        name: "write_file",
        status: "completed",
        output: { ok: true, action: "write_file", path: "foo.js" },
      },
      {
        name: "run_command",
        status: "completed",
        output: {
          ok: false,
          action: "run_command",
          data: { notRun: true, command: "npm", args: ["test"] },
        },
      },
    ],
  };
  const result = analyzeRunVerification(trace);
  assert.equal(result.status, "denied");
});

test("analyzeRunVerification deduplicates changedPaths", () => {
  const trace = {
    toolCalls: [
      {
        name: "write_file",
        status: "completed",
        output: { ok: true, action: "write_file", path: "foo.js" },
      },
      {
        name: "append_file",
        status: "completed",
        output: { ok: true, action: "append_file", path: "foo.js" },
      },
    ],
  };
  const result = analyzeRunVerification(trace);
  assert.deepEqual(result.changedPaths, ["foo.js"]);
});

test("analyzeRunVerification ignores non-mutation tools", () => {
  const trace = {
    toolCalls: [
      { name: "list_files", status: "completed", output: { ok: true, action: "list_files" } },
    ],
  };
  const result = analyzeRunVerification(trace);
  assert.equal(result.needed, false);
});
