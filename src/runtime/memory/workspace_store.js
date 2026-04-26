const fs = require("fs");
const path = require("path");
const { JsonFileStore } = require("./json_file_store");
const { nowIso } = require("./memory_utils");

async function readJsonIfPresent(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

async function detectWorkspaceFacts(workspaceRoot) {
  if (!workspaceRoot) {
    return {
      projectName: "",
      packageManager: null,
      languages: [],
      manifests: [],
      testCommand: null,
      verificationCommands: [],
    };
  }

  const manifests = [];
  const languages = new Set();
  let projectName = path.basename(workspaceRoot || "") || "workspace";
  let packageManager = null;
  let packageJsonHasTestScript = false;
  let packageJsonHasLintScript = false;
  let packageJsonHasTypecheckScript = false;
  let testCommand = null;

  const packageJsonPath = path.join(workspaceRoot, "package.json");
  const packageJson = await readJsonIfPresent(packageJsonPath);
  if (packageJson) {
    manifests.push("package.json");
    languages.add("javascript");
    if (typeof packageJson.name === "string" && packageJson.name.trim()) {
      projectName = packageJson.name.trim();
    }
    if (packageJson.scripts && typeof packageJson.scripts === "object") {
      packageJsonHasTestScript = typeof packageJson.scripts.test === "string";
      packageJsonHasLintScript = typeof packageJson.scripts.lint === "string";
      packageJsonHasTypecheckScript =
        typeof packageJson.scripts.typecheck === "string" ||
        typeof packageJson.scripts["check-types"] === "string";
    }
  }

  const fileChecks = [
    ["pnpm-lock.yaml", () => {
      packageManager = packageManager || "pnpm";
    }],
    ["yarn.lock", () => {
      packageManager = packageManager || "yarn";
    }],
    ["package-lock.json", () => {
      packageManager = packageManager || "npm";
    }],
    ["requirements.txt", () => {
      manifests.push("requirements.txt");
      languages.add("python");
      testCommand = testCommand || "pytest";
    }],
    ["pyproject.toml", () => {
      manifests.push("pyproject.toml");
      languages.add("python");
      testCommand = testCommand || "pytest";
    }],
    ["Cargo.toml", () => {
      manifests.push("Cargo.toml");
      languages.add("rust");
      testCommand = testCommand || "cargo test";
    }],
  ];

  for (const [filename, onFound] of fileChecks) {
    const target = path.join(workspaceRoot, filename);
    try {
      await fs.promises.access(target);
      onFound();
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        continue;
      }
    }
  }

  if (packageJson && !packageManager) {
    packageManager = "npm";
  }

  const verificationCommands = [];

  if (packageJsonHasTestScript) {
    const command = packageManager || "npm";
    const args = command === "yarn" ? ["test"] : ["test"];
    verificationCommands.push({
      label: "project tests",
      command,
      args,
    });
    testCommand = testCommand || `${command} ${args.join(" ")}`;
  }

  if (packageJsonHasLintScript) {
    const command = packageManager || "npm";
    const args = command === "yarn" ? ["lint"] : ["run", "lint"];
    verificationCommands.push({
      label: "lint",
      command,
      args,
    });
  }

  if (packageJsonHasTypecheckScript) {
    const command = packageManager || "npm";
    const args =
      command === "yarn"
        ? [typeof packageJson.scripts.typecheck === "string" ? "typecheck" : "check-types"]
        : ["run", typeof packageJson.scripts.typecheck === "string" ? "typecheck" : "check-types"];
    verificationCommands.push({
      label: "typecheck",
      command,
      args,
    });
  }

  if (languages.has("python")) {
    verificationCommands.push({
      label: "python tests",
      command: "pytest",
      args: [],
    });
  }

  if (languages.has("rust")) {
    verificationCommands.push({
      label: "rust tests",
      command: "cargo",
      args: ["test"],
    });
  }

  return {
    projectName,
    packageManager,
    languages: Array.from(languages),
    manifests,
    testCommand,
    verificationCommands,
  };
}

class WorkspaceStore {
  constructor(options = {}) {
    this.store = new JsonFileStore({
      storageRoot: options.storageRoot,
      filename: "workspaces.json",
      defaultData: {
        version: 1,
        workspaces: {},
      },
    });
  }

  async getOrCreateWorkspace(workspaceId, workspaceRoot) {
    const detected = await detectWorkspaceFacts(workspaceRoot);

    const data = await this.store.update((current) => {
      if (!current.workspaces[workspaceId]) {
        current.workspaces[workspaceId] = {
          id: workspaceId,
          rootPath: workspaceRoot || "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          detected,
          notes: [],
        };
      } else {
        current.workspaces[workspaceId].rootPath = workspaceRoot || "";
        current.workspaces[workspaceId].detected = detected;
        current.workspaces[workspaceId].updatedAt = nowIso();
      }

      return current;
    });

    return data.workspaces[workspaceId];
  }

  async getWorkspace(workspaceId) {
    const data = await this.store.read();
    return data.workspaces[workspaceId] || null;
  }

  async applySyncedWorkspace(workspaceId, workspaceRoot, syncedWorkspace = {}) {
    const detected = syncedWorkspace.detected && typeof syncedWorkspace.detected === "object"
      ? syncedWorkspace.detected
      : await detectWorkspaceFacts(workspaceRoot);

    const data = await this.store.update((current) => {
      if (!current.workspaces[workspaceId]) {
        current.workspaces[workspaceId] = {
          id: workspaceId,
          rootPath: workspaceRoot || "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          detected,
          notes: Array.isArray(syncedWorkspace.notes) ? syncedWorkspace.notes : [],
        };
        return current;
      }

      current.workspaces[workspaceId].rootPath = workspaceRoot || current.workspaces[workspaceId].rootPath || "";
      current.workspaces[workspaceId].detected = detected;
      current.workspaces[workspaceId].notes = Array.isArray(syncedWorkspace.notes)
        ? syncedWorkspace.notes
        : current.workspaces[workspaceId].notes || [];
      current.workspaces[workspaceId].updatedAt = nowIso();
      return current;
    });

    return data.workspaces[workspaceId];
  }
}

module.exports = {
  WorkspaceStore,
};
