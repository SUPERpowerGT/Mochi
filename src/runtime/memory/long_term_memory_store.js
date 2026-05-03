const { JsonFileStore } = require("./json_file_store");
const { nowIso } = require("./memory_utils");

const ALLOWED_KINDS = new Set([
  "user_preference",
  "project_fact",
  "project_convention",
  "decision",
  "window_archive",
]);

class LongTermMemoryStore {
  constructor(options = {}) {
    this.store = new JsonFileStore({
      storageRoot: options.storageRoot,
      filename: "long_term_memory.json",
      defaultData: {
        version: 1,
        records: {},
      },
    });
  }

  async createRecord(record = {}) {
    const timestamp = nowIso();
    const kind = ALLOWED_KINDS.has(record.kind) ? record.kind : "decision";
    const id = record.id || `mem:${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const normalized = {
      id,
      layer: "long_term",
      kind,
      scope: record.scope || "workspace",
      workspaceId: record.workspaceId || null,
      title: normalizeText(record.title, "Untitled memory", 120),
      text: normalizeText(record.text, "", 4000),
      content: record.content && typeof record.content === "object" ? record.content : {},
      source: record.source || "system",
      confidence: record.confidence || "derived",
      status: record.status || "active",
      createdAt: record.createdAt || timestamp,
      updatedAt: record.updatedAt || timestamp,
      evidence: record.evidence || null,
    };

    const data = await this.store.update((current) => {
      current.records = current.records || {};
      current.records[id] = normalized;
      return current;
    });

    return data.records[id];
  }

  async listRecords(options = {}) {
    const data = await this.store.read();
    const records = Object.values(data.records || {}).filter((record) => {
      if (!record || record.status === "deleted") {
        return false;
      }
      if (options.kind && record.kind !== options.kind) {
        return false;
      }
      if (options.workspaceId && record.workspaceId && record.workspaceId !== options.workspaceId) {
        return false;
      }
      return true;
    });

    return records.sort((left, right) =>
      String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
    );
  }

  async resetAllRecords() {
    return this.store.write({
      version: 1,
      records: {},
    });
  }
}

function normalizeText(value, fallback, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim() || fallback;
  return text.slice(0, limit);
}

module.exports = {
  LongTermMemoryStore,
  ALLOWED_KINDS,
};
