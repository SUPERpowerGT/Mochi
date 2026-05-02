# Memory V2 Implementation Plan

## Purpose

This document defines the next implementation plan for Mochi memory.

The product and system semantics are defined in `memory-model.md` and mirrored in Chinese in `memory-model.zh.md`. Those documents are the source of truth for:

- the exact three layers
- Long-Term Memory record kinds
- Current Window Memory field groups
- Runtime Trace event kinds
- storage mapping
- lifecycle rules
- archive/delete rules
- boundaries
- Private mode behavior
- Memory Controller responsibilities

This document translates that model into storage, runtime, UI, and test work.

## Model Dependency

Implementation must preserve the `memory-model.md` product model:

- the system has exactly three layers: Current Window Memory, Long-Term Memory, and Runtime Trace
- only Current Window Memory and Long-Term Memory are user-facing memory categories
- user preference, project fact/convention, decision, and window archive are Long-Term Memory record kinds, not layers
- working state is internal and should not be exposed as "Task Memory"
- runtime trace is debug/audit evidence, not memory by default
- Private mode blocks Long-Term Memory reads, writes, and promotion
- non-private window archive/delete should create a `kind: "window_archive"` Long-Term Memory record unless the user explicitly discards without archive
- natural-language chat cannot directly delete memory; it can only create a proposal that requires confirmation

## Current Baseline

As of the current implementation, Mochi stores local memory in JSON files through `JsonFileStore`.

Current stores:

- `sessions.json`
- `tasks.json` as internal working state, not user-facing long-term memory
- `workspaces.json`
- `user.json`

Current readable memory sources:

- current session history
- compacted current-session summary
- current-window working state
- recent session summaries when the user asks a recall-style question
- detected workspace facts
- lightweight user preferences such as preferred language

Current controls:

- current-window Private mode
- current-window cross-session isolation
- current-window persistent memory read toggle
- delete current-window artifacts
- clear current-window memory while preserving chat messages
- transitional granular clears for session summary, internal working state, workspace memory, user memory, trace memory, or all local memory

Current gaps:

- no unified memory commit pipeline
- no memory event log explaining why facts were written, updated, or deleted
- workspace facts are mostly auto-detected rather than user-confirmed
- user memory is intentionally narrow
- task-like state is still stored as a separate internal implementation detail
- trace data lives with session state instead of having a clearer debug-memory boundary
- explicit "remember this" and "forget this" user flows are not implemented yet
- non-private window archive/delete is the first intended trigger for creating a `kind: "window_archive"` Long-Term Memory record
- additional automatic promotion beyond archive/delete is not decided yet

## Storage Layout

Memory V2 should continue using local JSON stores for now.

Proposed local storage:

```text
mochi-memory/
  sessions.json
  tasks.json        # internal working state, not user-facing memory
  workspaces.json
  user.json
  traces.json
  memory_events.json
```

JSON remains a good fit for the next phase because it is:

- local-first
- easy to inspect from memory snapshots
- easy to reset during tests
- simple to evolve without adding a database dependency

The new files should be introduced when the implementation needs them:

- `traces.json` separates debug traces from session memory.
- `memory_events.json` records why memory changed.

## Implementation Stores

The implementation may use several stores, but the product model must stay strict: Current Window Memory, Long-Term Memory, and Runtime Trace.

### 1. Current Window State

Scope:

- one Mochi chat window/session in one workspace

Stores:

- chat history
- compacted summary for older turns
- current working-state pointer
- last prompt metadata
- latest turn classification
- latest routing state

Read rules:

- current session history is always available to the current chat window
- compacted session summary is read only when persistent memory reads are enabled
- current session memory is not shared across windows unless cross-session recall is explicitly allowed

Write rules:

- chat history is written after every run
- turn classification is written before a run starts
- compaction summary is written when history exceeds the compaction threshold
- Private mode may keep current in-memory chat flow, but should not promote private content into long-term summaries
- current-window summary is still Current Window Memory until explicitly promoted

Clear rules:

- clear current-window memory removes current-window summary, working state, trace, and routing state while preserving chat messages
- delete current-window artifacts deletes the current session record and linked current-window working/debug artifacts

### 2. Internal Working State

Scope:

- one current-window work goal or routing target

Stores:

- internal id
- title
- goal
- status
- linked session ids
- related files
- turn count
- latest prompt
- latest assistant reply
- summary
- last outcome
- routing diagnostics

Read rules:

- current-window working state may be read as part of Current Window Memory
- related working-state summaries from other windows should not be read by default
- cross-window work recall should come from Long-Term Memory or explicit recall flows, not raw task state

Write rules:

- only work-like turns should create or update internal working state
- task routing should plan changes before the run starts
- working-state writes should commit only after a successful run
- failed or interrupted runs should not create empty durable records
- Private mode may keep current-window working state, but must not promote it into Long-Term Memory

Clear rules:

- clear current-window memory clears working state for the current session/window
- delete current-window artifacts deletes working-state records linked only to that current window/session

### 3. Workspace Long-Term Memory

Scope:

- one local workspace root

Stores:

- root path
- detected package manager
- detected languages
- detected manifests
- suggested test/build/lint/typecheck commands
- confirmed project conventions
- durable repo facts that help future work

Read rules:

- read for the active workspace when persistent memory reads are enabled
- do not read in Private mode
- project instruction files such as `MOCHI.md`, `AGENTS.md`, and `CLAUDE.md` remain separate runtime input, not workspace memory

Write rules:

- auto-detected facts may be written from local files
- project conventions should be written only when supported by file evidence or explicit user confirmation
- speculative assumptions should not become workspace memory

Clear rules:

- clear current workspace memory deletes the workspace memory record for the active workspace

### 4. User Long-Term Memory

Scope:

- the local user across workspaces

Stores:

- language preference
- response style preference
- testing/verification preference
- approval preference
- other stable user preferences

Read rules:

- read when persistent memory reads are enabled
- do not read in Private mode

Write rules:

- prefer explicit or semi-explicit writes
- examples that may write:
  - "以后都用中文"
  - "answer more briefly by default"
  - "always run tests after edits when possible"
- repeated observed behavior may create a low-confidence suggestion, but should not silently become a strong preference
- secrets, API keys, tokens, private file contents, and one-off instructions must never become user memory

Clear rules:

- clear user memory deletes saved user preferences

### 5. Trace / Debug State

Scope:

- a run, session, or current window

Stores:

- tool calls
- tool results
- command stdout/stderr previews
- approval requests and decisions
- changed paths
- verification evidence
- final status and error summaries

Read rules:

- default model runs should not read trace memory as long-term knowledge
- traces are primarily for user inspection, debugging, and memory maintenance evidence
- a compact trace summary may be passed to memory maintenance, not treated as general chat context

Write rules:

- write trace data during and after every run
- Private mode may keep trace/debug artifacts for the current private window
- Private trace data should be deleted by delete current-window artifacts

Clear rules:

- clear current trace memory removes latest trace and routing state for the current session
- future `traces.json` should support per-session and per-run deletion

### 6. Explicit Long-Term Memory

Scope:

- user-approved durable facts across workspace or user long-term memory

Examples:

- "remember that this project uses pnpm"
- "remember I prefer Chinese replies"
- "forget that old testing command"
- "do not remember this session"

Write rules:

- explicit memory should create a memory event with source `explicit-user`
- the target layer should be selected by the fact:
  - personal preference -> user
  - project convention -> workspace
  - stable decision -> workspace or explicit remembered fact
  - current goal/progress -> current-window state unless the user explicitly says to remember it

This layer is not implemented yet, but Memory V2 should make room for it.

## Promotion From Current Window To Long-Term Memory

The first approved path from Current Window Memory to Long-Term Memory is a `kind: "window_archive"` record.

Settled rule:

- non-private window archive/delete should compress the current window into a `kind: "window_archive"` Long-Term Memory record
- Private windows must never create `window_archive` records
- discard-without-archive must be a separate explicit destructive action

Open decisions for additional promotion:

- Should promotion happen only when the user explicitly says "remember this"?
- Should Mochi suggest memories after a useful session and ask for confirmation?
- Should stable project facts detected from files be written automatically?
- Should stable decisions made during the window be summarized into a review queue instead of written directly?

Current recommendation:

- default to no automatic promotion from current-window working state into Long-Term Memory except `kind: "window_archive"` on non-private archive/delete
- allow automatic long-term writes only for file-detected project facts
- allow explicit writes when the user asks Mochi to remember something
- later add a "Promote to Long-Term Memory" review flow that shows proposed facts before saving them

Until this is implemented, task/working-state summaries should stay current-window scoped.

## Write Policy

Every run should end with a `MemoryCommit` decision.

Input:

- user prompt
- assistant reply
- tool trace
- current session id
- current workspace id
- memory policy
- turn classification
- working-state routing plan

Policy:

```text
session: always write visible chat history
working state: write after successful work turns for the current window
workspace: write detected facts or confirmed facts when not private
user: write explicit or high-confidence preferences when not private
trace: write debug trace for the current run/window
event log: record every durable memory change
```

Private mode:

```text
read current visible chat context: yes
read session summary: no
read long-term memory: no
read workspace memory: no
read user memory: no
read related sessions: no
write current-window working state: yes, current-window only
write workspace memory: no
write user memory: no
write long-term session summary: no
write current trace/debug artifacts: yes, current-window only
delete current-window artifacts: deletes private window output
```

## What Becomes Long-Term Memory

Allowed automatic long-term memory:

- detected package manager
- detected framework/language signals
- detected test/lint/typecheck commands
- preferred language when strongly observed or explicit

Allowed explicit long-term memory:

- user preferences
- project conventions
- durable decisions
- "remember this" facts
- selected current-window conclusions after an explicit promotion flow

Never long-term memory:

- API keys, tokens, secrets, credentials
- large raw file contents
- raw command output beyond short evidence previews
- speculative assumptions
- one-off errors
- transient debugging noise
- task/working-state summaries by default
- private-window content
- private-window trace data after delete current-window artifacts

## Read Pipeline

At the start of a run:

```text
prompt
  -> memory retrieval plan
  -> policy filter
  -> relevance selection
  -> context budget
  -> injected memory text
```

Retrieval plan:

- current session history
- current session summary
- current-window working state
- workspace memory
- user memory
- recent session memory only when recall is requested

Policy filter:

- Private blocks all long-term memory reads
- disable persistent memory reads blocks session summary, workspace, user, explicit long-term memory, and recent session memory
- isolate session blocks other-session and related-session recall

Budget:

- memory selection must stay below the runtime memory budget
- duplicated information across current-window summary and long-term memory should be deduped before injection

## Write Pipeline

At the end of a run:

```text
prompt + reply + trace
  -> memory classifier
  -> memory policy
  -> memory patch
  -> memory commit
  -> memory event log
```

Classifier output should include:

- candidate facts
- target layer
- source evidence
- confidence
- reason
- privacy flag

Memory patch should support:

- add
- update
- merge
- archive
- delete
- no-op

Memory event log should record:

- event id
- timestamp
- operation
- target store
- target id
- source run id
- source session id
- source evidence summary
- policy decision
- before/after summary when safe

## Memory Controls V2

The Memory Controls UI should become a real management panel rather than a command list.

Required sections:

- Current Window
- Long-Term Memory
- Policy
- Events

Each section should expose:

- count
- current summary
- latest update time
- view details
- clear/delete actions
- explicit "remember" and "forget" actions where relevant
- proposed promotion review when Current Window Memory may contain durable facts

The chat panel should keep only high-frequency controls:

- Private toggle
- Send
- small slash shortcut menu

Slash shortcuts should remain small and should not duplicate the full memory management surface.

## Testing Requirements

Each user-facing memory category needs a closed-loop integration test:

- write candidate memory
- read memory into a future run
- verify policy blocks it in Private mode
- verify isolation behavior
- clear/delete the memory
- verify it is absent afterward
- verify unrelated memory remains

Required test journeys:

- first-run setup and chat send
- session summary write and read
- current-window working state write and read
- workspace memory detection and read
- user preference write and read
- recent-session recall
- Private mode blocks long-term reads and writes
- delete current-window artifacts removes only current-window products
- long-term clear does not delete current-window chat
- current-window clear does not delete long-term memory
- test report generation includes the memory journeys

## Implementation Plan

1. Add `memory_events.json` and a `MemoryEventStore`.
2. Add an explicit `MemoryCommit` object returned by `finalizeRun`.
3. Move trace persistence toward a dedicated trace store.
4. Add explicit memory commands:
   - remember this
   - forget this
   - list memory events
5. Replace Memory Controls QuickPick with a richer category-based webview.
6. Collapse the user-facing memory model to Current Window Memory and Long-Term Memory.
7. Reclassify task storage as internal working state.
8. Add closed-loop tests for Current Window Memory and Long-Term Memory.
9. Decide and implement the current-window-to-long-term promotion trigger.
10. Add stricter policy checks so Private mode cannot accidentally write durable memory.
11. Add safer user-memory promotion rules.

## Current Implementation Notes

The current code already has useful foundations:

- `MemoryManager.prepareRun` builds memory context.
- `MemoryManager.finalizeRun` commits history, compaction, trace, and task updates.
- task updates are currently implementation working state, not the target user-facing memory model.
- current-window Private mode sets:
  - `privateWindow: true`
  - `isolateSession: true`
  - `disablePersistentMemory: true`
- run finalization now applies persistent-memory policy using the run's base session id, not the runtime's current active session id.
- current-window artifact deletion deletes the current session record and linked task artifacts while leaving other sessions untouched.

The next implementation should keep these foundations but make the policy and write pipeline explicit.
