#!/usr/bin/env node
/**
 * HyCode - 轻量级终端编码助手
 *
 * 以 @earendil-works/pi-coding-agent 为框架构建，定位 Claude Code 的开源替代。
 * 核心亮点：简约（单文件、零噪音）+ 透明（决策可观测、错误不藏黑盒）。
 *
 * 模型机制：
 * - 默认没有任何模型，/models 初始为空，不内置任何供应商预设；
 * - 用户通过 `hycode --add-model` 或 REPL 内 `/models add` 添加自己的模型，
 *   添加几个就支持在几个模型之间用 `/model` 或 `/models` 高亮选择切换；
 * - 只有一个模型时自动选中它；
 * - REPL 采用对话框式界面：启动 Logo + 对话分块展示 + 底部状态栏 + `❯` 输入提示，
 *   模型回复以单行流式输出（换行合并为空格）；
 * - `hycode --reset` 重置出厂设置并重新走引导流程。
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { copyToClipboard, createAgentSession, getMarkdownTheme, getSelectListTheme, getSettingsListTheme, initTheme, ModelRuntime, SessionManager, SettingsManager, } from "@earendil-works/pi-coding-agent";
import { Container, CURSOR_MARKER, Editor, HStack, Input, isViewportTUI, Loader, Markdown, matchesKey, ProcessTerminal, ScrollView, SelectList, SettingsList, Text, truncateToWidth, visibleWidth, wrapTextWithAnsi, TuiAltScreen, TuiMainScreen, VStack, } from "@earendil-works/pi-tui";
/** 用户可选思考等级（映射 pi 底层同名字段；LLM 不支持思考时自动落回 off） */
const THINKING_LEVELS_ALL = ["off", "low", "medium", "high"];
const FOOTER_ITEMS = [
    { key: "mode", label: "当前模式（ask/plan/auto）" },
    { key: "model", label: "当前模型（provider/id）" },
    { key: "context", label: "上下文占用百分比" },
    { key: "cache", label: "提示词缓存命中率" },
    { key: "cwd", label: "工作目录" },
    { key: "thinking", label: "思考等级（off/low/medium/high）" },
];
const DEFAULT_FOOTER = ["mode", "model", "context"];
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HYCODE_DIR = join(homedir(), ".hycode");
const CONFIG_PATH = join(HYCODE_DIR, "providers.json");
const AGENT_DIR = join(HYCODE_DIR, "agent");
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const HELP_TEXT = `HyCode - 以 pi-coding-agent 为框架的轻量级终端编码助手

用法:
  HyCode [选项] [问题...]

模式:
  （无参数）              进入交互式对话（REPL）：Logo + 对话框 + 底部状态栏 + ❯ 提示
  HyCode "问题"           单次问答模式（需用 -m 指定模型）

模型管理:
  --add-model             交互式添加模型（可多次运行；添加几个即可切换几个）
  --reset                 重置出厂设置（删除全部配置/会话）并重新走引导流程
  -l, --list-models       列出已添加的模型

选项:
  -m, --model <名称>      指定模型，格式 provider/model 或仅 model（须已添加）
  -t, --thinking <等级>   思考等级: off | low | medium | high（默认 medium；LLM 不支持时自动 off）
      --tools <列表>      逗号分隔的工具白名单，如 read,bash,edit,write,grep,find,ls
      --readonly          只读模式（仅 read/grep/find/ls，不启用 bash/edit/write）
      --no-tools          禁用全部工具（纯对话）
  -c, --cwd <目录>        工作目录（默认当前目录）
  -v, --version           显示版本
  -h, --help              显示帮助

示例:
  HyCode --add-model                                # 首次使用：添加自己的模型
  HyCode -m openai/gpt-4o "你好"                    # 指定模型单次问答
  HyCode                                            # 交互式对话（/models add 添加，/model 切换）
  HyCode --readonly "分析当前目录的代码"              # 只读模式
`;
/** 启动 Logo（Claude Code 风格横幅，ANSI Shadow 字体 HYCODE；原始无色文本） */
const LOGO = ` ██╗  ██╗ ██╗   ██╗ ██████╗ ██████╗  ██████╗ ███████╗
 ██║  ██║ ╚██╗ ██╔╝ ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝
 ███████║  ╚████╔╝  ██║      ██║   ██║ ██║  ██║ █████╗
 ██╔══██║   ╚██╔╝   ██║      ██║   ██║ ██║  ██║ ██╔══╝
 ██║  ██║    ██║    ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗
 ╚═╝  ╚═╝    ╚═╝     ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝`;
/**
 * 渲染 Logo：版本号放在第 0 行右上角（商标风格，暗色小字）。
 * 所有行补齐到同一宽度——logo 为统一矩形，版本号不再突出于图案之外（避免"挤压变形"），
 * 窄宽度下整块等比截断/换行，而不是只有第 0 行突出。
 */
function renderLogo() {
    const lines = LOGO.split("\n");
    const ver = `v${version()}`;
    // 目标宽度 = 第 0 行图案 + 2 空格 + 版本号
    const targetWidth = visibleWidth(lines[0]) + 2 + visibleWidth(ver);
    const padded = lines.map((line, i) => {
        if (i === 0)
            return `${line}  ${DIM}${ver}${RESET}${GREEN}`;
        return line + " ".repeat(Math.max(0, targetWidth - visibleWidth(line)));
    });
    return `${GREEN}${padded.join("\n")}${RESET}`;
}
/** 只读模式工具集 */
const PLAN_TOOLS = ["read", "grep", "find", "ls"];
// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------
function isConfiguredProvider(value) {
    const p = value;
    if (!p || typeof p !== "object")
        return false;
    return (typeof p.id === "string" &&
        typeof p.baseUrl === "string" &&
        typeof p.apiKey === "string" &&
        Array.isArray(p.models) &&
        p.models.every((m) => typeof m === "string") &&
        (p.api === "anthropic-messages" || p.api === "openai-completions") &&
        (p.contextWindow === undefined || (typeof p.contextWindow === "number" && p.contextWindow > 0)));
}
/** 加载配置；缺失或损坏时返回空配置（模型默认为空） */
function loadConfig() {
    try {
        if (existsSync(CONFIG_PATH)) {
            const raw = readFileSync(CONFIG_PATH, "utf8");
            const cfg = JSON.parse(raw);
            if (cfg && Array.isArray(cfg.providers)) {
                const providers = cfg.providers.filter(isConfiguredProvider);
                // 迁移：旧版硬编码默认 128000 且模型命中目录 → 用目录窗口（如 DeepSeek 1M）
                for (const p of providers) {
                    if (p.contextWindow === 128000) {
                        const cat = catalogWindow(p.models);
                        if (cat !== undefined && cat !== 128000)
                            p.contextWindow = cat;
                    }
                }
                return { providers, settings: normalizeSettings(cfg.settings) };
            }
        }
    }
    catch {
        // 损坏的配置文件按空配置处理
    }
    return { providers: [], settings: { footer: [...DEFAULT_FOOTER] } };
}
function normalizeSettings(settings) {
    const valid = new Set(FOOTER_ITEMS.map((it) => it.key));
    const footer = Array.isArray(settings?.footer)
        ? settings.footer.filter((k) => valid.has(k))
        : [...DEFAULT_FOOTER];
    return { footer: footer.length > 0 ? footer : [...DEFAULT_FOOTER], fullscreen: settings?.fullscreen === true };
}
function saveConfig(config) {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, "\t") + "\n", "utf8");
}
function initKeypress(stdin) {
    const s = stdin;
    if (s._hycodeKeypress)
        return;
    s._hycodeKeypress = true;
    emitKeypressEvents(stdin);
    if (stdin.isTTY && typeof stdin.setRawMode === "function") {
        stdin.setRawMode(true);
    }
}
function waitKey(stdin, stdout, handler) {
    const onKey = (str, key) => handler(str, key);
    stdin.on("keypress", onKey);
    return () => stdin.removeListener("keypress", onKey);
}
/** 键盘导航单选列表，返回选中下标。渲染内容固定，不可被输入擦除。 */
function selectFromList(stdin, stdout, title, items, initialIndex = 0, hint = "↑/↓ 选择，回车确认，Esc 取消") {
    return new Promise((resolve) => {
        let selected = Math.max(0, Math.min(initialIndex, items.length - 1));
        // 渲染块 = 标题 + items + 提示，共 items.length + 2 行
        const listHeight = items.length + 2;
        let drawn = false;
        const render = () => {
            const lines = [];
            if (drawn) {
                lines.push(`\x1b[${listHeight}A\x1b[J`);
            }
            lines.push(`${title}\n`);
            for (let i = 0; i < items.length; i++) {
                const cursor = i === selected ? `${GREEN}❯${RESET}` : " ";
                const body = i === selected ? `${GREEN}${items[i]}${RESET}` : items[i];
                lines.push(`  ${cursor} ${body}\n`);
            }
            lines.push(`  ${hint}\n`);
            stdout.write(lines.join(""));
            drawn = true;
        };
        const cleanup = waitKey(stdin, stdout, (_str, key) => {
            if (key.name === "up") {
                selected = (selected - 1 + items.length) % items.length;
                render();
            }
            else if (key.name === "down") {
                selected = (selected + 1) % items.length;
                render();
            }
            else if (key.name === "return") {
                cleanup();
                resolve(selected);
            }
            else if (key.name === "escape") {
                cleanup();
                resolve(-1);
            }
            else if (key.ctrl && key.name === "c") {
                cleanup();
                process.exit(1);
            }
        });
        render();
    });
}
/** 普通文本输入（可见回显）。 */
function inputText(stdin, stdout, prompt) {
    return new Promise((resolve) => {
        stdout.write(prompt);
        let buffer = "";
        const cleanup = waitKey(stdin, stdout, (str, key) => {
            if (key.name === "return") {
                cleanup();
                stdout.write("\n");
                resolve(buffer.trim());
            }
            else if (key.name === "backspace") {
                if (buffer.length > 0) {
                    buffer = buffer.slice(0, -1);
                    stdout.write("\b \b");
                }
            }
            else if (key.name === "escape") {
                cleanup();
                resolve(undefined); // Esc 取消
            }
            else if (key.ctrl && key.name === "c") {
                cleanup();
                process.exit(1);
            }
            else if (str && str.length === 1 && str >= " ") {
                buffer += str;
                stdout.write(str);
            }
        });
    });
}
/** 掩码输入：每输入一个字符回显一个 *，支持退格删除。 */
function inputSecret(stdin, stdout, prompt) {
    return new Promise((resolve) => {
        stdout.write(prompt);
        let buffer = "";
        const cleanup = waitKey(stdin, stdout, (str, key) => {
            if (key.name === "return") {
                cleanup();
                stdout.write("\n");
                resolve(buffer.trim());
            }
            else if (key.name === "backspace") {
                if (buffer.length > 0) {
                    buffer = buffer.slice(0, -1);
                    stdout.write("\b \b");
                }
            }
            else if (key.name === "escape") {
                cleanup();
                resolve(undefined); // Esc 取消
            }
            else if (key.ctrl && key.name === "c") {
                cleanup();
                process.exit(1);
            }
            else if (str && str.length === 1 && str >= " ") {
                buffer += str;
                stdout.write("*");
            }
        });
    });
}
// ---------------------------------------------------------------------------
// Prompt adapters（同一套添加向导，两种输入环境）
// ---------------------------------------------------------------------------
/** standalone 模式（hycode --add-model）：键盘选择 + 掩码输入 */
function createKeypressAdapter(stdin, stdout) {
    return {
        askText: (prompt) => inputText(stdin, stdout, prompt),
        askSecret: (prompt) => inputSecret(stdin, stdout, prompt),
        askChoice: (title, items) => selectFromList(stdin, stdout, title, items),
    };
}
/** REPL 模式（/models add 等）：基于 pi-tui 的 overlay 对话框（贴近输入框定位，Esc 可取消） */
function createTuiPromptAdapter(tui, selectListTheme, editorHeight) {
    const askText = (prompt) => new Promise((resolve) => {
        const input = new Input();
        const dialog = new PromptDialog(prompt, input);
        const overlay = tui.showOverlay(dialog, inputOverlayOptions(tui, editorHeight()));
        dialog.onCancel = () => {
            overlay.hide();
            resolve(undefined); // Esc 取消
        };
        input.onSubmit = (value) => {
            overlay.hide();
            resolve(value);
        };
        tui.requestRender();
    });
    const askSecret = (prompt) => new Promise((resolve) => {
        const input = new MaskedInput(); // 掩码显示为 ***
        const dialog = new PromptDialog(prompt, input);
        const overlay = tui.showOverlay(dialog, inputOverlayOptions(tui, editorHeight()));
        dialog.onCancel = () => {
            overlay.hide();
            resolve(undefined); // Esc 取消
        };
        input.onSubmit = (value) => {
            overlay.hide();
            resolve(value);
        };
        tui.requestRender();
    });
    const askChoice = (title, items) => new Promise((resolve) => {
        const list = new SelectList(items.map((label) => ({ value: label, label })), items.length, selectListTheme);
        const overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
        list.onSelect = (item) => {
            overlay.hide();
            resolve(items.indexOf(item.value));
        };
        list.onCancel = () => {
            overlay.hide();
            resolve(-1);
        };
        tui.requestRender();
    });
    return { askText, askSecret, askChoice };
}
/** 提示文字 + 输入框的对话框组件（overlay 焦点落在 Input 上；Esc 触发 onCancel） */
class PromptDialog {
    prompt;
    input;
    onCancel;
    constructor(prompt, input) {
        this.prompt = prompt;
        this.input = input;
    }
    render(width) {
        return [`${DIM}${this.prompt}${RESET}`, ...this.input.render(width)];
    }
    handleInput(data) {
        if (matchesKey(data, "escape")) {
            this.onCancel?.(); // Esc 取消当前向导步骤
            return;
        }
        this.input.handleInput(data);
    }
    invalidate() {
        this.input.invalidate?.();
    }
}
/** 仅斜杠命令的补全（@ 交给交互式目录浏览器，避免两套 @ UI 冲突） */
class SlashCommandProvider {
    commands;
    constructor(commands) {
        this.commands = commands;
    }
    async getSuggestions(lines, cursorLine, cursorCol, _options) {
        const currentLine = lines[cursorLine] ?? "";
        const textBeforeCursor = currentLine.slice(0, cursorCol);
        if (!textBeforeCursor.startsWith("/"))
            return null;
        if (textBeforeCursor.includes(" "))
            return null;
        const prefix = textBeforeCursor.slice(1);
        const items = this.commands
            .filter((cmd) => cmd.name.startsWith(prefix))
            .map((cmd) => ({ value: cmd.name, label: cmd.name, description: cmd.description || undefined }));
        if (items.length === 0)
            return null;
        return { items, prefix: textBeforeCursor };
    }
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        const currentLine = lines[cursorLine] ?? "";
        const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
        const afterCursor = currentLine.slice(cursorCol);
        const newLine = `${beforePrefix}/${item.value} ${afterCursor}`;
        const newLines = [...lines];
        newLines[cursorLine] = newLine;
        return { lines: newLines, cursorLine, cursorCol: beforePrefix.length + item.value.length + 2 };
    }
}
/** 工具图标（DSH 同款风格：每种工具一个图标；思考为原子结构 ⚛） */
const TOOL_ICONS = {
    thinking: "⚛",
    bash: "🖥️",
    read: "📄",
    edit: "✏️",
    write: "📝",
    grep: "🔍",
    find: "🔎",
    glob: "🔍",
    ls: "📂",
    notify: "🔔",
};
function toolIcon(name) {
    return TOOL_ICONS[name] ?? "🛠️";
}
/** 工具执行的具体内容（bash=命令行，read/edit/write=路径，grep=模式） */
function toolDetail(name, args) {
    const a = args;
    if (!a || typeof a !== "object")
        return "";
    try {
        switch (name) {
            case "bash":
                return typeof a.command === "string" ? a.command : "";
            case "read":
            case "write":
            case "edit":
            case "ls": {
                const p = a.filePath ?? a.path;
                return typeof p === "string" ? p : "";
            }
            case "grep":
            case "find": {
                const p = a.pattern ?? a.path;
                return typeof p === "string" ? p : "";
            }
            default:
                return "";
        }
    }
    catch {
        return "";
    }
}
/** 截断工具详情（面板宽度有限） */
function truncateDetail(detail, max = 48) {
    return detail.length > max ? `${detail.slice(0, max)}…` : detail;
}
/** 工具/思考条目的堆叠上限（超出丢弃最旧） */
const MAX_TOOL_ENTRIES = 40;
/**
 * 思考条目（对话框上方，独立一行）：
 * 折叠态 → 恒一行滚动（显示最新思考片段）；展开态 → 完整流式内容（Ctrl+T 切换）。
 * 每用户回合重置：显示当前回合的思考过程。
 */
class ThinkingEntry {
    text = "";
    collapsed = true;
    /** 新用户回合：清空，开始记录本轮思考 */
    reset() {
        this.text = "";
    }
    /** 追加思考增量 */
    append(delta) {
        this.text = (this.text + delta).slice(0, 20000);
    }
    get hasContent() {
        return this.text.length > 0;
    }
    toggle() {
        this.collapsed = !this.collapsed;
    }
    invalidate() {
        // 无缓存，无需处理
    }
    render(width) {
        const head = "⚛ 思考";
        if (this.collapsed) {
            if (!this.hasContent)
                return [head]; // 无内容也占一行，保持布局稳定
            // 单行滚动：思考文本常含换行，先压平为单行；只铺满一行、不增加行数
            const single = this.text.replace(/\s+/g, " ");
            const available = Math.max(4, width - 8);
            const tail = single.slice(-available);
            const preview = single.length > available ? `…${tail.slice(1)}` : tail;
            return [truncateToWidth(`${head} ${preview}`, width)];
        }
        const body = this.text.length > 0 ? this.text : "（思考中…）";
        return [`${head}（Ctrl+T 折叠）`, ...wrapTextWithAnsi(body, Math.max(8, width - 2))];
    }
}
/**
 * 工具调用条目（对话框上方，独立一行）：
 * 折叠态 → 恒一行滚动（显示最新一条工具调用及完成状态）；展开态 → 完整工具历史堆叠（Ctrl+T 切换）。
 */
class ToolEntry {
    records = [];
    collapsed = true;
    /** 记录一条工具调用开始（icon + 名称 + 具体操作，如 🖥️ bash: ls -la） */
    start(id, base) {
        this.records.push({ id, base, done: false, error: false });
        if (this.records.length > MAX_TOOL_ENTRIES)
            this.records.shift();
    }
    /** 标记一条工具调用完成（✓/✗） */
    finish(id, isError) {
        const rec = this.records.find((r) => r.id === id);
        if (rec) {
            rec.done = true;
            rec.error = isError;
        }
    }
    get hasRecords() {
        return this.records.length > 0;
    }
    toggle() {
        this.collapsed = !this.collapsed;
    }
    invalidate() {
        // 无缓存，无需处理
    }
    line(rec) {
        const mark = rec.done ? (rec.error ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`) : "";
        return `${rec.base} ${mark}`.trimEnd();
    }
    render(width) {
        if (!this.hasRecords)
            return [`${DIM}🛠️ 工具${RESET}`]; // 无内容也占一行，保持布局稳定
        if (this.collapsed) {
            // 单行滚动：显示最新一条工具调用，只铺满一行、不增加行数
            const single = this.line(this.records[this.records.length - 1]).replace(/\s+/g, " ");
            const available = Math.max(4, width - 8);
            const tail = single.slice(-available);
            const preview = single.length > available ? `…${tail.slice(1)}` : tail;
            return [truncateToWidth(preview, width)];
        }
        const lines = [`🛠️ 工具（Ctrl+T 折叠）`];
        for (const rec of this.records) {
            lines.push(truncateToWidth(this.line(rec), width));
        }
        return lines;
    }
}
/** 输入框相关 overlay 的基础定位参数（贴近输入框上方，而非终端底部） */
const INPUT_OVERLAY_BASE = {
    anchor: "bottom-left",
    offsetX: 1,
    width: "45%",
    minWidth: 30,
    maxHeight: "60%",
};
/**
 * 输入框相关 overlay 定位：列表底边紧贴输入框顶边上一行（靠近命令行，而非终端底部）。
 * 终端顺沿模式：输入框是文档最后一个子组件，文档不满一屏时输入框不在终端底部，
 * 需按输入框实际屏幕位置计算；全屏模式：状态栏（1 行）垫底，输入框在其上方。
 */
function inputOverlayOptions(tui, editorHeight) {
    const width = tui.terminal.columns;
    const height = tui.terminal.rows;
    let editorTop;
    if (isViewportTUI(tui)) {
        // 全屏：状态栏占最后 1 行，输入框直接在其上方
        editorTop = height - 1 - editorHeight;
    }
    else {
        // 终端顺沿：输入框是文档最后一个子组件；文档高度 = 已渲染总行数
        const docHeight = tui.render(width).length;
        const viewportTop = Math.max(0, docHeight - height);
        editorTop = docHeight - editorHeight - viewportTop; // 输入框顶边所在屏幕行
    }
    editorTop = Math.max(0, editorTop);
    // 列表底边 = 输入框顶边上一行；底边锚点（height-1）加上 offsetY
    const offsetY = editorTop - height;
    return { ...INPUT_OVERLAY_BASE, offsetY };
}
// ---------------------------------------------------------------------------
// 宠物（buddy）系统：终端角落的动画小伙伴，/buddy 召唤与选择（后期可加多个）
// ---------------------------------------------------------------------------
/** 宠物身体色（橙色，适合猫咪） */
const BUDDY_BODY = "\x1b[38;5;214m";
/** 宠物点缀色（浅绿：眼睛/尾巴） */
const BUDDY_ACCENT = "\x1b[38;5;114m";
/** 当前唯一宠物：猫咪（坐姿睁眼 → 眨眼 → 呼吸 → 摇尾 → 困倦） */
const BUDDY_CAT = {
    id: "cat",
    name: "猫咪",
    emoji: "🐱",
    interval: 450,
    accentChars: "o-.~",
    frames: [
        [
            "  /\\_/\\     ",
            " ( o.o )    ",
            "  > ^ <     ",
            " /  ~  \\    ",
            "/______\\~   ",
        ],
        [
            "  /\\_/\\     ",
            " ( o-. )    ",
            "  > ^ <     ",
            " /  ~  \\    ",
            "/______\\~   ",
        ],
        [
            "  /\\_/\\     ",
            " ( o.o )    ",
            "  > ^ <     ",
            "/   ~   \\   ",
            "/________\\  ",
        ],
        [
            "  /\\_/\\     ",
            " ( o.o )    ",
            "  > ^ <     ",
            " /  ~  \\    ",
            "/~______\\   ",
        ],
        [
            "  /\\_/\\     ",
            " ( - - )    ",
            "  > ^ <     ",
            " /  ~  \\    ",
            "/______\\~   ",
        ],
    ],
};
/** 第二只宠物：哈帕狗（吐舌坐姿 → 眨眼 → 呼吸 → 摇尾 → 困倦），金色身体 */
const BUDDY_PUG = {
    id: "pug",
    name: "哈帕狗",
    emoji: "🐶",
    interval: 450,
    accentChars: "o-.v~",
    bodyColor: "\x1b[38;5;178m", // 金色（适合小黄狗）
    frames: [
        [
            "  /___\\     ",
            " ( o.o )    ",
            " (  v  )    ",
            "  > ~ <     ",
            " /______\\~  ",
        ],
        [
            "  /___\\     ",
            " ( o-. )    ",
            " (  v  )    ",
            "  > ~ <     ",
            " /______\\~  ",
        ],
        [
            "  /___\\     ",
            " ( o.o )    ",
            " (  v  )    ",
            " /  ~  \\    ",
            "/_________\\ ",
        ],
        [
            "  /___\\     ",
            " ( o.o )    ",
            " (  v  )    ",
            "  > ~ <     ",
            " /~______\\  ",
        ],
        [
            "  /___\\     ",
            " ( - - )    ",
            " (  v  )    ",
            "  > ~ <     ",
            " /______\\~  ",
        ],
    ],
};
/** 全部可选宠物（后期新增：往这里追加条目即可，/buddy 选择器自动收录） */
const BUDDIES = [BUDDY_CAT, BUDDY_PUG];
/** 给一帧行上色：点缀字符用点缀色，其余可见字符用身体色，空格/下划线保持原样 */
function colorBuddyFrame(spec, frame) {
    return frame.map((line) => {
        let out = "";
        for (const ch of line) {
            if (ch === " " || ch === "_")
                out += ch;
            else if (spec.accentChars?.includes(ch))
                out += (spec.accentColor ?? BUDDY_ACCENT) + ch + RESET;
            else
                out += (spec.bodyColor ?? BUDDY_BODY) + ch + RESET;
        }
        return out;
    });
}
/** 按显示宽度右对齐填充到指定宽度（ANSI 安全） */
function padRightToWidth(text, total) {
    const w = visibleWidth(text);
    return w >= total ? text : text + " ".repeat(total - w);
}
/** TUI 宠物组件：按帧间隔轮播动画，作为 overlay 显示在终端角落 */
class BuddyPet {
    spec;
    frameIdx = 0;
    timer;
    onFrame;
    constructor(spec, onFrame) {
        this.spec = spec;
        this.onFrame = onFrame;
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            this.frameIdx = (this.frameIdx + 1) % this.spec.frames.length;
            this.onFrame();
        }, this.spec.interval);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    invalidate() { }
    render(width) {
        const frame = this.spec.frames[this.frameIdx];
        const contentW = Math.max(...frame.map((l) => l.length));
        const boxW = Math.max(contentW, Math.min(width, contentW + 2));
        const lines = [];
        for (const raw of colorBuddyFrame(this.spec, frame)) {
            lines.push(padRightToWidth(raw, boxW));
        }
        lines.push(padRightToWidth(`${DIM}${this.spec.emoji} ${this.spec.name}${RESET}`, boxW));
        return lines;
    }
}
const PROVIDER_PRESETS = [
    {
        id: "deepseek",
        name: "DeepSeek 深度求索",
        baseUrl: "https://api.deepseek.com",
        api: "openai-completions",
        authHeader: true,
        models: ["deepseek-chat", "deepseek-reasoner"],
        contextWindow: 1_000_000,
    },
    {
        id: "moonshot",
        name: "Moonshot 月之暗面（Kimi）",
        baseUrl: "https://api.moonshot.cn/anthropic",
        api: "anthropic-messages",
        authHeader: true,
        models: ["kimi-k2-0711-preview", "moonshot-v1-128k"],
        contextWindow: 131_072,
    },
    {
        id: "zhipu",
        name: "智谱 AI（GLM）",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        api: "openai-completions",
        authHeader: true,
        models: ["glm-4-plus", "glm-4-flash"],
        contextWindow: 128_000,
    },
    {
        id: "minimax",
        name: "MiniMax 稀宇",
        baseUrl: "https://api.minimax.chat/v1",
        api: "openai-completions",
        authHeader: true,
        models: ["MiniMax-Text-01", "abab6.5s-chat"],
        contextWindow: 1_000_000,
    },
];
/** 掩码输入：输入内容显示为 ***（用于 API Key） */
class MaskedInput extends Input {
    render(width) {
        const stars = "*".repeat(this.getValue().length);
        const marker = this.focused ? CURSOR_MARKER : "";
        return [stars + marker];
    }
}
/** 常见模型上下文窗口目录（自动匹配，未配置 contextWindow 时生效） */
const MODEL_WINDOW_CATALOG = [["deepseek-chat", 1_000_000],
    ["deepseek-reasoner", 1_000_000],
    ["deepseek-v3", 1_000_000],
    ["deepseek-r1", 1_000_000],
    ["gpt-4.1", 1_000_000],
    ["gpt-5", 400_000],
    ["kimi-k2", 131_072],
    ["kimi-latest", 131_072],
    ["kimi-k2-turbo-preview", 131_072],
    ["moonshot-v1-128k", 128_000],
    ["moonshot-v1-32k", 32_000],
    ["moonshot-v1-8k", 8_000],
    ["gpt-4o", 128_000],
    ["gpt-4o-mini", 128_000],
    ["claude-sonnet-4-5", 200_000],
    ["claude-opus-4-5", 200_000],
    ["claude-3-5-sonnet", 200_000],
    ["glm-4-plus", 128_000],
    ["glm-4-flash", 128_000],
    ["qwen2.5-coder", 131_072],
    ["qwen-max", 32_000],
];
/** 按模型 ID 匹配目录中的上下文窗口 */
function catalogWindow(models) {
    for (const m of models) {
        for (const [id, w] of MODEL_WINDOW_CATALOG) {
            if (m.includes(id))
                return w;
        }
    }
    return undefined;
}
// ---------------------------------------------------------------------------
// 添加模型向导
// ---------------------------------------------------------------------------
/** 收集一个供应商 + 若干模型（向导式：分步编号；任意步骤 Esc 取消；预设 URL 自动填充官方默认）。 */
async function collectProvider(ask) {
    // ---- 步骤 1：选择供应商（内置国产常用）----
    const presetNames = PROVIDER_PRESETS.map((p) => `${p.name}（${p.baseUrl}）`);
    const customLabel = "自定义（手动输入 API 地址）";
    const choice = await ask.askChoice("选择模型供应商", [...presetNames, customLabel]);
    if (choice < 0)
        return undefined; // Esc 取消
    if (choice < PROVIDER_PRESETS.length) {
        // 预设流程：URL 官方默认自动填充，无需输入
        const preset = PROVIDER_PRESETS[choice];
        const total = 3;
        // ---- 步骤 2：API Key（先填 Key，掩码显示）----
        const apiKey = (await ask.askSecret(`[第 2/${total} 步] API Key（${preset.name}，掩码显示为 *）: `))?.trim();
        if (apiKey === undefined)
            return undefined; // Esc 取消
        if (!apiKey) {
            console.log("[错误] API Key 不能为空。");
            return undefined;
        }
        // ---- 步骤 3：模型 ID（支持多个，逗号分隔；官方 ID 会迭代，请填当前可用）----
        const modelsInput = await ask.askText(`[第 3/${total} 步] 模型 ID（支持多个，逗号分隔；请填当前可用 ID，如 ${preset.models[0]}）: `);
        if (modelsInput === undefined)
            return undefined; // Esc 取消
        const models = modelsInput
            .split(/[,，\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        if (models.length === 0) {
            console.log("[错误] 至少需要一个模型 ID。");
            return undefined;
        }
        return {
            id: preset.id,
            name: preset.name,
            baseUrl: preset.baseUrl,
            api: preset.api,
            authHeader: preset.authHeader,
            apiKey,
            models,
            contextWindow: preset.contextWindow,
        };
    }
    // ---- 自定义供应商 ----
    const total = 9;
    // ---- 步骤 2：供应商标识 ----
    const id = (await ask.askText(`[第 2/${total} 步] 供应商标识（英文，如 mygateway，留空取消）: `))?.trim();
    if (id === undefined || !id)
        return undefined; // Esc 或留空取消
    // ---- 步骤 3：显示名称 ----
    const name = (await ask.askText(`[第 3/${total} 步] 显示名称（回车默认 ${id}）: `))?.trim() || id;
    // ---- 步骤 4：API 地址 ----
    const baseUrl = (await ask.askText(`[第 4/${total} 步] API 地址（如 https://api.example.com）: `))?.trim();
    if (baseUrl === undefined)
        return undefined; // Esc 取消
    if (!baseUrl) {
        console.log("[错误] API 地址不能为空。");
        return undefined;
    }
    // ---- 步骤 5：协议类型 ----
    const apiChoice = await ask.askChoice(`[第 5/${total} 步] 协议类型`, ["Anthropic Messages", "OpenAI Completions"]);
    if (apiChoice < 0)
        return undefined; // Esc 取消
    // ---- 步骤 6：认证方式 ----
    const authChoice = await ask.askChoice(`[第 6/${total} 步] 认证方式`, ["Bearer Token", "API Key (x-api-key)"]);
    if (authChoice < 0)
        return undefined; // Esc 取消
    // ---- 步骤 7：API Key（掩码显示）----
    const apiKey = (await ask.askSecret(`[第 7/${total} 步] API Key（掩码显示；本地无鉴权服务可填 sk-local 占位）: `))?.trim();
    if (apiKey === undefined)
        return undefined; // Esc 取消
    if (!apiKey) {
        console.log("[错误] API Key 不能为空。");
        return undefined;
    }
    // ---- 步骤 8：模型 ID（支持多个）----
    const modelsInput = await ask.askText(`[第 8/${total} 步] 模型 ID（支持多个，逗号分隔，如 gpt-4o,deepseek-chat）: `);
    if (modelsInput === undefined)
        return undefined; // Esc 取消
    const models = modelsInput
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (models.length === 0) {
        console.log("[错误] 至少需要一个模型 ID。");
        return undefined;
    }
    // ---- 步骤 9：上下文窗口 ----
    const catalogDefault = catalogWindow(models) ?? 128000;
    const contextWindowRaw = (await ask.askText(`[第 9/${total} 步] 上下文窗口 tokens（回车默认 ${catalogDefault >= 1000 ? `${Math.round(catalogDefault / 1000)}k` : catalogDefault}）: `))?.trim();
    if (contextWindowRaw === undefined)
        return undefined; // Esc 取消
    const contextWindow = contextWindowRaw ? Number(contextWindowRaw) : catalogDefault;
    if (contextWindowRaw && (!Number.isInteger(contextWindow) || contextWindow <= 0)) {
        console.log("[错误] 上下文窗口必须是正整数，请重新配置。");
        return undefined;
    }
    return {
        id,
        name,
        baseUrl,
        api: apiChoice === 1 ? "openai-completions" : "anthropic-messages",
        authHeader: authChoice === 0,
        apiKey,
        models,
        contextWindow,
    };
}
/** 合并进配置：同 id 供应商更新字段并追加新模型，否则新增。 */
function upsertProvider(config, p) {
    const existing = config.providers.find((x) => x.id === p.id);
    if (existing) {
        const added = p.models.filter((m) => !existing.models.includes(m));
        existing.name = p.name;
        existing.baseUrl = p.baseUrl;
        existing.api = p.api;
        existing.authHeader = p.authHeader;
        existing.apiKey = p.apiKey;
        if (p.contextWindow)
            existing.contextWindow = p.contextWindow;
        existing.models.push(...added);
        return { added, isNew: false };
    }
    config.providers.push({ ...p, models: [...p.models] });
    return { added: [...p.models], isNew: true };
}
/** 移除 "provider" 或 "provider/model"，返回移除说明；未找到返回 undefined。 */
function removeTarget(config, target) {
    const [providerPart, modelPart] = target.includes("/") ? target.split("/") : [target, undefined];
    const idx = config.providers.findIndex((x) => x.id === providerPart);
    if (idx === -1)
        return undefined;
    const prov = config.providers[idx];
    if (modelPart) {
        const mi = prov.models.indexOf(modelPart);
        if (mi === -1)
            return undefined;
        prov.models.splice(mi, 1);
        if (prov.models.length === 0)
            config.providers.splice(idx, 1);
        return `已移除模型 ${providerPart}/${modelPart}`;
    }
    config.providers.splice(idx, 1);
    return `已移除供应商 ${providerPart}`;
}
function countModels(config) {
    return config.providers.reduce((n, p) => n + p.models.length, 0);
}
/** standalone 添加向导：hycode --add-model */
async function runStandaloneAddModel(config) {
    if (!process.stdin.isTTY) {
        console.error("[错误] --add-model 需要交互式终端（TTY）。");
        return 1;
    }
    const stdin = process.stdin;
    const stdout = process.stdout;
    initKeypress(stdin);
    console.log("");
    console.log("  添加模型 —— 添加几个模型，就支持在几个模型之间切换。");
    console.log("  （Ctrl+C 随时退出）");
    console.log("");
    const ask = createKeypressAdapter(stdin, stdout);
    let changed = false;
    let keep = true;
    while (keep) {
        const p = await collectProvider(ask);
        if (!p)
            break;
        const { added, isNew } = upsertProvider(config, p);
        changed = true;
        console.log(isNew
            ? `已添加供应商 "${p.name}"，模型: ${added.join(", ")}`
            : `已更新供应商 "${p.name}"，新增模型: ${added.join(", ")}`);
        const more = await ask.askChoice("是否继续添加？", ["否，完成", "是，继续添加"]);
        keep = more === 1;
    }
    if (stdin.isTTY && typeof stdin.setRawMode === "function") {
        stdin.setRawMode(false);
    }
    if (changed) {
        saveConfig(config);
        console.log(`配置已保存到 ${CONFIG_PATH}`);
        console.log("");
    }
    else {
        console.log("未添加任何模型。");
    }
    return 0;
}
/** 重置出厂设置：清除全部配置/会话后重新走添加模型的引导流程。 */
async function runReset() {
    if (!process.stdin.isTTY) {
        console.error("[错误] --reset 需要交互式终端（TTY）。");
        return 1;
    }
    const stdin = process.stdin;
    const stdout = process.stdout;
    initKeypress(stdin);
    console.log("");
    const choice = await selectFromList(stdin, stdout, "确认重置出厂设置？（将删除全部模型配置与历史会话，不可恢复）", ["取消", "确认重置"]);
    if (choice !== 1) {
        console.log("已取消。");
        return 0;
    }
    rmSync(HYCODE_DIR, { recursive: true, force: true });
    console.log(`已清除 ${HYCODE_DIR}`);
    console.log("");
    const fresh = loadConfig(); // 重置后必然为空配置
    return await runStandaloneAddModel(fresh);
}
// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------
function registerProvider(runtime, p) {
    const contextWindow = p.contextWindow ?? catalogWindow(p.models) ?? 128000;
    const mkModel = (id) => ({
        id,
        name: id,
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow,
        maxTokens: Math.min(32000, contextWindow),
    });
    runtime.registerProvider(p.id, {
        name: p.name,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        authHeader: p.authHeader,
        api: p.api,
        models: p.models.map(mkModel),
    });
}
function registerAllProviders(runtime, config) {
    for (const p of config.providers)
        registerProvider(runtime, p);
}
/** 供应商被修改/删除后同步注册表：存在则重注册，否则注销。 */
function syncProvider(runtime, config, providerId) {
    const p = config.providers.find((x) => x.id === providerId);
    if (p)
        registerProvider(runtime, p);
    else
        runtime.unregisterProvider(providerId);
}
// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
    const opts = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => (i + 1 < argv.length ? argv[++i] : undefined);
        switch (arg) {
            case "-h":
            case "--help":
                opts.help = true;
                break;
            case "-v":
            case "--version":
                opts.version = true;
                break;
            case "-m":
            case "--model": {
                const v = next();
                if (!v)
                    throw new Error(`${arg} 需要一个参数`);
                opts.model = v;
                break;
            }
            case "-t":
            case "--thinking": {
                const v = next();
                if (!v || !THINKING_LEVELS_ALL.includes(v)) {
                    throw new Error("--thinking 参数必须是 off | low | medium | high");
                }
                opts.thinkingLevel = v;
                break;
            }
            case "--tools": {
                const v = next();
                if (!v)
                    throw new Error("--tools 需要一个参数");
                opts.tools = v.split(",").map((s) => s.trim()).filter(Boolean);
                break;
            }
            case "--readonly":
                opts.readonlyTools = true;
                break;
            case "--no-tools":
                opts.noTools = true;
                break;
            case "-c":
            case "--cwd": {
                const v = next();
                if (!v)
                    throw new Error(`${arg} 需要一个参数`);
                opts.cwd = v;
                break;
            }
            case "--add-model":
                opts.addModel = true;
                break;
            case "--reset":
                opts.reset = true;
                break;
            case "-l":
            case "--list-models":
                opts.listModels = true;
                break;
            default:
                if (arg.startsWith("-"))
                    throw new Error(`未知参数: ${arg}`);
                positional.push(arg);
        }
    }
    if (positional.length > 0) {
        opts.prompt = positional.join(" ");
    }
    return opts;
}
// ---------------------------------------------------------------------------
// Model resolution（严格限定于用户已添加的模型）
// ---------------------------------------------------------------------------
/** 仅当模型同时存在于配置（用户添加）且已注册到 runtime 时才返回。 */
function findConfiguredModel(runtime, config, providerId, modelId) {
    const p = config.providers.find((x) => x.id === providerId);
    if (!p || !p.models.includes(modelId))
        return undefined;
    return runtime.getModel(providerId, modelId);
}
/** 解析 -m 指定的模型；未指定返回 undefined（默认为空）。找不到则抛出。 */
function resolveStartupModel(runtime, config, opts) {
    if (!opts.model)
        return undefined;
    let targetProvider;
    let targetId = opts.model;
    if (opts.model.includes("/")) {
        const [p, m] = opts.model.split("/");
        targetProvider = p;
        targetId = m;
    }
    const providers = targetProvider ? [targetProvider] : config.providers.map((x) => x.id);
    for (const pid of providers) {
        const m = findConfiguredModel(runtime, config, pid, targetId);
        if (m)
            return m;
    }
    throw new Error(`未找到模型 "${opts.model}"。已添加的模型用 hycode --list-models 查看。`);
}
function listConfiguredModels(config) {
    const total = countModels(config);
    if (total === 0) {
        console.log("尚未添加任何模型。运行 hycode --add-model 添加。");
        return;
    }
    console.log(`已添加模型（${total} 个）:`);
    for (const p of config.providers) {
        const win = p.contextWindow ? `（上下文 ${Math.round(p.contextWindow / 1000)}k）` : "";
        console.log(`  [${p.name}] ${p.baseUrl}${win}`);
        for (const m of p.models) {
            console.log(`    ${p.id}/${m}`);
        }
    }
}
// ---------------------------------------------------------------------------
// In-memory credential store
// ---------------------------------------------------------------------------
/**
 * 内存版 CredentialStore：避免读写 pi 的 auth.json 文件，
 * 规避 Windows 环境下安全删除机制对文件操作的影响。
 * HyCode 的 API Key 由 registerProvider 直接注入 provider。
 */
class InMemoryCredentialStore {
    credentials = new Map();
    async read(providerId) {
        return this.credentials.get(providerId);
    }
    async list() {
        return [...this.credentials.keys()].map((providerId) => ({ providerId, type: "api_key" }));
    }
    async modify(providerId, fn) {
        const current = this.credentials.get(providerId);
        const next = await fn(current);
        if (next === undefined) {
            this.credentials.delete(providerId);
        }
        else {
            this.credentials.set(providerId, next);
        }
        return next;
    }
    async delete(providerId) {
        this.credentials.delete(providerId);
    }
}
// ---------------------------------------------------------------------------
// Runtime & session creation
// ---------------------------------------------------------------------------
async function createRuntime() {
    return ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        authPath: join(AGENT_DIR, "auth.json"),
        modelsPath: null, // 模型宇宙严格等于用户添加，不加载 pi 的 models.json
    });
}
/** 会话存储目录（与 pi 的 getDefaultSessionDir 一致：agentDir/sessions/--编码cwd--） */
function sessionDirFor(cwd) {
    return join(AGENT_DIR, "sessions", `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`);
}
/**
 * 若 ~/.hycode/agent/APPEND_SYSTEM.md 不存在则写入交互规范：
 * 提醒模型简单问题直接回答、避免无谓/重复的工具调用（bash/read 每轮必调的主因）。
 * 文件透明可编辑/删除；已存在（用户改过）时尊重不覆盖。
 */
function ensureAppendSystemPrompt() {
    const path = join(AGENT_DIR, "APPEND_SYSTEM.md");
    if (existsSync(path))
        return;
    try {
        mkdirSync(AGENT_DIR, { recursive: true });
        writeFileSync(path, [
            "# HyCode 交互规范（此文件可编辑/删除以调整助手行为）",
            "",
            "- 对于简单的问答、闲聊、解释、总结等无需操作文件或执行命令的请求，直接回答即可，不要为了回答而调用工具。",
            "- 只有确实需要读取/搜索文件、执行命令或修改代码时，才调用对应工具（read/bash/edit/write）。",
            "- 避免重复读取已经了解过的文件或重复执行相同命令。",
            "- 回答保持简洁、直接。",
            "",
        ].join("\n"), "utf8");
    }
    catch {
        // 写入失败不阻塞（仅丢失该提示）
    }
}
async function createSession(opts, modelRuntime, model, sessionManager) {
    const cwd = opts.cwd ? join(process.cwd(), opts.cwd) : process.cwd();
    let tools;
    if (opts.readonlyTools) {
        tools = ["read", "grep", "find", "ls"];
    }
    else if (opts.tools) {
        tools = opts.tools;
    }
    const settingsManager = SettingsManager.inMemory({
        compaction: { enabled: false },
    });
    ensureAppendSystemPrompt();
    const { session } = await createAgentSession({
        cwd,
        agentDir: AGENT_DIR,
        model,
        thinkingLevel: opts.thinkingLevel,
        modelRuntime,
        tools,
        noTools: opts.noTools ? "all" : undefined,
        settingsManager,
        sessionManager: sessionManager ?? SessionManager.create(cwd, sessionDirFor(cwd)),
    });
    return session;
}
// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------
/**
 * 订阅流式事件。
 * singleLine（REPL）：模型回复的换行合并为空格（单行输出，终端自动折行），
 * 工具调用以行内标记展示；回复结束后提示符出现在下一行。
 */
function subscribeStreaming(session, singleLine) {
    session.subscribe((event) => {
        switch (event.type) {
            case "message_update": {
                const ev = event.assistantMessageEvent;
                if (ev.type === "text_delta") {
                    process.stdout.write(singleLine ? ev.delta.replace(/\r?\n/g, " ") : ev.delta);
                }
                break;
            }
            case "tool_execution_start":
                if (singleLine)
                    process.stdout.write(`${DIM} [⟳ ${event.toolName}]${RESET}`);
                break;
            case "tool_execution_end":
                if (singleLine)
                    process.stdout.write(`${DIM}${event.isError ? " ✗" : " ✓"}${RESET}`);
                break;
        }
    });
}
/**
 * 检查最近一次 turn 是否失败，若失败则打印错误信息。
 * pi 库在请求失败时（如 401）不抛异常，只把 stopReason 标为 error，
 * 需要显式检查并报告，避免"无回复"的静默失败。
 */
function reportError(session) {
    const state = session.state;
    const errMsg = state.errorMessage;
    if (errMsg) {
        process.stderr.write(`\n[请求失败] ${errMsg}\n`);
        return;
    }
    const last = state.messages?.[state.messages.length - 1];
    if (last && last.role === "assistant" && last.stopReason === "error" && last.errorMessage) {
        process.stderr.write(`\n[请求失败] ${last.errorMessage}\n`);
    }
}
const MODE_NAMES = ["ask", "plan", "auto"];
const MODE_DESC = {
    ask: "无工具",
    plan: "只读",
    auto: "完整工具",
};
const REPL_HELP = `斜杠命令:
  /model [名称]          查看或切换模型（/model openai/gpt-4o）
  /models                高亮选择模型（↑/↓ 回车切换，Esc 取消）
  /models add            交互式添加模型/供应商
  /models remove <目标>   移除模型或供应商
  /models reset          清空所有已添加的模型
  /mode [ask|plan|auto]  切换模式（回车交互式选择）: ask（无工具）/ plan（只读）/ auto（完整工具）
  /thinking [等级]       思考等级: off / low / medium / high（回车交互式选择；LLM 不支持时自动 off）
  /settings              自定义底部状态栏显示项
  /session               查看当前会话信息
  /new                   开始新会话
  /resume                恢复历史会话
  /compact               手动压缩上下文
  /copy                  复制最后一条助手回复
  /attach                交互式附加文件（等价于输入 @ 回车）
  /buddy                 召唤/选择宠物（/buddy off 关闭）
  /fullscreen            切换全屏/终端顺沿（重启 hycode 生效；默认终端顺沿）
  /help                  显示此帮助
  /exit, /quit           退出

快捷键:
  ?                       显示此帮助
  Esc                     中止当前回合
  Ctrl+T                  折叠/展开思考/工具
  Ctrl+Shift+F            会话内搜索
  Tab                     自动补全
  ↑/↓ + 回车              目录浏览器/选择器中导航

其他:
  @ 回车        打开目录浏览器：选文件夹递归下钻，选文件后附加
  @路径         直接附加文件 / 进入目录（如 @src/cli.ts、@src/）
  @workspace/@. 引入工作区目录树
  !命令      执行并发送输出给模型
  !!命令     执行命令，仅显示输出
`;
/** 输入 ? 弹出的快捷键帮助（与 /help 区分，不重复完整命令） */
const SHORTCUTS = `快捷键:
  Esc                 中止当前回合
  Ctrl+T              折叠/展开思考/工具
  Ctrl+Shift+F        会话内搜索
  Tab                 自动补全
  ↑/↓ + 回车          目录浏览器/选择器中导航

其他:
  @ 回车     打开目录浏览器（选文件夹递归下钻，选文件附加）
  @路径      直接附加文件/进入目录（如 @src/cli.ts、@src/）
  @workspace/@. 引入工作区目录树
  !命令     执行并发送输出给模型
  !!命令    仅执行显示输出
  /help     查看全部斜杠命令
`;
/** Editor 斜杠命令自动补全列表（输入 / 即弹出） */
const SLASH_COMMANDS = [
    { name: "model", description: "查看或切换模型（/model openai/gpt-4o）" },
    { name: "models", description: "高亮选择模型" },
    { name: "models add", description: "交互式添加模型/供应商" },
    { name: "models remove", description: "移除模型或供应商" },
    { name: "models reset", description: "清空所有已添加的模型" },
    { name: "mode", description: "切换模式（回车交互式选择）" },
    { name: "thinking", description: "思考等级 off/low/medium/high（LLM 不支持时自动 off）" },
    { name: "settings", description: "自定义底部状态栏显示项" },
    { name: "session", description: "查看当前会话信息" },
    { name: "new", description: "开始新会话" },
    { name: "resume", description: "恢复历史会话" },
    { name: "compact", description: "手动压缩上下文" },
    { name: "copy", description: "复制最后一条助手回复" },
    { name: "attach", description: "交互式附加文件（等价于输入 @ 回车）" },
    { name: "buddy", description: "召唤/选择宠物（/buddy off 关闭）" },
    { name: "fullscreen", description: "切换全屏/终端顺沿（重启生效）" },
    { name: "help", description: "显示此帮助" },
    { name: "exit", description: "退出" },
];
/** 提取最近一次请求的错误信息（不写终端，供 TUI 内展示） */
function getErrorString(session) {
    const state = session.state;
    if (state.errorMessage)
        return state.errorMessage;
    const last = state.messages?.[state.messages.length - 1];
    if (last && last.role === "assistant" && last.stopReason === "error" && last.errorMessage) {
        return last.errorMessage;
    }
    return undefined;
}
/** 最近一次助手回复的 API 用量（真实 token 数，含缓存命中），无则 undefined */
function getLastUsage(session) {
    const msgs = session.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m?.role === "assistant" && m.usage) {
            const u = m.usage;
            if ((u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0) > 0) {
                return { input: u.input ?? 0, cacheRead: u.cacheRead ?? 0, cacheWrite: u.cacheWrite ?? 0 };
            }
        }
    }
    return undefined;
}
const FILE_CAP = 12000; // 单个文件引用内容上限（字符）
const TREE_CAP = 400; // 目录/工作区树条目上限
/** @文件 引用 → 内容块 */
function buildFileContext(absPath) {
    let content = "";
    try {
        content = readFileSync(absPath, "utf8");
    }
    catch {
        return "";
    }
    const capped = content.length > FILE_CAP
        ? `${content.slice(0, FILE_CAP)}\n…（内容已截断，共 ${content.length} 字符）`
        : content;
    return `\n<file path="${absPath}">\n${capped}\n</file>`;
}
/** 目录树文本（跳过隐藏项与 node_modules，上限条目数） */
function buildTree(root, maxEntries) {
    const lines = [];
    let count = 0;
    const walk = (dir, depth) => {
        if (count >= maxEntries)
            return;
        let names = [];
        try {
            names = readdirSync(dir, { withFileTypes: true })
                .map((e) => e.name)
                .sort();
        }
        catch {
            return;
        }
        for (const name of names) {
            if (count >= maxEntries)
                return;
            if (name === "node_modules" || name.startsWith("."))
                continue;
            const full = join(dir, name);
            let isDir = false;
            try {
                isDir = statSync(full).isDirectory();
            }
            catch {
                continue;
            }
            lines.push("  ".repeat(depth) + name + (isDir ? "/" : ""));
            count++;
            if (isDir)
                walk(full, depth + 1);
        }
    };
    walk(root, 0);
    if (count >= maxEntries)
        lines.push(`…（共 ${count}+ 项，已截断）`);
    return lines.join("\n");
}
/** @目录 引用 → 目录树块 */
function buildFolderContext(absPath) {
    return `\n<folder path="${absPath}">\n${buildTree(absPath, TREE_CAP)}\n</folder>`;
}
/**
 * 展开消息中的 @ 引用：
 *  - @workspace / @. → 工作区目录树
 *  - @文件 → 文件内容块；@目录 → 目录树块
 *  - 未匹配的保留原样
 */
function expandReferences(text, cwd) {
    return text.replace(/@([^\s@]+)/g, (match, p) => {
        const token = p.trim();
        if (token === "." || token === "workspace") {
            return `\n<workspace path="${cwd}">\n${buildTree(cwd, TREE_CAP)}\n</workspace>`;
        }
        const abs = resolve(cwd, token);
        try {
            if (existsSync(abs) && statSync(abs).isFile())
                return buildFileContext(abs);
            if (existsSync(abs) && statSync(abs).isDirectory())
                return buildFolderContext(abs);
        }
        catch {
            /* 路径不可读则保留原样 */
        }
        return match;
    });
}
async function runRepl(session, config, initialSelected, initialMode, opts, modelRuntime) {
    initTheme("dark");
    const markdownTheme = getMarkdownTheme();
    const selectListTheme = getSelectListTheme();
    const settingsListTheme = getSettingsListTheme();
    const terminal = new ProcessTerminal();
    // 默认"终端顺沿"（TuiMainScreen，保留滚动历史）；全屏（TuiAltScreen）为可选项（/fullscreen）
    const fullscreen = config.settings.fullscreen === true;
    const tui = fullscreen ? new TuiAltScreen(terminal) : new TuiMainScreen(terminal);
    let selected = initialSelected;
    const modelLabel = () => (selected ? `${selected.provider}/${selected.id}` : "未选择");
    const initialToolNames = session.getActiveToolNames();
    let mode = initialMode;
    const applyMode = (m) => {
        if (m === "ask")
            session.setActiveToolsByName([]);
        else if (m === "plan")
            session.setActiveToolsByName(PLAN_TOOLS);
        else
            session.setActiveToolsByName(initialToolNames);
        mode = m;
    };
    const cwd = process.cwd();
    // ---- 布局：上方滚动消息区（ScrollView）+ 底部 状态栏/输入框 ----
    const transcript = new Container();
    transcript.addChild(new Text(renderLogo(), 0, 0)); // logo 右上角带版本号，下方不再放文字
    // 状态栏：恒占一行（空内容也渲染占位行），保证对话框位置不动
    const status = new Text("", 0, 0);
    const editor = new Editor(tui, {
        borderColor: (s) => `${GREEN}${s}${RESET}`,
        selectList: selectListTheme,
    });
    editor.setAutocompleteProvider(new SlashCommandProvider(SLASH_COMMANDS));
    /** 输入框当前渲染高度（overlay 定位用；随换行动态变化） */
    const editorHeight = () => editor.render(terminal.columns).length;
    // 工具/思考活动区（全屏=右侧面板，终端顺沿=对话框上方；各恒一行滚动，Ctrl+T 展开完整历史）
    const toolLog = new Container();
    const thinkingEntry = new ThinkingEntry(); // 思考条目（折叠单行滚动 / 展开全文，Ctrl+T 切换）
    const toolEntry = new ToolEntry(); // 工具调用条目（折叠单行滚动 / 展开历史，Ctrl+T 切换）
    toolLog.addChild(thinkingEntry);
    toolLog.addChild(toolEntry);
    const toolScroll = new ScrollView(toolLog, { follow: "end" });
    if (isViewportTUI(tui)) {
        // 全屏模式：上方 HStack（对话滚动区 + 右侧工具面板）+ 绿色输入框 + 状态栏（输入框下方）
        tui.setLayoutRoot(new VStack([
            {
                component: new HStack([
                    {
                        component: new ScrollView(transcript, { follow: "end", primary: true, overscroll: "chain" }),
                        basis: 0,
                        grow: 1,
                        minSize: 1,
                    },
                    {
                        component: toolScroll,
                        basis: 22,
                        shrink: 0,
                        visible: (v) => v.width >= 90,
                    },
                ]),
                basis: 0,
                grow: 1,
                minSize: 1,
            },
            { component: editor, basis: "auto", shrink: 1 },
            { component: status, basis: "auto", shrink: 1 },
        ]));
    }
    else {
        // 终端顺沿模式（默认）：对话消息 → 思考/工具（各恒一行）→ 状态栏 → 绿色输入框（最底部）；
        // 思考与工具各占一行、滚动显示，Ctrl+T 展开/折叠；对话框始终贴终端最底行
        tui.addChild(transcript);
        tui.addChild(toolLog);
        tui.addChild(status);
        tui.addChild(editor);
    }
    tui.setFocus(editor);
    // ---- 通用辅助 ----
    const say = (text) => {
        transcript.addChild(new Text(`${DIM}${text}${RESET}`, 1, 1));
        tui.requestRender();
    };
    const updateStatus = () => {
        const parts = [];
        const footer = config.settings.footer;
        if (footer.includes("mode"))
            parts.push(`模式:${mode}`);
        if (footer.includes("model"))
            parts.push(`模型:${modelLabel()}`);
        if (footer.includes("thinking"))
            parts.push(`思考等级:${session.thinkingLevel}`);
        if (footer.includes("context")) {
            const window = session.model?.contextWindow ?? 0;
            if (window > 0) {
                const usage = getLastUsage(session);
                let pct;
                if (usage) {
                    const total = usage.input + usage.cacheRead + usage.cacheWrite;
                    pct = (total / window) * 100;
                }
                else {
                    const cu = session.getContextUsage();
                    if (cu && cu.percent != null)
                        pct = cu.percent;
                }
                // 与 DSH 一致：整数百分比、上限 100
                if (pct !== undefined)
                    parts.push(`上下文:${Math.min(100, Math.round(pct))}%`);
            }
        }
        if (footer.includes("cache")) {
            const usage = getLastUsage(session);
            if (usage && usage.input + usage.cacheRead + usage.cacheWrite > 0) {
                const hit = (usage.cacheRead / (usage.input + usage.cacheRead + usage.cacheWrite)) * 100;
                parts.push(`缓存:${Math.round(hit)}%`);
            }
        }
        if (footer.includes("cwd"))
            parts.push(`目录:${basename(cwd)}`);
        // 恒一行：无内容时也渲染不可见占位行（Text 会跳过纯空白文本，导致行数变化、对话框移动）
        status.setText(parts.length > 0 ? `${DIM}${parts.join(" │ ")}${RESET}` : `${DIM}${RESET}`);
        tui.requestRender();
    };
    // ---- 流式输出：按"用户回合"渲染进助手消息 ----
    // agent 循环对每个工具轮次都会发 turn_start/turn_end，且 turn_start 先于 message_start 到达；
    // 因此以 message_start(用户消息) 创建/切换目标，agent_end(非重试) 收尾，目标跨工具轮次持久。
    // 回复区只显示回复文本；思考与工具活动在对话框上方（各恒一行，Ctrl+T 折叠/展开）
    let streamTarget;
    let lastAssistantText = "";
    const renderTarget = () => {
        if (!streamTarget)
            return;
        streamTarget.md.setText(streamTarget.text);
        tui.requestRender();
    };
    /** 首个内容（思考/文本）出现后即隐藏"思考中…"（一个 user 过程只出现一次） */
    const hideLoader = () => {
        if (streamTarget?.loader) {
            streamTarget.loader.stop();
            transcript.removeChild(streamTarget.loader);
            streamTarget.loader = undefined;
            tui.requestRender();
        }
    };
    const finalizeTarget = () => {
        if (!streamTarget)
            return;
        renderTarget();
        lastAssistantText = streamTarget.text;
        if (streamTarget.loader) {
            streamTarget.loader.stop();
            transcript.removeChild(streamTarget.loader);
        }
        streamTarget = undefined;
        tui.requestRender();
    };
    const onSessionEvent = (event) => {
        switch (event.type) {
            case "message_start":
                // 新的用户消息（主回合或排队的 steer）→ 收尾上一目标并立即创建新目标；
                // 思考每用户回合一个（一次思考，之后执行工具或结束）
                if (event.message.role === "user") {
                    finalizeTarget();
                    thinkingEntry.reset();
                    const loader = new Loader(tui, (s) => s, (s) => `${DIM}${s}${RESET}`, "思考中…");
                    transcript.addChild(loader);
                    const md = new Markdown("", 1, 1, markdownTheme);
                    transcript.addChild(md);
                    streamTarget = { md, loader, text: "" };
                    tui.requestRender();
                }
                break;
            case "message_update": {
                const ev = event.assistantMessageEvent;
                if (ev.type === "text_delta") {
                    if (!streamTarget)
                        break;
                    hideLoader(); // 回复开始流式，不再显示"思考中…"
                    streamTarget.text += ev.delta;
                    renderTarget();
                }
                else if (ev.type === "thinking_delta") {
                    // 思考 → 对话框上方"⚛ 思考"条目（独立一行，可折叠）；"思考中…"随之隐藏
                    hideLoader();
                    thinkingEntry.append(ev.delta);
                    tui.requestRender();
                }
                break;
            }
            case "tool_execution_start": {
                // 工具 → 对话框上方工具条目：折叠态只显示最新一条（单行滚动），展开才见完整历史堆叠
                const detail = truncateDetail(toolDetail(event.toolName, event.args));
                const base = `${DIM}${toolIcon(event.toolName)} ${event.toolName}${detail ? `: ${detail}` : ""}${RESET}`;
                toolEntry.start(event.toolCallId, base);
                tui.requestRender();
                break;
            }
            case "tool_execution_end": {
                toolEntry.finish(event.toolCallId, event.isError);
                tui.requestRender();
                break;
            }
            case "agent_end":
                // 整个用户回合（含工具轮次与排队消息）结束才收尾；自动重试时保留目标
                if (!event.willRetry)
                    finalizeTarget();
                break;
            case "thinking_level_changed":
                // 底层思考等级变化（/thinking 命令或模型切换触发）→ 刷新状态栏
                updateStatus();
                break;
        }
    };
    let unsubscribe = session.subscribe(onSessionEvent);
    // ---- 会话替换（/new /resume） ----
    const replaceSession = async (next) => {
        unsubscribe();
        if (session.isStreaming) {
            await session.abort(); // 先结算进行中的回合再切换
        }
        session.dispose();
        session = next;
        unsubscribe = session.subscribe(onSessionEvent);
        streamTarget = undefined;
        lastAssistantText = "";
        applyMode(mode);
        const m = selected ? findConfiguredModel(session.modelRuntime, config, selected.provider, selected.id) : undefined;
        if (m)
            await session.setModel(m);
        updateStatus();
        tui.requestRender();
    };
    // ---- 回合执行（主回合 / !命令 共用） ----
    // pendingAttachment：@ 浏览器选中的文件，下一次提问时附加为上下文
    let pendingAttachment;
    const finalizePrompt = (prompt) => {
        let out = prompt;
        if (pendingAttachment) {
            const ctx = buildFileContext(pendingAttachment);
            if (ctx)
                out = `（请基于文件 ${pendingAttachment} 回答/工作）\n${ctx}\n${out}`;
            pendingAttachment = undefined;
        }
        return expandReferences(out, cwd);
    };
    const runPrompt = async (prompt) => {
        if (!selected) {
            say("当前未选择模型。输入 /models 或 /model <名称> 选择已添加的模型，或 /models add 添加新模型。");
            return;
        }
        const model = findConfiguredModel(session.modelRuntime, config, selected.provider, selected.id);
        if (!model) {
            selected = undefined;
            say("当前模型已不可用，请重新用 /models 或 /model <名称> 选择。");
            return;
        }
        transcript.addChild(new Markdown(prompt, 1, 1, markdownTheme));
        tui.requestRender();
        try {
            if (session.model !== model)
                await session.setModel(model);
            await session.prompt(finalizePrompt(prompt));
            const errMsg = getErrorString(session);
            if (errMsg && streamTarget)
                streamTarget.text += `\n\n[请求失败] ${errMsg}`;
        }
        catch (err) {
            if (streamTarget)
                streamTarget.text += `\n\n[错误] ${err.message ?? err}`;
            else
                say(`[错误] ${err.message ?? err}`);
        }
        finally {
            finalizeTarget(); // 异常/中止等未触发 agent_end 时兜底
            updateStatus();
            tui.requestRender();
        }
    };
    // ---- @ 交互式目录浏览器：输入 @ 立即打开，选文件夹递归下钻，选文件附加 ----
    let atBrowserOpen = false; // 浏览器已打开（防 onChange 重复触发叠层）
    let atBrowserDismissed = false; // 用户 Esc 关闭后，同一次 @ 输入不再自动重开
    const attachFile = (absPath) => {
        pendingAttachment = absPath;
        say(`已附加文件: ${basename(absPath)}。请输入你的问题，将基于该文件回答。`);
        tui.requestRender();
    };
    const browseDirectory = (dir) => {
        let entries = [];
        try {
            entries = readdirSync(dir, { withFileTypes: true })
                .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
                .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
                .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
        }
        catch {
            say(`[错误] 无法读取目录: ${dir}`);
            atBrowserOpen = false;
            return;
        }
        if (entries.length === 0) {
            say("（空目录）");
            atBrowserOpen = false;
            return;
        }
        const items = entries.map((e) => ({
            value: join(dir, e.name),
            label: e.name + (e.isDir ? "/" : ""),
            description: e.isDir ? "文件夹" : "文件",
        }));
        const list = new SelectList(items, Math.min(items.length, 14), selectListTheme);
        // 定位在输入框上方（紧跟 @ 的位置），而非屏幕中央
        const overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
        atBrowserOpen = true;
        list.onSelect = (item) => {
            if (item.label.endsWith("/")) {
                overlay.hide();
                browseDirectory(item.value); // 递归下钻（atBrowserOpen 保持 true）
            }
            else {
                overlay.hide();
                atBrowserOpen = false;
                attachFile(item.value);
            }
        };
        list.onCancel = () => {
            overlay.hide();
            atBrowserOpen = false;
            atBrowserDismissed = true;
            say("已取消（可继续输入路径或问题）。");
        };
        tui.requestRender();
    };
    /** @ 引用入口：纯路径（无空格）→ 文件直接附加 / 目录递归浏览；workspace/. 由展开处理 */
    const handleAtReference = (rest) => {
        const token = rest.trim();
        if (token === "workspace" || token === ".")
            return; // 交给 expandReferences 展开
        const abs = resolve(cwd, token);
        try {
            if (existsSync(abs) && statSync(abs).isFile()) {
                attachFile(abs);
                return;
            }
            if (existsSync(abs) && statSync(abs).isDirectory()) {
                browseDirectory(abs);
                return;
            }
        }
        catch {
            /* 路径不可读，落回展开逻辑 */
        }
        if (!token)
            browseDirectory(cwd); // 裸 @
    };
    // 输入 ? 即时弹出快捷键面板（non-capturing，编辑器保持焦点；取消/继续输入自动消失）
    let shortcutOverlay;
    const showShortcuts = () => {
        if (shortcutOverlay)
            return;
        const panel = new Text(SHORTCUTS, 1, 1);
        shortcutOverlay = tui.showOverlay(panel, { ...inputOverlayOptions(tui, editorHeight()), nonCapturing: true });
        tui.requestRender();
    };
    const hideShortcuts = () => {
        if (!shortcutOverlay)
            return;
        shortcutOverlay.hide();
        shortcutOverlay = undefined;
        tui.requestRender();
    };
    // 输入 @（纯路径、无空格）→ 立即打开目录浏览器（无需回车）
    editor.onChange = (text) => {
        if (!text) {
            atBrowserDismissed = false;
            hideShortcuts();
            return;
        }
        if (/^@[^\s]*$/.test(text)) {
            if (!atBrowserOpen && !atBrowserDismissed) {
                const token = text.slice(1).trim();
                if (!token) {
                    browseDirectory(cwd);
                }
                else {
                    const abs = resolve(cwd, token);
                    try {
                        if (existsSync(abs) && statSync(abs).isDirectory())
                            browseDirectory(abs);
                    }
                    catch {
                        /* 忽略不可读路径 */
                    }
                }
            }
        }
        else if (!text.startsWith("@")) {
            atBrowserDismissed = false;
        }
        // ? 即时快捷键面板
        if (text === "?" || text === "？")
            showShortcuts();
        else
            hideShortcuts();
    };
    // ---- 命令 ----
    const tuiAsk = createTuiPromptAdapter(tui, selectListTheme, editorHeight);
    const switchModel = async (arg) => {
        let targetProvider;
        let targetId = arg;
        if (arg.includes("/")) {
            const [p, m] = arg.split("/");
            targetProvider = p;
            targetId = m;
        }
        const providers = targetProvider ? [targetProvider] : config.providers.map((p) => p.id);
        for (const pid of providers) {
            const m = findConfiguredModel(session.modelRuntime, config, pid, targetId);
            if (m) {
                try {
                    await session.setModel(m);
                }
                catch (err) {
                    say(`[错误] 切换失败: ${err.message ?? err}`);
                    return;
                }
                selected = { provider: m.provider, id: m.id };
                say(`已切换模型: ${m.provider}/${m.id}`);
                updateStatus();
                return;
            }
        }
        say(`未找到模型 "${arg}"，已添加的模型用 /models 查看。`);
    };
    // ---- 宠物（buddy）管理：/buddy 召唤与选择，配置持久化，重启自动恢复 ----
    let buddyPet;
    let buddyOverlay;
    /** 召唤指定宠物（先移除旧的；保存配置以便重启恢复） */
    const spawnBuddy = (spec) => {
        if (buddyOverlay) {
            buddyOverlay.hide();
            buddyOverlay = undefined;
        }
        if (buddyPet) {
            buddyPet.stop();
            buddyPet = undefined;
        }
        buddyPet = new BuddyPet(spec, () => tui.requestRender());
        buddyPet.start();
        buddyOverlay = tui.showOverlay(buddyPet, {
            anchor: "bottom-right",
            offsetY: -2, // 避开底部状态栏/输入框
            margin: { right: 1 },
            width: 18,
            visible: (w) => w >= 60, // 窄终端自动隐藏
            nonCapturing: true, // 宠物只是装饰：不抢焦点，否则输入框将收不到任何按键
        });
        config.settings.buddy = spec.id;
        saveConfig(config);
        say(`${spec.emoji} ${spec.name}已上线！/buddy off 可关闭，/buddy 可切换。`);
        tui.requestRender();
    };
    /** 移除当前宠物（清空配置中的持久化记录） */
    const removeBuddy = () => {
        if (buddyOverlay) {
            buddyOverlay.hide();
            buddyOverlay = undefined;
        }
        if (buddyPet) {
            buddyPet.stop();
            buddyPet = undefined;
        }
        config.settings.buddy = undefined;
        saveConfig(config);
        say("宠物已回家休息（/buddy 可再次召唤）。");
    };
    /** /buddy 选择器：高亮选择宠物（后期多个宠物时在此扩展） */
    const showBuddyPicker = () => {
        if (BUDDIES.length === 0) {
            say("还没有可选的宠物。");
            return;
        }
        const list = new SelectList(BUDDIES.map((b) => ({
            value: b.id,
            label: `${b.emoji} ${b.name}`,
            description: b.id === config.settings.buddy ? "当前" : undefined,
        })), Math.min(BUDDIES.length, 8), selectListTheme);
        const overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
        list.onSelect = (item) => {
            overlay.hide();
            const spec = BUDDIES.find((b) => b.id === item.value);
            if (spec)
                spawnBuddy(spec);
        };
        list.onCancel = () => {
            overlay.hide();
            say("已取消。");
        };
        tui.requestRender();
    };
    /** /buddy 命令入口：空参选择/查看，off 关闭，名称或 id 直接切换 */
    const handleBuddyCommand = (arg) => {
        if (arg === "off" || arg === "hide" || arg === "remove" || arg === "关闭") {
            removeBuddy();
            return;
        }
        if (!arg) {
            if (!buddyPet) {
                showBuddyPicker();
            }
            else {
                say(`当前宠物: ${buddyPet.spec.emoji} ${buddyPet.spec.name}。/buddy 选择其他，/buddy off 关闭。`);
            }
            return;
        }
        const spec = BUDDIES.find((b) => b.id === arg || b.name === arg);
        if (spec) {
            spawnBuddy(spec);
        }
        else {
            say(`未找到宠物 "${arg}"，当前可选: ${BUDDIES.map((b) => `${b.id}(${b.name})`).join(" / ")}。`);
        }
    };
    const selectModelInteractive = () => {
        const items = [];
        for (const p of config.providers) {
            for (const m of p.models)
                items.push(`${p.id}/${m}`);
        }
        if (items.length === 0) {
            say("尚未添加任何模型。输入 /models add 添加。");
            return;
        }
        const current = selected ? `${selected.provider}/${selected.id}` : undefined;
        const list = new SelectList(items.map((v) => ({ value: v, label: v, description: v === current ? "当前" : undefined })), Math.min(items.length, 12), selectListTheme);
        const overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
        list.onSelect = (item) => {
            overlay.hide();
            void switchModel(item.value);
        };
        list.onCancel = () => {
            overlay.hide();
            say("已取消。");
        };
        tui.requestRender();
    };
    const addModels = async () => {
        let keep = true;
        while (keep) {
            const p = await collectProvider(tuiAsk);
            if (!p) {
                say("已取消添加。");
                break;
            }
            const { added, isNew } = upsertProvider(config, p);
            saveConfig(config);
            registerProvider(session.modelRuntime, p);
            say(isNew
                ? `已添加供应商 "${p.name}"，模型: ${added.join(", ")}`
                : `已更新供应商 "${p.name}"，新增模型: ${added.join(", ")}`);
            // 当前未选择模型 → 默认关联并选择新供应商的第一个模型（用户可 /model 修改）
            if (!selected && p.models.length > 0) {
                const m = findConfiguredModel(session.modelRuntime, config, p.id, p.models[0]);
                if (m) {
                    try {
                        await session.setModel(m);
                        selected = { provider: m.provider, id: m.id };
                        say(`已默认选择模型: ${m.provider}/${m.id}（/model 可修改）`);
                    }
                    catch {
                        /* 切换失败则保持未选择 */
                    }
                }
            }
            const more = await tuiAsk.askChoice("是否继续添加？", ["否，完成", "是，继续添加"]);
            keep = more === 1;
        }
        updateStatus(); // 模型列表变化 → 状态栏联动
    };
    const removeModels = async (target) => {
        const removed = removeTarget(config, target);
        if (!removed) {
            say(`未找到 "${target}"，用 /models 查看已添加内容。`);
            return;
        }
        saveConfig(config);
        syncProvider(session.modelRuntime, config, target.split("/")[0]);
        if (selected && !findConfiguredModel(session.modelRuntime, config, selected.provider, selected.id)) {
            selected = undefined;
            say("当前模型已被移除，请重新用 /models 或 /model <名称> 选择。");
        }
        say(removed);
        updateStatus(); // 模型列表变化 → 状态栏联动
    };
    const resetModels = async () => {
        if (countModels(config) === 0) {
            say("当前没有已添加的模型。");
            return;
        }
        const choice = await tuiAsk.askChoice("确认清空所有已添加的模型？", ["取消", "确认清空"]);
        if (choice !== 1) {
            say("已取消。");
            return;
        }
        const removedIds = config.providers.map((p) => p.id);
        config.providers = [];
        saveConfig(config);
        for (const id of removedIds)
            session.modelRuntime.unregisterProvider(id);
        selected = undefined;
        say("已清空所有模型。");
        updateStatus(); // 模型列表变化 → 状态栏联动（模型:未选择）
    };
    const setModeCommand = (arg) => {
        if (!arg) {
            // 无参数：贴近输入框弹三档选择（ask/plan/auto），选择后映射 pi 底层（setActiveToolsByName）
            const current = mode;
            const items = MODE_NAMES.map((m) => ({
                value: m,
                label: m === current ? `${m}（当前）` : m,
                description: MODE_DESC[m],
            }));
            const list = new SelectList(items, Math.min(items.length, 8), selectListTheme);
            const overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
            list.onSelect = (item) => {
                overlay.hide();
                applyMode(item.value);
                say(`已切换模式: ${item.value}（${MODE_DESC[item.value]}）`);
                updateStatus();
            };
            list.onCancel = () => {
                overlay.hide();
                say("已取消。");
            };
            tui.requestRender();
            return;
        }
        if (arg === "ask" || arg === "plan" || arg === "auto") {
            applyMode(arg);
            say(`已切换模式: ${arg}（${MODE_DESC[arg]}）`);
            updateStatus();
            return;
        }
        say(`未知模式 "${arg}"，可用: ${MODE_NAMES.join(" / ")}。`);
    };
    /** 应用思考等级并反馈实际生效值（底层按模型能力 clamp，展示真实等级而非请求值） */
    const applyThinkingLevel = (level) => {
        const available = session.getAvailableThinkingLevels();
        session.setThinkingLevel(level);
        const effective = session.thinkingLevel;
        if (effective !== level) {
            say(`思考等级已设为 ${level}，但当前模型仅支持: ${available.join(" / ")}，实际生效: ${effective}。`);
        }
        else {
            say(`思考等级已切换: ${effective}。`);
        }
        updateStatus();
    };
    const setThinkingCommand = (arg) => {
        if (!arg) {
            // 无参数：固定四档列表（off/low/medium/high），映射 pi 底层；
            // LLM 不支持思考时自动落回 off（setThinkingLevel 内部 clamp）
            const current = session.thinkingLevel;
            const items = THINKING_LEVELS_ALL.map((l) => ({
                value: l,
                label: l === current ? `${l}（当前）` : l,
            }));
            const list = new SelectList(items, Math.min(items.length, 8), selectListTheme);
            const overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
            list.onSelect = (item) => {
                overlay.hide();
                applyThinkingLevel(item.value);
            };
            list.onCancel = () => {
                overlay.hide();
                say("已取消。");
            };
            tui.requestRender();
            return;
        }
        if (!THINKING_LEVELS_ALL.includes(arg)) {
            say(`未知等级 "${arg}"，可用: ${THINKING_LEVELS_ALL.join(" / ")}。`);
            return;
        }
        applyThinkingLevel(arg);
    };
    const editSettings = () => {
        const items = FOOTER_ITEMS.map((it) => ({
            id: it.key,
            label: it.label,
            currentValue: config.settings.footer.includes(it.key) ? "显示" : "隐藏",
            values: ["显示", "隐藏"],
        }));
        let overlay;
        const list = new SettingsList(items, FOOTER_ITEMS.length, settingsListTheme, (id, newValue) => {
            const key = id;
            const set = new Set(config.settings.footer);
            if (newValue === "显示")
                set.add(key);
            else
                set.delete(key);
            config.settings.footer = FOOTER_ITEMS.map((f) => f.key).filter((k) => set.has(k));
            saveConfig(config);
        }, () => {
            overlay?.hide();
            say(`已保存状态栏显示项: ${config.settings.footer.join(", ")}`);
            updateStatus();
        });
        overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
        tui.requestRender();
    };
    const handleSessionInfo = () => {
        const sm = session.sessionManager;
        const cu = session.getContextUsage();
        say(`会话: ${sm.getSessionId()}\n` +
            `文件: ${sm.getSessionFile() ?? "（内存）"}\n` +
            `消息: ${session.messages.length} 条\n` +
            `上下文: ${cu && cu.percent != null ? `${Math.round(cu.percent)}%` : "未知"}`);
    };
    const handleNewSession = async () => {
        const next = await createSession(opts, modelRuntime, session.model ?? undefined);
        await replaceSession(next);
        say("已开始新会话（会话上下文已清空）。");
    };
    const handleResume = async () => {
        const dir = sessionDirFor(cwd);
        let files = [];
        try {
            files = readdirSync(dir)
                .filter((f) => f.endsWith(".jsonl"))
                .map((f) => join(dir, f))
                .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
        }
        catch {
            files = [];
        }
        if (files.length === 0) {
            say("没有可恢复的历史会话。");
            return;
        }
        const list = new SelectList(files.map((f) => ({ value: f, label: basename(f) })), Math.min(files.length, 12), selectListTheme);
        const overlay = tui.showOverlay(list, inputOverlayOptions(tui, editorHeight()));
        list.onSelect = async (item) => {
            overlay.hide();
            try {
                const sm = SessionManager.open(item.value);
                const next = await createSession(opts, modelRuntime, session.model ?? undefined, sm);
                await replaceSession(next);
                say(`已恢复会话: ${basename(item.value)}`);
            }
            catch (err) {
                say(`[错误] 恢复失败: ${err.message ?? err}`);
            }
        };
        list.onCancel = () => {
            overlay.hide();
            say("已取消。");
        };
        tui.requestRender();
    };
    const handleCompact = async () => {
        say("正在压缩上下文…");
        try {
            await session.compact();
            say("已压缩上下文。");
        }
        catch (err) {
            say(`[错误] 压缩失败: ${err.message ?? err}`);
        }
    };
    const handleCopy = async () => {
        if (!lastAssistantText) {
            say("暂无助手回复可复制。");
            return;
        }
        try {
            await copyToClipboard(lastAssistantText);
            say("已复制最后一条助手回复。");
        }
        catch {
            say("[错误] 复制失败。");
        }
    };
    /** !命令 / !!命令：本地执行 */
    const runBash = (cmd, sendToModel) => {
        say(`${sendToModel ? "!" : "!!"} 执行: ${cmd}`);
        let output = "";
        try {
            output = execSync(cmd, { encoding: "utf8", cwd, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }).trim();
        }
        catch (err) {
            const e = err;
            output = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
        }
        if (!output) {
            say("（无输出）");
            return;
        }
        if (sendToModel) {
            say(output.length > 4000 ? output.slice(0, 4000) + "\n…（输出已截断）" : output);
            void runPrompt(`我执行了命令: ${cmd}\n\n输出:\n${output.length > 8000 ? output.slice(0, 8000) : output}`);
        }
        else {
            say(output.length > 4000 ? output.slice(0, 4000) + "\n…（输出已截断）" : output);
        }
    };
    const handleCommand = async (cmd) => {
        const [name, ...rest] = cmd.split(/\s+/);
        const arg = rest.join(" ").trim();
        switch (name) {
            case "/exit":
            case "/quit":
                return "exit";
            case "/help":
                say(REPL_HELP);
                return true;
            case "/?":
                say(SHORTCUTS);
                return true;
            case "/model":
                if (!arg) {
                    say(`当前模型: ${modelLabel()}`);
                    if (countModels(config) > 0) {
                        say("输入 /model <名称> 切换，如 /model openai/gpt-4o；/models 高亮选择。");
                    }
                    else {
                        say("尚未添加任何模型，输入 /models add 添加。");
                    }
                    return true;
                }
                await switchModel(arg);
                return true;
            case "/models": {
                const sub = rest.join(" ").trim();
                if (!sub) {
                    selectModelInteractive();
                    return true;
                }
                if (sub === "add") {
                    await addModels();
                    return true;
                }
                if (sub === "reset") {
                    await resetModels();
                    return true;
                }
                if (sub.startsWith("remove ")) {
                    await removeModels(sub.slice("remove ".length).trim());
                    return true;
                }
                say(`未知的 /models 子命令 "${sub}"。用 /models 高亮选择，/models add 添加，/models remove <目标> 移除，/models reset 清空。`);
                return true;
            }
            case "/mode":
                setModeCommand(arg);
                return true;
            case "/thinking":
                setThinkingCommand(arg);
                return true;
            case "/settings":
                editSettings();
                return true;
            case "/session":
                handleSessionInfo();
                return true;
            case "/new":
                await handleNewSession();
                return true;
            case "/resume":
                await handleResume();
                return true;
            case "/compact":
                await handleCompact();
                return true;
            case "/copy":
                await handleCopy();
                return true;
            case "/fullscreen":
                config.settings.fullscreen = !(config.settings.fullscreen === true);
                saveConfig(config);
                say(`全屏模式已${config.settings.fullscreen ? "开启" : "关闭"}（重启 hycode 生效）。`);
                return true;
            case "/attach":
                browseDirectory(cwd);
                return true;
            case "/buddy":
                handleBuddyCommand(arg);
                return true;
            default:
                return false;
        }
    };
    // ---- 提交处理 ----
    editor.onSubmit = async (value) => {
        const trimmed = value.trim();
        if (!trimmed)
            return;
        // ? 输入时已即时显示快捷键面板，回车仅关闭（不再作为消息发送）
        if (trimmed === "?" || trimmed === "？") {
            hideShortcuts();
            return;
        }
        // @ 引用：纯路径（无空格）→ 文件附加 / 目录递归浏览
        if (trimmed.startsWith("@") && !trimmed.includes(" ")) {
            const rest = trimmed.slice(1).trim();
            // 已附加文件且 @ 后是未解析文本（浏览器附加后残留的前缀）→ 按基于附件的提问提交
            if (pendingAttachment && rest && !existsSync(resolve(cwd, rest))) {
                await runPrompt(finalizePrompt(rest));
                return;
            }
            handleAtReference(trimmed.slice(1));
            return;
        }
        // bash 快捷方式
        if (trimmed.startsWith("!!")) {
            runBash(trimmed.slice(2).trim(), false);
            return;
        }
        if (trimmed.startsWith("!") && !trimmed.startsWith("/")) {
            runBash(trimmed.slice(1).trim(), true);
            return;
        }
        if (trimmed.startsWith("/")) {
            try {
                const result = await handleCommand(trimmed);
                if (result === "exit") {
                    farewell();
                }
                else if (result === false) {
                    say(`未知命令 "${trimmed}"，输入 /help 查看可用命令。`);
                }
            }
            catch (err) {
                say(`[错误] ${err.message ?? err}`);
            }
            return;
        }
        if (trimmed === "exit" || trimmed === "quit") {
            farewell();
        }
        // 忙碌时提交 → 排队为 steering 消息（当前回合结束后由模型处理）
        if (session.isStreaming) {
            transcript.addChild(new Markdown(trimmed, 1, 1, markdownTheme));
            tui.requestRender();
            say("已排队（当前回合结束后处理）。");
            try {
                await session.prompt(finalizePrompt(trimmed), { streamingBehavior: "steer" });
            }
            catch (err) {
                say(`[错误] ${err.message ?? err}`);
            }
            return;
        }
        await runPrompt(trimmed);
    };
    // ---- 全局按键：Esc 中止当前回合 / Ctrl+T 折叠展开思考 / Ctrl+C 退出 ----
    /** 干净退出：保留屏幕（不重放文档遮挡 logo）→ 清屏 → 展示 logo 与告别 */
    const farewell = () => {
        if (buddyPet)
            buddyPet.stop(); // 停掉宠物动画定时器
        session.dispose();
        tui.stop({ preserveScreen: true });
        process.stdout.write("\x1b[2J\x1b[H");
        console.log(renderLogo());
        console.log(`${DIM}再见！会话记录已保存，下次运行 /resume 可恢复。${RESET}`);
        console.log("");
        process.exit(0);
    };
    tui.addInputListener((data) => {
        // Ctrl+T：展开/折叠思考与工具（两个条目一起切换，一按全展开、再按全折叠）
        if (matchesKey(data, "ctrl+t") && (thinkingEntry.hasContent || toolEntry.hasRecords)) {
            thinkingEntry.toggle();
            toolEntry.toggle();
            tui.requestRender();
            return { consume: true };
        }
        if (matchesKey(data, "escape") && session.isStreaming && !tui.hasOverlay()) {
            void session.abort().then(() => say("已中止。"));
            return { consume: true };
        }
        if (matchesKey(data, "ctrl+c")) {
            farewell();
        }
        return undefined;
    });
    updateStatus();
    // 重启后自动恢复上次召唤的宠物（/buddy off 已清空配置则不会出现）
    const savedBuddy = BUDDIES.find((b) => b.id === config.settings.buddy);
    if (savedBuddy)
        spawnBuddy(savedBuddy);
    tui.start();
    // 由 process.exit 结束，永不 resolve
    await new Promise(() => { });
}
// ---------------------------------------------------------------------------
// Once mode
// ---------------------------------------------------------------------------
async function runOnce(session, prompt) {
    subscribeStreaming(session, false);
    try {
        await session.prompt(prompt);
        reportError(session);
        console.log("\n");
        return 0;
    }
    catch (err) {
        console.error(`\n[错误] ${err.message ?? err}`);
        return 1;
    }
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    }
    catch (err) {
        console.error(`[错误] ${err.message}`);
        console.log("\n" + HELP_TEXT);
        return 1;
    }
    if (opts.help) {
        console.log(HELP_TEXT);
        return 0;
    }
    if (opts.version) {
        console.log(`HyCode v${version()}`);
        return 0;
    }
    const config = loadConfig();
    if (opts.addModel) {
        return await runStandaloneAddModel(config);
    }
    if (opts.reset) {
        return await runReset();
    }
    if (opts.listModels) {
        listConfiguredModels(config);
        return 0;
    }
    if (opts.prompt && config.providers.length === 0) {
        console.error("[错误] 尚未添加任何模型。先运行 hycode --add-model 添加模型。");
        return 1;
    }
    // 默认模型：无 -m 时取已添加的"第一个模型"（用户可用 /model 修改）
    const defaultModel = firstModel(config);
    const modelRuntime = await createRuntime();
    let model;
    let initialSelected;
    if (opts.model || defaultModel) {
        // 显式 -m 或存在已添加模型：先注册（解析需要），会话直接使用该模型
        registerAllProviders(modelRuntime, config);
        if (opts.model) {
            try {
                model = resolveStartupModel(modelRuntime, config, opts);
            }
            catch (err) {
                console.error(`[错误] ${err.message}`);
                return 1;
            }
            if (!model) {
                // resolveStartupModel 在 opts.model 存在时要么返回模型要么抛出，此处仅为类型收窄
                console.error(`[错误] 未找到模型 "${opts.model}"。`);
                return 1;
            }
            initialSelected = { provider: model.provider, id: model.id };
        }
        else if (defaultModel) {
            const m = findConfiguredModel(modelRuntime, config, defaultModel.provider, defaultModel.id);
            if (m) {
                model = m;
                initialSelected = { provider: m.provider, id: m.id };
            }
        }
    }
    if (opts.prompt && !model) {
        console.error("[错误] 未选择模型。请用 -m <provider/model> 指定一个已添加的模型（hycode --list-models 查看）。");
        return 1;
    }
    const session = await createSession(opts, modelRuntime, model);
    if (!opts.model && !defaultModel) {
        // 未指定 -m 且无已添加模型：会话创建后再注册供应商，避免 pi 自动挑选模型，
        // 保持"默认为空"（此时无模型可默认）。
        registerAllProviders(modelRuntime, config);
    }
    const initialMode = opts.noTools ? "ask" : opts.readonlyTools ? "plan" : "auto";
    try {
        if (opts.prompt) {
            return await runOnce(session, opts.prompt);
        }
        await runRepl(session, config, initialSelected, initialMode, opts, modelRuntime);
        return 0;
    }
    finally {
        session.dispose();
    }
}
/** 默认模型：已添加的"第一个模型"（首个供应商的首个模型）；无则 undefined */
function firstModel(config) {
    const first = config.providers[0];
    if (first && first.models.length > 0) {
        return { provider: first.id, id: first.models[0] };
    }
    return undefined;
}
function version() {
    try {
        const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
        return pkg.version ?? "0.0.0";
    }
    catch {
        return "0.0.0";
    }
}
main().then((code) => process.exit(code), (err) => {
    console.error(`[错误] ${err.message ?? err}`);
    process.exit(1);
});
