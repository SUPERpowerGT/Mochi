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
    this.ensureModelConfigured = options.ensureModelConfigured || null;
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

    await this.syncMemoryPolicy(baseSessionId, syncVersion);

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
    await this.syncMemoryPolicy(baseSessionId);
  }

  async syncMemoryPolicy(baseSessionId, syncVersion = null) {
    if (!this.runtime.getMemoryControlsForUi) {
      return;
    }

    const controls = await this.runtime.getMemoryControlsForUi(baseSessionId);
    if (syncVersion !== null && syncVersion !== this.sessionSyncVersion) {
      return;
    }
    this.postToChatView({
      type: "memoryPolicy",
      value: controls.policy || {},
      baseSessionId,
      syncVersion,
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

    if (message.type === "slashCommand") {
      await this.handleSlashCommand(message.command);
      return;
    }

    if (message.type === "togglePrivateWindow") {
      await this.handleSlashCommand("togglePrivateWindow");
      return;
    }

    if (message.type === "send") {
      const runBaseSessionId =
        message.baseSessionId ||
        (this.runtime.getBaseSessionId ? this.runtime.getBaseSessionId() : "");
      try {
        if (this.ensureModelConfigured) {
          const configured = await this.ensureModelConfigured();
          if (!configured) {
            if (this.isCurrentSession(runBaseSessionId)) {
              this.postToChatView({
                type: "error",
                value: "Mochi needs a model API key before it can chat. Run `Mochi: Configure Model Credentials` from the Command Palette.",
                baseSessionId: runBaseSessionId,
              });
            }
            return;
          }
        }
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

  async handleSlashCommand(command) {
    const commandMap = {
      configureModel: "localAgent.configureModelCredentials",
      memoryControls: "localAgent.openMemoryControls",
      memorySnapshot: "localAgent.openMemorySnapshot",
      rawMemorySnapshot: "localAgent.openRawMemorySnapshot",
      togglePrivateWindow: "localAgent.togglePrivateWindowMode",
      togglePersistentMemory: "localAgent.togglePersistentMemoryRead",
      toggleSessionIsolation: "localAgent.toggleSessionMemoryIsolation",
      destroyCurrentWindowArtifacts: "localAgent.destroyCurrentWindowArtifacts",
      clearCurrentMemory: "localAgent.clearCurrentSessionMemory",
      clearSessionSummaryMemory: "localAgent.clearCurrentSessionSummaryMemory",
      clearTaskMemory: "localAgent.clearCurrentTaskMemory",
      clearWorkspaceMemory: "localAgent.clearCurrentWorkspaceMemory",
      clearUserMemory: "localAgent.clearUserMemory",
      clearTraceMemory: "localAgent.clearCurrentTraceMemory",
      clearAllMemory: "localAgent.clearAllMemory",
      selectWorkspace: "localAgent.selectWorkspaceFolder",
      sendSelection: "localAgent.sendSelection",
      insertLastReply: "localAgent.applyLastReply",
    };
    const targetCommand = commandMap[command];
    if (!targetCommand) {
      this.postToChatView({
        type: "slashCommandResult",
        ok: false,
        value: "Unknown slash command.",
      });
      return;
    }

    try {
      await this.vscode.commands.executeCommand(targetCommand);
      this.postToChatView({
        type: "slashCommandResult",
        ok: true,
        value: "Command finished.",
      });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      this.vscode.window.showErrorMessage(message);
      this.postToChatView({
        type: "slashCommandResult",
        ok: false,
        value: message,
      });
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
