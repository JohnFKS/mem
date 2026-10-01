"""学习记录 CRUD + 图片上传 + Markdown 导入导出"""
import json
import time
import csv
import io
from pathlib import Path
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, current_app

from app.db import get_conn, UPLOAD_DIR, init_db
from app.utils import now_ts, today_iso, save_uploaded_image, parse_tags_str
from app.fsrs import fsrs
# 事项5: 思源方言清洗 (延迟导入避免与 markdown_fix 的循环依赖风险, 这里无循环故直接导入)
from app.markdown_fix import clean_siyuan_dialect

bp = Blueprint("records", __name__, url_prefix="/api/records")


def _row_to_dict(row) -> dict:
    """sqlite Row -> API dict"""
    if row is None:
        return None
    d = dict(row)
    try:
        d["tags"] = json.loads(d.get("tags") or "[]")
    except (ValueError, TypeError):
        d["tags"] = []
    try:
        d["image_paths"] = json.loads(d.get("image_paths") or "[]")
    except (ValueError, TypeError):
        d["image_paths"] = []
    # ---- 事项4 (错题): JSON 列解析为数组, 失败回退 [] ----
    for col in ("rubric", "mistake_tags"):
        try:
            d[col] = json.loads(d.get(col) or "[]")
        except (ValueError, TypeError):
            d[col] = []
    d["kind"] = d.get("kind") or "note"
    return d


def _dump_json_field(value, default="[]") -> str:
    """事项4: 把 list / dict / 已是 JSON 的字符串统一序列化为存库用的 JSON 字符串。"""
    if value is None:
        return default
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return default
        try:
            json.loads(s)      # 已是合法 JSON -> 原样存
            return s
        except (ValueError, TypeError):
            return default
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return default


def _annotation_to_dict(row) -> dict:
    """annotation Row -> API dict"""
    if row is None:
        return None
    d = dict(row)
    return d


def _get_mnemonics(conn, rid: int) -> list:
    """速记列表 (按创建时间正序, 便于阅读)"""
    rows = conn.execute(
        "SELECT * FROM mnemonic WHERE record_id = ? ORDER BY created_at ASC, id ASC",
        (rid,),
    ).fetchall()
    return [dict(r) for r in rows]


def _get_annotations(conn, rid: int) -> list:
    rows = conn.execute(
        "SELECT * FROM annotation WHERE record_id = ? ORDER BY created_at ASC, id ASC",
        (rid,),
    ).fetchall()
    return [_annotation_to_dict(r) for r in rows]


@bp.route("", methods=["GET"])
def list_records():
    """列表: 支持 search / tag / date_from / date_to / state / view (card|table)"""
    search = request.args.get("search", "").strip()
    tag = request.args.get("tag", "").strip()
    date_from = request.args.get("date_from", "")
    date_to = request.args.get("date_to", "")
    state = request.args.get("state", "")
    kind = request.args.get("kind", "").strip()      # 事项4: note | quiz
    pinned_only = request.args.get("pinned", "false").lower() == "true"
    limit = min(int(request.args.get("limit", "500")), 5000)

    sql = "SELECT * FROM study_record WHERE 1=1"
    args = []
    if search:
        sql += " AND (title LIKE ? OR content_md LIKE ? OR note LIKE ?)"
        kw = f"%{search}%"
        args.extend([kw, kw, kw])
    if tag:
        sql += " AND tags LIKE ?"
        args.append(f'%"{tag}"%')
    if date_from:
        sql += " AND learn_date >= ?"
        args.append(date_from)
    if date_to:
        sql += " AND learn_date <= ?"
        args.append(date_to)
    if state:
        sql += " AND state = ?"
        args.append(state)
    if kind:
        sql += " AND COALESCE(kind, 'note') = ?"
        args.append(kind)
    if pinned_only:
        sql += " AND pinned = 1"
    sql += " ORDER BY pinned DESC, due ASC, created_at DESC LIMIT ?"
    args.append(limit)

    with get_conn() as conn:
        rows = conn.execute(sql, args).fetchall()
        # 速记条数一次性聚合 (避免列表里 N+1 查询), 供卡片展示 💡 角标
        m_counts = {
            r["record_id"]: r["c"]
            for r in conn.execute(
                "SELECT record_id, COUNT(*) AS c FROM mnemonic GROUP BY record_id"
            ).fetchall()
        }
    items = [_row_to_dict(r) for r in rows]
    for it in items:
        it["mnemonic_count"] = m_counts.get(it["id"], 0)
    return jsonify({"items": items, "total": len(items)})


@bp.route("/tags", methods=["GET"])
def list_tags():
    """全部标签及卡片计数 (供主页标签筛选下拉使用)。按计数降序、名称升序。"""
    with get_conn() as conn:
        rows = conn.execute("SELECT tags FROM study_record").fetchall()
    counter = {}
    for r in rows:
        try:
            tags = json.loads(r["tags"] or "[]")
        except (ValueError, TypeError):
            tags = []
        for t in tags:
            if not t:
                continue
            counter[t] = counter.get(t, 0) + 1
    items = [{"tag": t, "count": c} for t, c in counter.items()]
    items.sort(key=lambda x: (-x["count"], x["tag"]))
    return jsonify({"items": items, "total": len(items)})


@bp.route("/<int:rid>", methods=["GET"])
def get_record(rid: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        # 同时取最近复习日志与批注
        logs = conn.execute(
            "SELECT * FROM review_log WHERE record_id = ? ORDER BY reviewed_at DESC LIMIT 50",
            (rid,),
        ).fetchall()
        annotations = _get_annotations(conn, rid)
        mnemonics = _get_mnemonics(conn, rid)
    out = _row_to_dict(row)
    out["review_logs"] = [dict(l) for l in logs]
    out["annotations"] = annotations
    out["mnemonics"] = mnemonics
    return jsonify(out)


@bp.route("/<int:rid>/annotations", methods=["GET"])
def list_annotations(rid: int):
    """列出某张卡的批注 (含整卡批注与引用片段批注)"""
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        items = _get_annotations(conn, rid)
    return jsonify({"items": items, "total": len(items)})


@bp.route("/<int:rid>/annotations", methods=["POST"])
def create_annotation(rid: int):
    """新增批注
    请求体: {quote?: str, note_md: str, review_log_id?: int}
    """
    data = request.get_json(force=True, silent=True) or {}
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        note_md = (data.get("note_md") or "").strip()
        quote = (data.get("quote") or "").strip()
        if not note_md and not quote:
            return jsonify({"error": "note_md or quote required"}), 400
        now = now_ts()
        cur = conn.execute(
            """INSERT INTO annotation (record_id, quote, note_md, review_log_id, created_at, updated_at)
               VALUES (?,?,?,?,?,?)""",
            (rid, quote, note_md, data.get("review_log_id"), now, now),
        )
        new = conn.execute("SELECT * FROM annotation WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(_annotation_to_dict(new)), 201


@bp.route("/<int:rid>/annotations/<int:aid>", methods=["PUT"])
def update_annotation(rid: int, aid: int):
    data = request.get_json(force=True, silent=True) or {}
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM annotation WHERE id = ? AND record_id = ?", (aid, rid)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        quote = data.get("quote", row["quote"])
        note_md = data.get("note_md", row["note_md"])
        if isinstance(quote, str):
            quote = quote.strip()
        if isinstance(note_md, str):
            note_md = note_md  # 允许清空笔记正文
        conn.execute(
            "UPDATE annotation SET quote=?, note_md=?, updated_at=? WHERE id=?",
            (quote, note_md, now_ts(), aid),
        )
        new = conn.execute("SELECT * FROM annotation WHERE id = ?", (aid,)).fetchone()
    return jsonify(_annotation_to_dict(new))


@bp.route("/<int:rid>/annotations/<int:aid>", methods=["DELETE"])
def delete_annotation(rid: int, aid: int):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM annotation WHERE id = ? AND record_id = ?", (aid, rid)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        conn.execute("DELETE FROM annotation WHERE id = ?", (aid,))
    return jsonify({"ok": True})


@bp.route("/<int:rid>/mnemonics", methods=["GET"])
def list_mnemonics(rid: int):
    """列出某张卡的速记"""
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        items = _get_mnemonics(conn, rid)
    return jsonify({"items": items, "total": len(items)})


@bp.route("/<int:rid>/mnemonics", methods=["POST"])
def create_mnemonic(rid: int):
    """新增速记。Body: {content_md: str, source?: "user"|"ai"}"""
    data = request.get_json(force=True, silent=True) or {}
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        content = (data.get("content_md") or "").strip()
        if not content:
            return jsonify({"error": "content_md required"}), 400
        source = (data.get("source") or "user").strip()
        if source not in ("user", "ai"):
            source = "user"
        now = now_ts()
        cur = conn.execute(
            """INSERT INTO mnemonic (record_id, content_md, source, created_at, updated_at)
               VALUES (?,?,?,?,?)""",
            (rid, content, source, now, now),
        )
        new = conn.execute("SELECT * FROM mnemonic WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(new)), 201


@bp.route("/<int:rid>/mnemonics/<int:mid>", methods=["PUT"])
def update_mnemonic(rid: int, mid: int):
    data = request.get_json(force=True, silent=True) or {}
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM mnemonic WHERE id = ? AND record_id = ?", (mid, rid)
        ).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        content = data.get("content_md", row["content_md"])
        if isinstance(content, str):
            content = content.strip()
        source = data.get("source", row["source"])
        if source not in ("user", "ai"):
            source = row["source"]
        conn.execute(
            "UPDATE mnemonic SET content_md=?, source=?, updated_at=? WHERE id=?",
            (content, source, now_ts(), mid),
        )
        new = conn.execute("SELECT * FROM mnemonic WHERE id = ?", (mid,)).fetchone()
    return jsonify(dict(new))


@bp.route("/<int:rid>/mnemonics/<int:mid>", methods=["DELETE"])
def delete_mnemonic(rid: int, mid: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM mnemonic WHERE id = ? AND record_id = ?", (mid, rid)
        ).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        conn.execute("DELETE FROM mnemonic WHERE id = ?", (mid,))
    return jsonify({"ok": True})


def _create_row(data: dict) -> dict:
    """建卡核心逻辑 (create_record 与 quick_capture 共用, 保证行为一致)。

    title 必填由调用方保证; 这里不再做 400 校验, 缺 title 抛 ValueError。
    """
    title = (data.get("title") or "").strip()
    if not title:
        raise ValueError("title required")

    tags_raw = data.get("tags", [])
    if isinstance(tags_raw, str):
        tags = parse_tags_str(tags_raw)
    else:
        tags = list(tags_raw)

    image_paths = data.get("image_paths", [])
    if isinstance(image_paths, str):
        try:
            image_paths = json.loads(image_paths)
        except (ValueError, TypeError):
            image_paths = parse_tags_str(image_paths)

    now = now_ts()
    learn_date = data.get("learn_date") or today_iso()
    due = now  # 新卡默认立即到期

    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO study_record
            (title, tags, content_md, image_paths, learn_date, note,
             state, stability, difficulty, reps, lapses, last_review, due,
             priority, pinned, created_at, updated_at,
             kind, solution_md, rubric, mistake_tags)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                title,
                json.dumps(tags, ensure_ascii=False),
                data.get("content_md", ""),
                json.dumps(image_paths),
                learn_date,
                data.get("note", ""),
                "new", 0, 0, 0, 0, 0, due,
                int(data.get("priority", 0) or 0),
                int(data.get("pinned", 0) or 0),
                now, now,
                # ---- 事项4 (错题) ----
                (data.get("kind") or "note"),
                data.get("solution_md", "") or "",
                _dump_json_field(data.get("rubric")),
                _dump_json_field(data.get("mistake_tags")),
            ),
        )
        rid = cur.lastrowid
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
    return _row_to_dict(row)


@bp.route("", methods=["POST"])
def create_record():
    """新增学习记录

    支持两种方式:
      1) application/json  {title, content_md, tags, learn_date, note, image_paths, priority, pinned}
      2) multipart/form-data (同时上传图片)
    """
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        data = {
            "title": request.form.get("title", "").strip(),
            "content_md": request.form.get("content_md", ""),
            "tags": request.form.get("tags", ""),
            "learn_date": request.form.get("learn_date", today_iso()),
            "note": request.form.get("note", ""),
            "priority": int(request.form.get("priority", "0") or 0),
            "pinned": int(request.form.get("pinned", "0") or 0),
        }
        image_paths = []
        files = request.files.getlist("images")
        for f in files:
            if f and f.filename:
                url = save_uploaded_image(f, UPLOAD_DIR)
                image_paths.append(url)
        # 已存在的 image_paths (从前端预先上传返回的 URL)
        existing = request.form.get("image_paths_json", "")
        if existing:
            try:
                image_paths.extend(json.loads(existing))
            except (ValueError, TypeError):
                pass
        data["image_paths"] = image_paths
    else:
        data = request.get_json(force=True) or {}

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title required"}), 400

    row = _create_row(data)
    return jsonify(row), 201


@bp.route("/quick-capture", methods=["POST"])
def quick_capture():
    """思源快速捕捉: 选中文字 -> 一键建卡 (单向推送, 不写思源、不做同步)。

    Body: {"content_md": "...", "title": "", "tags": ["思源"],
           "source": {"doc_name": "笔记标题", "block_id": "2024...", "url": "siyuan://blocks/..."},
           "kind": "note"|"quiz", "solution_md": "...", "rubric": [...]}
    逻辑: 清洗思源方言 -> 标题缺省取首行 -> 追加来源回链 -> 复用 _create_row 建卡
    kind=quiz 时按题目卡建卡 (题干=content_md, 标准解答=solution_md)。
    """
    data = request.get_json(force=True) or {}
    content = (data.get("content_md") or "").strip()
    if not content:
        return jsonify({"error": "content_md required"}), 400

    # 1) 清洗思源 kramdown 方言 (块引/IAL/标签/嵌入块)
    content = clean_siyuan_dialect(content)
    if not content:
        return jsonify({"error": "content_md empty after clean"}), 400

    # 2) 标题: 显式传入 > 正文首个非空行(去 # 号) > 兜底时间戳
    title = (data.get("title") or "").strip()
    if not title:
        for line in content.split("\n"):
            line = line.strip().lstrip("#").strip()
            if line:
                title = line[:60]
                break
    if not title:
        title = "思源快捕 " + time.strftime("%Y-%m-%d %H:%M")

    # 3) 来源回链 (可选)
    src = data.get("source") or {}
    url = (src.get("url") or "").strip()
    doc_name = (src.get("doc_name") or "").strip() or "思源"
    if url:
        content += f"\n\n> 来源：[{doc_name}]({url})"

    # 4) 建卡 (与 POST /api/records 完全同一套逻辑; title 已在第 2 步保证非空)
    row = _create_row({
        "title": title,
        "content_md": content,
        "tags": data.get("tags") or [],
        "note": data.get("note", ""),
        "learn_date": data.get("learn_date") or today_iso(),
        "priority": data.get("priority", 0),
        "pinned": data.get("pinned", 0),
        # ---- 题目卡快捕 (思源插件「作为题目发送」/ MCP quick_capture) ----
        "kind": data.get("kind") or "note",
        "solution_md": data.get("solution_md", ""),
        "rubric": data.get("rubric"),
    })
    return jsonify({"id": row["id"], "title": row["title"],
                    "kind": row["kind"]}), 201


@bp.route("/<int:rid>", methods=["PUT"])
def update_record(rid: int):
    data = request.get_json(force=True) or {}
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        data = {
            "title": request.form.get("title", ""),
            "content_md": request.form.get("content_md", ""),
            "tags": request.form.get("tags", ""),
            "learn_date": request.form.get("learn_date", ""),
            "note": request.form.get("note", ""),
            "priority": int(request.form.get("priority", "0") or 0),
            "pinned": int(request.form.get("pinned", "0") or 0),
        }
        files = request.files.getlist("images")
        new_paths = []
        for f in files:
            if f and f.filename:
                new_paths.append(save_uploaded_image(f, UPLOAD_DIR))
        if new_paths:
            data["image_paths"] = new_paths

    with get_conn() as conn:
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404

        title = (data.get("title") or row["title"]).strip() if data.get("title") else row["title"]
        content_md = data.get("content_md", row["content_md"])
        note = data.get("note", row["note"])
        learn_date = data.get("learn_date") or row["learn_date"]
        priority = int(data.get("priority", row["priority"]) if data.get("priority") is not None else row["priority"])
        pinned = int(data.get("pinned", row["pinned"]) if data.get("pinned") is not None else row["pinned"])

        tags_raw = data.get("tags", None)
        if tags_raw is not None:
            if isinstance(tags_raw, str):
                tags = parse_tags_str(tags_raw)
            else:
                tags = list(tags_raw)
        else:
            tags = json.loads(row["tags"] or "[]")

        if "image_paths" in data:
            ip = data["image_paths"]
            if isinstance(ip, str):
                try:
                    image_paths = json.loads(ip)
                except (ValueError, TypeError):
                    image_paths = parse_tags_str(ip)
            else:
                image_paths = list(ip)
        else:
            image_paths = json.loads(row["image_paths"] or "[]")

        # ---- 事项4 (错题): 可选的 kind / solution_md / rubric / mistake_tags ----
        kind = data.get("kind", row["kind"] if "kind" in row.keys() else "note") or "note"
        solution_md = data.get("solution_md",
                               row["solution_md"] if "solution_md" in row.keys() else "")
        rubric = _dump_json_field(
            data.get("rubric", row["rubric"] if "rubric" in row.keys() else None))
        mistake_tags = _dump_json_field(
            data.get("mistake_tags", row["mistake_tags"] if "mistake_tags" in row.keys() else None))

        conn.execute(
            """UPDATE study_record SET
                title=?, tags=?, content_md=?, image_paths=?,
                learn_date=?, note=?, priority=?, pinned=?, updated_at=?,
                kind=?, solution_md=?, rubric=?, mistake_tags=?
               WHERE id=?""",
            (
                title, json.dumps(tags, ensure_ascii=False), content_md,
                json.dumps(image_paths), learn_date, note, priority, pinned,
                now_ts(),
                kind, solution_md or "", rubric, mistake_tags,
                rid,
            ),
        )
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
    return jsonify(_row_to_dict(row))


@bp.route("/<int:rid>", methods=["DELETE"])
def delete_record(rid: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        # 删除关联图片
        try:
            for p in json.loads(row["image_paths"] or "[]"):
                if p.startswith("/static/uploads/"):
                    f = (Path(__file__).resolve().parent.parent / p.lstrip("/"))
                    if f.exists():
                        f.unlink()
        except Exception:
            pass
        conn.execute("DELETE FROM study_record WHERE id = ?", (rid,))
    return jsonify({"ok": True})


@bp.route("/batch", methods=["POST"])
def batch_delete():
    """批量删除 / 置顶 / 取消置顶 / 重新排期"""
    data = request.get_json(force=True) or {}
    ids = list(data.get("ids", []))
    action = data.get("action", "delete")
    if not ids:
        return jsonify({"error": "ids required"}), 400
    with get_conn() as conn:
        if action == "delete":
            placeholders = ",".join("?" * len(ids))
            # 先删图片
            rows = conn.execute(
                f"SELECT image_paths FROM study_record WHERE id IN ({placeholders})", ids
            ).fetchall()
            for r in rows:
                try:
                    for p in json.loads(r["image_paths"] or "[]"):
                        if p.startswith("/static/uploads/"):
                            f = (Path(__file__).resolve().parent.parent / p.lstrip("/"))
                            if f.exists():
                                f.unlink()
                except Exception:
                    pass
            conn.execute(f"DELETE FROM study_record WHERE id IN ({placeholders})", ids)
        elif action == "pin":
            placeholders = ",".join("?" * len(ids))
            conn.execute(f"UPDATE study_record SET pinned=1 WHERE id IN ({placeholders})", ids)
        elif action == "unpin":
            placeholders = ",".join("?" * len(ids))
            conn.execute(f"UPDATE study_record SET pinned=0 WHERE id IN ({placeholders})", ids)
        elif action == "reset_fsrs":
            placeholders = ",".join("?" * len(ids))
            now = now_ts()
            conn.execute(
                f"UPDATE study_record SET state='new', stability=0, difficulty=0, reps=0, lapses=0, last_review=0, due=?, updated_at=? WHERE id IN ({placeholders})",
                [now, now] + ids,
            )
        else:
            return jsonify({"error": "unknown action"}), 400
    return jsonify({"ok": True, "affected": len(ids)})


@bp.route("/upload_image", methods=["POST"])
def upload_image():
    """单独上传图片端点 (前端粘贴/拖拽上传时使用)"""
    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "no images"}), 400
    urls = []
    for f in files:
        if f and f.filename:
            urls.append(save_uploaded_image(f, UPLOAD_DIR))
    return jsonify({"urls": urls}), 201


@bp.route("/export", methods=["GET"])
def export_records():
    """导出全部记录为 Markdown zip 或 CSV"""
    fmt = request.args.get("format", "csv")
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM study_record ORDER BY created_at DESC").fetchall()
    items = [_row_to_dict(r) for r in rows]

    if fmt == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow([
            "id", "title", "tags", "learn_date", "state", "stability",
            "difficulty", "reps", "lapses", "due", "priority", "pinned",
            "note", "content_md", "image_paths", "created_at",
        ])
        for it in items:
            writer.writerow([
                it["id"], it["title"], "|".join(it["tags"]), it["learn_date"],
                it["state"], it["stability"], it["difficulty"], it["reps"],
                it["lapses"], it["due"], it["priority"], it["pinned"],
                it["note"], it["content_md"], "|".join(it["image_paths"]),
                it["created_at"],
            ])
        out.seek(0)
        buf = io.BytesIO(out.getvalue().encode("utf-8-sig"))
        buf.seek(0)
        return send_file(
            buf, as_attachment=True, download_name=f"memory_anchor_records_{today_iso()}.csv",
            mimetype="text/csv",
        )
    else:
        # markdown 单文件导出 (合并)
        lines = [f"# Memory Anchor 导出 · {today_iso()}\n"]
        for it in items:
            lines.append(f"\n## {it['title']}\n")
            lines.append(f"- 标签: {', '.join(it['tags']) or '-'}")
            lines.append(f"- 学习日期: {it['learn_date']}")
            lines.append(f"- 状态: {it['state']}  稳定性: {it['stability']:.2f}  难度: {it['difficulty']:.2f}")
            lines.append(f"- 复习次数: {it['reps']}  遗忘: {it['lapses']}")
            if it["note"]:
                lines.append(f"\n**备注:** {it['note']}\n")
            if it["content_md"]:
                lines.append("\n" + it["content_md"] + "\n")
            if it["image_paths"]:
                lines.append("\n**图片:**")
                for p in it["image_paths"]:
                    lines.append(f"![]({p})")
        text = "\n".join(lines)
        buf = io.BytesIO(text.encode("utf-8"))
        buf.seek(0)
        return send_file(
            buf, as_attachment=True, download_name=f"memory_anchor_export_{today_iso()}.md",
            mimetype="text/markdown",
        )


@bp.route("/format", methods=["POST"])
def format_markdown():
    """对 Markdown 文本做粘贴格式修正
    请求体 (JSON): {"text": "...", "options": {...}}  或直接 text/plain 传文本
    返回: {"text": "修正后的文本"}
    借鉴 siyuan-plugin-text-process 的粘贴处理逻辑。
    """
    if request.content_type and request.content_type.startswith("text/plain"):
        text = request.get_data(as_text=True) or ""
        options = {}
    else:
        data = request.get_json(force=True, silent=True) or {}
        text = data.get("text", "") or ""
        options = data.get("options", {}) or {}
    from app.markdown_fix import fix_markdown
    fixed = fix_markdown(text, options)
    return jsonify({"text": fixed})


@bp.route("/import_md", methods=["POST"])
def import_markdown():
    """从 Markdown 文本批量导入 (前端粘贴或上传 .md)
    规则: 一级标题 # 作为分卡标志; 若只有一段则作为单卡
    可通过 ?fix=1 在导入前先做粘贴格式修正。
    """
    options = {}
    if request.files.get("file"):
        text = request.files["file"].read().decode("utf-8")
    else:
        j = request.get_json(force=True, silent=True) or {}
        if j:
            text = j.get("text", "") or ""
            options = j.get("options", {}) or {}
            do_fix = bool(j.get("fix")) or request.args.get("fix") == "1"
        else:
            text = (request.get_data(as_text=True) or "")
            do_fix = request.args.get("fix") == "1"

    # ?fix=1 或 JSON {fix:true} 时先做粘贴格式修正 (安全子集 + 用户选项, 见 app/markdown_fix)
    if do_fix:
        from app.markdown_fix import fix_markdown
        text = fix_markdown(text, options)

    if not text.strip():
        return jsonify({"error": "empty content"}), 400

    # 按 # 一级标题分割
    parts = []
    current_title = None
    buf = []
    for line in text.splitlines():
        if line.startswith("# ") and not line.startswith("## "):
            if current_title is not None:
                parts.append((current_title, "\n".join(buf).strip()))
            current_title = line[2:].strip()
            buf = []
        else:
            buf.append(line)
    if current_title is not None:
        parts.append((current_title, "\n".join(buf).strip()))
    if not parts:
        # 没有 #, 整篇作为单卡
        first_line = text.strip().split("\n", 1)[0][:80]
        parts = [(first_line or "导入笔记", text.strip())]

    now = now_ts()
    today = today_iso()
    created_ids = []
    with get_conn() as conn:
        for title, content in parts:
            cur = conn.execute(
                """INSERT INTO study_record
                (title, tags, content_md, image_paths, learn_date, note,
                 state, stability, difficulty, reps, lapses, last_review, due,
                 priority, pinned, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    title, "[]", content, "[]", today, "", "new", 0, 0, 0, 0, 0, now,
                    0, 0, now, now,
                ),
            )
            created_ids.append(cur.lastrowid)
    return jsonify({"ok": True, "imported": len(created_ids), "ids": created_ids}), 201
