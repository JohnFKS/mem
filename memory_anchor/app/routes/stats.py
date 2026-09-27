"""数据统计 API: 学习量 / 复习率 / 热力图 / 记忆健康度"""
import json
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify

from app.db import get_conn
from app.utils import now_ts, today_iso, TZ
from app.fsrs import fsrs, MemoryState

bp = Blueprint("stats", __name__, url_prefix="/api/stats")


@bp.route("/overview", methods=["GET"])
def overview():
    """总览: 卡片总数 / 状态分布 / 今日待复习 / 今日已复习 / 记忆健康度"""
    now = now_ts()
    today_start = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM study_record").fetchone()["c"]
        by_state = {}
        for r in conn.execute("SELECT state, COUNT(*) AS c FROM study_record GROUP BY state").fetchall():
            by_state[r["state"]] = r["c"]
        due_count = conn.execute(
            "SELECT COUNT(*) AS c FROM study_record WHERE due <= ?",
            (now,),
        ).fetchone()["c"]
        new_count = by_state.get("new", 0)
        reviewed_today = conn.execute(
            "SELECT COUNT(*) AS c FROM review_log WHERE reviewed_at >= ?",
            (today_start,),
        ).fetchone()["c"]
        # 记忆健康度: 所有非新卡的当前保留率均值
        rows = conn.execute(
            "SELECT stability, last_review FROM study_record WHERE last_review > 0 AND stability > 0"
        ).fetchall()
        retention_list = []
        for r in rows:
            ms = MemoryState(stability=r["stability"], difficulty=5.0, last_review=r["last_review"])
            retention_list.append(fsrs.retrievability(ms, now))
        avg_retention = sum(retention_list) / len(retention_list) if retention_list else 0.0
        # 累计复习次数 / 遗忘次数
        agg = conn.execute(
            "SELECT COALESCE(SUM(reps),0) AS reps, COALESCE(SUM(lapses),0) AS lapses FROM study_record"
        ).fetchone()
        # 7 天复习数
        seven_days_ago = now - 7 * 86400
        review_7d = conn.execute(
            "SELECT COUNT(*) AS c FROM review_log WHERE reviewed_at >= ?",
            (seven_days_ago,),
        ).fetchone()["c"]
        new_7d = conn.execute(
            "SELECT COUNT(*) AS c FROM study_record WHERE created_at >= ?",
            (seven_days_ago,),
        ).fetchone()["c"]

    return jsonify({
        "total_cards": total,
        "by_state": by_state,
        "due_today": due_count,
        "new_today": new_count,
        "reviewed_today": reviewed_today,
        "memory_health": round(avg_retention * 100, 1),
        "total_reps": agg["reps"],
        "total_lapses": agg["lapses"],
        "review_7d": review_7d,
        "new_7d": new_7d,
    })


@bp.route("/heatmap", methods=["GET"])
def heatmap():
    """学习热力图: 过去 N 天每天的学习/复习活动量
    返回 [{date: 'YYYY-MM-DD', learn: int, review: int, total: int}]
    """
    days = int(request.args.get("days", "365"))
    days = min(max(days, 30), 730)
    now = now_ts()
    since = now - days * 86400

    with get_conn() as conn:
        # 按天聚合学习记录
        learn_rows = conn.execute(
            "SELECT learn_date, COUNT(*) AS c FROM study_record "
            "WHERE learn_date >= ? GROUP BY learn_date",
            (datetime.fromtimestamp(since, TZ).strftime("%Y-%m-%d"),),
        ).fetchall()
        learn_map = {r["learn_date"]: r["c"] for r in learn_rows}

        # 按天聚合复习
        review_rows = conn.execute(
            "SELECT reviewed_at FROM review_log WHERE reviewed_at >= ?",
            (since,),
        ).fetchall()
        review_map = defaultdict(int)
        for r in review_rows:
            d = datetime.fromtimestamp(r["reviewed_at"], TZ).strftime("%Y-%m-%d")
            review_map[d] += 1

    # 填充空白天
    start_date = datetime.now(TZ).date() - timedelta(days=days - 1)
    out = []
    for i in range(days):
        d = (start_date + timedelta(days=i)).isoformat()
        l = learn_map.get(d, 0)
        r = review_map.get(d, 0)
        out.append({"date": d, "learn": l, "review": r, "total": l + r})
    return jsonify({"items": out, "days": days})


@bp.route("/retention_trend", methods=["GET"])
def retention_trend():
    """保留率趋势: 过去 30 天平均保留率 (基于复习日志)
    返回 [{date, avg_retention, count}]
    """
    days = int(request.args.get("days", "30"))
    days = min(max(days, 7), 365)
    now = now_ts()
    since = now - days * 86400
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT retention, reviewed_at FROM review_log WHERE reviewed_at >= ? AND retention > 0",
            (since,),
        ).fetchall()
    by_day = defaultdict(list)
    for r in rows:
        d = datetime.fromtimestamp(r["reviewed_at"], TZ).strftime("%Y-%m-%d")
        by_day[d].append(r["retention"])
    start_date = datetime.now(TZ).date() - timedelta(days=days - 1)
    out = []
    for i in range(days):
        d = (start_date + timedelta(days=i)).isoformat()
        rets = by_day.get(d, [])
        out.append({
            "date": d,
            "avg_retention": round(sum(rets) / len(rets) * 100, 1) if rets else None,
            "count": len(rets),
        })
    return jsonify({"items": out})


@bp.route("/weekly", methods=["GET"])
def weekly_report():
    """周报: 7 天内每天的学习/复习/遗忘数"""
    now = now_ts()
    since = now - 7 * 86400
    with get_conn() as conn:
        learn_rows = conn.execute(
            "SELECT learn_date, COUNT(*) AS c FROM study_record "
            "WHERE learn_date >= ? GROUP BY learn_date",
            (datetime.fromtimestamp(since, TZ).strftime("%Y-%m-%d"),),
        ).fetchall()
        learn_map = {r["learn_date"]: r["c"] for r in learn_rows}
        review_rows = conn.execute(
            "SELECT rating, reviewed_at FROM review_log WHERE reviewed_at >= ?",
            (since,),
        ).fetchall()
        review_by_day = defaultdict(lambda: {"review": 0, "lapse": 0})
        for r in review_rows:
            d = datetime.fromtimestamp(r["reviewed_at"], TZ).strftime("%Y-%m-%d")
            review_by_day[d]["review"] += 1
            if r["rating"] == 1:
                review_by_day[d]["lapse"] += 1

    start_date = datetime.now(TZ).date() - timedelta(days=6)
    out = []
    for i in range(7):
        d = (start_date + timedelta(days=i)).isoformat()
        out.append({
            "date": d,
            "weekday": datetime.fromisoformat(d).strftime("周%w"),
            "learn": learn_map.get(d, 0),
            "review": review_by_day[d]["review"],
            "lapse": review_by_day[d]["lapse"],
        })
    return jsonify({"items": out})


@bp.route("/tags", methods=["GET"])
def tag_stats():
    """标签分布"""
    with get_conn() as conn:
        rows = conn.execute("SELECT tags FROM study_record").fetchall()
    counter = defaultdict(int)
    for r in rows:
        try:
            tags = json.loads(r["tags"] or "[]")
            for t in tags:
                counter[t] += 1
        except (ValueError, TypeError):
            pass
    items = sorted(counter.items(), key=lambda x: -x[1])[:30]
    return jsonify({"items": [{"tag": t, "count": c} for t, c in items]})
