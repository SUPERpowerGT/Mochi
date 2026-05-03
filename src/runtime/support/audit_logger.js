const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_MAX_STRING_LENGTH = 500;
const REDACTED = "[redacted]";

let configuredStorageRoot = "";
let configuredEnabled = true;

function configureAuditLogger(options = {}) {
  configuredStorageRoot = options.storageRoot || configuredStorageRoot || "";
  configuredEnabled = options.enabled !== false;
}

function logAuditEvent(event, options = {}) {
  if (!options.storageRoot && !configuredStorageRoot) {
    return;
  }
  writeAuditEvent(event, options).catch(() => {
    // Audit logging is best-effort and must never break agent work.
  });
}

async function writeAuditEvent(event, options = {}) {
  const storageRoot = options.storageRoot || configuredStorageRoot || getDefaultStorageRoot();
  const enabled = options.enabled !== undefined ? options.enabled !== false : configuredEnabled;
  if (!enabled || !storageRoot) {
    return null;
  }

  const auditEvent = sanitizeAuditEvent(event);
  const logRoot = getAuditLogRoot(storageRoot);
  await fs.promises.mkdir(logRoot, { recursive: true });
  const filePath = path.join(logRoot, `${auditEvent.timestamp.slice(0, 10)}.jsonl`);
  await fs.promises.appendFile(filePath, `${JSON.stringify(auditEvent)}\n`, "utf8");
  return auditEvent;
}

async function readRecentAuditEvents(options = {}) {
  const storageRoot = options.storageRoot || configuredStorageRoot || getDefaultStorageRoot();
  const limit = Math.max(1, Math.min(Number(options.limit) || 100, 1000));
  const logRoot = getAuditLogRoot(storageRoot);

  let files = [];
  try {
    files = await fs.promises.readdir(logRoot);
  } catch (error) {
    return [];
  }

  const jsonlFiles = files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
    .sort()
    .reverse();
  const events = [];
  for (const file of jsonlFiles) {
    const raw = await fs.promises.readFile(path.join(logRoot, file), "utf8").catch(() => "");
    const lines = raw.split(/\r?\n/).filter(Boolean).reverse();
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch (error) {
        // Ignore corrupt log lines so one bad write does not hide the rest.
      }
      if (events.length >= limit) {
        return events;
      }
    }
  }

  return events;
}

function getAuditLogRoot(storageRoot) {
  return path.join(storageRoot, "audit-logs");
}

function getDefaultStorageRoot() {
  return path.join(os.homedir(), ".mochi");
}

function sanitizeAuditEvent(event) {
  const source = event && typeof event === "object" ? event : {};
  const timestamp = source.timestamp || new Date().toISOString();
  return {
    timestamp,
    level: sanitizeLevel(source.level),
    event: sanitizeEventName(source.event),
    ...sanitizeObject(source, 0),
    timestamp,
  };
}

function sanitizeObject(value, depth) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return sanitizeValue("", value, depth);
  }

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "timestamp" || key === "level" || key === "event") {
      continue;
    }
    result[key] = sanitizeValue(key, child, depth + 1);
  }
  return result;
}

function sanitizeValue(key, value, depth) {
  const normalizedKey = String(key || "").toLowerCase();
  if (isSensitiveKey(normalizedKey)) {
    return REDACTED;
  }
  if (isRawContentKey(normalizedKey)) {
    return `[redacted:${String(value || "").length} chars]`;
  }
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return truncateText(redactSecrets(value));
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (depth > 4) {
      return `[array:${value.length}]`;
    }
    return value.slice(0, 20).map((item) => sanitizeValue("", item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth > 4) {
      return "[object]";
    }
    return sanitizeObject(value, depth + 1);
  }
  return truncateText(String(value));
}

function sanitizeLevel(level) {
  const text = String(level || "info").toLowerCase();
  return ["debug", "info", "warn", "error"].includes(text) ? text : "info";
}

function sanitizeEventName(event) {
  return String(event || "audit_event")
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .slice(0, 120) || "audit_event";
}

function isSensitiveKey(key) {
  return /token|api[_-]?key|password|secret|authorization|credential/.test(key);
}

function isRawContentKey(key) {
  return [
    "prompt",
    "reply",
    "content",
    "diff",
    "diffpreview",
    "fulltext",
    "selectedtext",
    "editorcontext",
  ].includes(key);
}

function redactSecrets(text) {
  return String(text || "")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, "AIza[redacted]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]");
}

function truncateText(text) {
  const value = String(text || "");
  if (value.length <= DEFAULT_MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, DEFAULT_MAX_STRING_LENGTH - 15)}...[truncated]`;
}

module.exports = {
  configureAuditLogger,
  getAuditLogRoot,
  logAuditEvent,
  readRecentAuditEvents,
  sanitizeAuditEvent,
  writeAuditEvent,
};
