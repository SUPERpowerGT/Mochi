# Mochi 当前窗口记忆架构设计

## 一句话定义

当前窗口记忆是一个 Mochi 对话窗口为了继续当前对话所保留的短生命周期上下文。

工程实现上，当前窗口下面会挂很多本地数据库表，但不是所有表都是记忆。当前窗口数据需要拆成 memory、state、metadata、policy 和 evidence。

## 目标

- 定义当前窗口有哪些数据类型。
- 定义每种数据类型的用途和边界。
- 定义这些数据类型对应的目标数据库表。
- 明确哪些是当前窗口记忆内容，哪些只是状态、元数据或证据。
- 明确 state 是运行驱动，不是记忆内容。
- 明确 Private mode 下当前窗口记忆的读写边界。
- 为后续本地数据库重构提供唯一目标模型。

## 非目标

- 不设计完整长期记忆系统。
- 不设计完整账号系统。
- 不设计后端同步协议。
- 不设计 Runtime Trace 的完整事件 schema。
- 不让重构前存储结构影响当前窗口记忆命名。

## 这不是什么

当前窗口记忆不是：

- 长期记忆
- 用户账号
- 项目记忆
- 后端同步对象
- Runtime Trace
- Memory Controller
- Task Memory
- Markdown 存储

## 作用域和归属

产品讨论可以说：

```text
userId
└── workspaceId
    └── windowId
```

数据库实现建议是：

```text
local_profiles
└── workspaces
    └── windows
```

原因：

- 未登录用户也需要本地 profile，所以表名用 `local_profiles` 比 `users` 更准确。
- `workspaceId` 是项目作用域，不等于本地路径。
- `windowId` 是对话窗口作用域，不应该混入 workspace 或 session 概念。

这三个 id 是归属和索引，不是记忆内容。

## Memory 和 State 的边界

这是当前窗口设计里最重要的边界：

```text
Memory informs.
State drives.
Evidence explains.
Metadata scopes.
Policy gates.
```

换成工程问题：

| 类别 | 回答的问题 | 默认能否作为模型记忆上下文 | 例子 |
| --- | --- | --- | --- |
| Memory | 模型为了继续对话需要知道什么？ | 是 | `chat_history`、`window_summary` |
| State | runtime 下一步应该怎么驱动？ | 否 | `working_state`、`routing_state` |
| Metadata | 这份数据属于谁、哪个 workspace、哪个 window？ | 否 | `window_identity` |
| Policy | 这次读写是否被允许？ | 否 | `policy_state` |
| Evidence | 为什么系统这么做、发生过什么？ | 否 | `trace_ref` |

`working_state` 很容易被误叫成“工作记忆”，但它本质上是 driver state：它让 runtime 知道当前工作目标、状态、最近结果和下一步接续方式。它可以包含摘要文本，但这份摘要的用途是驱动执行，不是作为用户意义上的记忆内容。

## 当前窗口数据类型

当前窗口下有 7 个数据类型。

| 数据类型 | 类型分类 | 对应目标表 | 是不是记忆内容 | 用途 |
| --- | --- | --- | --- | --- |
| `window_identity` | 身份元数据 | `windows` | 否 | 标识窗口、workspace、profile、状态和标题。 |
| `chat_history` | 内容记忆 | `window_messages` | 是 | 保存当前窗口可见对话。 |
| `window_summary` | 内容记忆 | `window_summaries` | 是 | 压缩较早上下文，让长窗口继续。 |
| `working_state` | 工作驱动状态 | `window_working_states` | 否 | 保存 runtime 当前正在推进什么。 |
| `routing_state` | 路由驱动状态 | `window_routing_states` | 否 | 帮 runtime 判断下一轮如何接续。 |
| `policy_state` | 策略状态 | `window_policies` | 否 | 控制 Private、跨窗口读取、长期记忆读写。 |
| `trace_ref` | 运行证据引用 | `run_traces` | 否 | 关联运行证据，用于 debug/report/archive evidence。 |

真正的当前窗口记忆内容只有：

```text
chat_history
window_summary
```

其他数据类型虽然挂在 window 下，但不是用户意义上的“记忆内容”。

## 数据库视角

目标表关系：

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
```

设计结论：

```text
当前窗口不是一个字段。
当前窗口是 windows 下的一组 typed tables。
其中只有 memory tables 才是当前窗口记忆内容。
```

## 数据类型分类

### 内容记忆

内容记忆默认可以进入当前窗口模型上下文。

| 数据类型 | 表 | 用途 |
| --- | --- | --- |
| `chat_history` | `window_messages` | 保存当前窗口可见对话，让 assistant 能接着聊。 |
| `window_summary` | `window_summaries` | 压缩窗口旧上下文，让长会话继续。 |

### 驱动状态

驱动状态帮助 runtime 决定下一步怎么跑。它不是记忆内容，默认不作为“记忆”注入模型上下文。

| 数据类型 | 表 | 用途 |
| --- | --- | --- |
| `working_state` | `window_working_states` | 保存目标、状态、结果、摘要、相关文件路径，用来继续当前工作。 |
| `routing_state` | `window_routing_states` | 判断下一轮是普通对话、继续工作、创建新工作，还是重新激活旧工作。 |

### 身份元数据和策略状态

身份元数据用于归属、恢复和清理。策略状态用于权限判断和隔离。

| 数据类型 | 表 | 用途 |
| --- | --- | --- |
| `window_identity` | `windows` | 标识窗口、标题、状态、归属和打开/关闭时间。 |
| `policy_state` | `window_policies` | 控制 Private、长期记忆读取、跨窗口读取和归档。 |

### 运行证据

运行证据属于 Runtime Trace，不属于当前窗口记忆内容。

| 数据类型 | 表 | 用途 |
| --- | --- | --- |
| `trace_ref` | `run_traces` | 关联工具、命令、approval、错误和验证证据。 |

## 目标表职责

### `windows`

职责：

- 保存 window 身份。
- 保存 window 所属 profile/workspace。
- 保存 window 标题和状态。
- 保存 Private 标记。

它不是记忆内容，但它是当前窗口所有数据的父实体。

### `window_messages`

职责：

- 保存用户和 assistant 的可见对话。
- 保留窗口内顺序。
- 支持 UI 恢复和 prompt 构建。

边界：

- Private message 永不上传。
- 原始命令输出不进入这里。
- 它不自动变成长期记忆。

### `window_summaries`

职责：

- 保存 rolling/final/archive_candidate 摘要。
- 压缩较早上下文。
- 为归档生成安全输入。

边界：

- summary 仍然是当前窗口记忆。
- 只有 Memory Controller 创建 `long_term_memories(kind='window_archive')` 后，才进入长期记忆。

### `window_working_states`

职责：

- 保存 runtime 当前正在推进什么。
- 保存当前目标、状态、最近结果。
- 保存摘要级相关文件路径。
- 让短 follow-up 继续同一个工作。

边界：

- 它是 driver state，不是 memory content。
- 不是 Task Memory。
- 不保存原始文件内容。
- 不直接写入长期记忆。
- 只在 run 成功完成后 commit。

### `window_routing_states`

职责：

- 保存 runtime 的接续判断。
- 解释为什么继续、创建或重新激活某个 working state。

边界：

- 不是用户内容记忆。
- 不进入长期记忆。
- 通常不需要后端同步。

### `window_policies`

职责：

- 控制当前窗口是否 Private。
- 控制是否读取长期记忆。
- 控制是否读取其他窗口。
- 控制关闭时是否归档。

Private 目标策略：

```text
private_window = 1
disable_long_term_memory_reads = 1
disable_cross_window_reads = 1
disable_current_window_memory_reads = 0
disable_long_term_memory_writes = 1
disable_archive_on_close = 1
```

关键点：

```text
Private 可以读写自己的当前窗口记忆和当前窗口状态。
Private 不能读长期记忆。
Private 不能读其他窗口。
Private 不能写长期记忆。
Private 不能归档。
```

### `run_traces`

职责：

- 保存 run 级别证据。
- 支持 debug/report。
- 给归档生成器提供证据。

边界：

- Trace 不是记忆。
- Trace 默认不进入模型上下文。
- Private trace 永不上传。

## 生命周期

| 数据类型 | 创建 | 读取 | 更新 | 删除 | 归档 |
| --- | --- | --- | --- | --- | --- |
| `window_identity` | 打开窗口 | 任何窗口操作 | 标题/状态变化 | 删除窗口 | 不作为记忆归档 |
| `chat_history` | 用户/assistant 发消息 | 当前窗口 prompt/UI | 每轮对话 | 删除窗口或清空消息 | 可作为 archive 输入 |
| `window_summary` | 触发压缩 | 当前窗口 prompt | compaction/maintenance | 删除窗口或清空摘要 | 可作为 archive 输入 |
| `working_state` | work-like flow 成功 commit | runtime 继续当前工作 | 成功 run 后 | 删除窗口或清空工作状态 | 可作为 archive 生成证据，不直接归档 |
| `routing_state` | route 判断 | 下一轮 runtime | 每次 route | 清理 routing | 不直接归档 |
| `policy_state` | 创建窗口或切换策略 | 每次读写前 | 用户切换策略 | 删除窗口 | 不归档 |
| `trace_ref` | run 产生 trace | debug/report/evidence | run events | trace retention | 只作为证据 |

## 本地和后端边界

默认只本地：

- `window_messages`
- `window_summaries`
- `window_working_states`
- `window_routing_states`
- `window_policies`
- `run_traces`

可选同步：

- `windows`
- `window_summaries`
- `long_term_memories(kind='window_archive')`
- 用户明确开启后的 `window_messages`

永不上传：

- Private window data
- Private trace
- secrets
- 原始命令输出
- 原始文件内容

## 读写规则

### 读取

- window 可以读取自己的 messages、summaries 作为当前窗口记忆。
- runtime 可以读取自己的 working/routing state 辅助下一轮。
- window 可以读取自己的 trace 用于 debug/report。
- 普通 window 不能直接读取其他活动 window 的原始数据。
- 普通 window 只能读取其他窗口归档后的 `window_archive`。
- Private window 不能读取长期记忆或其他窗口。

### 写入

- messages 在用户/assistant 产生消息时写入。
- summaries 在 compaction/maintenance 时写入。
- working states 只在 run 成功完成后写入，作为 driver state。
- routing states 在 route 决策时写入。
- policies 只由用户动作或系统策略写入。
- traces 由 runtime events 写入。

## 不变量

- `local_profiles -> workspaces -> windows` 是归属链，不是记忆层。
- 当前窗口真正的记忆内容只有 `chat_history`、`window_summary`。
- `working_state` 是工作驱动状态，不是记忆内容。
- `routing_state` 是路由驱动状态，不是记忆内容。
- `window_identity` 是身份元数据。
- `policy_state` 是策略状态。
- `trace_ref` 属于 Runtime Trace。
- `working_state` 不是 Task Memory。
- 当前窗口内容必须经过 Memory Controller 生成安全摘要后，才可以进入长期记忆。
- Private window 永不写长期记忆、永不归档、永不上传。

## 决策记录

### 决策 1：当前窗口按表设计

当前窗口不是一个大 JSON 对象，而是 `windows` 下的一组 typed tables。

原因：

- 数据生命周期不同。
- 读写规则不同。
- 同步规则不同。
- 隐私边界不同。

### 决策 2：Memory 和 State 解耦

```text
memory:
chat_history
window_summary

state:
working_state
routing_state
```

原因：

- memory 负责给模型提供可读上下文。
- state 负责给 runtime 提供执行驱动。
- state 可以引用 memory，但 state 本身不是记忆内容。
- 这样可以避免把 Task Memory、Routing Memory 之类概念越拆越多。

### 决策 3：不用 Task Memory 作为产品概念

原因：

- 工作状态属于 window 的 driver state。
- 用户不应该管理额外的 Task Memory 层。
- 数据库表名用 `window_working_states` 更准确。

### 决策 4：Trace 不进入当前窗口记忆内容

原因：

- Trace 是证据。
- Trace 可能包含敏感执行信息。
- Trace 可以支持归档生成，但不能直接变成记忆。

## 示例场景

### 普通窗口连续对话

1. 用户发送消息。
2. 写入 `window_messages`。
3. assistant 回复完成。
4. 再写入一条 `window_messages`。
5. 消息变长后写入 `window_summaries`。
6. 下一轮读取本 window 的 messages 和 summaries。

### 普通窗口连续工作

1. 用户提出工作型请求。
2. runtime 写入 `window_routing_states`。
3. run 成功完成。
4. 写入或更新 `window_working_states`。
5. 用户继续 follow-up。
6. runtime 读取本 window 的 working state 继续工作；模型只读取必要的 messages/summaries。

### Private 窗口

1. 写入 `windows.is_private = 1`。
2. 写入 `window_policies` 的 Private 策略。
3. 照常写入本窗口 messages/summaries 和 working states。
4. 禁止读取长期记忆。
5. 禁止读取其他窗口。
6. 删除时 discard，不 archive。

### 非 Private 窗口归档

1. Memory Controller 读取当前窗口安全摘要。
2. 排除 secrets、原始文件内容、原始命令输出。
3. 写入 `long_term_memories(kind='window_archive')`。
4. 写入 `memory_events(operation='archive')`。
5. 关闭或删除 window。

## 开放问题

- `window_messages` 是否允许用户开启原文同步？
- `window_summaries` 是否作为默认跨设备同步内容？
- `window_working_states` 是否同步为跨设备 driver state，还是只通过 archive 摘要跨设备可见？
- Private policy 是否持久化，还是只在当前运行期有效？
