const fs = require("node:fs");
const path = require("node:path");
const { runTests } = require("./run_tests");

const repoRoot = path.join(__dirname, "..");
const startedAt = new Date();
let capturedOutput = "";

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = function writeStdout(chunk, encoding, callback) {
  capturedOutput += stringifyChunk(chunk, encoding);
  return originalStdoutWrite(chunk, encoding, callback);
};

process.stderr.write = function writeStderr(chunk, encoding, callback) {
  capturedOutput += stringifyChunk(chunk, encoding);
  return originalStderrWrite(chunk, encoding, callback);
};

process.on("exit", (code) => {
  const finishedAt = new Date();
  const summary = parseTapSummary(capturedOutput);
  const report = {
    command: "node ./scripts/run_tests.js test",
    ok: code === 0,
    status: code,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    summary,
    journeys: [
      "Install/package entry points",
      "First-run local model configuration",
      "Configured chat send",
      "Unconfigured chat guardrail",
      "Session create/switch/close",
      "Approval decision routing",
      "Slash command to memory controls",
      "Memory policy toggles",
      "Private current-window memory mode",
      "Current-window artifact deletion",
      "Runtime provider context from config",
      "Packaging ignore rules",
      "AI security guardrails for approval bypass and commit scanning",
    ],
  };

  const jsonPath = path.join(repoRoot, "test-report.json");
  const markdownPath = path.join(repoRoot, "test-report.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, formatMarkdownReport(report, capturedOutput), "utf8");
  originalStdoutWrite(`\nWrote ${path.relative(repoRoot, markdownPath)} and ${path.relative(repoRoot, jsonPath)}\n`);
});

runTests(["test"]);

function stringifyChunk(chunk, encoding) {
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString(typeof encoding === "string" ? encoding : "utf8");
  }
  return String(chunk || "");
}

function parseTapSummary(text) {
  const summary = {};
  for (const key of ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"]) {
    const match = text.match(new RegExp(`# ${key} (\\d+(?:\\.\\d+)?)`));
    if (match) {
      summary[key] = key === "duration_ms" ? Number(match[1]) : Number.parseInt(match[1], 10);
    }
  }
  return summary;
}

function formatMarkdownReport(report, output) {
  const lines = [
    "# Mochi Test Report",
    "",
    `- Command: \`${report.command}\``,
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Duration: ${report.durationMs}ms`,
    "",
    "## Summary",
    "",
    `- Tests: ${report.summary.tests ?? "unknown"}`,
    `- Passed: ${report.summary.pass ?? "unknown"}`,
    `- Failed: ${report.summary.fail ?? "unknown"}`,
    `- Skipped: ${report.summary.skipped ?? 0}`,
    "",
    "## Closed-Loop Journey Coverage",
    "",
    ...report.journeys.map((item) => `- ${item}`),
    "",
    "## Raw Output",
    "",
    "```text",
    output.trim(),
    "```",
    "",
  ];
  return lines.join("\n");
}
