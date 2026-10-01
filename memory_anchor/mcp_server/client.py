"""记忆锚 HTTP 客户端

MCP server 不直连 SQLite, 所有操作转调 Flask HTTP API, 保证 FSRS 排程逻辑单一入口。
配置: 环境变量 MEM_BASE_URL (默认 http://127.0.0.1:7788), MEM_TIMEOUT (默认 30s)。
"""
import os
import requests

DEFAULT_BASE = os.environ.get("MEM_BASE_URL", "http://127.0.0.1:7788").rstrip("/")
DEFAULT_TIMEOUT = float(os.environ.get("MEM_TIMEOUT", "30"))


class MemClientError(Exception):
    """非 2xx 响应或网络异常时抛出, 携带状态码与响应体便于排查。"""

    def __init__(self, status: int, body):
        self.status = status
        self.body = body
        super().__init__(f"HTTP {status}: {body}")


class MemClient:
    def __init__(self, base_url: str = None, timeout: float = None):
        self.base_url = (base_url or DEFAULT_BASE).rstrip("/")
        self.timeout = timeout if timeout is not None else DEFAULT_TIMEOUT

    # ---------------- 底层请求 ----------------
    def _req(self, method: str, path: str, **kwargs):
        url = f"{self.base_url}{path}"
        try:
            resp = requests.request(method, url, timeout=self.timeout, **kwargs)
        except requests.RequestException as e:
            raise MemClientError(0, str(e))
        if not (200 <= resp.status_code < 300):
            raise MemClientError(resp.status_code, resp.text[:500])
        if resp.content:
            try:
                return resp.json()
            except ValueError:
                return resp.text
        return None

    def get(self, path: str, params=None):
        return self._req("GET", path, params=params)

    def post(self, path: str, json=None):
        return self._req("POST", path, json=json)

    # ---------------- 高层封装 (映射现有 API) ----------------
    def list_due_cards(self, limit: int = 20, include_new: bool = True) -> dict:
        return self.get("/api/review/queue",
                        params={"limit": limit, "include_new": str(include_new).lower()})

    def search_cards(self, keyword: str = "", tag: str = "", state: str = "",
                     kind: str = "", limit: int = 20) -> dict:
        params = {"search": keyword, "tag": tag, "state": state, "limit": limit}
        if kind:
            params["kind"] = kind          # note | quiz (题目卡)
        return self.get("/api/records", params=params)

    def list_tags(self) -> dict:
        """全部标签及卡片计数, 供主页标签筛选 / agent 了解知识结构。"""
        return self.get("/api/records/tags")

    def get_card(self, record_id: int) -> dict:
        return self.get(f"/api/records/{record_id}")

    def create_card(self, title: str, content_md: str = "", tags=None,
                    kind: str = "note", solution_md: str = "", rubric=None) -> dict:
        payload = {"title": title, "content_md": content_md or "",
                   "tags": tags or [], "kind": kind or "note"}
        if solution_md:
            payload["solution_md"] = solution_md
        if rubric:
            payload["rubric"] = rubric
        return self.post("/api/records", json=payload)

    def import_markdown(self, text: str, fix: bool = True) -> dict:
        return self.post("/api/records/import_md", json={"text": text, "fix": fix})

    def add_annotation(self, record_id: int, quote: str = "", note_md: str = "") -> dict:
        return self.post(f"/api/records/{record_id}/annotations",
                         json={"quote": quote, "note_md": note_md})

    def quick_capture(self, content_md: str, title: str = "", tags=None,
                      source: dict = None, kind: str = "note",
                      solution_md: str = "", rubric=None) -> dict:
        """思源快捕同一套入口: 清洗思源方言 -> 建卡 (可带来源回链 / 题目卡字段)。"""
        payload = {
            "content_md": content_md,
            "title": title or "",
            "tags": tags or [],
            "kind": kind or "note",
        }
        if source:
            payload["source"] = source      # {doc_name, block_id, url}
        if solution_md:
            payload["solution_md"] = solution_md
        if rubric:
            payload["rubric"] = rubric
        return self.post("/api/records/quick-capture", json=payload)

    def list_mnemonics(self, record_id: int) -> dict:
        return self.get(f"/api/records/{record_id}/mnemonics")

    def add_mnemonic(self, record_id: int, content_md: str,
                     source: str = "user") -> dict:
        """给卡片加一条速记 (助记小技巧)。source: user | ai"""
        return self.post(f"/api/records/{record_id}/mnemonics",
                         json={"content_md": content_md, "source": source})

    def submit_rating(self, record_id: int, rating: str) -> dict:
        # rating: "again" | "hard" | "easy"
        return self.post(f"/api/review/{record_id}/answer", json={"rating": rating})

    def stats_summary(self) -> dict:
        return self.get("/api/stats/overview")
