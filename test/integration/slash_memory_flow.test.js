const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ChatController } = require("../../src/extension/chat_controller");
const { getWebviewHtml } = require("../../src/extension/webview_html");
const { MemoryManager } = require("../../src/runtime/memory/memory_manager");

function extractSlashCommandIdsFromWebview() {
  const html = getWebviewHtml({ logoUri: "logo.svg" });
  const commandBlocks = html.match(/\{\n\s+id: "[^"]+"[\s\S]*?\n\s+\}/g) || [];
  return commandBlocks
    .map((block) => {
      const id = block.match(/id: "([^"]+)"/);
      const client = block.match(/client: "([^"]+)"/);
      return id && !client ? id[1] : "";
    })
    .filter(Boolean);
}

function createIntegrationHarness() {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-integration-memory-"));
  const baseSessionId = "integration-session";
  const memoryManager = new MemoryManager({
    storageRoot,
    getWorkspaceRoot: () => storageRoot,
    baseSessionId,
  });
  const executed = [];
  const posted = [];
  const commandHandlers = {
    "localAgent.openMemoryControls": async () => {
      await memoryManager.getMemoryControlsForUi(baseSessionId);
    },
    "localAgent.openMemorySnapshot": async () => {
      await memoryManager.getMemoryControlsForUi(baseSessionId);
    },
    "localAgent.openRawMemorySnapshot": async () => {
      await memoryManager.ensureCurrentSession();
    },
    "localAgent.togglePrivateWindowMode": async () => {
      const controls = await memoryManager.getMemoryControlsForUi(baseSessionId);
      await memoryManager.setPrivateWindowModeForUi(baseSessionId, !controls.policy.privateWindow);
    },
    "localAgent.togglePersistentMemoryRead": async () => {
      const controls = await memoryManager.getMemoryControlsForUi(baseSessionId);
      await memoryManager.setMemoryPolicyForUi(baseSessionId, {
        disablePersistentMemory: !controls.policy.disablePersistentMemory,
      });
    },
    "localAgent.toggleSessionMemoryIsolation": async () => {
      const controls = await memoryManager.getMemoryControlsForUi(baseSessionId);
      await memoryManager.setMemoryPolicyForUi(baseSessionId, {
        isolateSession: !controls.policy.isolateSession,
      });
    },
    "localAgent.destroyCurrentWindowArtifacts": async () => {
      await memoryManager.destroyCurrentWindowArtifactsForUi(baseSessionId);
    },
    "localAgent.clearCurrentSessionMemory": async () => {
      await memoryManager.clearCurrentSessionMemoryForUi(baseSessionId);
    },
    "localAgent.clearCurrentSessionSummaryMemory": async () => {
      await memoryManager.clearCurrentSessionSummaryMemoryForUi(baseSessionId);
    },
    "localAgent.clearCurrentTaskMemory": async () => {
      await memoryManager.clearCurrentTaskMemoryForUi(baseSessionId);
    },
    "localAgent.clearCurrentWorkspaceMemory": async () => {
      await memoryManager.clearCurrentWorkspaceMemoryForUi(baseSessionId);
    },
    "localAgent.clearUserMemory": async () => {
      await memoryManager.clearUserMemoryForUi(baseSessionId);
    },
    "localAgent.clearCurrentTraceMemory": async () => {
      await memoryManager.clearCurrentTraceAndRoutingMemoryForUi(baseSessionId);
    },
    "localAgent.clearAllMemory": async () => {
      await memoryManager.clearAllMemoryForUi();
    },
    "localAgent.configureModelCredentials": async () => {},
    "localAgent.selectWorkspaceFolder": async () => {},
    "localAgent.sendSelection": async () => {},
    "localAgent.applyLastReply": async () => {},
  };
  const controller = new ChatController({
    vscode: {
      commands: {
        executeCommand: async (command) => {
          executed.push(command);
          assert.equal(typeof commandHandlers[command], "function", command);
          await commandHandlers[command]();
        },
      },
      window: {
        showErrorMessage: () => {},
      },
    },
    postToChatView: (message) => {
      posted.push(message);
      return true;
    },
  });

  return {
    baseSessionId,
    controller,
    executed,
    memoryManager,
    posted,
  };
}

test("integration: webview slash memory toggles flow through ChatController into MemoryManager", async () => {
  const { baseSessionId, controller, executed, memoryManager, posted } = createIntegrationHarness();

  await controller.handleWebviewMessage({
    type: "slashCommand",
    command: "togglePrivateWindow",
  });
  let controls = await memoryManager.getMemoryControlsForUi(baseSessionId);
  assert.equal(controls.policy.privateWindow, true);
  assert.equal(controls.policy.disablePersistentMemory, true);
  assert.equal(controls.policy.isolateSession, true);

  await controller.handleWebviewMessage({
    type: "slashCommand",
    command: "togglePersistentMemory",
  });
  await controller.handleWebviewMessage({
    type: "slashCommand",
    command: "toggleSessionIsolation",
  });

  controls = await memoryManager.getMemoryControlsForUi(baseSessionId);
  assert.deepEqual(executed, [
    "localAgent.togglePrivateWindowMode",
    "localAgent.togglePersistentMemoryRead",
    "localAgent.toggleSessionMemoryIsolation",
  ]);
  assert.equal(controls.policy.privateWindow, true);
  assert.equal(controls.policy.disablePersistentMemory, false);
  assert.equal(controls.policy.isolateSession, false);
  assert.equal(posted.filter((message) => message.type === "slashCommandResult" && message.ok).length, 3);
});

test("integration: every non-client slash command in the webview reaches a registered command handler", async () => {
  const slashCommandIds = extractSlashCommandIdsFromWebview();
  assert.ok(slashCommandIds.length >= 3);

  const { controller, executed, posted } = createIntegrationHarness();
  for (const command of slashCommandIds) {
    await controller.handleWebviewMessage({
      type: "slashCommand",
      command,
    });
  }

  assert.equal(executed.length, slashCommandIds.length);
  assert.equal(posted.filter((message) => message.type === "slashCommandResult" && message.ok).length, slashCommandIds.length);
});
