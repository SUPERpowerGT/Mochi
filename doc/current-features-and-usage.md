# Current Features And Usage

## What Works Today

The project currently provides:

- a VS Code extension chat panel named `Mochi`
- a JavaScript runtime using the OpenAI Agents SDK
- workspace-aware tools for reading and writing files
- a workspace-local command execution tool for lightweight verification
- basic multi-turn session continuity
- a layered memory foundation
- inspectable memory snapshots from inside VS Code
- lightweight execution traces for the latest run
- session-level turn classification before task routing
- task rollover and task reactivation behavior for long conversations
- slimmer persisted history so runtime scaffolding is not permanently duplicated in session storage
- automatic cleanup of legacy stored scaffold text from older session history
- project-level instruction loading from files such as `MOCHI.md`, `AGENTS.md`, and `CLAUDE.md`
- shared input slimming across history, memory, project instructions, and editor context
- history budgeting now keeps complete tool call/result pairs instead of trimming them into invalid fragments
- unpaired tool calls or tool outputs are dropped from budgeted history instead of being sent back to the API in a broken state
- older broken tool history is also repaired when sessions are read and when run input is built
- long sessions are compacted into rolling summaries once retained history crosses the compaction threshold
- compacted sessions keep recent raw history while injecting the older session summary back into memory context
- tool outputs are now structured so Mochi can distinguish success, failure, denial, and other outcomes more reliably
- lightweight retry handling for short API rate-limit waits
- visible progress updates in the chat window while the agent is running
- progressively streamed assistant reply text in the chat window while the final answer is being generated
- a cleaner chat UI with lightweight thinking state, minimal header chrome, and less intrusive approval prompts
- shell setup helper
- local multi-user and multi-device profile switching with summary-level cross-device continuity when the identity API is available

## Current User-Facing Features

### VS Code Chat Panel

Available commands:

- `Local Agent: Open Chat`
- `Local Agent: Quick Ask`
- `Local Agent: Ask About Selection`
- `Local Agent: Replace Selection With Last Reply`
- `Local Agent: Select Workspace Folder`
- `Local Agent: Open Memory Snapshot`

For the full command reference and what each command does, see:

- `doc/commands-and-capabilities.md`

What it can do now:

- chat in the Mochi panel
- include current editor context in prompts
- work against the selected workspace folder
- insert the latest answer back into the active editor
- show concise live activity updates such as tool calls, approvals, agent switches, and response drafting while Mochi is running
- render the assistant answer progressively instead of waiting for the full reply to finish first
- keep the chat header visually minimal instead of showing a long workspace path
- show a lightweight inline thinking state instead of a heavy persistent thinking bubble

### Workspace-Aware Tool Use

The runtime can currently:

- inspect the workspace root
- list files in the workspace
- read files
- create or overwrite files
- append to files
- create directories
- delete single files
- recursively delete directories inside the workspace
- run explicit local commands with captured stdout, stderr, and exit code

Safety behavior:

- deleting a file now triggers an approval confirmation
- deleting a directory now triggers an approval confirmation and refuses to delete the workspace root
- clearing an existing file by overwriting it with empty content also triggers an approval confirmation
- in the VS Code extension path, this confirmation is presented inside the Mochi chat window as a lightweight approval card with explicit allow and deny actions
- approval cards hide immediately after the user makes a choice
- non-destructive writes still work without this extra confirmation
- Mochi is now instructed to summarize file actions truthfully instead of treating missing paths, denials, or refusals like success
- local command execution currently goes through explicit approval before running

### Memory

The runtime currently remembers:

- the current session history
- a rolling summary for older compacted session history
- internal working state for the current session
- the latest turn classification at the session layer
- failed work runs no longer leave behind empty active tasks
- when a clearly new user goal appears, Mochi can roll over into a new active task instead of keeping every request under the first task forever
- when a new prompt strongly matches an older inactive task, Mochi can reactivate that task
- basic facts about the active workspace
- suggested verification commands for the active workspace when they can be inferred
- lightweight user preference data such as preferred language
- a working-state list per session that can be inspected in the memory snapshot
- the latest routing diagnostics for the active working state, including why Mochi continued, created, or reactivated it

Important behavior:

- not every user message becomes a task
- conversation-style turns stay in session memory
- older conversation turns may be summarized locally once the session grows past the compaction threshold
- only work-like turns enter the task routing layer
- Private mode is exposed as a direct chat-panel toggle for the current window
- Private mode disables persistent memory reads and cross-session memory recall for the current window
- current-window artifact deletion removes the current session record and linked task/trace/routing artifacts while leaving other sessions untouched
- run finalization applies persistent-memory policy using the run's base session id, so switching windows does not accidentally apply the wrong memory policy
- product memory now uses exactly three layers: Current Window Memory, Long-Term Memory, and Runtime Trace
- task-like records are implementation working state, not user-facing long-term memory
- non-private window archive/delete is the intended first trigger for compressing current-window context into a `kind: "window_archive"` Long-Term Memory record

Current slash shortcuts:

- `/help`
- `/new`
- `/memory`
- `/clear-private-window`
- `/model`

The slash menu is intentionally small. Full memory management remains in Memory Controls and the Command Palette.

You can inspect the current memory state directly from VS Code with:

- `Local Agent: Open Memory Snapshot`
- `Local Agent: Open Raw Memory Snapshot`
- `Mochi: Open Memory Controls`

The default memory snapshot command now opens a compact, human-readable snapshot so debugging does not start with a huge raw session dump.
It now includes session compaction metadata such as whether a summary exists, when it was updated, and how many raw history items remain.

The raw memory snapshot command includes the latest run trace, which can show:

- which agent became active
- which tools were called
- which tool outcomes succeeded or failed
- lifecycle events around tool execution, including pre-tool and post-tool records
- lifecycle policy metadata for tool risk, workspace mutation, approval expectations, and follow-up verification expectations
- whether an approval was requested, approved, denied, or left pending
- whether the run completed or failed
- lightweight command evidence such as exit code and stdout / stderr previews
- whether file changes were followed by verification, and whether that verification passed, failed, or did not run

The snapshot also includes `traceSummary`, a compact Tracy-style view of the latest run. It summarizes the run outcome, tool counts, high-risk tool use, workspace mutations, approval requirements, approval denials, verification status, changed paths, and a readable policy timeline.

### Runtime Input Budgeting

Before each run, Mochi now applies shared budgets to:

- session history
- compacted session summary
- memory text
- project instructions
- editor context

This reduces the chance of oversized requests and helps control prompt growth across longer sessions.

Older stored history is also normalized as it is read and rewritten so legacy injected scaffold text can be cleaned out gradually instead of living forever in the session store.
When history grows beyond the local compaction threshold, older turns are summarized into session memory and only the recent raw history window is retained.

Workspace memory now also tries to infer a few runnable verification commands from common project signals. This helps Mochi choose better local checks after making code changes.

### Project Instructions

When present in the workspace root, Mochi now reads project guidance files such as:

- `MOCHI.md`
- `.mochi/MOCHI.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/CLAUDE.md`

This helps repo-specific guidance live with the codebase instead of being re-explained in chat every time.

## Current Setup

### 1. Configure Model Provider

```bash
npm run setup:model
```

This setup path works on Windows, macOS, and Linux. If you do not use a proxy, choose `n` when asked to configure proxy settings. Mochi reads `~/.openai-env` directly at runtime, so Windows users can usually just restart the Extension Development Host after setup.

### 2. Install JavaScript Runtime Dependencies

```bash
npm install
```

This installs:

- `@openai/agents`
- `zod`

### 3. Start The VS Code Extension

- open this project in VS Code
- press `F5`
- wait for the new `Extension Development Host` window
- run `Local Agent: Open Chat`
- send a test prompt such as `ping`

## Current Limitations

- multi-agent specialization is still lightweight
- memory exists, but agent-specific memory slicing is still a future step
- Memory V2 has an initial commit/event/archive path, but archive, policy, and event decisions still need to move into a dedicated Memory Controller
- internal working state, session summaries, and referenced memories can still overlap because a dedicated memory selector has not been added yet
- streamed replies now work, but the chat reading experience still needs more typography and layout polish
- the current memory layer is persistent and useful, but still intentionally simple
- task routing is now more structured, but it still relies mostly on prompt-level signals rather than richer task signals
- explicit "remember this" and "forget this" flows are not implemented yet
- trace storage is still session-attached rather than split into a dedicated trace store
- additional automatic promotion from Current Window Memory to Long-Term Memory is still an open design decision beyond the implemented non-private window archive path
- turn classification is currently heuristic, so some ambiguous inputs may still need better generic signals over time
- destructive file tools now have a first interactive approval guard, but it is still narrower than a full approval framework
- the runtime now uses character-based context budgets, not token-accurate budgets
- the project already uses the OpenAI Agents SDK runtime, but not every official session abstraction is wired in yet

## Recommended Way To Use The Project Today

For normal development and testing:

1. use the VS Code extension path
2. use the setup script only for local model provider configuration

## What Changed Recently

Recent additions worth knowing about:

- memory snapshots are now directly viewable from VS Code
- session turns are now classified before task routing
- task routing now supports continue, create, and reactivate decisions
- task routing logic has been separated into router, policy, and store layers
- persisted session history is slimmer because runtime-only system scaffolding is filtered before storage
- task routing now commits task changes only after a successful run finishes
- tool modules are split into workspace, file, and editor responsibilities
- project-level instruction files are now loaded into runtime context when present
- destructive file operations now require interactive approval before execution in the VS Code path
- destructive approval now happens in the chat panel itself instead of falling back to the host OS dialog style
- shared context budgets now slim runtime input before each run
- long sessions now compact older history into rolling local summaries while retaining recent raw turns
- short-lived 429 rate-limit errors now get a lightweight retry
- assistant replies now stream progressively in the chat panel
- the chat UI has been simplified so the header, thinking state, and approval prompts feel less like debug UI
- prompt instructions now push Mochi toward directly executing clearly actionable requests instead of over-asking clarifying questions
- prompt instructions now also explicitly forbid the confusing pattern where Mochi asks for confirmation and then executes in the same turn anyway
- streamed clarification drafts are cleared if the model later proceeds to a tool call, and those misleading intermediate messages are filtered from stored history
- run traces now summarize whether verification happened after file changes instead of leaving that judgment implicit

## Good Smoke Tests

Use prompts like:

- `Who are you?`
- `Summarize this workspace`
- `What files are in the current project root?`
- `Explain the active file`
- `Help me refactor this code`

These help verify:

- runtime startup
- prompt handling
- workspace tool access
- memory continuity

## Known Dependency Notes

- `@openai/agents@0.1.11` is currently used
- this version did not expose `MemorySession` from the root package export
- the project now uses history-based continuity instead of relying on that constructor
