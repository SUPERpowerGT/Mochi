<div align="center">
  <img src="media/mochi_logo_readme.svg" alt="Mochi logo" width="132" />
  <h1><code>MOCHI</code></h1>
  <p><code>editor-native · multi-agent · memory-aware · cloud checkpoints</code></p>
  <p><strong>A VS Code coding agent with workspace tools, layered memory, approval-aware file edits, and authenticated cloud checkpoint sync.</strong></p>
</div>

Mochi is an experimental VS Code extension that brings an OpenAI Agents SDK runtime into an editor-native chat panel. It can inspect your workspace, reason over the active editor context, edit files, run approved commands, and preserve lightweight memory across sessions. Authenticated users can additionally sync session checkpoints to a self-hosted identity service for cross-device restore.

Runtime state, memory, and traces are stored on your machine, and workspace tools operate only against the selected local folder. Cloud features are opt-in and limited to authentication and checkpoint sync.

## Demo


https://github.com/user-attachments/assets/01e88781-2600-4f24-8cb4-a177271787ab


<video src="media/video-demo.mp4" controls width="720"></video>

If the video does not render in your Markdown viewer, open `media/video-demo.mp4` directly.

## Features

### Editor and agent
- Editor-native chat panel with streamed assistant replies and Markdown rendering.
- Multiple chat sessions with independent history and input drafts.
- Root-agent orchestration with delegated subagents for repository guidance, coding, plan review, code review, and memory maintenance.
- Role-specific tool permissions so exploratory and review agents stay read-only while the coding agent can edit.
- Lightweight local skills that inject task-specific workflow guidance only when relevant.

### Tools and safety
- Workspace tools for listing files, reading files, writing files, creating directories, and applying focused edits.
- Command execution with explicit in-chat approval before running local commands.
- Approval cards for destructive actions such as deleting files, deleting directories, or clearing existing file content.
- Run traces capture tool calls, approvals, changed paths, command evidence, and verification status.

### Memory
- Session, task, workspace, and user memory layers for continuing work across turns without treating every message as a new task.
- Rolling session summaries that compact older history while keeping recent turns available for context.
- Workspace memory that records detected project facts and suggested verification commands.
- Project instruction loading from `MOCHI.md`, `AGENTS.md`, and `CLAUDE.md` style files when present.
- Memory snapshots and run traces for debugging what Mochi remembered, which tools ran, and what changed.

### Authentication and cloud checkpoints
- In-panel sign-in and registration dialog (no command-palette input boxes).
- Auth tokens are stored in VS Code `SecretStorage`, never in plain workspace state.
- Each completed run uploads a session checkpoint to the configured identity service when signed in.
- In-panel restore dialog lists checkpoints across devices for the signed-in account.
- Identity service exposes a dashboard at `http://127.0.0.1:4000/dashboard` for inspecting checkpoints and audit data.

## Requirements

- VS Code `1.90.0` or newer.
- Node.js and npm.
- An OpenAI API key (or a Google AI Studio Gemini key via OpenAI-compatible endpoint).
- For cloud checkpoint sync: Docker and Docker Compose to run the bundled identity service and Postgres.

Mochi reads model provider configuration from your shell environment or from `~/.openai-env`. The setup script supports OpenAI and Gemini through an OpenAI-compatible endpoint:

```bash
export MOCHI_MODEL_PROVIDER="openai"
export OPENAI_API_KEY="sk-..."
export MOCHI_OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4.1-mini"
export OPENAI_API_FORMAT="chat_completions"
```

The runtime also accepts plain `.env`-style lines such as `OPENAI_API_KEY="sk-..."`, which makes the same file work on Windows, macOS, and Linux.

The cloud identity service URL defaults to `http://127.0.0.1:4000` and can be overridden with `MOCHI_IDENTITY_API_URL`.

## Quick Start

Install JavaScript dependencies:

```bash
npm install
```

Configure model credentials:

```bash
npm run setup:openai
```

Alternative setup helpers:

- Windows, macOS, Linux: `node ./scripts/setup_openai.js`
- macOS, Linux shells only: `./scripts/setup_openai.sh`

If you do not need a local proxy, choose `n` when the setup script asks about proxy configuration. Mochi reads `~/.openai-env` directly at runtime. On Windows you usually only need to restart the Extension Development Host after setup; no `source` step is required.

(Optional) Start the cloud identity service for checkpoint sync:

```bash
docker compose up -d --build
```

This starts `mochi-postgres` and `mochi-identity-api` (port `4000`). You can stop it later with `docker compose down`.

Start the VS Code extension:

1. Open this repository in VS Code.
2. Press `F5`.
3. Select `Run Local Agent Extension` if VS Code asks for a launch target.
4. In the Extension Development Host window, run `Local Agent: Open Chat`.
5. Send `ping` or ask Mochi to inspect the workspace.
6. If you want Mochi to work on a different folder, run `Local Agent: Select Workspace Folder` from the Extension Development Host or click `Workspace` in the chat panel toolbar.

## Cloud Checkpoint Sync

When the identity service is running and you are signed in:

1. Click `Register` or `Sign In` in the chat panel toolbar. The in-panel dialog accepts email, password, and a device label.
2. After every completed run, Mochi uploads a session snapshot and a checkpoint to the identity service.
3. To restore on the same machine or a different one, sign in with the same account, click `Restore`, and pick a checkpoint from the in-panel list.
4. The dashboard at `http://127.0.0.1:4000/dashboard` shows your synced checkpoints, change summaries, and commit security reports.

Cloud sync is opt-in: if you never sign in, no data leaves your machine.

## Usage

Open the Mochi panel from the Command Palette:

```text
Local Agent: Open Chat
```

Mochi can answer questions, inspect files, make workspace edits, and use the active editor selection as context. When an action is risky, the chat panel shows an approval card before the runtime proceeds.

For complex work, Mochi may delegate bounded subtasks to specialized subagents. Delegation remains visible in run traces, and subagents receive selected memory and skills rather than unrestricted long-term memory.

The current workflow is optimized for local development:

1. Open a workspace folder.
2. Start Mochi from the Extension Development Host.
3. (Optional) Sign in to enable cloud checkpoint sync.
4. Ask for a code change, explanation, or project review.
5. Review any approval cards for command execution or destructive file operations.
6. Use memory snapshots when you want to inspect what Mochi stored.

## Commands

| Command | Purpose |
| --- | --- |
| `Local Agent: Open Chat` | Open or focus the Mochi chat panel. |
| `Local Agent: Quick Ask` | Send a quick prompt to Mochi. |
| `Local Agent: Ask About Selection` | Prefill chat with the current editor selection. |
| `Local Agent: Replace Selection With Last Reply` | Insert the latest assistant reply into the active editor selection. |
| `Local Agent: Select Workspace Folder` | Choose which folder Mochi should treat as the active workspace. |
| `Local Agent: Sign In` | Sign in to the Mochi identity service. |
| `Local Agent: Register` | Register a new Mochi account. |
| `Local Agent: Sign Out` | Clear the local auth token and stop cloud sync. |
| `Local Agent: Restore Checkpoint` | Pick and hydrate a cloud checkpoint into the current workspace. |
| `Local Agent: Analyze Latest Commit` | Run the local commit security analyzer and upload the report. |
| `Local Agent: Open Memory Snapshot` | Open a compact memory and trace snapshot. |
| `Local Agent: Open Raw Memory Snapshot` | Open the raw stored memory snapshot. |

For the full command reference, see `doc/commands-and-capabilities.md`.

## Safety Model

Mochi treats the workspace as shared state:

- File mutations are serialized per target path.
- Writes refuse stale edits when a file changed after Mochi read it.
- Destructive file actions require approval.
- Local command execution requires approval.
- Tool results are recorded so Mochi can distinguish success, failure, denial, and skipped work.
- Run traces capture tool calls, approvals, changed paths, command evidence, and verification status.
- Auth tokens are stored in VS Code `SecretStorage`, not in workspace settings or globalState.
- Cloud sync uploads only when an authenticated session token is present; sign-out clears the token immediately.

## Project Structure

```text
src/extension/         VS Code activation, commands, webview UI, and chat controller
src/runtime/           OpenAI Agents SDK runtime, tools, prompts, memory, and tracing
services/identity-api/ Node + Postgres identity and checkpoint service (Dockerized)
scripts/               Model provider setup helper and commit analyzer
docker-compose.yml     Postgres + identity-api stack for cloud checkpoint sync
doc/                   Architecture notes, feature notes, roadmap, and command reference
media/                 Extension and README assets
```

## Development

Use the VS Code launch configuration for the main extension path:

```text
.vscode/launch.json -> Run Local Agent Extension
```

The JavaScript runtime is the only product runtime path. Use the launch configuration above for local development and testing. For changes that affect cloud sync, run `docker compose up -d --build` to rebuild the identity service.

## Documentation

- `doc/current-features-and-usage.md`
- `doc/current-architecture.md`
- `doc/commands-and-capabilities.md`
- `doc/roadmap.md`
- `doc/development-log.md`
- `doc/ultimate-goal.md`

## License

Mochi is released under the MIT License. See `LICENSE` for details.

## Security

- Do not commit real API keys.
- Store local credentials in `~/.openai-env` or an ignored `.env` file.
- Rotate any key that was exposed.
- Review approval cards before allowing file deletion, directory deletion, file clearing, or command execution.
- The bundled identity service uses a default Postgres password (`postgres`); change it before exposing the service to a network.
- Auth tokens are stored in VS Code `SecretStorage`. Sign out to clear the local token.
