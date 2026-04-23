function createCompactMemorySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {};
  }

  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const recentTasks = tasks.slice(0, 8).map((task) => ({
    title: task.title || "",
    status: task.status || "",
    turnCount: task.turnCount || 0,
    updatedAt: task.updatedAt || null,
  }));

  return {
    generatedAt: snapshot.generatedAt || null,
    storage: {
      localOnly: true,
      root: snapshot.storageRoot || "",
      note: "Mochi memory is stored in the local VS Code extension storage area and is not part of the workspace repository.",
    },
    workspaceRoot: snapshot.workspaceRoot || "",
    provider: snapshot.provider || null,
    sessionId: snapshot.sessionId || "",
    sessionSummary: snapshot.session
      ? {
          hasSummary: Boolean(snapshot.session.summary),
          summary: snapshot.session.summary || "",
          summaryUpdatedAt: snapshot.session.summaryUpdatedAt || null,
          compaction: snapshot.session.compaction || null,
          retainedHistoryItems: Array.isArray(snapshot.session.history)
            ? snapshot.session.history.length
            : 0,
        }
      : null,
    lastTurn: snapshot.lastTurn || null,
    traceSummary: snapshot.traceSummary || null,
    focusedTask: snapshot.task
      ? {
          title: snapshot.task.title || "",
          goal: snapshot.task.goal || "",
          status: snapshot.task.status || "",
          sessionIds: Array.isArray(snapshot.task.sessionIds) ? snapshot.task.sessionIds : [],
          lastSessionId: snapshot.task.lastSessionId || "",
          turnCount: snapshot.task.turnCount || 0,
          updatedAt: snapshot.task.updatedAt || null,
        }
      : null,
    activeTask: snapshot.task
      ? {
          title: snapshot.task.title || "",
          goal: snapshot.task.goal || "",
          status: snapshot.task.status || "",
          turnCount: snapshot.task.turnCount || 0,
          updatedAt: snapshot.task.updatedAt || null,
        }
      : null,
    taskRouting: snapshot.taskRouting || null,
    taskCount: tasks.length,
    recentTasks,
    workspace: snapshot.workspace
      ? {
          rootPath: snapshot.workspace.rootPath || "",
          detected: snapshot.workspace.detected || null,
        }
      : null,
    preferences: snapshot.preferences || {},
    rawSnapshotNote:
      "This is the compact view. Run Local Agent: Open Raw Memory Snapshot for full session history, raw traces, and all tasks.",
  };
}

module.exports = {
  createCompactMemorySnapshot,
};
