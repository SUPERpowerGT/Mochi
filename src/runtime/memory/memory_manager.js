const path = require("path");
const os = require("os");
const { SessionStore } = require("./session_store");
const { TaskStore } = require("./task_store");
const { WorkspaceStore } = require("./workspace_store");
const { UserStore } = require("./user_store");
const { classifyTurn } = require("./turn_classifier");
const { loadProjectInstructions } = require("../support/project_instructions");
const { summarizeRunTrace } = require("../support/trace_summary");
const {
  DEFAULT_IDENTITY,
  normalizeIdentity,
  createIdentityStorageRoot,
} = require("../support/runtime_identity");
const { SessionSyncClient } = require("../support/session_sync_client");
const {
  createSessionId,
  createWorkspaceId,
  createWorkspaceSyncKey,
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
    this.baseStorageRoot =
      options.storageRoot ||
      path.join(os.homedir(), ".mochi", "memory");
    this.currentIdentity = normalizeIdentity(options.currentIdentity || DEFAULT_IDENTITY);
    this.sessionSyncClient = options.sessionSyncClient || new SessionSyncClient({
      baseUrl: options.sessionSyncBaseUrl,
      authToken: options.sessionSyncAuthToken,
    });
    this.hydratedSessionIds = new Set();
    this.storageRoot = createIdentityStorageRoot(this.baseStorageRoot, this.currentIdentity);
    this.initializeStores();
  }

  initializeStores() {
    this.sessionStore = new SessionStore({
      storageRoot: this.storageRoot,
      compactionPolicy: this.compactionPolicy,
    });
    this.taskStore = new TaskStore({ storageRoot: this.storageRoot });
    this.workspaceStore = new WorkspaceStore({ storageRoot: this.storageRoot });
    this.userStore = new UserStore({ storageRoot: this.storageRoot });
  }

  setBaseSessionId(baseSessionId) {
    this.baseSessionId = baseSessionId || "primary-chat";
  }

  getBaseSessionId() {
    return this.baseSessionId;
  }

  setIdentity(identity) {
    this.currentIdentity = normalizeIdentity(identity || this.currentIdentity || DEFAULT_IDENTITY);
    this.storageRoot = createIdentityStorageRoot(this.baseStorageRoot, this.currentIdentity);
    this.hydratedSessionIds.clear();
    this.initializeStores();
  }

  getIdentity() {
    return this.currentIdentity;
  }

  setSessionSyncAuthToken(token) {
    if (this.sessionSyncClient && this.sessionSyncClient.setAuthToken) {
      this.sessionSyncClient.setAuthToken(token);
    }
  }

  async ensureCurrentSession() {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const sessionId = createSessionId(this.baseSessionId, workspaceId);
    const session = await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    const workspace = await this.workspaceStore.getOrCreateWorkspace(workspaceId, workspaceRoot);
    await this.hydrateSessionFromSyncIfNeeded({
      sessionId,
      baseSessionId: this.baseSessionId,
      workspaceId,
      workspaceRoot,
      session,
      workspace,
    });
    return this.sessionStore.getSession(sessionId);
  }

  async prepareRun(prompt, options = {}) {
    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const baseSessionId = options.baseSessionId || this.baseSessionId;
    const sessionId = createSessionId(baseSessionId, workspaceId);

    let session = await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    let workspace = await this.workspaceStore.getOrCreateWorkspace(workspaceId, workspaceRoot);
    await this.hydrateSessionFromSyncIfNeeded({
      sessionId,
      baseSessionId,
      workspaceId,
      workspaceRoot,
      session,
      workspace,
    });
    session = await this.sessionStore.getSession(sessionId);
    workspace = await this.workspaceStore.getWorkspace(workspaceId);
    const projectInstructions = loadProjectInstructions(workspaceRoot);
    const focusedTaskId =
      session && (session.focusedTaskId || session.activeTaskId)
        ? session.focusedTaskId || session.activeTaskId
        : null;
    const currentTask = focusedTaskId
      ? await this.taskStore.getTask(focusedTaskId)
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
    const preferences = await this.userStore.getPreferences();

    const preferredLanguage = detectPreferredLanguage(prompt);
    if (preferredLanguage && !preferences.preferredLanguage) {
      await this.userStore.setPreference("preferredLanguage", preferredLanguage, {
        confidence: "observed",
        source: "prompt-language",
      });
    }

    const freshPreferences = await this.userStore.getPreferences();
    const referencedTaskSummaries = await this.taskStore.listReferencedTaskSummaries({
      workspaceId,
      sessionId,
      prompt,
      excludeTaskId: task ? task.id : null,
    });
    const recentSessions = isMemoryRecallPrompt(prompt)
      ? await this.listRecentSessionSummaries({ workspaceId, sessionId })
      : [];
    const memorySlices = this.composeMemorySlices({
      sessionSummary: session.summary || "",
      sessionCompaction: session.compaction || null,
      task,
      workspace,
      preferences: freshPreferences,
      referencedTaskSummaries,
      recentSessions,
    });
    const memoryText = this.composeMemoryText({
      sessionSummary: session.summary || "",
      sessionCompaction: session.compaction || null,
      task,
      workspace,
      preferences: freshPreferences,
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
    const recentSessions = session && isMemoryRecallPrompt(session.lastPrompt)
      ? await this.listRecentSessionSummaries({ workspaceId, sessionId })
      : [];
    const memoryText = this.composeMemoryText({
      sessionSummary: session.summary || "",
      sessionCompaction: session.compaction || null,
      task,
      workspace,
      preferences,
      referencedTaskSummaries: [],
      recentSessions,
    });
    const lastRunTrace = session && session.lastRunTrace ? session.lastRunTrace : null;

    return {
      generatedAt: new Date().toISOString(),
      baseSessionId: this.baseSessionId,
      identity: this.currentIdentity,
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
      workspace,
      projectInstructions: {
        sources: projectInstructions.sources,
        text: projectInstructions.text,
      },
      preferences,
      memoryText,
    };
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

  async finalizeRun({ sessionId, taskId, taskPlan, prompt, reply, history, trace }) {
    await this.sessionStore.setHistory(sessionId, history, prompt);
    const compactionResult = await this.sessionStore.compactHistoryIfNeeded(sessionId);
    await this.sessionStore.setLastRunTrace(sessionId, trace || null);
    if (taskPlan) {
      const committedTask = await this.taskStore.commitPlannedTask(taskPlan, {
        prompt,
        reply,
        sessionId,
      });
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
    }

    await this.uploadSessionSyncSnapshot({
      sessionId,
      workspaceId: extractWorkspaceIdFromSessionId(sessionId),
      baseSessionId: extractBaseSessionId(sessionId, extractWorkspaceIdFromSessionId(sessionId)),
      trace,
    });
    await this.uploadChangeSummary({
      sessionId,
      workspaceId: extractWorkspaceIdFromSessionId(sessionId),
      baseSessionId: extractBaseSessionId(sessionId, extractWorkspaceIdFromSessionId(sessionId)),
      prompt,
      reply,
      trace,
    });

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
      };
    }

    return {
      maintenanceCandidate: null,
    };
  }

  async recordRunTrace(sessionId, trace) {
    await this.sessionStore.setLastRunTrace(sessionId, trace || null);
  }

  async hydrateSessionFromSyncIfNeeded({ sessionId, baseSessionId, workspaceId, workspaceRoot, session, workspace }) {
    if (!this.sessionSyncClient || !this.sessionSyncClient.enabled) {
      return;
    }
    if (this.hydratedSessionIds.has(sessionId)) {
      return;
    }
    if (!shouldHydrateFromSync(session)) {
      this.hydratedSessionIds.add(sessionId);
      return;
    }

    const workspaceKey = createWorkspaceSyncKey(workspaceRoot, workspace && workspace.detected ? workspace.detected : null);

    try {
      const snapshot = await this.sessionSyncClient.fetchLatestSnapshot({
        tenantId: this.currentIdentity.tenantId,
        userId: this.currentIdentity.userId,
        workspaceKey,
      });
      if (!snapshot) {
        this.hydratedSessionIds.add(sessionId);
        return;
      }

      await this.sessionStore.applySyncedSession(sessionId, {
        workspaceId,
        summary: snapshot.sessionSummary || "",
        summaryUpdatedAt: snapshot.syncedAt || null,
        lastPrompt: snapshot.lastPrompt || "",
        lastTurn: snapshot.lastTurn || null,
        lastRunTrace: snapshot.lastRunTrace || null,
        messageCount: snapshot.messageCount || 0,
      });

      if (snapshot.task) {
        const syncedTask = await this.taskStore.upsertSyncedTask({
          sessionId,
          workspaceId,
          task: snapshot.task,
        });
        if (syncedTask) {
          await this.sessionStore.updateSession(sessionId, (targetSession) => {
            targetSession.activeTaskId = syncedTask.id;
            targetSession.focusedTaskId = syncedTask.id;
            if (targetSession.lastTurn && !targetSession.lastTurn.linkedTaskId) {
              targetSession.lastTurn.linkedTaskId = syncedTask.id;
            }
          });
        }
      }

      if (snapshot.preferences) {
        await this.userStore.applyPreferences(snapshot.preferences);
      }

      if (snapshot.workspace) {
        await this.workspaceStore.applySyncedWorkspace(workspaceId, workspaceRoot, snapshot.workspace);
      }
    } catch (error) {
      // Session sync should not block local use.
    } finally {
      this.hydratedSessionIds.add(sessionId);
    }
  }

  async uploadSessionSyncSnapshot({ sessionId, workspaceId, baseSessionId, trace }) {
    if (!this.sessionSyncClient || !this.sessionSyncClient.enabled) {
      return;
    }

    const workspaceRoot = this.getWorkspaceRoot();
    const session = await this.sessionStore.getSession(sessionId);
    const task = session && (session.focusedTaskId || session.activeTaskId)
      ? await this.taskStore.getTask(session.focusedTaskId || session.activeTaskId)
      : await this.findRepresentativeTaskForSession(session);
    const workspace = await this.workspaceStore.getWorkspace(workspaceId);
    const preferences = await this.userStore.getPreferences();
    const workspaceKey = createWorkspaceSyncKey(workspaceRoot, workspace && workspace.detected ? workspace.detected : null);
    const traceSummary = trace ? summarizeRunTrace(trace) : summarizeRunTrace(session && session.lastRunTrace ? session.lastRunTrace : null);

    const payload = {
      tenantId: this.currentIdentity.tenantId,
      userId: this.currentIdentity.userId,
      deviceId: this.currentIdentity.deviceId,
      workspaceKey,
      workspaceLabel: workspace && workspace.detected && workspace.detected.projectName
        ? workspace.detected.projectName
        : workspaceRoot,
      baseSessionId,
      syncedAt: new Date().toISOString(),
      sessionSummary: buildSessionSyncSummary({ session, task, traceSummary }),
      lastPrompt: session && session.lastPrompt ? session.lastPrompt : "",
      lastTurn: session && session.lastTurn ? session.lastTurn : null,
      messageCount: session && typeof session.messageCount === "number" ? session.messageCount : 0,
      lastRunTrace: traceSummary,
      task: task
        ? {
            id: task.id,
            title: task.title || "",
            goal: task.goal || "",
            status: task.status || "",
            summary: task.summary || "",
            lastOutcome: task.lastOutcome || "",
            turnCount: task.turnCount || 0,
            lastUserPrompt: task.lastUserPrompt || "",
            latestAssistantReply: task.latestAssistantReply || "",
            updatedAt: task.updatedAt || null,
          }
        : null,
      preferences,
      workspace: workspace
        ? {
            detected: workspace.detected || null,
            notes: Array.isArray(workspace.notes) ? workspace.notes : [],
          }
        : null,
    };

    try {
      await this.sessionSyncClient.uploadSnapshot(payload);
    } catch (error) {
      // Session sync should not block local use.
    }
  }

  async uploadChangeSummary({ sessionId, workspaceId, baseSessionId, prompt, reply, trace }) {
    if (!this.sessionSyncClient || !this.sessionSyncClient.enabled) {
      return;
    }

    const workspaceRoot = this.getWorkspaceRoot();
    const session = await this.sessionStore.getSession(sessionId);
    const task = session && (session.focusedTaskId || session.activeTaskId)
      ? await this.taskStore.getTask(session.focusedTaskId || session.activeTaskId)
      : await this.findRepresentativeTaskForSession(session);
    const workspace = await this.workspaceStore.getWorkspace(workspaceId);
    const workspaceKey = createWorkspaceSyncKey(workspaceRoot, workspace && workspace.detected ? workspace.detected : null);
    const traceSummary = trace ? summarizeRunTrace(trace) : summarizeRunTrace(session && session.lastRunTrace ? session.lastRunTrace : null);
    const changedPaths = traceSummary && Array.isArray(traceSummary.changedPaths)
      ? traceSummary.changedPaths
      : [];

    if (!changedPaths.length && !(task && task.summary) && !(reply && reply.trim())) {
      return;
    }

    const summaryParts = [];
    if (task && task.title) {
      summaryParts.push(`task: ${task.title}`);
    }
    if (task && task.summary) {
      summaryParts.push(task.summary);
    }
    if (traceSummary && traceSummary.outcome) {
      summaryParts.push(traceSummary.outcome);
    }
    if (changedPaths.length) {
      summaryParts.push(`changed files: ${changedPaths.slice(0, 6).join(", ")}`);
    }
    if (!summaryParts.length && reply) {
      summaryParts.push(String(reply).trim().slice(0, 280));
    }

    const payload = {
      tenantId: this.currentIdentity.tenantId,
      userId: this.currentIdentity.userId,
      deviceId: this.currentIdentity.deviceId,
      workspaceKey,
      workspaceLabel: workspace && workspace.detected && workspace.detected.projectName
        ? workspace.detected.projectName
        : workspaceRoot,
      baseSessionId,
      prompt: String(prompt || "").slice(0, 1200),
      summary: summaryParts.join("; ").slice(0, 1600),
      changedPaths,
      verificationStatus: traceSummary && traceSummary.verification && traceSummary.verification.status
        ? traceSummary.verification.status
        : "unknown",
      traceStatus: traceSummary && traceSummary.status ? traceSummary.status : "unknown",
      payload: {
        replyPreview: String(reply || "").slice(0, 500),
        task: task
          ? {
              id: task.id,
              title: task.title || "",
              summary: task.summary || "",
              status: task.status || "",
              updatedAt: task.updatedAt || null,
            }
          : null,
        traceSummary,
      },
    };

    try {
      await this.sessionSyncClient.uploadChangeSummary(payload);
    } catch (error) {
      // Change summary sync should not block local use.
    }
  }

  async listRestoreCheckpoints({ limit = 10 } = {}) {
    if (!this.sessionSyncClient || !this.sessionSyncClient.enabled) {
      return [];
    }

    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const workspace = await this.workspaceStore.getOrCreateWorkspace(workspaceId, workspaceRoot);
    const workspaceKey = createWorkspaceSyncKey(workspaceRoot, workspace && workspace.detected ? workspace.detected : null);

    try {
      return await this.sessionSyncClient.listRestoreCheckpoints({
        tenantId: this.currentIdentity.tenantId,
        userId: this.currentIdentity.userId,
        workspaceKey,
        limit,
      });
    } catch (error) {
      return [];
    }
  }

  async restoreCheckpoint(checkpointId) {
    if (!this.sessionSyncClient || !this.sessionSyncClient.enabled || !checkpointId) {
      return null;
    }

    const workspaceRoot = this.getWorkspaceRoot();
    const workspaceId = createWorkspaceId(workspaceRoot);
    const workspace = await this.workspaceStore.getOrCreateWorkspace(workspaceId, workspaceRoot);
    const workspaceKey = createWorkspaceSyncKey(workspaceRoot, workspace && workspace.detected ? workspace.detected : null);

    let checkpoint = null;
    try {
      checkpoint = await this.sessionSyncClient.fetchRestoreCheckpoint({
        checkpointId,
        tenantId: this.currentIdentity.tenantId,
        userId: this.currentIdentity.userId,
        workspaceKey,
      });
    } catch (error) {
      return null;
    }

    if (!checkpoint) {
      return null;
    }

    const payload = checkpoint.payload && typeof checkpoint.payload === "object"
      ? checkpoint.payload
      : {};
    const baseSessionId = checkpoint.baseSessionId || this.baseSessionId;
    const sessionId = createSessionId(baseSessionId, workspaceId);
    await this.sessionStore.getOrCreateSession(sessionId, workspaceId);
    await this.sessionStore.applySyncedSession(sessionId, {
      workspaceId,
      summary: payload.sessionSummary || checkpoint.summary || "",
      summaryUpdatedAt: checkpoint.createdAt || new Date().toISOString(),
      lastPrompt: payload.lastPrompt || "",
      lastTurn: payload.lastTurn || null,
      lastRunTrace: payload.lastRunTrace || null,
      messageCount: payload.messageCount || 0,
    });

    if (payload.task) {
      const syncedTask = await this.taskStore.upsertSyncedTask({
        sessionId,
        workspaceId,
        task: payload.task,
      });
      if (syncedTask) {
        await this.sessionStore.updateSession(sessionId, (targetSession) => {
          targetSession.activeTaskId = syncedTask.id;
          targetSession.focusedTaskId = syncedTask.id;
          if (targetSession.lastTurn && !targetSession.lastTurn.linkedTaskId) {
            targetSession.lastTurn.linkedTaskId = syncedTask.id;
          }
        });
      }
    }

    if (payload.preferences) {
      await this.userStore.applyPreferences(payload.preferences);
    }

    if (payload.workspace) {
      await this.workspaceStore.applySyncedWorkspace(workspaceId, workspaceRoot, payload.workspace);
    }

    this.hydratedSessionIds.add(sessionId);

    return {
      checkpoint,
      baseSessionId,
      sessionId,
    };
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

    return {
      session: sessionLines.join("\n"),
      task: taskLines.join("\n"),
      workspace: workspaceLines.join("\n"),
      referencedTasks: referencedTaskLines.join("\n"),
      recentSessions: recentSessionLines.join("\n"),
      user: preferenceLines.join("\n"),
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

function extractBaseSessionId(sessionId, workspaceId) {
  const suffix = `:${workspaceId}`;
  if (typeof sessionId === "string" && sessionId.endsWith(suffix)) {
    return sessionId.slice(0, -suffix.length);
  }
  return sessionId || "";
}

function extractWorkspaceIdFromSessionId(sessionId) {
  const text = String(sessionId || "");
  const marker = ":workspace:";
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return "no-workspace";
  }
  return text.slice(markerIndex + 1);
}

function shouldHydrateFromSync(session) {
  if (!session || typeof session !== "object") {
    return true;
  }

  const history = Array.isArray(session.history) ? session.history : [];
  return !history.length && !session.summary && !session.lastPrompt && !session.lastRunTrace;
}

function buildSessionSyncSummary({ session, task, traceSummary }) {
  if (session && session.summary) {
    return session.summary;
  }

  const parts = [];
  if (session && session.lastPrompt) {
    parts.push(`last user request: ${session.lastPrompt}`);
  }
  if (task && task.summary) {
    parts.push(`task summary: ${task.summary}`);
  } else if (task && task.lastOutcome) {
    parts.push(`task outcome: ${task.lastOutcome}`);
  }
  if (traceSummary && traceSummary.outcome) {
    parts.push(`latest run: ${traceSummary.outcome}`);
  }

  return parts.join("; ");
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
