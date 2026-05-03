const { JsonFileStore } = require("./json_file_store");
const { nowIso } = require("./memory_utils");

class MemoryEventStore {
  constructor(options = {}) {
    this.store = new JsonFileStore({
      storageRoot: options.storageRoot,
      filename: "memory_events.json",
      defaultData: {
        version: 1,
        events: [],
      },
    });
  }

  async recordEvent(event = {}) {
    const timestamp = nowIso();
    const normalized = {
      id: event.id || `memevt:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      type: event.type || "memory_event",
      layer: event.layer || "",
      action: event.action || "",
      status: event.status || "completed",
      baseSessionId: event.baseSessionId || "",
      sessionId: event.sessionId || "",
      workspaceId: event.workspaceId || "",
      recordId: event.recordId || null,
      reason: event.reason || "",
      evidence: event.evidence || null,
      metadata: event.metadata || {},
      createdAt: event.createdAt || timestamp,
    };

    const data = await this.store.update((current) => {
      current.events = Array.isArray(current.events) ? current.events : [];
      current.events.push(normalized);
      return current;
    });

    return data.events[data.events.length - 1];
  }

  async listEvents(options = {}) {
    const data = await this.store.read();
    const limit = Number.isFinite(options.limit) ? options.limit : 100;
    const events = Array.isArray(data.events) ? data.events : [];
    return events.slice(-limit).reverse();
  }

  async resetAllEvents() {
    return this.store.write({
      version: 1,
      events: [],
    });
  }
}

module.exports = {
  MemoryEventStore,
};
