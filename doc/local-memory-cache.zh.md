# Mochi 本地记忆缓存数据库设计

## 一句话定义

Mochi 的本地记忆缓存是运行时数据的本地数据库，是窗口上下文、长期记忆、运行证据、审计事件和同步队列的本地 source of truth。

Markdown 是设计文档，不是存储。记忆系统的工程本质是数据库表。

## 设计目的

这个文档只定义目标数据模型，用来指导后续重构。

目标不是“描述现在怎么凑合存”，而是定义一个无歧义、可迁移、可同步、可审计的本地数据库模型。

## 核心判断

```text
用户看到的是“记忆”
产品语义是“当前窗口记忆 / 长期记忆 / 运行轨迹”
工程实现是“本地数据库表”
```

最终设计：

```text
SQLite local database = source of truth
Backend sync = optional replication
Vector index = derived index
Markdown docs = design only
```

## 设计原则

- **Local first**：没有后端也能完整运行。
- **Target-first**：文档只定义目标模型，重构前存储不参与概念命名。
- **Typed data**：记忆不是一坨文本，而是带 scope、kind、source、status、policy 的结构化记录。
- **State drives, memory informs**：状态驱动 runtime，记忆提供上下文，二者不能混成一个概念。
- **Strict scope**：所有查询必须带 profile/workspace/window 边界。
- **Private hard boundary**：Private 数据永不上传、永不归档成长期记忆。
- **Trace is evidence**：运行轨迹是证据，不是默认模型上下文。
- **Audit durable changes**：长期记忆写入、更新、删除、归档、跳过都要可审计。
- **Derived indexes are rebuildable**：FTS/向量索引可以删除重建，不是主存储。

## 命名约定

### id 前缀

| 实体 | id 前缀 |
| --- | --- |
| local profile | `prof_` |
| workspace | `wks_` |
| window | `win_` |
| message | `msg_` |
| summary | `sum_` |
| working state | `wrk_` |
| routing state | `rte_` |
| trace | `trc_` |
| trace event | `tev_` |
| long-term memory | `mem_` |
| memory event | `mev_` |
| sync outbox item | `syn_` |

### SQLite 类型

| 语义 | SQLite 类型 | 约定 |
| --- | --- | --- |
| id | `TEXT` | 本地生成，带前缀。 |
| remote id | `TEXT` | 可空，后端同步后才存在。 |
| timestamp | `INTEGER` | Unix epoch milliseconds。 |
| boolean | `INTEGER` | 0/1。 |
| enum | `TEXT` | 用 `CHECK` 约束。 |
| JSON | `TEXT` | JSON 字符串。 |
| content text | `TEXT` | 原文或安全摘要。 |
| soft delete | `deleted_at INTEGER` | 默认软删除。 |

### sync state

```text
local_only
pending
synced
conflict
blocked
```

### 通用持久字段

持久业务表默认包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | 本地 id。 |
| `remote_id` | `TEXT` | 后端 id，可空。 |
| `created_at` | `INTEGER NOT NULL` | 创建时间。 |
| `updated_at` | `INTEGER NOT NULL` | 更新时间。 |
| `deleted_at` | `INTEGER` | 软删除时间。 |
| `sync_state` | `TEXT NOT NULL DEFAULT 'local_only'` | 同步状态。 |
| `sync_version` | `INTEGER NOT NULL DEFAULT 0` | 同步版本。 |

不是所有表都必须完全使用通用字段。例如 `schema_migrations` 和纯 append-only event 表可以更轻。

## Memory 和 State 的数据库边界

本地数据库会保存很多 runtime 数据，但不是所有数据都叫 memory。

| 类别 | 表 | 作用 |
| --- | --- | --- |
| Memory tables | `window_messages`、`window_summaries`、`long_term_memories` | 给模型提供可读上下文，或保存可复用长期事实。 |
| State tables | `window_working_states`、`window_routing_states` | 驱动 runtime 判断下一步怎么继续。 |
| Metadata tables | `local_profiles`、`workspaces`、`windows` | 提供归属、索引、生命周期和恢复边界。 |
| Policy tables | `window_policies` | 决定读写、隔离、归档、同步是否允许。 |
| Evidence tables | `run_traces`、`run_trace_events`、`memory_events` | 解释发生过什么、为什么这么做、谁改了长期记忆。 |
| Sync tables | `sync_outbox` | 复制队列，不是业务记忆。 |

关键规则：

- `window_working_states` 不是 “Task Memory”，而是 window-scoped driver state。
- `window_routing_states` 不是 “Routing Memory”，而是 routing driver state。
- state 可以引用 memory，也可以包含短摘要，但短摘要的用途是驱动系统，不是作为用户可管理记忆。
- 默认 prompt 构建只能把 memory tables 的安全内容当作记忆上下文；state tables 需要经过明确的 runtime adapter 才能变成执行指令或辅助上下文。

## 作用域关系

目标实体关系：

```text
local_profiles
└── workspaces
    └── windows
        ├── window_messages
        ├── window_summaries
        ├── window_working_states
        ├── window_routing_states
        ├── window_policies
        └── run_traces
            └── run_trace_events

local_profiles
└── long_term_memories
    └── memory_events

sync_outbox
```

核心外键：

```text
workspaces.profile_id -> local_profiles.id
windows.profile_id -> local_profiles.id
windows.workspace_id -> workspaces.id
window_messages.window_id -> windows.id
window_summaries.window_id -> windows.id
window_working_states.window_id -> windows.id
window_routing_states.window_id -> windows.id
window_policies.window_id -> windows.id
run_traces.window_id -> windows.id
run_trace_events.trace_id -> run_traces.id
long_term_memories.profile_id -> local_profiles.id
long_term_memories.workspace_id -> workspaces.id nullable
long_term_memories.source_window_id -> windows.id nullable
memory_events.memory_id -> long_term_memories.id nullable
memory_events.window_id -> windows.id nullable
```

## Schema V1

### `schema_migrations`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `version` | `INTEGER` | primary key | migration 版本。 |
| `name` | `TEXT` | not null | migration 名称。 |
| `applied_at` | `INTEGER` | not null | 应用时间。 |

### `local_profiles`

本地 profile。未登录也必须有一个 profile，所以不直接叫 `users`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `prof_...`。 |
| `remote_id` | `TEXT` | nullable unique | 后端用户 id。 |
| `display_name` | `TEXT` | nullable | 本地显示名。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |
| `sync_state` | `TEXT` | not null default `local_only` | 同步状态。 |
| `sync_version` | `INTEGER` | not null default 0 | 同步版本。 |

索引：

- unique: `remote_id`
- index: `updated_at`

### `workspaces`

workspace 是项目作用域，不直接等于本地路径。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `wks_...`。 |
| `profile_id` | `TEXT` | not null references `local_profiles(id)` | 所属 profile。 |
| `remote_id` | `TEXT` | nullable | 后端 workspace id。 |
| `local_fingerprint` | `TEXT` | not null | 本地 workspace 指纹。 |
| `display_name` | `TEXT` | not null default `''` | 安全显示名。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |
| `sync_state` | `TEXT` | not null default `local_only` | 同步状态。 |
| `sync_version` | `INTEGER` | not null default 0 | 同步版本。 |

约束和索引：

- unique: `(profile_id, local_fingerprint)`
- unique: `(profile_id, remote_id)` where `remote_id is not null`
- index: `(profile_id, updated_at)`

### `windows`

window 是 Mochi 对话窗口，是当前窗口数据的父实体。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `win_...`。 |
| `profile_id` | `TEXT` | not null references `local_profiles(id)` | 所属 profile。 |
| `workspace_id` | `TEXT` | not null references `workspaces(id)` | 所属 workspace。 |
| `remote_id` | `TEXT` | nullable | 后端 window id。 |
| `title` | `TEXT` | not null default `''` | 窗口标题。 |
| `status` | `TEXT` | not null | open/closed/archived/deleted。 |
| `is_private` | `INTEGER` | not null default 0 | 是否 Private。 |
| `opened_at` | `INTEGER` | not null | 打开时间。 |
| `closed_at` | `INTEGER` | nullable | 关闭时间。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |
| `sync_state` | `TEXT` | not null default `local_only` | 同步状态。 |
| `sync_version` | `INTEGER` | not null default 0 | 同步版本。 |

约束和索引：

- `status in ('open','closed','archived','deleted')`
- `is_private in (0,1)`
- index: `(workspace_id, status, updated_at)`
- index: `(profile_id, updated_at)`
- unique: `(profile_id, remote_id)` where `remote_id is not null`

### `window_messages`

窗口消息，也就是 `chat_history`。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `msg_...`。 |
| `window_id` | `TEXT` | not null references `windows(id)` | 所属窗口。 |
| `role` | `TEXT` | not null | user/assistant/system/tool。 |
| `content_text` | `TEXT` | not null default `''` | 文本内容。 |
| `content_json` | `TEXT` | nullable | 多模态或结构化内容。 |
| `sequence` | `INTEGER` | not null | 窗口内递增顺序。 |
| `token_estimate` | `INTEGER` | nullable | token 估算。 |
| `is_visible` | `INTEGER` | not null default 1 | 是否在 UI 显示。 |
| `is_private` | `INTEGER` | not null default 0 | 是否来自 Private 窗口。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |
| `sync_state` | `TEXT` | not null default `local_only` | 同步状态。 |

约束和索引：

- unique: `(window_id, sequence)`
- `role in ('user','assistant','system','tool')`
- `is_visible in (0,1)`
- `is_private in (0,1)`
- index: `(window_id, sequence)`
- index: `(window_id, created_at)`
- index: `(sync_state, created_at)`

规则：

- Private message 永不上传。
- 原始命令输出和原始 tool output 不进入这里。

### `window_summaries`

窗口摘要。它是当前窗口记忆，不是长期记忆。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `sum_...`。 |
| `window_id` | `TEXT` | not null references `windows(id)` | 所属窗口。 |
| `summary_text` | `TEXT` | not null | 摘要文本。 |
| `summary_kind` | `TEXT` | not null | rolling/final/archive_candidate。 |
| `source_from_sequence` | `INTEGER` | nullable | 来源消息起点。 |
| `source_to_sequence` | `INTEGER` | nullable | 来源消息终点。 |
| `compaction_json` | `TEXT` | nullable | 压缩元数据。 |
| `model` | `TEXT` | nullable | 生成摘要的模型。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |
| `sync_state` | `TEXT` | not null default `local_only` | 同步状态。 |

约束和索引：

- `summary_kind in ('rolling','final','archive_candidate')`
- index: `(window_id, summary_kind, updated_at)`

### `window_working_states`

当前窗口工作驱动状态。它不是 Task Memory，也不是 memory content。

它可以包含 `summary_text`、`last_outcome_text` 这类短文本，但这些字段的用途是让 runtime 延续当前工作，不是让用户把它当作长期或当前窗口记忆来管理。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `wrk_...`。 |
| `window_id` | `TEXT` | not null references `windows(id)` | 所属窗口。 |
| `workspace_id` | `TEXT` | not null references `workspaces(id)` | 所属 workspace。 |
| `status` | `TEXT` | not null | active/inactive/archived/deleted。 |
| `title` | `TEXT` | not null default `''` | 短标题。 |
| `goal_text` | `TEXT` | not null default `''` | 当前目标。 |
| `summary_text` | `TEXT` | not null default `''` | 工作摘要。 |
| `last_outcome_text` | `TEXT` | not null default `''` | 最近结果。 |
| `last_user_prompt` | `TEXT` | not null default `''` | 最近工作型用户输入。 |
| `latest_assistant_reply` | `TEXT` | not null default `''` | 最近 assistant 回复摘要。 |
| `turn_count` | `INTEGER` | not null default 0 | 相关 turn 数。 |
| `related_files_json` | `TEXT` | nullable | 相关文件路径数组，不存原始文件内容。 |
| `notes_json` | `TEXT` | nullable | 内部 notes。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |
| `ended_at` | `INTEGER` | nullable | 结束时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |
| `sync_state` | `TEXT` | not null default `local_only` | 同步状态。 |

约束和索引：

- `status in ('active','inactive','archived','deleted')`
- index: `(window_id, status, updated_at)`
- index: `(workspace_id, updated_at)`

规则：

- 只在 run 成功完成后 commit。
- 失败或中断 run 不留下 active 半成品。
- 默认不作为 memory context 注入模型。

### `window_routing_states`

runtime 接续判断。它是 routing driver state，不是用户内容记忆。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `rte_...`。 |
| `window_id` | `TEXT` | not null references `windows(id)` | 所属窗口。 |
| `working_state_id` | `TEXT` | nullable references `window_working_states(id)` | 关联工作状态。 |
| `turn_kind` | `TEXT` | not null | conversation/work/unknown。 |
| `route_action` | `TEXT` | not null | none/continue/create/reactivate。 |
| `route_reason` | `TEXT` | not null default `''` | routing 原因。 |
| `score` | `REAL` | nullable | routing score。 |
| `diagnostics_json` | `TEXT` | nullable | 诊断数据。 |
| `evaluated_at` | `INTEGER` | not null | 评估时间。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |

约束和索引：

- `turn_kind in ('conversation','work','unknown')`
- `route_action in ('none','continue','create','reactivate')`
- index: `(window_id, evaluated_at)`
- index: `(working_state_id, evaluated_at)`

### `window_policies`

当前窗口策略。Private mode 的边界在这里。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `window_id` | `TEXT` | primary key references `windows(id)` | 所属窗口。 |
| `private_window` | `INTEGER` | not null default 0 | 是否 Private。 |
| `disable_long_term_memory_reads` | `INTEGER` | not null default 0 | 禁止读取长期记忆。 |
| `disable_cross_window_reads` | `INTEGER` | not null default 0 | 禁止读取其他窗口。 |
| `disable_current_window_memory_reads` | `INTEGER` | not null default 0 | 禁止读取当前窗口 messages/summaries。 |
| `disable_long_term_memory_writes` | `INTEGER` | not null default 0 | 禁止写长期记忆。 |
| `disable_archive_on_close` | `INTEGER` | not null default 0 | 关闭时不归档。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |

Private 默认：

```text
private_window = 1
disable_long_term_memory_reads = 1
disable_cross_window_reads = 1
disable_current_window_memory_reads = 0
disable_long_term_memory_writes = 1
disable_archive_on_close = 1
```

### `run_traces`

run 级别证据。Trace 不是记忆。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `trc_...`。 |
| `window_id` | `TEXT` | not null references `windows(id)` | 所属窗口。 |
| `run_id` | `TEXT` | not null | runtime run id。 |
| `provider` | `TEXT` | nullable | openai/gemini/local 等。 |
| `model` | `TEXT` | nullable | 模型名。 |
| `status` | `TEXT` | not null | running/succeeded/failed/cancelled。 |
| `summary_text` | `TEXT` | not null default `''` | 安全摘要。 |
| `started_at` | `INTEGER` | not null | 开始时间。 |
| `finished_at` | `INTEGER` | nullable | 结束时间。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |

约束和索引：

- unique: `(window_id, run_id)`
- `status in ('running','succeeded','failed','cancelled')`
- index: `(window_id, started_at)`
- index: `(status, started_at)`

### `run_trace_events`

trace 事件明细。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `tev_...`。 |
| `trace_id` | `TEXT` | not null references `run_traces(id)` | 所属 trace。 |
| `event_kind` | `TEXT` | not null | tool_call/command_result/approval/file_change/error/verification/run_state。 |
| `sequence` | `INTEGER` | not null | trace 内顺序。 |
| `summary_text` | `TEXT` | not null default `''` | 安全摘要。 |
| `payload_json` | `TEXT` | nullable | 结构化安全 payload。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |

约束和索引：

- unique: `(trace_id, sequence)`
- `event_kind in ('tool_call','command_result','approval','file_change','error','verification','run_state')`
- index: `(trace_id, sequence)`
- index: `(event_kind, created_at)`

### `long_term_memories`

长期记忆。它是一张表，不是很多层。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `mem_...`。 |
| `profile_id` | `TEXT` | not null references `local_profiles(id)` | 所属 profile。 |
| `workspace_id` | `TEXT` | nullable references `workspaces(id)` | workspace scope，可空。 |
| `source_window_id` | `TEXT` | nullable references `windows(id)` | 来源窗口，可空。 |
| `kind` | `TEXT` | not null | user_preference/project_fact/project_convention/decision/window_archive。 |
| `scope` | `TEXT` | not null | user/workspace/global。 |
| `status` | `TEXT` | not null | active/archived/deleted/proposed。 |
| `title` | `TEXT` | not null default `''` | 标题。 |
| `text` | `TEXT` | not null default `''` | 安全文本。 |
| `content_json` | `TEXT` | nullable | 结构化内容。 |
| `source` | `TEXT` | not null | explicit_user/file_detected/window_archive/approved_promotion。 |
| `confidence` | `TEXT` | not null | confirmed/detected/proposed。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |
| `deleted_at` | `INTEGER` | nullable | 删除时间。 |
| `sync_state` | `TEXT` | not null default `local_only` | 同步状态。 |
| `sync_version` | `INTEGER` | not null default 0 | 同步版本。 |

约束和索引：

- `kind in ('user_preference','project_fact','project_convention','decision','window_archive')`
- `scope in ('user','workspace','global')`
- `status in ('active','archived','deleted','proposed')`
- `confidence in ('confirmed','detected','proposed')`
- index: `(profile_id, scope, status, updated_at)`
- index: `(workspace_id, kind, status, updated_at)`
- index: `(source_window_id)`
- index: `(sync_state, updated_at)`

### `memory_events`

审计表。长期记忆变化必须可解释。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `mev_...`。 |
| `profile_id` | `TEXT` | not null references `local_profiles(id)` | 操作 profile。 |
| `memory_id` | `TEXT` | nullable references `long_term_memories(id)` | 目标 memory。 |
| `window_id` | `TEXT` | nullable references `windows(id)` | 来源窗口。 |
| `operation` | `TEXT` | not null | remember/archive/update/delete/discard/skip/propose。 |
| `actor` | `TEXT` | not null | user/system/memory_controller。 |
| `reason_text` | `TEXT` | not null default `''` | 原因。 |
| `policy_decision` | `TEXT` | not null default `''` | 策略判断。 |
| `safe_before_json` | `TEXT` | nullable | 安全 before 摘要。 |
| `safe_after_json` | `TEXT` | nullable | 安全 after 摘要。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |

约束和索引：

- `operation in ('remember','archive','update','delete','discard','skip','propose')`
- `actor in ('user','system','memory_controller')`
- index: `(memory_id, created_at)`
- index: `(window_id, created_at)`
- index: `(operation, created_at)`

### `sync_outbox`

可选同步队列表。先有本地数据库，再有同步。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `TEXT` | primary key | `syn_...`。 |
| `table_name` | `TEXT` | not null | 来源表。 |
| `record_id` | `TEXT` | not null | 来源记录。 |
| `operation` | `TEXT` | not null | upsert/delete。 |
| `payload_json` | `TEXT` | not null | 安全同步 payload。 |
| `status` | `TEXT` | not null | pending/sent/failed/blocked。 |
| `attempt_count` | `INTEGER` | not null default 0 | 尝试次数。 |
| `last_error` | `TEXT` | nullable | 最近错误。 |
| `created_at` | `INTEGER` | not null | 创建时间。 |
| `updated_at` | `INTEGER` | not null | 更新时间。 |

约束和索引：

- `operation in ('upsert','delete')`
- `status in ('pending','sent','failed','blocked')`
- index: `(status, updated_at)`
- index: `(table_name, record_id)`

## 派生索引

### FTS

SQLite FTS 可以作为第一阶段文本搜索索引。

候选来源：

- `window_messages.content_text`
- `window_summaries.summary_text`
- `long_term_memories.text`

FTS 是派生索引，可重建。

注意：`window_working_states.summary_text` 默认不进入 FTS memory index。如果未来需要搜索 working state，应该建单独的 state/debug index，而不是混入 memory index。

### Vector Index

向量索引用于语义检索。

候选来源：

- `long_term_memories`
- `window_summaries`
- `long_term_memories(kind='window_archive')`

向量索引不是 source of truth。

## 本地缓存接口

业务代码应该依赖语义化 store，而不是文件名。

目标接口：

```text
LocalMemoryStore
├── profiles
├── workspaces
├── windows
├── windowMessages
├── windowSummaries
├── windowWorkingStates
├── windowRoutingStates
├── windowPolicies
├── runTraces
├── runTraceEvents
├── longTermMemories
├── memoryEvents
└── syncOutbox
```

## 重构路线

### Phase 1：实现目标接口

- 定义 `LocalMemoryStore`。
- 定义所有 repository 接口。
- 业务层只依赖目标接口。

### Phase 2：实现 SQLite 存储

- 建立 Schema V1。
- 增加 migration。
- 增加索引。
- 增加事务边界。

### Phase 3：导入重构前本地数据

- 写一次性 import。
- import 只负责把重构前数据灌入目标表。
- import 不影响目标 schema 命名。

### Phase 4：切换运行时

- MemoryManager 改为使用 `LocalMemoryStore`。
- Snapshot 和 Memory Controls 从目标表读取。
- 保留 debug export。

### Phase 5：增加派生索引和同步

- 增加 FTS 或向量索引。
- 增加 `sync_outbox` 处理器。
- 所有同步动作经过隐私策略过滤。

## 不变量

- Markdown 文档不是存储。
- 本地数据库是运行时 source of truth。
- 目标 schema 不围绕重构前实现命名。
- 后端同步是可选复制，不是本地运行前提。
- 向量索引是派生索引，不是 source of truth。
- Private 数据永不上传。
- Runtime Trace 默认不进入模型上下文。
- State tables 不是 memory tables。
- `window_working_states`、`window_routing_states`、`window_policies` 默认不能作为 memory content 注入模型。
- 原始文件内容和原始命令输出不进入长期记忆。
- 所有长期记忆写入最终都应该可审计。
- 所有可同步记录必须有 sync state。
- 所有跨 scope 查询必须带 profile/workspace/window 边界。

## 开放问题

- SQLite 依赖使用哪一个 Node package？
- 是否启用 SQLite FTS5 作为第一阶段文本搜索？
- `local_profiles` 在 UI 里是否显示为 user，还是完全隐藏？
- `window_messages` 是否允许用户开启原文同步，还是默认只同步 summary/archive？
- `window_working_states` 是否同步，还是只通过 `window_archive` 跨设备可见？
