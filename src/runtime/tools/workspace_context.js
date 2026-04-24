const {
  normalizeRootPath,
  resolvePathInsideRoot,
} = require("../support/safe_paths");

function requireWorkspaceRoot(getWorkspaceRoot) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error("No workspace folder is selected.");
  }

  return normalizeRootPath(workspaceRoot);
}

function resolveWorkspacePath(workspaceRoot, relativePath) {
  return resolvePathInsideRoot(workspaceRoot, relativePath, "workspace path");
}

module.exports = {
  requireWorkspaceRoot,
  resolveWorkspacePath,
};
