<div align="center">
  <img src="media/mochi_logo_readme.svg" alt="Mochi logo" width="132" />
  <h1><code>MOCHI</code></h1>
  <p><code>local-first · multi-agent · memory-aware</code></p>
  <p><strong>A local-first VS Code coding agent with workspace tools, session memory, and approval-aware file edits.</strong></p>
</div>

Mochi is an experimental VS Code extension that brings an OpenAI Agents SDK runtime into a local editor chat panel. It can inspect your workspace, reason over the active editor context, edit files, run approved commands, and preserve lightweight memory across sessions.

The project is intentionally local-first. Runtime state, memory, and traces are stored on your machine, while workspace tools operate only against the selected local folder.

## Demo


https://github.com/user-attachments/assets/01e88781-2600-4f24-8cb4-a177271787ab


<video src="media/video-demo.mp4" controls width="720"></video>

If the video does not render in your Markdown viewer, open `media/video-demo.mp4` directly.

## Features

- Editor-native chat panel with streamed assistant replies.
- Multiple chat sessions with independent history and input drafts.
- Workspace tools for listing files, reading files, writing files, creating directories, and applying focused edits.
- Command execution with explicit in-chat approval before running local commands.
- Approval cards for destructive actions such as deleting files, deleting directories, or clearing existing file content.
- Session and task memory for continuing work across turns without treating every message as a new task.
- Rolling session summaries that compact older history while keeping recent turns available for context.
- Workspace memory that records detected project facts and suggested verification commands.
- Project instruction loading from `MOCHI.md`, `AGENTS.md`, and `CLAUDE.md` style files when present.
- Memory snapshots and run traces for debugging what Mochi remembered, which tools ran, and what changed.
- Root-agent orchestration with delegated subagents for repository guidance, coding, plan review, and code review.
- Role-specific tool permissions so exploratory and review agents stay read-only while the coding agent can edit.
- Lightweight local skills that inject task-specific workflow guidance only when relevant.
- Markdown rendering in assistant replies, including headings, lists, code blocks, inline code, links, and quotes.

## Requirements

- VS Code `1.90.0` or newer.
- Node.js and npm.
- An OpenAI API key or a Google AI Studio Gemini API key.

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

Start the VS Code extension:

1. Open this repository in VS Code.
2. Press `F5`.
3. Select `Run Local Agent Extension` if VS Code asks for a launch target.
4. In the Extension Development Host window, run `Local Agent: Open Chat`.
5. Send `ping` or ask Mochi to inspect the workspace.
6. If you want Mochi to work on a different folder, run `Local Agent: Select Workspace Folder` from the Extension Development Host.

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
3. Ask for a code change, explanation, or project review.
4. Review any approval cards for command execution or destructive file operations.
5. Use memory snapshots when you want to inspect what Mochi stored.

## Commands

| Command | Purpose |
| --- | --- |
| `Local Agent: Open Chat` | Open or focus the Mochi chat panel. |
| `Local Agent: Quick Ask` | Send a quick prompt to Mochi. |
| `Local Agent: Ask About Selection` | Prefill chat with the current editor selection. |
| `Local Agent: Replace Selection With Last Reply` | Insert the latest assistant reply into the active editor selection. |
| `Local Agent: Select Workspace Folder` | Choose which folder Mochi should treat as the active workspace. |
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

This makes the extension useful for real local work while keeping potentially surprising actions visible.

## Project Structure

```text
src/extension/   VS Code activation, commands, webview UI, and chat controller
src/runtime/     OpenAI Agents SDK runtime, tools, prompts, memory, and tracing
scripts/         Model provider setup helper
doc/             Architecture notes, feature notes, roadmap, and command reference
media/           Extension and README assets
```

## Development

Use the VS Code launch configuration for the main extension path:

```text
.vscode/launch.json -> Run Local Agent Extension
```

The JavaScript runtime is the only product runtime path. Use the launch configuration above for local development and testing.

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
