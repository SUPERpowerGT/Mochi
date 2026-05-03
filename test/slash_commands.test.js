const assert = require("node:assert/strict");
const test = require("node:test");
const { ChatController } = require("../src/extension/chat_controller");

function createController() {
  const executed = [];
  const posted = [];
  const controller = new ChatController({
    vscode: {
      commands: {
        executeCommand: async (command) => {
          executed.push(command);
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

  return { controller, executed, posted };
}

test("slash command messages execute only mapped VS Code commands", async () => {
  const expectedCommands = {
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

  for (const [slashCommand, vscodeCommand] of Object.entries(expectedCommands)) {
    const { controller, executed, posted } = createController();

    await controller.handleWebviewMessage({
      type: "slashCommand",
      command: slashCommand,
    });

    assert.deepEqual(executed, [vscodeCommand], slashCommand);
    assert.deepEqual(posted.at(-1), {
      type: "slashCommandResult",
      ok: true,
      value: "Command finished.",
    });
  }
});

test("unknown slash commands are rejected without executing VS Code commands", async () => {
  const { controller, executed, posted } = createController();

  await controller.handleWebviewMessage({
    type: "slashCommand",
    command: "notAllowed",
  });

  assert.deepEqual(executed, []);
  assert.deepEqual(posted.at(-1), {
    type: "slashCommandResult",
    ok: false,
    value: "Unknown slash command.",
  });
});

test("private toggle panel message executes private mode command", async () => {
  const { controller, executed, posted } = createController();

  await controller.handleWebviewMessage({
    type: "togglePrivateWindow",
  });

  assert.deepEqual(executed, ["localAgent.togglePrivateWindowMode"]);
  assert.deepEqual(posted.at(-1), {
    type: "slashCommandResult",
    ok: true,
    value: "Command finished.",
  });
});
