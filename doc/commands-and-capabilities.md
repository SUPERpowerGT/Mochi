# Commands And Capabilities

## Purpose

This document records the commands currently available in Mochi and explains what each one does.

It covers:

- VS Code extension commands
- CLI and reference runtime commands
- the practical capability associated with each command path
- the runtime-facing tools that Mochi can call inside the active workspace

## VS Code Extension Commands

These commands are exposed by the Mochi VS Code extension.

### `Local Agent: Open Chat`

Command id:

- `localAgent.openChat`

What it does:

- opens or focuses the Mochi chat panel in the VS Code side panel

When to use it:

- when you want to talk to Mochi directly
- when you want to reopen the chat panel after switching views

### `Local Agent: Quick Ask`

Command id:

- `localAgent.quickAsk`

What it does:

- opens a quick input box
- sends the typed prompt to the runtime
- posts the reply back into the Mochi chat panel

When to use it:

- when you want to ask a fast one-off question without typing into the full chat panel first

### `Local Agent: Ask About Selection`

Command id:

- `localAgent.sendSelection`

What it does:

- reads the current editor selection
- pre-fills the Mochi chat input with that selection
- helps frame the prompt around the selected code

When to use it:

- when you want Mochi to explain, review, or modify the currently selected code

### `Local Agent: Replace Selection With Last Reply`

Command id:

- `localAgent.applyLastReply`

What it does:

- takes Mochi's most recent reply
- inserts it at the current cursor
- or replaces the current selection if text is selected

When to use it:

- when Mochi generated code or text that you want to place directly into the editor

### `Local Agent: Select Workspace Folder`

Command id:

- `localAgent.selectWorkspaceFolder`

What it does:

- lets you choose which folder Mochi should treat as the active workspace

When to use it:

- when the extension host window has multiple possible folders
- when you want Mochi to operate on a folder other than the default current workspace

### `Local Agent: Open Memory Snapshot`

Command id:

- `localAgent.openMemorySnapshot`

What it does:

- exports a compact memory/debug snapshot to a JSON document in VS Code
- shows the active task, latest turn classification, task routing diagnostics, compact trace summary, workspace facts, preferences, and a short recent task list
- shows whether the current session has a compacted summary and how much raw history remains
- avoids dumping full session history, all raw working-state records, and full raw traces by default

### `Local Agent: Open Raw Memory Snapshot`

Command id:

- `localAgent.openRawMemorySnapshot`

What it does:

- exports the full current memory state to a JSON document in VS Code
- shows session memory, internal working-state records, workspace memory, and user preferences
- includes session summary and compaction metadata when older history has been compacted
- includes the composed memory text currently being injected into the runtime
- includes the latest session turn classification
- can reveal pending task ids for in-flight work turns before they are committed
- includes the latest task routing diagnostics such as route reason, scores, and threshold values
- includes the raw latest run trace for deeper debugging

When to use it:

- when you want to debug what Mochi is remembering
- when you want to inspect current memory continuity
- when you want to inspect task rollover or task reactivation behavior
- before doing deeper multi-agent or prompt debugging

### `Mochi: Open Memory Controls`

Command id:

- `localAgent.openMemoryControls`

What it does:

- opens the current memory controls surface
- shows current policy state and memory counts
- provides access to granular memory clear actions

When to use it:

- when you want to inspect or manage current-window memory
- when you need clear controls that are more detailed than the small slash shortcut menu

### `Mochi: Toggle Current Window Private Mode`

Command id:

- `localAgent.togglePrivateWindowMode`

What it does:

- toggles current-window Private mode
- enables session isolation and disables persistent memory reads for the current window
- syncs the chat-panel `Private` switch state

When to use it:

- when you want a browser-private-window style Mochi session
- when the current conversation should not read saved task, workspace, user, session-summary, or cross-session memory

### `Mochi: Delete Current Window Artifacts`

Command id:

- `localAgent.destroyCurrentWindowArtifacts`

What it does:

- deletes the current window's session record
- deletes internal working-state records linked to that current window/session
- clears current-window trace and routing products
- leaves other sessions untouched

When to use it:

- when a private or throwaway Mochi window should be cleaned up completely

### Granular Memory Commands

These commands remain available from the Command Palette and Memory Controls:

- `Mochi: Toggle Current Window Memory Isolation`
- `Mochi: Toggle Current Window Persistent Memory Reads`
- `Mochi: Clear Current Window Memory`
- `Mochi: Clear Current Session Summary Memory`
- `Mochi: Clear Current Window Working State`
- `Mochi: Clear Current Workspace Memory`
- `Mochi: Clear User Memory`
- `Mochi: Clear Current Trace Memory`
- `Mochi: Clear All Local Memory`

The slash menu intentionally does not expose every memory command. It currently keeps only high-frequency shortcuts:

- `/help`
- `/new`
- `/memory`
- `/clear-private-window`
- `/model`

Memory is being simplified toward two user-facing categories:

- Current Window Memory
- Long-Term Memory

Task-like records remain internal working state and should not be treated as user-facing long-term memory.

## VS Code Extension Capability Summary

The extension path currently supports:

- chatting with Mochi inside VS Code
- including editor context in prompts
- selecting the active workspace folder
- inserting the latest reply into the editor
- inspecting the current memory snapshot
- toggling current-window Private mode from the chat panel
- deleting current-window artifacts
- managing memory categories through Memory Controls and Command Palette commands
- running on the JavaScript OpenAI Agents SDK runtime path rather than the old Python subprocess path

## Runtime Tool Capabilities

These are not user-facing commands in the VS Code command palette, but they are capabilities available to the runtime through registered tools.

### Workspace Tools

- `get_workspace_root`
- `list_files`

Capability:

- inspect the active workspace root
- inspect directory structure

### File Tools

- `read_file`
- `write_file`
- `append_file`
- `make_dir`
- `delete_file`
- `delete_dir`

### Command Tools

- `run_command`

Capability:

- run a local command in the active workspace using explicit command arguments
- capture `stdout`, `stderr`, and exit code
- provide lightweight execution evidence for verification

Current caution:

- command execution currently requires approval in the VS Code path
- this is an early harness-style capability, not yet a full sandbox or policy system

Capability:

- read files from the workspace
- create and modify files
- create directories
- delete individual files
- recursively delete workspace directories

Current caution:

- destructive file actions are possible today
- destructive file actions now require approval before execution
- directory deletion refuses the workspace root
- in the VS Code extension path, approval is shown through allow/deny cards inside the Mochi chat panel
- this is still an early approval layer rather than a full workflow system

### Editor Tools

- `get_editor_context`

Capability:

- expose the active file path and the current selection or file snippet to the runtime

## Setup Helper

This is not a VS Code command-palette command, but it is still part of the local setup flow.

### Model Provider Setup Script

Path:

- `./scripts/setup_model.js`
- `./scripts/setup_model.sh`

What it does:

- configures OpenAI or Gemini credentials
- writes OpenAI-compatible environment variables into `~/.openai-env`
- keeps provider-specific keys in `MOCHI_OPENAI_API_KEY` and `GEMINI_API_KEY`, while `OPENAI_API_KEY` is the active SDK key for the selected provider
- optionally writes proxy settings
- the JavaScript helper works on Windows, macOS, and Linux
- the shell helper can still update shell startup files on macOS and Linux

Use:

```bash
npm run setup:model
```

Shell-only alternative for macOS or Linux:

```bash
./scripts/setup_model.sh
```

## Which Path To Use

### Recommended Primary Path

Use the VS Code extension commands for normal product usage and testing.

## Notes

- the VS Code extension is the main runtime path
- the setup script exists only for local model provider environment configuration
- the OpenAI Agents SDK is already in active use for the JavaScript runtime, but Mochi still owns product-specific layers such as workspace tools, task routing, workspace memory, and user memory
- conversation turns and work-item turns are now treated differently inside the memory system
- repo-level instruction files like `AGENTS.md` and `CLAUDE.md` are now part of Mochi's runtime context when present
- runtime input is now budgeted before each run so history and other context sources do not grow without bound
- as Mochi grows, this document should be updated whenever new commands or command-adjacent capabilities are added
