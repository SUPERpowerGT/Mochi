const { JsonFileStore } = require("./json_file_store");
const { deriveTaskTitle, nowIso, scorePromptOverlap } = require("./memory_utils");
const { decideTaskRoute } = require("./task_router");
const { DEFAULT_TASK_POLICY } = require("./task_policy");

class TaskStore {
  constructor(options = {}) {
    this.policy = options.policy || DEFAULT_TASK_POLICY;
    this.maxInactiveTasksPerSession = Number.isFinite(options.maxInactiveTasksPerSession)
      ? options.maxInactiveTasksPerSession
      : 20;
    this.store = new JsonFileStore({
      storageRoot: options.storageRoot,
      filename: "tasks.json",
      defaultData: {
        version: 1,
        tasks: {},
      },
    });
  }

  async getActiveTaskForSession(sessionId) {
    const data = await this.store.read();
    return this.findMostRecentActiveTask(data, sessionId);
  }

  async planActiveTask({ sessionId, workspaceId, prompt, focusedTaskId = null }) {
    const data = await this.store.update((current) => {
      this.normalizeTasksForSession(current, sessionId);
      return current;
    });
    const currentTask =
      (focusedTaskId && data.tasks[focusedTaskId]) ||
      this.findMostRecentActiveTask(data, sessionId);
    const inactiveTasks = Object.values(data.tasks).filter(
      (item) =>
        item.workspaceId === workspaceId &&
        item.id !== (currentTask ? currentTask.id : null) &&
        item.status !== "archived"
    );
    const route = decideTaskRoute({
      currentTask,
      inactiveTasks,
      prompt,
      policy: this.policy,
    });
    const routeInfo = {
      action: route.action,
      reason: route.reason,
      score: route.score,
      diagnostics: route.diagnostics,
      evaluatedAt: nowIso(),
    };

    let previewTask = null;

    if (route.action === "continue" && currentTask) {
      previewTask = {
        ...currentTask,
        routeReason: route.reason,
        lastRoute: routeInfo,
        updatedAt: nowIso(),
      };
    } else if (route.action === "reactivate" && route.targetTask) {
      previewTask = {
        ...route.targetTask,
        status: "active",
        endedAt: null,
        reactivatedAt: nowIso(),
        routeReason: route.reason,
        lastRoute: routeInfo,
        updatedAt: nowIso(),
      };
    } else {
      previewTask = {
        id: `task:${sessionId}:${Date.now()}`,
        sessionId,
        workspaceId,
        title: deriveTaskTitle(prompt),
        goal: prompt,
        status: "active",
        sessionIds: [sessionId],
        lastSessionId: sessionId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        turnCount: 0,
        lastUserPrompt: "",
        latestAssistantReply: "",
        summary: "",
        lastOutcome: "",
        notes: [],
        relatedFiles: [],
        routeReason: route.reason,
        lastRoute: routeInfo,
      };
    }

    return {
      action: route.action,
      routeInfo,
      currentTaskId: currentTask ? currentTask.id : null,
      targetTaskId: previewTask.id,
      previewTask,
    };
  }

  async commitPlannedTask(plan, { prompt, reply, sessionId }) {
    if (!plan || !plan.previewTask) {
      return null;
    }

    const data = await this.store.update((current) => {
      const activeTask = plan.currentTaskId ? current.tasks[plan.currentTaskId] || null : null;
      let task = null;

      if (plan.action === "continue") {
        task = current.tasks[plan.targetTaskId] || activeTask;
        if (!task) {
          task = {
            ...plan.previewTask,
          };
          current.tasks[task.id] = task;
        }
        task.routeReason = plan.routeInfo.reason;
        task.lastRoute = plan.routeInfo;
      } else if (plan.action === "reactivate") {
        if (activeTask && activeTask.status === "active") {
          activeTask.status = "inactive";
          activeTask.endedAt = nowIso();
          activeTask.rolloverReason = plan.routeInfo.reason;
          activeTask.rolloverRouteInfo = plan.routeInfo;
        }

        task = current.tasks[plan.targetTaskId];
        if (!task) {
          task = {
            ...plan.previewTask,
          };
          current.tasks[task.id] = task;
        }
        task.status = "active";
        task.endedAt = null;
        task.reactivatedAt = nowIso();
        task.routeReason = plan.routeInfo.reason;
        task.lastRoute = plan.routeInfo;
      } else {
        if (activeTask && activeTask.status === "active") {
          activeTask.status = "inactive";
          activeTask.endedAt = nowIso();
          activeTask.rolloverReason = plan.routeInfo.reason;
          activeTask.rolloverRouteInfo = plan.routeInfo;
        }

        task = current.tasks[plan.targetTaskId];
        if (!task) {
          task = {
            ...plan.previewTask,
          };
          current.tasks[task.id] = task;
        }
        task.status = "active";
        task.routeReason = plan.routeInfo.reason;
        task.lastRoute = plan.routeInfo;
      }

      task.turnCount += 1;
      task.lastUserPrompt = prompt;
      task.latestAssistantReply = reply;
      linkTaskToSession(task, sessionId || task.sessionId);
      task.summary = summarizeTask(task, { prompt, reply });
      task.lastOutcome = summarizeReply(reply);
      task.updatedAt = nowIso();
      this.normalizeTasksForSession(current, task.sessionId, {
        activeTaskId: task.id,
        routeInfo: plan.routeInfo,
      });
      return current;
    });

    return data.tasks[plan.targetTaskId] || null;
  }

  async recordTurn(taskId, { prompt, reply, sessionId }) {
    const data = await this.store.update((current) => {
      const task = current.tasks[taskId];
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      task.turnCount += 1;
      task.lastUserPrompt = prompt;
      task.latestAssistantReply = reply;
      linkTaskToSession(task, sessionId || task.sessionId);
      task.summary = summarizeTask(task, { prompt, reply });
      task.lastOutcome = summarizeReply(reply);
      task.updatedAt = nowIso();
      this.normalizeTasksForSession(current, task.sessionId, {
        activeTaskId: task.status === "active" ? task.id : null,
      });
      return current;
    });

    return data.tasks[taskId];
  }

  async getTask(taskId) {
    const data = await this.store.read();
    return data.tasks[taskId] || null;
  }

  async upsertSyncedTask({ sessionId, workspaceId, task }) {
    if (!task || typeof task !== "object") {
      return null;
    }

    const taskId = task.id || `task:${sessionId}:synced`;
    const data = await this.store.update((current) => {
      const existing = current.tasks[taskId] || {};
      current.tasks[taskId] = {
        ...existing,
        id: taskId,
        sessionId,
        workspaceId,
        title: task.title || existing.title || "Synced task",
        goal: task.goal || existing.goal || "",
        status: task.status || existing.status || "active",
        sessionIds: [sessionId],
        lastSessionId: sessionId,
        createdAt: existing.createdAt || nowIso(),
        updatedAt: task.updatedAt || nowIso(),
        turnCount: Number.isFinite(task.turnCount) ? task.turnCount : existing.turnCount || 0,
        lastUserPrompt: task.lastUserPrompt || existing.lastUserPrompt || "",
        latestAssistantReply: task.latestAssistantReply || existing.latestAssistantReply || "",
        summary: task.summary || existing.summary || "",
        lastOutcome: task.lastOutcome || existing.lastOutcome || "",
        notes: Array.isArray(task.notes) ? task.notes : existing.notes || [],
        relatedFiles: Array.isArray(task.relatedFiles) ? task.relatedFiles : existing.relatedFiles || [],
      };
      this.normalizeTasksForSession(current, sessionId, {
        activeTaskId: current.tasks[taskId].status === "active" ? taskId : null,
      });
      return current;
    });

    return data.tasks[taskId] || null;
  }

  async listReferencedTaskSummaries({ workspaceId, sessionId, prompt, excludeTaskId, limit = 3 }) {
    const data = await this.store.read();
    const candidates = Object.values(data.tasks)
      .filter((task) => {
        if (!task || task.id === excludeTaskId) {
          return false;
        }
        if (workspaceId && task.workspaceId !== workspaceId) {
          return false;
        }
        return Boolean(task.summary || task.lastOutcome || task.goal || task.title);
      })
      .map((task) => ({
        task,
        score: Math.max(
          scorePromptOverlap(prompt, task.goal),
          scorePromptOverlap(prompt, task.lastUserPrompt),
          scorePromptOverlap(prompt, task.summary)
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    return candidates.map(({ task, score }) => ({
      id: task.id,
      title: task.title || "",
      summary: task.summary || task.lastOutcome || task.goal || "",
      status: task.status || "",
      updatedAt: task.updatedAt || null,
      score,
      sameSession: task.sessionId === sessionId,
      linkedToSession: Array.isArray(task.sessionIds) && task.sessionIds.includes(sessionId),
    }));
  }

  async listTasksForSession(sessionId) {
    const data = await this.store.update((current) => {
      this.normalizeTasksForSession(current, sessionId);
      return current;
    });
    return Object.values(data.tasks)
      .filter((item) => isTaskLinkedToSession(item, sessionId))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  findMostRecentActiveTask(data, sessionId) {
    if (!data || !data.tasks || !sessionId) {
      return null;
    }

    return (
      Object.values(data.tasks)
        .filter((item) => item.sessionId === sessionId && item.status === "active")
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0] ||
      null
    );
  }

  normalizeTasksForSession(data, sessionId, options = {}) {
    if (!data || !data.tasks || !sessionId) {
      return;
    }

    const activeTask =
      (options.activeTaskId && data.tasks[options.activeTaskId]) ||
      this.findMostRecentActiveTask(data, sessionId);

    if (activeTask) {
      this.deactivateOtherActiveTasksForSession(data, sessionId, activeTask.id, options.routeInfo);
    }

    this.pruneInactiveTasksForSession(data, sessionId);
  }

  deactivateOtherActiveTasksForSession(data, sessionId, activeTaskId, routeInfo = null) {
    const timestamp = nowIso();
    for (const task of Object.values(data.tasks)) {
      if (
        task.sessionId === sessionId &&
        task.status === "active" &&
        task.id !== activeTaskId
      ) {
        task.status = "inactive";
        task.endedAt = task.endedAt || timestamp;
        task.rolloverReason = routeInfo ? routeInfo.reason : "active-task-normalized";
        task.rolloverRouteInfo = routeInfo || task.rolloverRouteInfo || null;
      }
    }
  }

  pruneInactiveTasksForSession(data, sessionId) {
    if (!data || !data.tasks || !sessionId) {
      return;
    }

    const inactiveTasks = Object.values(data.tasks)
      .filter((item) => item.sessionId === sessionId && item.status !== "active")
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));

    const staleTasks = inactiveTasks.slice(this.maxInactiveTasksPerSession);
    for (const task of staleTasks) {
      delete data.tasks[task.id];
    }
  }
}

function isTaskLinkedToSession(task, sessionId) {
  if (!task || !sessionId) {
    return false;
  }

  if (task.sessionId === sessionId) {
    return true;
  }

  return Array.isArray(task.sessionIds) && task.sessionIds.includes(sessionId);
}

function linkTaskToSession(task, sessionId) {
  if (!task || !sessionId) {
    return;
  }

  task.lastSessionId = sessionId;
  const sessionIds = Array.isArray(task.sessionIds) ? task.sessionIds : [];
  if (!sessionIds.includes(sessionId)) {
    sessionIds.push(sessionId);
  }
  task.sessionIds = sessionIds;
}

function summarizeTask(task, { prompt, reply }) {
  const title = task && task.title ? task.title : deriveTaskTitle(prompt);
  const outcome = summarizeReply(reply);
  if (!outcome) {
    return title;
  }
  return `${title}: ${outcome}`;
}

function summarizeReply(reply) {
  const text = String(reply || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

module.exports = {
  TaskStore,
};
