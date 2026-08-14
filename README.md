# HyCode

以 **pi-coding-agent** 为框架构建的轻量级终端编码助手，定位为 Claude Code 的开源替代。

> 核心理念：**简约** + **透明**

## 为什么做这个

Claude Code 功能强大但封闭、重、且绑定官方账号体系。我们想要一个：

- **简约** —— 一个命令，一条输入，流式输出，没有多余 UI 噪音
- **透明** —— 模型、供应商、工具、密钥的每一次决策都可观测，不藏黑盒

HyCode 把 pi-coding-agent 的 SDK 能力收拢成一个单文件 CLI，暴露最小可用接口。

## 核心能力

| 能力 | 说明 |
|------|------|
| 全屏聊天界面 | 基于 pi-tui **TuiAltScreen**：上方 ScrollView 滚动消息区 + 底部状态栏/输入框；鼠标滚轮、键盘滚动、`Ctrl+Shift+F` 会话内搜索；退出时恢复主缓冲并打印完整对话 |
| 流式回复 | 助手回复**多行 Markdown 流式**渲染（代码高亮、代码块），工具调用以 `[⟳ name] ✓/✗` 行内标记 |
| 消息队列 | 模型工作时输入框保持可用，Enter 提交即**排队为 steering 消息**（当前回合结束后处理）；`Esc` **中止当前回合** |
| 斜杠命令补全 | 输入 `/` 自动弹出命令补全（Tab 选择）；`/models` 打开高亮选择器 |
| 模型默认为空 | 不内置任何供应商预设，`/models` 初始为空；**只有一个模型时自动选中它**，多个时由用户选择 |
| 自添加模型 | `hycode --add-model` 或 REPL 内 `/models add`（对话框向导）添加自己的模型 |
| 会话管理 | `/session` 查看会话信息、`/new` 新会话、`/resume` 恢复历史会话、`/compact` 压缩上下文、`/copy` 复制回复 |
| 模式与思考 | `/mode ask\|plan\|auto` 切换工具集；`/thinking off\|low\|medium\|high` 切换思考级别 |
| Bash 快捷 | `!命令` 执行并发送输出给模型；`!!命令` 仅执行显示输出 |
| @ 引用 | 输入 `@` 回车打开**目录浏览器**（选文件夹递归下钻，选文件后附加，基于该文件问答/工作）；`@路径` 直接附加文件或进入目录；`@workspace`/`@.` 引入工作区结构；Tab 自动补全 |
| 状态栏定制 | `/settings` 勾选底部状态栏显示项（模式/模型/上下文百分比/缓存命中/思考级别/目录），持久化保存 |
| 重置出厂 | `hycode --reset` 删除全部配置与会话，重新走引导流程 |

## 快速开始

```bash
# 1. 安装依赖（指向本地构建的 pi-coding-agent）
cd hycode
npm install

# 2. 构建
npm run build

# 3. 全局可用
npm link
```

```bash
# 首次使用：添加你自己的模型（可添加多个供应商、多个模型）
hycode --add-model

# 交互式对话（只有一个模型会自动选中；多个模型用 /models 高亮选择）
hycode

# 单次问答（必须用 -m 指定一个已添加的模型）
hycode -m moonshot/moonshot-v1-128k "你好"

# 只读模式（不启用 bash/edit/write）
hycode --readonly "分析当前目录代码"

# 查看已添加的模型
hycode --list-models

# 重置出厂设置（删除全部配置/会话，重新走引导）
hycode --reset
```

## 界面

启动后默认**终端顺沿**（TuiMainScreen：随终端滚动历史流动、保留 scrollback）；可用 `/fullscreen` 切换为**全屏模式**（TuiAltScreen：右上侧工具面板、Ctrl+Shift+F 搜索、应用自有滚动），持久化到 `settings.fullscreen`，重启生效：

```
  ██╗  ██╗ ██╗   ██╗ ██████╗ ██████╗  ██████╗ ███████╗  v0.5.16
  ██║  ██║ ╚██╗ ██╔╝ ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝
  ███████║  ╚████╔╝  ██║      ██║   ██║ ██║  ██║ █████╗
  ██╔══██║   ╚██╔╝   ██║      ██║   ██║ ██║  ██║ ██╔══╝
  ██║  ██║    ██║    ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗
  ╚═╝  ╚═╝    ╚═╝     ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝
────────────────────────────────────────────
 帮我看看当前目录
 思考中…
 正在读取目录…
────────────────────────────────────────────
模式:auto │ 模型:moonshot/moonshot-v1-128k │ 上下文:1%
────────────────────────────────────────────
> 输入问题，? 查看快捷键
```

- 助手回复为**多行 Markdown 流式**渲染（代码高亮/代码块），回复区只显示回复文本；底部输入框支持多行编辑、粘贴、`/` 命令自动补全、Tab 文件补全与 `@` 文件引用。
- **思考与工具活动**：💭思考 / 🖥️bash / 📄read / ✏️edit 等带 DSH 同款图标，思考默认折叠单行滚动、`Ctrl+T` 展开；**终端顺沿模式下内联于消息下方**，全屏模式下显示在右上侧面板；`✓` 绿勾 / `✗` 红叉。
- 模型工作时输入框保持可用，Enter 提交即排队（steering），回合结束后由模型处理；`Esc` 中止当前回合。
- **@ 引用（交互式目录浏览器）**：**输入 `@` 立即打开**目录浏览器（无需回车）——列出当前目录的文件夹（带 `/`，优先）与文件；`↑/↓` 选择、回车进入文件夹继续递归，选中文件即附加（提示"已附加文件"，随后问题基于该文件回答）；Esc 关闭后可继续输入路径或问题。也支持 `@路径` 直达（`@src/cli.ts` 附加、`@src/` 进入目录）、`@workspace`/`@.` 引入工作区树；`/attach` 等价于裸 `@`。
- 底部状态栏显示项由 `/settings`（SettingsList 面板）勾选（模式/模型/上下文百分比/缓存命中/思考级别/目录），持久化到配置。
- `/models` 打开 SelectList 高亮选择器；`/new`、`/resume`、`/compact` 提供会话管理；`!` / `!!` 提供 bash 快捷方式。

## 斜杠命令（REPL 内）

| 命令 | 说明 |
|------|------|
| `/model [名称]` | 查看或切换模型（如 `/model moonshot/moonshot-v1-32k`） |
| `/models` | **高亮选择**模型（↑/↓ 移动，回车切换，Esc 取消；默认为空） |
| `/models add` | 交互式添加模型/供应商 |
| `/models remove <目标>` | 移除模型或供应商 |
| `/models reset` | 清空所有已添加的模型 |
| `/mode [ask\|plan\|auto]` | 切换模式：ask（无工具）/ plan（只读工具）/ auto（完整工具） |
| `/thinking [off\|low\|medium\|high]` | 查看/切换思考级别 |
| `/settings` | 勾选底部状态栏显示项 |
| `/session` | 查看会话 ID/文件/消息数/上下文占用 |
| `/new` | 开始新会话（清空上下文） |
| `/resume` | 恢复历史会话（选择器） |
| `/compact` | 手动压缩上下文 |
| `/copy` | 复制最后一条助手回复到剪贴板 |
| `/help` | 显示命令帮助 |
| `/exit` `/quit` | 退出 |

其他：`!命令`（执行并发送给模型）、`!!命令`（仅执行）、`@文件`（引用）、`Esc`（中止）、`Ctrl+Shift+F`（搜索）。

## 模型机制

**模型默认为空，`/models` 初始为空。** HyCode 不内置任何供应商预设；模型宇宙严格等于你自己添加的内容——**添加几个，就支持切换几个**。**添加完成后默认选中列表中的第一个模型**（`/models add` 后自动关联、启动时若已添加模型也默认选第一个），随时可用 `/model <名称>` 或 `/models` 高亮选择修改。

- 添加：`hycode --add-model`（终端向导）或 REPL 内 `/models add`
- 列出/选择：REPL 内 `/models`（高亮选择，回车切换）
- 切换：REPL 内 `/model <名称>`（支持 `provider/model` 或仅 `model`）
- 移除：REPL 内 `/models remove <provider[/model]>`，清空用 `/models reset`
- 重置：`hycode --reset`（出厂设置 + 重新引导）

> **上下文统计**（对齐 DSH 的计算逻辑）：上下文压力 = 最近一次请求的 `input + cacheRead + cacheWrite`（DeepSeek 等网关的 `prompt_cache_hit_tokens` 计入 cacheRead），`上下文:N%` = 压力 ÷ 上下文窗口（整数百分比、上限 100）。**上下文窗口自动匹配**：内置常见模型目录（DeepSeek 1M、Kimi 131k、GPT-4o 128k 等），未手动配置时自动套用；`缓存:N%` = 缓存命中 ÷ 总输入。也可在向导中手动填写（如 DeepSeek 填 1000000）。

> **减少无谓工具调用**：首次运行时自动生成 `~/.hycode/agent/APPEND_SYSTEM.md`（追加到系统提示词），提示模型"简单问答直接回答、避免无谓/重复的工具调用"。该文件透明可编辑/删除；删除后不再自动重建（尊重你的自定义）。

### 添加模型向导

```
hycode --add-model

  添加模型 —— 添加几个模型，就支持在几个模型之间切换。
  （Ctrl+C 随时退出）

请选择模型供应商：
  供应商标识（英文，如 openai，留空取消）: moonshot
  显示名称（回车默认 moonshot）: Moonshot 月之暗面 (Kimi)
  API 地址（如 https://api.openai.com/v1）: https://api.moonshot.cn/anthropic
协议类型：
  ❯ Anthropic Messages
    OpenAI Completions
认证方式：
  ❯ Bearer Token
    API Key (x-api-key)
API Key（掩码显示；本地无鉴权服务可填 sk-local 占位）: ********
模型 ID（多个用逗号分隔，如 gpt-4o,deepseek-chat）: moonshot-v1-128k,moonshot-v1-32k

是否继续添加？        ← 支持添加多个供应商/模型
```

配置持久化到 `~/.hycode/providers.json`，之后启动直接使用。同一个供应商标识重复添加会合并（追加新模型、更新 Key）。

### REPL 会话中的选择

启动 REPL 时，只有一个模型会自动选中；多个模型时默认**未选择**：

```
已添加模型 2 个。当前模型: 未选择
模式:auto │ 模型:未选择 │ 上下文:0%
```

未选择模型时直接输入问题会得到提示，用 `/models` 高亮选择或 `/model <名称>` 选择后再开始对话。

## 斜杠命令（REPL 内）

| 命令 | 说明 |
|------|------|
| `/model` | 查看当前模型 |
| `/model <名称>` | 切换模型（如 `/model moonshot-v1-32k` 或 `/model moonshot/moonshot-v1-32k`） |
| `/models` | **高亮选择**模型（↑/↓ 移动，回车切换，Esc 取消；默认为空） |
| `/models add` | 交互式添加模型/供应商 |
| `/models remove <目标>` | 移除模型或供应商（如 `/models remove moonshot/moonshot-v1-32k`） |
| `/models reset` | 清空所有已添加的模型 |
| `/mode [ask\|plan\|auto]` | 切换模式：ask（无工具）/ plan（只读工具）/ auto（完整工具） |
| `/settings` | 勾选底部状态栏显示项（模式/模型/上下文百分比/工作目录） |
| `/buddy` | 召唤/选择宠物（🐱 猫咪 / 🐶 哈帕狗，高亮选择器切换；`/buddy off` 关闭，重启自动恢复） |
| `/help` | 显示命令帮助 |
| `/exit` `/quit` | 退出 |

## 部署方式

**方式一：本地开发运行**
```bash
cd hycode
npm install
npm run build
node dist/cli.js --list-models
```

**方式二：全局命令（本机使用）**
```bash
cd hycode
npm link                        # 生成全局 hycode 命令
hycode --add-model              # 添加模型
hycode -m openai/gpt-4o "你好"  # 任意目录可用（也支持 HyCode）
```

**方式三：打包分发（交付他人/服务器）**
```bash
cd hycode
npm pack                        # 生成 hycode-0.3.0.tgz
# 目标机器：
npm install -g ./hycode-0.3.0.tgz
hycode
```

> 注意：`package.json` 用 `file:` 指向本地 pi 包，分发前需先打包 pi 到 npm 私服，或将 `file:` 依赖替换为已发布的版本号（如 `@earendil-works/pi-coding-agent@0.84.1`）。

## 配置说明

配置文件 `~/.hycode/providers.json` 结构（模型默认为空，只有你添加过的内容）：

```json
{
  "providers": [
    {
      "id": "moonshot",
      "name": "Moonshot 月之暗面 (Kimi)",
      "baseUrl": "https://api.moonshot.cn/anthropic",
      "api": "anthropic-messages",
      "authHeader": true,
      "apiKey": "sk-...",
      "models": ["moonshot-v1-128k", "moonshot-v1-32k"],
      "contextWindow": 128000
    }
  ],
  "settings": {
    "footer": ["mode", "model", "context"]
  }
}
```

- `providers`：用户添加的供应商/模型；`--add-model` / `/models add` 可继续添加，同 id 自动合并。
- `providers[].contextWindow`：该供应商模型的上下文窗口（tokens），用于状态栏上下文占用统计；缺省按 128000 估算。
- `settings.footer`：底部状态栏显示项，可用值 `mode`（ask/plan/auto）、`model`、`context`（上下文占用百分比，API 用量优先）、`cache`（提示词缓存命中率）、`thinking`（思考级别）、`cwd`（工作目录），由 `/settings` 勾选保存。

## 透明性设计

与传统 CLI 不同，HyCode 把"发生了什么"显式暴露给用户：

1. **配置可读**：所有供应商/模型/密钥明文存于 `~/.hycode/providers.json`，可随时查看修改
2. **错误透传**：认证失败、模型未找到等错误直接打印原因，不包装
3. **单文件源码**：全部逻辑集中在 `src/cli.ts`，可读、可审计、可 fork

## 项目结构

```
hycode/
├── package.json          # 依赖 pi-coding-agent / pi-tui（file: 指向本地构建）
├── tsconfig.build.json   # tsgo 编译配置
├── src/
│   └── cli.ts            # 全部 CLI 逻辑（单文件）
├── docs/
│   └── build-process.md  # 创建过程记录
└── dist/
    └── cli.js            # 构建产物
```

## 技术栈

- **运行时**：Node.js ≥ 22.19
- **编译**：TypeScript (tsgo / @typescript/native-preview)
- **框架**：[@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi)（本地构建）
- **终端 UI**：[@earendil-works/pi-tui](https://github.com/earendil-works/pi)（本地构建）：TuiMainScreen 差分渲染、Editor/Input、Markdown、SelectList/SettingsList、Loader、命令自动补全
- **模型协议**：Anthropic Messages / OpenAI Completions（兼容各类网关）

## License

MIT
