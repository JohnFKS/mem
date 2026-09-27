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
    return d


@bp.route("", methods=["GET"])
def list_records():
    """列表: 支持 search / tag / date_from / date_to / state / view (card|table)"""
    search = request.args.get("search", "").strip()
    tag = request.args.get("tag", "").strip()
    date_from = request.args.get("date_from", "")
    date_to = request.args.get("date_to", "")
    state = request.args.get("state", "")
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
    if pinned_only:
        sql += " AND pinned = 1"
    sql += " ORDER BY pinned DESC, due ASC, created_at DESC LIMIT ?"
    args.append(limit)

    with get_conn() as conn:
        rows = conn.execute(sql, args).fetchall()
    return jsonify({"items": [_row_to_dict(r) for r in rows], "total": len(rows)})


@bp.route("/<int:rid>", methods=["GET"])
def get_record(rid: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    # 同时取最近复习日志
    with get_conn() as conn:
        logs = conn.execute(
            "SELECT * FROM review_log WHERE record_id = ? ORDER BY reviewed_at DESC LIMIT 50",
            (rid,),
        ).fetchall()
    out = _row_to_dict(row)
    out["review_logs"] = [dict(l) for l in logs]
    return jsonify(out)


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
             priority, pinned, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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
            ),
        )
        rid = cur.lastrowid
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
    return jsonify(_row_to_dict(row)), 201


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

        conn.execute(
            """UPDATE study_record SET
                title=?, tags=?, content_md=?, image_paths=?,
                learn_date=?, note=?, priority=?, pinned=?, updated_at=?
               WHERE id=?""",
            (
                title, json.dumps(tags, ensure_ascii=False), content_md,
                json.dumps(image_paths), learn_date, note, priority, pinned,
                now_ts(), rid,
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


@bp.route("/import_md", methods=["POST"])
def import_markdown():
    """从 Markdown 文本批量导入 (前端粘贴或上传 .md)
    规则: 一级标题 # 作为分卡标志; 若只有一段则作为单卡
    """
    if request.files.get("file"):
        text = request.files["file"].read().decode("utf-8")
    else:
        text = (request.get_data(as_text=True) or "")

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
