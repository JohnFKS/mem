"""复习中心: 待复习队列 + 评分 + 复习日志"""
import json
import time
from flask import Blueprint, request, jsonify

from app.db import get_conn
from app.utils import now_ts, today_iso
from app.fsrs import fsrs, MemoryState

bp = Blueprint("review", __name__, url_prefix="/api/review")


def _row_to_dict(row) -> dict:
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


@bp.route("/queue", methods=["GET"])
def get_queue():
    """获取今日待复习队列 (含 new + due)
    Query: limit (默认 50), include_new (默认 true), due_only (默认 false)
    """
    now = now_ts()
    limit = min(int(request.args.get("limit", "50")), 500)
    include_new = request.args.get("include_new", "true").lower() == "true"
    due_only = request.args.get("due_only", "false").lower() == "true"

    sql = "SELECT * FROM study_record WHERE due <= ?"
    args = [now]
    if not include_new or due_only:
        if due_only:
            sql += " AND state != 'new'"
        elif not include_new:
            sql += " AND state != 'new'"
    sql += " ORDER BY pinned DESC, due ASC, created_at ASC LIMIT ?"
    args.append(limit)

    with get_conn() as conn:
        rows = conn.execute(sql, args).fetchall()
        # 今日总数统计
        total_new = conn.execute(
            "SELECT COUNT(*) AS c FROM study_record WHERE state='new'"
        ).fetchone()["c"]
        total_due = conn.execute(
            "SELECT COUNT(*) AS c FROM study_record WHERE due <= ? AND state != 'new'",
            (now,),
        ).fetchone()["c"]
        total_reviewed_today = conn.execute(
            "SELECT COUNT(*) AS c FROM review_log WHERE reviewed_at >= ?",
            (now - 16 * 3600,),
        ).fetchone()["c"]

    return jsonify({
        "items": [_row_to_dict(r) for r in rows],
        "stats": {
            "queue_size": len(rows),
            "total_new": total_new,
            "total_due": total_due,
            "reviewed_today": total_reviewed_today,
        },
    })


@bp.route("/<int:rid>/answer", methods=["POST"])
def answer(rid: int):
    """对一张卡评分
    Body: {rating: "again"|"hard"|"easy"}
    """
    data = request.get_json(force=True) or {}
    rating_str = data.get("rating", "good")
    rating = fsrs.rating_to_int(rating_str)
    if rating not in (1, 2, 3, 4):
        return jsonify({"error": "invalid rating"}), 400

    # ---- 事项4 (错题): 可选字段, 不影响 FSRS 排程本身 ----
    def _as_list(v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else []
            except (ValueError, TypeError):
                return []
        return []

    missed_points = _as_list(data.get("missed_points"))
    mistake_tags = _as_list(data.get("mistake_tags"))

    now = now_ts()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404

        # 计算复习前状态
        prev_state = None
        if row["last_review"] > 0 and row["stability"] > 0:
            prev_state = MemoryState(
                stability=row["stability"],
                difficulty=row["difficulty"] if row["difficulty"] > 0 else 5.0,
                last_review=row["last_review"],
            )

        elapsed_days = 0
        if row["last_review"] > 0:
            elapsed_days = max(int((now - row["last_review"]) / 86400), 0)

        # 计算复习前保留率
        retention_before = fsrs.retrievability(prev_state, now) if prev_state else 0.0

        # 排程
        result = fsrs.schedule(prev_state, rating, now, elapsed_days=elapsed_days)
        new_state = result.memory_state

        # 推断 state 文本
        if prev_state is None:
            state_text = "learning" if result.scheduled_days == 0 else "review"
        elif rating == 1:
            state_text = "relearning"
        else:
            state_text = "review"

        state_before_text = row["state"]

        # 写 review_log
        conn.execute(
            """INSERT INTO review_log
            (record_id, rating, reviewed_at, elapsed_days, scheduled_days,
             retention, state_before, state_after,
             stability_before, stability_after,
             difficulty_before, difficulty_after,
             missed_points, mistake_tags)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                rid, rating, now, elapsed_days, result.scheduled_days,
                retention_before, state_before_text, state_text,
                row["stability"], new_state.stability,
                row["difficulty"] if row["difficulty"] else 0, new_state.difficulty,
                # ---- 事项4 (错题): 随评分一起提交的错因与漏掉的得分点 ----
                json.dumps(missed_points, ensure_ascii=False),
                json.dumps(mistake_tags, ensure_ascii=False),
            ),
        )

        # 更新卡片
        reps = row["reps"] + 1
        lapses = row["lapses"] + (1 if rating == 1 else 0)
        conn.execute(
            """UPDATE study_record SET
                state=?, stability=?, difficulty=?, reps=?, lapses=?,
                last_review=?, due=?, updated_at=?, mistake_tags=?
               WHERE id=?""",
            (
                state_text, new_state.stability, new_state.difficulty,
                reps, lapses, now, result.due, now,
                # 把本次错因同步到卡片上 (便于列表/详情展示最近错因)
                json.dumps(mistake_tags, ensure_ascii=False), rid,
            ),
        )
        updated = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()

    return jsonify({
        "record": _row_to_dict(updated),
        "review": {
            "rating": rating,
            "rating_label": fsrs.rating_label(rating),
            "retention_before": round(retention_before, 4),
            "scheduled_days": result.scheduled_days,
            "due": result.due,
            "stability_after": round(new_state.stability, 3),
            "difficulty_after": round(new_state.difficulty, 3),
        },
    })


@bp.route("/logs", methods=["GET"])
def review_logs():
    """最近复习日志"""
    limit = min(int(request.args.get("limit", "100")), 1000)
    days = int(request.args.get("days", "30"))
    now = now_ts()
    since = now - days * 86400
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT l.*, r.title AS record_title
               FROM review_log l
               LEFT JOIN study_record r ON r.id = l.record_id
               WHERE l.reviewed_at >= ?
               ORDER BY l.reviewed_at DESC LIMIT ?""",
            (since, limit),
        ).fetchall()

    # 事项4: JSON 列解析为数组, 与 records 的返回保持一致
    items = []
    for r in rows:
        d = dict(r)
        for col in ("missed_points", "mistake_tags"):
            try:
                d[col] = json.loads(d.get(col) or "[]")
            except (ValueError, TypeError):
                d[col] = []
        items.append(d)
    return jsonify({"items": items})


@bp.route("/preview/<int:rid>", methods=["GET"])
def preview_next(rid: int):
    """预览该卡各评分后的下次间隔 (不写库)"""
    now = now_ts()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM study_record WHERE id = ?", (rid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404

    prev_state = None
    if row["last_review"] > 0 and row["stability"] > 0:
        prev_state = MemoryState(
            stability=row["stability"],
            difficulty=row["difficulty"] if row["difficulty"] > 0 else 5.0,
            last_review=row["last_review"],
        )

    elapsed = max(int((now - (row["last_review"] or now)) / 86400), 0)
    out = {}
    for r in (1, 2, 4):  # again / hard / easy
        res = fsrs.schedule(prev_state, r, now, elapsed_days=elapsed)
        out[{"1": "again", "2": "hard", "4": "easy"}[str(r)]] = {
            "scheduled_days": res.scheduled_days,
            "due": res.due,
            "stability": round(res.memory_state.stability, 3),
            "difficulty": round(res.memory_state.difficulty, 3),
        }
    return jsonify(out)
