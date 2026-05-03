class ChatController {
  constructor(options = {}) {
    this.vscode = options.vscode;
    this.runtime = options.runtime;
    this.getWorkspaceDescription = options.getWorkspaceDescription;
    this.getEditorContext = options.getEditorContext;
    this.openChatView = options.openChatView;
    this.postToChatView = options.postToChatView;
    this.getLastReply = options.getLastReply;
    this.setLastReply = options.setLastReply;
    this.getPendingPrefill = options.getPendingPrefill;
    this.setPendingPrefill = options.setPendingPrefill;
    this.getPendingReplies = options.getPendingReplies;
    this.setPendingReplies = options.setPendingReplies;
    this.getPendingApprovals = options.getPendingApprovals;
    this.setPendingApprovals = options.setPendingApprovals;
    this.resolveApprovalDecision = options.resolveApprovalDecision;
    this.getPendingActivities = options.getPendingActivities;
    this.setPendingActivities = options.setPendingActivities;
    this.getPendingReplyStream = options.getPendingReplyStream;
    this.setPendingReplyStream = options.setPendingReplyStream;
    this.getSessionLabel = options.getSessionLabel;
    this.createNewSession = options.createNewSession;
    this.switchSession = options.switchSession;
    this.deleteSession = options.deleteSession;
    this.sessionSyncVersion = 0;
  }

  async flushPendingUiState() {
    this.postToChatView({
      type: "workspace",
      value: this.getWorkspaceDescription(),
    });
    await this.syncSessionUi();

    const pendingPrefill = this.getPendingPrefill();
    if (pendingPrefill) {
      this.postToChatView({
        type: "prefill",
        value: pendingPrefill,
      });
      this.setPendingPrefill("");
    }

    const pendingReplies = this.getPendingReplies();
    for (const reply of pendingReplies) {
      this.postToChatView({ type: "reply", value: reply, baseSessionId: this.getSessionLabel ? this.getSessionLabel() : "" });
    }
    this.setPendingReplies([]);

    const pendingApprovals = this.getPendingApprovals();
    for (const approval of pendingApprovals) {
      this.postToChatView({
        type: "approvalRequest",
        value: approval,
        baseSessionId: approval.baseSessionId || "",
      });
    }

    const pendingActivities = this.getPendingActivities();
    for (const activity of pendingActivities) {
      this.postToChatView({ type: "activity", value: activity });
    }
    this.setPendingActivities([]);

    const pendingReplyStream = this.getPendingReplyStream();
    if (pendingReplyStream) {
      this.postToChatView({
        type: "replyStreamSync",
        value: pendingReplyStream,
        baseSessionId: this.getSessionLabel ? this.getSessionLabel() : "",
      });
      this.setPendingReplyStream("");
    }
  }

  async syncSessionUi() {
    const baseSessionId = this.getSessionLabel ? this.getSessionLabel() : "";
    const syncVersion = ++this.sessionSyncVersion;
    if (this.runtime.listCurrentWorkspaceSessionsForUi) {
      const sessions = await this.runtime.listCurrentWorkspaceSessionsForUi();
      if (syncVersion !== this.sessionSyncVersion) {
        return;
      }
      this.postToChatView({
        type: "sessionList",
        value: sessions,
        syncVersion,
      });
    }

    this.postToChatView({
      type: "sessionInfo",
      value: baseSessionId,
      syncVersion,
    });

    const messages = await this.runtime.getCurrentSessionMessagesForUi(baseSessionId);
    if (syncVersion !== this.sessionSyncVersion) {
      return;
    }
    this.postToChatView({
      type: "sessionHistory",
      value: messages,
      baseSessionId,
      syncVersion,
    });
  }

  async syncSessionTabs() {
    const baseSessionId = this.getSessionLabel ? this.getSessionLabel() : "";
    if (this.runtime.listCurrentWorkspaceSessionsForUi) {
      const sessions = await this.runtime.listCurrentWorkspaceSessionsForUi();
      this.postToChatView({
        type: "sessionList",
        value: sessions,
      });
    }

    this.postToChatView({
      type: "sessionInfo",
      value: baseSessionId,
    });
  }

  async handleWebviewMessage(message) {
    if (message.type === "ready") {
      await this.syncSessionUi();
      return;
    }

    if (message.type === "clientError") {
      this.vscode.window.showErrorMessage(`Chat UI error: ${message.value}`);
      return;
    }

    if (message.type === "openMemorySnapshot") {
      await this.vscode.commands.executeCommand("localAgent.openMemorySnapshot");
      return;
    }

    if (message.type === "send") {
      const runBaseSessionId =
        message.baseSessionId ||
        (this.runtime.getBaseSessionId ? this.runtime.getBaseSessionId() : "");
      try {
        const reply = await this.runtime.sendMessage(message.prompt, {
          includeEditorContext: message.includeSelection,
          baseSessionId: runBaseSessionId,
        });
        this.setLastReply(reply);
        if (this.isCurrentSession(runBaseSessionId)) {
          this.setPendingReplyStream("");
          this.setPendingActivities([]);
          this.postToChatView({
            type: "clearActivity",
            baseSessionId: runBaseSessionId,
          });
          this.postToChatView({
            type: "reply",
            value: reply,
            baseSessionId: runBaseSessionId,
          });
        }
        await this.syncSessionTabs();
        // Best-effort: push trace summary to webview after run completes
        this.pushTraceToWebview(runBaseSessionId).catch(() => {});
      } catch (error) {
        if (this.isCurrentSession(runBaseSessionId)) {
          this.setPendingReplyStream("");
          this.setPendingActivities([]);
          this.postToChatView({
            type: "clearActivity",
            baseSessionId: runBaseSessionId,
          });
        }
        this.vscode.window.showErrorMessage(error.message || String(error));
        if (this.isCurrentSession(runBaseSessionId)) {
          this.postToChatView({
            type: "error",
            value: error.message || String(error),
            baseSessionId: runBaseSessionId,
          });
        }
      }
      return;
    }

    if (message.type === "approvalDecision") {
      this.resolveApprovalDecision(message.id, Boolean(message.approved));
      return;
    }

    if (message.type === "newSession") {
      if (this.createNewSession) {
        await this.createNewSession();
      }
      return;
    }

    if (message.type === "switchSession") {
      if (this.switchSession) {
        await this.switchSession(message.baseSessionId);
      }
      return;
    }

    if (message.type === "closeSession" || message.type === "deleteSession") {
      if (this.deleteSession) {
        await this.deleteSession(message.baseSessionId);
      }
      return;
    }

    if (message.type === "insertLastReply") {
      await this.vscode.commands.executeCommand("localAgent.applyLastReply");
    }
  }

  async handleSendSelection() {
    this.openChatView();
    const selectionContext = this.getEditorContext();
    if (!selectionContext) {
      this.vscode.window.showInformationMessage("Open a file and select some text first.");
      return;
    }

    this.setPendingPrefill(selectionContext);
    if (
      this.postToChatView({
        type: "prefill",
        value: selectionContext,
      })
    ) {
      this.setPendingPrefill("");
    }
  }

  async handleApplyLastReply() {
    const editor = this.vscode.window.activeTextEditor;
    if (!editor) {
      this.vscode.window.showInformationMessage("Open a file first.");
      return;
    }

    const lastReply = this.getLastReply();
    if (!lastReply) {
      this.vscode.window.showInformationMessage("No assistant reply is available yet.");
      return;
    }

    await editor.edit((editBuilder) => {
      const selection = editor.selection;
      if (selection && !selection.isEmpty) {
        editBuilder.replace(selection, lastReply);
      } else {
        editBuilder.insert(selection.active, lastReply);
      }
    });
  }

  async handleQuickAsk() {
    const prompt = await this.vscode.window.showInputBox({
      prompt: "Ask the local agent",
      placeHolder: "Summarize the current file",
    });
    if (!prompt) {
      return;
    }

    try {
      const reply = await this.runtime.sendMessage(prompt, {
        includeEditorContext: true,
      });
      this.setLastReply(reply);
      this.setPendingReplyStream("");
      this.setPendingActivities([]);
      this.postToChatView({
        type: "clearActivity",
      });
      this.openChatView();
      if (!this.postToChatView({ type: "reply", value: reply })) {
        this.setPendingReplies([...this.getPendingReplies(), reply]);
      }
      this.vscode.window.showInformationMessage("Local agent replied in the chat panel.");
    } catch (error) {
      this.setPendingReplyStream("");
      this.setPendingActivities([]);
      this.postToChatView({
        type: "clearActivity",
      });
      this.vscode.window.showErrorMessage(error.message || String(error));
    }
  }

  handleRuntimeActivity(activity) {
    const baseSessionId = activity && activity.baseSessionId ? activity.baseSessionId : "";
    if (!this.isCurrentSession(baseSessionId)) {
      return;
    }

    if (!this.postToChatView({ type: "activity", value: activity, baseSessionId })) {
      this.setPendingActivities([...this.getPendingActivities(), activity]);
    }
  }

  handleRuntimeReplyDelta(event) {
    const delta = typeof event === "string" ? event : event && event.delta ? event.delta : "";
    const baseSessionId = event && typeof event === "object" ? event.baseSessionId || "" : "";
    if (!delta) {
      return;
    }

    if (!this.isCurrentSession(baseSessionId)) {
      return;
    }

    if (!this.postToChatView({ type: "replyDelta", value: delta, baseSessionId })) {
      this.setPendingReplyStream(this.getPendingReplyStream() + delta);
    }
  }

  handleRuntimeReplyControl(control) {
    if (!control || !control.type) {
      return;
    }

    if (control.type === "clear_stream") {
      const baseSessionId = control.baseSessionId || "";
      if (!this.isCurrentSession(baseSessionId)) {
        return;
      }

      this.setPendingReplyStream("");
      this.postToChatView({ type: "replyStreamClear", value: control, baseSessionId });
    }
  }

  async pushTraceToWebview(baseSessionId) {
    if (!this.runtime.getMemorySnapshot) {
      return;
    }
    const snapshot = await this.runtime.getMemorySnapshot();
    const lastRunTrace = snapshot && snapshot.lastRunTrace ? snapshot.lastRunTrace : null;
    if (!lastRunTrace) {
      return;
    }
    const card = buildTraceCard(lastRunTrace);
    this.postToChatView({
      type: "traceUpdate",
      value: card,
      baseSessionId: baseSessionId || "",
    });
  }

  isCurrentSession(baseSessionId) {
    if (!baseSessionId || !this.getSessionLabel) {
      return true;
    }
    return this.getSessionLabel() === baseSessionId;
  }
}

function buildTraceCard(trace) {
  if (!trace || typeof trace !== "object") {
    return null;
  }
  const toolCalls = Array.isArray(trace.toolCalls) ? trace.toolCalls : [];
  const approvals = Array.isArray(trace.approvals) ? trace.approvals : [];
  const subagentRuns = Array.isArray(trace.subagentRuns) ? trace.subagentRuns : [];
  const verification = trace.verification || null;
  const changedPaths =
    verification && Array.isArray(verification.changedPaths)
      ? verification.changedPaths
      : [];

  return {
    status: trace.status || "unknown",
    startedAt: trace.startedAt || null,
    finishedAt: trace.finishedAt || null,
    tools: toolCalls.map((call) => ({
      name: call.name || "tool",
      status: call.status || (call.output && call.output.ok === false ? "failed" : "ok"),
      path: (call.output && (call.output.path || (call.output.data && call.output.data.path))) || "",
      message: (call.output && (call.output.message || call.output.summary)) || "",
    })),
    approvals: approvals.map((approval) => ({
      action: approval.action || approval.tool || "",
      status: approval.status || "",
    })),
    subagents: subagentRuns.map((run) => ({
      name: run.agentName || run.agentKey || "Subagent",
      task: typeof run.task === "string" ? run.task.slice(0, 80) : "",
      toolCount: run.evidence ? (run.evidence.toolUseCount || 0) : 0,
    })),
    verification: verification
      ? { status: verification.status || "not_run", changedPaths: changedPaths.slice(0, 6) }
      : null,
  };
}

module.exports = {
  ChatController,
};
