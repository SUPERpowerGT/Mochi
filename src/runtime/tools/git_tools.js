const { execFile } = require("child_process");
const { promisify } = require("util");
const { requireWorkspaceRoot, resolveWorkspacePath } = require("./workspace_context");
const { createToolResult, truncateText } = require("./tool_result");

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 15000;
const GIT_MAX_BUFFER = 512 * 1024; // 512 KB

function createGitTools({ sdk, zod, getWorkspaceRoot }) {
  const { tool } = sdk;
  const z = zod.z;

  return [
    tool({
      name: "git_status",
      description:
        "Show the working tree status of the workspace git repository. " +
        "Returns staged, unstaged, and untracked file lists. " +
        "Fails gracefully if the workspace is not a git repository.",
      parameters: z.object({}),
      execute: async () => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        const result = await runGit(["status", "--porcelain=v1", "--branch"], workspaceRoot);

        if (!result.ok) {
          return createToolResult({
            ok: false,
            kind: "git",
            action: "git_status",
            path: ".",
            message: result.error,
          });
        }

        const lines = result.stdout.split("\n").filter(Boolean);
        const branchLine = lines.find((l) => l.startsWith("##")) || "";
        const branch = branchLine.replace(/^##\s*/, "").split("...")[0].trim();
        const fileLines = lines.filter((l) => !l.startsWith("##"));

        const staged = [];
        const unstaged = [];
        const untracked = [];

        for (const line of fileLines) {
          const xy = line.slice(0, 2);
          const file = line.slice(3);
          if (xy[0] !== " " && xy[0] !== "?") staged.push({ status: xy[0], file });
          if (xy[1] !== " " && xy[1] !== "?") unstaged.push({ status: xy[1], file });
          if (xy === "??") untracked.push(file);
        }

        const clean = fileLines.length === 0;

        return createToolResult({
          ok: true,
          kind: "git",
          action: "git_status",
          path: ".",
          message: clean ? `Clean working tree on branch: ${branch}` : `${fileLines.length} changed file(s) on branch: ${branch}`,
          summary: `git status: ${branch} — ${fileLines.length} change(s)`,
          data: { branch, clean, staged, unstaged, untracked, raw: truncateText(result.stdout, 2000) },
        });
      },
    }),

    tool({
      name: "git_diff",
      description:
        "Show changes between commits or between the working tree and index. " +
        "Pass a relativePath to diff a specific file. " +
        "Pass staged=true to see changes staged for the next commit (git diff --cached). " +
        "Output is truncated at 4000 characters.",
      parameters: z.object({
        relativePath: z.string().default("").describe("Optional file path to diff (empty = whole repo)"),
        staged: z.boolean().default(false).describe("Diff staged changes instead of working tree"),
        commitRange: z.string().default("").describe("Optional git range, e.g. 'HEAD~3..HEAD' or 'main..feature'"),
      }),
      execute: async ({ relativePath = "", staged = false, commitRange = "" }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);

        const args = ["diff"];
        if (staged) args.push("--cached");
        if (commitRange) args.push(commitRange);
        args.push("--");
        if (relativePath) {
          resolveWorkspacePath(workspaceRoot, relativePath); // validate path is inside workspace
          args.push(relativePath);
        }

        const result = await runGit(args, workspaceRoot);

        if (!result.ok) {
          return createToolResult({
            ok: false,
            kind: "git",
            action: "git_diff",
            path: relativePath || ".",
            message: result.error,
          });
        }

        const diffText = result.stdout;
        const lineCount = diffText.split("\n").length;

        return createToolResult({
          ok: true,
          kind: "git",
          action: "git_diff",
          path: relativePath || ".",
          message: diffText ? `Diff: ${lineCount} line(s)` : "No differences found",
          summary: `git diff: ${lineCount} lines`,
          data: {
            diff: truncateText(diffText, 4000),
            lineCount,
            truncated: diffText.length > 4000,
            staged,
            commitRange: commitRange || null,
          },
        });
      },
    }),

    tool({
      name: "git_log",
      description:
        "Show recent commit history for the workspace repository. " +
        "Returns commit hash, author, date, and message for up to 30 commits. " +
        "Pass a relativePath to filter commits that touched a specific file.",
      parameters: z.object({
        limit: z.number().int().min(1).max(30).default(20),
        relativePath: z.string().default("").describe("Optional file path to filter commit history"),
      }),
      execute: async ({ limit = 20, relativePath = "" }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);

        const args = [
          "log",
          `--max-count=${limit}`,
          "--pretty=format:%H\t%an\t%ad\t%s",
          "--date=short",
        ];

        if (relativePath) {
          resolveWorkspacePath(workspaceRoot, relativePath); // validate
          args.push("--", relativePath);
        }

        const result = await runGit(args, workspaceRoot);

        if (!result.ok) {
          return createToolResult({
            ok: false,
            kind: "git",
            action: "git_log",
            path: relativePath || ".",
            message: result.error,
          });
        }

        const commits = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [hash, author, date, ...messageParts] = line.split("\t");
            return {
              hash: hash ? hash.slice(0, 8) : "",
              fullHash: hash || "",
              author: author || "",
              date: date || "",
              message: messageParts.join("\t") || "",
            };
          });

        return createToolResult({
          ok: true,
          kind: "git",
          action: "git_log",
          path: relativePath || ".",
          message: `${commits.length} commit(s)`,
          summary: `git log: ${commits.length} commit(s)`,
          data: { commits, limit },
        });
      },
    }),

    tool({
      name: "git_blame",
      description:
        "Show who last modified each line of a file and in which commit. " +
        "Useful for understanding the history of a specific piece of code.",
      parameters: z.object({
        relativePath: z.string().describe("File path relative to the workspace root"),
        startLine: z.number().int().min(1).default(1).describe("First line to annotate (1-based)"),
        endLine: z.number().int().min(1).default(50).describe("Last line to annotate (inclusive)"),
      }),
      execute: async ({ relativePath, startLine = 1, endLine = 50 }) => {
        const workspaceRoot = requireWorkspaceRoot(getWorkspaceRoot);
        resolveWorkspacePath(workspaceRoot, relativePath); // validate

        const clampedEnd = Math.min(endLine, startLine + 99); // max 100 lines at once
        const args = [
          "blame",
          "--porcelain",
          `-L${startLine},${clampedEnd}`,
          "--",
          relativePath,
        ];

        const result = await runGit(args, workspaceRoot);

        if (!result.ok) {
          return createToolResult({
            ok: false,
            kind: "git",
            action: "git_blame",
            path: relativePath,
            message: result.error,
          });
        }

        const annotations = parsePorcelainBlame(result.stdout, startLine);

        return createToolResult({
          ok: true,
          kind: "git",
          action: "git_blame",
          path: relativePath,
          message: `Blame for lines ${startLine}–${clampedEnd} of ${relativePath}`,
          summary: `git blame: ${relativePath} L${startLine}-L${clampedEnd}`,
          data: { relativePath, startLine, endLine: clampedEnd, annotations },
        });
      },
    }),
  ];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true,
    });
    return { ok: true, stdout: typeof stdout === "string" ? stdout : "" };
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr : String(error);
    const isNotRepo = stderr.includes("not a git repository");
    return {
      ok: false,
      error: isNotRepo
        ? "The workspace is not a git repository."
        : `git error: ${stderr.trim() || error.message || String(error)}`,
    };
  }
}

function parsePorcelainBlame(raw, startLine) {
  // Porcelain blame groups lines by commit hash blocks
  const annotations = [];
  const lines = raw.split("\n");
  let current = null;
  let lineNo = startLine;

  for (const line of lines) {
    if (/^[0-9a-f]{40}\s/.test(line)) {
      const parts = line.split(" ");
      current = { hash: parts[0].slice(0, 8), fullHash: parts[0], author: "", date: "", summary: "" };
    } else if (line.startsWith("author ") && current) {
      current.author = line.slice(7);
    } else if (line.startsWith("author-time ") && current) {
      const ts = parseInt(line.slice(12), 10);
      current.date = isNaN(ts) ? "" : new Date(ts * 1000).toISOString().slice(0, 10);
    } else if (line.startsWith("summary ") && current) {
      current.summary = line.slice(8);
    } else if (line.startsWith("\t") && current) {
      annotations.push({
        line: lineNo++,
        hash: current.hash,
        author: current.author,
        date: current.date,
        summary: current.summary,
        content: line.slice(1),
      });
    }
  }

  return annotations;
}

module.exports = {
  createGitTools,
};
