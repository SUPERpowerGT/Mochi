const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const { promisify } = require("util");
const vscode = require("vscode");
const { ChatController } = require("./chat_controller");
const { OpenAIAgentsRuntime } = require("../runtime/openai_agents_runtime");
const { createCompactMemorySnapshot } = require("../runtime/support/compact_snapshot");
const { getWebviewHtml } = require("./webview_html");
const {
  DEFAULT_IDENTITY,
  normalizeIdentity,
  createIdentityKey,
} = require("../runtime/support/runtime_identity");

const execFileAsync = promisify(execFile);

const CHAT_VIEW_ID = "localAgent.chatView";
const AUTH_SESSION_STORAGE_KEY = "localAgent.authSession";
const AUTH_TOKEN_SECRET_KEY = "localAgent.authToken";

let chatView = null;
let lastReply = "";
let targetWorkspaceFolder = "";
let pendingPrefill = "";
let pendingReplies = [];
let pendingApprovals = [];
let pendingActivities = [];
let pendingReplyStream = "";
let activeBaseSessionId = "mochi-chat";
let activeIdentity = DEFAULT_IDENTITY;
let activeAuthSession = null;
const pendingApprovalResolvers = new Map();
let chatController = null;

async function activate(context) {
  activeAuthSession = await loadStoredAuthSession(context);
  activeAuthSession = await validateStoredAuthSession(context, activeAuthSession);
  activeIdentity = loadActiveIdentity(context);
  if (activeAuthSession && activeAuthSession.user) {
    activeIdentity = deriveIdentityFromAuthUser(activeAuthSession.user, activeIdentity);
  }
  activeBaseSessionId = getStoredBaseSessionId(context, activeIdentity);
  const runtime = new OpenAIAgentsRuntime({
    getWorkspaceRoot: getTargetWorkspaceFolder,
    getEditorContext,
    requestApproval: requestToolApproval,
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
    currentIdentity: activeIdentity,
    sessionSyncAuthToken: getActiveAuthToken(),
  });

  chatController = new ChatController({
    vscode,
    runtime,
    getWorkspaceDescription: describeWorkspaceTarget,
    getAuthState: getAuthViewState,
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
    handleAuthSubmit: async (payload) => {
      await handleWebviewAuthSubmit(context, runtime, payload);
    },
    handleLoadCheckpoints: async () => {
      await handleWebviewLoadCheckpoints(runtime);
    },
    handleRestoreCheckpointById: async (checkpointId) => {
      await handleWebviewRestoreCheckpoint(context, runtime, checkpointId);
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
          publishExtensionContext().catch((error) => {
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
    }),
    vscode.commands.registerCommand("localAgent.signIn", async () => {
      await signInToMochi(context, runtime);
    }),
    vscode.commands.registerCommand("localAgent.register", async () => {
      await registerForMochi(context, runtime);
    }),
    vscode.commands.registerCommand("localAgent.signOut", async () => {
      await signOutFromMochi(context, runtime);
    }),
    vscode.commands.registerCommand("localAgent.switchUserProfile", async () => {
      await switchUserProfile(context, runtime);
    }),
    vscode.commands.registerCommand("localAgent.switchDeviceProfile", async () => {
      await switchDeviceProfile(context, runtime);
    }),
    vscode.commands.registerCommand("localAgent.restoreCheckpoint", async () => {
      await restoreCheckpointFromCloud(context, runtime);
    }),
    vscode.commands.registerCommand("localAgent.analyzeLatestCommit", async () => {
      await analyzeLatestCommit(context);
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
      await ensureAutoCommitAnalysisSetup();
      vscode.window.showInformationMessage(`Local Agent workspace set to: ${targetWorkspaceFolder}`);
      await publishExtensionContext();
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
    })
  );

  await updateExtensionContextKeys();
  ensureAutoCommitAnalysisSetup().catch(() => {
    // Auto hook installation is best-effort and should not block activation.
  });
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
  await storeBaseSessionId(context, activeIdentity, activeBaseSessionId);
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
  await storeBaseSessionId(context, activeIdentity, activeBaseSessionId);
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

async function publishExtensionContext() {
  postToChatView({
    type: "workspace",
    value: describeWorkspaceTarget(),
  });
  postToChatView({
    type: "authState",
    value: getAuthViewState(),
  });
  await updateExtensionContextKeys();
}

function getTargetWorkspaceFolder() {
  if (targetWorkspaceFolder) {
    return targetWorkspaceFolder;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function describeWorkspaceTarget() {
  const workspaceRoot = getTargetWorkspaceFolder();
  const authLabel = activeAuthSession && activeAuthSession.user
    ? `Signed in: ${activeAuthSession.user.email || activeAuthSession.user.userId}`
    : "Signed in: no";
  const identityLabel = `User: ${activeIdentity.displayName} (${activeIdentity.tenantId}/${activeIdentity.userId})\nDevice: ${activeIdentity.deviceName} (${activeIdentity.deviceId})`;
  if (workspaceRoot) {
    return `${authLabel}\n${identityLabel}\nWorkspace: ${workspaceRoot}`;
  }

  return `${authLabel}\n${identityLabel}\nWorkspace: none selected. Open a folder or run 'Local Agent: Select Workspace Folder'.`;
}

function getAuthViewState() {
  const user = activeAuthSession && activeAuthSession.user ? activeAuthSession.user : null;
  const session = activeAuthSession && activeAuthSession.session ? activeAuthSession.session : null;
  const workspaceRoot = getTargetWorkspaceFolder();
  return {
    isSignedIn: Boolean(getActiveAuthToken() && user),
    email: user && user.email ? user.email : "",
    displayName: user && user.displayName ? user.displayName : "",
    userId: user && user.userId ? user.userId : "",
    tenantId: user && user.tenantId ? user.tenantId : "",
    deviceId: activeIdentity.deviceId || "",
    deviceName: activeIdentity.deviceName || "",
    workspaceRoot,
    workspaceSelected: Boolean(workspaceRoot),
    sessionExpiresAt: session && session.expiresAt ? session.expiresAt : "",
  };
}

async function updateExtensionContextKeys() {
  await vscode.commands.executeCommand("setContext", "localAgent.isSignedIn", Boolean(getActiveAuthToken()));
  await vscode.commands.executeCommand("setContext", "localAgent.hasWorkspace", Boolean(getTargetWorkspaceFolder()));
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

module.exports = {
  activate,
  deactivate,
};

function loadActiveIdentity(context) {
  return normalizeIdentity(context.globalState.get("localAgent.activeIdentity", DEFAULT_IDENTITY));
}

async function loadStoredAuthSession(context) {
  const stored = context.globalState.get(AUTH_SESSION_STORAGE_KEY, null);
  if (!stored || typeof stored !== "object") {
    return null;
  }
  const savedToken = await context.secrets.get(AUTH_TOKEN_SECRET_KEY);
  const migratedToken = savedToken || (stored.token ? String(stored.token) : "");
  const sanitized = {
    user: stored.user || null,
    session: stored.session || null,
    token: migratedToken,
  };

  if (!savedToken && migratedToken) {
    await context.secrets.store(AUTH_TOKEN_SECRET_KEY, migratedToken);
  }
  if (Object.prototype.hasOwnProperty.call(stored, "token")) {
    await context.globalState.update(AUTH_SESSION_STORAGE_KEY, {
      user: stored.user || null,
      session: stored.session || null,
    });
  }

  return migratedToken || sanitized.user || sanitized.session ? sanitized : null;
}

async function storeAuthSession(context, authSession) {
  if (!authSession) {
    await context.secrets.delete(AUTH_TOKEN_SECRET_KEY);
    await context.globalState.update(AUTH_SESSION_STORAGE_KEY, null);
    return;
  }

  const token = authSession.token ? String(authSession.token) : "";
  if (token) {
    await context.secrets.store(AUTH_TOKEN_SECRET_KEY, token);
  } else {
    await context.secrets.delete(AUTH_TOKEN_SECRET_KEY);
  }

  await context.globalState.update(AUTH_SESSION_STORAGE_KEY, {
    user: authSession.user || null,
    session: authSession.session || null,
  });
}

async function validateStoredAuthSession(context, authSession) {
  if (!authSession || !authSession.token) {
    return null;
  }

  try {
    const response = await fetch(`${getIdentityApiBaseUrl()}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${authSession.token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      await storeAuthSession(context, null);
      return null;
    }

    if (!response.ok) {
      return authSession;
    }

    const payload = await response.json().catch(() => null);
    const validated = {
      token: authSession.token,
      user: payload && payload.user ? payload.user : authSession.user,
      session: payload && payload.session ? payload.session : authSession.session,
    };
    await storeAuthSession(context, validated);
    return validated;
  } catch (error) {
    return authSession;
  }
}

function getActiveAuthToken() {
  return activeAuthSession && activeAuthSession.token ? String(activeAuthSession.token) : "";
}

function deriveIdentityFromAuthUser(user, fallbackIdentity = DEFAULT_IDENTITY) {
  const fallback = normalizeIdentity(fallbackIdentity);
  return normalizeIdentity({
    tenantId: user && user.tenantId ? user.tenantId : fallback.tenantId,
    userId: user && user.userId ? user.userId : fallback.userId,
    displayName: user && user.displayName ? user.displayName : fallback.displayName,
    deviceId: user && user.deviceId ? user.deviceId : fallback.deviceId,
    deviceName: user && user.deviceName ? user.deviceName : fallback.deviceName,
  });
}

function getStoredBaseSessionId(context, identity) {
  return context.globalState.get(getBaseSessionStorageKey(identity), "mochi-chat");
}

async function storeBaseSessionId(context, identity, baseSessionId) {
  await context.globalState.update(getBaseSessionStorageKey(identity), baseSessionId || "mochi-chat");
}

function getBaseSessionStorageKey(identity) {
  return `localAgent.activeBaseSessionId.${createIdentityKey(identity)}`;
}

async function switchUserProfile(context, runtime) {
  if (getActiveAuthToken()) {
    vscode.window.showInformationMessage("Sign out first if you want to use the built-in local demo profiles.");
    return;
  }

  const profiles = getBuiltInProfiles();
  const currentKey = createIdentityKey(activeIdentity);
  const picked = await vscode.window.showQuickPick(
    profiles.map((profile) => ({
      label: profile.displayName,
      description: `${profile.tenantId}/${profile.userId}`,
      profile,
      picked: createIdentityKey(profile) === currentKey,
    })),
    {
      title: "Select Mochi user profile",
      placeHolder: "Switch the active local user profile",
    }
  );

  if (!picked || !picked.profile) {
    return;
  }

  const nextIdentity = normalizeIdentity(picked.profile);
  const nextProfileKey = `${nextIdentity.tenantId}:${nextIdentity.userId}`;
  const currentProfileKey = `${activeIdentity.tenantId}:${activeIdentity.userId}`;
  if (nextProfileKey === currentProfileKey) {
    return;
  }

  activeIdentity = normalizeIdentity({
    ...nextIdentity,
    deviceId: activeIdentity.deviceId,
    deviceName: activeIdentity.deviceName,
  });
  await applyIdentitySwitch(context, runtime);
  await ensureAutoCommitAnalysisSetup();
  vscode.window.showInformationMessage(`Mochi active user: ${activeIdentity.displayName}`);
}

async function switchDeviceProfile(context, runtime) {
  const devices = getBuiltInDevices();
  const currentDeviceKey = activeIdentity.deviceId;
  const picked = await vscode.window.showQuickPick(
    devices.map((device) => ({
      label: device.deviceName,
      description: device.deviceId,
      device,
      picked: device.deviceId === currentDeviceKey,
    })),
    {
      title: "Select Mochi device profile",
      placeHolder: "Switch the active local device profile",
    }
  );

  if (!picked || !picked.device) {
    return;
  }

  if (picked.device.deviceId === currentDeviceKey) {
    return;
  }

  activeIdentity = normalizeIdentity({
    ...activeIdentity,
    deviceId: picked.device.deviceId,
    deviceName: picked.device.deviceName,
  });
  if (activeAuthSession && activeAuthSession.user) {
    activeAuthSession = {
      ...activeAuthSession,
      user: {
        ...activeAuthSession.user,
        deviceId: picked.device.deviceId,
        deviceName: picked.device.deviceName,
      },
    };
    await storeAuthSession(context, activeAuthSession);
  }
  await applyIdentitySwitch(context, runtime);
  await ensureAutoCommitAnalysisSetup();
  const action = await vscode.window.showInformationMessage(
    `Mochi active device: ${activeIdentity.deviceName}`,
    "Restore Checkpoint"
  );
  if (action === "Restore Checkpoint") {
    await restoreCheckpointFromCloud(context, runtime);
  }
}

function getBuiltInProfiles() {
  return [
    {
      tenantId: "local-dev",
      userId: "alice",
      displayName: "Alice",
    },
    {
      tenantId: "local-dev",
      userId: "bob",
      displayName: "Bob",
    },
    {
      tenantId: "local-dev",
      userId: "charlie",
      displayName: "Charlie",
    },
  ].map((profile) => normalizeIdentity({
    ...profile,
    deviceId: activeIdentity.deviceId,
    deviceName: activeIdentity.deviceName,
  }));
}

function getBuiltInDevices() {
  return [
    {
      deviceId: "this-machine",
      deviceName: "This Machine",
    },
    {
      deviceId: "lab-pc",
      deviceName: "Lab PC",
    },
    {
      deviceId: "dorm-laptop",
      deviceName: "Dorm Laptop",
    },
  ].map((device) => normalizeIdentity({
    ...activeIdentity,
    ...device,
  }));
}

async function applyIdentitySwitch(context, runtime) {
  await context.globalState.update("localAgent.activeIdentity", activeIdentity);
  activeBaseSessionId = getStoredBaseSessionId(context, activeIdentity);
  runtime.setIdentity(activeIdentity);
  runtime.setSessionSyncAuthToken(getActiveAuthToken());
  runtime.setBaseSessionId(activeBaseSessionId);
  await runtime.ensureCurrentSession();
  lastReply = "";
  pendingPrefill = "";
  pendingReplies = [];
  pendingApprovals = [];
  pendingActivities = [];
  pendingReplyStream = "";
  await publishExtensionContext();
  await syncChatSessionUi(runtime, activeBaseSessionId);
}

async function restoreCheckpointFromCloud(context, runtime) {
  if (!getActiveAuthToken()) {
    vscode.window.showErrorMessage("Sign in to Mochi before restoring cloud checkpoints.");
    return;
  }

  if (!runtime.listRestoreCheckpoints || !runtime.restoreCheckpoint) {
    vscode.window.showErrorMessage("Checkpoint restore is not available in this runtime build.");
    return;
  }

  const checkpoints = await runtime.listRestoreCheckpoints({ limit: 12 });
  if (!Array.isArray(checkpoints) || !checkpoints.length) {
    vscode.window.showInformationMessage("No cloud checkpoints were found for the current user and workspace.");
    return;
  }

  const picked = await vscode.window.showQuickPick(
    checkpoints.map((item) => ({
      label: item.title || "Checkpoint",
      description: `${item.workspaceLabel || item.workspaceKey || "workspace"} · ${item.deviceName || item.deviceId || "unknown device"}`,
      detail: `${item.kind || "checkpoint"} · ${formatCheckpointTime(item.createdAt)} · ${truncateCheckpointSummary(item.summary)}`,
      checkpointId: item.checkpointId,
      baseSessionId: item.baseSessionId || "mochi-chat",
    })),
    {
      title: "Restore Mochi checkpoint",
      placeHolder: "Select the checkpoint to hydrate into the current workspace",
    }
  );

  if (!picked || !picked.checkpointId) {
    return;
  }

  const restored = await runtime.restoreCheckpoint(picked.checkpointId);
  if (!restored || !restored.baseSessionId) {
    vscode.window.showErrorMessage("Failed to restore checkpoint.");
    return;
  }

  activeBaseSessionId = restored.baseSessionId;
  await storeBaseSessionId(context, activeIdentity, activeBaseSessionId);
  runtime.setBaseSessionId(activeBaseSessionId);
  await runtime.ensureCurrentSession();
  lastReply = "";
  pendingPrefill = "";
  pendingReplies = [];
  pendingApprovals = [];
  pendingActivities = [];
  pendingReplyStream = "";
  await syncChatSessionUi(runtime, activeBaseSessionId);
  await openChatView();

  const checkpointTitle = restored.checkpoint && restored.checkpoint.title
    ? restored.checkpoint.title
    : picked.label;
  vscode.window.showInformationMessage(`Restored checkpoint: ${checkpointTitle}`);
}

async function analyzeLatestCommit(context) {
  if (!getActiveAuthToken()) {
    vscode.window.showErrorMessage("Sign in to Mochi before uploading commit security reports.");
    return;
  }

  const workspaceRoot = getTargetWorkspaceFolder();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Select a workspace folder before analyzing commits.");
    return;
  }

  await ensureAutoCommitAnalysisSetup();
  const identityApiBaseUrl = getIdentityApiBaseUrl();
  const result = await runCommitAnalysisScript(workspaceRoot);
  const action = result.riskLevel === "high"
    ? `${result.commitTitle} analyzed: ${result.findingCount} findings, risk ${result.riskLevel}.`
    : `${result.commitTitle} analyzed: risk ${result.riskLevel}.`;
  vscode.window.showInformationMessage(action, "Open Dashboard").then(async (picked) => {
    if (picked === "Open Dashboard") {
      await vscode.env.openExternal(vscode.Uri.parse(`${identityApiBaseUrl}/dashboard`));
    }
  });
}

async function runGitCommand(args, cwd) {
  return execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function ensureAutoCommitAnalysisSetup() {
  const workspaceRoot = getTargetWorkspaceFolder();
  if (!workspaceRoot) {
    return false;
  }

  const gitDir = path.join(workspaceRoot, ".git");
  try {
    const stat = await fs.stat(gitDir);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch (error) {
    return false;
  }

  await syncMochiGitConfig(workspaceRoot);
  await installPostCommitHook(workspaceRoot);
  return true;
}

async function syncMochiGitConfig(workspaceRoot) {
  const pairs = [
    ["mochi.identityApiUrl", getIdentityApiBaseUrl()],
    ["mochi.tenantId", activeIdentity.tenantId],
    ["mochi.userId", activeIdentity.userId],
    ["mochi.deviceId", activeIdentity.deviceId],
    ["mochi.authToken", getActiveAuthToken()],
  ];

  for (const [key, value] of pairs) {
    await runGitCommand(["config", "--local", key, String(value || "")], workspaceRoot);
  }
}

async function installPostCommitHook(workspaceRoot) {
  const hookPath = path.join(workspaceRoot, ".git", "hooks", "post-commit");
  const scriptPath = path.join(workspaceRoot, "scripts", "analyze_latest_commit.js").replace(/\\/g, "/");
  const rootArg = workspaceRoot.replace(/\\/g, "/");
  const hookContent = [
    "#!/bin/sh",
    "# Mochi auto-generated hook: analyze latest commit after each local commit.",
    `node \"${scriptPath}\" --workspace-root \"${rootArg}\" >/dev/null 2>&1 || true`,
    "",
  ].join("\n");

  await fs.writeFile(hookPath, hookContent, "utf8");
  await fs.chmod(hookPath, 0o755).catch(() => {});
}

async function runCommitAnalysisScript(workspaceRoot) {
  const scriptPath = path.join(workspaceRoot, "scripts", "analyze_latest_commit.js");
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--workspace-root", workspaceRoot], {
    cwd: workspaceRoot,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
  });
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1] || "{}";
  return JSON.parse(lastLine);
}

function getIdentityApiBaseUrl() {
  const text = String(process.env.MOCHI_IDENTITY_API_URL || "http://127.0.0.1:4000").trim();
  return text.endsWith("/") ? text.slice(0, -1) : text;
}

async function signInToMochi(context, runtime) {
  const email = await vscode.window.showInputBox({
    prompt: "Mochi email",
    placeHolder: "alice@mochi.local",
    ignoreFocusOut: true,
  });
  if (!email) {
    return;
  }

  const password = await vscode.window.showInputBox({
    prompt: "Mochi password",
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) {
    return;
  }

  const deviceName = await vscode.window.showInputBox({
    prompt: "Device name for this Mochi login",
    value: activeIdentity.deviceName || "This Machine",
    ignoreFocusOut: true,
  });
  if (!deviceName) {
    return;
  }

  try {
    const authSession = await requestMochiAuth("/api/v1/auth/login", {
      email,
      password,
      deviceName,
    });
    await applyMochiAuthSession(context, runtime, authSession);
    const userLabel = (authSession && authSession.user && (authSession.user.displayName || authSession.user.email)) || email;
    vscode.window.showInformationMessage(`Signed in to Mochi as ${userLabel}.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Mochi sign in failed: ${error && error.message ? error.message : String(error)}`);
  }
}

async function registerForMochi(context, runtime) {
  const displayName = await vscode.window.showInputBox({
    prompt: "Display name",
    placeHolder: "New User",
    ignoreFocusOut: true,
  });
  if (!displayName) {
    return;
  }

  const email = await vscode.window.showInputBox({
    prompt: "Email",
    placeHolder: "new@mochi.local",
    ignoreFocusOut: true,
  });
  if (!email) {
    return;
  }

  const password = await vscode.window.showInputBox({
    prompt: "Password",
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) {
    return;
  }

  const deviceName = await vscode.window.showInputBox({
    prompt: "Device name for this Mochi login",
    value: activeIdentity.deviceName || "This Machine",
    ignoreFocusOut: true,
  });
  if (!deviceName) {
    return;
  }

  try {
    const authSession = await requestMochiAuth("/api/v1/auth/register", {
      displayName,
      email,
      password,
      deviceName,
    });
    await applyMochiAuthSession(context, runtime, authSession);
    const userLabel = (authSession && authSession.user && (authSession.user.displayName || authSession.user.email)) || email;
    vscode.window.showInformationMessage(`Registered and signed in to Mochi as ${userLabel}.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Mochi registration failed: ${error && error.message ? error.message : String(error)}`);
  }
}

async function signOutFromMochi(context, runtime) {
  const token = getActiveAuthToken();
  if (token) {
    await fetch(`${getIdentityApiBaseUrl()}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => null);
  }

  activeAuthSession = null;
  await storeAuthSession(context, null);
  activeIdentity = normalizeIdentity({
    ...DEFAULT_IDENTITY,
    deviceId: activeIdentity.deviceId,
    deviceName: activeIdentity.deviceName,
  });
  await applyIdentitySwitch(context, runtime);
  await ensureAutoCommitAnalysisSetup();
  vscode.window.showInformationMessage("Signed out from Mochi cloud sync.");
}

async function requestMochiAuth(pathname, body) {
  const response = await fetch(`${getIdentityApiBaseUrl()}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload && payload.error ? payload.error : `Authentication failed with status ${response.status}`);
  }
  return payload;
}

async function applyMochiAuthSession(context, runtime, authPayload) {
  activeAuthSession = authPayload && typeof authPayload === "object"
    ? {
        token: authPayload.token || "",
        user: authPayload.user || null,
        session: authPayload.session || null,
      }
    : null;
  await storeAuthSession(context, activeAuthSession);
  activeIdentity = deriveIdentityFromAuthUser(activeAuthSession && activeAuthSession.user ? activeAuthSession.user : null, activeIdentity);
  await applyIdentitySwitch(context, runtime);
  await ensureAutoCommitAnalysisSetup();
}

async function handleWebviewAuthSubmit(context, runtime, payload) {
  const mode = payload && payload.mode === "register" ? "register" : "signin";
  const email = String((payload && payload.email) || "").trim();
  const password = String((payload && payload.password) || "");
  const deviceName = String((payload && payload.deviceName) || "").trim() || activeIdentity.deviceName || "This Machine";
  const displayName = String((payload && payload.displayName) || "").trim();

  if (!email || !password || (mode === "register" && !displayName)) {
    postToChatView({
      type: "authResult",
      value: { ok: false, error: "Please fill in all required fields." },
    });
    return;
  }

  try {
    const body = mode === "register"
      ? { displayName, email, password, deviceName }
      : { email, password, deviceName };
    const pathname = mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
    const authSession = await requestMochiAuth(pathname, body);
    await applyMochiAuthSession(context, runtime, authSession);
    const userLabel = (authSession && authSession.user && (authSession.user.displayName || authSession.user.email)) || email;
    postToChatView({
      type: "authResult",
      value: {
        ok: true,
        message: mode === "register"
          ? `Registered and signed in as ${userLabel}.`
          : `Signed in as ${userLabel}.`,
      },
    });
    vscode.window.showInformationMessage(
      mode === "register"
        ? `Registered and signed in to Mochi as ${userLabel}.`
        : `Signed in to Mochi as ${userLabel}.`
    );
  } catch (error) {
    const message = error && error.message ? error.message : String(error || "Authentication failed.");
    postToChatView({
      type: "authResult",
      value: { ok: false, error: message },
    });
  }
}

async function handleWebviewLoadCheckpoints(runtime) {
  if (!getActiveAuthToken()) {
    postToChatView({
      type: "checkpointTree",
      value: [],
    });
    return;
  }

  try {
    const tree = runtime.listRestoreTree
      ? await runtime.listRestoreTree({ limit: 200 })
      : [];
    postToChatView({
      type: "checkpointTree",
      value: Array.isArray(tree) ? tree : [],
    });
  } catch (error) {
    postToChatView({
      type: "checkpointTree",
      value: [],
    });
    vscode.window.showErrorMessage(error && error.message ? error.message : String(error));
  }
}

async function handleWebviewRestoreCheckpoint(context, runtime, checkpointId) {
  if (!checkpointId) {
    postToChatView({
      type: "checkpointRestoreResult",
      value: { ok: false, error: "Missing checkpoint id." },
    });
    return;
  }
  if (!getActiveAuthToken()) {
    postToChatView({
      type: "checkpointRestoreResult",
      value: { ok: false, error: "Sign in to Mochi before restoring checkpoints." },
    });
    return;
  }
  if (!runtime.restoreCheckpoint) {
    postToChatView({
      type: "checkpointRestoreResult",
      value: { ok: false, error: "Checkpoint restore is not available in this runtime build." },
    });
    return;
  }

  try {
    const restored = await runtime.restoreCheckpoint(checkpointId);
    if (!restored || !restored.baseSessionId) {
      postToChatView({
        type: "checkpointRestoreResult",
        value: { ok: false, error: "Checkpoint not found or could not be restored." },
      });
      return;
    }

    activeBaseSessionId = restored.baseSessionId;
    await storeBaseSessionId(context, activeIdentity, activeBaseSessionId);
    runtime.setBaseSessionId(activeBaseSessionId);
    await runtime.ensureCurrentSession();
    lastReply = "";
    pendingPrefill = "";
    pendingReplies = [];
    pendingApprovals = [];
    pendingActivities = [];
    pendingReplyStream = "";
    await syncChatSessionUi(runtime, activeBaseSessionId);

    const title = restored.checkpoint && restored.checkpoint.title
      ? restored.checkpoint.title
      : "Checkpoint";
    postToChatView({
      type: "checkpointRestoreResult",
      value: { ok: true, message: `Restored: ${title}` },
    });
    vscode.window.showInformationMessage(`Restored checkpoint: ${title}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error || "Restore failed.");
    postToChatView({
      type: "checkpointRestoreResult",
      value: { ok: false, error: message },
    });
  }
}

function formatCheckpointTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "unknown time";
  }
  return date.toLocaleString();
}

function truncateCheckpointSummary(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "No summary";
  }
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}
