const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getAuditLogRoot,
  readRecentAuditEvents,
  sanitizeAuditEvent,
  writeAuditEvent,
} = require("../../src/runtime/support/audit_logger");

test("sanitizeAuditEvent redacts secrets and raw content", () => {
  const sanitized = sanitizeAuditEvent({
    event: "agent run started!",
    level: "verbose",
    apiKey: "sk-1234567890abcdef",
    authorization: "Bearer sk-1234567890abcdef",
    prompt: "Please inspect this private prompt",
    reply: "private answer",
    nested: {
      email: "alice@example.com",
      tokenValue: "secret-token",
      note: "contact bob@example.com with sk-abcdefghi",
    },
  });

  assert.equal(sanitized.event, "agent_run_started_");
  assert.equal(sanitized.level, "info");
  assert.equal(sanitized.apiKey, "[redacted]");
  assert.equal(sanitized.authorization, "[redacted]");
  assert.equal(sanitized.prompt, "[redacted:34 chars]");
  assert.equal(sanitized.reply, "[redacted:14 chars]");
  assert.equal(sanitized.nested.email, "[redacted-email]");
  assert.equal(sanitized.nested.tokenValue, "[redacted]");
  assert.equal(sanitized.nested.note, "contact [redacted-email] with sk-[redacted]");
});

test("writeAuditEvent writes JSONL and readRecentAuditEvents returns newest first", async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-audit-"));

  try {
    const first = await writeAuditEvent({
      event: "first_event",
      sequence: 1,
    }, { storageRoot });
    const second = await writeAuditEvent({
      event: "second_event",
      sequence: 2,
    }, { storageRoot });

    const filePath = path.join(getAuditLogRoot(storageRoot), `${first.timestamp.slice(0, 10)}.jsonl`);
    const raw = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
    assert.equal(raw.length, 2);
    assert.equal(JSON.parse(raw[0]).event, "first_event");
    assert.equal(JSON.parse(raw[1]).event, "second_event");

    const recent = await readRecentAuditEvents({ storageRoot, limit: 1 });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].timestamp, second.timestamp);
    assert.equal(recent[0].event, "second_event");
  } finally {
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
});
