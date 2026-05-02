# Development Log

## Overview

This log records the major development milestones of the Mochi project so far. It is intended to preserve architectural intent, runtime decisions, and the order in which the product evolved.

## Phase 1: Local Bootstrap Prototype

Initial project goals:

- provide a lightweight OpenAI bootstrap flow
- support a local shell wrapper for quick prompts
- provide a minimal Python agent example
- expose a VS Code extension prototype for chatting with the agent

Key files introduced in the early structure:

- `scripts/setup_model.sh`
- `scripts/openai_api.sh`
- `scripts/agent_llm.sh`
- `src/agent/minimal_agent.py`
- `src/extension/extension.js`

Notes:

- this phase focused on proving the basic OpenAI call path
- Python and shell-based flows were both used as reference and smoke-test paths

## Phase 2: Repository Restructure

The repository was reorganized by responsibility to reduce root-level clutter.

Structure after the cleanup:

- `src/extension/` for VS Code extension code
- `src/agent/` for the Python reference agent
- `scripts/` for shell utilities
- `media/` for extension assets

Supporting cleanup:

- added `.gitignore`
- updated `README.md` to match the new structure
- removed generated cache files such as `__pycache__`

Reason:

- the original prototype mixed extension code, Python code, shell helpers, and generated artifacts in the project root
- re-grouping by responsibility made future extension work much easier

Later cleanup:

- removed the Python reference agent after the JavaScript runtime became the only maintained product path
- removed the shell prompt wrapper after the VS Code JavaScript runtime became the only maintained product path
- kept `scripts/setup_openai.sh` as a compatibility wrapper for older OpenAI setup instructions
- added `scripts/setup_model.js` as a cross-platform model provider setup helper for Windows, macOS, and Linux

## Phase 3: VS Code Runtime Shift To OpenAI Agents SDK

The VS Code extension stopped using the Python subprocess as its primary runtime path.

Main change:

- the extension runtime was switched to a JavaScript-based OpenAI Agents SDK implementation

What changed:

- added `@openai/agents`
- added `zod`
- introduced `src/runtime/openai_agents_runtime.js`
- moved the extension flow from `spawn python` to calling the JS runtime directly

Important compatibility fix:

- the installed `@openai/agents@0.1.11` package did not expose `MemorySession`
- the runtime was adjusted to use `result.history` based session continuity instead

Why this mattered:

- removed one major cross-process boundary
- aligned the extension runtime with future multi-agent work
- made it easier to expand agent orchestration, tools, and memory on the JS side

## Phase 4: Runtime Refactor For Long-Term Maintainability

The runtime was split into clearer modules so the extension could scale professionally.

New module boundaries:

- `src/extension/extension.js`: activation and command wiring
- `src/extension/chat_controller.js`: chat UI to runtime bridge
- `src/extension/webview_html.js`: webview HTML
- `src/runtime/agents/`: agent construction
- `src/runtime/prompts/`: identity and agent instructions
- `src/runtime/tools/`: workspace and editor tools
- `src/runtime/support/`: support helpers such as env loading

Reason:

- the prototype runtime had started to accumulate too many responsibilities in one file
- future agent and tool growth required clearer boundaries

## Phase 5: Layered Memory Foundation

A full memory foundation was introduced for the runtime.

Memory layers designed and implemented:

- session memory
- task memory
- workspace memory
- user memory

Core files:

- `src/runtime/memory/memory_manager.js`
- `src/runtime/memory/session_store.js`
- `src/runtime/memory/task_store.js`
- `src/runtime/memory/workspace_store.js`
- `src/runtime/memory/user_store.js`
- `src/runtime/memory/json_file_store.js`

What the memory layer currently does:

- persists session history
- tracks the active task for a session
- detects stable workspace facts such as manifests, languages, package manager, and test command
- stores lightweight user preference data such as preferred language
- injects memory context back into the runtime before each run

Why this matters:

- multi-agent work will need different memory slices for different roles
- memory is now treated as a first-class system rather than an in-memory array

## Phase 6: Task Rollover Improvement

The task memory layer was improved so Mochi no longer keeps every conversation forever under the very first task.

What changed:

- task rollover heuristics were introduced
- clearly new user goals now create a new active task
- short follow-up prompts continue on the current task
- memory snapshots now expose the session task list

Why this matters:

- task memory is now a better foundation for future multi-agent routing
- the active task is less likely to become misleading after a topic shift

## Phase 7: Memory Observability And Runtime History Slimming

The memory system became inspectable and the runtime stopped permanently storing every injected system context block in session history.

What changed:

- added `Local Agent: Open Memory Snapshot`
- memory snapshots now expose session, task, workspace, preferences, and composed memory text
- runtime-injected memory and workspace context are treated as runtime-only system input
- persisted history is slimmed after the run

Why this matters:

- memory debugging is easier
- long conversations are less likely to bloat stored history with repeated runtime scaffolding

## Phase 8: Task Router And Policy Refactor

Task routing behavior was upgraded from inline heuristics toward a more general routing layer.

What changed:

- added `task_router.js`
- added `task_policy.js`
- task routing now explicitly supports:
  - continue current task
  - create a new task
  - reactivate an older task
- task storage now focuses more on persistence than routing policy

Why this matters:

- routing behavior is easier to evolve
- future task signals can be added without entangling routing policy with storage

## Phase 9: Generic Routing Discipline And SDK Boundary Clarification

The project direction was tightened around a clearer engineering rule: prefer generic mechanisms over case-specific patches.

What changed:

- task routing is now treated explicitly as a general policy problem, not a place to hard-code individual prompts
- the team direction was clarified so future routing upgrades should use richer signals rather than phrase-by-phrase exceptions
- the role of the OpenAI Agents SDK was documented more clearly:
  - use official runtime primitives where they fit generic agent infrastructure
  - keep Mochi-specific memory, tools, and task semantics in the project layer

Why this matters:

- it protects the runtime from slowly turning into a pile of overfitted heuristics
- it makes future changes easier to reason about
- it preserves a healthy boundary between reusable SDK capabilities and Mochi-specific product behavior

## Phase 10: Task Routing Observability

Task routing now leaves behind enough structured evidence to inspect why a routing decision happened.

What changed:

- routing decisions now carry diagnostics data
- active task records now store the latest route action, reason, score, and evaluation metadata
- memory snapshots now expose the current task routing diagnostics directly

Why this matters:

- task behavior can be debugged without relying on intuition alone
- future routing upgrades can be evaluated against visible scores and thresholds
- multi-agent work will have a clearer debugging foundation

## Phase 11: Session Turn Classification And Work-Item Split

The memory system was refactored so not every user message automatically becomes a task candidate.

What changed:

- added a session-layer turn classifier
- the runtime now separates:
  - conversation turns
  - work turns
- only work turns are sent into the task router
- session snapshots now expose the latest turn classification

Why this matters:

- casual or meta conversation no longer pollutes the task list as aggressively
- task switching behavior now reflects a more realistic session-to-work-item model
- the system structure is closer to how mature agent runtimes separate thread memory from work coordination

## Phase 12: Safer Task Commit And Legacy History Cleanup

The runtime was hardened so task routing changes are only committed after successful runs, and older stored session history is cleaned up as it is revisited.

What changed:

- work turns now produce a task plan first instead of mutating the active task immediately
- the plan is committed only after the run finishes successfully
- failed or interrupted runs no longer leave behind empty active tasks
- persisted user history is now normalized so older injected scaffold text such as memory, workspace, and editor blocks is stripped back out over time

Why this matters:

- memory snapshots stay more trustworthy after failed or rate-limited runs
- active task state better reflects completed work rather than partial preparation
- older sessions gradually become lighter and less noisy without requiring a one-off migration script

## Phase 13: Streamed Replies And In-Chat Activity

The chat surface moved from batch-style replies toward a more visible live runtime.

What changed:

- the runtime switched to streamed OpenAI Agents SDK runs for the main VS Code path
- human-readable activity events are now surfaced in the Mochi chat panel during a run
- assistant reply text now streams progressively into the chat UI instead of appearing all at once at the end
- visible reasoning remains intentionally limited to user-facing progress and tool activity rather than raw chain-of-thought

Why this matters:

- Mochi now feels much more alive during longer runs
- users can see that work is happening without waiting on a silent UI
- the runtime keeps a safer product boundary by exposing progress, not hidden reasoning

## Phase 14: Chat UI Simplification And Execution Bias Tightening

The Mochi chat experience was simplified visually, and agent behavior was pushed toward direct execution.

What changed:

- the chat header was simplified to a lightweight Mochi brand mark and title
- the workspace path was removed from the header because it added noise without much product value
- assistant replies were restyled as cleaner reading content instead of persistent heavy chat bubbles
- the transient `Thinking...` state was reduced to a lightweight status line with animated dots
- destructive approval cards were simplified so they show only the essential action and path
- approval cards now hide immediately after either approval or denial
- agent identity and runtime prompts were tightened to reduce prompt drift, unstable tone, and unnecessary clarifying questions
- the root and coding agents now default more strongly toward directly executing clearly actionable requests

Why this matters:

- the UI now feels more product-like and less like a debug panel
- streamed replies no longer visually fight with large, reshaping chat bubbles
- destructive approvals interrupt the flow less
- users are less likely to get blocked by unnecessary clarification when Mochi can make a reasonable default choice

## Phase 15: Structured Tool Results And Reply Truthfulness

The runtime was tightened so Mochi has a clearer ground truth for what tools actually did.

What changed:

- workspace, file, and editor tools now return structured results rather than relying only on plain text messages
- tool outputs now expose fields such as `ok`, `action`, `path`, `message`, `summary`, and optional data payloads
- runtime activity summaries now prefer structured tool result summaries when available
- agent prompts now explicitly require Mochi to report tool outcomes faithfully and avoid describing failures as success

Why this matters:

- Mochi now has a better chance of distinguishing:
  - success
  - failure
  - refusal
  - denial
- this reduces one of the most trust-damaging behaviors in coding agents: confidently summarizing failed file operations as if they worked

## Phase 16: Lightweight Run Tracing

Mochi now records a lightweight execution trace for the most recent run.

What changed:

- the runtime now tracks:
  - agent activation events
  - tool call starts
  - tool call outcomes
  - approval wait events
  - final run status
  - reply preview
- the latest trace is persisted on the session record
- memory snapshots now expose `lastRunTrace` for inspection

Why this matters:

- Mochi now has a first real tracing layer instead of only final chat replies
- recent runs can be inspected after success or failure
- this creates a practical foundation for later harness-style evidence, replay, and debugging work

## Phase 17: Harness V1 Command Evidence

Mochi now has the first harness-like execution primitive for running local verification commands.

What changed:

- added a `run_command` tool
- commands run with explicit `command + args` inside the active workspace rather than free-form shell strings
- command execution currently requires approval in the VS Code path
- command results now capture lightweight evidence such as:
  - exit code
  - stdout preview
  - stderr preview
  - timeout state
- the latest run trace can now preserve this evidence for inspection in memory snapshots

Why this matters:

- Mochi can now begin validating work instead of only editing files
- evidence from local command execution is now inspectable after the run
- this creates a solid bridge from today’s lightweight tracing toward a fuller harness model later

## Phase 18: Verification Bias From Workspace Signals

Mochi now has a better way to discover which verification commands are worth trying.

What changed:

- workspace detection now infers a small set of verification commands from common project files and scripts
- examples include:
  - `npm test`
  - `npm run lint`
  - `pytest`
  - `cargo test`
- these verification hints are now included in workspace memory
- prompt instructions now more strongly encourage the coding agent to use those commands after code changes when they are relevant and reasonably scoped

Why this matters:

- Mochi no longer has to guess verification commands from scratch every time
- post-edit verification is now easier to trigger without building a full policy engine first

## Phase 19: Verification Trace Policy

The tracing layer now records a lightweight verification judgment for each run instead of only raw command evidence.

What changed:

- run traces now derive whether the run changed workspace files
- run traces now derive whether a verification command was executed after those changes
- verification status is now summarized as one of:
  - `not_needed`
  - `not_run`
  - `denied`
  - `passed`
  - `failed`
- command denials are now distinguishable from command failures in the trace

Why this matters:

- the runtime can now tell the difference between:
  - no edits
  - edits without verification
  - edits with successful verification
  - edits with failed verification
- this gives Mochi a better evidence base for future reply polish, verification UI, and more opinionated execution policies
- this moves the project one step closer to a more capable harness without adding a lot of brittle special cases

## Phase 20: Clarification Gate Prompt Discipline

The runtime prompts were tightened so Mochi should no longer ask for confirmation and then continue executing in the same turn.

What changed:

- root and coding prompt instructions now explicitly forbid asking a clarification or confirmation question and then continuing with tool execution
- prompt guidance now says that asking a question means the turn should end there and wait for the next user message
- identity guidance now also forbids fake pause language such as saying Mochi is waiting for confirmation while continuing anyway

Why this matters:

- it removes one of the most confusing current interaction failures
- the UI and the actual runtime behavior are now better aligned
- direct execution stays the default, but asking is now a stronger signal that Mochi should actually stop

## Phase 21: Runtime Clarification Draft Guard

The clarification discipline was backed by runtime and UI behavior instead of relying only on prompt text.

What changed:

- the streamed runtime now tracks assistant draft text before tool calls
- if that draft looks like a clarification or confirmation request and a tool call follows, Mochi clears the streamed draft from the chat UI
- run traces record when this guard cleared a misleading clarification draft before tool execution
- persisted history now filters out intermediate assistant clarification messages when they were immediately followed by tool execution before the next user message

Why this matters:

- the user no longer sees a confusing "please confirm" draft linger while Mochi continues working
- old "ask-then-execute" assistant messages are less likely to pollute future context
- this is a concrete runtime guard, not just a prompt preference

## Phase 22: Recursive Directory Delete Tool

Mochi gained an explicit tool for deleting directories, rather than trying to force directory deletion through the single-file deletion tool.

What changed:

- added a `delete_dir` file tool
- `delete_dir` recursively removes directories inside the active workspace
- `delete_dir` refuses to delete the workspace root
- `delete_dir` refuses file paths, leaving single-file deletion to `delete_file`
- directory deletion uses the same in-chat approval path as other destructive file actions

Why this matters:

- users can now ask Mochi to remove a folder without hitting the old "non-file path" refusal
- recursive deletion remains guarded by explicit approval
- file deletion and folder deletion now have separate, clearer tool semantics

## Phase 23: Tool Lifecycle Policy Foundation

Mochi gained a first internal lifecycle layer around runtime tools.

What changed:

- runtime tools are now wrapped at the tool registry boundary
- the wrapper records lightweight `preToolUse` and `postToolUse` events into the run trace
- run finalization records a `runStop` lifecycle summary
- lifecycle events classify tools by category and risk level
- lifecycle events now include normalized policy metadata for workspace mutation, approval expectations, approval denial, and verification expectations
- the `runStop` summary now counts mutation calls, high-risk calls, approval-required calls, approval-denied calls, failed calls, and the final verification status
- tool arguments are sanitized before being stored in lifecycle traces, so large file content is represented by byte count rather than full content

Why this matters:

- approval, verification, truthfulness, and future sandbox policy now have a shared place to converge
- trace data is less dependent on only SDK stream events
- this moves Mochi closer to the hook / lifecycle architecture used by mature coding agents

## Phase 24: Trace Summary For Memory Snapshots

Mochi gained a compact trace summary for memory snapshots.

What changed:

- added a `traceSummary` field to memory snapshots
- `traceSummary` distills the latest run into status, outcome, tool counts, high-risk calls, mutation calls, approval-required calls, approval denials, verification state, changed paths, and a policy timeline
- the default memory snapshot command now opens a compact view
- the raw snapshot is still available through `Local Agent: Open Raw Memory Snapshot`
- trace summaries can fall back to raw tool calls when lifecycle events are unavailable, so high-risk mutations remain visible

Why this matters:

- recent runs can now be inspected without reading the full raw trace JSON
- this creates a stable data shape for a future Tracy-style run inspector UI
- lifecycle policy evidence is now visible at the memory/debug layer instead of only inside runtime internals

## Phase 25: Runtime Orchestrator Slimming

Mochi's main OpenAI runtime file was split into clearer support modules.

What changed:

- moved SDK input preparation and storage-history slimming into `run_input_builder.js`
- moved SDK stream event mapping into `stream_event_mapper.js`
- moved run trace creation, tool-call recording, approval recording, output normalization, and run finalization into `run_trace_recorder.js`
- reduced `openai_agents_runtime.js` from a broad runtime-and-trace-and-stream file into a thinner run orchestrator

Why this matters:

- future runtime policy work has clearer seams
- stream handling and trace recording can now be tested without running a full agent call
- this prevents the main runtime path from becoming the dumping ground for every new feature

## Phase 26: Project Instruction File Loading

Mochi gained support for repo-level instruction files so project guidance can live alongside the codebase.

What changed:

- the runtime now looks for project instruction files such as:
  - `MOCHI.md`
  - `.mochi/MOCHI.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.claude/CLAUDE.md`
- loaded files are injected into runtime context before the run
- memory snapshots now show which project instruction sources were found

Why this matters:

- the direction is now closer to products like Codex and Claude Code
- project conventions no longer need to be re-taught entirely through chat history
- this creates a cleaner place for repo-specific workflows, testing commands, and coding standards

## Phase 27: Destructive Tool Approval Guard

Mochi gained a first approval layer for dangerous file operations.

What changed:

- `delete_file` now requires approval before execution
- clearing an existing file through `write_file` now also requires approval
- when running in VS Code, approval is requested through the Mochi chat UI
- approval is enforced from the tool layer upward so the protection applies regardless of which agent calls the tool

Why this matters:

- destructive behavior is no longer the default path
- the runtime now better matches the approval-oriented design of stronger coding agents
- this creates a clean foundation for a future richer approval UX

## Phase 28: In-Chat Destructive Approval UX

The approval layer moved from host-level modal prompts into the Mochi conversation itself.

What changed:

- destructive file approvals are now rendered as cards inside the chat webview
- users can explicitly click allow or deny without leaving the conversation flow
- pending approval requests are queued and replayed when the chat view is reopened

Why this matters:

- the approval experience now matches the chat-first interaction model better
- users can understand what is being approved in the same surface where the request was made
- this is a better foundation for broader action approvals later

## Phase 29: Visible Reasoning Through Activity Streaming

Mochi now streams human-readable progress back into the chat UI during an agent run.

What changed:

- the runtime now runs the OpenAI Agents SDK in streaming mode
- key run events are translated into visible activity lines in the chat window
- the first version focuses on practical signals such as:
  - active agent changes
  - tool calls
  - tool outputs
  - approval waits
  - response drafting

Why this matters:

- users can see what Mochi is doing without exposing raw internal chain-of-thought
- long or tool-heavy runs feel more transparent and responsive
- this creates a cleaner path toward richer observability later

## Phase 30: Shared Context Budgeting And Lightweight Rate-Limit Retry

The runtime now controls prompt growth more deliberately and reacts more gracefully to short-lived TPM pressure.

What changed:

- added shared budgets for:
  - session history
  - memory text
  - project instructions
  - editor context
- runtime input is slimmed before each run using one central budgeting layer
- short rate-limit errors now trigger a lightweight retry after the suggested wait time

Why this matters:

- prompt size is less likely to grow uncontrollably over long sessions
- the runtime is more resilient to short TPM spikes
- context management is now more systematic rather than handled ad hoc

## Phase 31: Tool-Pair-Safe History Budgeting

History budgeting was tightened so tool call chains are not cut into invalid fragments.

What changed:

- history budgeting now preserves complete `function_call` and `function_call_result` pairs
- orphaned tool calls and orphaned tool results are dropped when older history is normalized for a run

Why this matters:

- the runtime avoids invalid OpenAI input states such as a tool result without its matching call
- long sessions can still be slimmed without breaking tool continuity

## Phase 32: Approval Trace Recording

Tool approval requests now flow through the runtime before reaching the VS Code UI.

What changed:

- the runtime wraps the approval callback passed into tools
- approval requests are recorded in the active run trace with action, kind, reason, relative path, and status
- approval outcomes update the same trace item to `approved` or `denied`
- compact trace summaries now count requested, approved, denied, and pending approvals

Why this matters:

- destructive actions and command execution now leave auditable approval evidence
- Tracy-style views can show what was allowed or denied without reading raw tool output
- this starts moving approval from scattered tool behavior toward the shared runtime policy pipeline

## Phase 33: Shared Tool Approval Helper

The duplicated approval branching inside tools was consolidated into a shared helper.

What changed:

- added `tool_approval.js` for common allow, deny, fallback, and execution flow
- file tools now use the helper for destructive writes, file deletion, and directory deletion
- command execution now uses the same helper shape as destructive file operations
- denied approvals now return a consistent structured result shape

Why this matters:

- risky tools now have less duplicated control flow
- future policy work can move toward one approval gate instead of many hand-written branches
- command and file approval behavior are easier to audit together

## Phase 34: Memory Storage Retention

Mochi now trims persisted memory instead of letting every session artifact grow forever.

What changed:

- added a storage history budget separate from the smaller run-input budget
- persisted session history now keeps only the latest retained window after sanitization
- retained history still preserves complete tool call and tool result pairs
- inactive tasks are pruned per session after task commits or task turn updates
- active tasks and recent inactive tasks are kept so current work and recent continuity remain available

Why this matters:

- raw memory snapshots stop ballooning during long test sessions
- the storage layer now matches the compact snapshot direction instead of fighting it
- this keeps local memory useful as product state rather than becoming an unbounded debug archive

## Phase 35: Snapshot Consistency And Task Normalization

The compact and raw memory views exposed a few state consistency gaps, so the task and trace layers were tightened.

What changed:

- task planning now normalizes the session before routing
- task listing also normalizes the session before returning snapshot data
- only the most recently updated active task remains active for a session
- older active tasks are converted to inactive tasks and then pass through retention
- raw trace lifecycle counts now fall back to recorded tool calls when lifecycle events are missing
- file tool trace data now preserves file-specific metadata such as bytes, created, and emptied instead of forcing every data payload into a command shape

Why this matters:

- compact snapshots no longer show multiple active tasks for the same session
- raw traces and compact summaries agree more closely
- memory snapshots become a product debugging surface instead of a confusing dump of half-normalized internals

## Phase 36: Session-Owned Task Memory

Mochi now treats chat sessions and tasks as separate but linked memory objects.

What changed:

- the runtime can switch its active base session id
- the chat UI now has a `+` control for creating a fresh session
- the selected session id is persisted through VS Code global state
- reopening the chat reloads the current session history into the webview
- tasks now maintain lightweight `summary` and `lastOutcome` fields
- related tasks are exposed to the prompt as summaries instead of full task history
- referenced task summaries can come from other sessions in the same workspace

Why this matters:

- session becomes the conversation container instead of a global forever-chat
- task becomes the durable work memory
- cross-task recall is cheaper and less noisy because it uses summaries rather than raw chat logs
- the UI now has the first real session affordance, which is the foundation for a later session list or sidebar

## Phase 37: Task Identity Across Sessions

The session/task boundary was corrected so tasks do not collapse into session aliases.

What changed:

- sessions now normalize around a focused task concept through `focusedTaskId`
- tasks record `sessionIds` and `lastSessionId`
- task routing can match relevant tasks across the same workspace even when the current session has no focused task
- when a new session continues an old task, that task is linked to the new session instead of creating a duplicate task
- compact snapshots now expose `focusedTask` while keeping `activeTask` for compatibility

Why this matters:

- session represents a conversation window
- task represents durable work identity
- a task can survive across multiple sessions without importing full session history
- the next UI layer can add a real task switcher without confusing it with the session `+` button

Follow-up fix:

- creating a new chat session now immediately ensures a persisted session record exists
- memory snapshots now also ensure the current session before reading it
- a fresh session therefore appears as an empty session object with `messageCount: 0` rather than `null`

## Phase 38: Session Tab Strip And Switching

The session UI moved from a single label plus `+` button to a VS Code-style tab strip.

What changed:

- the session store can list all sessions for the current workspace
- the runtime exposes compact session tab data for the webview
- the chat controller now syncs session tabs, active session, and history together
- the webview can switch to an existing session instead of only creating new ones
- the `ready` handshake hydrates session state, so reopening or switching back to Mochi does not look like a fresh chat
- tasks linked across sessions are visible in the current session's task list

Why this matters:

- session now behaves like a real chat window/tab
- task remains the durable work identity under one or more sessions
- users can return to previous windows without relying on raw memory snapshots
- switching away to another view and back should reload the persisted active session rather than presenting an accidental blank state

Follow-up fix:

- recall-style prompts such as "上次", "刚才", "之前", "还记得", "不是这个", and "不对" now receive a compact recent-session memory section
- the recent-session section includes recent sessions' last user prompt, last assistant reply, and update time
- this lets Mochi answer "what did I ask last time?" from session memory instead of guessing from unrelated task overlap

Follow-up tab management:

- session tabs can now be closed from the webview with a lightweight confirmation
- deleting the active tab moves to the most recently updated remaining tab
- deleting the final tab creates a clean fallback session instead of leaving the runtime without a session
- closing a tab now hides the conversation window instead of deleting the persisted session memory
- closed tabs keep their history, task links, and recall data for future memory grounding
- empty sessions are titled as readable "New chat HH:mm" labels, while active work sessions use the last user prompt as their compact title
- tab ordering now stays fixed by session creation time, so switching or chatting in a tab does not move it
- session tabs now use steadier width, height, label truncation, and close-button spacing to reduce layout shift in the tab strip

Follow-up recall hardening:

- JSON memory files are now written through temporary files and atomic renames instead of direct overwrite
- in-process memory updates are serialized per store so overlapping writes do not lose recent turns
- corrupt JSON memory files are moved aside with a `.corrupt-*` suffix and the store recovers with its default structure
- recall-style recent-session memory now includes the representative task title, status, summary, outcome, and turn count
- prompts like "上次没做完什么" can now ground their answer in the previous session's work item, not only its last chat message

Follow-up session-scoped streaming:

- outgoing prompts now include the base session that launched the run
- runtime activity, streaming deltas, reply controls, approvals, errors, and final replies now carry that session identity back to the webview
- the chat UI ignores run events for non-active sessions, preventing an agent response started in one tab from rendering in another
- the runtime memory preparation path can target the launching session explicitly instead of relying on whichever tab is active later
- a single global run lock prevents starting a second session run while another streamed run is still active

Follow-up tool isolation and file conflict handling:

- tool lifecycle events now carry the base session id that launched the run
- file mutations are serialized per absolute target path inside the extension process
- file reads record a per-run content fingerprint
- write, append, and delete operations refuse to mutate a file if that run previously read it and the file has changed since that read
- this keeps session memory isolated while treating workspace files as shared resources that require conflict-aware writes
- pure non-tool chat runs can proceed in parallel across sessions
- run state is now stored per async run instead of one global mutable runtime slot
- only tool usage is mutually exclusive: once one run starts using tools, other runs receive a structured tool-blocked result if they also try to use tools before the first run finishes

Follow-up send-window consistency:

- session history messages sent to the webview now include the base session they belong to
- the webview tracks both the active tab and the session whose message window has actually loaded
- switching or creating sessions disables sending until the matching session history arrives
- stale session history payloads are ignored instead of replacing the visible chat for a different active tab
- prompts can only be sent when the visible chat window and active session id match
- session UI synchronization now captures the target base session before async history loading begins
- overlapping session sync requests are versioned so late responses from older tab switches are dropped
- composer drafts are now tracked per session in the webview
- switching tabs saves the current input draft and restores the target session's draft
- rendering the tab list no longer mutates the active session id, so the input box changes only through explicit session switches

## Current State

As of this log:

- the VS Code extension runs on the OpenAI Agents SDK path
- the JavaScript runtime is the only maintained product runtime
- `scripts/setup_model.sh` remains useful for model provider environment setup
- the codebase now has a long-term structure for tools, prompts, agents, and memory

## Phase 43: Rolling Session Compaction

Mochi gained a first local compaction layer for long sessions.

What changed:

- sessions now have `summary`, `summaryUpdatedAt`, `compactedAt`, and `compaction` metadata
- when stored session history crosses the compaction threshold, older items are summarized locally
- recent raw history is retained so the model still sees the latest turns directly
- compacted summaries are injected into memory context before the next run
- compact memory snapshots now show session summary and compaction state

Why it matters:

- long conversations no longer rely only on hard history truncation
- older context can survive as a compact summary instead of disappearing completely
- local memory remains bounded without introducing an external vector database yet

Follow-up direction:

- keep the local compactor as a cheap fallback
- add a memory selector before expanding the amount of task/session memory injected into each run
- later introduce a low-permission maintenance compactor that produces structured JSON memory patches
- memory patches should carry timestamps, source session ids, source task ids, source run ids, confidence, and supersession metadata

## Phase 44: Agent-As-Tool Delegation

Mochi gained a first controlled subagent delegation path.

What changed:

- the root agent now gets a `run_subagent` tool
- `repo_guide` and `coding` are delegated as bounded subagent roles
- the main runtime still runs only the root agent directly
- subagents receive normal workspace tools but do not receive the subagent tool, so delegation cannot recurse
- the root agent is instructed to keep simple requests local and use subagents only for complex exploration or implementation work

Why it matters:

- multi-agent behavior is now explicit and traceable as a tool call
- scheduling stays owned by Mochi's runtime instead of becoming an uncontrolled handoff graph
- this creates a practical foundation for future scout / strategy / review roles without slowing every simple interaction

Follow-up direction:

- split read-only and mutating tool sets per role
- add a dedicated review subagent once diff/test inspection is ready
- add structured JSON outputs for scout and review roles
- persist delegation stage metadata into run traces and compact snapshots

Follow-up router update:

- added a lightweight delegation policy before each run
- direct requests stay on the root-agent path
- exploration and architecture prompts get a `repo_guide` suggestion
- implementation and refactor prompts get a `coding` suggestion
- the guidance is runtime-only and does not get persisted into chat history
- the selected policy is recorded on the run trace for later inspection
- tightened the policy after rate-limit testing so short confirmations and small single-file edits stay direct by default
- reduced default context budgets and bounded subagent prompt/context forwarding to lower TPM pressure

Follow-up trace and evidence update:

- subagent runs now create nested traces under `subagentRuns`
- nested traces capture streamed subagent tool calls without streaming subagent prose directly into the chat UI
- `run_subagent` results now include evidence metadata such as workspace root, inspected files, listed paths, and workspace-tool usage
- Repo Guide and Coding prompts now ask for short Evidence sections in delegated work
- added a role-aware memory selector so subagents receive small task/workspace/session/user/project slices instead of direct access to the full root memory context
- trace summaries now expose the selected memory sections for each subagent run

Follow-up role expansion:

- added `plan_reviewer` for proposal and implementation-plan validation
- added `review` for code review, regression checks, missing tests, and risk analysis
- `repo_guide` and `plan_reviewer` now receive read-only tools
- `review` receives read-only tools plus command verification
- `coding` remains the only subagent with the full workspace mutation tool set
- router suggestions now recognize explicit plan-review and code-review prompts while keeping small confirmations on the direct path

Follow-up skills layer:

- added local Markdown skills under `src/runtime/skills`
- added a lightweight skill selector for root and subagent runs
- root runtime guidance can now include selected skills
- delegated subagent input can now include selected role-relevant skills
- selected skill metadata is recorded in traces for inspection
- first skills: code review, plan review, VS Code extension development, memory architecture, and frontend polish

Follow-up chat rendering update:

- assistant bubbles now render common Markdown instead of showing raw Markdown characters
- the renderer escapes HTML before formatting, keeps user messages as plain text, and supports headings, lists, code blocks, inline code, links, quotes, and separators
- streamed replies still appear as plain accumulating text while streaming, then render as Markdown when finalized

## Phase 45: OpenAI-Compatible Provider Setup

The setup helper now supports choosing between OpenAI and Gemini without changing Mochi's main runtime path.

What changed:

- `scripts/setup_model.sh` now starts with a provider choice
- OpenAI keeps the default `https://api.openai.com/v1` endpoint and `gpt-4.1-mini` model
- Gemini writes a Google AI Studio key into the OpenAI-compatible environment variables used by the Node SDK
- Gemini setup also stores `GEMINI_API_KEY` for clarity while keeping `OPENAI_API_KEY` for SDK compatibility
- README and usage docs now describe the script as model provider setup rather than OpenAI-only setup

Why it matters:

- users can try Gemini through the same VS Code extension flow
- the runtime stays simple because provider switching is handled through environment configuration
- the setup prompt is clearer for first-time users and avoids mixing OpenAI and Gemini keys

## Phase 46: Local Packaging, Config Reuse, And Memory Controls

Mochi gained a more complete local extension testing and memory-control surface.

What changed:

- extension identity is now `zee.mochi-local-agent`
- local VSIX packaging is documented and covered by `.vscodeignore`
- local test reports are generated as `test-report.json` and `test-report.md`
- model configuration now checks VS Code Secret Storage first, then VS Code settings, then local environment / `~/.openai-env`
- first-run chat can reuse existing local model configuration instead of forcing duplicate setup
- Memory Controls now expose policy toggles and granular clear actions
- commands exist for clearing session summary, internal working state, workspace memory, user memory, trace/routing memory, and all local memory
- current-window memory clear preserves visible chat messages
- clear-all local memory preserves chat sessions and messages while clearing memory categories

Why it matters:

- local verification is now easier from both F5 and packaged VSIX flows
- users can inspect and clear memory categories without deleting the whole chat
- setup is less annoying because local configuration is reused when possible

## Phase 47: Private Window Mode And Memory V2 Design

Mochi now has a clearer private-window story and a written target design for the next memory system.

What changed:

- the chat panel now exposes `Private` as a direct current-window toggle
- the old `Tools` button was removed from the chat panel
- the slash menu was reduced to high-frequency shortcuts only:
  - `/help`
  - `/new`
  - `/memory`
  - `/clear-private-window`
  - `/model`
- Private mode sets:
  - `privateWindow: true`
  - `isolateSession: true`
  - `disablePersistentMemory: true`
- current-window artifact deletion deletes the current session record and linked task artifacts while leaving other sessions untouched
- run finalization now applies persistent-memory policy using the run's base session id, avoiding policy mix-ups when switching windows
- `doc/memory-model.md` and `doc/memory-model.zh.md` now define the exact three layers, Long-Term Memory record kinds, Current Window Memory storage details, lifecycle, archive/delete behavior, Private mode, and Memory Controller boundaries
- `doc/memory-v2.md` now tracks the next implementation plan, including storage layout, read/write policy, long-term memory eligibility, memory event logging, and testing requirements
- Memory V2 now treats task-like records as internal working state rather than user-facing memory
- the memory model is now strict: Current Window Memory, Long-Term Memory, and Runtime Trace
- non-private window archive/delete is now the first intended path for compressing Current Window Memory into a `kind: "window_archive"` Long-Term Memory record
- discard-without-archive is defined as a separate confirmed destructive action
- natural-language memory deletion is proposal-only and must not directly delete memory

Why it matters:

- Private mode is now a visible product concept instead of a hidden command
- the chat shortcut surface is smaller and less confusing
- the memory system now has a concrete next design instead of evolving through scattered patches

Follow-up direction:

- add `memory_events.json` and a `MemoryEventStore`
- split trace/debug memory into a dedicated store
- make `MemoryCommit` explicit after each run
- add explicit remember/forget flows
- design the current-window-to-long-term promotion trigger before implementing automatic promotion
- replace Memory Controls QuickPick with a category-based management panel
- add closed-loop integration tests for every memory layer

## Next Likely Steps

- implement Memory V2 storage and event logging
- add explicit remember/forget flows
- turn Memory Controls into a category-based management panel
- add a memory selector to reduce overlap between current-window summaries, internal working state, and long-term memory
- keep expanding role-based multi-agent behavior on top of selected memory slices
- add better visibility into task routing decisions and scores
- add safer destructive tool approval flows
- evaluate where the OpenAI SDK session abstractions can replace hand-rolled generic session plumbing without weakening Mochi-specific memory layers
- add more persistent task and workspace intelligence over time
