# 记忆锚 · 待办与实施方案 (Roadmap)

> **部署定位（已确认）**：内网 / 本机使用，暂不公开。**安全措施整体暂缓**（不加鉴权、CORS 全放开）。
> 公网化时再启用，见文末「暂缓区」的安全清单。
>
> **优先级（已确认）**：1 MCP → 2 AI 标题 → 3 费曼复述 → 4 错题 → 5 思源快速捕捉。
> 状态：⬜ 未开始 / 🟨 进行中 / ✅ 完成
>
> **当前进度**：1–5 ✅ + 第二轮迭代 6.1–6.5 ✅（速记 / 标签筛选 / 题目卡预览 / 答案面复述对比 /
> MCP 12 工具 / 思源快捕题目卡）+ 6.6 ✅（AI 连接失败诊断）+ 6.7 ✅（非常规网关兜底）。
> 自测：第一轮 204 项 + 本轮 150 项（后端 58 / MCP 39 / 前端 53）+ 诊断 71 项
> （后端 49 / 前端 22）+ 网关兜底 34 项（SSE 13 / 回退 11 / 标题清洗 10）全绿，另有 110 项回归全绿。
> **已推送 GitHub**：JohnFKS/mem@master（远端 46 个文件与本地逐文件 blob SHA 校验一致）。
> 公网预览：https://a1730183bef387d8c.app.workbuddy.host

| # | 事项 | 一句话定位 | 状态 |
|---|------|-----------|------|
| 1 | MCP Server | 让 agent 完整操作记忆锚，是后续自动化的数据管道 | ✅ |
| 2 | AI 标题 | 根据内容生成标题，半天工作量 | ✅ |
| 3 | 费曼复述 + gap 分析 | 补上「输出」环节，分析结果落成批注 | ✅ |
| 4 | 错题 + 错因标签 | `kind` 字段区分，错因驱动复习，先不上 AI 批改 | ✅ |
| 5 | 思源快速捕捉插件 | 思源里选中文字 → 右键发送 → 自动建卡（单向推送） | ✅ |

> **给实现模型的通用约束**：严格遵守本文档的接口路径与字段名（均来自现有代码，已核对）；
> 不做文档之外的"顺手优化"；每完成一项先跑该项的验收清单再继续。
>
> **AI 是可选增强（已确认）**：不配置 AI = 所有 AI 功能入口自动关闭，产品完整可用；
> 配置无误后才出现 AI 入口；运行中断线/超时**自动回退**到无 AI 路径，绝不阻塞主流程。
> 具体机制见事项 2 的「AI 三态开关与自动回退」，事项 2/3/5 的 AI 部分一律遵守。

---

## 1. MCP Server

### 目标
提供 stdio 型 MCP server，让 agent 通过工具调用操作记忆锚。**server 不直连 SQLite**，
所有操作转调 Flask HTTP API，保证 FSRS 排程逻辑单一入口。

### 涉及文件（全部新建）
```
memory_anchor/mcp_server/server.py    # 工具定义 (FastMCP)
memory_anchor/mcp_server/client.py    # 轻量 HTTP 客户端
```
依赖：`pip install requests mcp`（`requests` 在 `requirements.txt`；`mcp` 单独放 `requirements-mcp.txt`，
见下方进度说明）。

### 配置
环境变量 `MEM_BASE_URL`，默认 `http://127.0.0.1:7788`。无鉴权（内网）。

### 工具定义（8 个，映射到现有 API）

| 工具 | 参数 | 调用 |
|---|---|---|
| `list_due_cards` | `limit=20, include_new=true` | `GET /api/review/queue?limit&include_new` |
| `search_cards` | `keyword, tag="", state="", limit=20` | `GET /api/records?search&tag&state&limit` |
| `get_card` | `record_id` | `GET /api/records/<id>`（含 review_logs 与 annotations） |
| `create_card` | `title(必填), content_md, tags=[]` | `POST /api/records` JSON `{title, content_md, tags}` |
| `import_markdown` | `text, fix=true` | `POST /api/records/import_md` JSON `{text, fix}`，按 `# ` 一级标题分卡 |
| `add_annotation` | `record_id, quote="", note_md` | `POST /api/records/<rid>/annotations` `{quote, note_md}`，quote 与 note_md 不可同时为空 |
| `submit_rating` | `record_id, rating("again"\|"hard"\|"easy")` | `POST /api/review/<id>/answer` `{rating}` |
| `stats_summary` | 无 | `GET /api/stats/overview` |

### 实施步骤
1. `client.py`：封装 `get(path, params)` / `post(path, json)`，非 2xx 抛出含响应体的异常。
2. `server.py`：用 `mcp.server.fastmcp.FastMCP` 注册上表 8 个工具；返回值序列化为紧凑
   JSON 字符串（工具返回给 LLM 的内容要短：卡片只带 `id/title/state/due/tags` 摘要，不带全文，
   `get_card` 除外）。
3. `submit_rating` 的 docstring 必须写明「仅在用户明确说出评分时调用，禁止自动评分」。
4. `requirements.txt` 追加 `requests>=2.28`；`mcp>=1.2.0,<2` 单独放 `requirements-mcp.txt`。
5. README 增加接入说明（Claude/其他客户端的 mcpServers 配置示例，command=`python3`，args 指向 server.py）。

### 验收清单
- [x] `python3 mcp_server/server.py` 可启动不报错（stdio 等待输入即正常）。
- [x] 任一 MCP 客户端里能列出 8 个工具。
- [x] `list_due_cards` 返回与服务端 `GET /api/review/queue` 一致的数据。
- [x] `create_card` 建卡后记录列表可见；`title` 为空时返回 400 错误信息而非崩溃。
- [x] `submit_rating` 后 `GET /api/review/logs` 出现新日志。

### 禁区
- ❌ 禁止在 server 里 import `app.*` 或直接读写 `data/memory_anchor.db`。
- ❌ 禁止新增"自动评分""批量评分"类工具。

### 进度（2025-06-19 实现）
- 新建 `mcp_server/__init__.py`、`mcp_server/client.py`、`mcp_server/server.py`；
  `requirements.txt` 追加 `requests>=2.28`；**`mcp>=1.2.0,<2` 单独拆到 `requirements-mcp.txt`**
  （2.x 已把 FastMCP 改名，按 TODO 约定锁定 1.x 以保证 `FastMCP` API 一致；拆出来的原因是
  `mcp` 在本机安装会与 Debian 自带的 `typing_extensions` 冲突，放进主 requirements 会拖垮
  Web 应用部署）。README 新增「通过 MCP 让 AI 操作记忆锚」一节。
- 8 个工具全部注册，含 `submit_rating` 在工具层**先校验 rating 再调 API**，docstring 写明
  「仅在用户明确说出评分时调用，禁止自动/批量评分」。
- 本地验证（15/15 通过）：client 层覆盖 stats/search/list_due/create/get/annotation/rating/import；
  **真实 stdio MCP 会话**调用 `stats_summary` / `list_due_cards` 返回与 API 一致。
- **实战验证**：用真实 stdio MCP 会话在你的公网实例上建了一张含 LaTeX 的高数卡
  （`id=24`，标题「数列极限：x_{n+1}=½(x_n+arctan x_n) 的存在性与极限求值」），正文逐字节
  一致，公式未损坏；`list_due_cards` / `stats_summary` 与 API 返回一致。
- 状态：✅ 已实现并自测通过。已推送 GitHub（524aa42）。
- 你的复验方式（任选）：
  1. 在本地另起记忆锚 `python3 run.py`，按 README 的 `mcpServers` 配置接入任一 MCP 客户端，
     看是否能列出 8 个工具并调用（如让 agent 读概览、建一张卡）。
  2. 直接跑 `python3 mcp_server/server.py`，进程不报错、等待 stdin 即正常。
  3. 需要清理上面的测试卡 `id=24` 的话，说一声我删掉。

---

## 2. AI 标题

### 目标
新建/编辑卡片时按正文生成标题；批量导入时可对无标题切片补标题。

### 涉及文件
| 文件 | 改动 |
|---|---|
| `app/ai.py` | **新建**：LLM 调用封装（OpenAI 兼容 `/chat/completions`，用 requests，不引 SDK） |
| `app/routes/ai.py` | **新建**：蓝图 `bp = Blueprint("ai", __name__, url_prefix="/api/ai")` |
| `app/main.py` | 注册 ai 蓝图 |
| `app/routes/settings.py` | `update_settings()` 的 `allowed` 白名单**追加**三个键：`ai_base_url`、`ai_api_key`、`ai_model` |
| `static/js/records.js` | 标题输入框旁加「✨」按钮 |

### 接口定义
```
GET /api/ai/status[?ping=1]
Resp: {"configured": bool, "ping_ok": bool|null, "message": "..."}
  - configured: ai_base_url / ai_api_key / ai_model 三个键均非空
  - ping_ok:    null = 未检测；带 ?ping=1 时做一次连通测试(超时5s)，返回 true/false
  - message:    人读的状态描述，如 "未配置，AI 功能已关闭" / "已配置，连接正常" / "已配置但连接失败"

POST /api/ai/title
Body: {"content_md": "..."}
Resp: {"title": "..."}          # 失败: 502 {"error": "..."}
# 未配置 AI 时返回 503 {"error": "AI 未配置，功能已关闭", "code": "ai_not_configured"}
```
`ai_base_url` 形如 `https://api.example.com/v1`；`ai_model` 如 `gpt-4o-mini`；
`ai_api_key` 以 `Bearer` 方式放 `Authorization` 头。配置从 settings 表读
（`get_all_settings()`，值是 JSON 编码的，读取后需还原类型）。

### AI 三态开关与自动回退（事项 2/3/5 的 AI 部分一律遵守）

| 状态 | 判定 | 前端行为 |
|---|---|---|
| **关闭** | `configured=false` | AI 入口**完全不渲染**（不是置灰）：✨ 标题按钮、"对比分析"按钮都不出现；页面无任何 AI 残留 |
| **可用** | `configured=true` 且正常 | AI 入口正常显示 |
| **回退（熔断）** | 运行中调用失败 | toast 一次「AI 暂不可用，已自动回退」→ **本会话禁用 AI 入口**（前端标记 `aiDisabled`），恢复途径 = 刷新页面或在设置里保存配置 |

回退后的行为（零 AI 路径，必须与改造前一致）：

| 功能 | 回退行为 |
|---|---|
| AI 标题（事项 2） | 标题框留空手动填；无其他影响 |
| gap 分析（事项 3） | 复述面板**保留**（复述本身不依赖 AI）+「跳过，直接看答案」可继续复习，只是没有分析结果 |
| quick-capture AI 标题（事项 5 后续增强） | 用首行截断，本来就有 |

实现要点：
- 前端维护 `aiState = {configured: bool, disabled: bool, failCount: int}`；
  页面初始化与设置保存后各调一次 `GET /api/ai/status`；
  **连续失败 ≥2 次**即触发熔断（避免每张复习卡都干等 10s 超时）；
- 后端各 AI 端点先查配置，未配置直接 `503 ai_not_configured` 快速失败；后端无状态、不做熔断；
- 设置页显示状态徽章（未配置 / 已连接 / 连接失败）+「测试连接」按钮（调 `?ping=1`）。

### 提示词（直接使用）
```
你是学习卡片的命名助手。根据卡片正文拟一个中文标题：
- 10~20 个字，概括核心知识点，不加句号
- 不要"关于""浅谈"等废话前缀
- 只输出标题本身，不要任何解释或引号
```
参数：`max_tokens=50`，`timeout=10`。

### 实施步骤
1. `app/ai.py`：`def chat(messages, max_tokens=200, json_mode=False) -> str`；
   `def generate_title(content_md) -> str`（正文先截断到 2000 字符）。
   配置缺失 / 网络失败 / 非 200 → 抛 `AIError(str)`；
   另加 `def is_configured() -> bool`（三个键均非空）。
2. `app/routes/ai.py`：
   - `GET /status`：按三态返回 configured / ping_ok / message；
   - `POST /title`：`is_configured()` 为假 → `503 ai_not_configured`；
     捕获 `AIError` 返回 `502 {"error": str(e)}`；`content_md` 为空返回 400。
3. settings 白名单加三个键（见上表）。设置页（settings.js）加「AI 服务」区块：
   Base URL / API Key / 模型名 三个输入框（API Key 用 password 型），保存走现有
   `PUT /api/settings`；保存后调用 `GET /api/ai/status?ping=1` 刷新状态徽章；
   区块内放「测试连接」按钮。
4. records.js：接入 `aiState` 三态（见「AI 三态开关与自动回退」）——
   **未配置或熔断时 ✨ 按钮不渲染**；可用时点击 → `POST /api/ai/title`（body 用当前
   编辑器正文）→ 成功填入标题框，失败走熔断计数；正文为空时按钮不出现。
5. import_md 不改动：切片本就以 `# ` 标题分卡，暂不做 AI 补标题（后续有需要再说）。

### 验收清单
- [x] **未配置 AI 时**：全应用看不到任何 AI 入口（✨ 按钮不存在）；`GET /api/ai/status`
      返回 `configured=false`；`POST /api/ai/title` 返回 503 `ai_not_configured`；
      新建/编辑/导入/复习全部功能正常（零 AI 路径回归）。
- [x] 配置正确后**无需刷新其他页面**：设置保存 → 状态徽章变「已连接」→ 编辑器出现 ✨
      按钮 → 生成标题填入标题框（可手改）。
- [x] 配置错误（错误 Key / 错误 URL）时：状态徽章「连接失败」；✨ 按钮点击后 toast 报错，
      连续 2 次失败后按钮自动消失并提示已回退；页面不崩。
- [x] 运行中拔网线 / API 超时：10 秒内失败并回退，复习与新卡主流程不受影响。
- [x] `PUT /api/settings` 可保存 `ai_base_url` 等三个键，`GET` 能读回。
- [x] 正文 5000 字符时仍能正常返回（验证截断生效）。

### 禁区
- ❌ 禁止把 `ai_api_key` 的值打印进日志或返回给前端回显（输入框 type=password 即可）。
- ❌ 禁止同步阻塞超过 15 秒（timeout 必须设置）。

### 进度（已实现并自测 20/20 通过）
- 新建 `app/ai.py`（`chat` / `generate_title` / `ping` / `is_configured`，全部带 timeout）
  与 `app/routes/ai.py`（`GET /api/ai/status`、`POST /api/ai/title`）；
  `main.py` 注册蓝图；`settings.py` 白名单追加 `ai_base_url`/`ai_api_key`/`ai_model`。
- 共享三态逻辑放 `utils.js`：`aiState` + `refreshAiState()` / `aiEnabled()` /
  `aiNoteFailure()`（连续失败 ≥2 熔断）/ `syncAiEntries()`。`app.js` init 时拉一次。
- 设置页新增「AI 服务（可选）」区块：Base URL / API Key(password, 不回显) / 模型名 +
  状态徽章 + 「测试连接」；保存后即时 `?ping=1` 刷新，无需刷新页面。
- 编辑器标题框右侧 ✨ 按钮：**仅在 AI 可用且正文非空时渲染**；失败计入熔断后自动隐藏。
- 自测方式：起本地 mock OpenAI 服务（good/bad/garbage/slow 四种），覆盖
  未配置 503、可用 200、500/非 JSON/超时三类失败均 502、空正文 400、5000 字符截断、
  设置白名单读写、清空后回到未配置。已推送 GitHub（524aa42）。

---

## 3. 费曼复述 + gap 分析

### 目标
复习时在「显示答案」**之前**先写下自己的复述，AI 对比原文输出 gap 分析；
分析结果可一键存为**整卡批注**。**评分永远由人完成**，AI 只给建议角标。

### 涉及文件
| 文件 | 改动 |
|---|---|
| `app/ai.py` | 追加 `gap_analysis(standard_md, user_summary) -> dict` |
| `app/routes/ai.py` | 追加 `POST /api/ai/gap` |
| `static/js/review.js` | 复述面板 + 结果渲染 + 存为批注 |
| `static/css/app.css` | 少量样式 |

### 接口定义
```
POST /api/ai/gap
Body: {"record_id": 42, "user_summary": "我的复述…"}
逻辑: 服务端按 record_id 自行取 content_md 作为标准答案（不信任前端传入原文）
Resp: {"coverage": 60, "missed": ["关键点X", "关键点Y"],
       "wrong": [{"claim": "用户说的", "correction": "正确的是"}],
       "advice_rating": "hard", "comment": "一句话总评"}
失败: 502 {"error"}
```

### 输出约束（提示词核心，直接使用）
```
你是费曼学习法的检查员。对比【标准内容】与【学生复述】，输出严格 JSON（不要多余文字）：
{"coverage": 0-100整数,            // 复述覆盖标准内容要点的百分比
 "missed": ["被遗漏的要点", ...],   // 最多5条
 "wrong": [{"claim":"复述中错误的原句片段","correction":"正确说法"}, ...],  // 最多3条
 "advice_rating": "again"|"hard"|"easy",   // 按覆盖度与错误数: <40或错误≥2→again; 40~75→hard; >75且无错误→easy
 "comment": "一句话总评"}
标准内容与复述都可能含公式，注意 $...$ 保持原样比较。
```
调用 `chat(..., json_mode=True)`；解析时先 `json.loads`，失败则用正则
`r"\{[\s\S]*\}"` 提取首个 JSON 块再试一次，仍失败抛 `AIError`。

### 实施步骤
1. `app/ai.py` 加 `gap_analysis`（正文截断到 3000 字符、复述截断到 1000 字符）。
2. 路由 `POST /gap`：record 不存在返回 404；`user_summary` 为空返回 400。
3. review.js：
   - `state` 加 `feynman: {text: "", result: null}`；接入共享的 `aiState`；
   - **改写 showAnswer 之前的分支**：把"💡 点击显示答案"按钮区域替换为复述面板——
     textarea（placeholder：用自己的话讲一遍，写不出来正好说明这里没懂）+
     次要按钮「跳过，直接看答案」（保留原 showAnswerFn 行为）；
     **「🔍 对比分析」按钮仅在 `aiState` 处于"可用"时渲染**——未配置或熔断时面板只有
     复述框和跳过按钮（复述行为本身零 AI 依赖，永远可用）；
   - 点「对比分析」→ `POST /api/ai/gap` → 结果渲染在 textarea 下方：
     覆盖度进度条 + missed 列表 + wrong 对照表 + comment + 角标文字
     「建议评分：hard（仅建议，评分仍由你决定）」；
     AI 未配置时该端点返回 503，前端不应发出请求（按钮都没渲染），双保险；
   - 结果区加「💾 存为批注」按钮 → `POST /api/records/<id>/annotations`
     `{quote: "", note_md: "### 费曼复盘\n\n- 覆盖度: 60%\n\n**遗漏**:\n- X\n- Y\n\n**纠错**:\n- 说错了…\n"}`
     （整卡批注，复用现有批注体系，复习页可见高亮/列表）；
   - 三个评分按钮旁用小字显示 `advice_rating` 匹配提示（如 advice=hard 时在"记忆模糊"按钮上加 ring 高亮）；
   - 翻到下一张卡时清空 `state.feynman`。
4. 错误路径：AI 失败时按熔断规则计数与回退，且**必须**仍提供「跳过，直接看答案」兜底——
   AI 挂掉时的体验 = 事项 3 未上线的旧版复习流程。

### 验收清单
- [x] 不写复述直接点「跳过」→ 与旧版行为完全一致。
- [x] **未配置 AI 时**：复述面板仍然出现（复述框 + 跳过按钮），只是没有「对比分析」；
      复习主流程零 AI 依赖。
- [x] 复述后点对比 → 显示覆盖度/遗漏/纠错/建议，评分按钮无自动触发。
- [x] 分析中途 AI 断线 → 计入熔断，2 次后"对比分析"按钮消失，toast 提示已回退，
      复述框与跳过按钮保持可用。
- [x] 「存为批注」后，记录详情页批注区出现"费曼复盘"条目。
- [x] record_id 不存在返回 404；复述为空返回 400。
- [x] AI 返回非法 JSON 时走正则兜底或 502，前端 toast 不崩。

### 禁区
- ❌ 禁止自动调用 `POST /api/review/<id>/answer`——评分必须人点。
- ❌ 禁止把 gap 结果写进 `review_log`（本期只落批注）。
- ❌ 标准答案必须服务端取，禁止信任前端传原文。

### 进度（已实现并自测 47 项通过）
- `app/ai.py` 追加 `gap_analysis()` + `_parse_gap()`（先直接解析 → 去代码围栏 → 正则提取首个
  JSON 块；并对 coverage/missed/wrong/advice_rating 做规范化与截断）。
- `app/routes/ai.py` 追加 `POST /api/ai/gap`：record 不存在 404、复述为空 400、未配置 503、
  AI 失败 502；**标准答案服务端按 record_id 取**，不信任前端。
- `review.js`：「显示答案」前改为复述面板（textarea + 🔍对比分析 + 跳过直接看答案）；
  结果渲染覆盖度进度条/遗漏/纠错/建议；💾存为批注走现有批注接口（整卡批注）；
  显示答案后给建议评分按钮加 ring 并标注「仅建议，评分仍由你决定」；翻页清空复述。
- 自测：**后端 18/18**（含 ```json 围栏与散文包裹 JSON 的正则兜底、500/非 JSON→502）+
  **前端 jsdom 29/29**（AI 关闭时面板仍在但无对比分析、存为批注内容正确、
  ring 高亮、连续 2 次失败熔断后复述框与跳过按钮仍可用）。已推送 GitHub（524aa42）。
- 注：Flask 无热重载，改路由后必须重启进程才能测到新端点（本次已踩到并修正）。

---

## 4. 错题 + 错因标签

### 目标
卡片分两类：`note`（现状）/ `quiz`（题目）。quiz 卡带标准解答与评分点(rubric)；
复习时自评得分点勾选 + 错因标签，错因随复习历史留存。**本期不做 AI 批改**。

### 涉及文件
| 文件 | 改动 |
|---|---|
| `app/db.py` | `init_db()` 里做幂等加列（见下） |
| `app/routes/records.py` | `_row_to_dict` 解析新 JSON 列；create/update 支持新字段；列表接口支持 `kind` 筛选 |
| `app/routes/review.py` | answer 支持 `mistake_tags` 与 `missed_points` 随评分写入 |
| `static/js/records.js` | 编辑器加「笔记/题目」切换 + 解答、rubric 编辑 |
| `static/js/review.js` | quiz 卡复习流程（题目→作答→答案+rubric→勾选→评分） |

### 数据模型（幂等加列）
`init_db()` 建表后追加：
```python
def _ensure_columns(conn, table, col_defs: dict):
    """col_defs: {列名: "TEXT NOT NULL DEFAULT ''"} 逐列检查, 缺则 ALTER TABLE ADD COLUMN"""
    existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, ddl in col_defs.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
```
study_record 追加：
| 列 | 类型 | 说明 |
|---|---|---|
| `kind` | `TEXT NOT NULL DEFAULT 'note'` | `note` / `quiz` |
| `solution_md` | `TEXT NOT NULL DEFAULT ''` | 标准解答（Markdown+公式） |
| `rubric` | `TEXT NOT NULL DEFAULT ''` | JSON 数组 `[{"score":3,"point":"正确列出方程"},...]` |
| `mistake_tags` | `TEXT NOT NULL DEFAULT '[]'` | 最近一次错因 JSON 数组 |

review_log 追加：
| 列 | 类型 | 说明 |
|---|---|---|
| `missed_points` | `TEXT NOT NULL DEFAULT ''` | JSON 数组，未拿到的得分点下标 `[0,2]` |
| `mistake_tags` | `TEXT NOT NULL DEFAULT '[]'` | 本次错因 |

错因固定枚举（前端写死，做成多选 chips）：
`concept`=概念不清 / `calc`=计算失误 / `step`=步骤遗漏 / `read`=审题偏差 / `memory`=记错结论 / `careless`=粗心

### rubric 存储格式（降低实现复杂度，编辑时用行文本）
编辑器里 rubric 用多行文本编辑，一行一个得分点，`|` 前是分值：
```
3|正确列出方程并列出所有受力
1|符号方向约定一致
2|最终数值与单位正确
```
保存时前端解析为 JSON `[{"score":3,"point":"..."}]` 存库；回显时反向拼回行文本。

### 实施步骤
1. db.py 加 `_ensure_columns` 并在 `init_db()` 末尾调用（study_record 4 列、review_log 2 列）。
   旧库自动升级，新库直接含列。
2. records.py：
   - `_row_to_dict` 把 `rubric/mistake_tags` JSON 解析为数组（失败回退 `[]`）；
   - `POST /` 与 `PUT /<rid>` 接受 `kind/solution_md/rubric/mistake_tags`；
   - `GET /` 支持 `?kind=quiz` 筛选。
3. review.py `answer()`：body 追加可选 `missed_points`、`mistake_tags`，
   写入 review_log 新列；同时把 `mistake_tags` 更新到卡上。
4. records.js 编辑器：类型切换（radio 笔记/题目）；选"题目"时显示
   解答 textarea（复用 `buildMarkdownEditor('sol')`）+ rubric 行文本框；
   列表卡片与详情页显示「题目」徽标 + 错因标签。
5. review.js 复习 quiz 卡（`card.kind === 'quiz'`）：
   - 显示答案前：textarea「写下你的解答/思路」（与费曼复述共用交互模式，但不接 AI）；
   - 显示答案后：答案正文 + `solution_md` + rubric 逐条 checkbox（默认全勾=拿到分）；
   - 未全勾时展示错因 chips（必选至少 1 个才能评分）；
   - 评分时把 `{rating, missed_points, mistake_tags}` 提交。
6. 统计（可选，放最后）：stats.py 加 `GET /api/stats/mistakes` 返回错因计数，stats.js 画简单条形。

### 验收清单
- [x] 旧库启动后自动出现新列，旧数据卡 `kind` 均为 `note`，复习/编辑无回归。
- [x] 新建题目卡：切类型 → 出现解答与 rubric 输入；rubric 行文本能存能回显。
- [x] 复习 quiz 卡：勾选得分点 + 选错因 → 评分成功，`GET /api/review/logs` 能看到
      `missed_points`/`mistake_tags`。
- [x] `GET /api/records?kind=quiz` 只返回题目卡。
- [x] note 卡复习流程与改造前完全一致（回归）。

### 禁区
- ❌ 本期禁止接 AI 批改（先积累真实错题数据）。
- ❌ 禁止为错题另建调度逻辑——错题走同一套 FSRS 评分。
- ❌ 禁止修改 `fsrs.py`。

### 进度（已实现并自测 50 项通过）
- `db.py` 新增 `_ensure_columns()` + `EXTRA_COLUMNS`，`init_db()` 末尾调用：
  study_record 加 `kind`/`solution_md`/`rubric`/`mistake_tags`，review_log 加
  `missed_points`/`mistake_tags`。**实测旧库启动后自动加列成功**，旧数据 `kind` 均为 `note`。
- `records.py`：`_row_to_dict` 解析 rubric/mistake_tags；create/update 接受新字段
  （新增 `_dump_json_field` 统一序列化）；列表支持 `?kind=` 筛选。
- `review.py`：`answer()` 接受可选 `missed_points`/`mistake_tags`，写入 review_log 新列并
  把错因同步到卡片；`logs` 端点把新列解析为数组（与 records 返回保持一致）。
- 前端：`utils.js` 加 `MISTAKE_TAGS` 枚举与 `parseRubricText`/`rubricToText`；
  编辑器加「笔记/题目」切换 + 标准解答（复用 `buildMarkdownEditor('sol')`）+ rubric 行文本框；
  列表/详情显示「题目」徽标；复习页题目卡渲染标准解答 + 得分点勾选 + 错因 chips
  （未拿满分时**必须选至少 1 个错因**才能评分）。
- 自测：**后端 21/21**（旧库升级、建/改题目卡、kind 筛选、评分写入日志与同步卡片、
  note 卡回归）+ **前端 jsdom 29/29**（rubric 解析、得分点默认全勾、取消勾选出错因、
  未选错因拦截评分、提交 payload 正确、note 卡无回归）。已推送 GitHub（524aa42）。

---

## 5. 思源快速捕捉插件 (quick-capture)

### 目标
思源笔记中选中文字 → 右键「发送到记忆锚」→ 自动建卡（含来源回链与默认标签）。
**单向推送**：只写记忆锚，不写思源；无同步、无冲突。

### 已定设计决策
| 决策点 | 结论 |
|---|---|
| 卡片粒度 | 选中什么发什么；标题自动生成 |
| 标题 | 默认取选中内容首行截断；仅当 AI 处于"可用"态时可选调事项 2 的 AI 标题，失败回退首行截断（遵守 AI 三态开关） |
| 来源回链 | 正文尾加 `> 来源：[文档名](siyuan://blocks/块ID)`，可开关 |
| 去重 | 初版不做，靠返回卡号提示 |
| 图片 | 初版不支持，选中含图时提示"图片未同步" |
| 标签 | 插件设置里配默认标签，如 `["思源"]` |
| 方言清洗 | **在记忆锚端做**（markdown_fix），插件保持薄——任何来源都享受清洗 |

### A. 记忆锚侧
| 文件 | 改动 |
|---|---|
| `app/routes/records.py` | 新端点 `POST /api/records/quick-capture` |
| `app/markdown_fix.py` | 新函数 `clean_siyuan_dialect(text) -> str` |
| `app/main.py` | 全局 CORS（内网）：`after_request` 加
`Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers: Content-Type`，
并对 `OPTIONS` 返回 200 |
| `README.md` | 内网使用说明 |

接口定义：
```
POST /api/records/quick-capture
Body: {"content_md": "...", "title": "", "tags": ["思源"],
       "source": {"doc_name": "笔记标题", "block_id": "2024...", "url": "siyuan://blocks/2024..."}}
逻辑: 1) content_md 先过 clean_siyuan_dialect()
      2) title 为空 → 取正文首个非空行截断 60 字符；仍为空 → "思源快捕 YYYY-MM-DD HH:MM"
      3) source 存在且 url 非空 → 正文尾追加 "\n\n> 来源：[{doc_name}]({url})"
      4) 调用现有建卡逻辑（POST / 的内部实现；title 必填约束已在第 2 步保证）
Resp: {"id": 42, "title": "..."}     # 400: content_md 为空
```

`clean_siyuan_dialect` 要处理的思源 kramdown 方言（按序执行，均只作用于**非代码块**区间，
复用 markdown_fix 已有的"跳过代码块"机制）：
1. IAL 属性：删除形如 `{: ... }` 的整段（正则 `\s*\{:.*?\}\s*$` 行尾优先）；
2. 块引/双链：`((20240301120000-abcdefg "显示文本"))` → `显示文本`；
   链接形式 `[text](siyuan://blocks/xxx)` → `text`；
3. 思源标签 `#标签#` → `#标签`（去尾部 #，保留为普通 Markdown 标签语义）；
4. 嵌入块 `{{...}}` → 删除整行。

### B. 插件侧（思源）
参考官方模板 `siyuan-note/siyuan-plugin-sample-vite`（TypeScript，构建为 iife，
放入 `工作空间/data/plugins/<plugin-name>/`，或上架集市）。

核心实现点：
- **挂点**：`onload` 里 `this.eventBus.on("open-menu-content", ...)`——给编辑器右键菜单加
  「发送到记忆锚」项；
- **取内容**：菜单回调参数含 `protyle` 与 block id；优先用 `window.getSelection().toString()`
  截取选中片段，为空则整块；再 `fetchSyncPost("/api/block/getBlockKramdown", {id: blockId})`
  获取块源码（fetchSyncPost 会自动带 token）；
- **组装**：`{content_md, title: "", tags: 设置的默认标签,
  source: {doc_name: protyle 引擎的文档名, block_id: id, url: "siyuan://blocks/"+id}}`；
  `fetch("http://127.0.0.1:7788/api/records/quick-capture", {method:"POST",
  headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)})`；
- **反馈**：成功 `showMessage("已发送到记忆锚：卡片 #" + id)`；失败 showMessage 报错；
- **设置面板**：用 `setting-utils`（模板自带）：目标 URL / 默认标签（逗号分隔）/ 附来源回链(开关)；
- **图片提示**：content 含 `![](` 时 showMessage 警告"包含图片，仅文字已同步"（仍发送）。

### 实施步骤
1. 先做记忆锚侧端点 + 清洗函数 + CORS（含验收）。
2. 再写插件：`npm create` 模板 → 右键菜单 → fetch 发送 → 设置面板。
3. 联调：思源里建一个含块引/IAL/标签/公式的测试块，发送后检查记忆锚里卡片的清洗效果。

### 验收清单
- [x] `curl -X POST .../quick-capture -H 'Content-Type: application/json' -d '{"content_md":"测试"}'`
      返回 `{"id":..,"title":"测试"}`，记录列表可见。
- [x] 含 `((20240301120000-abc "双链文本"))`、行尾 `{: id="..." :}`、`#标签#` 的内容发送后，
      卡片正文无 ID 残留、无 IAL、标签保留。
- [ ] 思源里选中两行文字 → 右键发送 → toast 显示卡号；记忆锚中卡片正文为所选两行 +
      来源回链行；点击回链可跳回思源对应块。
- [ ] 插件设置修改目标地址与默认标签后生效。
- [x] 思源页面（origin :6806）发请求不被 CORS 拦截。

### 禁区
- ❌ 插件禁止向思源写入任何数据（不加块属性、不改块内容）。
- ❌ 清洗逻辑禁止写在插件里——统一放 `markdown_fix.py`。
- ❌ 禁止在发送流程里弹系统对话框打断用户（反馈只用思源 showMessage）。

### 进度（记忆锚侧已实现并自测 20/20；插件侧已提供源码，待你在思源中实测）
- **A. 记忆锚侧**：
  - `app/markdown_fix.py` 新增 `clean_siyuan_dialect()`：按序处理嵌入块(整行删) →
    IAL 属性 → 块引/双链(保留显示文本) → 思源标签 `#标签#→#标签`；
    **复用已有 `_protect_code`，代码块内不被清洗**。
  - `app/routes/records.py` 新增 `POST /api/records/quick-capture`：清洗 → 标题缺省取
    正文首个非空行(去 `#`) → 兜底「思源快捕 时间」→ 追加 `> 来源：[文档名](siyuan://blocks/ID)`
    → 建卡。为复用建卡逻辑，把 INSERT 抽成 `_create_row()`，`POST /api/records` 与
    quick-capture **共用同一套**（避免两处漂移）。
  - `app/main.py` 加全局 CORS（`Access-Control-Allow-Origin: *` + 统一 OPTIONS 204）。
  - 自测 20/20：方言清洗 7 项（含代码块豁免）+ 建卡正文清洗/标题/标签/来源回链 +
    空内容 400 + OPTIONS 预检与 CORS 头。
- **B. 插件侧**：新建 `siyuan-plugin-mem/`（plugin.json / package.json / tsconfig /
  vite.config / src/index.ts / src/api.ts / README）。
  挂点 `open-menu-content` 加「📌 发送到记忆锚」；选区为空则取整块 kramdown；
  设置面板用内置 Dialog（不引第三方 setting-utils）；反馈只用 `showMessage`；
  **不写思源任何数据**。
- 待你验证：插件需在思源里 `npm install && npm run build` 后放入
  `工作空间/data/plugins/siyuan-plugin-mem/` 加载实测（沙箱无思源环境，无法自动验证）。
  记忆锚侧接口已可先用 curl 验证（见 README）。已推送 GitHub（524aa42）。

---

## 6. 第二轮迭代：速记 / 标签筛选 / 题目卡预览 / 复述对比

> 1-5 全部完成后，按使用反馈追加的一轮改动。**状态：✅ 已实现并自测（后端 58 + MCP 39 + 前端 53 = 150 项），
> 已推送 GitHub（524aa42），远端 46 文件与本地逐文件一致。**

| # | 改动 | 一句话 |
|---|------|--------|
| 6.1 | 答案面显示自己的复述 | 翻答案后顶部并排显示「🗣 我的复述」+ 覆盖度/遗漏/纠错，逐条对照 |
| 6.2 | 速记模块 | 与批注并列的附属模块，记记忆小技巧；输入复用格式化输入；可选 AI 生成 |
| 6.3 | 题目卡预览显示题干 | 复习正面渲染题干（否则没法做题）；列表摘要在题干为空时回退显示解答 |
| 6.4 | 主页按标签筛选 | 标签下拉（带计数）+ 卡片标签徽章点击即筛选 |
| 6.5 | MCP / 思源快捕同步 | 工具 8 → 12；快捕支持题目卡；插件支持默认类型与「作为题目发送」 |
| 6.6 | AI 连接失败诊断 | 失败时给出具体原因与改法（DNS/拒绝/超时/TLS/401/403/404/429/5xx/非 JSON），不再只显示「连接失败」 |
| 6.7 | 非常规网关兜底 | 超时可在设置页调（默认 25s）；网关把 `system` 当问题问时自动合并角色重试；不支持 `response_format` 时自动去掉重试 |

### 6.1 答案面显示复述
- 点「跳过，直接看答案」/ 按 Space 前先把复述框内容收进 `state.feynman.text`（点卡片空白处也不会丢）。
- 答案面顶部渲染「🗣 我的复述」（`renderMarkdown`，公式照常渲染），没写则提示"本次没有写复述"。
- 若跑过对比分析，复述块底部附上覆盖度条 + 遗漏要点 + 纠错；评分按钮区的「建议评分」提示保持不变。

### 6.2 速记（mnemonic）
- **数据**：新表 `mnemonic(id, record_id, content_md, source, created_at, updated_at)`，
  外键级联删除；`SCHEMA_SQL` 里 `CREATE TABLE IF NOT EXISTS`，旧库启动自动建表（已验证）。
- **API**：`GET/POST /api/records/<rid>/mnemonics`、`PUT/DELETE .../mnemonics/<mid>`、
  `POST /api/ai/mnemonic`（`{record_id}`，原文服务端取，不信任前端）；列表接口补 `mnemonic_count`。
- **提示词**（`app/ai.py` 的 `MNEMONIC_SYSTEM`，重点）：
  1. 角色=记忆技巧设计师，只做"记忆钩子"，**明令禁止复述/翻译/概括原文、禁止补充原文没有的新知识**
     （否则模型会输出一篇知识点总结，与正文重复，没人看）；
  2. 给出手法清单：口诀/谐音/首字母、类比（必须以"类比："开头，明示不是事实）、图像化、对比反例；
  3. **公式必须原样保留**（`$...$`）——学习卡大量含 LaTeX，被"改写"就是错的；
  4. 规定输出格式 `- **钩子类型**：要点 → 技巧`、每条 ≤40 字、全文 ≤200 字，可直接当速记用。
- **AI 行为**：生成结果只填进输入框，**不自动落库**；保存时按来源标 `source=ai`。
  未配置 → 503；失败 2 次 → 熔断，✨ 入口消失，手写路径完全不受影响。
- **前端**：`static/js/mnemonics.js`（抽屉 + 列表 + 全局委托），输入复用
  `buildMarkdownEditor('mn')`（粘贴自动修正 / 修正格式 / 预览 / 高级格式选项）。
  展示位置：记录详情页「💡 速记 (N)」、复习页正面与答案面、列表卡片 `💡 N` 角标。

### 6.3 题目卡预览
- 复习正面：`kind==='quiz' && content_md` 时渲染题干（带「题目」小标），note 卡仍隐藏正文保证回忆。
  题干复用 `id="reviewMdBody"`，因此批注高亮与右键菜单在正面同样可用。
- 列表卡片摘要：题干为空时回退成「解答：…」（`RecordsTab.previewText`）。
- 记录详情补上题目卡的「标准解答 / 评分点 / 最近错因」（原来详情只显示题干，解答要等复习翻面才看得到）。

### 6.4 主页标签筛选
- 后端新增 `GET /api/records/tags` → `[{tag, count}]`（计数降序）；`GET /api/records?tag=` 原本就支持。
- 前端：记录页加标签下拉（异步加载、带计数），卡片标签徽章改成可点按钮（`data-tag-filter`），
  点击即筛选且不会误触打开详情；「重置」清空全部筛选。

### 6.5 MCP 与思源快捕
- MCP 工具 8 → 12：新增 `list_tags` / `quick_capture` / `add_mnemonic` / `list_mnemonics`；
  `create_card` 支持 `kind/solution_md/rubric`（题目卡）；`search_cards` 支持 `kind`。
  禁区不变：`submit_rating` 仍在工具层校验 rating，docstring 保留"禁止自动评分"。
- `POST /api/records/quick-capture` 支持 `kind/solution_md/rubric`，返回 `{id, title, kind}`。
- 思源插件：设置加「默认类型（笔记/题目）」，右键菜单给出两项（默认项 + 相反的"作为题目/笔记发送"），
  提示语在题目卡时提醒去补标准解答；`npm run build` 与 `tsc --noEmit` 均通过。

### 6.6 AI 连接失败诊断
- 背景：配置好了却连不上时，界面只显示"已配置但连接失败"，后端只有 requests 原始异常串
  （`HTTPSConnectionPool...Max retries exceeded`），没有任何可照着改的信息。
- 后端 `app/ai.py`：
  - `normalize_base_url()`：去掉误填的 `/chat/completions` 尾巴、缺协议头时按"本机/内网 → http，
    公网 → https"自动补；保存设置时也走同一套规范化。
  - `_classify_exception()`：沿 `__cause__` 链把异常归类为 dns / refused / timeout / tls / proxy，
    每类配一句人话原因 + 一条"怎么办"。
  - `_http_diagnose()`：按状态码给原因与建议，并从 OpenAI 风格错误体里抽出 `error.message`。
  - `AIError` 带 `detail`（url / model / 掩码 key / status / elapsed_ms / 服务端原文 / 建议），
    一路透到前端；同时 `logger.warning` 落服务端日志。
  - `_resp_text()`：强制按 UTF-8 取响应体，避免 requests 对 `text/*` 退 ISO-8859-1 导致中文报错乱码。
  - `_safe_body()` 打码响应里的 `sk-***`；`_mask_key()` 只回显首尾各 3 位。
  - 连通测试 `TIMEOUT_PING` 5s → 8s（中转/海外首包常 3~5s，5s 太紧）。
  - **SSE 流式兼容**（实战踩到）：某些网关无视 `stream=false`，一律返回 `text/event-stream`
    （`data: {"object":"chat.completion.chunk",...}` 一行一个 chunk），原本直接报
    “响应不是 OpenAI 兼容格式”。现在请求显式带 `stream: false`，同时 `_looks_like_sse()` +
    `_parse_sse()` 负责识别并按 `delta.content` 聚合；聚合为空时给出专门的错误与建议。
- 路由：`GET /api/ai/status?ping=1` 返回 `detail`；新增 `POST /api/ai/test`，可带
  `base_url/api_key/model` 覆盖值**不落库**（改了 URL 不用先保存就能试）。
  生成类接口（标题/复述对比/速记）的 502 也带 `detail`。
- 前端：`refreshAiState` 保留 `message/detail`（原来直接丢弃）；新增 `testAiConnection()` 与
  `renderAiDiagnostics()`，设置页展开诊断面板（请求地址/模型/耗时/状态/服务端原文/建议，可一键复制）；
  `api()` 抛错保留 `err.data`，`aiFailureMessage()` 优先显示后端给的具体原因；
  熔断提示改成"去设置页「测试连接」看具体原因"。

### 6.7 非常规网关兜底（超时 / 角色 / response_format）
- 起因：用真实中转网关实测，连通测试 8.5s 就成功了，但生成标题却连着 3 次失败——
  (a) `TIMEOUT_API=10` 卡死在 10s，网关单次普遍 8~12s；
  (b) 该网关把 `system` 当成“用户问的问题”，模型不答题，反而回
  "（原回答已生成完毕，请提供需要格式化的原始回复文本）"。
- 后端 `app/ai.py`：
  - `TIMEOUT_API` / `TIMEOUT_PING` 10 → 25；新增设置项 **`ai_timeout`**（夹在 5~120），
    标题/复述对比/速记一律走 `_timeout()`，不再硬编码 `TIMEOUT_API`。
  - `_looks_like_meta_reply()` + `_merge_messages()`：拿到“元回答”时把 system 折进
    单条 user（`---` 分隔）再请求一次；第二次仍空则保留首次结果，不吞掉内容。
  - `response_format=json_object` 报 400 时自动去掉该字段重试一次（部分网关不支持）。
  - `chat()` 拆成编排层，`_request_once()` 只负责单次请求，重试逻辑集中、可读。
  - `_tidy_title()`：网关把 system 当提问时模型常无视"10~20 个字"，回一整段说明
    （"拉格朗日中值定理是微积分中的基本定理之一，它建立了……"）。现在去掉加粗/引号、
    断在第一个谓语或句读处，得到"拉格朗日中值定理"这种干净短标题，而不是硬截在半句话上。
- 设置页：新增“超时(秒)”输入框（默认 25），随其它 AI 设置一起保存。

### 自测结果（本轮 145 项）
| 套件 | 项数 | 覆盖 |
|---|---|---|
| 后端 API | 58 | 速记 CRUD/级联删除/空值与 404、标签聚合与筛选、列表 `mnemonic_count`、AI 速记（503/200/围栏/500/非 JSON/6s 超时）、题目卡快捕+方言清洗+回链、旧库自动建表 |
| MCP | 39 | 12 工具注册（含真实 stdio 会话）、题目卡建卡、kind 搜索、速记增删查、快捕两种类型、非法评分被拒 |
| 前端 jsdom | 53 | 复述显示在答案面且位于标准内容之上、未写复述提示、gap 摘要、题目卡正面题干与详情解答/评分点/错因、速记渲染/AI 三态/熔断/保存 source、标签下拉与徽章筛选、💡 角标与摘要回退 |
| 回归 | 110 | 批注 14 / 待复习列表 38 / 费曼 29 / 错题 29 全绿 |
| SSE 流式兼容（后端） | 13 | 强制 SSE 的服务连通测试通过、标题/速记/复述对比在流式下均正常、流式无内容时报错点明流式 |
| 网关回退（后端） | 11 | 元回答自动合角色重试、连通测试不受元回答干扰、第二次仍元回答则保留首次结果、`response_format` 400 自动去掉重试、超时设置夹在 5~120 且生效 |
| 标题清洗（单元） | 10 | 加粗/引号/代码标记/markdown 标题符剥离、"标题：" 前缀、括号或冒号前取正题、按谓语断句（是/指的是/把/将…）、按句读断句、无句读不误切、上限 60 字不越界 |
| AI 诊断（后端） | 49 | 未配置说清缺哪几项、正常连通、401/403/404/429/500、返回 HTML、DNS、端口拒绝、6s 超时、20s 慢响应在默认 25s 内成功、base_url 两纠错形态、test 不落库、502 带 detail、保存规范化、不泄露 key |
| AI 诊断（前端） | 22 | message/detail 被保留、诊断面板字段齐全、成功时隐藏、用未保存值测试、toast 取后端原因、连续 2 次熔断提示、err.data.detail 可用 |

---

## 附：现有 API 速查（实现时直接引用，勿凭记忆编造）

```
GET  /api/records?search&tag&state&kind&limit           列表(默认按 pinned,due,created 排序; 含 mnemonic_count)
GET  /api/records/tags                                  [{tag, count}] 全部标签与计数
GET  /api/records/<id>                                  详情(含 review_logs, annotations, mnemonics)
POST /api/records                                       建卡 {title 必填, content_md, tags, note, learn_date, priority, pinned}
PUT  /api/records/<id>                                  更新
DELETE /api/records/<id>                                删除
POST /api/records/import_md                             {text, fix, options} 按 '# ' 一级标题分卡
POST /api/records/format                                {text, options} 格式修正
POST /api/records/quick-capture                         {content_md, title?, tags?, source?, kind?, solution_md?, rubric?} 思源快捕建卡
POST /api/records/<rid>/annotations                     {quote 可空, note_md} 两者不可同时为空
GET/POST    /api/records/<rid>/mnemonics                 速记列表 / 新增 {content_md, source?}
PUT/DELETE  /api/records/<rid>/mnemonics/<mid>           改 / 删速记
GET  /api/review/queue?limit&include_new&due_only       {items, stats{queue_size,total_new,total_due,reviewed_today}}
POST /api/ai/title                                      {content_md} -> {title}        未配置 503
POST /api/ai/gap                                        {record_id, user_summary} -> 覆盖度/遗漏/纠错
POST /api/ai/mnemonic                                   {record_id} -> {content_md}    未配置 503
POST /api/review/<id>/answer                            {rating: "again"|"hard"|"easy", missed_points?, mistake_tags?}
GET  /api/review/preview/<id>                           三档评分的间隔预览
GET  /api/review/logs?limit&days                        复习历史
GET  /api/stats/overview|heatmap|retention_trend|weekly|tags
GET/PUT /api/settings                                   PUT 有白名单: theme, request_retention, fsrs_weights, shortcut_*,
                                                        auto_backup, backup_interval_days, daily_target_new/review, quiet_hours_*
                                                        (事项2需追加 ai_base_url/ai_api_key/ai_model)
```

前端全局工具（static/js/utils.js）：`api(path, options)`、`toast(msg, type)`、
`stateBadge(state)`、`dueLabel(ts)`、`escapeHtml(s)`、`debounce(fn, wait)`、
`renderMarkdown(text)`、`openDrawer(title, html, {width})` / `closeDrawer()`、
`buildMarkdownEditor(prefix)`（markdown_editor.js）。

---

## 暂缓区

| 事项 | 暂缓原因 | 启用条件 |
|------|---------|---------|
| 安全措施（写入接口 Token、CORS 白名单、公网只读） | **部署定位为内网，暂不公开**（已确认） | 一旦公网暴露立即启用：`quick-capture` 与所有写接口加 Authorization 校验；CORS 仅放行 localhost |
| AI 批改（错题） | 需先用真实错题积累数据、验证 rubric 质量 | 事项 4 跑通且积累 ≥50 道真实错题后评估 |
| 思源深度集成（双向同步、FSRS 状态写入块属性） | 耦合成本高，属性写入会污染块 updated 时间 | 单向快捕不够用、且思源确认为主力笔记时再评估 |
| 导出批注/复盘到思源 | 依赖单项 3、5 落地后的实际需求 | — |
