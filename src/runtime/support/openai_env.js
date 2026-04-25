const fs = require("fs");
const os = require("os");
const path = require("path");

const OPENAI_ENV_FILE = path.join(os.homedir(), ".openai-env");

function loadOpenAIEnvFile({ override = true } = {}) {
  if (!fs.existsSync(OPENAI_ENV_FILE)) {
    return;
  }

  const lines = fs.readFileSync(OPENAI_ENV_FILE, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = parseEnvAssignment(line);
    if (!assignment) {
      continue;
    }

    const { key, rawValue } = assignment;
    let value = rawValue.trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (override || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseEnvAssignment(line) {
  const powershellMatch = line.match(/^\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/i);
  if (powershellMatch) {
    return {
      key: powershellMatch[1],
      rawValue: powershellMatch[2],
    };
  }

  const shellMatch = line.match(/^(?:export\s+|set\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/i);
  if (shellMatch) {
    return {
      key: shellMatch[1],
      rawValue: shellMatch[2],
    };
  }

  return null;
}

module.exports = {
  loadOpenAIEnvFile,
};
