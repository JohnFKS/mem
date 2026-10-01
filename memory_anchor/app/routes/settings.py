"""设置中心: 主题/快捷键/FSRS参数/提醒"""
import json
from flask import Blueprint, request, jsonify

from app.db import get_all_settings, set_setting
from app.fsrs import fsrs, DEFAULT_WEIGHTS, FSRS5

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.route("", methods=["GET"])
def get_settings():
    return jsonify(get_all_settings())


@bp.route("", methods=["PUT"])
def update_settings():
    data = request.get_json(force=True) or {}
    # 白名单字段
    allowed = {
        "theme", "request_retention", "fsrs_weights",
        "shortcut_new", "shortcut_review", "shortcut_search",
        "auto_backup", "backup_interval_days",
        "daily_target_new", "daily_target_review",
        "quiet_hours_start", "quiet_hours_end",
        # AI 可选增强 (见 app/ai.py): 三个键均非空才算已配置
        "ai_base_url", "ai_api_key", "ai_model",
    }
    for k, v in data.items():
        if k in allowed:
            set_setting(k, v)
    # 应用 request_retention 到 fsrs 单例
    if "request_retention" in data:
        try:
            fsrs.REQUEST_RETENTION = float(data["request_retention"])
        except (ValueError, TypeError):
            pass
    if "fsrs_weights" in data:
        try:
            fsrs.w = tuple(data["fsrs_weights"])
        except (ValueError, TypeError):
            pass
    return jsonify(get_all_settings())


@bp.route("/reset_fsrs", methods=["POST"])
def reset_fsrs():
    """重置 FSRS 参数为默认值"""
    set_setting("request_retention", 0.9)
    set_setting("fsrs_weights", list(DEFAULT_WEIGHTS))
    fsrs.REQUEST_RETENTION = 0.9
    fsrs.w = DEFAULT_WEIGHTS
    return jsonify({"ok": True})
