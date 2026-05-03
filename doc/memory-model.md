# Mochi Three-Layer Memory Model

## Purpose

This document is the source of truth for Mochi memory semantics.

Mochi has exactly three layers:

```text
1. Current Window Memory
2. Long-Term Memory
3. Runtime Trace
```

Do not add more memory layers.

Important naming rule:

- `user_preference`, `project_fact`, `project_convention`, `decision`, and `window_archive` are Long-Term Memory `record.kind` values. They are not layers.
- `chat_history` and `window_summary` are Current Window Memory content groups. They are not layers.
- `working_state` and `routing_state` are Current Window State, not memory content and not layers.
- `trace_ref` is a Runtime Trace reference, and `policy_state` is policy state. They are not memory content and not layers.
- `run`, `tool_call`, `command_result`, `approval`, `file_change`, `verification`, and `error` are Runtime Trace event kinds. They are not layers.
- Memory Controller is a controller. Memory Events are audit records. Neither is a layer.

`memory-v2.md` is the implementation plan. This file is the product and system contract.

## Layer Overview

| Layer | Is memory? | Default model context? | User-facing? | Purpose |
| --- | --- | --- | --- | --- |
| Current Window Memory | yes | yes, for the owning window | yes | Keeps one open Mochi window coherent while the user works. |
| Long-Term Memory | yes | yes, only for normal non-private windows | yes | Stores durable facts and archived non-private window summaries that future windows may reuse. |
| Runtime Trace | no | no | partly, for debug/reporting | Records evidence about runs, tools, approvals, commands, file changes, and failures. |

## Hard Boundaries

- There are exactly three layers.
- Current Window Memory is short-lived and window-scoped.
- Long-Term Memory is durable and reusable.
- Runtime Trace is evidence, not memory context by default.
- Internal working state belongs to Current Window State, not memory content.
- Memory informs. State drives.
- Natural-language chat must not directly delete memory.
- The normal assistant may propose memory actions, but Memory Controller owns promotion, archive, deletion, policy, and audit.
- Private mode may use its own Current Window Memory but must not read, write, promote into, or archive into Long-Term Memory.
- Private windows must not create `window_archive` records.
- Secrets, raw file contents, raw command output, and private-window content must not become Long-Term Memory.

## Layer 1: Current Window Memory

Current Window Memory is the short-lived conversation context of one open Mochi chat window/session.

It answers: "What does this current window need to continue this conversation?"

It does not answer: "What should future windows remember forever?"

Current Window State is runtime driver data under the same window. It answers: "How should runtime continue the current work?"

### Current Storage Locations

The implementation currently stores Current Window Memory across two files, with one trace field still attached to the session record.

| Storage | Current role | Layer owner | Notes |
| --- | --- | --- | --- |
| `sessions.json` | Primary current-window/session store | Current Window Memory + metadata + partial state | Stores session identity, visible chat history, summary, routing pointers, last turn metadata, and latest trace reference/data. |
| `tasks.json` | Transitional internal working-state store | Current Window State | Stores current work continuity. It must not be exposed as a separate "Task Memory" layer. |
| `sessions.json:lastRunTrace` | Latest trace data/reference | Runtime Trace, currently embedded in session | Target direction is to move run traces to `traces.json`. |
| in-memory policy map | Current window policy | Current Window Memory policy | Stores `privateWindow`, `isolateSession`, and `disablePersistentMemory` while the window is active. |

Target direction:

- keep visible chat and current-window summary in the session/window store
- keep internal working state hidden as Current Window State
- move trace data to `traces.json`
- avoid exposing `tasks.json` as a memory product

### `sessions.json` Fields

| Field | Function | Starts storing when | Updates when | Reads when | Clears/deletes when |
| --- | --- | --- | --- | --- | --- |
| `id` | Stable current-window/session identity, usually derived from base session and workspace. | session opens | rarely | any window operation needs identity | current-window artifact deletion |
| `workspaceId` | Binds the window to a workspace scope. | session opens | workspace changes/session restore | workspace-scoped retrieval or cleanup | current-window artifact deletion |
| `history` | Visible user/assistant conversation turns for this window. | first message/session restore | user sends and assistant replies | building current window prompt/history | delete/discard window; clear command may preserve visible chat if promised |
| `createdAt` | Session creation timestamp. | session opens | never | UI/debug/audit | current-window artifact deletion |
| `updatedAt` | Last session mutation timestamp. | session opens | any session write | UI/debug/audit | current-window artifact deletion |
| `messageCount` | Lightweight chat length metadata. | first history write | history changes | compaction/debug/UI | current-window artifact deletion |
| `lastPrompt` | Latest user prompt preview/metadata. | user sends | each user turn | debug/routing/snapshot | clear/delete current-window artifacts |
| `lastTurn` | Latest turn classification and routing metadata. | before/after a run | turn classification/routing changes | runtime prepares next turn | clear current-window memory or delete window |
| `activeTaskId` | Pointer to current internal working state. | work-like flow starts | work focus changes | continuing work in same window | clear current-window memory or delete window |
| `focusedTaskId` | Pointer to focused internal working state. | work-like focus exists | focus changes | routing/continuation | clear current-window memory or delete window |
| `summary` | Compact summary of older current-window context. | compaction threshold or explicit summarization | compaction/maintenance | current window needs compact context | clear current-window memory or delete window |
| `summaryUpdatedAt` | Summary timestamp. | summary created | summary refreshed | debug/staleness checks | clear current-window memory or delete window |
| `compactedAt` | Last compaction timestamp. | compaction runs | compaction reruns | compaction/staleness checks | clear current-window memory or delete window |
| `compaction` | Compaction metadata. | compaction runs | compaction reruns | debug/maintenance | clear current-window memory or delete window |
| `lastRunTrace` | Latest run trace data/reference. | run starts/completes | tool/command/approval/error evidence changes | debug/snapshot/archive evidence | trace clear, current-window memory clear, delete/discard window |
| `closedAt` | Marks window/session closure. | close/delete flow | close/delete flow changes | restore/filter logic | permanent artifact deletion |

### `tasks.json` Transitional Working-State Fields

`tasks.json` is implementation working state for the current window. It is not a fourth memory layer and should not be marketed as "Task Memory".

| Field | Function | Starts storing when | Updates when | Reads when | Clears/deletes when |
| --- | --- | --- | --- | --- | --- |
| `id` | Internal working-state id. | work-like flow starts | rarely | session pointers resolve working state | current-window memory clear/delete |
| `sessionId` | Owning current window/session. | working state created | session association changes | same-window continuation | current-window memory clear/delete |
| `workspaceId` | Workspace scope for the working state. | working state created | workspace changes | routing/cleanup | current-window memory clear/delete |
| `title` | Short work title. | work-like flow is identified | work goal changes | UI/snapshot/routing | current-window memory clear/delete |
| `goal` | Current work goal. | work-like flow starts | user changes goal | same-window continuation | current-window memory clear/delete |
| `status` | Current status. | working state created | work progresses/completes/fails | routing/debug | current-window memory clear/delete |
| `sessionIds` | Linked sessions for transitional continuity. | working state created | linked sessions change | restore/debug | current-window memory clear/delete |
| `lastSessionId` | Latest owning/linked session. | working state created | session focus changes | routing/continuation | current-window memory clear/delete |
| `turnCount` | Number of work-like turns. | working state created | each relevant turn | routing/debug | current-window memory clear/delete |
| `lastUserPrompt` | Latest work prompt preview. | user sends work-like prompt | each work turn | routing/debug | current-window memory clear/delete |
| `latestAssistantReply` | Latest assistant outcome preview. | assistant replies | each work turn | continuation/debug | current-window memory clear/delete |
| `summary` | Short current work summary. | work state summarized | successful work/routing | continuation | current-window memory clear/delete |
| `lastOutcome` | Latest work result. | work completes/partially completes | each work turn | continuation/debug | current-window memory clear/delete |
| `notes` | Internal notes for continuity. | runtime records note | runtime updates | same-window continuation | current-window memory clear/delete |
| `relatedFiles` | File path references, not raw file contents. | file-oriented work starts | files change/focus changes | continuation/debug | current-window memory clear/delete |
| `lastRoute` | Latest route classification. | routing runs | each routed turn | next-turn routing | current-window memory clear/delete |
| `routeReason` | Safe explanation of routing decision. | routing runs | each routed turn | debug/routing | current-window memory clear/delete |
| `createdAt` | Working-state creation timestamp. | working state created | never | debug/audit | current-window memory clear/delete |
| `updatedAt` | Last working-state mutation timestamp. | working state created | any update | debug/staleness | current-window memory clear/delete |

### Current Window Record Groups

| Group | Category | Current storage | Function |
| --- | --- | --- | --- |
| `chat_history` | memory | `sessions.json:history` | Visible conversation and immediate prompt continuity. |
| `window_summary` | memory | `sessions.json:summary`, `summaryUpdatedAt`, `compactedAt`, `compaction` | Compact older current-window context. |
| `working_state` | state | `tasks.json` plus `activeTaskId`/`focusedTaskId` pointers | Continue current work inside the same window. |
| `routing_state` | state | `sessions.json:lastTurn`, `tasks.json:lastRoute`, `routeReason` | Decide whether the next turn is conversation, work, continuation, or routing change. |
| `trace_ref` | evidence | `sessions.json:lastRunTrace` today | Link to latest run evidence; target is `traces.json`. |
| `policy_state` | policy | in-memory policy map | Enforce private/isolation/persistent-read behavior for this window. |

### Current Window Write Rules

Current Window memory/state is written automatically during normal use.

Allowed write triggers:

- create/open/restore a Mochi window
- user sends a message
- assistant response completes
- runtime classifies or routes a turn
- successful work turn updates internal working state, which is Current Window State
- history compaction creates or refreshes `window_summary`
- run evidence attaches a trace reference
- user toggles current-window policy such as Private mode

Private mode allows Current Window memory/state writes because they stay inside the current window.

### Current Window Read Rules

- A window may read its own Current Window Memory.
- Runtime may read its own Current Window State.
- A normal window must not read another active window's raw Current Window Memory.
- A normal window may later read a compressed `window_archive` Long-Term record created from another non-private window.
- A Private window may read only its own Current Window Memory and its own Runtime Trace/debug artifacts.
- A Private window must not read Long-Term Memory.

### Current Window Clear/Delete/Archive Rules

| Action | Private? | Writes Long-Term Memory? | Deletes current-window artifacts? | Meaning |
| --- | --- | --- | --- | --- |
| Clear Current Window Memory | any | no | clears summary, working state, routing state, and trace links; visible chat may remain if the command promises that | reset current-window memory and related state without necessarily deleting the chat transcript |
| Archive And Delete Current Window | no | yes, creates `kind: "window_archive"` | yes | compress useful non-private window context, save archive, then delete/close current-window artifacts |
| Discard Without Archive | any | no | yes | destructive delete; no archive |
| Private Delete | yes | no | yes | always discard; private windows cannot archive |

Archive is not discard.

Archive means "compress safe, useful, non-private current-window context into Long-Term Memory, then delete or close the current-window artifacts."

Discard means "delete current-window artifacts and do not save an archive."

## Layer 2: Long-Term Memory

Long-Term Memory stores durable, reusable facts and summaries.

It answers: "What should normal future Mochi windows be allowed to reuse?"

Long-Term Memory is one layer with multiple `record.kind` values.

### Current Storage Locations

| Current storage | Current role | Target direction |
| --- | --- | --- |
| `user.json` | user-level durable preferences | migrate to unified `long_term_memory.json` records with `scope: "user"` |
| `workspaces.json` | workspace/project detected facts and conventions | migrate to unified `long_term_memory.json` records with `scope: "workspace"` |
| `long_term_memory.json` | first-class Long-Term Memory records; currently used for `kind: "window_archive"` | expand to include user preferences, project facts/conventions, and decisions under the same schema |

### Target Record Shape

```json
{
  "id": "mem_...",
  "layer": "long_term",
  "kind": "user_preference",
  "scope": "user",
  "workspaceId": null,
  "title": "Short stable title",
  "text": "Safe human-readable memory text.",
  "content": {},
  "source": "explicit_user",
  "confidence": "confirmed",
  "status": "active",
  "createdAt": "iso timestamp",
  "updatedAt": "iso timestamp",
  "evidence": {
    "type": "user_message",
    "summary": "Safe evidence summary"
  }
}
```

Allowed `kind` values:

```text
user_preference
project_fact
project_convention
decision
window_archive
```

These are record kinds, not layers.

### Long-Term Record Kinds

| `record.kind` | Scope | Stores | Starts storing when | Reads when | Deletes when |
| --- | --- | --- | --- | --- | --- |
| `user_preference` | `user` | stable language/style/approval/verification preferences | explicit remember or confirmed preference flow | normal non-private windows need user preference context | confirmed delete/clear/archive |
| `project_fact` | `workspace` | package manager, languages, frameworks, manifests, test/lint/typecheck/build commands | reliable local file detection or explicit user confirmation | normal non-private windows in same workspace need project facts | confirmed delete, clear, or superseded evidence |
| `project_convention` | `workspace` | confirmed project rules, coding conventions, workflow expectations | user confirms convention or explicit remember | normal non-private windows in same workspace need conventions | confirmed delete/clear/archive |
| `decision` | `user` or `workspace` | stable decisions worth reusing | explicit remember or approved promotion | normal non-private windows need relevant durable decisions | confirmed delete/clear/archive |
| `window_archive` | usually `workspace` | compressed summary of a non-private window, decisions, outcomes, unresolved questions, follow-ups | non-private archive/delete or explicit save-window-summary action | normal non-private windows retrieve relevant prior window context | confirmed delete/clear |

### Long-Term Write Rules

Long-Term Memory writes are controlled by Memory Controller.

Allowed write triggers:

- explicit remember action
- confirmed preference
- confirmed project convention
- reliable file-detected project fact
- non-private current-window archive/delete creating `kind: "window_archive"`
- approved promotion from Current Window Memory

Blocked write triggers:

- unconfirmed raw chat text
- ordinary assistant inference
- Private mode content
- secrets
- raw file contents
- raw command output
- transient work progress
- temporary errors
- Runtime Trace copied directly as memory

### Long-Term Read Rules

Normal non-private windows may read relevant active Long-Term Memory.

Private windows must not read Long-Term Memory.

Retrieval must be:

- relevance-limited
- budget-limited
- filtered by workspace/scope
- filtered by status
- safe against raw secret/file/command content

### Long-Term Delete Rules

Natural-language chat must not directly delete Long-Term Memory.

Examples that must not directly delete memory:

- "forget this"
- "delete that memory"
- "do not remember this anymore"
- "clear project memory"

Those messages may create a memory action proposal only.

Actual deletion requires one of:

- Memory Panel delete action
- explicit command action
- explicit confirmation on a memory action proposal
- approved retention policy for non-memory trace cleanup

Deletion must create a Memory Event when event logging exists.

## Layer 3: Runtime Trace

Runtime Trace records what happened during execution.

It answers: "What evidence explains this run?"

Runtime Trace is not memory context by default.

### Current And Target Storage

| Trace data | Current storage | Target storage | Function |
| --- | --- | --- | --- |
| latest run trace | `sessions.json:lastRunTrace` | `traces.json` | Shows latest run/tool evidence in snapshots and debug views. |
| tool lifecycle events | embedded in latest trace today | `traces.json` | Records pre/post tool behavior and policy evidence. |
| command evidence | embedded in latest trace today | `traces.json` | Stores command, exit code, and safe stdout/stderr previews. |
| approval evidence | embedded in latest trace today | `traces.json` | Records requested approval and decision. |

### Trace Event Kinds

| Event kind | Stores | Starts when | Updates when | Reads when | Deletes when |
| --- | --- | --- | --- | --- | --- |
| `run` | run id, prompt summary, status, provider/model | run starts | run completes/fails | debug/snapshot/test report | retention/window delete |
| `tool_call` | tool name, args summary, call id | tool starts | tool output arrives | debug/audit/archive evidence | retention/window delete |
| `command_result` | command, exit code, stdout/stderr preview | command runs | command completes | verification/debug | retention/window delete |
| `approval` | approval request and decision | risky action requested | user approves/denies | audit/debug | retention/window delete |
| `file_change` | path, operation, evidence summary | file tool mutates | mutation completes/fails | audit/debug | retention/window delete |
| `verification` | test/lint/typecheck command and result summary | verification starts | verification completes | test report/debug | retention/window delete |
| `error` | safe error summary | failure happens | run closes | debug/test report | retention/window delete |

### Trace Read Rules

Runtime Trace may be read by:

- snapshot/debug views
- test reports
- archive generator as evidence
- Memory Controller for safe summaries

Runtime Trace must not be injected as normal Long-Term Memory.

### Trace Delete Rules

Trace is deleted by:

- current-window artifact deletion
- explicit trace clear
- retention policy
- discard without archive

Private trace can exist for current-window debugging, but Private window deletion must remove it and must not archive it.

## Memory Controller

Memory Controller is not a layer.

It owns:

- Long-Term Memory write permission
- `window_archive` generation
- discard-without-archive confirmation
- memory action proposals
- delete confirmation
- Private mode enforcement
- Memory Event logging
- retention policy

The normal assistant may request or propose memory actions but must not directly:

- delete Long-Term Memory
- archive a Private window
- promote raw Current Window Memory
- write secrets or raw files into memory

## Memory Events

Memory Events are audit records, not a layer and not model context.

They should record:

- `eventId`
- timestamp
- actor
- operation
- target memory id
- target layer
- target `record.kind` when relevant
- source evidence summary
- policy decision
- safe before/after summary when useful

Target storage:

```text
memory_events.json
```

## Window End States

### Archive And Delete

This is the default intended path for non-private window close/delete.

Steps:

1. Memory Controller summarizes the Current Window Memory.
2. Unsafe content is excluded.
3. Long-Term Memory receives a `kind: "window_archive"` record.
4. Memory Event records archive creation.
5. Current Window Memory artifacts are deleted or closed.

Future normal windows may read the archive.

Private windows cannot read it.

### Discard Without Archive

This is a destructive path.

Steps:

1. User explicitly confirms discard.
2. No `window_archive` record is written.
3. Current Window Memory artifacts are deleted.
4. Memory Event records discard when available.

Private windows always use discard behavior because they cannot write Long-Term Memory.

## Three-Layer Lifecycle Matrix

| Layer | Starts storing when | Updates when | Can become Long-Term Memory? | Reads allowed | Deletes when |
| --- | --- | --- | --- | --- | --- |
| Current Window Memory | window/session opens | each turn, summary, working/routing updates, policy changes | yes, only through non-private `window_archive` or explicit approved promotion | owning window only | clear, archive/delete, discard |
| Long-Term Memory | remember/confirm/file-detect/window-archive | user edit, new evidence, archive creation, supersession | already long-term | normal non-private windows only | confirmed delete/clear/archive |
| Runtime Trace | run starts | tool/command/approval/file/verification/error events | no, only safe summaries may support archive generation | debug/audit/report/controller only | retention, trace clear, window delete |

## First Implementation Direction

1. Keep exactly three layers in docs, UI, tests, and implementation naming.
2. Implement `kind: "window_archive"` as the first Long-Term Memory path from non-private windows.
3. Split archive/delete and discard-without-archive into separate user actions.
4. Keep natural-language deletion proposal-only.
5. Keep Private mode as a hard Long-Term Memory read/write/archive block.
6. Move trace toward `traces.json`.
7. Add Memory Events for remember, archive, discard, update, and delete.
8. Hide internal working state from user-facing memory UI.
