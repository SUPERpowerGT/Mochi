const vscode = require("vscode");
const { ChatController } = require("./chat_controller");
const { OpenAIAgentsRuntime } = require("../runtime/openai_agents_runtime");
const { createCompactMemorySnapshot } = require("../runtime/support/compact_snapshot");
const { getWebviewHtml } = require("./webview_html");
const {
  applyMochiModelConfig,
  configureMochiModelCredentials,
  hasModelApiKey,
  loadMochiModelConfig,
} = require("./model_config");

const CHAT_VIEW_ID = "localAgent.chatView";

let chatView = null;
let lastReply = "";
let targetWorkspaceFolder = "";
let pendingPrefill = "";
let pendingReplies = [];
let pendingApprovals = [];
let pendingActivities = [];
let pendingReplyStream = "";
let activeBaseSessionId = "mochi-chat";
const pendingApprovalResolvers = new Map();
let chatController = null;

async function activate(context) {
  activeBaseSessionId = context.globalState.get("localAgent.activeBaseSessionId", "mochi-chat");
  let modelConfig = await loadMochiModelConfig(vscode, context);
  applyMochiModelConfig(modelConfig);

  const runtime = new OpenAIAgentsRuntime({
    getWorkspaceRoot: getTargetWorkspaceFolder,
    getEditorContext,
    requestApproval: requestToolApproval,
    configureEnvironment: () => {
      applyMochiModelConfig(modelConfig);
    },
    onActivity: (activity) => {
      if (chatController) {
        chatController.handleRuntimeActivity(activity);
        return;
      }
      pendingActivities = [...pendingActivities, activity];
    },
    onTextDelta: (event) => {
      const delta = event && event.delta ? event.delta : "";
      if (!delta) {
        return;
      }

      if (chatController) {
        chatController.handleRuntimeReplyDelta(event);
        return;
      }

      pendingReplyStream += delta;
    },
    onReplyControl: (control) => {
      if (chatController) {
        chatController.handleRuntimeReplyControl(control);
        return;
      }

      if (control && control.type === "clear_stream") {
        pendingReplyStream = "";
      }
    },
    memoryStorageRoot: context.globalStorageUri.fsPath,
    baseSessionId: activeBaseSessionId,
  });

  chatController = new ChatController({
    vscode,
    runtime,
    getWorkspaceDescription: describeWorkspaceTarget,
    getEditorContext,
    openChatView,
    postToChatView,
    getLastReply: () => lastReply,
    setLastReply: (value) => {
      lastReply = value;
    },
    getPendingPrefill: () => pendingPrefill,
    setPendingPrefill: (value) => {
      pendingPrefill = value;
    },
    getPendingReplies: () => pendingReplies,
    setPendingReplies: (value) => {
      pendingReplies = value;
    },
    getPendingApprovals: () => pendingApprovals,
    setPendingApprovals: (value) => {
      pendingApprovals = value;
    },
    resolveApprovalDecision,
    getPendingActivities: () => pendingActivities,
    setPendingActivities: (value) => {
      pendingActivities = value;
    },
    getPendingReplyStream: () => pendingReplyStream,
    setPendingReplyStream: (value) => {
      pendingReplyStream = value;
    },
    getSessionLabel: () => activeBaseSessionId,
    createNewSession: async () => {
      await createNewChatSession(context, runtime);
    },
    switchSession: async (baseSessionId) => {
      await switchChatSession(context, runtime, baseSessionId);
    },
    deleteSession: async (baseSessionId) => {
      await deleteChatSession(context, runtime, baseSessionId);
    },
    ensureModelConfigured: async () => {
      if (hasModelApiKey(modelConfig)) {
        return true;
      }
      const nextConfig = await promptForModelCredentials(context, runtime, modelConfig);
      if (!nextConfig) {
        return false;
      }
      modelConfig = nextConfig;
      return true;
    },
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CHAT_VIEW_ID, {
      resolveWebviewView(webviewView) {
        chatView = webviewView;
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
        };
        const logoUri = webviewView.webview.asWebviewUri(
          vscode.Uri.joinPath(context.extensionUri, "media", "mochi_logo.svg")
        );
        webviewView.webview.html = getWebviewHtml({
          logoUri: String(logoUri),
        });

        setTimeout(() => {
          chatController.flushPendingUiState().catch((error) => {
            vscode.window.showErrorMessage(error.message || String(error));
          });
        }, 50);

        webviewView.webview.onDidReceiveMessage(
          async (message) => {
            await chatController.handleWebviewMessage(message);
          },
          undefined,
          context.subscriptions
        );

        webviewView.onDidDispose(() => {
          if (chatView === webviewView) {
            chatView = null;
          }
        });
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("localAgent.openChat", () => {
      openChatView();
      if (!hasModelApiKey(modelConfig)) {
        promptForModelCredentials(context, runtime, modelConfig).then((nextConfig) => {
          if (nextConfig) {
            modelConfig = nextConfig;
          }
        });
      }
    }),
    vscode.commands.registerCommand("localAgent.configureModelCredentials", async () => {
      const nextConfig = await configureMochiModelCredentials(vscode, context, modelConfig);
      if (!nextConfig) {
        return;
      }
      modelConfig = nextConfig;
      if (runtime) {
        runtime.agents = null;
      }
      vscode.window.showInformationMessage(`Mochi model configured: ${modelConfig.modelProvider} / ${modelConfig.model}`);
    }),
    vscode.commands.registerCommand("localAgent.selectWorkspaceFolder", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Use this folder",
      });
      if (!picked || !picked[0]) {
        return;
      }

      targetWorkspaceFolder = picked[0].fsPath;
      vscode.window.showInformationMessage(`Local Agent workspace set to: ${targetWorkspaceFolder}`);
      postToChatView({
        type: "workspace",
        value: describeWorkspaceTarget(),
      });
    }),
    vscode.commands.registerCommand("localAgent.sendSelection", async () => {
      await chatController.handleSendSelection();
    }),
    vscode.commands.registerCommand("localAgent.applyLastReply", async () => {
      await chatController.handleApplyLastReply();
    }),
    vscode.commands.registerCommand("localAgent.quickAsk", async () => {
      await chatController.handleQuickAsk();
    }),
    vscode.commands.registerCommand("localAgent.openMemorySnapshot", async () => {
      const snapshot = await runtime.getMemorySnapshot();
      const compactSnapshot = createCompactMemorySnapshot(snapshot);
      const document = await vscode.workspace.openTextDocument({
        language: "json",
        content: JSON.stringify(compactSnapshot, null, 2),
      });
      await vscode.window.showTextDocument(document, {
        preview: false,
      });
    }),
    vscode.commands.registerCommand("localAgent.openRawMemorySnapshot", async () => {
      const snapshot = await runtime.getMemorySnapshot();
      const document = await vscode.workspace.openTextDocument({
        language: "json",
        content: JSON.stringify(snapshot, null, 2),
      });
      await vscode.window.showTextDocument(document, {
        preview: false,
      });
    }),
    vscode.commands.registerCommand("localAgent.openMemoryControls", async () => {
      await openMemoryControls(runtime);
    }),
    vscode.commands.registerCommand("localAgent.toggleSessionMemoryIsolation", async () => {
      await toggleSessionMemoryIsolation(runtime);
    }),
    vscode.commands.registerCommand("localAgent.togglePersistentMemoryRead", async () => {
      await togglePersistentMemoryRead(runtime);
    }),
    vscode.commands.registerCommand("localAgent.togglePrivateWindowMode", async () => {
      await togglePrivateWindowMode(runtime);
      await syncChatSessionUi(runtime, activeBaseSessionId);
    }),
    vscode.commands.registerCommand("localAgent.destroyCurrentWindowArtifacts", async () => {
      const confirmed = await vscode.window.showWarningMessage(
        "Archive this non-private Mochi window to long-term memory, then delete its chat messages, working state, trace, and routing artifacts? Private windows are discarded without archive. Other windows stay untouched.",
        { modal: true },
        "Archive And Delete"
      );
      if (confirmed !== "Archive And Delete") {
        return;
      }
      await runtime.destroyCurrentWindowArtifactsForUi(activeBaseSessionId);
      lastReply = "";
      pendingPrefill = "";
      pendingReplies = [];
      pendingActivities = [];
      pendingReplyStream = "";
      await syncChatSessionUi(runtime, activeBaseSessionId);
      vscode.window.showInformationMessage("Current Mochi window artifacts deleted.");
    }),
    vscode.commands.registerCommand("localAgent.clearCurrentSessionMemory", async () => {
      const confirmed = await vscode.window.showWarningMessage(
        "Clear summaries, working state, traces, and routing memory for the current Mochi window? Current chat messages stay visible.",
        { modal: true },
        "Clear Current Memory"
      );
      if (confirmed !== "Clear Current Memory") {
        return;
      }
      await runtime.clearCurrentSessionMemoryForUi(activeBaseSessionId);
      await syncChatSessionUi(runtime, activeBaseSessionId);
      vscode.window.showInformationMessage("Current Mochi window memory cleared.");
    }),
    vscode.commands.registerCommand("localAgent.clearCurrentSessionSummaryMemory", async () => {
      await runtime.clearCurrentSessionSummaryMemoryForUi(activeBaseSessionId);
      await syncChatSessionUi(runtime, activeBaseSessionId);
      vscode.window.showInformationMessage("Current session summary memory cleared.");
    }),
    vscode.commands.registerCommand("localAgent.clearCurrentTaskMemory", async () => {
      await runtime.clearCurrentTaskMemoryForUi(activeBaseSessionId);
      await syncChatSessionUi(runtime, activeBaseSessionId);
      vscode.window.showInformationMessage("Current window working state cleared.");
    }),
    vscode.commands.registerCommand("localAgent.clearCurrentWorkspaceMemory", async () => {
      await runtime.clearCurrentWorkspaceMemoryForUi(activeBaseSessionId);
      vscode.window.showInformationMessage("Current workspace memory cleared.");
    }),
    vscode.commands.registerCommand("localAgent.clearUserMemory", async () => {
      await runtime.clearUserMemoryForUi(activeBaseSessionId);
      vscode.window.showInformationMessage("User memory cleared.");
    }),
    vscode.commands.registerCommand("localAgent.clearCurrentTraceMemory", async () => {
      await runtime.clearCurrentTraceAndRoutingMemoryForUi(activeBaseSessionId);
      await syncChatSessionUi(runtime, activeBaseSessionId);
      vscode.window.showInformationMessage("Current trace and routing memory cleared.");
    }),
    vscode.commands.registerCommand("localAgent.clearAllMemory", async () => {
      const confirmed = await vscode.window.showWarningMessage(
        "Clear all local Mochi memory, workspace memory, user preferences, working state, and traces? Chat sessions and messages stay.",
        { modal: true },
        "Clear All Memory"
      );
      if (confirmed !== "Clear All Memory") {
        return;
      }
      await runtime.clearAllMemoryForUi();
      await syncChatSessionUi(runtime, activeBaseSessionId);
      vscode.window.showInformationMessage("All local Mochi memory cleared.");
    })
  );

}

async function createNewChatSession(context, runtime) {
  await switchChatSession(context, runtime, `mochi-chat-${Date.now()}`);
}

async function switchChatSession(context, runtime, baseSessionId) {
  if (!baseSessionId || baseSessionId === activeBaseSessionId) {
    await syncChatSessionUi(runtime, activeBaseSessionId);
    return;
  }

  activeBaseSessionId = baseSessionId;
  await context.globalState.update("localAgent.activeBaseSessionId", activeBaseSessionId);
  runtime.setBaseSessionId(activeBaseSessionId);
  await runtime.ensureCurrentSession();
  lastReply = "";
  pendingPrefill = "";
  pendingReplies = [];
  pendingActivities = [];
  pendingReplyStream = "";

  await syncChatSessionUi(runtime, activeBaseSessionId);
}

async function deleteChatSession(context, runtime, baseSessionId) {
  if (!baseSessionId || !runtime.deleteSessionForUi) {
    await syncChatSessionUi(runtime, activeBaseSessionId);
    return;
  }

  const result = await runtime.deleteSessionForUi(baseSessionId);
  activeBaseSessionId = result && result.activeBaseSessionId
    ? result.activeBaseSessionId
    : runtime.getBaseSessionId();
  await context.globalState.update("localAgent.activeBaseSessionId", activeBaseSessionId);
  runtime.setBaseSessionId(activeBaseSessionId);
  lastReply = "";
  pendingPrefill = "";
  pendingReplies = [];
  pendingActivities = [];
  pendingReplyStream = "";
  await syncChatSessionUi(runtime, activeBaseSessionId);
}

async function syncChatSessionUi(runtime, baseSessionId = activeBaseSessionId) {
  const sessions = runtime.listCurrentWorkspaceSessionsForUi
    ? await runtime.listCurrentWorkspaceSessionsForUi()
    : [];
  postToChatView({
    type: "sessionList",
    value: sessions,
  });
  postToChatView({
    type: "sessionInfo",
    value: baseSessionId,
  });
  const controls = await runtime.getMemoryControlsForUi(baseSessionId);
  postToChatView({
    type: "memoryPolicy",
    value: controls.policy || {},
    baseSessionId,
  });
  const messages = await runtime.getCurrentSessionMessagesForUi(baseSessionId);
  postToChatView({
    type: "sessionHistory",
    value: messages,
    baseSessionId,
  });
  postToChatView({
    type: "clearActivity",
  });
}

function deactivate() {}

async function openChatView() {
  await vscode.commands.executeCommand("workbench.action.focusPanel");
  await vscode.commands.executeCommand(`${CHAT_VIEW_ID}.focus`);
}

function postToChatView(message) {
  if (!chatView) {
    return false;
  }

  chatView.webview.postMessage(message);
  return true;
}

function getTargetWorkspaceFolder() {
  if (targetWorkspaceFolder) {
    return targetWorkspaceFolder;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function describeWorkspaceTarget() {
  const workspaceRoot = getTargetWorkspaceFolder();
  if (workspaceRoot) {
    return `Workspace: ${workspaceRoot}`;
  }

  return "Workspace: none selected. Open a folder or run 'Local Agent: Select Workspace Folder'.";
}

function getEditorContext() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "";
  }

  const filePath = editor.document.uri.fsPath;
  const selection = editor.selection;
  const selectedText =
    selection && !selection.isEmpty
      ? editor.document.getText(selection)
      : editor.document.getText().slice(0, 12000);

  return `File: ${filePath}\n\n${selectedText}`;
}

async function requestToolApproval(request) {
  const approvalId = `approval:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const approval = {
    id: approvalId,
    kind: request.kind || "approval",
    action: request.action,
    reason: request.reason,
    relativePath: request.relativePath,
    workspaceRoot: getTargetWorkspaceFolder() || "",
    prompt: request.prompt || "",
    baseSessionId: request.baseSessionId || activeBaseSessionId,
  };

  await openChatView();
  if (!postToChatView({ type: "approvalRequest", value: approval, baseSessionId: approval.baseSessionId })) {
    pendingApprovals = [...pendingApprovals, approval];
  }

  return new Promise((resolve) => {
    pendingApprovalResolvers.set(approvalId, resolve);
  });
}

function resolveApprovalDecision(id, approved) {
  if (!id) {
    return;
  }

  pendingApprovals = pendingApprovals.filter((item) => item.id !== id);
  const resolver = pendingApprovalResolvers.get(id);
  if (!resolver) {
    return;
  }

  pendingApprovalResolvers.delete(id);
  resolver(Boolean(approved));
}

async function openMemoryControls(runtime) {
  const controls = await runtime.getMemoryControlsForUi(activeBaseSessionId);
  const policy = controls.policy || {};
  const counts = controls.counts || {};
  const persistentReadsOn = !policy.disablePersistentMemory;
  const isolationOn = Boolean(policy.isolateSession);
  const privateWindowOn = Boolean(policy.privateWindow);
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: privateWindowOn ? "Exit Private Window Mode" : "Enter Private Window Mode",
        description: privateWindowOn ? "currently private" : "current window",
        detail: privateWindowOn
          ? "Return this window to normal memory reads."
          : "Use only this window's local context. Saved memory and other sessions are not read.",
        action: "togglePrivate",
      },
      {
        label: persistentReadsOn ? "Disable Persistent Memory Reads" : "Enable Persistent Memory Reads",
        description: persistentReadsOn ? "currently on" : "currently off",
        detail: persistentReadsOn
          ? "Stop this window from reading saved session, task, workspace, and user memory."
          : "Allow this window to read saved session, task, workspace, and user memory.",
        action: "togglePersistent",
      },
      {
        label: isolationOn ? "Allow Cross-Session Memory" : "Isolate From Other Sessions",
        description: isolationOn ? "currently isolated" : "currently shared",
        detail: isolationOn
          ? "Allow this window to read relevant memory from other Mochi sessions again."
          : "Prevent this window from reading memory from other Mochi sessions.",
        action: "toggleIsolation",
      },
      {
        label: "Open Memory Snapshot",
        description: `${counts.messages || 0} messages, ${counts.tasks || 0} working records`,
        detail: "Open the compact memory and trace snapshot as JSON.",
        action: "snapshot",
      },
      {
        label: "Open Raw Memory Snapshot",
        description: "full JSON",
        detail: "Open the full stored memory snapshot as JSON.",
        action: "rawSnapshot",
      },
      {
        label: "Open Details Document",
        description: "markdown",
        detail: "Open a readable summary of current policy, counts, working state, and preferences.",
        action: "details",
      },
      {
        label: "Delete Current Window Artifacts",
        description: "private-window cleanup",
        detail: "Delete this window's chat messages, working state, trace, and routing artifacts.",
        action: "destroyArtifacts",
      },
      {
        label: "Clear Current Window Memory",
        description: "current session only",
        detail: "Clear summaries, working state, traces, and routing memory for this Mochi window.",
        action: "clearCurrent",
      },
      {
        label: "Clear Session Summary Memory",
        description: "current session",
        detail: "Clear session summary and compaction memory while keeping chat messages.",
        action: "clearSessionSummary",
      },
      {
        label: "Clear Window Working State",
        description: `${counts.tasks || 0} linked records`,
        detail: "Clear internal working state, routing, and summaries for the current window.",
        action: "clearTasks",
      },
      {
        label: "Clear Workspace Memory",
        description: `${counts.workspaceMemory || 0} entries`,
        detail: "Clear detected workspace facts and verification hints for this workspace.",
        action: "clearWorkspace",
      },
      {
        label: "Clear User Memory",
        description: `${counts.userPreferences || 0} preferences`,
        detail: "Clear saved user preferences.",
        action: "clearUser",
      },
      {
        label: "Clear Trace and Routing Memory",
        description: "current session",
        detail: "Clear latest run trace, route state, and focused task pointer.",
        action: "clearTrace",
      },
      {
        label: "Clear All Local Memory",
        description: "all Mochi memory",
        detail: "Clear all local Mochi sessions, working state, workspace memory, and user preferences.",
        action: "clearAll",
      },
    ],
    {
      title: "Mochi Memory Controls",
      placeHolder: `Private: ${privateWindowOn ? "on" : "off"} · Persistent reads: ${
        persistentReadsOn ? "on" : "off"
      } · Cross-session memory: ${
        isolationOn ? "off" : "on"
      }`,
    }
  );

  if (!picked) {
    return;
  }

  if (picked.action === "togglePrivate") {
    await vscode.commands.executeCommand("localAgent.togglePrivateWindowMode");
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "togglePersistent") {
    await togglePersistentMemoryRead(runtime);
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "toggleIsolation") {
    await toggleSessionMemoryIsolation(runtime);
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "snapshot") {
    await vscode.commands.executeCommand("localAgent.openMemorySnapshot");
    return;
  }

  if (picked.action === "rawSnapshot") {
    await vscode.commands.executeCommand("localAgent.openRawMemorySnapshot");
    return;
  }

  if (picked.action === "destroyArtifacts") {
    await vscode.commands.executeCommand("localAgent.destroyCurrentWindowArtifacts");
    return;
  }

  if (picked.action === "clearCurrent") {
    await vscode.commands.executeCommand("localAgent.clearCurrentSessionMemory");
    return;
  }

  if (picked.action === "clearSessionSummary") {
    await vscode.commands.executeCommand("localAgent.clearCurrentSessionSummaryMemory");
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "clearTasks") {
    await vscode.commands.executeCommand("localAgent.clearCurrentTaskMemory");
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "clearWorkspace") {
    await vscode.commands.executeCommand("localAgent.clearCurrentWorkspaceMemory");
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "clearUser") {
    await vscode.commands.executeCommand("localAgent.clearUserMemory");
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "clearTrace") {
    await vscode.commands.executeCommand("localAgent.clearCurrentTraceMemory");
    await openMemoryControls(runtime);
    return;
  }

  if (picked.action === "clearAll") {
    await vscode.commands.executeCommand("localAgent.clearAllMemory");
    return;
  }

  const document = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: formatMemoryControlsMarkdown(controls),
  });
  await vscode.window.showTextDocument(document, {
    preview: false,
  });
}

async function toggleSessionMemoryIsolation(runtime) {
  const controls = await runtime.getMemoryControlsForUi(activeBaseSessionId);
  const nextPolicy = await runtime.setMemoryPolicyForUi(activeBaseSessionId, {
    isolateSession: !controls.policy.isolateSession,
  });
  vscode.window.showInformationMessage(
    nextPolicy.isolateSession
      ? "Mochi will not read memory from other sessions in this window."
      : "Mochi may read relevant memory from other sessions again."
  );
}

async function togglePersistentMemoryRead(runtime) {
  const controls = await runtime.getMemoryControlsForUi(activeBaseSessionId);
  const nextPolicy = await runtime.setMemoryPolicyForUi(activeBaseSessionId, {
    disablePersistentMemory: !controls.policy.disablePersistentMemory,
  });
  vscode.window.showInformationMessage(
    nextPolicy.disablePersistentMemory
      ? "Mochi will not read persistent memory in this window."
      : "Mochi may read persistent memory in this window again."
  );
}

async function togglePrivateWindowMode(runtime) {
  const controls = await runtime.getMemoryControlsForUi(activeBaseSessionId);
  const enabled = !controls.policy.privateWindow;
  const nextPolicy = await runtime.setPrivateWindowModeForUi(activeBaseSessionId, enabled);
  vscode.window.showInformationMessage(
    nextPolicy.privateWindow
      ? "Private window mode is on. Mochi will only use this window's context."
      : "Private window mode is off. Mochi may read normal memory again."
  );
}

function formatMemoryControlsMarkdown(controls) {
  const policy = controls.policy || {};
  const counts = controls.counts || {};
  const session = controls.session || {};
  const tasks = Array.isArray(controls.tasks) ? controls.tasks : [];
  const preferences = controls.preferences || {};
  const taskLines = tasks.length
    ? tasks.map((task) => `- ${task.title || task.id} (${task.status || "unknown"})${task.summary ? `: ${task.summary}` : ""}`)
    : ["- none"];
  const preferenceLines = Object.keys(preferences).length
    ? Object.entries(preferences).map(([key, value]) => `- ${key}: ${value && value.value ? value.value : JSON.stringify(value)}`)
    : ["- none"];

  return [
    "# Mochi Memory Controls",
    "",
    `Session: ${session.title || controls.baseSessionId || "current"}`,
    `Session id: ${controls.sessionId || "unknown"}`,
    "",
    "## Current Policy",
    "",
    `- Isolate from other sessions: ${policy.isolateSession ? "on" : "off"}`,
    `- Disable persistent memory reads: ${policy.disablePersistentMemory ? "on" : "off"}`,
    `- Private window mode: ${policy.privateWindow ? "on" : "off"}`,
    "",
    "## Stored Memory",
    "",
    `- Messages in this session: ${counts.messages || 0}`,
    `- Session summary exists: ${counts.hasSummary ? "yes" : "no"}`,
    `- Linked working-state records: ${counts.tasks || 0}`,
    `- Workspace memory entries: ${counts.workspaceMemory || 0}`,
    `- User preferences: ${counts.userPreferences || 0}`,
    "",
    "## Session Summary",
    "",
    session.summary || "_No session summary stored._",
    "",
    "## Working State",
    "",
    ...taskLines,
    "",
    "## User Preferences",
    "",
    ...preferenceLines,
    "",
    "## Commands",
    "",
    "- `Mochi: Toggle Current Window Memory Isolation`",
    "- `Mochi: Toggle Current Window Persistent Memory Reads`",
    "- `Mochi: Toggle Current Window Private Mode`",
    "- `Mochi: Delete Current Window Artifacts`",
    "- `Mochi: Clear Current Window Memory`",
    "- `Mochi: Clear All Local Memory`",
  ].join("\n");
}

async function promptForModelCredentials(context, runtime, currentConfig) {
  if (hasModelApiKey(currentConfig)) {
    return currentConfig;
  }

  const choice = await vscode.window.showWarningMessage(
    "Mochi needs a model API key before it can chat.",
    "Configure",
    "Later"
  );
  if (choice !== "Configure") {
    return null;
  }

  const nextConfig = await configureMochiModelCredentials(vscode, context, currentConfig);
  if (!nextConfig) {
    return null;
  }
  if (runtime) {
    runtime.agents = null;
  }
  vscode.window.showInformationMessage(`Mochi model configured: ${nextConfig.modelProvider} / ${nextConfig.model}`);
  return nextConfig;
}

module.exports = {
  activate,
  deactivate,
};
