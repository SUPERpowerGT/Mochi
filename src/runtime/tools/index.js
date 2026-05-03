const { createCommandTools } = require("./command_tools");
const { createEditorTools } = require("./editor_tools");
const { createFileTools } = require("./file_tools");
const { createGitTools } = require("./git_tools");
const { createWorkspaceTools } = require("./workspace_tools");
const { wrapToolsWithLifecycle } = require("../support/tool_lifecycle");

function createRuntimeTools(options) {
  const tools = [
    ...createWorkspaceTools(options),
    ...createFileTools(options),
    ...createCommandTools(options),
    ...createEditorTools(options),
    ...createGitTools(options),
  ];

  return wrapToolsWithLifecycle(tools, {
    getRunState: options.getRunState,
    requestToolAccess: options.requestToolAccess,
  });
}

module.exports = {
  createRuntimeTools,
};
