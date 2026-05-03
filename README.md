<div align="center">
  <img src="media/mochi_logo_readme.svg" alt="Mochi logo" width="132" />
  <h1><code>MOCHI</code></h1>
  <p><code>local-first · multi-agent · memory-aware</code></p>
  <p><strong>An experimental VS Code coding agent with workspace tools, layered session memory, multi-agent orchestration, and approval-aware execution.</strong></p>
</div>

Mochi is a VS Code extension that embeds an OpenAI Agents SDK runtime into a local editor chat panel. It addresses a practical gap in many current coding assistants: they are effective at one-shot answering but weaker at sustained task execution, bounded tool-grounded work, and controllable automation inside a developer's own environment.

The project is intentionally local-first. Runtime state, memory, and traces are stored on your machine. Workspace tools operate only against the selected local folder. An optional cloud identity service handles authentication and session checkpoint sync for cross-device restore.

## Demo

https://github.com/user-attachments/assets/01e88781-2600-4f24-8cb4-a177271787ab

<video src="media/video-demo.mp4" controls width="720"></video>

If the video does not render in your Markdown viewer, open `media/video-demo.mp4` directly.

## Features

### Editor integration

- Editor-native chat panel with streamed assistant replies and markdown rendering.
- Multiple chat sessions with independent history, input drafts, and session tabs.
- Active editor context (file path and selected text) injected into agent runs automatically.
- Auth status indicator and last-run trace panel visible directly in the chat UI.

### File and workspace tools

- `list_files` — list directory contents up to 200 entries.
- `read_file` — read any UTF-8 file inside the workspace.
- `write_file` — create or overwrite files; refuses stale edits when a file changed since Mochi last read it.
- `edit_file` — precise old-string → new-string replacement; rejects ambiguous matches to prevent silent corruption.
- `append_file` — append text to an existing or new file.
- `search_in_files` — regex search across the workspace with per-line match results and surrounding context; skips binary files and build directories automatically.
- `make_dir` — create directories.
- `delete_file` / `delete_dir` — destructive actions; both require explicit in-chat approval before executing.
- `get_editor_context` — returns the active editor file path and selected text.

### Git tools (read-only)

- `git_status` — working tree status with staged, unstaged, and untracked file lists.
- `git_diff` — diff with support for staged changes, specific files, and commit ranges.
- `git_log` — recent commit history, optionally filtered by file.
- `git_blame` — line-by-line authorship for a file range.

All git tools are read-only and available to the repository guidance, plan reviewer, and code review agents.

### Command execution

- `run_command` — run a workspace-local shell command with explicit in-chat approval. Captures stdout, stderr, and exit code.

### Multi-agent orchestration

- **Root agent** — single user-facing coordinator. Delegates bounded subtasks to specialized agents or answers directly.
- **Repo Guide** — read-only exploration of repository structure, file contents, and git history.
- **Coding Agent** — full tool access for implementation, refactoring, and file editing.
- **Plan Reviewer** — read-only validation of a proposed plan before execution.
- **Review Agent** — read-only code review with access to run commands for verification.
- **Memory Maintainer** — no tool access; rewrites compacted session summaries as structured JSON.

Role-specific tool permissions keep exploratory and review agents read-only while the coding agent can edit.

### Layered memory

- **Session memory** — per-session conversation history with rolling compaction and summaries.
- **Task memory** — cross-turn task state including goal, status, turn count, and outcome.
- **Workspace memory** — detected project facts: languages, package manager, manifests, and verification commands.
- **User memory** — observed preferences such as preferred language.

Task routing classifies each prompt against active and recent tasks using keyword overlap scoring to decide whether to continue, reactivate, or create a task. History older than the compaction threshold is rolled into a summary to keep context within budget.

### Safety and traceability

- Destructive file actions (`delete_file`, `delete_dir`) and all command execution (`run_command`) require approval cards in the chat UI.
- File writes refuse stale edits via content fingerprinting.
- Tool calls are serialized per file path to prevent concurrent mutation conflicts.
- Run traces capture every tool call, approval decision, subagent run, and verification result.
- A collapsible **Last Run** panel in the chat UI shows which tools ran, approval outcomes, subagent activity, and verification status after each turn.
- Memory snapshots expose what Mochi stored: session summary, active task, workspace facts, and user preferences.

### Cloud identity service (optional)

- Email and password authentication backed by a PostgreSQL database.
- Session checkpoint sync: after each run, a snapshot of session summary, task state, workspace facts, and user preferences is uploaded automatically when authenticated.
- Cross-device restore: pick a checkpoint from the cloud and hydrate it into the current local session.
- Change summaries: each run that modifies files records a summary of changed paths and verification status to the cloud.
- Commit security analysis: a post-commit hook can upload security findings for each local commit.

## Requirements

- VS Code `1.90.0` or newer.
- Node.js and npm.
- An OpenAI API key or a Google AI Studio Gemini API key.
- Docker and Docker Compose (only required for the optional cloud identity service).

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure model credentials

```bash
npm run setup:openai
```

This writes your credentials to `~/.openai-env`. Mochi reads that file at runtime — no shell re-sourcing required on Windows. Alternative helpers:

```bash
node ./scripts/setup_openai.js   # cross-platform
./scripts/setup_openai.sh        # macOS/Linux shell
```

The expected environment variables:

```bash
MOCHI_MODEL_PROVIDER="openai"          # or "gemini"
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_API_FORMAT="chat_completions"
```

### 3. Run the extension

1. Open this repository in VS Code.
2. Press `F5` and select **Run Local Agent Extension** if prompted.
3. In the Extension Development Host window, run **Local Agent: Open Chat** from the Command Palette.
4. Send `ping` or ask Mochi to inspect the workspace.
5. To target a different folder, run **Local Agent: Select Workspace Folder**.

## Cloud Identity Service (optional)

The identity service is a Node.js + PostgreSQL API that runs locally in Docker. It is only required for authentication, session sync, and checkpoint restore. Mochi works fully offline without it.

### Start the service

```bash
docker compose up --build -d
```

This starts two containers:

| Container | Port | Purpose |
|---|---|---|
| `mochi-postgres` | 5432 | PostgreSQL 16, stores all identity and session data |
| `mochi-identity-api` | 4000 | REST API for auth, session sync, checkpoints, and the dashboard |

The database schema is created automatically on first start. Three demo accounts are seeded:

| Email | Password | Display name |
|---|---|---|
| `alice@mochi.local` | `mochi123` | Alice |
| `bob@mochi.local` | `mochi123` | Bob |
| `charlie@mochi.local` | `mochi123` | Charlie |

### Point the extension at the service

```bash
export MOCHI_IDENTITY_API_URL="http://127.0.0.1:4000"
```

Then restart the Extension Development Host and sign in via **Local Agent: Sign In**.

### Stop the service

```bash
docker compose down
```

To also delete the database volume:

```bash
docker compose down -v
```

### Dashboard

Once running, open `http://localhost:4000/dashboard` to see a web UI that lists tenants, users, sessions, and recent commit security reports.

## Commands

| Command | Purpose |
|---|---|
| `Local Agent: Open Chat` | Open or focus the Mochi chat panel. |
| `Local Agent: Quick Ask` | Send a quick prompt without opening the panel. |
| `Local Agent: Ask About Selection` | Prefill chat with the current editor selection. |
| `Local Agent: Replace Selection With Last Reply` | Insert the latest assistant reply into the active editor. |
| `Local Agent: Select Workspace Folder` | Choose which folder Mochi treats as the active workspace. |
| `Local Agent: Open Memory Snapshot` | Open a compact memory and trace snapshot as JSON. |
| `Local Agent: Open Raw Memory Snapshot` | Open the full raw memory snapshot. |
| `Local Agent: Sign In` | Authenticate with the local identity service. |
| `Local Agent: Register` | Create a new account on the local identity service. |
| `Local Agent: Sign Out` | Sign out and revert to the local default identity. |
| `Local Agent: Switch User Profile` | Switch between local demo user profiles (Alice, Bob, Charlie). |
| `Local Agent: Switch Device Profile` | Switch between local demo device profiles. |
| `Local Agent: Restore Checkpoint` | Pick a cloud checkpoint and hydrate it into the current session. |
| `Local Agent: Analyze Latest Commit` | Run a security analysis on the latest git commit and upload the report. |

For the full command reference, see `doc/commands-and-capabilities.md`.

## Safety Model

Mochi treats the workspace as shared state with explicit safety boundaries:

- File mutations are serialized per target path to prevent concurrent conflicts.
- Writes refuse stale edits when a file changed after Mochi last read it (content fingerprinting).
- `delete_file`, `delete_dir`, and `run_command` require explicit in-chat approval before executing.
- `edit_file` rejects ambiguous matches — if `oldString` appears more than once and `replaceAll` is not set, it returns an error rather than replacing the wrong occurrence.
- Tool results are recorded in the run trace so Mochi can distinguish success, failure, denial, and skipped work.
- The **Last Run** panel in the chat UI makes every tool call, approval outcome, and verification result visible after each turn.

## Project Structure

```text
src/
  extension/       VS Code activation, commands, webview UI, and chat controller
  runtime/
    agents/        Root agent and specialized subagent factory
    memory/        Session, task, workspace, and user memory stores
    prompts/       Agent instruction files (one per role)
    skills/        Lightweight workflow skill files loaded per task type
    support/       Runtime orchestration, budgeting, tracing, sync, and policy
    tools/         File, git, command, editor, workspace, and subagent tools

services/
  identity-api/    Node.js REST API (auth, session sync, checkpoints, dashboard)

scripts/           Model provider setup helpers
doc/               Architecture notes, feature notes, roadmap, and command reference
media/             Extension and README assets
docker-compose.yml Brings up PostgreSQL and identity-api in Docker
```

## Development

Use the VS Code launch configuration for the main development path:

```text
.vscode/launch.json → Run Local Agent Extension
```

The JavaScript runtime is the only product runtime path. No build step is required — the extension runs directly from source.

## Documentation

- `doc/current-architecture.md` — component and data-flow overview
- `doc/current-features-and-usage.md` — feature reference
- `doc/commands-and-capabilities.md` — full command list
- `doc/roadmap.md` — planned improvements
- `doc/development-log.md` — session log of design decisions
- `doc/ultimate-goal.md` — long-term vision

## License

Mochi is released under the MIT License. See `LICENSE` for details.

## Security

- Do not commit real API keys or credentials.
- Store local model credentials in `~/.openai-env` or an ignored `.env` file.
- Rotate any key that was accidentally exposed.
- Review approval cards before allowing file deletion, directory deletion, or command execution.
- The identity service is intended for local development use only. Do not expose port 4000 to untrusted networks.
