"""记忆锚 MCP Server (stdio)

为 agent 提供操作记忆锚的工具集。所有操作经 HTTP 转调 Flask API,
不直连数据库, 保证 FSRS 排程逻辑单一入口。

运行:
    python3 mcp_server/server.py
或作为模块:
    python3 -m mcp_server.server

配置:
    MEM_BASE_URL  目标记忆锚地址 (默认 http://127.0.0.1:7788)
    MEM_TIMEOUT   请求超时秒 (默认 30)
"""
import json

try:
    from .client import MemClient
except ImportError:  # 允许 `python3 mcp_server/server.py` 直接运行
    from client import MemClient

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("memory-anchor")


def _client() -> MemClient:
    return MemClient()


def _summarize(c: dict) -> dict:
    """卡片摘要: 只带 id/title/state/due/tags, 不给 LLM 喂全文。get_card 除外。"""
    return {
        "id": c.get("id"),
        "title": c.get("title"),
        "state": c.get("state"),
        "due": c.get("due"),
        "tags": c.get("tags"),
    }


@mcp.tool()
def list_due_cards(limit: int = 20, include_new: bool = True) -> str:
    """列出今日待复习卡片(含新卡与到期卡)。返回 {items, stats}: items 仅含 id/title/state/due/tags 摘要, 不含全文。"""
    data = _client().list_due_cards(limit=limit, include_new=include_new)
    items = [_summarize(c) for c in (data.get("items") or [])]
    return json.dumps({"items": items, "stats": data.get("stats", {})},
                      ensure_ascii=False)


@mcp.tool()
def search_cards(keyword: str = "", tag: str = "", state: str = "",
                 kind: str = "", limit: int = 20) -> str:
    """按关键词/标签/状态/类型搜索卡片。返回 {items, total}: items 为摘要列表(不含全文)。
    state 可选: new/learning/review/relearning; kind 可选: note(笔记) / quiz(题目卡)。"""
    data = _client().search_cards(keyword=keyword, tag=tag, state=state,
                                  kind=kind, limit=limit)
    items = [_summarize(c) for c in (data.get("items") or [])]
    return json.dumps({"items": items, "total": data.get("total", len(items))},
                      ensure_ascii=False)


@mcp.tool()
def list_tags() -> str:
    """列出全部标签及各自的卡片数(按卡片数降序)。先用它了解知识结构, 再用 search_cards 的 tag 精确筛选。"""
    data = _client().list_tags()
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def get_card(record_id: int) -> str:
    """获取单张卡片完整内容(含 review_logs 与 annotations)。record_id 来自列表工具的 id 字段。"""
    data = _client().get_card(record_id)
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def create_card(title: str, content_md: str = "", tags: list = None,
                kind: str = "note", solution_md: str = "",
                rubric: list = None) -> str:
    """新建一张学习卡片。title 必填; content_md 为 Markdown+公式正文; tags 为标签字符串数组。

    kind="quiz" 时按题目卡建: content_md 为题干, solution_md 为标准解答,
    rubric 为评分点数组 [{"score":3,"point":"列出方程"}, ...]。返回新建卡片摘要。"""
    if not title or not title.strip():
        return json.dumps({"error": "title required"}, ensure_ascii=False)
    if kind not in ("note", "quiz"):
        return json.dumps({"error": "kind must be note|quiz"}, ensure_ascii=False)
    data = _client().create_card(title=title.strip(),
                                 content_md=content_md or "",
                                 tags=tags or [], kind=kind,
                                 solution_md=solution_md or "",
                                 rubric=rubric)
    return json.dumps(_summarize(data), ensure_ascii=False)


@mcp.tool()
def import_markdown(text: str, fix: bool = True) -> str:
    """从 Markdown 批量建卡: 按一级标题 `# ` 分卡(只有一段则作为单卡)。fix=true 会先做粘贴格式修正。返回 {imported, ids}。"""
    data = _client().import_markdown(text=text, fix=fix)
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def add_annotation(record_id: int, quote: str = "", note_md: str = "") -> str:
    """给卡片加批注(附属笔记, 不单独复习)。quote 为被批注原文片段(可空=整卡批注); note_md 为笔记(Markdown+公式)。两者不可同时为空。"""
    if not quote and not note_md:
        return json.dumps({"error": "quote or note_md required"}, ensure_ascii=False)
    data = _client().add_annotation(record_id=record_id, quote=quote, note_md=note_md)
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def quick_capture(content_md: str, title: str = "", tags: list = None,
                  kind: str = "note", solution_md: str = "", rubric: list = None,
                  doc_name: str = "", url: str = "") -> str:
    """思源快捕同一入口: 直接把一段文字建成卡片(会清洗思源块引/IAL/标签方言)。

    tags 默认建议 ["思源"]; doc_name + url 会追加一行来源回链 (url 形如 siyuan://blocks/xxx)。
    kind="quiz" 时按题目卡建(题干=content_md, 解答=solution_md)。返回 {id, title, kind}。"""
    if not content_md or not content_md.strip():
        return json.dumps({"error": "content_md required"}, ensure_ascii=False)
    source = None
    if url:
        source = {"doc_name": doc_name or "思源", "url": url}
    data = _client().quick_capture(content_md=content_md, title=title or "",
                                   tags=tags or [], source=source,
                                   kind=kind or "note",
                                   solution_md=solution_md or "",
                                   rubric=rubric)
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def add_mnemonic(record_id: int, content_md: str, source: str = "user") -> str:
    """给卡片加一条速记: 方便记忆的小技巧(口诀/谐音/类比/画面/反例), 不是知识点复述。

    content_md 建议 1-3 条、每条一行; source 填 "ai" 表示内容由 AI 生成(仅作标记)。"""
    if not content_md or not content_md.strip():
        return json.dumps({"error": "content_md required"}, ensure_ascii=False)
    if source not in ("user", "ai"):
        source = "user"
    data = _client().add_mnemonic(record_id=record_id,
                                  content_md=content_md.strip(), source=source)
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def list_mnemonics(record_id: int) -> str:
    """列出某张卡片上的全部速记(含正文), 复习前可作为回忆线索。"""
    data = _client().list_mnemonics(record_id)
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def submit_rating(record_id: int, rating: str) -> str:
    """对一张卡评分并推进 FSRS 排程。rating 必须是 "again" | "hard" | "easy" 之一。

    ⚠️ 仅在用户【明确说出】评分时才调用, 禁止自动评分、批量评分或替用户决定评分。
    评分是整个记忆系统的地基, 必须由人完成。"""
    if rating not in ("again", "hard", "easy"):
        return json.dumps({"error": "rating must be again|hard|easy"}, ensure_ascii=False)
    data = _client().submit_rating(record_id=record_id, rating=rating)
    return json.dumps(data, ensure_ascii=False)


@mcp.tool()
def stats_summary() -> str:
    """获取学习概览统计(总卡数/今日待复习/已学/掌握率等)。"""
    data = _client().stats_summary()
    return json.dumps(data, ensure_ascii=False)


if __name__ == "__main__":
    mcp.run()
