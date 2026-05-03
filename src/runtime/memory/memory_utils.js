const crypto = require("crypto");
const path = require("path");

function nowIso() {
  return new Date().toISOString();
}

function createWorkspaceId(workspaceRoot) {
  if (!workspaceRoot) {
    return "no-workspace";
  }

  return `workspace:${crypto.createHash("sha1").update(workspaceRoot).digest("hex")}`;
}

function createWorkspaceSyncKey(workspaceRoot, detected = null) {
  const projectName = detected && typeof detected.projectName === "string" && detected.projectName.trim()
    ? detected.projectName.trim()
    : path.basename(workspaceRoot || "") || "workspace";
  return `workspace-sync:${projectName.toLowerCase()}`;
}

function createSessionId(baseSessionId, workspaceId) {
  return `${baseSessionId}:${workspaceId}`;
}

function deriveTaskTitle(prompt) {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled task";
  }

  return normalized.slice(0, 80);
}

function normalizePrompt(prompt) {
  return String(prompt || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractPromptKeywords(prompt) {
  const normalized = normalizePrompt(prompt);
  if (!normalized) {
    return [];
  }

  const asciiWords = normalized.match(/[a-z0-9_]{2,}/g) || [];
  const cjkChunks = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const cjkBigrams = [];

  for (const chunk of cjkChunks) {
    if (chunk.length === 2) {
      cjkBigrams.push(chunk);
      continue;
    }

    for (let index = 0; index < chunk.length - 1; index += 1) {
      cjkBigrams.push(chunk.slice(index, index + 2));
    }
  }

  return Array.from(new Set([...asciiWords, ...cjkChunks, ...cjkBigrams]));
}

function scorePromptOverlap(leftPrompt, rightPrompt) {
  const left = extractPromptKeywords(leftPrompt);
  const right = extractPromptKeywords(rightPrompt);

  if (!left.length || !right.length) {
    return 0;
  }

  const rightSet = new Set(right);
  const shared = left.filter((item) => rightSet.has(item));
  return shared.length / Math.max(left.length, right.length);
}

function isLikelyFollowUpPrompt(prompt) {
  const normalized = normalizePrompt(prompt);
  if (!normalized) {
    return false;
  }

  const followUpPatterns = [
    /^继续/,
    /^然后/,
    /^那/,
    /^还有/,
    /^包括/,
    /^顺便/,
    /^再/,
    /^也/,
    /^这个/,
    /^那个/,
    /^它/,
    /^可以吗/,
    /^记得/,
    /^能不能/,
    /^帮我继续/,
    /^also\b/,
    /^then\b/,
    /^what about\b/,
    /^and\b/,
  ];

  return followUpPatterns.some((pattern) => pattern.test(normalized));
}

function isMemoryRecallPrompt(prompt) {
  const normalized = normalizePrompt(prompt);
  if (!normalized) {
    return false;
  }

  const recallPatterns = [
    /上次/,
    /上回/,
    /上一.*(问|说|聊|做)/,
    /刚才/,
    /之前/,
    /前面/,
    /还记得/,
    /记得.*(问题|问|说|聊|做)/,
    /我.*问过/,
    /不是这个/,
    /不对/,
    /错了/,
    /\blast time\b/,
    /\bprevious\b/,
    /\bearlier\b/,
    /\bbefore\b/,
    /\bremember\b/,
  ];

  return recallPatterns.some((pattern) => pattern.test(normalized));
}

function findBestTaskMatch(tasks, prompt) {
  const candidates = Array.isArray(tasks) ? tasks : [];
  let bestTask = null;
  let bestScore = 0;

  for (const task of candidates) {
    const score = Math.max(
      scorePromptOverlap(prompt, task.goal),
      scorePromptOverlap(prompt, task.lastUserPrompt)
    );

    if (score > bestScore) {
      bestScore = score;
      bestTask = task;
    }
  }

  return {
    task: bestTask,
    score: bestScore,
  };
}

function detectPreferredLanguage(prompt) {
  const text = String(prompt || "");
  if (/[\u4e00-\u9fff]/.test(text)) {
    return "zh-CN";
  }
  if (/[A-Za-z]/.test(text)) {
    return "en";
  }
  return null;
}

module.exports = {
  nowIso,
  createWorkspaceId,
  createWorkspaceSyncKey,
  createSessionId,
  deriveTaskTitle,
  normalizePrompt,
  extractPromptKeywords,
  scorePromptOverlap,
  isLikelyFollowUpPrompt,
  isMemoryRecallPrompt,
  findBestTaskMatch,
  detectPreferredLanguage,
};
