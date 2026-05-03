const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { evaluateFileOperationApproval } = require("../support/approval_policy");
const { requireWorkspaceRoot, resolveWorkspacePath } = require("./workspace_context");
const { createApprovalDeniedResult, runWithApproval } = require("./tool_approval");
const { createToolResult, truncateText } = require("./tool_result");

const mutationQueuesByPath = new Map();

function createFileTools({ sdk, zod, getWorkspaceRoot, getRunState, requestApproval }) {
  const { tool } = sdk;
  const z = zod.z;

  return [
    tool({
      name: "read_file",
      description: "Read a UTF-8 text file from the active workspace.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const stat = await fs.promises.stat(target).catch(() => null);

        if (!stat) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "read_file",
            path: relativePath,
            message: `Path not found: ${relativePath}`,
          });
        }
        if (!stat.isFile()) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "read_file",
            path: relativePath,
            message: `Not a file: ${relativePath}`,
          });
        }

        const content = await fs.promises.readFile(target, "utf8");
        recordFileSnapshot(getRunState, target, relativePath, content);
        return createToolResult({
          ok: true,
          kind: "file",
          action: "read_file",
          path: relativePath,
          message: `Read ${relativePath}`,
          summary: `Read ${relativePath}`,
          data: {
            content,
            preview: truncateText(content, 600),
          },
        });
      },
    }),
    tool({
      name: "write_file",
      description: "Create or overwrite a UTF-8 text file in the active workspace.",
      parameters: z.object({
        relativePath: z.string(),
        content: z.string(),
      }),
      execute: async ({ relativePath, content }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const existingContent = await fs.promises.readFile(target, "utf8").catch(() => null);
        const writeTarget = async () => runSerializedFileMutation(target, async () => {
          const latestContent = await fs.promises.readFile(target, "utf8").catch(() => null);
          const staleResult = createStaleFileResultIfNeeded({
            getRunState,
            target,
            relativePath,
            action: "write_file",
            existingContent: latestContent,
          });
          if (staleResult) {
            return staleResult;
          }

          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          await fs.promises.writeFile(target, content, "utf8");
          recordFileSnapshot(getRunState, target, relativePath, content);
          return createToolResult({
            ok: true,
            kind: "file",
            action: "write_file",
            path: relativePath,
            message: `Wrote ${relativePath}`,
            data: {
              bytes: Buffer.byteLength(content, "utf8"),
              created: latestContent === null,
              emptied: content.length === 0,
            },
          });
        });
        const approval = evaluateFileOperationApproval({
          action: "write_file",
          relativePath,
          prompt: getRunState ? getRunState().prompt : "",
          targetExists: existingContent !== null,
          existingContent,
          nextContent: content,
        });

        return runWithApproval({
          approval,
          requestApproval,
          prompt: getRunState ? getRunState().prompt : "",
          run: writeTarget,
          deniedResult: () =>
            createApprovalDeniedResult({
              kind: "file",
              action: "write_file",
              path: relativePath,
              message: `User denied approval for write_file on ${relativePath}`,
            }),
          fallbackResult: () =>
            createToolResult({
              ok: false,
              kind: "file",
              action: "write_file",
              path: relativePath,
              message: approval.message,
            }),
        });
      },
    }),
    tool({
      name: "append_file",
      description: "Append UTF-8 text to a file in the active workspace, creating it if needed.",
      parameters: z.object({
        relativePath: z.string(),
        content: z.string(),
      }),
      execute: async ({ relativePath, content }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        return runSerializedFileMutation(target, async () => {
          const existingContent = await fs.promises.readFile(target, "utf8").catch(() => null);
          const staleResult = createStaleFileResultIfNeeded({
            getRunState,
            target,
            relativePath,
            action: "append_file",
            existingContent,
          });
          if (staleResult) {
            return staleResult;
          }

          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          await fs.promises.appendFile(target, content, "utf8");
          recordFileSnapshot(
            getRunState,
            target,
            relativePath,
            existingContent === null ? content : `${existingContent}${content}`
          );
          return createToolResult({
            ok: true,
            kind: "file",
            action: "append_file",
            path: relativePath,
            message: `Appended to ${relativePath}`,
            data: {
              bytes: Buffer.byteLength(content, "utf8"),
            },
          });
        });
      },
    }),
    tool({
      name: "make_dir",
      description: "Create a directory in the active workspace.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        return runSerializedFileMutation(target, async () => {
          await fs.promises.mkdir(target, { recursive: true });
          return createToolResult({
            ok: true,
            kind: "file",
            action: "make_dir",
            path: relativePath,
            message: `Created directory ${relativePath}`,
          });
        });
      },
    }),
    tool({
      name: "delete_file",
      description: "Delete a single file in the active workspace. Refuses to delete directories.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const stat = await fs.promises.stat(target).catch(() => null);

        if (!stat) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_file",
            path: relativePath,
            message: `Path not found: ${relativePath}`,
          });
        }
        if (!stat.isFile()) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_file",
            path: relativePath,
            message: `Refusing to delete non-file path: ${relativePath}`,
          });
        }

        const approval = evaluateFileOperationApproval({
          action: "delete_file",
          relativePath,
          prompt: getRunState ? getRunState().prompt : "",
          targetExists: true,
        });

        return runWithApproval({
          approval,
          requestApproval,
          prompt: getRunState ? getRunState().prompt : "",
          run: async () => runSerializedFileMutation(target, async () => {
            const latestContent = await fs.promises.readFile(target, "utf8").catch(() => null);
            const staleResult = createStaleFileResultIfNeeded({
              getRunState,
              target,
              relativePath,
              action: "delete_file",
              existingContent: latestContent,
            });
            if (staleResult) {
              return staleResult;
            }

            await fs.promises.unlink(target);
            recordFileSnapshot(getRunState, target, relativePath, null);
            return createToolResult({
              ok: true,
              kind: "file",
              action: "delete_file",
              path: relativePath,
              message: `Deleted ${relativePath}`,
            });
          }),
          deniedResult: () =>
            createApprovalDeniedResult({
              kind: "file",
              action: "delete_file",
              path: relativePath,
              message: `User denied approval for delete_file on ${relativePath}`,
            }),
          fallbackResult: () =>
            createToolResult({
              ok: false,
              kind: "file",
              action: "delete_file",
              path: relativePath,
              message: approval.message,
            }),
        });
      },
    }),
    tool({
      name: "edit_file",
      description:
        "Replace an exact string within a file. Reads the current content, performs the replacement, and writes back. " +
        "Fails if oldString is not found, or if it appears more than once and replaceAll is false. " +
        "Use read_file first so the replacement target is fresh.",
      parameters: z.object({
        relativePath: z.string(),
        oldString: z.string().describe("Exact text to find (must be unique in the file unless replaceAll is true)"),
        newString: z.string().describe("Text to replace it with"),
        replaceAll: z.boolean().default(false).describe("Replace every occurrence instead of requiring uniqueness"),
      }),
      execute: async ({ relativePath, oldString, newString, replaceAll = false }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);

        return runSerializedFileMutation(target, async () => {
          const existingContent = await fs.promises.readFile(target, "utf8").catch(() => null);

          if (existingContent === null) {
            return createToolResult({
              ok: false,
              kind: "file",
              action: "edit_file",
              path: relativePath,
              message: `File not found: ${relativePath}`,
            });
          }

          const staleResult = createStaleFileResultIfNeeded({
            getRunState,
            target,
            relativePath,
            action: "edit_file",
            existingContent,
          });
          if (staleResult) {
            return staleResult;
          }

          const occurrences = countOccurrences(existingContent, oldString);

          if (occurrences === 0) {
            return createToolResult({
              ok: false,
              kind: "file",
              action: "edit_file",
              path: relativePath,
              message: `oldString not found in ${relativePath}. Use read_file to verify the exact content.`,
              data: { occurrences: 0 },
            });
          }

          if (occurrences > 1 && !replaceAll) {
            return createToolResult({
              ok: false,
              kind: "file",
              action: "edit_file",
              path: relativePath,
              message:
                `oldString appears ${occurrences} times in ${relativePath}. ` +
                "Provide more surrounding context to make it unique, or set replaceAll to true.",
              data: { occurrences },
            });
          }

          const updatedContent = replaceAll
            ? existingContent.split(oldString).join(newString)
            : existingContent.replace(oldString, newString);

          await fs.promises.writeFile(target, updatedContent, "utf8");
          recordFileSnapshot(getRunState, target, relativePath, updatedContent);

          return createToolResult({
            ok: true,
            kind: "file",
            action: "edit_file",
            path: relativePath,
            message: `Edited ${relativePath} (${occurrences} replacement${occurrences !== 1 ? "s" : ""})`,
            summary: `Edited ${relativePath}`,
            data: {
              occurrences,
              replaceAll,
              bytes: Buffer.byteLength(updatedContent, "utf8"),
            },
          });
        });
      },
    }),
    tool({
      name: "search_in_files",
      description:
        "Search for a pattern across all text files in the workspace (or a subdirectory). " +
        "Returns matching lines with file path, line number, and surrounding context. " +
        "Pattern is a JavaScript regular expression string (e.g. 'function\\s+myFn', 'TODO'). " +
        "Use this instead of read_file when you need to locate code across the repo.",
      parameters: z.object({
        pattern: z.string().describe("JavaScript regex pattern to search for"),
        directory: z.string().default(".").describe("Subdirectory to search in (default: workspace root)"),
        caseSensitive: z.boolean().default(false),
        maxResults: z.number().int().min(1).max(200).default(50),
        fileGlob: z.string().default("").describe("Optional file extension filter, e.g. '.js' or '.ts'"),
      }),
      execute: async ({ pattern, directory = ".", caseSensitive = false, maxResults = 50, fileGlob = "" }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const searchRoot = resolveWorkspacePath(workspaceRoot, directory);

        let regex;
        try {
          regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
        } catch {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "search_in_files",
            path: directory,
            message: `Invalid regex pattern: ${pattern}`,
          });
        }

        const matches = [];
        const errors = [];
        let filesScanned = 0;

        await walkDirectory(searchRoot, workspaceRoot, async (absolutePath, relativePath) => {
          if (matches.length >= maxResults) {
            return false; // stop walking
          }
          if (fileGlob && !relativePath.endsWith(fileGlob)) {
            return true;
          }

          let content;
          try {
            content = await fs.promises.readFile(absolutePath, "utf8");
          } catch {
            return true; // skip unreadable files
          }

          if (isBinaryContent(content)) {
            return true;
          }

          filesScanned++;
          const lines = content.split("\n");
          regex.lastIndex = 0;

          for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
              matches.push({
                file: relativePath,
                line: i + 1,
                content: lines[i].trim(),
                context: lines.slice(Math.max(0, i - 1), i + 2).map((l) => l.trim()),
              });
            }
          }

          return true;
        });

        const truncated = matches.length >= maxResults;

        return createToolResult({
          ok: true,
          kind: "file",
          action: "search_in_files",
          path: directory,
          message: truncated
            ? `Found ${matches.length}+ matches (limit reached) in ${filesScanned} files`
            : `Found ${matches.length} match${matches.length !== 1 ? "es" : ""} in ${filesScanned} files`,
          summary: `Search "${pattern}": ${matches.length} match${matches.length !== 1 ? "es" : ""}`,
          data: {
            pattern,
            matches,
            filesScanned,
            truncated,
          },
        });
      },
    }),
    tool({
      name: "delete_dir",
      description:
        "Recursively delete a directory inside the active workspace. Refuses to delete files or the workspace root.",
      parameters: z.object({
        relativePath: z.string(),
      }),
      execute: async ({ relativePath }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const target = resolveWorkspacePath(workspaceRoot, relativePath);
        const normalizedRelativePath = String(relativePath || "").trim();
        const stat = await fs.promises.stat(target).catch(() => null);

        if (!normalizedRelativePath || normalizedRelativePath === "." || target === workspaceRoot) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_dir",
            path: relativePath,
            message: "Refusing to delete the workspace root directory.",
          });
        }

        if (!stat) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_dir",
            path: relativePath,
            message: `Path not found: ${relativePath}`,
          });
        }

        if (!stat.isDirectory()) {
          return createToolResult({
            ok: false,
            kind: "file",
            action: "delete_dir",
            path: relativePath,
            message: `Not a directory: ${relativePath}`,
          });
        }

        const approval = evaluateFileOperationApproval({
          action: "delete_dir",
          relativePath,
          prompt: getRunState ? getRunState().prompt : "",
          targetExists: true,
        });

        return runWithApproval({
          approval,
          requestApproval,
          prompt: getRunState ? getRunState().prompt : "",
          run: async () => runSerializedFileMutation(target, async () => {
            await fs.promises.rm(target, { recursive: true, force: false });
            return createToolResult({
              ok: true,
              kind: "file",
              action: "delete_dir",
              path: relativePath,
              message: `Deleted directory ${relativePath}`,
            });
          }),
          deniedResult: () =>
            createApprovalDeniedResult({
              kind: "file",
              action: "delete_dir",
              path: relativePath,
              message: `User denied approval for delete_dir on ${relativePath}`,
            }),
          fallbackResult: () =>
            createToolResult({
              ok: false,
              kind: "file",
              action: "delete_dir",
              path: relativePath,
              message: approval.message,
            }),
        });
      },
    }),
  ];
}

function getFileSnapshotStore(getRunState) {
  const runState = getRunState ? getRunState() : null;
  if (!runState) {
    return null;
  }

  if (!runState.fileSnapshots) {
    runState.fileSnapshots = {};
  }

  return runState.fileSnapshots;
}

function recordFileSnapshot(getRunState, absolutePath, relativePath, content) {
  const snapshots = getFileSnapshotStore(getRunState);
  if (!snapshots) {
    return;
  }

  snapshots[absolutePath] = {
    relativePath,
    fingerprint: createContentFingerprint(content),
    capturedAt: new Date().toISOString(),
  };
}

function createStaleFileResultIfNeeded({ getRunState, target, relativePath, action, existingContent }) {
  const snapshots = getFileSnapshotStore(getRunState);
  const snapshot = snapshots ? snapshots[target] : null;
  if (!snapshot) {
    return null;
  }

  const latestFingerprint = createContentFingerprint(existingContent);
  if (snapshot.fingerprint === latestFingerprint) {
    return null;
  }

  return createToolResult({
    ok: false,
    kind: "file",
    action,
    path: relativePath,
    message:
      `Refusing to ${action} ${relativePath} because it changed since this run last read it. ` +
      "Read the file again and merge with the latest contents before writing.",
    data: {
      staleRead: true,
      previousFingerprint: snapshot.fingerprint,
      latestFingerprint,
      capturedAt: snapshot.capturedAt,
    },
  });
}

function createContentFingerprint(content) {
  if (content === null || content === undefined) {
    return "missing";
  }

  return crypto.createHash("sha1").update(String(content)).digest("hex");
}

function countOccurrences(haystack, needle) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }

  return count;
}

function isBinaryContent(content) {
  // Heuristic: if >10% of the first 512 bytes are non-printable, treat as binary
  const sample = content.slice(0, 512);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      nonPrintable++;
    }
  }

  return sample.length > 0 && nonPrintable / sample.length > 0.1;
}

async function walkDirectory(dir, workspaceRoot, visitor) {
  const SKIP_DIRS = new Set([
    "node_modules", ".git", ".svn", "dist", "build", "out",
    ".next", ".nuxt", "__pycache__", ".venv", "venv", "coverage",
    ".turbo", ".cache",
  ]);

  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(workspaceRoot, absolutePath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          stack.push(absolutePath);
        }
      } else if (entry.isFile()) {
        const shouldContinue = await visitor(absolutePath, relativePath);
        if (shouldContinue === false) {
          return;
        }
      }
    }
  }
}

async function runSerializedFileMutation(target, run) {
  const previous = mutationQueuesByPath.get(target) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  const queued = previous.then(() => current, () => current);
  mutationQueuesByPath.set(target, queued);

  try {
    await previous.catch(() => {});
    return await run();
  } finally {
    release();
    if (mutationQueuesByPath.get(target) === queued) {
      mutationQueuesByPath.delete(target);
    }
  }
}

module.exports = {
  createFileTools,
};
