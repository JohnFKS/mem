"""批注 CRUD API"""
import time
from flask import Blueprint, request, jsonify

from app.db import get_conn
from app.utils import now_ts

bp = Blueprint("annotations", __name__, url_prefix="/api/annotations")


@bp.route("/record/<int:record_id>", methods=["GET"])
def list_annotations(record_id: int):
    """获取某条记录的所有批注"""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM annotation WHERE record_id = ? ORDER BY created_at ASC",
            (record_id,),
        ).fetchall()
    return jsonify({"items": [dict(r) for r in rows]})


@bp.route("", methods=["POST"])
def create_annotation():
    """新增批注"""
    data = request.get_json()
    record_id = data.get("record_id")
    quote = data.get("quote", "").strip()
    note_md = data.get("note_md", "").strip()

    if not record_id:
        return jsonify({"error": "record_id required"}), 400
    if not note_md:
        return jsonify({"error": "note_md required"}), 400

    now = now_ts()
    with get_conn() as conn:
        cursor = conn.execute(
            """INSERT INTO annotation (record_id, quote, note_md, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (record_id, quote, note_md, now, now),
        )
        ann_id = cursor.lastrowid
    return jsonify({"id": ann_id, "record_id": record_id, "quote": quote, "note_md": note_md}), 201


@bp.route("/<int:ann_id>", methods=["PUT"])
def update_annotation(ann_id: int):
    """更新批注"""
    data = request.get_json()
    quote = data.get("quote", "").strip()
    note_md = data.get("note_md", "").strip()

    if not note_md:
        return jsonify({"error": "note_md required"}), 400

    with get_conn() as conn:
        conn.execute(
            "UPDATE annotation SET quote = ?, note_md = ?, updated_at = ? WHERE id = ?",
            (quote, note_md, now_ts(), ann_id),
        )
    return jsonify({"success": True})


@bp.route("/<int:ann_id>", methods=["DELETE"])
def delete_annotation(ann_id: int):
    """删除批注"""
    with get_conn() as conn:
        conn.execute("DELETE FROM annotation WHERE id = ?", (ann_id,))
    return jsonify({"success": True})