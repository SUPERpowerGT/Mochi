const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasExplicitDestructiveApproval,
  evaluateFileOperationApproval,
} = require("../../src/runtime/support/approval_policy");

test("hasExplicitDestructiveApproval detects English confirmations", () => {
  assert.equal(hasExplicitDestructiveApproval("I confirm"), true);
  assert.equal(hasExplicitDestructiveApproval("please delete it"), true);
  assert.equal(hasExplicitDestructiveApproval("yes, delete the file"), true);
  assert.equal(hasExplicitDestructiveApproval("go ahead and remove it"), true);
});

test("hasExplicitDestructiveApproval detects Chinese confirmations", () => {
  assert.equal(hasExplicitDestructiveApproval("我确认删除"), true);
  assert.equal(hasExplicitDestructiveApproval("确认清空这个文件"), true);
  assert.equal(hasExplicitDestructiveApproval("请直接删除"), true);
  assert.equal(hasExplicitDestructiveApproval("允许覆盖"), true);
});

test("hasExplicitDestructiveApproval returns false for ambiguous prompts", () => {
  assert.equal(hasExplicitDestructiveApproval("maybe delete it"), false);
  assert.equal(hasExplicitDestructiveApproval("can you delete?"), false);
  assert.equal(hasExplicitDestructiveApproval(""), false);
});

test("evaluateFileOperationApproval blocks delete_file without confirmation", () => {
  const result = evaluateFileOperationApproval({
    action: "delete_file",
    relativePath: "foo.txt",
    prompt: "get rid of this",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "explicit-confirmation-required-for-delete");
  assert.equal(result.approvalRequest.action, "delete_file");
});

test("evaluateFileOperationApproval allows delete_file with confirmation", () => {
  const result = evaluateFileOperationApproval({
    action: "delete_file",
    relativePath: "foo.txt",
    prompt: "我确认删除",
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "delete-confirmed");
});

test("evaluateFileOperationApproval blocks delete_dir without confirmation", () => {
  const result = evaluateFileOperationApproval({
    action: "delete_dir",
    relativePath: "old/",
    prompt: "clean up",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "explicit-confirmation-required-for-directory-delete");
});

test("evaluateFileOperationApproval blocks clearing a file without confirmation", () => {
  const result = evaluateFileOperationApproval({
    action: "write_file",
    relativePath: "notes.md",
    prompt: "empty it",
    targetExists: true,
    existingContent: "previous content",
    nextContent: "",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "explicit-confirmation-required-for-clear");
});

test("evaluateFileOperationApproval allows normal overwrite", () => {
  const result = evaluateFileOperationApproval({
    action: "write_file",
    relativePath: "notes.md",
    prompt: "update it",
    targetExists: true,
    existingContent: "old",
    nextContent: "new",
  });
  assert.equal(result.allowed, true);
});

test("evaluateFileOperationApproval allows new file writes without approval", () => {
  const result = evaluateFileOperationApproval({
    action: "write_file",
    relativePath: "new.md",
    prompt: "create new doc",
    targetExists: false,
    existingContent: "",
    nextContent: "hello",
  });
  assert.equal(result.allowed, true);
});

test("evaluateFileOperationApproval returns a human-readable message on block", () => {
  const result = evaluateFileOperationApproval({
    action: "delete_file",
    relativePath: "foo.txt",
    prompt: "delete",
  });
  assert.ok(result.message.includes("foo.txt"));
  assert.ok(result.message.toLowerCase().includes("approval"));
});
