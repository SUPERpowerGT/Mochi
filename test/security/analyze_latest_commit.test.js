const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeCommitDiff,
  buildSecuritySummary,
  deriveRiskLevel,
  normalizeBaseUrl,
} = require("../../scripts/analyze_latest_commit");

function findingIds(findings) {
  return new Set(findings.map((finding) => finding.id));
}

test("latest commit analyzer detects likely secret exposure", () => {
  const findings = analyzeCommitDiff(`
diff --git a/src/config.js b/src/config.js
+ const apiKey = "sk-test123456789abcdef";
  `);

  assert.equal(findingIds(findings).has("secret-key"), true);
  assert.equal(deriveRiskLevel(findings), "high");
});

test("latest commit analyzer detects command execution and dynamic evaluation", () => {
  const findings = analyzeCommitDiff(`
+ const child_process = require("child_process");
+ eval(userInput);
  `);
  const ids = findingIds(findings);

  assert.equal(ids.has("command-exec"), true);
  assert.equal(ids.has("dangerous-eval"), true);
  assert.equal(deriveRiskLevel(findings), "high");
});

test("latest commit analyzer detects medium-risk SQL interpolation", () => {
  const findings = analyzeCommitDiff(`
+ const query = "SELECT * FROM users WHERE id = " + userId;
  `);

  assert.equal(findingIds(findings).has("sql-concat"), true);
  assert.equal(deriveRiskLevel(findings), "medium");
});

test("latest commit analyzer detects authentication bypass keywords", () => {
  const findings = analyzeCommitDiff(`
+ const skipAuth = true;
  `);

  assert.equal(findingIds(findings).has("auth-bypass"), true);
  assert.equal(deriveRiskLevel(findings), "high");
});

test("latest commit analyzer returns low risk when no high-signal pattern is found", () => {
  const findings = analyzeCommitDiff(`
+ const message = "hello";
  `);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, "no-critical-patterns");
  assert.equal(deriveRiskLevel(findings), "low");
});

test("latest commit analyzer builds a compact summary", () => {
  const findings = analyzeCommitDiff(`
+ eval(userInput);
  `);
  const summary = buildSecuritySummary({
    findings,
    riskLevel: deriveRiskLevel(findings),
    commitTitle: "feat: risky change",
  });

  assert.match(summary, /^feat: risky change:/);
  assert.match(summary, /Dynamic code execution detected/);
});

test("latest commit analyzer normalizes trailing slashes from identity API URL", () => {
  assert.equal(normalizeBaseUrl("http://127.0.0.1:4000/"), "http://127.0.0.1:4000");
});
