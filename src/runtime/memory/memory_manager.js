const path = require("path");
const os = require("os");
const { SessionStore } = require("./session_store");
const { TaskStore } = require("./task_store");
const { WorkspaceStore } = require("./workspace_store");
const { UserStore } = require("./user_store");
const { LongTermMemoryStore } = require("./long_term_memory_store");
const { MemoryEventStore } = require("./memory_event_store");
const { classifyTurn } = require("./turn_classifier");
const { loadProjectInstructions } = require("../support/project_instructions");
const { summarizeRunTrace } = require("../support/trace_summary");
const {
  createSessionId,
  createWorkspaceId,
  detectPreferredLanguage,
  isMemoryRecallPrompt,
} = require("./memory_utils");

function formatMemorySection(title, lines) {
  if (!lines.length) {
    return "";
  }

  return `${title}:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

class MemoryManager {
  constructor(options = {}) {
    this.getWorkspaceRoot = options.getWorkspaceRoot || (() => "");
    this.baseSessionId = options.baseSessionId || "primary-chat";
    this.compactionPolicy = options.compactionPolicy || {};
    this.storageRoot =
      options.storageRoot ||
      path.join(os.homedir(), ".mochi", "memory");
    this.sessionStore = new SessionStore({
      storageRoot: this.storageRoot,
      compactionPolicy: this.compactionPolicy,
    });
    this.taskStore = new TaskStore({ storageRoot: this.storageRoot });
    this.workspaceStore = new WorkspaceStore({ storageRoot: this.storageRoot });
    this.userStore = new UserStore({ storageRoot: this.storageRoot });
    this.longTermMemoryStore = new LongTermMemoryStore({ storageRoot: this.storageRoot });
    this.memoryEventStore = new MemoryEventStore({ storageRoot: this.storageRoot });
    this.memoryPolicyByBaseSessionId = new Map();
  }

  setBaseSessionId(baseSessionId) {
    this.baseSessionId = baseSessionId || "primary-chat";
  }

  getBaseSessionId() {
    return this.baseSessionId;
  }

  getMemoryPolicy(baseSessionId = this.baseSessionId) {
    return {
      isolateSession: false,
      disablePersistentMemory: false,
      privateWindow: false,
      ...(this.memoryPolicyByBaseSessionId.get(baseSessionId || this.baseSessionId) || {}),
    };
  }

  setMemoryPolicy(baseSessionId = this.baseSessionId, policy = {}) {
    const key = baseSessionId || this.baseSessionId;
    const nextPolicy = {
      ...this.getMemoryPolicy(key),
      ...(policy || {}),
    };
    this.memoryPolicyByBaseSessionId.set(key, nextPolicy);
    return nextPolicy;
  }

  async ensureCurrentSession() {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(this.baseSessionId, workspaceId);
    return this.sessionStore.getOrCreateSession(sessionId, workspaceId);
  }

  async prepareRun(prompt, options = {}) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const baseSessionId = options.baseSessionId || this.baseSessionId;
    const sessionId = createSessionId(baseSessionId, workspaceId);
    const memoryPolicy = this.getMemoryPolicy(baseSessionId);

    const session = await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    const workspace = memoryPolicy.disablePersistentMemory
      ? null
      : await this.workspaceStore.getOrCreateWorkspace(workspaceId, workspaceRoot);
    const projectInstructions = loadProjectInstructions(workspaceRoot);
    const focusedTaskId =
      !memoryPolicy.disablePersistentMemory && session && (session.focusedTaskId || session.activeTaskId)
        ? session.focusedTaskId || session.activeTaskId
        : null;
    const currentTask = focusedTaskId
      ? await this.taskStore.getTask(focusedTaskId)
      : memoryPolicy.disablePersistentMemory
        ? null
        : await this.taskStore.getActiveTaskForSession(sessionId);
    const turn = classifyTurn({ prompt, currentTask });
    let task = currentTask;
    let taskPlan = null;

    if (turn.kind === "work") {
      taskPlan = await this.taskStore.planActiveTask({
        sessionId,
        workspaceId,
        prompt,
        focusedTaskId,
      });
      task = taskPlan.previewTask;
    }

    await this.sessionStore.setLastTurn(sessionId, {
      kind: turn.kind,
      reason: turn.reason,
      diagnostics: turn.diagnostics,
      linkedTaskId: taskPlan && task ? task.id : currentTask ? currentTask.id : null,
      pendingTaskId: taskPlan && taskPlan.action === "create" && task ? task.id : null,
      evaluatedAt: new Date().toISOString(),
    });
    const preferences = memoryPolicy.disablePersistentMemory
      ? {}
      : await this.userStore.getPreferences();

    const preferredLanguage = detectPreferredLanguage(prompt);
    if (!memoryPolicy.disablePersistentMemory && preferredLanguage && !preferences.preferredLanguage) {
      await this.userStore.setPreference("preferredLanguage", preferredLanguage, {
        confidence: "observed",
        source: "prompt-language",
      });
    }

    const freshPreferences = memoryPolicy.disablePersistentMemory
      ? {}
      : await this.userStore.getPreferences();
    const longTermMemory = memoryPolicy.disablePersistentMemory
      ? []
      : await this.longTermMemoryStore.listRecords({ workspaceId });
    const referencedTaskSummaries = memoryPolicy.disablePersistentMemory || memoryPolicy.isolateSession
      ? []
      : await this.taskStore.listReferencedTaskSummaries({
          workspaceId,
          sessionId,
          prompt,
          excludeTaskId: task ? task.id : null,
        });
    const recentSessions = !memoryPolicy.disablePersistentMemory && !memoryPolicy.isolateSession && isMemoryRecallPrompt(prompt)
      ? await this.listRecentSessionSummaries({ workspaceId, sessionId })
      : [];
    const memorySlices = this.composeMemorySlices({
      sessionSummary: memoryPolicy.disablePersistentMemory ? "" : session.summary || "",
      sessionCompaction: memoryPolicy.disablePersistentMemory ? null : session.compaction || null,
      task,
      workspace,
      preferences: freshPreferences,
      longTermMemory,
      referencedTaskSummaries,
      recentSessions,
    });
    const memoryText = this.composeMemoryText({
      sessionSummary: memoryPolicy.disablePersistentMemory ? "" : session.summary || "",
      sessionCompaction: memoryPolicy.disablePersistentMemory ? null : session.compaction || null,
      task,
      workspace,
      preferences: freshPreferences,
      longTermMemory,
      referencedTaskSummaries,
      recentSessions,
    });

    return {
      sessionId,
      workspaceId,
      taskId: turn.kind === "work" && task ? task.id : null,
      taskPlan,
      turn,
      history: session.history || [],
      memoryText,
      memorySlices,
      memoryPolicy,
      projectInstructionsText: projectInstructions.text,
    };
  }

  async getSnapshot() {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(this.baseSessionId, workspaceId);
    const session = await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    const workspace = await this.workspaceStore.getWorkspace(workspaceId);
    const projectInstructions = loadProjectInstructions(workspaceRoot);
    const taskId =
      session && (session.focusedTaskId || session.activeTaskId)
        ? session.focusedTaskId || session.activeTaskId
        : `task:${sessionId}`;
    const task = await this.taskStore.getTask(taskId);
    const tasks = await this.taskStore.listTasksForSession(sessionId);
    const preferences = await this.userStore.getPreferences();
    const longTermMemory = await this.longTermMemoryStore.listRecords({ workspaceId });
    const memoryEvents = await this.memoryEventStore.listEvents({ limit: 50 });
    const recentSessions = session && isMemoryRecallPrompt(session.lastPrompt)
      ? await this.listRecentSessionSummaries({ workspaceId, sessionId })
      : [];
    const memoryText = this.composeMemoryText({
      sessionSummary: session.summary || "",
      sessionCompaction: session.compaction || null,
      task,
      workspace,
      preferences,
      longTermMemory,
      referencedTaskSummaries: [],
      recentSessions,
    });
    const lastRunTrace = session && session.lastRunTrace ? session.lastRunTrace : null;

    return {
      generatedAt: new Date().toISOString(),
      baseSessionId: this.baseSessionId,
      storageRoot: this.storageRoot,
      workspaceRoot,
      workspaceId,
      sessionId,
      session,
      lastTurn: session && session.lastTurn ? session.lastTurn : null,
      lastRunTrace,
      traceSummary: summarizeRunTrace(lastRunTrace),
      task,
      taskRouting: task && task.lastRoute ? task.lastRoute : null,
      tasks,
      longTermMemory,
      memoryEvents,
      workspace,
      projectInstructions: {
        sources: projectInstructions.sources,
        text: projectInstructions.text,
      },
      preferences,
      memoryPolicy: this.getMemoryPolicy(this.baseSessionId),
      memoryText,
    };
  }

  async getMemoryControlsForUi(baseSessionId = this.baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(baseSessionId || this.baseSessionId, workspaceId);
    const session = await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    const tasks = await this.taskStore.listTasksForSession(sessionId);
    const preferences = await this.userStore.getPreferences();
    const workspace = await this.workspaceStore.getWorkspace(workspaceId);
    const longTermMemory = await this.longTermMemoryStore.listRecords({ workspaceId });
    const memoryEvents = await this.memoryEventStore.listEvents({ limit: 20 });

    return {
      baseSessionId: baseSessionId || this.baseSessionId,
      workspaceId,
      sessionId,
      policy: this.getMemoryPolicy(baseSessionId || this.baseSessionId),
      counts: {
        messages: session.messageCount || 0,
        hasSummary: Boolean(session.summary),
        tasks: tasks.length,
        workspaceMemory: workspace ? 1 : 0,
        userPreferences: Object.keys(preferences || {}).length,
        longTermMemory: longTermMemory.length,
        memoryEvents: memoryEvents.length,
      },
      session: {
        title: createSessionTitle(session),
        lastPrompt: session.lastPrompt || "",
        summary: session.summary || "",
        updatedAt: session.updatedAt || null,
      },
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title || "",
        status: task.status || "",
        summary: task.summary || "",
        updatedAt: task.updatedAt || null,
      })),
      preferences,
      longTermMemory,
      memoryEvents,
    };
  }

  async setMemoryPolicyForUi(baseSessionId, policy) {
    return this.setMemoryPolicy(baseSessionId || this.baseSessionId, policy);
  }

  async setPrivateWindowModeForUi(baseSessionId = this.baseSessionId, enabled = true) {
    return this.setMemoryPolicy(baseSessionId || this.baseSessionId, {
      privateWindow: Boolean(enabled),
      isolateSession: Boolean(enabled),
      disablePersistentMemory: Boolean(enabled),
    });
  }

  async clearCurrentSessionMemoryForUi(baseSessionId = this.baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(baseSessionId || this.baseSessionId, workspaceId);
    await this.sessionStore.clearSessionMemory(sessionId);
    await this.taskStore.clearTasksForSession(sessionId);
    return this.getMemoryControlsForUi(baseSessionId || this.baseSessionId);
  }

  async clearCurrentSessionSummaryMemoryForUi(baseSessionId = this.baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(baseSessionId || this.baseSessionId, workspaceId);
    await this.sessionStore.clearSessionSummaryMemory(sessionId);
    return this.getMemoryControlsForUi(baseSessionId || this.baseSessionId);
  }

  async clearCurrentTaskMemoryForUi(baseSessionId = this.baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(baseSessionId || this.baseSessionId, workspaceId);
    await this.taskStore.clearTasksForSession(sessionId);
    await this.sessionStore.clearSessionTraceAndRoutingMemory(sessionId);
    return this.getMemoryControlsForUi(baseSessionId || this.baseSessionId);
  }

  async clearCurrentWorkspaceMemoryForUi(baseSessionId = this.baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    await this.workspaceStore.clearWorkspace(workspaceId);
    return this.getMemoryControlsForUi(baseSessionId || this.baseSessionId);
  }

  async clearUserMemoryForUi(baseSessionId = this.baseSessionId) {
    await this.userStore.resetAllPreferences();
    return this.getMemoryControlsForUi(baseSessionId || this.baseSessionId);
  }

  async clearCurrentTraceAndRoutingMemoryForUi(baseSessionId = this.baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(baseSessionId || this.baseSessionId, workspaceId);
    await this.sessionStore.clearSessionTraceAndRoutingMemory(sessionId);
    return this.getMemoryControlsForUi(baseSessionId || this.baseSessionId);
  }

  async destroyCurrentWindowArtifactsForUi(baseSessionId = this.baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const targetBaseSessionId = baseSessionId || this.baseSessionId;
    const sessionId = createSessionId(targetBaseSessionId, workspaceId);
    await this.archiveCurrentWindowIfAllowed({
      baseSessionId: targetBaseSessionId,
      sessionId,
      workspaceId,
      reason: "destroy-current-window-artifacts",
    });
    await this.taskStore.clearTasksForSession(sessionId);
    await this.sessionStore.deleteSessionRecord(sessionId);
    await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    return this.getMemoryControlsForUi(targetBaseSessionId);
  }

  async clearAllMemoryForUi() {
    await this.sessionStore.clearAllSessionMemory();
    await this.taskStore.resetAllTasks();
    await this.workspaceStore.resetAllWorkspaces();
    await this.userStore.resetAllPreferences();
    await this.longTermMemoryStore.resetAllRecords();
    await this.memoryEventStore.resetAllEvents();
    await this.ensureCurrentSession();
    return this.getMemoryControlsForUi(this.baseSessionId);
  }

  async getCurrentSessionMessagesForUi(baseSessionId = null) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(baseSessionId || this.baseSessionId, workspaceId);
    const session = await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    const history = session && Array.isArray(session.history) ? session.history : [];

    return history
      .filter((item) => item && item.type === "message" && (item.role === "user" || item.role === "assistant"))
      .map((item) => ({
        role: item.role,
        text: extractMessageText(item),
      }))
      .filter((item) => item.text);
  }

  async listCurrentWorkspaceSessionsForUi() {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const currentSessionId = createSessionId(this.baseSessionId, workspaceId);
    await this.sessionStore.getOrCreateSession(currentSessionId, workspaceId);
    const sessions = await this.sessionStore.listSessionsForWorkspace(workspaceId, {
      sortBy: "createdAt",
      includeClosed: false,
    });

    return sessions
      .map((session) => ({
        id: session.id,
        baseSessionId: extractBaseSessionId(session.id, workspaceId),
        title: createSessionTitle(session),
        messageCount: session.messageCount || 0,
        hasSummary: Boolean(session.summary),
        summaryUpdatedAt: session.summaryUpdatedAt || null,
        updatedAt: session.updatedAt || null,
        createdAt: session.createdAt || null,
        closedAt: session.closedAt || null,
        focusedTaskId: session.focusedTaskId || session.activeTaskId || null,
        active: session.id === currentSessionId,
      }))
      .sort((left, right) => {
        const leftCreatedAt = String(left.createdAt || "");
        const rightCreatedAt = String(right.createdAt || "");
        if (leftCreatedAt !== rightCreatedAt) {
          return leftCreatedAt.localeCompare(rightCreatedAt);
        }
        return 0;
      });
  }

  async deleteSessionForUi(baseSessionId) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const targetBaseSessionId = baseSessionId || this.baseSessionId;
    const targetSessionId = createSessionId(targetBaseSessionId, workspaceId);
    const currentSessionId = createSessionId(this.baseSessionId, workspaceId);
    const targetSession = await this.sessionStore.getSession(targetSessionId);
    if (!targetSession) {
      return {
        activeBaseSessionId: this.baseSessionId,
        sessions: await this.listCurrentWorkspaceSessionsForUi(),
      };
    }

    await this.archiveCurrentWindowIfAllowed({
      baseSessionId: targetBaseSessionId,
      sessionId: targetSessionId,
      workspaceId,
      reason: "close-session",
    });
    await this.sessionStore.closeSession(targetSessionId);

    if (targetSessionId === currentSessionId) {
      const remainingSessions = await this.sessionStore.listSessionsForWorkspace(workspaceId, {
        sortBy: "createdAt",
        includeClosed: false,
      });
      const targetCreatedAt = targetSession && targetSession.createdAt ? targetSession.createdAt : "";
      const nextSession =
        remainingSessions.find((session) =>
          String(session.createdAt || "").localeCompare(String(targetCreatedAt)) > 0
        ) ||
        remainingSessions[remainingSessions.length - 1] ||
        null;
      this.baseSessionId = nextSession
        ? extractBaseSessionId(nextSession.id, workspaceId)
        : createUntitledBaseSessionId();
      await this.ensureCurrentSession();
    }

    return {
      activeBaseSessionId: this.baseSessionId,
      sessions: await this.listCurrentWorkspaceSessionsForUi(),
    };
  }

  async archiveCurrentWindowIfAllowed({ baseSessionId, sessionId, workspaceId, reason }) {
    const policy = this.getMemoryPolicy(baseSessionId || this.baseSessionId);
    const session = await this.sessionStore.getSession(sessionId);
    if (!session) {
      return null;
    }

    if (policy.privateWindow || policy.disablePersistentMemory) {
      await this.memoryEventStore.recordEvent({
        type: "memory_commit",
        layer: "long_term",
        action: "create_window_archive",
        status: "blocked",
        baseSessionId,
        sessionId,
        workspaceId,
        reason: policy.privateWindow
          ? "private-window-blocks-long-term-archive"
          : "persistent-memory-disabled",
        metadata: {
          requestedBy: reason || "",
        },
      });
      return null;
    }

    const tasks = await this.taskStore.listTasksForSession(sessionId);
    const archive = buildWindowArchiveRecord({
      session,
      tasks,
      workspaceId,
      reason,
    });
    if (!archive.text) {
      await this.memoryEventStore.recordEvent({
        type: "memory_commit",
        layer: "long_term",
        action: "create_window_archive",
        status: "skipped",
        baseSessionId,
        sessionId,
        workspaceId,
        reason: "no-safe-window-content-to-archive",
        metadata: {
          requestedBy: reason || "",
        },
      });
      return null;
    }

    const record = await this.longTermMemoryStore.createRecord(archive);
    await this.memoryEventStore.recordEvent({
      type: "memory_commit",
      layer: "long_term",
      action: "create_window_archive",
      status: "completed",
      baseSessionId,
      sessionId,
      workspaceId,
      recordId: record.id,
      reason: reason || "archive-current-window",
      evidence: {
        type: "current_window_summary",
        summary: archive.title,
      },
    });
    return record;
  }

  async listRecentSessionSummaries({ workspaceId, sessionId, limit = 5 }) {
    const sessions = await this.sessionStore.listSessionsForWorkspace(workspaceId);
    const recentSessions = sessions
      .filter((session) => session && session.id !== sessionId)
      .slice(0, limit);
    const summaries = await Promise.all(recentSessions.map(async (session) => {
      const task = await this.findRepresentativeTaskForSession(session);
      return {
        id: session.id,
        title: createSessionTitle(session),
        lastPrompt: session.lastPrompt || "",
        lastAssistantReply: extractLastAssistantText(session),
        summary: session.summary || "",
        summaryUpdatedAt: session.summaryUpdatedAt || null,
        messageCount: session.messageCount || 0,
        updatedAt: session.updatedAt || null,
        task: task
          ? {
              id: task.id,
              title: task.title || "",
              status: task.status || "",
              summary: task.summary || "",
              lastOutcome: task.lastOutcome || "",
              turnCount: task.turnCount || 0,
              updatedAt: task.updatedAt || null,
            }
          : null,
      };
    }));

    return summaries
      .filter((session) => session.lastPrompt || session.lastAssistantReply || session.title);
  }

  async findRepresentativeTaskForSession(session) {
    if (!session || !session.id) {
      return null;
    }

    const preferredTaskId = session.focusedTaskId || session.activeTaskId || null;
    if (preferredTaskId) {
      const preferredTask = await this.taskStore.getTask(preferredTaskId);
      if (preferredTask) {
        return preferredTask;
      }
    }

    const tasks = await this.taskStore.listTasksForSession(session.id);
    return tasks[0] || null;
  }

  async finalizeRun({ baseSessionId = this.baseSessionId, sessionId, taskId, taskPlan, prompt, reply, history, trace }) {
    await this.sessionStore.setHistory(sessionId, history, prompt);
    const memoryPolicy = this.getMemoryPolicy(baseSessionId);
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const memoryCommit = {
      kind: "MemoryCommit",
      baseSessionId,
      sessionId,
      workspaceId,
      wroteCurrentWindow: true,
      wroteWorkingState: false,
      wroteLongTerm: false,
      wroteTrace: Boolean(trace),
      blockedByPrivateMode: Boolean(memoryPolicy.privateWindow),
      blockedPersistentMemory: Boolean(memoryPolicy.disablePersistentMemory),
      events: [],
    };
    if (memoryPolicy.disablePersistentMemory) {
      await this.sessionStore.setLastRunTrace(sessionId, trace || null);
      const event = await this.memoryEventStore.recordEvent({
        type: "memory_commit",
        layer: "current_window",
        action: "finalize_run",
        status: "completed",
        baseSessionId,
        sessionId,
        workspaceId,
        reason: memoryPolicy.privateWindow
          ? "private-window-current-memory-only"
          : "persistent-memory-disabled",
        metadata: memoryCommit,
      });
      memoryCommit.events.push(event);
      return {
        maintenanceCandidate: null,
        memoryCommit,
      };
    }
    const compactionResult = await this.sessionStore.compactHistoryIfNeeded(sessionId);
    await this.sessionStore.setLastRunTrace(sessionId, trace || null);
    if (taskPlan) {
      const committedTask = await this.taskStore.commitPlannedTask(taskPlan, {
        prompt,
        reply,
        sessionId,
      });
      memoryCommit.wroteWorkingState = Boolean(committedTask);
      await this.sessionStore.updateSession(sessionId, (session) => {
        session.activeTaskId = committedTask ? committedTask.id : session.activeTaskId;
        session.focusedTaskId = committedTask ? committedTask.id : session.focusedTaskId;
        if (session.lastTurn) {
          session.lastTurn.linkedTaskId = committedTask ? committedTask.id : session.lastTurn.linkedTaskId;
          session.lastTurn.pendingTaskId = null;
        }
      });
    } else if (taskId) {
      await this.sessionStore.updateSession(sessionId, (session) => {
        session.activeTaskId = taskId;
        session.focusedTaskId = taskId;
      });
      await this.taskStore.recordTurn(taskId, {
        prompt,
        reply,
        sessionId,
      });
      memoryCommit.wroteWorkingState = true;
    }

    const event = await this.memoryEventStore.recordEvent({
      type: "memory_commit",
      layer: "current_window",
      action: "finalize_run",
      status: "completed",
      baseSessionId,
      sessionId,
      workspaceId,
      reason: "run-finalized",
      metadata: memoryCommit,
    });
    memoryCommit.events.push(event);

    if (compactionResult && compactionResult.changed && compactionResult.session) {
      const representativeTask = await this.findRepresentativeTaskForSession(compactionResult.session);
      return {
        maintenanceCandidate: {
          sessionId,
          sessionSummary: compactionResult.session.summary || "",
          sessionCompaction: compactionResult.session.compaction || null,
          compactedAt: compactionResult.session.compactedAt || null,
          lastRunTraceSummary: trace ? summarizeRunTrace(trace) : null,
          task: representativeTask
            ? {
                id: representativeTask.id,
                title: representativeTask.title || "",
                status: representativeTask.status || "",
                summary: representativeTask.summary || "",
                goal: representativeTask.goal || "",
                updatedAt: representativeTask.updatedAt || null,
              }
            : null,
        },
        memoryCommit,
      };
    }

    return {
      maintenanceCandidate: null,
      memoryCommit,
    };
  }

  async recordRunTrace(sessionId, trace) {
    await this.sessionStore.setLastRunTrace(sessionId, trace || null);
  }

  async applyMemoryMaintenance(sessionId, maintenance) {
    return this.sessionStore.applyMemoryMaintenance(sessionId, maintenance);
  }

  composeMemoryText({
    sessionSummary = "",
    sessionCompaction = null,
    task,
    workspace,
    preferences,
    longTermMemory = [],
    referencedTaskSummaries = [],
    recentSessions = [],
  }) {
    const sections = [];

    const sessionLines = [];
    if (sessionSummary) {
      sessionLines.push(sessionSummary);
    }
    if (sessionCompaction && sessionCompaction.compactedAt) {
      sessionLines.push(`compacted at: ${sessionCompaction.compactedAt}`);
    }
    const sessionSection = formatMemorySection("Session summary", sessionLines);
    if (sessionSection) {
      sections.push(sessionSection);
    }

    const taskLines = [];
    if (task && task.title) {
      taskLines.push(`active task: ${task.title}`);
    }
    if (task && task.goal) {
      taskLines.push(`task goal: ${task.goal}`);
    }
    if (task && task.turnCount > 0) {
      taskLines.push(`task turns so far: ${task.turnCount}`);
    }
    const taskSection = formatMemorySection("Task memory", taskLines);
    if (taskSection) {
      sections.push(taskSection);
    }

    const referencedTaskLines = [];
    for (const item of referencedTaskSummaries.slice(0, 3)) {
      const relation = item.linkedToSession
        ? "linked session"
        : item.sameSession
          ? "same session"
          : "other session";
      referencedTaskLines.push(`${item.title || item.id} (${relation}): ${item.summary}`);
    }
    const referencedTaskSection = formatMemorySection("Referenced task summaries", referencedTaskLines);
    if (referencedTaskSection) {
      sections.push(referencedTaskSection);
    }

    const recentSessionLines = [];
    for (const item of recentSessions.slice(0, 5)) {
      const prompt = item.lastPrompt ? `last user: ${item.lastPrompt}` : `title: ${item.title}`;
      const reply = item.lastAssistantReply ? `; last assistant: ${item.lastAssistantReply}` : "";
      const summary = item.summary ? `; session summary: ${item.summary}` : "";
      const task = formatRecentSessionTask(item.task);
      recentSessionLines.push(`${prompt}${reply}${summary}${task}; updated: ${item.updatedAt || "unknown"}`);
    }
    const recentSessionSection = formatMemorySection(
      "Recent session memory",
      recentSessionLines
    );
    if (recentSessionSection) {
      sections.push(
        `${recentSessionSection}\nUse this section when the user asks what they asked, said, or worked on previously. If several candidates fit, say which one is most recent.`
      );
    }

    const workspaceLines = [];
    if (workspace && workspace.rootPath) {
      workspaceLines.push(`root path: ${workspace.rootPath}`);
    }
    if (workspace && workspace.detected && workspace.detected.packageManager) {
      workspaceLines.push(`package manager: ${workspace.detected.packageManager}`);
    }
    if (workspace && workspace.detected && workspace.detected.languages.length) {
      workspaceLines.push(`languages: ${workspace.detected.languages.join(", ")}`);
    }
    if (workspace && workspace.detected && workspace.detected.manifests.length) {
      workspaceLines.push(`manifests: ${workspace.detected.manifests.join(", ")}`);
    }
    if (workspace && workspace.detected && workspace.detected.testCommand) {
      workspaceLines.push(`suggested test command: ${workspace.detected.testCommand}`);
    }
    if (
      workspace &&
      workspace.detected &&
      Array.isArray(workspace.detected.verificationCommands) &&
      workspace.detected.verificationCommands.length
    ) {
      const commands = workspace.detected.verificationCommands
        .slice(0, 3)
        .map((item) => `${item.command}${item.args && item.args.length ? ` ${item.args.join(" ")}` : ""}`);
      workspaceLines.push(`verification commands: ${commands.join(" ; ")}`);
    }
    const workspaceSection = formatMemorySection("Workspace memory", workspaceLines);
    if (workspaceSection) {
      sections.push(workspaceSection);
    }

    const preferenceLines = [];
    if (preferences.preferredLanguage && preferences.preferredLanguage.value) {
      preferenceLines.push(`preferred language: ${preferences.preferredLanguage.value}`);
    }
    const preferenceSection = formatMemorySection("User memory", preferenceLines);
    if (preferenceSection) {
      sections.push(preferenceSection);
    }

    const longTermLines = Array.isArray(longTermMemory)
      ? longTermMemory
          .slice(0, 6)
          .map((record) => `${record.kind}: ${record.title}${record.text ? ` - ${record.text}` : ""}`)
      : [];
    const longTermSection = formatMemorySection("Long-term memory", longTermLines);
    if (longTermSection) {
      sections.push(longTermSection);
    }

    if (!sections.length) {
      return "";
    }

    return ["Memory context", ...sections].join("\n\n");
  }

  composeMemorySlices({
    sessionSummary = "",
    sessionCompaction = null,
    task,
    workspace,
    preferences,
    longTermMemory = [],
    referencedTaskSummaries = [],
    recentSessions = [],
  }) {
    const sessionLines = [];
    if (sessionSummary) {
      sessionLines.push(sessionSummary);
    }
    if (sessionCompaction && sessionCompaction.compactedAt) {
      sessionLines.push(`compacted at: ${sessionCompaction.compactedAt}`);
    }

    const taskLines = [];
    if (task && task.title) {
      taskLines.push(`active task: ${task.title}`);
    }
    if (task && task.goal) {
      taskLines.push(`task goal: ${task.goal}`);
    }
    if (task && task.summary) {
      taskLines.push(`task summary: ${task.summary}`);
    }
    if (task && task.lastOutcome) {
      taskLines.push(`last outcome: ${task.lastOutcome}`);
    }
    if (task && task.turnCount > 0) {
      taskLines.push(`task turns so far: ${task.turnCount}`);
    }

    const workspaceLines = [];
    if (workspace && workspace.rootPath) {
      workspaceLines.push(`root path: ${workspace.rootPath}`);
    }
    if (workspace && workspace.detected && workspace.detected.packageManager) {
      workspaceLines.push(`package manager: ${workspace.detected.packageManager}`);
    }
    if (workspace && workspace.detected && workspace.detected.languages.length) {
      workspaceLines.push(`languages: ${workspace.detected.languages.join(", ")}`);
    }
    if (workspace && workspace.detected && workspace.detected.manifests.length) {
      workspaceLines.push(`manifests: ${workspace.detected.manifests.join(", ")}`);
    }
    if (workspace && workspace.detected && workspace.detected.testCommand) {
      workspaceLines.push(`suggested test command: ${workspace.detected.testCommand}`);
    }
    if (
      workspace &&
      workspace.detected &&
      Array.isArray(workspace.detected.verificationCommands) &&
      workspace.detected.verificationCommands.length
    ) {
      const commands = workspace.detected.verificationCommands
        .slice(0, 3)
        .map((item) => `${item.command}${item.args && item.args.length ? ` ${item.args.join(" ")}` : ""}`);
      workspaceLines.push(`verification commands: ${commands.join(" ; ")}`);
    }

    const referencedTaskLines = referencedTaskSummaries.slice(0, 3).map((item) => {
      const relation = item.linkedToSession
        ? "linked session"
        : item.sameSession
          ? "same session"
          : "other session";
      return `${item.title || item.id} (${relation}): ${item.summary}`;
    });

    const recentSessionLines = recentSessions.slice(0, 3).map((item) => {
      const prompt = item.lastPrompt ? `last user: ${item.lastPrompt}` : `title: ${item.title}`;
      const summary = item.summary ? `; session summary: ${item.summary}` : "";
      return `${prompt}${summary}; updated: ${item.updatedAt || "unknown"}`;
    });

    const preferenceLines = [];
    if (preferences && preferences.preferredLanguage && preferences.preferredLanguage.value) {
      preferenceLines.push(`preferred language: ${preferences.preferredLanguage.value}`);
    }

    const longTermLines = Array.isArray(longTermMemory)
      ? longTermMemory
          .slice(0, 6)
          .map((record) => `${record.kind}: ${record.title}${record.text ? ` - ${record.text}` : ""}`)
      : [];

    return {
      session: sessionLines.join("\n"),
      task: taskLines.join("\n"),
      workspace: workspaceLines.join("\n"),
      referencedTasks: referencedTaskLines.join("\n"),
      recentSessions: recentSessionLines.join("\n"),
      user: preferenceLines.join("\n"),
      longTerm: longTermLines.join("\n"),
    };
  }
}

function extractMessageText(item) {
  const content = Array.isArray(item.content) ? item.content : [];
  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      if (typeof part.text === "string") {
        return part.text;
      }
      if (typeof part.input_text === "string") {
        return part.input_text;
      }
      if (typeof part.output_text === "string") {
        return part.output_text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildWindowArchiveRecord({ session, tasks = [], workspaceId, reason }) {
  const history = session && Array.isArray(session.history) ? session.history : [];
  const userPrompts = history
    .filter((item) => item && item.type === "message" && item.role === "user")
    .map(extractMessageText)
    .filter(Boolean)
    .slice(-5);
  const assistantReplies = history
    .filter((item) => item && item.type === "message" && item.role === "assistant")
    .map(extractMessageText)
    .filter(Boolean)
    .slice(-3);
  const taskSummaries = tasks
    .filter(Boolean)
    .map((task) => [task.title, task.summary || task.lastOutcome || task.goal].filter(Boolean).join(": "))
    .filter(Boolean)
    .slice(0, 5);
  const sections = [];

  if (session && session.summary) {
    sections.push(`Window summary: ${sanitizeArchiveText(session.summary, 1200)}`);
  }
  if (taskSummaries.length) {
    sections.push(`Work state: ${taskSummaries.map((item) => sanitizeArchiveText(item, 600)).join(" | ")}`);
  }
  if (userPrompts.length) {
    sections.push(`Recent user prompts: ${userPrompts.map((item) => sanitizeArchiveText(item, 280)).join(" | ")}`);
  }
  if (assistantReplies.length) {
    sections.push(`Recent assistant outcomes: ${assistantReplies.map((item) => sanitizeArchiveText(item, 360)).join(" | ")}`);
  }

  const text = sections.join("\n").trim();
  if (!text) {
    return {
      kind: "window_archive",
      scope: "workspace",
      workspaceId,
      title: "",
      text: "",
    };
  }

  const titleSource =
    (session && session.lastPrompt) ||
    (taskSummaries.length ? taskSummaries[0] : "") ||
    "Archived Mochi window";

  return {
    kind: "window_archive",
    scope: "workspace",
    workspaceId,
    title: sanitizeArchiveText(titleSource, 96) || "Archived Mochi window",
    text,
    content: {
      sessionId: session && session.id ? session.id : "",
      messageCount: session && session.messageCount ? session.messageCount : history.length,
      archivedReason: reason || "",
      taskCount: tasks.length,
    },
    source: "window_archive",
    confidence: "derived",
    evidence: {
      type: "current_window_archive",
      summary: `Archived ${history.length} history items and ${tasks.length} working-state records.`,
    },
  };
}

function sanitizeArchiveText(value, limit) {
  const text = String(value || "")
    .replace(/sk-[A-Za-z0-9_\-]{12,}/g, "[redacted-openai-key]")
    .replace(/AIza[A-Za-z0-9_\-]{12,}/g, "[redacted-gemini-key]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, limit);
}

function extractBaseSessionId(sessionId, workspaceId) {
  const suffix = `:${workspaceId}`;
  if (typeof sessionId === "string" && sessionId.endsWith(suffix)) {
    return sessionId.slice(0, -suffix.length);
  }
  return sessionId || "";
}

function createSessionTitle(session) {
  const prompt = String(session && session.lastPrompt ? session.lastPrompt : "").trim();
  if (prompt) {
    const cleanPrompt = prompt.replace(/\s+/g, " ");
    return cleanPrompt.length > 28 ? `${cleanPrompt.slice(0, 25)}...` : cleanPrompt;
  }

  const createdAt = session && session.createdAt ? new Date(session.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return `New chat ${createdAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
  }

  return "New chat";
}

function createUntitledBaseSessionId() {
  return `mochi-chat-${Date.now()}`;
}

function formatRecentSessionTask(task) {
  if (!task) {
    return "";
  }

  const parts = [];
  if (task.title) {
    parts.push(`task: ${task.title}`);
  }
  if (task.status) {
    parts.push(`status: ${task.status}`);
  }
  if (task.summary) {
    parts.push(`summary: ${task.summary}`);
  } else if (task.lastOutcome) {
    parts.push(`outcome: ${task.lastOutcome}`);
  }
  if (task.turnCount > 0) {
    parts.push(`turns: ${task.turnCount}`);
  }

  return parts.length ? `; ${parts.join("; ")}` : "";
}

function extractLastAssistantText(session) {
  const history = session && Array.isArray(session.history) ? session.history : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item && item.type === "message" && item.role === "assistant") {
      const text = extractMessageText(item);
      if (text) {
        return text.length > 160 ? `${text.slice(0, 157)}...` : text;
      }
    }
  }
  return "";
}

module.exports = {
  MemoryManager,
};
