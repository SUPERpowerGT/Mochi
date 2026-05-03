class ChatController {
  constructor(options = {}) {
    this.vscode = options.vscode;
    this.runtime = options.runtime;
    this.getWorkspaceDescription = options.getWorkspaceDescription;
    this.getAuthState = options.getAuthState;
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
    this.handleAuthSubmit = options.handleAuthSubmit || null;
    this.handleLoadCheckpoints = options.handleLoadCheckpoints || null;
    this.handleRestoreCheckpointById = options.handleRestoreCheckpointById || null;
    this.sessionSyncVersion = 0;
  }

  async flushPendingUiState() {
    this.postToChatView({
      type: "workspace",
      value: this.getWorkspaceDescription(),
    });
    if (this.getAuthState) {
      this.postToChatView({
        type: "authState",
        value: this.getAuthState(),
      });
    }
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
      if (this.getAuthState) {
        this.postToChatView({
          type: "authState",
          value: this.getAuthState(),
        });
      }
      await this.syncSessionUi();
      return;
    }

    if (message.type === "clientError") {
      this.vscode.window.showErrorMessage(`Chat UI error: ${message.value}`);
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
      return;
    }

    if (message.type === "authSignIn") {
      await this.vscode.commands.executeCommand("localAgent.signIn");
      return;
    }

    if (message.type === "authRegister") {
      await this.vscode.commands.executeCommand("localAgent.register");
      return;
    }

    if (message.type === "authSignOut") {
      await this.vscode.commands.executeCommand("localAgent.signOut");
      return;
    }

    if (message.type === "authSubmit") {
      if (this.handleAuthSubmit) {
        await this.handleAuthSubmit(message.value || {});
      }
      return;
    }

    if (message.type === "loadCheckpoints") {
      if (this.handleLoadCheckpoints) {
        await this.handleLoadCheckpoints();
      }
      return;
    }

    if (message.type === "restoreCheckpointById") {
      if (this.handleRestoreCheckpointById) {
        await this.handleRestoreCheckpointById((message.value || {}).checkpointId || "");
      }
      return;
    }

    if (message.type === "restoreCheckpoint") {
      await this.vscode.commands.executeCommand("localAgent.restoreCheckpoint");
      return;
    }

    if (message.type === "selectWorkspace") {
      await this.vscode.commands.executeCommand("localAgent.selectWorkspaceFolder");
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

  isCurrentSession(baseSessionId) {
    if (!baseSessionId || !this.getSessionLabel) {
      return true;
    }
    return this.getSessionLabel() === baseSessionId;
  }
}

module.exports = {
  ChatController,
};
