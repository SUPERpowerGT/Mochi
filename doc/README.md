# Mochi Docs

This folder keeps the project development log and the current product/runtime notes so we can continue building without losing context.

## Files

- `development-log.md`: timeline-style log of what has been built and changed so far.
- `current-architecture.md`: current code structure, runtime boundaries, and major design decisions.
- `current-features-and-usage.md`: what is currently usable, how to run it, and known limits.
- `architecture-design-doc-template.zh.md`: Chinese template for architecture design docs, including boundaries, ownership, lifecycle, storage, rules, invariants, decisions, and examples.
- `local-memory-cache.zh.md`: Chinese target database design for Mochi's local runtime memory cache, including SQLite tables, backend-sync boundaries, invariants, and migration phases.
- `memory-model.md`: English source-of-truth three-layer memory model, including Current Window Memory, Long-Term Memory, Runtime Trace, storage, lifecycle, archive/delete rules, Private mode, and controller boundaries.
- `memory-model.zh.md`: Chinese version of the memory model.
- `current-window-memory.zh.md`: detailed Chinese breakdown of Current Window Memory, including what each current-window data group does, where it is stored, and whether it should remain local or become backend-syncable.
- `memory-v2.md`: implementation plan for the next memory refactor.
- `ultimate-goal.md`: long-term vision, target system layers, and staged evolution path.
- `roadmap.md`: practical staged plan for what should be built next and what should wait.
- `commands-and-capabilities.md`: all current commands and the practical capability each one provides.

## Current Documentation Focus

The docs currently reflect these recent project upgrades:

- the VS Code extension now runs on the JavaScript OpenAI Agents SDK path
- tools are split into workspace, file, and editor groups
- memory documentation now treats the target local database schema as the source of truth for upcoming refactors
- `local-memory-cache.zh.md` defines the target local database model; Markdown is design, SQLite is the intended runtime source of truth, and imports from pre-refactor storage are a migration concern
- the memory model now has exactly three layers: Current Window Memory, Long-Term Memory, and Runtime Trace
- `architecture-design-doc-template.zh.md` defines the structure future architecture docs should follow
- `memory-model.md` and `memory-model.zh.md` now define layer boundaries, Long-Term Memory record kinds, current-window storage details, lifecycle, archive/delete behavior, Private mode restrictions, and Memory Controller boundaries
- `current-window-memory.zh.md` is now structured as an architecture design doc, with goals, non-goals, scope ownership, memory classification, lifecycle, storage, rules, invariants, decisions, and examples
- Memory V2 now tracks the implementation direction for storage, write policy, and memory event logging
- memory snapshots can be opened directly from VS Code
- the chat panel now exposes Private mode as a direct current-window toggle
- the slash menu is intentionally small and no longer tries to duplicate the full tools or memory management surface
- the memory flow now separates conversation turns from work-item routing
- task routing now supports continue, create, and reactivate decisions for work-like turns
- persisted history is slimmer because runtime-only scaffolding is filtered before storage
- work tasks are now committed only after a successful run, which avoids half-created active tasks after failures
- injected scaffold text is cleaned out of stored user history during session reads and writes
- assistant replies now stream progressively in the VS Code chat panel
- the chat UI is now lighter, with a minimal Mochi header, inline thinking state, and simplified approval cards
- prompt instructions now bias more strongly toward directly executing clearly actionable requests

## Reading Order

If you are new to the repo, the most useful order is:

1. `current-features-and-usage.md`
2. `current-architecture.md`
3. `commands-and-capabilities.md`
4. `architecture-design-doc-template.zh.md`
5. `local-memory-cache.zh.md`
6. `memory-model.md`
7. `memory-model.zh.md`
8. `current-window-memory.zh.md`
9. `memory-v2.md`
10. `roadmap.md`
11. `ultimate-goal.md`
12. `development-log.md`

## Update Rule

When Mochi gains a meaningful new capability, update:

1. `development-log.md`
2. `current-architecture.md` if structure or boundaries changed
3. `current-features-and-usage.md` if user-facing behavior changed
4. `commands-and-capabilities.md` if command surface or practical runtime capability changed
5. `memory-model.md` and `memory-model.zh.md` if memory semantics, boundaries, inputs, outputs, lifecycle, archive/delete behavior, or promotion rules changed
6. `memory-v2.md` if implementation policy, storage, or memory refactor tasks changed
7. `roadmap.md` if the next most important work changed
