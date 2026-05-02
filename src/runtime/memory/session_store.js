const { JsonFileStore } = require("./json_file_store");
const { nowIso } = require("./memory_utils");
const {
  DEFAULT_SESSION_COMPACTION_POLICY,
  compactSessionHistory,
} = require("./session_compactor");
const { sanitizeStoredHistory } = require("../support/history_sanitizer");

class SessionStore {
  constructor(options = {}) {
    this.compactionPolicy = {
      ...DEFAULT_SESSION_COMPACTION_POLICY,
      ...(options.compactionPolicy || {}),
    };
    this.store = new JsonFileStore({
      storageRoot: options.storageRoot,
      filename: "sessions.json",
      defaultData: {
        version: 1,
        sessions: {},
      },
    });
  }

  async getOrCreateSession(sessionId, workspaceId) {
    const data = await this.store.update((current) => {
      if (!current.sessions[sessionId]) {
        current.sessions[sessionId] = {
          id: sessionId,
          workspaceId,
          history: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
          activeTaskId: null,
          focusedTaskId: null,
          lastTurn: null,
          lastRunTrace: null,
          summary: "",
          summaryUpdatedAt: null,
          compactedAt: null,
          compaction: null,
          messageCount: 0,
          lastPrompt: "",
          closedAt: null,
        };
      }

      this.normalizeSession(current.sessions[sessionId]);

      return current;
    });

    return data.sessions[sessionId];
  }

  async updateSession(sessionId, updater) {
    const data = await this.store.update((current) => {
      const session = current.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      updater(session);
      this.normalizeSession(session);
      session.updatedAt = nowIso();
      return current;
    });

    return data.sessions[sessionId];
  }

  async setHistory(sessionId, history, lastPrompt) {
    return this.updateSession(sessionId, (session) => {
      session.history = Array.isArray(history) ? history : session.history;
      session.messageCount = Array.isArray(history) ? history.length : session.messageCount;
      session.lastPrompt = lastPrompt || session.lastPrompt;
    });
  }

  async compactHistoryIfNeeded(sessionId) {
    let compactionResult = null;
    const data = await this.store.update((current) => {
      const session = current.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      compactionResult = compactSessionHistory(session, this.compactionPolicy);
      this.normalizeSession(session);
      session.updatedAt = nowIso();
      return current;
    });

    return {
      ...(compactionResult || { changed: false }),
      session: data.sessions[sessionId],
    };
  }

  async setLastTurn(sessionId, lastTurn) {
    return this.updateSession(sessionId, (session) => {
      session.lastTurn = lastTurn || null;
    });
  }

  async setLastRunTrace(sessionId, lastRunTrace) {
    return this.updateSession(sessionId, (session) => {
      session.lastRunTrace = lastRunTrace || null;
    });
  }

  async applyMemoryMaintenance(sessionId, maintenance) {
    return this.updateSession(sessionId, (session) => {
      if (!maintenance || typeof maintenance !== "object") {
        return;
      }

      if (typeof maintenance.rewriteSummary === "string" && maintenance.rewriteSummary.trim()) {
        session.summary = maintenance.rewriteSummary.trim();
        session.summaryUpdatedAt = nowIso();
      }

      const previousCompaction = session.compaction && typeof session.compaction === "object"
        ? session.compaction
        : {};

      session.compaction = {
        ...previousCompaction,
        maintenance: {
          maintainedAt: nowIso(),
          removedClaims: Array.isArray(maintenance.removedClaims)
            ? maintenance.removedClaims.slice(0, 12)
            : [],
          keptFocus: Array.isArray(maintenance.keptFocus)
            ? maintenance.keptFocus.slice(0, 12)
            : [],
          notes: typeof maintenance.notes === "string" ? maintenance.notes : "",
        },
      };
    });
  }

  async clearSessionMemory(sessionId) {
    return this.updateSession(sessionId, (session) => {
      clearMemoryFields(session);
    });
  }

  async clearSessionSummaryMemory(sessionId) {
    return this.updateSession(sessionId, (session) => {
      session.summary = "";
      session.summaryUpdatedAt = null;
      session.compactedAt = null;
      session.compaction = null;
      session.lastPrompt = "";
    });
  }

  async clearSessionTraceAndRoutingMemory(sessionId) {
    return this.updateSession(sessionId, (session) => {
      session.lastTurn = null;
      session.lastRunTrace = null;
      session.activeTaskId = null;
      session.focusedTaskId = null;
    });
  }

  async getSession(sessionId) {
    const data = await this.store.update((current) => {
      const session = current.sessions[sessionId];
      if (session) {
        this.normalizeSession(session);
      }
      return current;
    });

    return data.sessions[sessionId] || null;
  }

  async closeSession(sessionId) {
    const data = await this.store.update((current) => {
      if (!current.sessions || !current.sessions[sessionId]) {
        return current;
      }
      current.sessions[sessionId].closedAt = nowIso();
      this.normalizeSession(current.sessions[sessionId]);
      return current;
    });

    return data.sessions[sessionId] || null;
  }

  async deleteSession(sessionId) {
    return this.closeSession(sessionId);
  }

  async deleteSessionRecord(sessionId) {
    const data = await this.store.update((current) => {
      if (current.sessions && sessionId) {
        delete current.sessions[sessionId];
      }
      return current;
    });

    return data.sessions || {};
  }

  async resetAllSessions() {
    return this.store.write({
      version: 1,
      sessions: {},
    });
  }

  async clearAllSessionMemory() {
    return this.store.update((current) => {
      const sessions = current.sessions || {};
      for (const session of Object.values(sessions)) {
        if (!session) {
          continue;
        }
        clearMemoryFields(session);
        this.normalizeSession(session);
        session.updatedAt = nowIso();
      }
      return current;
    });
  }

  async listSessionsForWorkspace(workspaceId, options = {}) {
    const data = await this.store.update((current) => {
      for (const session of Object.values(current.sessions || {})) {
        if (session && session.workspaceId === workspaceId) {
          this.normalizeSession(session);
        }
      }
      return current;
    });

    const includeClosed = options.includeClosed !== false;
    const sessions = Object.values(data.sessions || {})
      .filter((session) => {
        if (!session || session.workspaceId !== workspaceId) {
          return false;
        }
        return includeClosed || !session.closedAt;
      });

    if (options.sortBy === "createdAt") {
      return sessions.sort((left, right) =>
        String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
      );
    }

    return sessions.sort((left, right) =>
      String(right.updatedAt).localeCompare(String(left.updatedAt))
    );
  }

  normalizeSession(session) {
    if (!session) {
      return session;
    }

    const { history } = sanitizeStoredHistory(session.history);
    session.history = history;
    session.messageCount = history.length;
    if (!session.focusedTaskId && session.activeTaskId) {
      session.focusedTaskId = session.activeTaskId;
    }
    if (!Object.prototype.hasOwnProperty.call(session, "closedAt")) {
      session.closedAt = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session, "summary")) {
      session.summary = "";
    }
    if (!Object.prototype.hasOwnProperty.call(session, "summaryUpdatedAt")) {
      session.summaryUpdatedAt = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session, "compactedAt")) {
      session.compactedAt = null;
    }
    if (!Object.prototype.hasOwnProperty.call(session, "compaction")) {
      session.compaction = null;
    }
    return session;
  }
}

function clearMemoryFields(session) {
  session.summary = "";
  session.summaryUpdatedAt = null;
  session.compactedAt = null;
  session.compaction = null;
  session.lastTurn = null;
  session.lastRunTrace = null;
  session.activeTaskId = null;
  session.focusedTaskId = null;
  session.lastPrompt = "";
}

module.exports = {
  SessionStore,
};
