# Roadmap

## Purpose

This roadmap translates the long-term Mochi vision into practical development stages.

It is meant to answer:

- what should be built next
- what should wait
- how current work contributes to the long-term platform

## Current Stage

Mochi is currently in the transition from:

- a strong local coder prototype
to
- a more structured local runtime foundation

Already in place:

- VS Code chat surface
- OpenAI Agents SDK runtime
- workspace tools
- layered memory foundation
- session turn classification before work-item routing
- project-level instruction file loading
- initial multi-agent structure
- project documentation and development log
- direct current-window Private mode toggle
- memory model documents for the exact three layers, Long-Term Memory record kinds, storage, lifecycle, archive/delete behavior, Private mode, and Memory Controller boundaries
- Memory V2 implementation plan for storage, write policy, and event logging

## Stage A: Stabilize The Local Runtime

### Goal

Make the current local runtime solid, predictable, and easy to extend.

### Priorities

- stabilize current runtime behavior
- reduce ambiguity between extension, runtime, and reference paths
- improve confidence in memory reads and writes
- make tools safer and more modular
- strengthen Mochi identity and role boundaries

### Likely Work

- split workspace tools and editor tools more clearly
- add better memory inspection or debug output
- improve internal working-state structure
- tighten tool return conventions
- reduce accidental prompt drift
- clarify which generic runtime/session pieces should use official OpenAI SDK abstractions and which should remain Mochi-owned

Progress so far:

- tool modularity improved
- memory snapshot inspection added
- task routing moved toward router / policy / store separation
- runtime and product-layer ownership is now more clearly documented
- task routing diagnostics are now inspectable in memory snapshots
- non-work turns no longer automatically create task candidates
- repo-level instruction files are now part of runtime context
- destructive file operations now have an explicit confirmation guard
- shared input budgeting and lightweight rate-limit retry are now in place
- task routing now commits only after a successful run, which avoids half-created active tasks on failure
- legacy stored history is now gradually normalized as sessions are read and rewritten
- streamed replies and lightweight runtime activity are now visible in the chat UI
- the chat surface is now cleaner and less debug-like
- prompt behavior now leans more strongly toward direct execution for clearly actionable requests
- lightweight command evidence and verification summaries now exist in run traces
- runtime tools now have a lightweight lifecycle wrapper for pre-tool, post-tool, run-stop, and policy evidence
- memory snapshots now expose a compact trace summary that can become the data model for a Tracy-style run inspector
- the main OpenAI runtime orchestrator has been slimmed by extracting run input building, stream event mapping, and run trace recording
- repeated approval branching in file and command tools has been consolidated into a shared helper, preparing the codebase for a broader policy gate
- persisted history and inactive task storage now have lightweight retention, reducing raw memory growth during long local sessions
- task state now has a session-level active-task invariant, which prevents stale active tasks from accumulating in snapshots
- chat sessions can now be created from the UI and rehydrated when the webview opens
- working-state summaries now provide continuity without pulling full raw history into the current run
- task identity is now independent from session identity, allowing a new session to continue a relevant workspace task
- rolling session compaction now preserves older context as local summaries while keeping recent raw history available
- Private mode now blocks persistent memory reads and cross-session recall for the current window
- current-window artifact deletion can remove the current session and linked task artifacts without touching other sessions
- the slash menu has been reduced to a small shortcut surface instead of a full tools panel
- the memory model is now specified in `memory-model.md`
- Memory V2 implementation work is tracked in `memory-v2.md`

### Exit Criteria

- runtime is easy to extend without large refactors
- memory is understandable and inspectable
- conversation turns and work-item turns are clearly separated
- the extension path is clearly the main path

## Stage B: Memory V2 Implementation

### Goal

Turn the current memory foundation into an explicit, inspectable memory system.

### Priorities

- define when each of the three memory layers is written
- define what can become long-term memory
- keep the product model strict: Current Window Memory, Long-Term Memory, and Runtime Trace
- keep Private mode as a hard read/write boundary
- add memory event logging
- make task-like state internal working state rather than user-facing memory
- make trace/debug state distinct from long-term knowledge
- make memory management visible and testable

### Likely Work

- add `memory_events.json` and `MemoryEventStore`
- add a `MemoryCommit` decision after each completed run
- split trace/debug artifacts toward `traces.json`
- add explicit remember/forget flows
- implement non-private window archive/delete as the first Current Window Memory to Long-Term Memory path, producing `kind: "window_archive"`
- keep discard-without-archive as a separate confirmed destructive action
- ensure natural-language delete requests create proposals only, never direct deletion
- replace Memory Controls QuickPick with a category-based management panel
- add closed-loop integration tests for current-window memory, long-term memory, trace/debug state, and explicit memory
- add stricter write-side policy checks for Private mode

### Exit Criteria

- every durable memory write has an owner layer, `record.kind`, and event log entry
- Private mode cannot accidentally read or write durable memory
- Current Window Memory, Long-Term Memory record kinds, and Runtime Trace have write/read/archive/delete integration coverage where applicable
- users can inspect why Mochi remembered something

## Stage C: Multi-Agent V1

### Goal

Move from a mostly single-assistant flow into a role-based local multi-agent system.

### Priorities

- introduce clearer role separation
- route different user requests to more specialized agents
- connect memory slices to those agents
- use internal working state as a coordination layer without exposing it as user-facing memory

### Candidate Agent Roles

- `root_agent`
- `repo_guide_agent`
- `coding_agent`
- `review_agent`

Optional later role:

- `planner_agent`

### Likely Work

- add `review_agent`
- define what memory each agent reads
- introduce a memory selector so current-window summaries, working state, and long-term memory are not injected as one undifferentiated blob
- refine handoff behavior
- make task state more useful for multi-step work
- let different agent roles consume different memory slices

### Exit Criteria

- agent roles feel meaningfully different
- root agent can route work reliably
- memory is no longer treated as one shared blob

## Stage C2: Memory Maintenance

### Goal

Improve long-term memory quality without making the main chat loop heavy.

### Priorities

- keep local memory bounded
- preserve final decisions and current state better than raw transcript snippets
- avoid duplicating session summaries, internal working state, and long-term memory
- keep maintenance work invisible to the user unless debugging is requested

### Likely Work

- add a memory selector that chooses which memory sections to inject for the current prompt
- introduce a low-permission maintenance compactor that outputs structured JSON memory patches
- include timestamps, source session ids, source task ids, and source run ids in memory patches
- track superseded facts and decisions so old conclusions do not override newer ones
- use the current local extractive compactor as a fallback when LLM-based maintenance fails or is disabled
- expose compaction method, model, timestamp, and errors in memory snapshots

### Exit Criteria

- old session context survives as durable, deduplicated memory rather than raw chat log fragments
- task and session summaries are complementary instead of repetitive
- memory maintenance can fail safely without blocking the user-facing run

## Stage D: Structured Task Execution

### Goal

Let Mochi track and manage tasks instead of only answering messages.

### Priorities

- task lifecycle tracking
- explicit task state
- resumable local task flow
- better run transparency

### Likely Work

- richer task data model
- progress tracking
- task summaries
- retry / resume hooks
- better alignment between internal working state and runtime behavior
- richer task routing signals beyond prompt overlap
- task routing observability with explicit reasons and scores

### Exit Criteria

- Mochi can maintain structured progress across multiple turns
- tasks are first-class runtime objects rather than inferred from chat alone

## Stage E: Durable Local Orchestration

### Goal

Introduce stronger orchestration patterns without yet going distributed.

### Priorities

- durable local state
- resumable workflows
- approval and checkpoint patterns
- better debugging and replay

### Likely Work

- checkpoint model for tasks
- approval hooks for risky actions
- richer execution logs
- event-based runtime records

### Exit Criteria

- long or multi-step local workflows are reliable
- interrupted work can be resumed more safely

## Stage F: Remote And Distributed Execution

### Goal

Expand Mochi beyond a local-only runtime.

### Priorities

- remote worker contracts
- queued execution
- lease and timeout semantics
- failure recovery
- distributed task coordination

### Likely Work

- worker API or protocol
- task queue
- persistent run registry
- distributed scheduling logic

### Exit Criteria

- tasks can safely move beyond a single local process
- orchestration is no longer tied only to the VS Code extension process

## Stage F: Control Plane

### Goal

Support observability, management, and governance for a larger Mochi system.

### Priorities

- visibility
- policy
- permissions
- replay
- management UX

### Likely Work

- run inspection
- audit trail
- policy controls
- project and workspace registry

### Exit Criteria

- Mochi can be operated as a managed system, not only as a local development tool

## What Not To Rush

The following should not be forced too early:

- distributed workers
- overly complex orchestration graphs
- RAG for everything
- a heavy always-on maintenance agent
- platform-style control plane work
- premature infrastructure without clear product pull

## Practical Next Steps

The most sensible immediate next steps are:

1. add a memory selector to reduce repeated current-window/long-term memory injection
2. improve task title normalization and reduce fragmentation for short action prompts
3. improve token-aware work-item and context budgeting beyond character-level trimming
4. evolve destructive approval from file-focused in-chat cards to a broader approval framework
5. design the maintenance compactor agent as a low-permission, structured JSON patch producer

## Guiding Principle

Mochi should earn each new system layer.

That means:

- do not build distributed execution before local orchestration is strong
- do not build orchestration before runtime and memory are reliable
- do not build platform controls before the product and runtime justify them

The roadmap should stay ambitious, but the implementation order should remain disciplined.
