# 记忆锚 · Memory Anchor

> 极简桌面学习记忆工具｜用户主动录入 + FSRS-5 科学遗忘复习 + 本地隐私存储

## 项目特点

- **极简可控**：仅支持图片粘贴/上传、Markdown 文本手动录入两种方式，无任何自动监听、无后台采集
- **科学记忆**：内置 FSRS-5 间隔重复算法，根据记忆熟练度动态调整复习周期
- **本地隐私**：所有数据存储在本地 SQLite 单文件，无云端上传、无网络请求
- **跨端稳定**：纯 Python (Flask) 实现，Windows / Linux / macOS 通用，零外部依赖服务
- **轻量无负担**：启动 < 1 秒，内存占用 < 50MB

---

## 一、快速开始

### 1. 环境要求

- **Python 3.10+**（[下载地址](https://www.python.org/downloads/)）
  - Windows 安装时勾选 "Add Python to PATH"
  - Linux: `sudo apt install python3 python3-pip` (Ubuntu/Debian)
  - macOS: `brew install python`

### 2. 启动方式

#### Linux / macOS

```bash
cd memory_anchor
./start.sh                # 默认 http://127.0.0.1:7788
./start.sh 8080           # 指定端口
```

#### Windows

双击 `start.bat`，或在命令行：

```cmd
cd memory_anchor
start.bat
start.bat 8080
```

#### 手动启动（任何系统）

```bash
cd memory_anchor
pip install -r requirements.txt   # 首次需要安装依赖
python3 run.py                    # 默认 http://127.0.0.1:7788
python3 run.py --port 8080 --host 0.0.0.0
```

### 3. 访问应用

启动后浏览器打开 **http://127.0.0.1:7788** 即可使用。

> 💡 建议将该地址加入浏览器书签，或使用 Chrome/Edge 的「安装为应用」功能把它变成桌面快捷方式。

---

## 二、核心功能使用指南

### 1. 录入学习内容（仅两种方式）

#### 方式一：手动新增记录

1. 点击右上角「+ 新增」按钮，或按 `Ctrl+N`
2. 填写标题（必填）、标签、学习日期、Markdown 正文
3. **图片上传**：
   - 点击图片上传区域选择文件
   - 直接拖拽图片到上传区
   - 在 Markdown 编辑框中 `Ctrl+V` 粘贴剪贴板图片（自动上传并插入引用）
4. 点击「创建」即可

#### 方式二：从 Markdown 批量导入

1. 在记录页点击「导入」按钮
2. 上传 `.md` 文件，或直接粘贴 Markdown 文本
3. 每个 `# 一级标题` 会作为一张卡片的标题，其后的内容作为正文
4. 若无标题，整篇作为一张卡片
5. 勾选「自动修正」后，导入/粘贴时会自动规整格式（见下节）

#### 记录列表的筛选

记录页顶部可按 **关键词 / 状态 / 标签 / 学习日期区间** 组合筛选，并支持卡片视图与列表视图切换：

- **标签下拉**：列出全部标签并带卡片计数（如 `#物理 (12)`），选一个即只看该标签的卡片
- **点徽章即筛选**：卡片上的每个标签徽章都可直接点击，一键切到该标签
- 右上角「重置」按钮清空全部筛选条件

> 实现：后端 `GET /api/records/tags` 聚合标签计数，`GET /api/records?tag=` 过滤；前端 `static/js/records.js`。

### 2. Markdown 粘贴格式修正

从网页、Word / PPT、PDF 或 AI 对话复制 Markdown 时，常会带入脏格式（多余空行、富文本项目符号、LaTeX 公式标记、全角字符等）。本工具内置「粘贴格式修正」，借鉴 [siyuan-plugin-text-process](https://github.com/Achuan-2/siyuan-plugin-text-process) 的粘贴处理思路，在**新增 / 编辑**和**导入**两个入口提供：

- **粘贴自动修正**（默认开启）：在内容框或导入框 `Ctrl+V` 粘贴纯文本时，自动把剪贴板内容规整后再插入。
- **「修正格式」按钮**：对当前文本框里的全部内容一键规整。
- **「高级格式选项」**（可折叠面板）：逐项开关进阶修正，见下表。
- **导入时 `?fix=1`**：上传 `.md` 文件或导入时勾选「自动修正」，由后端先做格式规整再切分卡片（导入会一并应用勾选的进阶选项）。

修正默认启用以下**安全子集**（不破坏正文内容）：

| 修正项 | 说明 | 默认 |
|--------|------|------|
| 统一换行符 | `CRLF` / `CR` → `LF`，去除行尾空白 | ✅ |
| LaTeX 公式 | `\\[...\]` → `$$...$$`，`\\(...\\)` → `$...$`（跳过代码块/行内代码） | ✅ |
| 项目符号 | `•○▪▫◆◇►▻❖✦✴✿❀⚪■☐🔲✨✅⭐💡⚡` 等 → Markdown `- `，保留缩进层级 | ✅ |
| 折叠空行 | 3 个及以上连续换行 → 1 个空行 | ✅ |

「高级格式选项」里可额外勾选（默认关闭，均为借鉴 siyuan 同名能力）：

| 选项 | 说明 |
|------|------|
| 去链接 (保留文字) | `[label](url)` → `label`，`<a>..</a>` → 文字，裸 `<url>` 删除 |
| 去除上标/角标 | 去除 `<sup>`、`^x^`、独立 `[n]` 角标、Unicode 上标字符 |
| 标题转加粗 (不切卡) | `# 标题` → `**标题**`，导入时整段作为一张卡而非被 `#` 切分 |
| 标题层级归一 (# 起) | 把最浅的 `#` 层级整体抬升到 1 级（如 `##` → `#`），与导入切卡规则对齐 |
| 英文标点→中文 | `, : ; ! ? ( )` → 中文标点，成对引号翻转，小数点 `.` 保留 |
| 中文标点→英文 | 中文标点 → 对应英文标点 |
| 去除换行 | 合并段落（破坏性较强） |
| 智能去空格 | 仅删"中文与中文之间"的空格，保留英文词间空格（借鉴 siyuan） |
| 段间补空行 | 每段之间补一个空行 |
| 全角转半角 | 全角 ASCII / 数字转半角，并清除零宽字符 |

> 所有"逐字符 / 逐行"修正都会**跳过代码块与行内代码**，避免破坏代码内容。后端实现见 `app/markdown_fix.py`，前端调用见 `app/routes/records.py` 的 `/api/records/format`。

**数学公式渲染**：内容采用 [KaTeX](https://katex.org/) 实时渲染，支持 `$$...$$`（独立成行 / 显示态）、`$...$`（行内）、以及原始 LaTeX 标记 `\[...\]`、`\(...\)`。公式在渲染前会被抽离为占位符，避免 Markdown 把公式里的下划线 / 星号等当成强调等语法破坏（代码块与行内代码内的公式不会被误渲染）。

### 2.1 右键批注（附属笔记）

批注是学习记录的**附属信息**，**不单独复习**，也不支持「批注的批注」。用于在多次复习中对某段文字产生新理解时，把理解沉淀下来。

- **引用片段 + 笔记**：每条批注抓两样东西——`quote`（被批注的原文快照，可空 = 整卡批注）和 `note_md`（你的新理解）。批注笔记的输入能力**与新建卡片完全一致**：支持 Markdown、公式（KaTeX 渲染）、粘贴自动修正、高级格式选项。
- **右键添加**：在记录详情或复习页的卡片正文里**选中一段文字**，右键 → 「对选中文字添加批注」，选中内容会自动带入「引用片段」输入框；也可右键 → 「添加整卡批注」（引用留空）。
- **正文内联高亮**：带 `quote` 的批注会在正文里按**引用内容**在**所有出现位置**高亮（即使同一段文字在正文里出现多处，也会全部显示，不依赖脆弱的字符偏移）；鼠标悬浮高亮处即弹出批注笔记。整卡批注（空引用）不高亮，仅在批注列表里展示。
- **管理**：记录详情页有「批注 (N)」区块，可新增 / 编辑 / 删除；批注随卡片导出与备份（整库 SQLite 拷贝）。

> 实现：后端 `app/routes/records.py` 的 `/api/records/<id>/annotations` 增删改查 + `app/db.py` 的 `annotation` 表；前端 `static/js/annotations.js`（右键菜单 / 内联高亮 / 悬浮 / 抽屉）与 `static/js/markdown_editor.js`（复用编辑器）。

### 2.2 速记（辅助记忆的小技巧）

速记是与批注并列的第二个附属模块，专门记「怎么把它记住」，而不是知识点本身：口诀／谐音／首字母、类比、画面感、易混对比、反例。同样**不单独复习**。

- **输入能力完全一致**：速记复用与新建卡片、批注同一套「格式化输入」组件——Markdown + 公式（KaTeX）、粘贴自动修正、一键修正格式、预览、高级格式选项。
- **AI 可选生成**：配置 AI 后，速记抽屉里出现「✨ AI 生成速记」，服务端按卡片正文生成 2~3 条记忆钩子（提示词强制：不复述原文、不补充新知识、公式原样保留、类比必须标注）。**生成结果只填进输入框，由你确认后才保存**；未配置或连续失败会自动回退，入口直接消失。
- **复习时作为回忆线索**：复习页正面（答题前）与答案面都会显示该卡的速记；记录详情页有「💡 速记 (N)」区块，卡片列表上带 `💡 N` 角标。
- **标记来源**：每条速记记 `source`（`user` 手写 / `ai` 生成），列表里以 ✨ 标记，方便日后区分。

> 实现：后端 `app/db.py` 的 `mnemonic` 表 + `app/routes/records.py` 的 `/api/records/<id>/mnemonics` 增删改查 + `app/routes/ai.py` 的 `/api/ai/mnemonic`；前端 `static/js/mnemonics.js`，AI 提示词见 `app/ai.py` 的 `MNEMONIC_SYSTEM`。

### 2.3 待复习列表（自由选择复习内容）

复习页右侧新增「待复习列表」，把原本只能单向推进的队列变成可自由挑选的清单：

- **点哪张复习哪张**：点击列表任意条目直接跳到该卡，不受队列顺序限制；当前卡会高亮并标注「当前」，已评过分的会置灰打勾。
- **勾选只复习这几张**：每条带复选框，勾选后点「复习选中 (N)」，队列会重建为只含所选卡片并从头开始。
- **筛选与搜索**：「全部 / 到期 / 新卡」三档状态筛选 + 标签下拉 + 标题正文关键词搜索，并支持「全选当前结果」。筛选只影响列表显示，不会打乱实际复习顺序。
- **添加卡片（含未到期）**：点「+ 添加卡片」从**全部记录**里挑选，可搜索、按状态过滤、「只看不在队列的」，勾选后加入本次复习。未到期的卡片在列表里标注「未到期 · N 天后」，可以提前复习。同理，记录详情页的「立即复习」对未到期卡片也会自动把它拉进队列，不再提示「不在队列中」。

> 实现：全部在前端 `static/js/review.js`（`filteredQueue` / `renderQueueList` / `startSelected` / `openPicker`），复用 `/api/records` 取全量记录，无需新增后端接口。列表状态（选中、已完成、筛选）保存在 `ReviewTab.state` 中。

### 3. 复习流程

1. 顶部导航点击「复习」Tab，或按 `Ctrl+R`
2. 系统自动筛选到期卡片，按 `due` 时间排序（队列上限 500 张）
3. 可在右侧「待复习列表」里**自由点选**要复习的卡片，或勾选后「复习选中」
4. 看到标题后先尝试回忆：
   - **笔记卡**：正文先不显示，在复述框里用自己的话讲一遍；配置 AI 后可点「🔍 对比分析」看覆盖度 / 遗漏 / 纠错
   - **题目卡**：正面直接显示题干，在框里写下你的解答或思路
   - 卡片上的「💡 速记」可作为回忆线索
5. 按 `Space` 或点击「跳过，直接看答案」显示完整内容；**答案面顶部会并排显示你刚才写的复述**（以及对比分析的覆盖度 / 遗漏 / 纠错），方便逐条对照
6. 根据回忆情况评分（三档）：
   - **完全忘记** (快捷键 `1`)：10 分钟后重学，稳定性大幅下降
   - **记忆模糊** (快捷键 `2`)：稍后复习，间隔略增
   - **熟练掌握** (快捷键 `3`/`4`)：按 FSRS-5 计算的间隔（数日至数月）后复习
7. 评分后自动进入下一张，完成全部队列时显示「🎉 复习完成」（可直接「添加卡片继续复习」）

> **FSRS-5 智能排期**：算法根据卡片当前的「稳定性 S」和「难度 D」动态计算下次复习时间，目标保留率默认 90%。同一张卡片反复熟练后，间隔会指数增长（1天→3天→8天→21天→60天→...），避免无意义重复。

### 4. 数据统计

- **总览卡片**：总卡片数、今日待复习、今日已复习、记忆健康度
- **学习热力图**：GitHub 风格 365 天活动图
- **保留率趋势**：近 30 天复习时回忆起的平均概率
- **本周活动**：每天新增 vs 复习条数对比
- **标签分布**：Top 10 标签柱状图

### 5. 数据管理

#### 备份与恢复

设置页 → 数据备份与恢复：

- **手动备份**：点击「立即备份」生成 `backup_YYYYMMDD_HHMMSS.db`
- **自动备份**：开启后每 N 天自动备份一次（启动时检查）
- **恢复**：点击「↻」从备份还原（恢复前会自动创建安全快照）
- **下载**：点击「⬇」下载备份文件到本地
- **删除**：点击「✕」清理旧备份

#### 导出记录

记录页 → 「导出」：

- **CSV**：包含全部字段，适合 Excel 分析
- **Markdown**：合并为单一 `.md` 文档，便于二次归档

### 6. 个性化设置

- **主题**：浅色 / 深色（自动跟随系统）
- **目标保留率**：0.70 ~ 0.99，推荐 0.85 ~ 0.95
- **快捷键**：自定义新增/复习/搜索快捷键
- **学习目标**：每日新卡片数 / 复习数

### 6.1 AI 服务（可选增强）与连接诊断

不配置 = 所有 AI 功能自动关闭，产品完整可用。三项（Base URL / API Key / 模型名）都填齐并保存后才会出现 AI 入口。

- **Base URL 只填到 `/v1` 这一级**，程序会自己拼 `/chat/completions`。填了整条接口地址或漏写协议头都会被自动纠正，并在诊断信息里提示。
- 请求显式带 `stream: false`；**部分网关无视它、一律按 SSE 流式返回**的情况也已兼容——程序会把 `data: {...}` 一行行的 chunk 拼回完整文本，功能照常可用。
- **有的网关把 `system` 当成“用户问的问题”**，于是模型不按要求答题、而是回一句“请把要格式化的文本发给我”。遇到这种元回答会自动把 system 合并进 user 再请求一次，正常拿到结果。
- 同一批网关还常无视“10~20 个字”的要求、回一整段说明，所以标题会被自动收拾（去加粗/引号、按括号或谓语断句），得到“拉格朗日中值定理”这种短标题，而不是硬截半句话。
- **超时可在设置页调（默认 25 秒，范围 5–120）**：中转网关单次响应普遍 8–12 秒，觉得不够就把 `ai_timeout` 调大。
- **「测试连接」不需要先保存**：按钮直接用输入框里当前的值去测，测完才知道要不要保存。
- 失败时设置页展开**诊断面板**，给出请求地址、模型、耗时、HTTP 状态、服务端原文，以及一句"该怎么改"，可一键复制。

| 现象 | 诊断显示 | 通常怎么改 |
|---|---|---|
| 域名解析不了 | `kind=dns`，域名解析失败 | 域名拼错 / 本机 DNS 不通 / 需要代理 |
| 连不上端口 | `kind=refused`，连接被拒绝 | 端口写错，或对方服务没启动 |
| 一直转圈后失败 | `kind=timeout`，连接超时（默认 25s） | 网络不通或太慢；也先把设置里的 `ai_timeout` 调大再试 |
| 握手就断 | `kind=tls`，TLS/证书校验失败 | 本机自签服务把 https 改成 http |
| `401` | 鉴权失败 + 服务端原文 | Key 填错/过期，重新生成 |
| `403` | 无访问权限 | 这把 Key 没开通该模型 |
| `404` | 接口不存在 | Base URL 只填到 `/v1` |
| `429` | 限流或余额不足 | 稍后再试 / 充值 |
| `5xx` | 服务端故障 | 与你的配置无关，换节点或稍后重试 |
| 返回一段 HTML | `kind=parse`，响应是一段 HTML | 被网关或登录页拦截了 |
| 响应是 `data: {...}` 一行行 | 已自动按 SSE 聚合，正常工作 | 无需处理；若聚合后无内容才报错 |
| 流式但没内容 | `kind=parse`，流式响应里没有文本内容 | 换支持非流式的地址或换模型 |
| 返回“请把要格式化的文本发给我” | 自动合并 system 后重试，通常第二次就正常 | 无需处理；若持续如此说明该网关不支持 system 角色 |

生成标题 / 复述对比 / 速记时失败也一样：提示里直接带具体原因，连续 2 次失败才熔断隐藏入口，主流程不受影响。诊断信息里 API Key 只显示掩码（如 `sk-…999(26位)`），不会回显完整 Key。

> 相关接口：`GET /api/ai/status?ping=1`、`POST /api/ai/test`（可带 `base_url/api_key/model` 覆盖值，不落库）。实现见 `app/ai.py` 的 `normalize_base_url` / `_classify_exception` / `_http_diagnose`。

---

## 三、文件结构

```
memory_anchor/
├── run.py                     # 入口脚本
├── start.sh                   # Linux/macOS 启动器
├── start.bat                  # Windows 启动器
├── requirements.txt           # Python 依赖（Web 应用）
├── requirements-mcp.txt       # MCP 可选依赖（requests + mcp，仅用 MCP 时才装）
├── app/
│   ├── __init__.py
│   ├── main.py                # Flask 应用主文件
│   ├── db.py                  # SQLite 数据库初始化
│   ├── fsrs.py                # FSRS-5 算法实现
│   ├── utils.py               # 通用工具函数
│   ├── markdown_fix.py        # Markdown 粘贴格式修正 + 思源方言清洗
│   ├── ai.py                  # AI 可选增强封装 (标题 / 费曼对比 / 速记提示词)
│   ├── routes/
│   │   ├── records.py         # 记录 CRUD + 图片 + 导入导出 + 批注/速记 API + 标签聚合
│   │   ├── review.py          # 复习中心 API
│   │   ├── stats.py           # 数据统计 API
│   │   ├── ai.py              # AI 端点 (状态 / 标题 / 费曼对比 / 速记)
│   │   ├── settings.py        # 设置 API
│   │   └── backup.py          # 备份恢复 API
│   ├── mcp_server/            # MCP server (stdio, 转调 HTTP API, 不直连库)
│   │   ├── server.py          # 12 个工具定义
│   │   └── client.py          # 轻量 HTTP 客户端
├── templates/
│   └── index.html             # 单页应用入口
├── static/
│   ├── css/app.css            # 自定义样式
│   ├── js/
│   │   ├── utils.js           # 通用工具
│   │   ├── records.js         # 记录 Tab
│   │   ├── review.js          # 复习 Tab
│   │   ├── stats.js           # 统计 Tab
│   │   ├── settings.js        # 设置 Tab
│   │   ├── markdown_editor.js # 可复用 Markdown 编辑器组件
│   │   ├── annotations.js     # 右键批注：菜单/内联高亮/悬浮/抽屉
│   │   ├── mnemonics.js       # 速记模块：抽屉/列表 (复用格式化输入 + AI 生成)
│   │   └── app.js             # 主应用
│   └── uploads/               # 上传的图片
├── data/
│   └── memory_anchor.db       # SQLite 数据库(运行后自动生成)
└── backups/                   # 备份文件目录
```

---

## 四、数据存储位置

| 文件 | 路径 | 说明 |
|------|------|------|
| 主数据库 | `data/memory_anchor.db` | 全部学习记录/复习日志/设置 |
| 图片上传 | `static/uploads/` | 粘贴/上传的所有图片 |
| 备份文件 | `backups/*.db` | 手动 + 自动备份 |

> 💡 **完整迁移**：把整个 `memory_anchor/` 目录复制到新机器即可，无任何外部依赖。

---

## 五、技术架构

### 后端 (Python)

- **Web 框架**：Flask 3.1（轻量、稳定、零配置）
- **数据库**：SQLite 3（Python 内置，单文件存储，支持 WAL 模式并发）
- **核心算法**：FSRS-5 自实现（19 权重 + 幂函数遗忘曲线 + 稳定性/难度更新）
- **图片处理**：Pillow（仅用于文件读写）
- **Markdown 解析**：markdown-it-py（前端用 markdown-it.js 渲染）

### 前端 (无构建工具)

- **CSS**：Tailwind CSS 3 (CDN JIT)
- **JS**：原生 ES6 + 模块化（无 React/Vue 等框架依赖）
- **图标**：内联 SVG（无外部图标库）
- **字体**：Inter + PingFang SC（系统字体回退）

### 数据库 Schema

```sql
study_record (id, title, tags, content_md, image_paths, learn_date, note,
              state, stability, difficulty, reps, lapses, last_review, due,
              priority, pinned, created_at, updated_at)

review_log (id, record_id, rating, reviewed_at, elapsed_days, scheduled_days,
            retention, state_before, state_after,
            stability_before, stability_after,
            difficulty_before, difficulty_after)

-- 事项4 (错题): 都由 db._ensure_columns 幂等追加, 旧库启动自动升级
study_record 追加: kind(note|quiz), solution_md, rubric, mistake_tags
review_log   追加: missed_points, mistake_tags

-- 批注: quote 为原文快照(可空=整卡), note_md 为新理解
annotation (id, record_id, quote, note_md, review_log_id, created_at, updated_at)

-- 速记: content_md 为记忆小技巧, source=user|ai
mnemonic (id, record_id, content_md, source, created_at, updated_at)

settings (key, value)  -- JSON-encoded

backup_log (id, backup_time, backup_type, file_path, file_size, note)
```

---

## 六、常用操作

### 修改默认端口

编辑 `run.py` 中的 `default=7788`，或启动时加参数：

```bash
python3 run.py --port 9000
```

### 让局域网其他设备访问

```bash
python3 run.py --host 0.0.0.0 --port 7788
```

然后局域网内其他设备访问 `http://你的IP:7788`。

### 数据完全重置

```bash
rm -rf data/ backups/ static/uploads/
python3 run.py  # 会自动重建空数据库
```

### 升级依赖

```bash
pip3 install -U -r requirements.txt
```

### 通过 MCP 让 AI 操作记忆锚

项目内置一个 stdio 型 MCP server（`mcp_server/server.py`）。它不直连数据库，而是把工具调用转成 HTTP 请求打到记忆锚的 Flask API，因此 FSRS 排程逻辑只有 Web 端这一处入口。

MCP server 是独立进程，需要额外依赖（主 Web 应用不需要）：

```bash
pip3 install -r requirements-mcp.txt
```

工具集（12 个）：

| 工具 | 说明 |
|------|------|
| `list_due_cards` | 列出今日待复习卡片（含新卡） |
| `search_cards` | 按关键词 / 标签 / 状态 / 类型（`kind=note\|quiz`）搜索 |
| `list_tags` | 列出全部标签及卡片计数（先摸清知识结构再筛） |
| `get_card` | 取单张卡片全文（含复习日志、批注） |
| `create_card` | 建卡；`kind="quiz"` 时可按题目卡建（题干 + 标准解答 + 评分点 rubric） |
| `import_markdown` | 从 Markdown 批量建卡（按 `# ` 分卡） |
| `quick_capture` | 思源快捕同一入口：清洗思源方言后建卡，可带来源回链 / 题目卡字段 |
| `add_annotation` | 给卡片加批注 |
| `add_mnemonic` / `list_mnemonics` | 给卡片加速记（记忆小技巧）/ 列出速记 |
| `submit_rating` | 对卡片评分并推进 FSRS |
| `stats_summary` | 学习概览统计 |

`submit_rating` 仅在你明确说出评分时才应被调用——**评分必须由人完成，AI 不替你评**。

**启动记忆锚**（MCP server 通过 `MEM_BASE_URL` 找到它）：

```bash
python3 run.py            # 默认 127.0.0.1:7788
```

**在任意 MCP 客户端里接入**（Claude Desktop / Cursor / 其他支持 MCP 的工具），编辑其 `mcpServers` 配置：

```json
{
  "mcpServers": {
    "memory-anchor": {
      "command": "python3",
      "args": ["/绝对路径/memory_anchor/mcp_server/server.py"],
      "env": { "MEM_BASE_URL": "http://127.0.0.1:7788" }
    }
  }
}
```

> 注意 `args` 里用 server.py 的**绝对路径**；内网/本机使用无需任何鉴权。部署定位见 TODO.md。

---

## 七、FAQ

**Q: 为什么是 Web 应用而不是桌面原生应用?**
A: Web 形式让 Windows/Linux/macOS 三端体验完全一致，且无需安装 Electron 等臃肿运行时。启动后用浏览器访问即可，也可以「安装为应用」变成桌面快捷方式。

**Q: 我的数据会上传到云端吗?**
A: 不会。所有数据都在本地 `data/memory_anchor.db` 一个 SQLite 文件中。整个应用启动后只在你本机回环地址 127.0.0.1 通信，无任何外网请求。

**Q: FSRS-5 比传统艾宾浩斯好在哪?**
A: 传统艾宾浩斯是固定时间点复习（1天/2天/4天/7天/15天...），所有人一样；FSRS-5 根据你每张卡的回忆表现动态调整间隔，简单的内容间隔迅速拉长，难的内容间隔短，节省 30%+ 复习时间。

**Q: 卡片太多会不会卡?**
A: SQLite 单文件支持千万级行数据，加上 WAL 模式和索引，万级卡片列表秒开。前端列表分页加载，默认 500 条上限。

**Q: 如何打包成单可执行文件?**
A: 可选使用 PyInstaller：`pyinstaller --onefile --add-data "templates:templates" --add-data "static:static" run.py`，但通常直接运行 `python3 run.py` 已足够轻量。

---

## 八、开发优先级实现状态

按需求文档 P0 ~ P3 分级，全部已实现：

| 优先级 | 内容 | 状态 |
|--------|------|------|
| P0 | SQLite 4 张表 | ✅ |
| P0 | 图片粘贴/上传 | ✅ |
| P0 | Markdown 录入 + 导入 | ✅ |
| P1 | 粘贴格式修正 (借鉴 siyuan 文本处理) | ✅ |
| P1 | 数学公式 KaTeX 渲染 ($$/$/\[/\() | ✅ |
| P0 | FSRS-5 复习逻辑 | ✅ |
| P0 | 本地读写 + 备份恢复 | ✅ |
| P1 | 四页 UI | ✅ |
| P1 | 搜索/筛选/批量操作 | ✅ |
| P1 | 详情抽屉 | ✅ |
| P1 | 完整复习流程 | ✅ |
| P2 | 右键批注（引用片段 + 笔记，正文内联高亮，与新建卡片一致输入能力） | ✅ |
| P2 | 待复习列表（跳选 / 多选 / 筛选搜索 / 添加未到期卡片） | ✅ |
| P2 | 全局快捷键 | ✅ |
| P2 | CSV/MD 导出 | ✅ |
| P2 | 统计图表 | ✅ |
| P2 | 学习热力图 | ✅ |
| P3 | 主题切换 | ✅ |
| P3 | FSRS 参数自定义 | ✅ |
| P3 | UI 动效 + 反馈 | ✅ |

---

## 九、License

MIT License - 自由使用、修改、分发。
