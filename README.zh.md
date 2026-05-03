<div align="center">
  <h1><code>MOCHI</code></h1>
  <p><code>local-first · multi-agent · memory-aware</code></p>
  <p><strong>一个运行在 VS Code 中的本地优先 AI 编程 Agent，支持工作区工具、分层记忆和审批感知的代码修改。</strong></p>
  <p>
    <a href="README.md">English</a>
    ·
    <a href="README.zh.md">中文</a>
  </p>
  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=zee.mochi-local-agent">VS Code Marketplace</a>
    ·
    <a href="https://github.com/SUPERpowerGT/Mochi">GitHub</a>
  </p>
</div>

Mochi 是一个实验性的 VS Code 扩展，把 OpenAI Agents SDK runtime 放进本地编辑器聊天面板。它可以理解当前工作区、读取编辑器上下文、调用本地工具、修改文件、执行经过批准的命令，并在多轮工程任务中保留可检查的本地记忆。

Mochi 的设计目标是 local-first。运行状态、记忆和 trace 都存储在用户本机，工作区工具只会作用于用户选择的本地文件夹。

## Demo

https://github.com/user-attachments/assets/01e88781-2600-4f24-8cb4-a177271787ab

<video src="media/video-demo.mp4" controls width="720"></video>

如果当前 Markdown 查看器不能播放视频，可以直接打开 `media/video-demo.mp4`。

## 功能特性

- VS Code 原生聊天面板，支持流式回复。
- 多聊天窗口/session，每个窗口拥有独立历史和输入草稿。
- 工作区工具：列文件、读文件、写文件、创建目录、追加内容和删除文件/目录。
- 本地命令执行需要用户在聊天面板中明确批准。
- 删除文件、删除目录、清空已有文件内容等高风险操作会显示 approval card。
- 当前窗口记忆用于保持多轮对话连续性，不会把每条消息都当作长期事实。
- 会话摘要会压缩较早历史，同时保留最近原始对话作为上下文。
- 工作区记忆记录检测到的项目事实和建议验证命令。
- 支持从 `MOCHI.md`、`AGENTS.md`、`CLAUDE.md` 等项目指令文件加载仓库级规则。
- Memory snapshot、run trace、MemoryCommit 和 memory event 可用于检查 Mochi 记住了什么、跳过了什么、归档了什么、修改了什么。
- Memory Controls 支持查看本地记忆、开启 Private 当前窗口、隔离跨窗口记忆、禁用持久记忆读取，以及清理当前或全部本地记忆。
- Private 模式直接暴露在聊天面板中；斜杠菜单保持精简，只保留高频快捷入口。
- Long-Term Memory 记录保存在本地，其中包括非 Private 窗口归档删除时生成的 `window_archive`。
- Root Agent 可以通过子 Agent 委托仓库理解、代码实现、方案审查和代码审查任务。
- 不同角色拥有不同工具权限：探索和审查 Agent 保持只读，Coding Agent 才能编辑。
- 本地 skills 会在相关任务中注入轻量工作流指导。
- Assistant 回复支持 Markdown，包括标题、列表、代码块、行内代码、链接和引用。

## 环境要求

- VS Code `1.90.0` 或更新版本。
- OpenAI API key 或 Google AI Studio Gemini API key。
- 如果从源码本地开发，需要 Node.js 和 npm。

Marketplace 用户可以直接在 VS Code 中配置模型凭据：

```text
Mochi: Configure Model Credentials
```

Mochi 会把 API key 存在 VS Code Secret Storage 中，把非敏感模型设置存在 VS Code Settings 中。

本地开发或高级配置也可以使用 shell 环境变量或 `~/.openai-env`。配置脚本支持 OpenAI，也支持通过 OpenAI-compatible endpoint 使用 Gemini：

```bash
export MOCHI_MODEL_PROVIDER="openai"
export OPENAI_API_KEY="sk-..."
export MOCHI_OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4.1-mini"
export OPENAI_API_FORMAT="chat_completions"
```

runtime 也接受普通 `.env` 风格内容，例如 `OPENAI_API_KEY="sk-..."`，方便同一配置文件在 Windows、macOS 和 Linux 上使用。

## 快速开始

从 VS Code Marketplace 安装 Mochi：

```text
https://marketplace.visualstudio.com/items?itemName=zee.mochi-local-agent
```

配置模型凭据：

```text
Mochi: Configure Model Credentials
```

如果你在配置凭据前打开 Mochi，它会提示你先配置。没有 API key 时发送消息，也会再次提示配置。

然后在 VS Code Command Palette 中运行：

```text
Local Agent: Open Chat
```

如果从源码本地开发，先安装依赖：

```bash
npm install
```

然后配置模型并启动 Extension Development Host：

```bash
npm run setup:model
```

其他配置入口：

- Windows、macOS、Linux：`node ./scripts/setup_model.js`
- 仅 macOS/Linux shell：`./scripts/setup_model.sh`

如果不需要本地代理，脚本询问 proxy 时选择 `n`。Mochi 会在 runtime 直接读取 `~/.openai-env`。Windows 用户通常只需要重启 Extension Development Host，不需要执行 `source`。

从源码启动扩展：

1. 在 VS Code 中打开本仓库。
2. 按 `F5`。
3. 如果 VS Code 询问 launch target，选择 `Run Local Agent Extension`。
4. 在 Extension Development Host 窗口中运行 `Local Agent: Open Chat`。
5. 发送 `ping`，或让 Mochi 检查当前工作区。
6. 如果想让 Mochi 操作另一个文件夹，运行 `Local Agent: Select Workspace Folder`。

## 使用方式

从 Command Palette 打开 Mochi 面板：

```text
Local Agent: Open Chat
```

Mochi 可以回答问题、检查文件、修改工作区代码，并使用当前编辑器选区作为上下文。遇到高风险动作时，聊天面板会先显示 approval card，用户批准后 runtime 才会继续。

对于复杂任务，Mochi 可以把有边界的子任务委托给专门的子 Agent。委托过程会记录在 run trace 中，子 Agent 只会收到经过选择的 memory 和 skills，而不是无限制读取全部长期记忆。

Mochi 的记忆模型只有三层：

```text
Current Window Memory
Long-Term Memory
Runtime Trace
```

Current Window Memory 让当前聊天窗口保持连续；Long-Term Memory 保存本地持久记录，例如 `window_archive`；Runtime Trace 记录工具、审批、命令、子 Agent 和失败证据。

聊天面板中的 `Private` 开关类似浏览器私密窗口。Private 窗口可以在打开期间保留自己的当前窗口上下文，但不会读取其他窗口的已保存记忆，也不会归档进 Long-Term Memory。非 Private 窗口执行 artifact deletion 时，会先把安全的当前窗口摘要归档为本地 `kind: "window_archive"` Long-Term Memory 记录，再删除当前窗口产物。Private 删除不会归档，只会记录一个 blocked memory event。

运行 `Mochi: Open Memory Controls` 可以查看当前记忆状态。运行 `Mochi: Delete Current Window Artifacts` 可以归档并删除非 Private 窗口，或直接丢弃 Private 窗口。过渡期内，更细粒度的清理命令仍然可以从 Memory Controls 和 Command Palette 使用。

当前实现仍然包含内部 session、task-like working state、workspace、user、long-term memory 和 memory event stores。记忆语义见 `doc/memory-model.md` 和 `doc/memory-model.zh.md`；当前 JSON-backed 实现计划和状态见 `doc/memory-v2.md`。

当前推荐工作流：

1. 打开一个 workspace folder。
2. 从 Extension Development Host 启动 Mochi。
3. 请求代码修改、解释或项目审查。
4. 对命令执行和危险文件操作检查 approval card。
5. 需要排查记忆或执行过程时，打开 memory snapshot。

## 命令

| 命令 | 用途 |
| --- | --- |
| `Local Agent: Open Chat` | 打开或聚焦 Mochi 聊天面板。 |
| `Local Agent: Quick Ask` | 快速向 Mochi 发送问题。 |
| `Local Agent: Ask About Selection` | 将当前编辑器选区预填到聊天框。 |
| `Local Agent: Replace Selection With Last Reply` | 用最近一次 assistant 回复替换当前编辑器选区。 |
| `Local Agent: Select Workspace Folder` | 选择 Mochi 当前要操作的工作区。 |
| `Local Agent: Open Memory Snapshot` | 打开精简 memory 和 trace snapshot。 |
| `Local Agent: Open Raw Memory Snapshot` | 打开原始存储 memory snapshot。 |
| `Mochi: Open Memory Controls` | 查看当前记忆状态和可用记忆命令。 |
| `Mochi: Toggle Current Window Private Mode` | 阻止当前窗口读取已保存记忆和其他 session 记忆。 |
| `Mochi: Toggle Current Window Memory Isolation` | 阻止或允许当前窗口读取其他 session 记忆。 |
| `Mochi: Toggle Current Window Persistent Memory Reads` | 阻止或允许当前窗口读取持久记忆。 |
| `Mochi: Delete Current Window Artifacts` | 归档并删除非 Private 窗口的聊天、working state、trace 和 routing artifacts；Private 窗口不归档，直接丢弃。 |
| `Mochi: Clear Current Window Memory` | 清理当前窗口摘要、working state、trace 和 routing memory，同时保留聊天消息。 |
| `Mochi: Clear Current Session Summary Memory` | 清理当前 session summary 和 compaction memory。 |
| `Mochi: Clear Current Window Working State` | 过渡期内部命令，用于清理当前 working-state records。 |
| `Mochi: Clear Current Workspace Memory` | 清理检测到的工作区事实和验证提示。 |
| `Mochi: Clear User Memory` | 清理保存的用户偏好。 |
| `Mochi: Clear Current Trace Memory` | 清理最近 run trace 和 routing state。 |
| `Mochi: Clear All Local Memory` | 清理所有本地 Mochi 记忆类别，同时保留聊天 session 和消息。 |

完整命令参考见 `doc/commands-and-capabilities.md`。

## 斜杠菜单

聊天输入框支持一个精简的 `/` 快捷菜单。它不会复制完整 Command Palette。

当前快捷入口：

- `/help`
- `/new`
- `/memory`
- `/clear-private-window`
- `/model`

## 安全模型

Mochi 把工作区视为共享状态：

- 文件修改会按目标路径串行化。
- 如果文件在 Mochi 读取后被外部修改，写入会拒绝 stale edit。
- 删除文件等破坏性文件动作需要 approval。
- 本地命令执行需要 approval。
- 工具结果会被记录，Mochi 可以区分成功、失败、拒绝和跳过。
- Run trace 会记录工具调用、approval、修改路径、命令证据和验证状态。
- 当前窗口隔离可以阻止跨 session 记忆召回。
- 每个当前窗口都可以禁用持久记忆读取。
- Private mode 会阻止当前窗口读取持久记忆、跨 session 召回，以及写入 Long-Term Memory archive。
- Memory events 会记录 completed、skipped、blocked 等记忆决策，例如非 Private archive 创建或 Private archive blocking。
- 用户可以清理当前窗口记忆或全部本地 Mochi 记忆。

这些机制让 Mochi 可以用于真实本地工程工作，同时让潜在意外操作保持可见和可控。

## 项目结构

```text
src/extension/   VS Code 激活、命令、webview UI 和 chat controller
src/runtime/     OpenAI Agents SDK runtime、tools、prompts、memory 和 tracing
scripts/         模型 provider 配置脚本
doc/             架构说明、功能说明、路线图和命令参考
media/           扩展和 README 资源
```

## 开发

主扩展路径使用 VS Code launch configuration：

```text
.vscode/launch.json -> Run Local Agent Extension
```

JavaScript runtime 是当前唯一产品 runtime 路径。本地开发和测试请使用上面的 launch configuration。

## 文档

- `doc/current-features-and-usage.md`
- `doc/current-architecture.md`
- `doc/memory-model.md`
- `doc/memory-model.zh.md`
- `doc/memory-v2.md`
- `doc/commands-and-capabilities.md`
- `doc/roadmap.md`
- `doc/development-log.md`
- `doc/ultimate-goal.md`

## License

Mochi 使用 MIT License 发布。详见 `LICENSE`。

## Security

- 不要提交真实 API key。
- 将本地凭据保存在 `~/.openai-env` 或已忽略的 `.env` 文件中。
- 如果 key 曾经暴露，请立即 rotate。
- 批准文件删除、目录删除、文件清空或命令执行前，请先检查 approval card。
