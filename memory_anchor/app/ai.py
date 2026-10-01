"""AI 可选增强: OpenAI 兼容 /chat/completions 调用封装

设计原则 (见 TODO.md「AI 三态开关与自动回退」):
- AI 是**可选**的: 未配置 -> is_configured() 为假, 各端点快速失败 503 ai_not_configured。
- 调用失败 -> 抛 AIError, 由路由层转成 502, 前端走熔断回退到零 AI 路径。
- 不引 SDK, 用 requests; **所有调用必须带 timeout** (禁止阻塞超过 15s)。
"""
import json
import re

import requests

from app.db import get_setting

TIMEOUT_API = 10      # 正常调用
TIMEOUT_PING = 5      # 连通测试
MAX_TITLE_LEN = 60
MAX_MNEMONIC_LEN = 800


class AIError(Exception):
    pass


def _cfg() -> dict:
    return {
        "base_url": str(get_setting("ai_base_url") or "").strip().rstrip("/"),
        "api_key": str(get_setting("ai_api_key") or "").strip(),
        "model": str(get_setting("ai_model") or "").strip(),
    }


def is_configured() -> bool:
    """三个配置键均非空才算已配置。"""
    c = _cfg()
    return bool(c["base_url"] and c["api_key"] and c["model"])


def chat(messages: list, max_tokens: int = 200, json_mode: bool = False,
         timeout: float = TIMEOUT_API) -> str:
    """调用 /chat/completions, 返回 assistant 的文本内容。失败抛 AIError。"""
    if not is_configured():
        raise AIError("AI 未配置，功能已关闭")
    c = _cfg()
    url = f"{c['base_url']}/chat/completions"
    headers = {
        "Authorization": f"Bearer {c['api_key']}",
        "Content-Type": "application/json",
    }
    body = {
        "model": c["model"],
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    try:
        resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    except requests.RequestException as e:
        raise AIError(f"AI 服务连接失败: {e}")
    if resp.status_code != 200:
        raise AIError(f"AI 服务返回 {resp.status_code}: {resp.text[:200]}")
    try:
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError) as e:
        raise AIError(f"AI 响应解析失败: {e}")


TITLE_SYSTEM = (
    "你是学习卡片的命名助手。根据卡片正文拟一个中文标题：\n"
    "- 10~20 个字，概括核心知识点，不加句号\n"
    '- 不要"关于""浅谈"等废话前缀\n'
    "- 只输出标题本身，不要任何解释或引号"
)


def generate_title(content_md: str) -> str:
    """根据正文生成标题。正文过长先截断到 2000 字符。"""
    text = (content_md or "").strip()
    if not text:
        raise AIError("正文为空")
    text = text[:2000]
    raw = chat(
        [
            {"role": "system", "content": TITLE_SYSTEM},
            {"role": "user", "content": text},
        ],
        max_tokens=50,
        timeout=TIMEOUT_API,
    )
    title = (raw or "").strip().strip('"').strip("'").strip("`").strip()
    title = re.sub(r"\s+", " ", title)
    if not title:
        raise AIError("AI 返回空标题")
    return title[:MAX_TITLE_LEN]


GAP_SYSTEM = (
    "你是费曼学习法的检查员。对比【标准内容】与【学生复述】，输出严格 JSON（不要多余文字）：\n"
    '{"coverage": 0-100整数,            // 复述覆盖标准内容要点的百分比\n'
    ' "missed": ["被遗漏的要点", ...],   // 最多5条\n'
    ' "wrong": [{"claim":"复述中错误的原句片段","correction":"正确说法"}, ...],  // 最多3条\n'
    ' "advice_rating": "again"|"hard"|"easy",   // 按覆盖度与错误数: <40或错误≥2→again; 40~75→hard; >75且无错误→easy\n'
    ' "comment": "一句话总评"}\n'
    "标准内容与复述都可能含公式，注意 $...$ 保持原样比较。"
)


def _parse_gap(raw: str) -> dict:
    """解析 gap 分析 JSON: 先直接解析, 失败则去代码围栏, 再用正则提取首个 JSON 块。"""
    text = (raw or "").strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    data = None
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                data = json.loads(m.group(0))
            except (ValueError, TypeError):
                data = None
    if not isinstance(data, dict):
        raise AIError("AI 返回内容无法解析为 JSON")

    def _int(v, default=0):
        try:
            return int(v)
        except (TypeError, ValueError):
            return default

    rating = data.get("advice_rating")
    if rating not in ("again", "hard", "easy"):
        rating = "hard"
    return {
        "coverage": max(0, min(100, _int(data.get("coverage"), 0))),
        "missed": [str(x) for x in (data.get("missed") or [])][:5],
        "wrong": [
            {"claim": str(w.get("claim", "")),
             "correction": str(w.get("correction", ""))}
            for w in (data.get("wrong") or []) if isinstance(w, dict)
        ][:3],
        "advice_rating": rating,
        "comment": str(data.get("comment", "")),
    }


def gap_analysis(standard_md: str, user_summary: str) -> dict:
    """费曼复述对比分析: 标准内容 vs 学生复述, 返回结构化 gap。"""
    std = (standard_md or "").strip()
    summ = (user_summary or "").strip()
    if not std:
        raise AIError("标准内容为空")
    if not summ:
        raise AIError("复述为空")
    std, summ = std[:3000], summ[:1000]
    raw = chat(
        [
            {"role": "system", "content": GAP_SYSTEM},
            {"role": "user",
             "content": f"【标准内容】\n{std}\n\n【学生复述】\n{summ}"},
        ],
        max_tokens=600, json_mode=True, timeout=TIMEOUT_API,
    )
    return _parse_gap(raw)


# ---- 速记 (mnemonic): 生成"方便记忆的小技巧" ----
# 提示词的编写要点:
#   1) 明确任务边界——只做"记忆钩子", 不做讲解/不复述原文/不补充新知识(类比需标注);
#      否则模型会输出一篇知识点总结, 与卡片正文重复, 反而没人看。
#   2) 给出可选手法清单(口诀/谐音/类比/图像化/对比反例), 约束输出风格一致;
#   3) 强约束公式原样保留: 学习卡片大量含 LaTeX, 一旦被模型"改写"就是错的;
#   4) 规定输出格式与字数上限, 保证直接能塞进卡片里当速记用。
MNEMONIC_SYSTEM = (
    "你是记忆技巧设计师，为一张学习卡片设计“记得住”的辅助线索。\n"
    "【做什么】\n"
    "1. 只挑卡片里真正难记、易混、易忘的点：术语、公式、符号、顺序、前提条件、例外。\n"
    "2. 给每个点配一个能立刻复用的记忆钩子，手法优先从下面选：\n"
    "   · 口诀 / 谐音 / 首字母：把要点压成一句顺口的话\n"
    "   · 类比：用生活经验或已知概念打比方（必须以“类比：”开头，明示它不是事实）\n"
    "   · 图像化：描述一帧能想象出来的画面\n"
    "   · 对比 / 反例：与易混淆概念对照，指出差别或给一个反例\n"
    "3. 公式、符号、变量名必须与原文完全一致，用 $...$ 原样保留"
    "（例如 $x_{n+1}=\\frac12(x_n+\\arctan x_n)$）。\n"
    "\n"
    "【禁止】\n"
    "· 不要复述、翻译或概括卡片原文（原文用户自己有）\n"
    "· 不要补充原文没有的新知识（类比除外，且必须标明是类比）\n"
    "· 不要开场白、总结语、客套话，不要用代码块\n"
    "\n"
    "【输出】严格输出 Markdown，2~3 条，每条一行，形如：\n"
    "- **口诀**：要记的点 → 顺口的一句话\n"
    "每条不超过 40 字，全文不超过 200 字。"
)


def generate_mnemonic(title: str, content_md: str) -> str:
    """根据卡片正文生成速记（助记技巧）。返回 Markdown 文本。"""
    std = (content_md or "").strip()
    if not std:
        raise AIError("卡片正文为空，无法生成速记")
    std = std[:3000]
    head = (title or "").strip()[:200]
    raw = chat(
        [
            {"role": "system", "content": MNEMONIC_SYSTEM},
            {"role": "user",
             "content": f"【卡片标题】\n{head}\n\n【卡片正文】\n{std}"},
        ],
        max_tokens=500,
        timeout=TIMEOUT_API,
    )
    text = (raw or "").strip()
    # 兜底清理: 去掉模型偶尔裹上的代码围栏
    text = re.sub(r"^```(?:markdown|md)?\s*", "", text).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    if not text:
        raise AIError("AI 返回空速记")
    return text[:MAX_MNEMONIC_LEN]


def ping() -> tuple:
    """连通测试: (ok: bool, message: str)。不抛异常。"""
    if not is_configured():
        return False, "未配置，AI 功能已关闭"
    try:
        chat([{"role": "user", "content": "hi"}], max_tokens=5,
             timeout=TIMEOUT_PING)
        return True, "已配置，连接正常"
    except AIError as e:
        return False, str(e)
