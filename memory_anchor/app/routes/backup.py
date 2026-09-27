"""数据备份与恢复"""
import os
import shutil
import time
import sqlite3
from pathlib import Path
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, current_app

from app.db import get_conn, DB_PATH, BACKUP_DIR, init_db
from app.utils import now_ts, today_iso, TZ

bp = Blueprint("backup", __name__, url_prefix="/api/backup")


def _list_backups() -> list:
    items = []
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM backup_log ORDER BY backup_time DESC"
        ).fetchall()
    for r in rows:
        d = dict(r)
        d["backup_time_str"] = datetime.fromtimestamp(r["backup_time"], TZ).strftime("%Y-%m-%d %H:%M:%S")
        items.append(d)
    return items


@bp.route("", methods=["GET"])
def list_backups():
    return jsonify({"items": _list_backups()})


@bp.route("", methods=["POST"])
def create_backup():
    """创建手动备份
    Body: {note?: str}  备份当前 DB 文件到 backups/
    """
    data = request.get_json(silent=True) or {}
    note = data.get("note", "手动备份")
    ts = now_ts()
    fname = f"backup_{datetime.fromtimestamp(ts, TZ).strftime('%Y%m%d_%H%M%S')}.db"
    fpath = BACKUP_DIR / fname
    # 用 SQLite backup API, 避免锁文件
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(fpath))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    size = fpath.stat().st_size
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO backup_log(backup_time, backup_type, file_path, file_size, note) VALUES (?,?,?,?,?)",
            (ts, "manual", str(fpath), size, note),
        )
    return jsonify({
        "ok": True,
        "file": fname,
        "size": size,
        "time": ts,
    }), 201


@bp.route("/<int:bid>", methods=["DELETE"])
def delete_backup(bid: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM backup_log WHERE id = ?", (bid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
        try:
            f = Path(row["file_path"])
            if f.exists():
                f.unlink()
        except Exception:
            pass
        conn.execute("DELETE FROM backup_log WHERE id = ?", (bid,))
    return jsonify({"ok": True})


@bp.route("/<int:bid>/download", methods=["GET"])
def download_backup(bid: int):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM backup_log WHERE id = ?", (bid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
    fpath = Path(row["file_path"])
    if not fpath.exists():
        return jsonify({"error": "file missing"}), 404
    return send_file(str(fpath), as_attachment=True, download_name=fpath.name)


@bp.route("/<int:bid>/restore", methods=["POST"])
def restore_backup(bid: int):
    """从指定备份恢复 (覆盖当前 DB)"""
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM backup_log WHERE id = ?", (bid,)).fetchone()
        if row is None:
            return jsonify({"error": "not found"}), 404
    fpath = Path(row["file_path"])
    if not fpath.exists():
        return jsonify({"error": "backup file missing"}), 404

    # 先做一份 "恢复前快照" 防止误操作
    safety_path = BACKUP_DIR / f"pre_restore_{datetime.now(TZ).strftime('%Y%m%d_%H%M%S')}.db"
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(safety_path))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    # 用备份覆盖
    src = sqlite3.connect(str(fpath))
    dst = sqlite3.connect(str(DB_PATH))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return jsonify({"ok": True, "restored_from": row["file_path"], "safety_snapshot": str(safety_path)})


@bp.route("/auto", methods=["POST"])
def auto_backup_check():
    """检查并执行自动备份 (按设置间隔)
    路由可由前端定时器或启动钩子调用
    """
    from app.db import get_setting
    auto = get_setting("auto_backup", False)
    interval_days = int(get_setting("backup_interval_days", 7))
    last = float(get_setting("last_backup_time", 0))
    if not auto:
        return jsonify({"ok": False, "reason": "auto_backup disabled"})
    if last > 0 and (now_ts() - last) < interval_days * 86400:
        return jsonify({"ok": False, "reason": "interval not reached"})
    ts = now_ts()
    fname = f"auto_{datetime.fromtimestamp(ts, TZ).strftime('%Y%m%d_%H%M%S')}.db"
    fpath = BACKUP_DIR / fname
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(fpath))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    size = fpath.stat().st_size
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO backup_log(backup_time, backup_type, file_path, file_size, note) VALUES (?,?,?,?,?)",
            (ts, "auto", str(fpath), size, "自动备份"),
        )
    from app.db import set_setting
    set_setting("last_backup_time", ts)
    return jsonify({"ok": True, "file": fname})
