const path = require("path");

function requireWorkspaceRoot(getWorkspaceRoot) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error("No workspace folder is selected.");
  }

  return path.resolve(workspaceRoot); // nosemgrep
}

function resolveWorkspacePath(workspaceRoot, relativePath) {
  const target = path.resolve(workspaceRoot, relativePath); // nosemgrep
  const normalizedRoot = workspaceRoot.endsWith(path.sep)
    ? workspaceRoot
    : `${workspaceRoot}${path.sep}`;

  if (target !== workspaceRoot && !target.startsWith(normalizedRoot)) {
    throw new Error("Path must stay inside the active workspace folder.");
  }

  return target;
}

module.exports = {
  requireWorkspaceRoot,
  resolveWorkspacePath,
};
