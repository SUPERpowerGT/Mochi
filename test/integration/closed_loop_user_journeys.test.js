const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ChatController } = require("../../src/extension/chat_controller");

function clearProviderEnv() {
  for (const key of [
    "MOCHI_MODEL_PROVIDER",
    "OPENAI_API_KEY",
    "MOCHI_OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "OPENAI_API_FORMAT",
  ]) {
    delete process.env[key];
  }
}

function clearConfigModules() {
  for (const modulePath of [
    "../../src/extension/model_config",
    "../../src/runtime/support/openai_env",
    "../../src/runtime/support/provider_context",
  ]) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function createFakeVscode(settings = {}) {
  return {
    workspace: {
      getConfiguration() {
        return {
          inspect(key) {
            return Object.prototype.hasOwnProperty.call(settings, key)
              ? { globalValue: settings[key] }
              : {};
          },
          get(key, fallback) {
            return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback;
          },
        };
      },
    },
  };
}

function createChatHarness(options = {}) {
  const posts = [];
  const runtimeCalls = [];
  const commandCalls = [];
  const runtime = {
    getBaseSessionId: () => options.baseSessionId || "journey-session",
    sendMessage: async (prompt, runOptions) => {
      runtimeCalls.push({ prompt, runOptions });
      return options.reply || `Echo: ${prompt}`;
    },
    listCurrentWorkspaceSessionsForUi: async () => options.sessions || [],
    getCurrentSessionMessagesForUi: async () => options.messages || [],
  };
  const controller = new ChatController({
    vscode: {
      commands: {
        executeCommand: async (command) => {
          commandCalls.push(command);
        },
      },
      window: {
        showErrorMessage: () => {},
        showInformationMessage: () => {},
      },
    },
    runtime,
    postToChatView: (message) => {
      posts.push(message);
      return true;
    },
    getSessionLabel: () => options.baseSessionId || "journey-session",
    ensureModelConfigured: options.ensureModelConfigured,
    createNewSession: options.createNewSession,
    switchSession: options.switchSession,
    deleteSession: options.deleteSession,
    resolveApprovalDecision: options.resolveApprovalDecision,
    getLastReply: () => options.lastReply || "",
    setLastReply: () => {},
    getPendingPrefill: () => "",
    setPendingPrefill: () => {},
    getPendingReplies: () => [],
    setPendingReplies: () => {},
    getPendingApprovals: () => [],
    setPendingApprovals: () => {},
    getPendingActivities: () => [],
    setPendingActivities: () => {},
    getPendingReplyStream: () => "",
    setPendingReplyStream: () => {},
    openChatView: () => {},
    getWorkspaceDescription: () => "Workspace: test",
    getEditorContext: () => "File: test.js\n\nselected text",
  });

  return {
    commandCalls,
    controller,
    posts,
    runtimeCalls,
  };
}

test("journey: installed extension package exposes the user-facing entry points", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
  const ignore = fs.readFileSync(path.join(__dirname, "..", "..", ".vscodeignore"), "utf8");
  const commandTitles = new Set(packageJson.contributes.commands.map((command) => command.title));

  assert.equal(packageJson.publisher, "zee");
  assert.equal(packageJson.name, "mochi-local-agent");
  assert.equal(packageJson.main, "./src/extension/extension.js");
  assert.equal(commandTitles.has("Local Agent: Open Chat"), true);
  assert.equal(commandTitles.has("Mochi: Configure Model Credentials"), true);
  assert.equal(commandTitles.has("Mochi: Open Memory Controls"), true);
  assert.equal(commandTitles.has("Mochi: Toggle Current Window Private Mode"), true);
  assert.equal(commandTitles.has("Mochi: Delete Current Window Artifacts"), true);
  assert.match(ignore, /^test\/\*\*$/m);
  assert.match(ignore, /^doc\/\*\*$/m);
});

test("journey: first run reuses local config and can send a chat without prompting", async () => {
  const previousHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-journey-config-"));
  process.env.HOME = home;
  clearProviderEnv();
  fs.writeFileSync(
    path.join(home, ".openai-env"),
    [
      'export MOCHI_MODEL_PROVIDER="openai"',
      'export OPENAI_API_KEY="sk-test-local-config"',
      'export OPENAI_BASE_URL="https://api.openai.com/v1"',
      'export OPENAI_MODEL="gpt-4.1-mini"',
      'export OPENAI_API_FORMAT="chat_completions"',
      "",
    ].join("\n")
  );

  clearConfigModules();
  const { hasModelApiKey, loadMochiModelConfig } = require("../../src/extension/model_config");
  const modelConfig = await loadMochiModelConfig(createFakeVscode(), {
    secrets: { get: async () => "" },
  });
  const { controller, posts, runtimeCalls } = createChatHarness({
    ensureModelConfigured: async () => hasModelApiKey(modelConfig),
    reply: "configured reply",
  });

  await controller.handleWebviewMessage({
    type: "send",
    prompt: "hello after install",
    includeSelection: true,
    baseSessionId: "journey-session",
  });

  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].prompt, "hello after install");
  const replyPost = posts.find((message) => message.type === "reply");
  assert.deepEqual(replyPost, {
    type: "reply",
    value: "configured reply",
    baseSessionId: "journey-session",
  });

  process.env.HOME = previousHome;
});

test("journey: first chat blocks cleanly when no model key is configured", async () => {
  const { controller, posts, runtimeCalls } = createChatHarness({
    ensureModelConfigured: async () => false,
  });

  await controller.handleWebviewMessage({
    type: "send",
    prompt: "hello without config",
    includeSelection: true,
    baseSessionId: "journey-session",
  });

  assert.equal(runtimeCalls.length, 0);
  assert.equal(posts.at(-1).type, "error");
  assert.match(posts.at(-1).value, /model API key/);
});

test("journey: user can create, switch, and close chat sessions from the webview", async () => {
  const events = [];
  const { controller } = createChatHarness({
    createNewSession: async () => events.push("new"),
    switchSession: async (baseSessionId) => events.push(`switch:${baseSessionId}`),
    deleteSession: async (baseSessionId) => events.push(`delete:${baseSessionId}`),
  });

  await controller.handleWebviewMessage({ type: "newSession" });
  await controller.handleWebviewMessage({ type: "switchSession", baseSessionId: "session-b" });
  await controller.handleWebviewMessage({ type: "closeSession", baseSessionId: "session-b" });

  assert.deepEqual(events, ["new", "switch:session-b", "delete:session-b"]);
});

test("journey: approval decisions travel from chat UI to the pending resolver", async () => {
  const approvals = [];
  const { controller } = createChatHarness({
    resolveApprovalDecision: (id, approved) => {
      approvals.push({ id, approved });
    },
  });

  await controller.handleWebviewMessage({
    type: "approvalDecision",
    id: "approval-123",
    approved: true,
  });

  assert.deepEqual(approvals, [{ id: "approval-123", approved: true }]);
});
