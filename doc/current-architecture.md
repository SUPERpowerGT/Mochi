# Current Architecture

## High-Level Runtime Flow

The current VS Code path works like this:

1. user sends a prompt from the Mochi webview
2. `src/extension/chat_controller.js` forwards that prompt to the runtime
3. `src/runtime/openai_agents_runtime.js` prepares memory context and history
4. the runtime runs the root agent through the OpenAI Agents SDK
5. the result is written back into memory stores
6. the reply is shown in the webview and can be inserted back into the editor

## Code Boundaries

### `src/extension/`

Purpose:

- VS Code-specific integration
- command registration
- webview management
- UI to runtime bridge

Main files:

- `extension.js`
- `chat_controller.js`
- `webview_html.js`

### `src/runtime/`

Purpose:

- runtime orchestration
- agent definitions
- tool registration
- prompt definitions
- memory system

Main areas:

- `agents/`
- `prompts/`
- `tools/`
- `memory/`
- `support/`

Within `tools/`, the runtime is now split into:

- workspace tools
- file tools
- editor tools
- shared approval helpers
- a shared registry entrypoint

Within `skills/`, Mochi now keeps lightweight Markdown skill files that describe reusable workflows and domain guidance.

### `scripts/`

Purpose:

- one-time OpenAI setup
- shell environment configuration

These scripts are still useful, but they are not the main VS Code runtime path anymore.

## Runtime Layers

### Extension Layer

Handles:

- chat commands
- selecting a workspace folder
- pushing editor context into prompts
- applying the last assistant reply back into the editor
- rendering a simplified Mochi chat UI with streamed replies, lightweight thinking state, and in-chat approvals

### Agent Runtime Layer

Handles:

- loading the OpenAI Agents SDK
- constructing agents and tools
- coordinating prompt input preparation through the run input builder
- budgeting context before each run through the shared context budget layer
- sending the run to the SDK
- consuming SDK stream events and delegating event mapping to the stream event mapper
- streaming visible activity events back into the chat UI during the run
- streaming assistant reply text back into the chat UI incrementally during the run
- extracting the final output
- loading project-level instruction files when available
- injecting runtime-only system context before the run
- slimming persisted history after the run so repeated system scaffolding is not stored forever
- normalizing legacy stored user history so older injected scaffold text is gradually cleaned out
- applying a storage retention budget before persisted history is written back
- preserving complete tool call / tool result pairs when budgeting history for the next run
- sanitizing stored history before send so broken legacy tool items are repaired even before budgeting runs
- lightly retrying short-lived rate-limit failures
- applying lightweight tool lifecycle policy hooks around runtime tools
- wrapping tool approval requests so requested, approved, and denied decisions are recorded in the latest run trace

The runtime orchestration file is intentionally being kept thinner. Supporting responsibilities now live in dedicated modules:

- `run_input_builder.js` prepares SDK input and slims persisted history
- `stream_event_mapper.js` maps SDK stream events into UI activity and trace records
- `run_trace_recorder.js` owns run trace creation, tool-call recording, approval recording, output normalization, and run finalization

Important boundary:

- the OpenAI Agents SDK currently provides the generic agent runtime foundation
- Mochi still owns product-specific behavior such as workspace tools, task routing, workspace memory, and user memory
- this split is intentional so the project can reuse official runtime primitives without giving up product control
- Mochi now also reads repo-level instruction files so project guidance can live with the codebase rather than only inside chat history
- Mochi now applies shared input budgets before each run instead of letting each context source grow independently
- Mochi now surfaces human-readable runtime progress in the chat UI rather than exposing raw model chain-of-thought
- Mochi now uses the same streamed run to progressively render final assistant text instead of waiting for a full reply before updating the chat

Current UI behavior:

- the chat header now shows a lightweight Mochi brand mark and title rather than a full workspace path
- transient runtime state is shown inline through a lightweight `Thinking...` row and short activity lines
- destructive approvals are rendered as minimal in-chat cards and disappear after the user allows or denies the action
- assistant replies are rendered with a small built-in Markdown renderer for headings, lists, code blocks, inline code, links, quotes, and separators
- user messages remain plain text rendered through `textContent`

### Memory Layer

Handles:

- session continuity
- turn classification at the session layer
- task continuity
- workspace-level facts
- user-level lightweight preferences
- work-item routing decisions such as continue / create / reactivate

The memory manager is the coordination point across all memory stores.

The runtime also exposes a memory snapshot path for inspection so the current stored memory state can be viewed directly from VS Code.
The snapshot now also exposes task routing diagnostics so routing behavior can be debugged without guessing.
The snapshot now also exposes the latest run trace so recent agent execution can be inspected after the fact.
The snapshot also exposes a compact `traceSummary` view that distills the latest run into outcome, tool policy counts, approval counts, verification state, changed paths, and a policy timeline.
Run traces now also include a lightweight verification summary so the runtime can tell whether file changes were followed by a verification command and whether that verification passed, failed, or was skipped.
Run traces now also include lifecycle events for tool use, including `preToolUse`, `postToolUse`, and a `runStop` summary.
Those lifecycle events include normalized policy metadata such as risk level, whether the tool mutates the workspace, whether approval is expected, and whether verification should follow a successful mutation.

Storage retention:

- persisted session history is sanitized and budgeted before it is written back
- sessions compact older history into a rolling `summary` when retained history crosses the compaction threshold
- compacted session summaries are injected into memory context before recent raw history
- tool call and tool result pairs are still preserved together inside the retained history window
- inactive tasks are pruned per session after task updates, while the active task and recent inactive tasks are kept
- task planning and task listing normalize each session so only the most recently updated active task remains active
- raw memory snapshots remain available, but the default storage path is no longer designed to grow forever

Session and task ownership:

- a session is treated as the current conversation container
- each session keeps a focused task binding through `focusedTaskId`
- each session can maintain a rolling `summary`, `summaryUpdatedAt`, and `compaction` metadata for older history
- the chat UI can create a fresh base session with `+`
- reopening the webview reloads the current session history instead of showing a blank transient conversation
- tasks keep lightweight `summary` and `lastOutcome` fields
- tasks record `sessionIds` and `lastSessionId`, so one task can be continued from multiple sessions
- task routing can match relevant tasks from the same workspace even when the current session has no focused task yet
- when another task looks relevant, Mochi injects that task summary as reference memory rather than loading full task history

## Current Agent Layout

The runtime currently constructs:

- a root Mochi agent
- a repo guide agent
- a coding agent
- a plan reviewer agent
- a review agent

The current structure now uses a small agent-as-tool pattern instead of relying on free-form handoffs:

- the root Mochi agent is the only agent run directly by the main runtime
- the root agent can call `run_subagent` when a task benefits from specialization
- `repo_guide` is used for bounded read-first repository exploration and architecture orientation
- `coding` is used for bounded implementation, debugging, and refactoring tasks
- `plan_reviewer` is used to validate proposals and multi-step implementation plans before code changes
- `review` is used to inspect completed or proposed changes for bugs, regressions, missing tests, and risk
- subagents receive normal workspace tools, but they do not receive `run_subagent`, which prevents recursive delegation in the first version
- the root agent receives the subagent result as a tool output and remains responsible for the final user-facing response
- delegated runs are streamed into nested `subagentRuns` traces so Tracy can inspect each subagent's internal tool calls
- subagent tool results include evidence metadata such as workspace root, inspected files, listed paths, and workspace-tool usage
- subagents do not read long-term memory directly; the runtime selects a small role-specific memory slice for each delegated run and records that selection in trace metadata
- `repo_guide` and `plan_reviewer` receive read-only tools, `review` receives read-only tools plus command verification, and `coding` receives the full workspace tool set
- root and subagents can receive selected skills as runtime-only guidance; selected skill names are recorded in trace metadata

This keeps simple requests on a lightweight single-agent path while giving complex engineering tasks a controlled escalation path.

The runtime also computes a lightweight delegation policy before each run:

- small prompts remain on the direct root-agent path
- repository mapping, architecture, and investigation prompts receive a `repo_guide` suggestion
- implementation, debugging, refactoring, and code-edit prompts receive a `coding` suggestion
- explicit plan validation prompts receive a `plan_reviewer` suggestion
- explicit code review or risk-check prompts receive a `review` suggestion
- the suggestion is injected as runtime-only system guidance and recorded in the run trace
- the root agent can still proceed directly when the request is simple after reading context

Prompt behavior is now also biased toward direct execution:

- clearly actionable requests should be executed by default
- reasonable defaults should be chosen without blocking on extra preference questions
- clarifying questions are reserved for cases where missing information would materially change the result or create hidden risk
- asking for clarification is now also treated as a stop condition in prompt guidance, so Mochi should not ask and execute in the same turn
- the streamed UI path also clears misleading clarification draft text if a tool call follows it, and the storage path removes those intermediate clarification messages from persisted history

## Current Tool Layout

The current runtime tools are grouped by responsibility.

## Current Skill Layout

Skills are local Markdown files under `src/runtime/skills/`.

Current skills:

- `code-review`
- `plan-review`
- `vscode-extension-dev`
- `memory-architecture`
- `frontend-polish`

The selector keeps skills lightweight:

- it loads at most two relevant skills per run
- it matches by prompt, workspace hints, agent role, and skill triggers
- root receives selected skills inside runtime guidance
- subagents receive selected skills inside delegated input
- skills do not own state and do not replace memory; they only describe how to work

### Workspace Tools

- get workspace root
- list files

### File Tools

- read file
- write file
- append file
- make directory
- delete file
- delete directory

Tool result shape:

- tools now return structured results instead of relying only on plain text
- results include fields such as:
  - `ok`
  - `action`
  - `path`
  - `message`
  - `summary`
  - optional `data`
- this gives the agent a clearer distinction between success, failure, denial, and partial outcomes

### Command Tools

- run command

Current behavior:

- commands run inside the active workspace
- commands use explicit `command + args` instead of shell strings
- command execution currently requires approval in the VS Code path
- command results are structured and can include:
  - `exitCode`
  - `stdoutPreview`
  - `stderrPreview`
  - timeout state

Why this matters:

- Mochi now has the first harness-like execution primitive for local verification
- command evidence can be preserved in run traces instead of being lost in free-form text
- run traces can now separate "code changed but verification did not run" from "verification ran and failed"

Destructive behavior:

- deleting a file now triggers an approval path
- recursively deleting a directory now triggers an approval path and refuses to delete the workspace root
- clearing an existing file by overwriting it with empty content also triggers an approval path
- when Mochi runs inside VS Code, destructive file approval is requested through approval cards inside the Mochi chat webview
- approval cards are intentionally lightweight and disappear after a decision
- file and command tools now share the same small approval helper for allow, deny, fallback, and execution branching

Truthfulness boundary:

- prompt instructions now explicitly require Mochi to describe tool outcomes faithfully
- Mochi should not claim a file was deleted, written, or changed unless the tool result clearly succeeded

### Editor Tools

- get editor context

These tools are scoped to the active workspace and use path guards to avoid escaping the workspace root.

## Current Memory Layout

### Session Memory

Stores:

- session id
- workspace id
- full run history
- active task id
- latest turn classification
- latest run trace
- recent prompt metadata

Current behavior:

- every user input first enters the session layer
- the session layer classifies the input as either:
  - a conversation turn
  - a work turn
- only work turns enter task routing
- conversation turns remain in session memory without creating a new task
- older session history is normalized on read and write so previously persisted scaffold text is stripped out over time
- the latest completed or failed run now leaves behind a lightweight execution trace containing recent agent switches, tool calls, tool outcomes, approval waits, final status, and reply preview
- command traces can now also carry lightweight execution evidence such as exit code and stdout / stderr previews
- lifecycle traces can now summarize how many tools ran, how many high-risk tools were attempted, and how many tool calls failed

### Internal Working State

Stores:

- active working target per session
- recent working-state list for the session
- current goal
- working title
- turn count
- latest user prompt
- latest assistant reply

Current behavior:

- work turns first create a routing plan rather than immediately mutating the active working state
- the planned task change is only committed after the agent run completes successfully
- failed or interrupted runs therefore do not leave behind empty active working-state records
- short follow-up work prompts stay on the current working target
- clearly different work goals can trigger rollover into a new working target
- older inactive targets can be reactivated when a new work prompt matches them strongly enough
- non-work turns no longer create new working-state records just because they are textually different
- the latest routing decision now records diagnostics such as:
  - current-task score
  - best inactive-task score
  - matched inactive task id
  - threshold values
  - follow-up detection
- routing behavior is split across:
  - `task_router.js`
  - `task_policy.js`
  - `task_store.js`

Design principle:

- the system first decides whether a turn belongs in session-only conversation flow or work-item flow
- task routing is being kept as a general policy layer rather than a collection of one-off prompt patches
- the current router uses generic prompt signals and thresholds
- future upgrades should add richer signals without hard-coding specific user phrases or demo scenarios
- this layer is internal working state, not user-facing Long-Term Memory

### Workspace Memory

Stores:

- workspace root path
- detected manifests
- detected languages
- package manager
- suggested test command
- suggested verification commands

Related context source:

- project-level instruction files such as `MOCHI.md`, `AGENTS.md`, `CLAUDE.md`, `.mochi/MOCHI.md`, and `.claude/CLAUDE.md` are loaded separately into runtime input when present
- these are not persisted as working state; they act more like repo guidance for the current run

Current role in verification:

- workspace detection now tries to surface a few runnable verification commands such as:
  - `npm test`
  - `npm run lint`
  - `pytest`
  - `cargo test`
- these hints are added to workspace memory so the coding agent can more easily choose a reasonable verification step after edits

### User Memory

Stores:

- lightweight stable preferences
- currently this starts with preferred language when observed

## Persistence

The memory system currently persists to JSON files through a shared JSON file store.

Benefits:

- easy to inspect
- easy to evolve
- low setup cost

Tradeoff:

- not yet optimized for advanced querying or concurrency

This is acceptable for the current local extension phase.

## Memory Model And V2 Direction

The memory semantics are documented in `memory-model.md` and `memory-model.zh.md`.
The implementation plan is documented in `memory-v2.md`.

The target model keeps the current JSON-first approach but makes memory lifecycle rules explicit:

- `sessions.json` for visible session state, history, summaries, and current routing pointers
- `tasks.json` for internal working state during the transition; it is not the target user-facing memory model
- `workspaces.json` for detected and confirmed workspace facts
- `user.json` for stable user preferences
- `traces.json` for run/debug evidence that should not usually be injected as long-term model context
- `memory_events.json` for audit records explaining why memory was added, updated, deleted, or skipped

The target model has exactly three layers:

- Current Window Memory
- Long-Term Memory
- Runtime Trace

Task-like records should stay internal unless a future explicit promotion flow saves selected durable facts into Long-Term Memory.
User preference, project fact/convention, decision, and window archive are Long-Term Memory record kinds, not additional layers.
Natural-language chat must not directly delete memory; deletion belongs to Memory Controller flows with explicit confirmation.

The intended write pipeline is:

```text
prompt + reply + trace
  -> memory classifier
  -> memory policy
  -> memory patch
  -> memory commit
  -> memory event log
```

The intended read pipeline is:

```text
prompt
  -> memory retrieval plan
  -> policy filter
  -> relevance selection
  -> context budget
  -> injected memory text
```

Private mode is a hard policy boundary for the current window:

- read current visible chat context
- do not read session summary, workspace memory, user memory, explicit long-term memory, or recent sessions
- do not write workspace, user, or long-term summary memory
- may keep current-window working state only inside the current window
- keep only current-window debug artifacts until the user deletes current-window artifacts

The current implementation already enforces the main read-side behavior by setting `disablePersistentMemory` and `isolateSession` for Private mode. The next step is to make write-side commits and memory event logging explicit.

## Known Architectural Constraints

- streamed replies now work, but the chat streaming UX still needs further polish around typography and pacing
- memory writes are simple and local
- agent-specific memory slicing exists in a lightweight form, but it is not yet a full selector/deduper
- there is no dedicated memory selector yet, so internal working state and session summaries may occasionally repeat related context
- the memory maintainer exists for compacted summary cleanup, but the broader Memory V2 commit pipeline is not implemented yet
- task-like working state is still intentionally lightweight and currently relies mainly on prompt-level signals
- explicit memory events, explicit remember/forget commands, and a dedicated trace store are not implemented yet
- non-private window archive/delete is the intended first promotion path into a `kind: "window_archive"` Long-Term Memory record; additional automatic promotion remains undesigned
- turn classification is still heuristic and local rather than model-backed
- the project does not yet use the OpenAI SDK session abstraction as its primary persisted session layer
- destructive approval currently covers file deletion and file clearing, but it is not yet a broader action approval framework
- the current budgeting layer uses character budgets rather than token-accurate budgeting
- `scripts/setup_model.sh` remains as the primary setup helper; the JavaScript runtime is the only maintained product runtime

## Architectural Direction

The current architecture is intentionally aimed at these next steps:

- role-based multi-agent expansion
- agent-specific memory slices
- memory selector and timestamped memory patch maintenance
- more structured task state
- better runtime observability
- safer destructive tool workflows
- richer separation between conversational turns and real work-item execution
- a careful evaluation of which generic session/runtime pieces should move closer to official OpenAI SDK abstractions over time

This means the repo is now organized for growth rather than only for the initial prototype.
