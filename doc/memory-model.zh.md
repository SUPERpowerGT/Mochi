# Mochi 三层记忆模型

## 目的

本文档是 Mochi 记忆语义的源头文档。

Mochi 只有三层：

```text
1. 当前窗口记忆
2. 长期记忆
3. 运行轨迹
```

不要再增加更多记忆层。

命名规则：

- `user_preference`、`project_fact`、`project_convention`、`decision`、`window_archive` 是长期记忆里的 `record.kind`，不是层。
- `chat_history`、`window_summary` 是当前窗口记忆内容，不是层。
- `working_state`、`routing_state` 是当前窗口 state，不是记忆内容，也不是层。
- `trace_ref` 是运行轨迹引用，`policy_state` 是策略状态；它们都不是记忆内容，也不是层。
- `run`、`tool_call`、`command_result`、`approval`、`file_change`、`verification`、`error` 是运行轨迹里的事件类型，不是层。
- Memory Controller 是控制器。Memory Events 是审计记录。它们都不是层。

`memory-v2.md` 是实现计划。本文档是产品和系统契约。

当前窗口记忆的字段级细节、当前本地存储、未来后端边界和每个数据组的用途，见 `current-window-memory.zh.md`。

## 三层总览

| 层 | 是不是记忆 | 默认是否进入模型上下文 | 用户是否可见 | 目的 |
| --- | --- | --- | --- | --- |
| 当前窗口记忆 | 是 | 是，只给所属窗口使用 | 是 | 让一个打开的 Mochi 窗口可以连续对话和连续工作。 |
| 长期记忆 | 是 | 是，但只给普通非 Private 窗口使用 | 是 | 保存未来窗口可以复用的稳定事实和非 Private 窗口归档摘要。 |
| 运行轨迹 | 否 | 否 | 部分可见，用于调试和报告 | 记录 run、工具、审批、命令、文件变更和失败证据。 |

## 硬边界

- Mochi 只有三层。
- 当前窗口记忆是短生命周期、窗口级别的。
- 长期记忆是持久、可复用的。
- 运行轨迹默认不是模型上下文。
- 内部工作状态属于当前窗口 state，不属于 memory content。
- Memory informs. State drives.
- 自然语言聊天不能直接删除记忆。
- 普通 assistant 可以提出记忆动作，但提升、归档、删除、策略和审计由 Memory Controller 管控。
- Private 模式可以使用自己的当前窗口记忆，但不能读取、写入、提升到、归档到长期记忆。
- Private 窗口不能创建 `window_archive` 记录。
- secrets、原始文件内容、原始命令输出、Private 窗口内容不能进入长期记忆。

## 第 1 层：当前窗口记忆

当前窗口记忆是一个打开的 Mochi 聊天窗口/session 的短生命周期对话上下文。

它回答的问题是：“这个窗口为了继续当前对话，需要知道什么？”

它不回答：“未来所有窗口应该永久记住什么？”

当前窗口 state 是同一 window 下的运行驱动数据。它回答的问题是：“runtime 下一步应该怎么继续当前工作？”

### 当前存储位置

当前实现里，当前窗口记忆主要落在两个文件里，其中最新 trace 字段暂时挂在 session 记录上。

| 存储 | 当前职责 | 层归属 | 说明 |
| --- | --- | --- | --- |
| `sessions.json` | 主要 current-window/session store | 当前窗口记忆 + 元数据 + 部分 state | 存 session 身份、可见聊天历史、摘要、routing 指针、last turn 元数据、最新 trace 引用/数据。 |
| `tasks.json` | 过渡期内部工作状态 store | 当前窗口 state | 保存当前工作连续性。它不能作为单独的 “Task Memory” 层暴露。 |
| `sessions.json:lastRunTrace` | 最新运行轨迹数据/引用 | 运行轨迹，但当前嵌在 session 里 | 目标方向是迁移到 `traces.json`。 |
| 内存中的 policy map | 当前窗口策略 | 当前窗口记忆策略 | 窗口活跃期间保存 `privateWindow`、`isolateSession`、`disablePersistentMemory`。 |

目标方向：

- 可见聊天和当前窗口摘要继续放在 session/window store
- 内部工作状态作为当前窗口 state 隐藏起来
- trace 数据迁移到 `traces.json`
- 不把 `tasks.json` 暴露成一个用户产品里的记忆类型

### `sessions.json` 字段

| 字段 | 功能 | 什么时候开始存 | 什么时候更新 | 什么时候读取 | 什么时候清理/删除 |
| --- | --- | --- | --- | --- | --- |
| `id` | 当前窗口/session 的稳定身份，通常来自 base session 和 workspace。 | session 打开 | 很少更新 | 任何窗口操作需要身份时 | 删除当前窗口产物 |
| `workspaceId` | 绑定 workspace 作用域。 | session 打开 | workspace/session restore 变化时 | workspace 范围检索或清理 | 删除当前窗口产物 |
| `history` | 这个窗口可见的用户/assistant 对话。 | 第一次消息或恢复 session | 用户发送、assistant 回复 | 构建当前窗口 prompt/history | 删除/discard 窗口；如果 clear 命令承诺保留聊天，则可以保留 |
| `createdAt` | session 创建时间。 | session 打开 | 不更新 | UI/debug/audit | 删除当前窗口产物 |
| `updatedAt` | session 最后变更时间。 | session 打开 | 任意 session 写入 | UI/debug/audit | 删除当前窗口产物 |
| `messageCount` | 轻量聊天长度元数据。 | 第一次 history 写入 | history 变化 | compaction/debug/UI | 删除当前窗口产物 |
| `lastPrompt` | 最近用户 prompt 的预览/元数据。 | 用户发送 | 每个用户 turn | debug/routing/snapshot | 清理或删除当前窗口产物 |
| `lastTurn` | 最近 turn 的分类和 routing 元数据。 | run 前后 | turn 分类/routing 变化 | runtime 准备下一轮 | 清理当前窗口记忆或删除窗口 |
| `activeTaskId` | 指向当前内部工作状态。 | work-like flow 开始 | 工作焦点变化 | 同一窗口继续工作 | 清理当前窗口记忆或删除窗口 |
| `focusedTaskId` | 指向当前聚焦的内部工作状态。 | 出现 work-like focus | focus 变化 | routing/continuation | 清理当前窗口记忆或删除窗口 |
| `summary` | 旧的当前窗口上下文压缩摘要。 | 达到压缩阈值或显式总结 | compaction/maintenance | 当前窗口需要压缩上下文 | 清理当前窗口记忆或删除窗口 |
| `summaryUpdatedAt` | 摘要更新时间。 | summary 创建 | summary 刷新 | debug/过期检查 | 清理当前窗口记忆或删除窗口 |
| `compactedAt` | 最近压缩时间。 | compaction 执行 | compaction 重跑 | compaction/过期检查 | 清理当前窗口记忆或删除窗口 |
| `compaction` | 压缩元数据。 | compaction 执行 | compaction 重跑 | debug/maintenance | 清理当前窗口记忆或删除窗口 |
| `lastRunTrace` | 最新 run 的 trace 数据/引用。 | run 开始或完成 | tool/command/approval/error 证据变化 | debug/snapshot/archive evidence | 清理 trace、清理当前窗口记忆、删除/discard 窗口 |
| `closedAt` | 标记窗口/session 已关闭。 | close/delete flow | close/delete flow 变化 | restore/filter logic | 永久删除当前窗口产物 |

### `tasks.json` 过渡期工作状态字段

`tasks.json` 是当前窗口的实现工作状态。它不是第四层记忆，也不应该以 “Task Memory” 的产品概念暴露。

| 字段 | 功能 | 什么时候开始存 | 什么时候更新 | 什么时候读取 | 什么时候清理/删除 |
| --- | --- | --- | --- | --- | --- |
| `id` | 内部工作状态 id。 | work-like flow 开始 | 很少更新 | session 指针解析工作状态 | 清理/删除当前窗口记忆 |
| `sessionId` | 所属当前窗口/session。 | working state 创建 | session 关联变化 | 同窗口连续工作 | 清理/删除当前窗口记忆 |
| `workspaceId` | 工作状态的 workspace 作用域。 | working state 创建 | workspace 变化 | routing/cleanup | 清理/删除当前窗口记忆 |
| `title` | 短工作标题。 | 识别出 work-like flow | 工作目标变化 | UI/snapshot/routing | 清理/删除当前窗口记忆 |
| `goal` | 当前工作目标。 | work-like flow 开始 | 用户改变目标 | 同窗口连续工作 | 清理/删除当前窗口记忆 |
| `status` | 当前状态。 | working state 创建 | 工作推进/完成/失败 | routing/debug | 清理/删除当前窗口记忆 |
| `sessionIds` | 过渡期连续性用到的关联 sessions。 | working state 创建 | 关联 sessions 变化 | restore/debug | 清理/删除当前窗口记忆 |
| `lastSessionId` | 最近所属/关联 session。 | working state 创建 | session focus 变化 | routing/continuation | 清理/删除当前窗口记忆 |
| `turnCount` | work-like turn 数量。 | working state 创建 | 每个相关 turn | routing/debug | 清理/删除当前窗口记忆 |
| `lastUserPrompt` | 最近工作 prompt 预览。 | 用户发出 work-like prompt | 每个 work turn | routing/debug | 清理/删除当前窗口记忆 |
| `latestAssistantReply` | 最近 assistant 结果预览。 | assistant 回复 | 每个 work turn | continuation/debug | 清理/删除当前窗口记忆 |
| `summary` | 当前工作短摘要。 | work state 被总结 | 成功工作/routing | continuation | 清理/删除当前窗口记忆 |
| `lastOutcome` | 最近工作结果。 | 工作完成或部分完成 | 每个 work turn | continuation/debug | 清理/删除当前窗口记忆 |
| `notes` | 连续工作内部 notes。 | runtime 记录 note | runtime 更新 | 同窗口连续工作 | 清理/删除当前窗口记忆 |
| `relatedFiles` | 文件路径引用，不是原始文件内容。 | 文件相关工作开始 | 文件变化/focus 变化 | continuation/debug | 清理/删除当前窗口记忆 |
| `lastRoute` | 最近 routing 分类。 | routing 执行 | 每个 routed turn | 下一轮 routing | 清理/删除当前窗口记忆 |
| `routeReason` | 安全的 routing 原因。 | routing 执行 | 每个 routed turn | debug/routing | 清理/删除当前窗口记忆 |
| `createdAt` | working state 创建时间。 | working state 创建 | 不更新 | debug/audit | 清理/删除当前窗口记忆 |
| `updatedAt` | working state 最后变更时间。 | working state 创建 | 任意更新 | debug/过期检查 | 清理/删除当前窗口记忆 |

### 当前窗口数据内部组

| 分组 | 分类 | 当前存储 | 功能 |
| --- | --- | --- | --- |
| `chat_history` | memory | `sessions.json:history` | 可见对话和当前 prompt 连续性。 |
| `window_summary` | memory | `sessions.json:summary`、`summaryUpdatedAt`、`compactedAt`、`compaction` | 压缩较早的当前窗口上下文。 |
| `working_state` | state | `tasks.json` 加 `activeTaskId`/`focusedTaskId` 指针 | 在同一个窗口内继续当前工作。 |
| `routing_state` | state | `sessions.json:lastTurn`、`tasks.json:lastRoute`、`routeReason` | 判断下一轮是普通对话、工作、继续工作还是 routing 变化。 |
| `trace_ref` | evidence | 当前是 `sessions.json:lastRunTrace` | 关联最新 run evidence；目标是 `traces.json`。 |
| `policy_state` | policy | 内存中的 policy map | 执行当前窗口 Private/isolation/persistent-read 策略。 |

### 当前窗口写入规则

当前窗口 memory/state 在正常使用中自动写入。

允许的写入触发：

- 创建/打开/恢复 Mochi 窗口
- 用户发送消息
- assistant 回复完成
- runtime 分类或 routing 一个 turn
- 成功的工作型 turn 更新内部工作状态，也就是当前窗口 state
- history compaction 创建或刷新 `window_summary`
- run evidence 附加 trace 引用
- 用户切换当前窗口策略，例如 Private mode

Private 模式允许当前窗口 memory/state 写入，因为这些内容只留在当前窗口内部。

### 当前窗口读取规则

- 窗口可以读取自己的当前窗口记忆。
- runtime 可以读取自己的当前窗口 state。
- 普通窗口不能读取其他活动窗口的原始当前窗口记忆。
- 普通窗口未来可以读取另一个非 Private 窗口压缩出来的 `window_archive` 长期记忆。
- Private 窗口只能读取自己的当前窗口记忆和自己的运行轨迹/debug artifacts。
- Private 窗口不能读取长期记忆。

### 当前窗口清理、删除、归档规则

| 动作 | 是否 Private | 是否写长期记忆 | 是否删除当前窗口产物 | 含义 |
| --- | --- | --- | --- | --- |
| Clear Current Window Memory | 任意 | 否 | 清理 summary、working state、routing state、trace links；如果命令承诺保留可见聊天，则保留聊天 | 重置当前窗口记忆和相关 state，但不一定删除聊天 transcript |
| Archive And Delete Current Window | 否 | 是，创建 `kind: "window_archive"` | 是 | 压缩有用的非 Private 当前窗口上下文，保存 archive，再删除/关闭当前窗口产物 |
| Discard Without Archive | 任意 | 否 | 是 | 破坏性删除，不写 archive |
| Private Delete | 是 | 否 | 是 | 永远按 discard 处理；Private 窗口不能 archive |

Archive 不是 discard。

Archive 的意思是：把安全、有用、非 Private 的当前窗口上下文压缩进长期记忆，然后删除或关闭当前窗口产物。

Discard 的意思是：删除当前窗口产物，不保存 archive。

## 第 2 层：长期记忆

长期记忆保存持久、可复用的事实和摘要。

它回答的问题是：“未来的普通 Mochi 窗口可以被允许复用什么？”

长期记忆只有一层，但里面有多个 `record.kind`。

### 当前存储位置

| 当前存储 | 当前职责 | 目标方向 |
| --- | --- | --- |
| `user.json` | 用户级长期偏好 | 迁移到统一的 `long_term_memory.json`，记录带 `scope: "user"` |
| `workspaces.json` | workspace/project 检测事实和约定 | 迁移到统一的 `long_term_memory.json`，记录带 `scope: "workspace"` |
| 尚未一等实现 | 窗口归档 | 在 `long_term_memory.json` 加 `kind: "window_archive"`，或用专用 archive store 但复用同一 schema |

### 目标记录结构

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

允许的 `kind`：

```text
user_preference
project_fact
project_convention
decision
window_archive
```

这些是记录类型，不是层。

### 长期记忆记录类型

| `record.kind` | 作用域 | 存什么 | 什么时候开始存 | 什么时候读取 | 什么时候删除 |
| --- | --- | --- | --- | --- | --- |
| `user_preference` | `user` | 稳定语言、风格、审批、验证偏好 | explicit remember 或确认过的偏好流程 | 普通非 Private 窗口需要用户偏好上下文时 | 确认删除/清空/归档 |
| `project_fact` | `workspace` | package manager、语言、框架、manifest、test/lint/typecheck/build 命令 | 本地文件可靠检测或用户显式确认 | 同 workspace 普通非 Private 窗口需要项目事实时 | 确认删除、清空或被新证据 supersede |
| `project_convention` | `workspace` | 已确认的项目规则、代码约定、工作流期望 | 用户确认约定或 explicit remember | 同 workspace 普通非 Private 窗口需要约定时 | 确认删除/清空/归档 |
| `decision` | `user` 或 `workspace` | 值得复用的稳定决策 | explicit remember 或批准后的 promotion | 普通非 Private 窗口需要相关长期决策时 | 确认删除/清空/归档 |
| `window_archive` | 通常是 `workspace` | 非 Private 窗口的压缩摘要、决策、结果、未解决问题、follow-up | 非 Private archive/delete 或显式 save-window-summary | 普通非 Private 窗口检索相关历史窗口上下文时 | 确认删除/清空 |

### 长期记忆写入规则

长期记忆写入由 Memory Controller 管控。

允许的写入触发：

- explicit remember action
- 已确认偏好
- 已确认项目约定
- 可靠文件检测到的项目事实
- 非 Private 当前窗口 archive/delete 创建 `kind: "window_archive"`
- 经批准的当前窗口记忆 promotion

禁止的写入触发：

- 未确认的原始聊天文本
- 普通 assistant 推断
- Private mode 内容
- secrets
- 原始文件内容
- 原始命令输出
- 临时工作进展
- 临时错误
- 直接把 Runtime Trace 复制成 memory

### 长期记忆读取规则

普通非 Private 窗口可以读取相关 active 长期记忆。

Private 窗口不能读取长期记忆。

检索必须：

- 受 relevance 限制
- 受 token/budget 限制
- 按 workspace/scope 过滤
- 按 status 过滤
- 避免 raw secret/file/command 内容

### 长期记忆删除规则

自然语言聊天不能直接删除长期记忆。

下面这些话都不能直接删除记忆：

- “忘掉这个”
- “删除那条记忆”
- “不要再记这个了”
- “清掉项目记忆”

这些消息最多只能创建 memory action proposal。

真正删除必须来自：

- Memory Panel 删除动作
- 显式命令动作
- 用户对 memory action proposal 的显式确认
- 非记忆 trace cleanup 的已批准 retention policy

如果 Memory Event logging 已实现，删除必须创建 Memory Event。

## 第 3 层：运行轨迹

运行轨迹记录执行期间发生了什么。

它回答的问题是：“这次 run 的证据是什么？”

运行轨迹默认不是记忆上下文。

### 当前和目标存储

| Trace 数据 | 当前存储 | 目标存储 | 功能 |
| --- | --- | --- | --- |
| 最新 run trace | `sessions.json:lastRunTrace` | `traces.json` | 在 snapshot 和 debug 视图里展示最新 run/tool 证据。 |
| tool lifecycle events | 当前嵌在 latest trace 里 | `traces.json` | 记录 tool 前后行为和 policy 证据。 |
| command evidence | 当前嵌在 latest trace 里 | `traces.json` | 保存 command、exit code、安全 stdout/stderr preview。 |
| approval evidence | 当前嵌在 latest trace 里 | `traces.json` | 记录审批请求和决策。 |

### Trace 事件类型

| Event kind | 存什么 | 什么时候开始 | 什么时候更新 | 什么时候读取 | 什么时候删除 |
| --- | --- | --- | --- | --- | --- |
| `run` | run id、prompt summary、status、provider/model | run 开始 | run 完成/失败 | debug/snapshot/test report | retention/window delete |
| `tool_call` | tool name、args summary、call id | tool 开始 | tool output 返回 | debug/audit/archive evidence | retention/window delete |
| `command_result` | command、exit code、stdout/stderr preview | command 执行 | command 完成 | verification/debug | retention/window delete |
| `approval` | 审批请求和决策 | 风险动作请求审批 | 用户批准/拒绝 | audit/debug | retention/window delete |
| `file_change` | path、operation、evidence summary | 文件工具修改 | 修改完成/失败 | audit/debug | retention/window delete |
| `verification` | test/lint/typecheck command 和结果摘要 | 验证开始 | 验证完成 | test report/debug | retention/window delete |
| `error` | 安全错误摘要 | 失败发生 | run 关闭 | debug/test report | retention/window delete |

### Trace 读取规则

运行轨迹可以被这些模块读取：

- snapshot/debug views
- test reports
- archive generator 作为证据
- Memory Controller 用于安全摘要

运行轨迹不能作为普通长期记忆注入模型上下文。

### Trace 删除规则

Trace 通过这些方式删除：

- 当前窗口产物删除
- 显式 trace clear
- retention policy
- discard without archive

Private trace 可以用于当前窗口调试，但 Private 窗口删除时必须删除它，不能归档。

## Memory Controller

Memory Controller 不是层。

它负责：

- 长期记忆写入权限
- `window_archive` 生成
- discard-without-archive 确认
- memory action proposals
- delete confirmation
- Private mode enforcement
- Memory Event logging
- retention policy

普通 assistant 可以请求或提出 memory action，但不能直接：

- 删除长期记忆
- 归档 Private 窗口
- 提升 raw Current Window Memory
- 把 secrets 或原始文件写进记忆

## Memory Events

Memory Events 是审计记录，不是层，也不是模型上下文。

它应该记录：

- `eventId`
- timestamp
- actor
- operation
- target memory id
- target layer
- 相关的 target `record.kind`
- source evidence summary
- policy decision
- 必要时保存安全 before/after summary

目标存储：

```text
memory_events.json
```

## 当前窗口结束状态

### Archive And Delete

这是非 Private 窗口关闭/删除时的默认目标流程。

步骤：

1. Memory Controller 总结当前窗口记忆。
2. 排除不安全内容。
3. 长期记忆收到一条 `kind: "window_archive"` 记录。
4. Memory Event 记录 archive creation。
5. 当前窗口记忆产物被删除或关闭。

未来普通窗口可以读取这个 archive。

Private 窗口不能读取它。

### Discard Without Archive

这是破坏性路径。

步骤：

1. 用户显式确认 discard。
2. 不写 `window_archive` 记录。
3. 当前窗口记忆产物被删除。
4. 如果 Memory Event 可用，记录 discard。

Private 窗口永远按 discard 处理，因为它不能写长期记忆。

## 三层生命周期矩阵

| 层 | 什么时候开始存 | 什么时候更新 | 能否变成长期记忆 | 谁能读取 | 什么时候删除 |
| --- | --- | --- | --- | --- | --- |
| 当前窗口记忆 | window/session 打开 | 每轮对话、摘要压缩 | 可以，但只能通过非 Private `window_archive` 或显式批准的 promotion | 只给所属窗口读取 | clear、archive/delete、discard |
| 当前窗口 state | window/session 打开或 work-like flow 开始 | working/routing 更新、policy 变化 | 不能直接变成长期记忆，只能作为 archive 生成证据 | 只给所属 runtime 读取 | clear、archive/delete、discard |
| 长期记忆 | remember/confirm/file-detect/window-archive | 用户编辑、新证据、archive 创建、supersession | 本身就是长期 | 只给普通非 Private 窗口读取 | 确认删除/清空/归档 |
| 运行轨迹 | run 开始 | tool/command/approval/file/verification/error events | 不能，只有安全摘要可以支持 archive 生成 | 仅 debug/audit/report/controller | retention、trace clear、window delete |

## 第一阶段实现方向

1. 文档、UI、测试和实现命名都保持严格三层。
2. 实现 `kind: "window_archive"`，作为非 Private 窗口进入长期记忆的第一条路径。
3. 把 archive/delete 和 discard-without-archive 做成两个独立用户动作。
4. 保持自然语言删除只生成 proposal，不能直接删除。
5. 保持 Private mode 作为长期记忆读取、写入、归档的硬边界。
6. 把 trace 迁移到 `traces.json`。
7. 为 remember、archive、discard、update、delete 增加 Memory Events。
8. 不在记忆 UI 暴露内部 working state。
