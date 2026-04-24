const fs = require("fs");
const path = require("path");

const DEFAULT_INSTRUCTION_FILES = [
  "MOCHI.md",
  ".mochi/MOCHI.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".claude/CLAUDE.md",
];

function readIfFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return null;
    }

    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return null;
  }
}

function loadProjectInstructions(workspaceRoot, options = {}) {
  if (!workspaceRoot) {
    return {
      text: "",
      sources: [],
    };
  }

  const filenames = options.filenames || DEFAULT_INSTRUCTION_FILES;
  const sections = [];
  const sources = [];

  for (const relativePath of filenames) {
    const absolutePath = path.join(workspaceRoot, relativePath); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    const content = readIfFile(absolutePath);
    if (!content) {
      continue;
    }

    sections.push(`Source: ${relativePath}\n${content.trim()}`);
    sources.push(relativePath);
  }

  if (!sections.length) {
    return {
      text: "",
      sources: [],
    };
  }

  return {
    text: ["Project instructions", ...sections].join("\n\n"),
    sources,
  };
}

module.exports = {
  DEFAULT_INSTRUCTION_FILES,
  loadProjectInstructions,
};
