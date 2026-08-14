# codingcli 创建过程全记录

> 目标：以 **pi-coding-agent** 为框架，构建一个替代 Claude Code 的终端产品。
> 亮点：**简约**（单文件、零噪音）+ **透明**（决策可观测、错误不藏黑盒）。

---

## 0.5.27 变更（overlay 贴近输入框 + 思考等级固定四档 + 思考条目头部去等级）

- **所有输入框相关 overlay 贴近命令行**：`/thinking`、`/models`、`/buddy`、`/settings`、`/resume`、`@` 浏览器、快捷键面板、添加向导的选择列表/对话框，此前锚定终端底部（文档不满一屏或全屏状态栏垫底时离输入框很远）；现改为按**输入框实际屏幕位置**定位——终端顺沿模式取文档中输入框顶边行（含视口偏移），全屏模式取状态栏上方一行，列表底边恒贴输入框顶边上一行；
- **思考等级固定四档**：`/thinking`（回车交互式）不再按模型能力过滤，固定显示 `off / low / medium / high` 四档（当前档标注"（当前）"），映射 pi 底层同名字段；LLM 不支持思考时自动落回 off（`setThinkingLevel` 内部 clamp，反馈消息会注明实际生效值）；`--thinking` 参数与帮助文本同步只收四档；
- **思考条目头部不再显示等级**：`⚛ 思考` 条目去掉"等级: xxx"提示（启动时不再提示思考等级）；等级信息保留在状态栏（`思考等级:xxx`，footer 可配）与 `/thinking` 反馈消息中。

---

## 0.5.28 变更（/mode 回车交互式选择 + 贴近输入框 + 映射 pi 底层）

- **`/mode` 回车交互式选择**：此前 `/mode` 不带参数只显示当前模式文本，不能直接选择，与 `/thinking` 交互不一致；现无参数时在**输入框上方**弹出三档高亮选择列表 `ask / plan / auto`（当前档标注"（当前）"，副标题注明含义：无工具 / 只读 / 完整工具），↑/↓ 回车切换，Esc 取消；
- **选择后映射 pi 底层**：无论交互选择还是 `/mode <名称>` 直接传参，均通过 `session.setActiveToolsByName` 映射 pi 底层——ask→空工具集、plan→`read/grep/find/ls`（与 pi 的 `createReadOnlyToolDefinitions` 完全一致）、auto→恢复会话初始工具集；反馈消息注明含义（如 `已切换模式: plan（只读）`），状态栏 `模式:` 同步更新；
- **帮助与补全同步**：`/help` 中 `/mode` 标注"回车交互式选择"，斜杠命令自动补全描述同步更新。

---

## 0.5.26 变更（修正 Logo 版本号挤压变形）

- **Logo 改为统一矩形**：版本号此前直接拼在第 0 行末尾，使第 0 行（62 列）比图案行（53–56 列）更长——窄宽度下只有第 0 行换行、顶部图案断裂，宽宽度下版本号突出于图案之外，看起来"挤压变形"；现 `renderLogo` 将**所有行补齐到同一宽度**（= 图案 + 2 空格 + 版本号），版本号整洁地落在右上角，任何宽度下都是规整的 logo 块，不再有行突出或单行换行；
- 图案本身不变（仍为 ANSI Shadow HYCODE），仅在渲染时统一宽度。

---

## 0.5.25 变更（思考与工具分开两行，移到对话框上方）

- **思考与工具拆成两条独立条目，回到对话框上方**：v0.5.23 把思考与工具合并成一条"最新活动"信息行，导致工具执行后思考被覆盖、看起来"思考没了"；现恢复为两条——`⚛ 思考`（每用户回合一个，显示当前回合思考过程）与 `🖥️ 工具`（全部工具调用），各恒占一行、互不覆盖；
- **两行都在对话框上方**：终端顺沿布局 `对话消息 → 思考 → 工具 → 状态栏 → 绿色输入框（最底部）`，对话框始终贴终端最底行；思考与工具增长发生在对话框上方、推向滚动历史，不挤动输入框；
- **单行滚动 + Ctrl+T 展开/折叠**：折叠态各恒一行（思考显示最新片段、工具显示最新调用及 ✓/✗，空白压平、尾截滚动）；Ctrl+T 同时展开/折叠两条（一按全展开、再按全折叠），展开显示思考全文 / 工具完整历史（上限 40 条）；无内容时各自占位一行，布局稳定。

---

## 0.5.24 变更（新增宠物：哈帕狗 🐶）

- **新增第二只宠物「哈帕狗」**：金色小黄狗（🐶），动画与猫咪同构（睁眼吐舌 → 眨眼 → 呼吸 → 摇尾 → 困倦），右上角 `___` 头顶 + 圆脸 + 吐舌 `v` + 摇尾 `~`；`/buddy` 选择器自动收录，可 `🐱 猫咪 / 🐶 哈帕狗` 高亮切换，`/buddy pug` 或 `/buddy 哈帕狗` 直达；
- **宠物支持独立配色**：`BuddySpec` 新增可选 `bodyColor`/`accentColor`（默认仍为猫咪橙色+浅绿），哈帕狗使用金色身体（`38;5;178`），后续新增宠物可各自配色。

---

## 0.5.23 变更（信息区移到对话框下方，对话框固定不动 + /buddy 键盘失效修复）

- **信息区迁移到对话框下方**：终端顺沿布局改为 `对话消息 → 绿色输入框 → 状态栏 → 工具/思考`；状态栏与工具/思考区**恒各占一行**（空内容也渲染不可见占位行），信息区高度恒定 → 对话框固定在原位不动，不再被下方内容推动；
- **思考与工具合并为一条活动信息**：`ActivityEntry` 取代原思考/工具两个条目——折叠态恒一行滚动（最新活动：⚛ 思考片段 或 🖥️ 工具调用 + ✓/✗），Ctrl+T 展开显示完整历史（按时间顺序：思考正文 + 全部工具调用，上限 40 条）；
- **修复 /buddy 后输入失效**：宠物叠层此前未设 `nonCapturing`，`showOverlay` 会把焦点抢到宠物组件上，而它没有 `handleInput`，导致所有按键都被吞掉；现改为 `nonCapturing: true`，宠物纯装饰不抢焦点，输入框恢复正常。

---

## 0.5.22 变更（工具调用折叠为单行滚动，Ctrl+T 展开完整历史）

- **工具调用同思考一样折叠**：不再每个工具堆叠一行（占大量显示空间）；折叠态只显示**最新一条**工具调用（图标 + 名称 + 具体操作 + ✓/✗），单行滚动、不增加行数；Ctrl+T 展开显示**完整工具历史堆叠**（上限 40 条，超出丢弃最旧），再次 Ctrl+T 折叠；
- **Ctrl+T 作用于最近活动条目**：思考或工具，谁最近活动就折叠/展开谁（思考流式或工具开始/结束时更新指向）；
- 快捷键帮助同步为 `Ctrl+T 折叠/展开思考/工具`。

---

## 0.5.21 变更（工具展示移到对话框上方，对话框始终贴底）

- **工具/思考展示移到对话框上方**：终端顺沿（默认）模式布局改为 `对话消息 → 工具/思考 → 状态栏 → 绿色输入框`，绿色输入框作为最后一个组件**始终贴着终端最底行**；工具/思考增长发生在输入框上方、推向滚动历史，绿色对话框保持唯一稳定。

---

## 0.5.20 变更（思考折叠恒单行 + 绿色输入框稳定）

- **思考折叠恒为单行**：思考文本常含换行导致折叠条目撑成多行、挤压显示——折叠预览先压平空白（`\s+ → " "`）再截断，**始终只占一行、行内滚动**；仅 Ctrl+T 展开时才显示完整多行（已验证含换行文本折叠=1 行、展开=多行）；
- **绿色输入框稳定不被动**：终端顺沿模式布局改为 `对话 → 绿色输入框 → 状态栏 → 工具/思考（最底部）`，工具/思考增长发生在输入框下方，不再挤动输入框；每用户回合思考仍只一个 ⚛ 条目。

---

## 0.5.19 变更（状态栏移到输入框下方 + 思考每回合一次）

- **状态栏（模式:auto 等）移到绿色输入框下方**：全屏布局 `HStack(对话|工具面板) → 输入框 → 状态栏`；终端顺沿布局 `对话 → 工具/思考 → 输入框 → 状态栏`；工具/思考不干扰输入框（输入框保持单一固定组件）；
- **思考每用户回合一次**：`thinkingEntry` 重置回到 `message_start(用户)`（撤销按 agent 回合拆分），后续回合的思考增量合并进同一 ⚛ 条目——"思考一次，然后执行工具或结束"，不再"思考后又来一次思考"；已用事件序列模拟 3 种场景验证；
- **思考流式显示**：折叠单行按宽度尽量填满显示最新内容（不足/不满行均可），展开显示完整流式文本。

---

## 0.5.18 变更（思考/工具按时间顺序 + 工具显示移到对话框下方）

- **思考与工具按时间顺序交错**：`turn_start` 重置思考条目（不再一个用户回合合并一个 ⚛ 条目），每个 agent 回合的思考独立成条目、在发生的位置追加——`⚛ 思考 → 🖥️ bash → ⚛ 思考` 严格按执行顺序，不再把所有思考堆在最上面；已用事件序列模拟 3 种场景验证；
- **工具执行显示移到对话框下方**：终端顺沿（默认）模式布局改为 `对话消息 → 状态栏 → 工具/思考 → 输入框`，与对话区分离、不混淆；全屏模式保持右上侧面板。

---

## 0.5.17 变更（工具详情 + 思考中只出现一次 + 原子图标）

- **"思考中…"只出现一次**：Loader 在用户回合开始创建，**首个内容（思考或回复文本）流式出现即隐藏**（`hideLoader`：stop + 移除），不再全程重复显示；思考工具（⚛ 条目）与工具活动本身就是处理中指示；
- **工具条目显示具体操作**：`toolDetail` 提取执行内容——`🖥️ bash: ls -la`（命令行）、`📄 read: src/cli.ts`（路径）、`✏️ edit: README.md`、`🔍 grep: TODO` 等；超长截断 48 字符；完成追加 `✓/✗`；
- **思考图标改为 DSH 同款原子结构 ⚛**（原 💭）。

---

## 0.5.16 变更（全屏改为可选项，默认终端顺沿）

- **默认终端顺沿（TuiMainScreen）**：不再默认全屏；消息/工具/思考随终端滚动历史流动，`settings.fullscreen` 缺省 false；
- **全屏可选项**：`/fullscreen` 切换 `settings.fullscreen` 并持久化（重启生效）；全屏模式保留右侧工具面板/ScrollView/搜索（TuiAltScreen）；
- 两种模式共用同一套逻辑（@ 浏览器、? 快捷键、向导、Esc 取消、Ctrl+T 等）。

---

## 0.5.15 变更（添加模型后默认选中第一个）

- **REPL `/models add` 后自动关联**：当前未选择模型时，添加完成后默认选中新供应商的**第一个模型**（`session.setModel` + 状态栏联动，提示"已默认选择模型: …（/model 可修改）"）；
- **启动默认选第一个**：`onlyModel`（仅单模型）升级为 `firstModel`（首个供应商的首个模型）——只要存在已添加模型，无 `-m` 时启动即选中第一个（此前多模型默认未选择）；用户随时 `/model` 修改；
- 已实测：3 个模型无 `-m` 的 once 问答自动走 ds/deepseek-chat。

---

## 0.5.14 变更（任意弹层 Esc 取消 + 预设 URL 自动填充）

- **任意子项目列表/向导步骤可 Esc 取消**：PromptAdapter 的 `askText`/`askSecret` 支持 `undefined`（取消）；键盘适配器 `inputText/inputSecret` 增加 Esc → undefined；TUI 适配器 `PromptDialog` 拦截 Esc → `onCancel` → undefined；SelectList 类弹层本就 Esc 取消。任意一步 Esc 即整体退出向导；
- **预设供应商 URL 自动填充官方默认**：预设流程简化为 3 步（选择供应商 → API Key → 模型 ID），不再询问 URL（官方默认直接使用，供应商名后已标注地址）；自定义流程保持 9 步（含手动 URL/协议/认证/窗口）。

---

## 0.5.13 变更（向导式添加：Key 在前、模型 ID 在后）

- **向导分步编号**：所有提问带 `[第 N/M 步]` 进度（预设流程 4 步、自定义流程 9 步），从平铺表单改为向导式；
- **顺序调整**：预设流程 = 选择供应商 → API 地址（官方默认可改）→ **API Key（掩码）** → **模型 ID（支持多个，逗号分隔）**；Key 先填、模型 ID 后填；
- 模型 ID 提示明确"支持多个、添加几个即可切换几个"。

---

## 0.5.12 变更（预设精简 + 模型 ID 现填防过期）

- **预设精简为 4 家国产热门 + 自定义**：DeepSeek、Moonshot（Kimi）、智谱（GLM）、MiniMax；移除 Qwen/豆包/ERNIE/Yi/Step/硅基流动/星火；
- **预设流程调整**：选择供应商后 **URL 官方默认（可改）**；**模型 ID 由用户现填**（官方 ID 会迭代，如 DeepSeek 的 deepseek-chat/reasoner，防止过期）；**API Key 掩码输入**；上下文窗口沿用预设值。

---

## 0.5.11 变更（logo 版本号水印 + ? 即时快捷键面板）

- **logo 右上角版本号**：`renderLogo()` 在第 1 行末尾注入暗色小字版本号（商标风格），后续行保持绿色；启动头与退出画面统一使用；
- **`?` 即时快捷键面板**：`editor.onChange` 检测输入 `?`/`？` 即弹出快捷键 overlay（non-capturing，编辑器保持焦点可继续输入）；继续输入或删除 `?` 自动消失；回车仅关闭面板不再作为消息发送；`/help` 仍显示完整命令。

---

## 0.5.10 变更（logo 纯净 + ? 只弹快捷键）

- **logo 下不再放任何文字**：启动头仅 HYCODE logo（删除版本行/提示行）；
- **`?` 只弹出快捷键**：新增 `SHORTCUTS`（Esc 中止、Ctrl+T 折叠思考、Ctrl+Shift+F 搜索、Tab 补全、导航 + @/!/!! 简述），与 `/help`（完整斜杠命令）区分不重复；`?`/`？`/`/?` → 快捷键，`/help` → 完整帮助。

---

## 0.5.9 变更（弹层定位统一 + 国产供应商预设 + 掩码 Key + 帮助收敛）

- **所有命令行弹层贴近输入框**：/models、/settings、/resume、添加向导（文本/掩码/选择）与 @ 浏览器统一 `INPUT_OVERLAY_OPTIONS`（bottom-left + offset(1,-1) + 45% 宽 + maxHeight 60%），不再居中；
- **国产常用 LLM 供应商预设（11 家）**：DeepSeek、Moonshot(Kimi)、智谱 GLM、阿里百炼 Qwen、字节火山方舟、百度千帆 ERNIE、MiniMax、零一 Yi、阶跃 Step、硅基流动、讯飞星火——官方 baseUrl + 模型 ID + 上下文窗口内置，向导选择后**只需输入 API Key**；
- **掩码输入**：`MaskedInput`（继承 pi-tui Input，render 显示为 `***` + 光标标记），REPL 内 `/models add` 的 API Key 也掩码显示；
- **logo 下提示收敛**：删除"模型添加/使用提示"行，logo 下仅保留版本行；新增 **`?` 命令**（及 `/?`）弹出完整命令与快捷键帮助（含 Esc 中止、Ctrl+T 折叠思考、Ctrl+Shift+F 搜索、Tab 补全等）；
- **模型选择联动**：`/models add/remove/reset` 后调用 `updateStatus()`，状态栏 `模型:` 实时更新（清空后显示"未选择"），选择模型后同步显示。

---

## 0.5.8 变更（退出画面优化）

- **干净退出**：`TuiAltScreen.stop({ preserveScreen: true })` 不再把整份对话文档重放到主缓冲（文档比屏高时 logo 会被滚出/遮挡）；改为保留屏幕 → 清屏 → 展示 HYCODE logo + "再见！会话记录已保存，下次运行 /resume 可恢复。" 后退出；`/exit`、`exit`、`Ctrl+C` 统一走 `farewell()`。

---

## 0.5.7 变更（@ 浏览器定位修正）

- **@ 目录浏览器定位改为输入框上方**：`showOverlay` 使用 `anchor: "bottom-left" + offsetX:1 + offsetY:-1`（紧跟输入框中 @ 的位置弹出，像自动补全一样贴行上浮），不再屏幕居中；`width: 45%`、`minWidth: 30`、`maxHeight: 60%` 限制尺寸，递归下钻时保持同一定位；其余命令式弹层（/models、/settings 等）保持居中。

---

## 0.5.6 变更（思考并入工具面板 + DSH 同款图标 + 折叠/展开）

- **思考迁移到右侧工具面板**：思考本质视为一种工具——`thinking_delta` 渲染为面板中的"💭 思考"条目（每用户回合一个），回复区只显示纯文本；
- **DSH 同款图标**：每种工具一个图标（💭思考 / 🖥️bash / 📄read / ✏️edit / 📝write / 🔍grep / 🔎find / 📂ls / 🛠️未知），工具行 `图标 名称 ✓/✗`；
- **思考折叠/展开**：`ThinkingEntry` 组件，默认折叠为**单行滚动**（`💭 思考 …最新片段`），**Ctrl+T** 切换展开（完整流式内容、按面板宽度折行，折叠提示也在展开头行）；全局按键监听，不干扰编辑器；
- 已用脚本验证 ThinkingEntry 渲染（折叠尾部、展开折行、空文本占位）。

---

## 0.5.5 变更（@ 输入即开浏览器 + 上下文计算对齐 DSH）

- **@ 输入即开目录浏览器**：`editor.onChange` 检测到输入 `@`（纯路径、无空格）立即打开目录浏览器（无需回车）；目录 → 递归下钻、文件 → 附加；`atBrowserOpen` 防叠层、Esc 关闭后同一次输入不再自动重开（`atBrowserDismissed`，清空或非 @ 文本后复位）；补全改为仅斜杠命令的 `SlashCommandProvider`（去掉 @ 模糊补全，避免双 UI 冲突）；附加后残留的 @ 前缀在提交时剥离为基于附件的提问；
- **上下文计算对齐 DSH**（源码核对 `dsh-token-meter` 的 `contextPressureProjectionDefinition` 与 UI 的 `contextOccupancy`）：压力 = `input + cacheRead + cacheWrite`（已有）；百分比 = `Math.min(100, Math.round(压力/窗口*100))`（整数、上限 100）；缓存命中 = `cacheRead/总输入`；
- **模型窗口目录自动匹配**：内置常见模型 contextWindow（DeepSeek 1M、Kimi 131072、GPT-4o 128k、Claude 200k 等），`registerProvider` 未配置时自动套用；向导提问默认值显示目录建议；旧配置中遗留的默认 128000 且模型命中目录 → 自动迁移为目录值；
- 已用脚本验证 @ onChange 决策（9 项）与目录匹配（4 项）。

---

## 0.5.4 变更（@ 交互式目录浏览器）

- **`@` 回车打开目录浏览器**（SelectList overlay）：列出当前目录的文件夹（`/` 后缀，优先）与文件，`↑/↓` + 回车选择；选文件夹继续递归下钻，选文件即附加（`pendingAttachment`），随后提问自动带入该文件内容（`（请基于文件 X 回答/工作）` + `<file>` 内容块 + 问题）；
- **`@路径` 直达**：`@文件` 直接附加、`@目录` 进入该目录浏览、`@./x` 相对路径、`@workspace`/`@.` 展开工作区树、未匹配原样保留（8 项决策逻辑已脚本验证）；
- **`/attach` 命令**：等价于输入 `@` 回车，便于发现；
- Editor 回车提交前会先取消补全，因此 `@` + 回车可稳定进入浏览器。

---

## 0.5.3 变更（上下文百分比 + 缓存命中 + @ 工作空间引用）

- **上下文显示改为纯百分比**：`上下文:N%`（<10% 保留一位小数）。优先用最后一次请求的 **API 用量**（`usage.input + cacheRead + cacheWrite`，DeepSeek 等网关的 `prompt_cache_hit_tokens` 已由 pi 映射进 cacheRead），无用量时退回 pi 估算；不再显示 token/窗口数字；
- **新增"缓存"状态栏项**（`/settings` 可勾选）：`缓存:N%` = cacheRead / 总输入，展示提示词缓存命中率（DeepSeek 自动前缀缓存等）；
- **@ 引用展开**：输入 `@` 由 Editor 自动补全文件/文件夹（目录优先）；提交时展开——`@文件` → `<file>` 内容块（上限 12000 字符）、`@目录` → `<folder>` 目录树（上限 400 项，跳过隐藏/node_modules）、`@workspace`/`@.` → `<workspace>` 工作区树；未匹配路径与邮箱等保留原样；主回合与排队(steer)消息均生效。已用独立脚本验证 7 种场景（文件/目录/工作区/相对路径/不存在/邮箱/混合）。

---

## 0.5.2 变更（工具活动独立面板）

- **工具活动移到对话框右上侧面板**：`HStack` 布局（消息区 + 右侧 22 列工具面板，终端宽度 <90 自动隐藏）；工具调用按 `toolCallId` 配对显示 `⟳ bash ✓/✗`（绿✓/红✗），`ScrollView` 滚动回滚、上限 40 条；
- **回复区不再包含工具标记**：思考预览与回复文本纯流式显示，互不干扰；`/copy` 依旧只复制纯文本；
- 已用 faux provider 实测：多回合（工具+思考+文本）回复区无工具标记、面板含 bash；单回合无工具回复正常。

---

## 0.5.1 变更（上下文统计修正 + 减少无谓工具调用 + 流式渲染修复）

- **流式渲染修复（关键）**：pi 的 agent 循环对**每个工具轮次**都发 `turn_start`/`turn_end`，且 `turn_start` 先于 `message_start(用户)` 到达。旧实现按 turn_start/turn_end 建/收流式目标，导致工具轮次后（最终回复、思考增量）全部被丢弃——表现为"只见 [read] 无下文、不显示思考"。现改为：`message_start(用户消息)` 时创建/切换目标、`agent_end(非重试)` 收尾，目标跨工具轮次持久；工具日志与回复文本分离（`tools`/`text`/`thinking` 字段），`/copy` 只复制纯文本。已用 pi 的 faux provider 实测多回合（工具+思考+文本）与单回合（无工具）两种事件序列验证。
- **上下文窗口可配置**：`ConfiguredProvider.contextWindow`（向导新增"上下文窗口 tokens"输入，缺省 128000）；`registerProvider` 用真实窗口计算，`maxTokens = min(32000, contextWindow)`；状态栏上下文显示改为 `上下文:x.xk/128k N%`（tokens/窗口/百分比）；
- **APPEND_SYSTEM.md**：首次创建会话时写入 `~/.hycode/agent/APPEND_SYSTEM.md`（已存在则不覆盖），追加到系统提示词：简单问答直接回答、不要无谓/重复调用工具（read/bash 每轮必调的主因）；已实测写入并被系统提示词加载；
- **思考过程可见**：`thinking_delta` 以明文预览展示（截断 600 字符，回复文本出现后自动替换）；
- 修复合入时上下文窗口保留；`--list-models` 显示供应商上下文窗口。

---

## 0.5.0 变更（全屏界面 + 完整能力迁移）

- **TuiAltScreen 全屏模式**：`TuiAltScreen` + `VStack` 布局（`ScrollView` 滚动消息区 + 状态栏 + 输入框），应用自有滚动（鼠标滚轮/键盘）、`Ctrl+Shift+F` 会话内搜索、退出时恢复主缓冲并打印完整对话；
- **消息队列（steering）**：忙碌时输入框保持可用，Enter 提交即排队（`session.prompt(..., { streamingBehavior: "steer" })`），回合结束后由模型处理；按 `turn_start`/`turn_end` 事件统一渲染主回合与排队回合；
- **Esc 中止**：全局输入监听，忙碌且无 overlay 时 `Esc` → `session.abort()`；
- **会话管理**：`/session`（ID/文件/消息数/上下文）、`/new`（`SessionManager.create` 新会话，重建运行时）、`/resume`（扫描 session 目录 + `SessionManager.open` + 重建）、`/compact`（`session.compact()`）；`replaceSession` 先 abort 再 dispose；
- **/thinking**：`session.setThinkingLevel`（off/low/medium/high），状态栏新增"思考"项（`/settings` 可勾选）；
- **/copy**：`copyToClipboard`（coding-agent 导出）复制最后一条助手回复；
- **bash 快捷**：`!命令`（执行 + 输出发给模型，走 `runPrompt`）、`!!命令`（仅执行显示输出）；
- **会话目录**：`sessionDirFor()` 复刻 pi 的 `getDefaultSessionDir`（`agentDir/sessions/--编码cwd--`），`createSession` 接受可选 `SessionManager`（/new、/resume 复用）；
- 保留 once 模式纯文本输出与 standalone 键鼠向导。

---

## 0.4.0 变更（迁移到 pi-tui 聊天界面）

- **新增依赖**：`@earendil-works/pi-tui`（`file:../pi/packages/tui`，pi 自家 TUI 框架，差分渲染 + CSI 2026 无闪烁）；
- **REPL 全面重写为 pi-tui**：
  - `TuiMainScreen`（主缓冲渲染，保留滚动历史）+ `ProcessTerminal`；
  - 消息流：用户消息与助手回复用 `Markdown` 组件（多行、代码高亮），助手回复**多行流式**渲染（替换 0.3.x 的"换行合并单行"折衷）；等待时用 `Loader` 转圈；
  - 输入：`Editor` 组件（多行、假光标、粘贴处理、Enter 提交），配 `CombinedAutocompleteProvider` 实现 `/` 斜杠命令自动补全 + Tab 文件补全（替换手写 COMMAND_HINT）；
  - `/models`：`SelectList` overlay 高亮选择（替换手写 selectFromList 的 REPL 用法）；
  - `/settings`：`SettingsList` overlay 勾选状态栏项（替换手写 checkboxSelect）；
  - 状态栏：`Text` 组件动态刷新；错误/提示走 `say()` 灰色小字（不再写 stderr，避免破坏 TUI）；
  - 主题：复用 coding-agent 的 `initTheme("dark")` + `getMarkdownTheme/getSelectListTheme/getSettingsListTheme`；
- 向导（`/models add`）在 REPL 内用 `PromptDialog`（提示 + Input overlay）与 SelectList 实现，复用同一 `collectProvider`；standalone 的 `--add-model`/`--reset` 键鼠向导保持不变；
- 删除手写盒子渲染（boxTop/boxBottom/displayWidth/wrapText/printUserBox）、`clearInputLines`、命令提示（COMMAND_HINT）、readline 版 REPL 适配器；
- once 模式（脚本/管道）保持纯文本输出不变。

---

## 0.3.1 变更（命令提示 + 修复）

- **输入 `/` 自动列出命令**：REPL 输入框内敲下 `/`（行首）即在输入行下方列出全部斜杠命令（固定行数渲染，键盘继续输入时自动隐藏/保留，回车提交时随输入行一并清除）；基于 Node readline 的 `keypress` 流（readline 在 TTY 下将事件发到 stdin 流上，`stdin.on('keypress')` 可收到）；
- **修复 Logo**：H 字形此前误用了 X 形笔画（`╚██╗██╔╝` 等），现按 ANSI Shadow 标准字形重绘，正确显示 HYCODE；
- **修复选择器下移**：`selectFromList` / `checkboxSelect` 的 `listHeight` 少算 1 行（渲染块 = 标题 + items + 提示 = N+2 行），导致每次重绘整体下移一行；已修正，选择时终端保持不动、仅高亮移动。

---

## 0.3.0 变更（对话框式界面 + 交互选择）

- **启动 Logo**：HYCODE ASCII 横幅 + 版本号 + 状态提示（Claude Code 风格）；
- **对话框式 REPL**：用户消息/模型回复分块展示（`┌─ 标题 ─┐ … └──┘`），输入提示由 `>>>` 改为 `❯`，回复结束后状态栏 + 空行，`❯` 出现在下一行；
- **单模型自动选中**：配置中恰好只有一个模型时启动自动选中；多个模型保持默认为空；
- **`/models` 高亮选择**：↑/↓ 移动、回车切换、Esc 取消（keypress 选择器，支持初始定位到当前模型）；
- **`/mode ask|plan|auto`**：ask=无工具、plan=只读工具（read/grep/find/ls）、auto=完整工具，通过 `session.setActiveToolsByName` 切换；
- **`/settings` 状态栏定制**：checkbox 复选底部状态栏显示项（mode/model/context/cwd），持久化到 `providers.json` 的 `settings.footer`；
- **`hycode --reset`**：确认后删除 `~/.hycode` 全部配置/会话，重新走添加模型引导流程；
- `selectFromList` 增加 Esc 取消（返回 -1）与初始选中下标；新增 `checkboxSelect` 复选选择器。

---

## 0.2.0 变更（模型机制重构）

- **模型默认为空**：删除内置供应商预设与首次引导（onboarding），`/models` 初始为空；
- **自添加模型**：`hycode --add-model`（键盘向导）与 REPL 内 `/models add`（行输入向导）添加自己的供应商/模型，添加几个即可切换几个；
- **切换**：REPL 内 `/model <名称>`，仅限用户已添加的模型（严格按 `~/.hycode/providers.json` 解析，不触碰 pi 内置模型目录）；
- **单行回复**：REPL 中模型回复的换行合并为空格（终端自动折行），回复结束后提示符出现在下一行；工具调用以行内标记 `[⟳ name]` / `✓` / `✗` 展示；
- **不再自动选模型**：供应商在会话创建之后注册，避免 pi 的 `findInitialModel` 自动挑选第一个可用模型；
- 移除 `-p/--provider` 与 `--setup` 参数；`-m` 支持 `provider/model` 与裸 `model` 两种写法。

---

## 1. 前置：准备 pi-coding-agent 框架

codingcli 依赖的 `@earendil-works/pi-coding-agent` 是一个 TypeScript monorepo，需要先把它克隆到本地并完成构建。

### 0.1 克隆仓库（国内网络）

GitHub 直连在国内不稳定，实测方案：

- 本机环境变量 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7892/` 指向一个**未运行**的代理软件，导致所有网络请求失败（连百度都不通）。
- 真正解法：`unset HTTP_PROXY HTTPS_PROXY` 后直连，或使用 GitHub 加速镜像。

```bash
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
git -c http.proxy= -c https.proxy= clone https://ghfast.top/https://github.com/earendil-works/pi.git
```

实测镜像 `ghfast.top` 稳定（约 500KB/s，60MB 仓库 3 分半钟下完）。

### 0.2 安装依赖（绕过 canvas 编译失败）

`npm install` 全量安装时，`packages/ai` 的 devDependency `canvas`（原生模块）在 Windows 上 node-gyp 编译失败。由于 canvas 仅用于测试、非运行时依赖，改用只装生产依赖：

```bash
npm install --omit=dev --no-audit --no-fund
```

### 0.3 构建（绕过模型数据缺失）

构建 `packages/ai` 需要联网拉取模型目录数据（`src/providers/data/*.json`），但该目录被 gitignore、且 `generate-models` 联网失败。解法：从 npm 已发布的同版本包中提取数据文件：

```bash
npm pack @earendil-works/pi-ai@0.84.1
tar -xzf earendil-works-pi-ai-0.84.1.tgz
cp package/dist/providers/data/*.json packages/ai/src/providers/data/
cp package/dist/providers/data/.manifest.json packages/ai/src/providers/data/   # 注意隐藏文件
npm run build:offline
```

> 关键坑：`*.json` 通配符不匹配 `.manifest.json` 隐藏文件，需单独复制，否则 `check:model-data` 校验失败。

### 0.4 逐个构建依赖包

`build:offline` 在 `shx rm -rf dist/providers/data` 步骤因 Windows 文件锁失败（文件其实已删除），改为手动补复制 + 逐个构建：

```bash
# 手动复制模型数据到 ai dist
mkdir -p packages/ai/dist/providers/data
cp -r packages/ai/src/providers/data/* packages/ai/dist/providers/data/

# 逐个构建剩余包
cd packages/agent && npm run build
cd ../session-backends/sqlite-node && npm run build
cd ../../protocol && npm run build
cd ../client && npm run build
cd ../server && npm run build
cd ../coding-agent && npm run build
```

构建产物 `packages/coding-agent/dist/index.js` 生成后，框架就绪。

---

## 1. 创建 codingcli 项目

```bash
mkdir codingcli && cd codingcli
mkdir src
```

### 1.1 package.json

依赖通过 `file:` 指向本地构建的 pi 包：

```json
{
  "name": "codingcli",
  "type": "module",
  "bin": { "codingcli": "dist/cli.js" },
  "dependencies": {
    "@earendil-works/pi-ai": "file:../pi/packages/ai",
    "@earendil-works/pi-coding-agent": "file:../pi/packages/coding-agent"
  },
  "devDependencies": {
    "@types/node": "22.19.19",
    "@typescript/native-preview": "7.0.0-dev.20260120.1"
  }
}
```

> 关键点：npm 把 `file:` 依赖链接（symlink）到 pi 仓库，Node 运行时沿 symlink 真实路径解析到 pi 根 node_modules 的传递依赖，所以无需在 codingcli 重复安装全部依赖。

### 1.2 tsconfig.build.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

> `lib` 需含 `DOM`，否则 `fetch` 的 `Response.ok` 类型报错。

---

## 2. 实现 CLI（src/cli.ts，单文件 670 行）

### 2.1 核心 API 选型

从 pi-coding-agent SDK 中选用三个关键能力：

```typescript
import { createAgentSession, ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";

// 1. 模型运行时（管理 provider、模型目录、鉴权）
const modelRuntime = await ModelRuntime.create({ ... });

// 2. 创建会话（注入模型、工具、设置）
const { session } = await createAgentSession({ cwd, model, modelRuntime, tools, ... });

// 3. 订阅流式事件，逐字输出
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// 4. 发送用户输入
await session.prompt("问题");
```

### 2.2 双模式设计

- **once 模式**（`codingcli "问题"`）：一问一答，适合脚本/管道
- **REPL 模式**（`codingcli`）：node:readline 循环，`busy` 标志串行化请求，流式输出

### 2.3 参数解析

手写 switch 解析（不引入第三方 arg 解析库，保持零依赖）：
`-m/--model`、`-p/--provider`、`-t/--thinking`、`--tools`、`--readonly`、`--no-tools`、`--api-key`、`--base-url`、`--auth-token`、`-c/--cwd`、`--agent-dir`、`-l/--list-models`、`-v/--version`、`-h/--help`。

---

## 3. 关键难点：网关兼容（Anthropic 协议）

用户环境用的是 Kimi/Moonshot 的 Anthropic 兼容网关（Claude Code 风格配置）：

```bash
ANTHROPIC_BASE_URL=https://api.moonshot.cn/anthropic
ANTHROPIC_AUTH_TOKEN=sk-...
ANTHROPIC_MODEL=kimi-k2-turbo-preview
```

### 3.1 问题一：pi 库不读 ANTHROPIC_BASE_URL

pi 的 anthropic provider 硬编码 `baseUrl: "https://api.anthropic.com"`，只读 `ANTHROPIC_AUTH_TOKEN`（作为 Bearer 头），不读 `ANTHROPIC_BASE_URL`。直接请求会打到官方 API 而失败。

**解法**：用 `ModelRuntime.registerProvider()` 注册自定义 provider：

```typescript
runtime.registerProvider("gateway", {
  name: "Anthropic-compatible gateway",
  baseUrl: gateway.baseUrl,        // 指向用户网关
  apiKey: gateway.token,
  authHeader: true,                 // Authorization: Bearer <token>
  api: "anthropic-messages",        // 复用 anthropic-messages 协议
  models: [ /* 候选模型列表 */ ],
});
```

### 3.2 问题二：模型无权限（kimi-k2 系列 404）

`ANTHROPIC_MODEL=kimi-k2-turbo-preview` 在该账号下返回 `404 Not found the model ... or Permission denied`，而 `moonshot-v1-*` 系列可用。

**解法**：增加**模型自探测**——注册多个候选模型后，逐个发极小的 messages 请求探测，选第一个可用的：

```typescript
async function probeGatewayModel(baseUrl, token, candidates) {
  for (const model of candidates) {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, max_tokens: 4, messages: [{ role: "user", content: "hi" }] }),
    });
    if (res.ok) return model;
  }
}
```

并**透明地提示用户**切换结果：

```
提示: 模型 "kimi-k2-turbo-preview" 在该网关不可用，已自动切换为 "moonshot-v1-128k"
```

### 3.3 问题三：Credential store 读取被安全机制拦截

`ModelRuntime.streamSimple` 内部会读 `~/.pi/agent/auth.json`，而工作环境的 safe-delete 安全机制会拦截文件操作，导致 `Credential store read failed`，响应为空。

**解法**：给 `ModelRuntime.create()` 传入**内存版 CredentialStore**，完全绕开文件系统：

```typescript
class InMemoryCredentialStore {
  private credentials = new Map();
  async read(providerId) { return this.credentials.get(providerId); }
  async list() { return [...this.credentials.keys()].map(p => ({ providerId: p, type: "api_key" })); }
  async modify(providerId, fn) { /* ... */ }
  async delete(providerId) { this.credentials.delete(providerId); }
}

ModelRuntime.create({ credentials: new InMemoryCredentialStore(), ... });
```

> 这是最终打通全链路的关键一步。绕开文件系统后，网关问答、模型切换、工具调用全部正常。

---

## 4. 斜杠命令（REPL 内）

REPL 支持斜杠命令，与 Claude Code 交互习惯一致：

| 命令 | 说明 |
|------|------|
| `/model` | 查看当前模型 |
| `/model <名称>` | 切换模型（`provider/id` 或仅 `id`） |
| `/models` | 列出所有可用模型（`*` 标记当前） |
| `/help` | 显示命令帮助 |
| `/exit` `/quit` | 退出 |

实现要点：
- 通过 `session.modelRuntime.getModel(provider, id)` 查找目标模型，`session.setModel(model)` 切换
- 网关模式下默认在 `gateway` provider 查找；非网关跨所有 provider
- 切换后 `session.model` 立即更新，后续 `prompt` 自动用新模型（已验证）

## 5. 验证

```bash
# 编译
npx tsgo -p tsconfig.build.json

# 网关问答（自动探测模型）
codingcli "用一句话介绍你自己"
# → 我是你的编程助手，擅长阅读文件、执行命令、编辑代码和写新文件。

# 指定模型
codingcli -m moonshot-v1-32k "1+1等于几？直接回答"
# → 2

# 只读模式（工具调用）
codingcli --readonly "当前目录下有哪些文件？"
# → 正常列出文件

# 模型列表
codingcli --list-models
```

---

## 6. 成果与文件清单

```
codingcli/
├── README.md             # 产品定位、部署方式、斜杠命令说明
├── package.json          # 依赖 pi-coding-agent（file: 本地链接）
├── tsconfig.build.json   # tsgo 编译配置
├── docs/build-process.md # 本文档：完整创建过程
├── src/cli.ts            # 全部 CLI 逻辑（单文件）
└── dist/cli.js           # 构建产物
```

**最终效果**：一个零第三方 arg 依赖、单文件、支持网关自动探测与 `/model` 切换的轻量终端编码助手，已通过 `npm link` 全局可用（`codingcli` 命令）。

---

## 7. 踩坑清单（速查）

| # | 坑 | 解法 |
|---|-----|------|
| 1 | 失效代理 `127.0.0.1:7892` 阻断所有网络 | `unset HTTP_PROXY HTTPS_PROXY` + 用镜像 |
| 2 | `canvas` 原生编译失败 | `npm install --omit=dev` |
| 3 | 模型数据被 gitignore 且联网拉取失败 | 从 npm 包提取数据文件 |
| 4 | `*.json` 不匹配 `.manifest.json` | 隐藏文件单独复制 |
| 5 | `shx rm -rf` Windows 文件锁失败 | 手动补复制，跳过该步 |
| 6 | pi 库不读 `ANTHROPIC_BASE_URL` | `registerProvider` 自定义网关 |
| 7 | kimi-k2 模型无权限 404 | 模型自探测 + 透明提示切换 |
| 8 | Credential store 读取被 safe-delete 拦截 | 内存版 CredentialStore |
| 9 | `fetch` 的 `Response.ok` 类型缺失 | tsconfig `lib` 加 `DOM` |
