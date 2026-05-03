const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyDelegation,
  buildDelegationGuidance,
} = require("../../src/runtime/support/delegation_policy");

test("classifyDelegation routes short simple prompts to direct", () => {
  const result = classifyDelegation("hi");
  assert.equal(result.route, "direct");
});

test("classifyDelegation routes explicit plan review to plan_reviewer", () => {
  const result = classifyDelegation("please review the plan before implementing");
  assert.equal(result.route, "subagent");
  assert.equal(result.suggestedAgent, "plan_reviewer");
});

test("classifyDelegation routes code review asks to review agent", () => {
  const result = classifyDelegation("do a code review of the changes and regression risks");
  assert.equal(result.route, "subagent");
  assert.equal(result.suggestedAgent, "review");
});

test("classifyDelegation routes complex coding work to coding agent", () => {
  const prompt =
    "implement a refactor that changes memory, session, task, and file handling inside the runtime";
  const result = classifyDelegation(prompt);
  assert.equal(result.route, "subagent");
  assert.equal(result.suggestedAgent, "coding");
});

test("classifyDelegation routes exploration work to repo_guide", () => {
  const prompt =
    "investigate the repository architecture and trace where session, task, and memory are wired together";
  const result = classifyDelegation(prompt);
  assert.equal(result.route, "subagent");
  assert.equal(result.suggestedAgent, "repo_guide");
});

test("classifyDelegation honours Chinese signals", () => {
  const prompt = "帮我审查改动和回归风险";
  const result = classifyDelegation(prompt);
  assert.equal(result.route, "subagent");
  assert.equal(result.suggestedAgent, "review");
});

test("classifyDelegation emits a reason and confidence", () => {
  const result = classifyDelegation("hello");
  assert.equal(typeof result.reason, "string");
  assert.ok(["low", "medium", "high"].includes(result.confidence));
});

test("buildDelegationGuidance returns empty string for direct route", () => {
  const guidance = buildDelegationGuidance({ route: "direct" });
  assert.equal(guidance, "");
});

test("buildDelegationGuidance includes subagent name and confidence", () => {
  const guidance = buildDelegationGuidance({
    route: "subagent",
    suggestedAgent: "coding",
    confidence: "high",
    reason: "complex implementation",
  });
  assert.ok(guidance.includes("coding"));
  assert.ok(guidance.includes("high"));
  assert.ok(guidance.includes("complex implementation"));
});
