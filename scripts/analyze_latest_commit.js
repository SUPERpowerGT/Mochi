#!/usr/bin/env node

const { execFile } = require("child_process");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = args["workspace-root"]
    ? path.resolve(args["workspace-root"])
    : process.cwd();

  const config = await readMochiGitConfig(workspaceRoot);
  const identityApiBaseUrl = normalizeBaseUrl(
    args["identity-api-url"] || config.identityApiUrl || process.env.MOCHI_IDENTITY_API_URL || "http://127.0.0.1:4000"
  );

  const tenantId = args["tenant-id"] || config.tenantId || "local-dev";
  const userId = args["user-id"] || config.userId || "alice";
  const deviceId = args["device-id"] || config.deviceId || "this-machine";
  const authToken = args["auth-token"] || config.authToken || "";
  const workspaceLabel = args["workspace-label"] || path.basename(workspaceRoot) || workspaceRoot;
  const workspaceKey = `workspace-sync:${String(workspaceLabel).trim().toLowerCase()}`;

  if (!authToken) {
    throw new Error("Mochi auth token is not configured. Sign in from the VS Code extension first.");
  }

  const [{ stdout: commitHash }, { stdout: branchName }, { stdout: commitTitle }, { stdout: commitDiff }] = await Promise.all([
    runGitCommand(["rev-parse", "HEAD"], workspaceRoot),
    runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], workspaceRoot),
    runGitCommand(["log", "-1", "--pretty=%s"], workspaceRoot),
    runGitCommand(["show", "--stat", "--patch", "--format=fuller", "HEAD"], workspaceRoot),
  ]);

  const findings = analyzeCommitDiff(commitDiff);
  const riskLevel = deriveRiskLevel(findings);
  const summary = buildSecuritySummary({
    findings,
    riskLevel,
    commitTitle: commitTitle.trim(),
  });

  const payload = {
    tenantId,
    userId,
    deviceId,
    workspaceKey,
    workspaceLabel,
    commitHash: commitHash.trim(),
    branchName: branchName.trim(),
    commitTitle: commitTitle.trim(),
    riskLevel,
    findings,
    summary,
    payload: {
      analyzedAt: new Date().toISOString(),
      diffPreview: commitDiff.slice(0, 12000),
      source: "post-commit-hook",
    },
  };

  const response = await fetch(`${identityApiBaseUrl}/api/v1/commit-security-reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload commit security report: ${text || response.status}`);
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    commitHash: payload.commitHash,
    commitTitle: payload.commitTitle,
    riskLevel,
    findingCount: findings.length,
  })}\n`);
}

async function runGitCommand(args, cwd) {
  return execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function readMochiGitConfig(cwd) {
  const keys = {
    identityApiUrl: "mochi.identityApiUrl",
    tenantId: "mochi.tenantId",
    userId: "mochi.userId",
    deviceId: "mochi.deviceId",
    authToken: "mochi.authToken",
  };
  const result = {};

  await Promise.all(Object.entries(keys).map(async ([field, key]) => {
    try {
      const { stdout } = await runGitCommand(["config", "--local", "--get", key], cwd);
      result[field] = String(stdout || "").trim();
    } catch (error) {
      result[field] = "";
    }
  }));

  return result;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item || !item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function analyzeCommitDiff(diffText) {
  const text = String(diffText || "");
  const findings = [];
  const rules = [
    {
      id: "secret-key",
      severity: "high",
      pattern: /(OPENAI_API_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|AIza[0-9A-Za-z\-_]{20,}|sk-[A-Za-z0-9\-_]{12,})/,
      title: "Potential secret exposure",
      recommendation: "Move the secret to ignored environment files or a secret manager.",
    },
    {
      id: "command-exec",
      severity: "high",
      pattern: /(exec\(|spawn\(|execSync\(|child_process)/,
      title: "Potential command execution path",
      recommendation: "Validate all user-controlled inputs before shell execution.",
    },
    {
      id: "dangerous-eval",
      severity: "high",
      pattern: /(eval\(|new Function\(|vm\.runIn)/,
      title: "Dynamic code execution detected",
      recommendation: "Avoid dynamic execution or isolate it with strict validation.",
    },
    {
      id: "sql-concat",
      severity: "medium",
      pattern: /(SELECT|INSERT|UPDATE|DELETE).*(\+|\$\{)/,
      title: "Potential SQL string concatenation",
      recommendation: "Prefer parameterized queries instead of interpolated SQL.",
    },
    {
      id: "auth-bypass",
      severity: "high",
      pattern: /(skipAuth|bypassAuth|auth\s*=\s*false|allowAnonymous)/i,
      title: "Possible authentication bypass",
      recommendation: "Review whether authentication gates were accidentally weakened.",
    },
    {
      id: "path-traversal",
      severity: "medium",
      pattern: /(\.\.\/|path\.join\(|fs\.(readFile|writeFile|rm|unlink))/,
      title: "Potential unsafe filesystem access",
      recommendation: "Normalize and validate file paths before filesystem operations.",
    },
  ];

  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (!match) {
      continue;
    }
    findings.push({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      sample: String(match[0]).slice(0, 200),
      recommendation: rule.recommendation,
    });
  }

  if (!findings.length) {
    findings.push({
      id: "no-critical-patterns",
      severity: "low",
      title: "No high-signal vulnerability patterns detected",
      sample: "Heuristic scan found no known dangerous patterns in the latest commit.",
      recommendation: "Still review logic changes and authorization boundaries manually.",
    });
  }

  return findings;
}

function deriveRiskLevel(findings) {
  const severities = Array.isArray(findings) ? findings.map((item) => item.severity) : [];
  if (severities.includes("high")) {
    return "high";
  }
  if (severities.includes("medium")) {
    return "medium";
  }
  return "low";
}

function buildSecuritySummary({ findings, riskLevel, commitTitle }) {
  const summary = Array.isArray(findings)
    ? findings
        .filter((item) => item.id !== "no-critical-patterns")
        .slice(0, 3)
        .map((item) => `${item.title} (${item.severity})`)
        .join("; ")
    : "";
  if (summary) {
    return `${commitTitle}: ${summary}`;
  }
  return `${commitTitle}: heuristic scan completed with ${riskLevel} risk.`;
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  return text.endsWith("/") ? text.slice(0, -1) : text;
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exit(1);
});