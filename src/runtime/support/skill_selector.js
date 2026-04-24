const fs = require("fs");
const path = require("path");

const SKILL_DIR = path.join(__dirname, "..", "skills");
const DEFAULT_ROOT_LIMIT = 1800;
const DEFAULT_SUBAGENT_LIMIT = 1400;

let cachedSkills = null;

function selectSkillsForRoot({ prompt, workspaceRoot = "" } = {}) {
  return selectSkills({
    prompt,
    agentKey: "root",
    workspaceRoot,
    limit: DEFAULT_ROOT_LIMIT,
  });
}

function selectSkillsForSubagent({ prompt, agentKey, workspaceRoot = "" } = {}) {
  return selectSkills({
    prompt,
    agentKey,
    workspaceRoot,
    limit: DEFAULT_SUBAGENT_LIMIT,
  });
}

function selectSkills({ prompt, agentKey, workspaceRoot, limit }) {
  const query = `${prompt || ""}\n${workspaceRoot || ""}`.toLowerCase();
  const candidates = loadSkills()
    .map((skill) => ({
      skill,
      score: scoreSkill(skill, query, agentKey),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, 2)
    .map((item) => item.skill);

  const included = [];
  const sections = [];
  let remaining = limit;

  for (const skill of candidates) {
    const header = `Skill: ${skill.name}\n`;
    const budget = Math.max(0, remaining - header.length - 2);
    if (budget <= 0) {
      break;
    }

    const body = limitText(skill.body, budget);
    sections.push(`${header}${body}`);
    included.push(skill.name);
    remaining -= header.length + body.length + 2;
  }

  return {
    text: sections.length ? ["Relevant skills", ...sections].join("\n\n") : "",
    metadata: {
      agentKey,
      included,
      limit,
    },
  };
}

function scoreSkill(skill, query, agentKey) {
  let triggerScore = 0;
  if (skill.appliesTo.includes(agentKey)) {
    triggerScore += 0;
  }
  if (skill.appliesTo.includes("root") && agentKey === "root") {
    triggerScore += 0;
  }

  for (const trigger of skill.triggers) {
    if (trigger && query.includes(trigger.toLowerCase())) {
      triggerScore += 2;
    }
  }

  if (skill.name === "vscode-extension-dev" && /package\.json|webview|extension|vscode/.test(query)) {
    triggerScore += 2;
  }

  if (skill.name === "memory-architecture" && /memory|session|task|trace|tracy|记忆|会话|任务/.test(query)) {
    triggerScore += 2;
  }

  if (triggerScore <= 0) {
    return 0;
  }

  let roleScore = 0;
  if (skill.appliesTo.includes(agentKey)) {
    roleScore += 2;
  }
  if (skill.appliesTo.includes("root") && agentKey === "root") {
    roleScore += 1;
  }

  return triggerScore + roleScore;
}

function loadSkills() {
  if (cachedSkills) {
    return cachedSkills;
  }

  let filenames = [];
  try {
    filenames = fs.readdirSync(SKILL_DIR).filter((name) => name.endsWith(".md"));
  } catch (error) {
    cachedSkills = [];
    return cachedSkills;
  }

  cachedSkills = filenames
    .map((filename) => parseSkill(filename, fs.readFileSync(path.join(SKILL_DIR, filename), "utf8"))) // nosemgrep
    .filter(Boolean);
  return cachedSkills;
}

function parseSkill(filename, content) {
  const text = String(content || "");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const frontmatter = match ? match[1] : "";
  const body = match ? match[2].trim() : text.trim();
  const metadata = {};

  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata[key] = value;
  }

  const name = metadata.name || filename.replace(/\.md$/, "");
  return {
    name,
    appliesTo: splitList(metadata.appliesTo || "root"),
    triggers: splitList(metadata.triggers || ""),
    body,
  };
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function limitText(value, maxChars) {
  const text = String(value || "");
  if (!maxChars || text.length <= maxChars) {
    return text;
  }

  const suffix = "\n...[truncated]";
  return `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

module.exports = {
  selectSkillsForRoot,
  selectSkillsForSubagent,
};
