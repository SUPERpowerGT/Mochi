const test = require("node:test");
const assert = require("node:assert/strict");
const {
  nowIso,
  createWorkspaceId,
  createSessionId,
  deriveTaskTitle,
  normalizePrompt,
  extractPromptKeywords,
  scorePromptOverlap,
  isLikelyFollowUpPrompt,
  isMemoryRecallPrompt,
  findBestTaskMatch,
  detectPreferredLanguage,
} = require("../../src/runtime/memory/memory_utils");

test("nowIso returns a valid ISO-8601 timestamp", () => {
  const value = nowIso();
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.ok(!Number.isNaN(new Date(value).getTime()));
});

test("createWorkspaceId falls back to no-workspace for empty input", () => {
  assert.equal(createWorkspaceId(""), "no-workspace");
  assert.equal(createWorkspaceId(null), "no-workspace");
  assert.equal(createWorkspaceId(undefined), "no-workspace");
});

test("createWorkspaceId is deterministic for the same root", () => {
  const a = createWorkspaceId("/Users/dev/project");
  const b = createWorkspaceId("/Users/dev/project");
  assert.equal(a, b);
  assert.match(a, /^workspace:[0-9a-f]{40}$/);
});

test("createWorkspaceId produces different ids for different roots", () => {
  const a = createWorkspaceId("/Users/dev/project-a");
  const b = createWorkspaceId("/Users/dev/project-b");
  assert.notEqual(a, b);
});

test("createSessionId combines base session id and workspace id", () => {
  assert.equal(createSessionId("primary", "workspace:abc"), "primary:workspace:abc");
});

test("deriveTaskTitle trims whitespace and truncates to 80 chars", () => {
  assert.equal(deriveTaskTitle("  hello   world  "), "hello world");
  const long = "x".repeat(200);
  assert.equal(deriveTaskTitle(long).length, 80);
});

test("deriveTaskTitle returns Untitled task for empty input", () => {
  assert.equal(deriveTaskTitle(""), "Untitled task");
  assert.equal(deriveTaskTitle(null), "Untitled task");
  assert.equal(deriveTaskTitle("   \n\t  "), "Untitled task");
});

test("normalizePrompt lowercases and collapses whitespace", () => {
  assert.equal(normalizePrompt("  Hello    WORLD\n"), "hello world");
  assert.equal(normalizePrompt(null), "");
});

test("extractPromptKeywords handles ASCII words", () => {
  const keywords = extractPromptKeywords("Fix the login_handler bug now");
  assert.ok(keywords.includes("fix"));
  assert.ok(keywords.includes("login_handler"));
  assert.ok(keywords.includes("bug"));
  assert.ok(!keywords.includes("a"));
});

test("extractPromptKeywords handles CJK bigrams", () => {
  const keywords = extractPromptKeywords("优化代码结构");
  assert.ok(keywords.some((k) => k.length === 2));
  assert.ok(keywords.includes("优化") || keywords.includes("代码"));
});

test("extractPromptKeywords returns empty array for empty input", () => {
  assert.deepEqual(extractPromptKeywords(""), []);
  assert.deepEqual(extractPromptKeywords(null), []);
});

test("extractPromptKeywords deduplicates", () => {
  const keywords = extractPromptKeywords("bug bug bug BUG");
  const bugCount = keywords.filter((k) => k === "bug").length;
  assert.equal(bugCount, 1);
});

test("scorePromptOverlap returns 0 when one side is empty", () => {
  assert.equal(scorePromptOverlap("hello world", ""), 0);
  assert.equal(scorePromptOverlap("", "hello"), 0);
});

test("scorePromptOverlap returns 1 for identical prompts", () => {
  assert.equal(scorePromptOverlap("fix bug login", "fix bug login"), 1);
});

test("scorePromptOverlap returns partial score for partial match", () => {
  const score = scorePromptOverlap("fix the login bug", "fix the logout bug");
  assert.ok(score > 0 && score < 1);
});

test("isLikelyFollowUpPrompt detects Chinese follow-up markers", () => {
  assert.equal(isLikelyFollowUpPrompt("继续"), true);
  assert.equal(isLikelyFollowUpPrompt("然后呢"), true);
  assert.equal(isLikelyFollowUpPrompt("还有一个问题"), true);
});

test("isLikelyFollowUpPrompt detects English follow-up markers", () => {
  assert.equal(isLikelyFollowUpPrompt("also, add logging"), true);
  assert.equal(isLikelyFollowUpPrompt("then fix the bug"), true);
  assert.equal(isLikelyFollowUpPrompt("what about tests?"), true);
});

test("isLikelyFollowUpPrompt returns false for new goals", () => {
  assert.equal(isLikelyFollowUpPrompt("write a new login page"), false);
  assert.equal(isLikelyFollowUpPrompt(""), false);
});

test("isMemoryRecallPrompt detects recall phrases", () => {
  assert.equal(isMemoryRecallPrompt("上次问你的那个问题"), true);
  assert.equal(isMemoryRecallPrompt("remember what I said earlier"), true);
  assert.equal(isMemoryRecallPrompt("刚才不对"), true);
});

test("isMemoryRecallPrompt returns false for non-recall prompts", () => {
  assert.equal(isMemoryRecallPrompt("write a report"), false);
  assert.equal(isMemoryRecallPrompt(""), false);
});

test("findBestTaskMatch picks task with highest overlap", () => {
  const tasks = [
    { id: "a", goal: "fix the login bug", lastUserPrompt: "" },
    { id: "b", goal: "write documentation", lastUserPrompt: "" },
    { id: "c", goal: "refactor runtime memory", lastUserPrompt: "" },
  ];
  const { task, score } = findBestTaskMatch(tasks, "fix login bug now");
  assert.equal(task.id, "a");
  assert.ok(score > 0);
});

test("findBestTaskMatch returns null when no tasks match", () => {
  const { task, score } = findBestTaskMatch([], "anything");
  assert.equal(task, null);
  assert.equal(score, 0);
});

test("findBestTaskMatch handles non-array input defensively", () => {
  const { task, score } = findBestTaskMatch(null, "fix login");
  assert.equal(task, null);
  assert.equal(score, 0);
});

test("detectPreferredLanguage detects Chinese", () => {
  assert.equal(detectPreferredLanguage("你好"), "zh-CN");
  assert.equal(detectPreferredLanguage("fix 代码"), "zh-CN");
});

test("detectPreferredLanguage detects English", () => {
  assert.equal(detectPreferredLanguage("hello world"), "en");
});

test("detectPreferredLanguage returns null for ambiguous input", () => {
  assert.equal(detectPreferredLanguage("123 !!"), null);
  assert.equal(detectPreferredLanguage(""), null);
});
