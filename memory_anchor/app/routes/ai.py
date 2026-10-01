"""AI 端点: 状态查询与标题生成

未配置 AI 时:
  GET  /api/ai/status -> configured=false
  POST /api/ai/title  -> 503 {"error": "...", "code": "ai_not_configured"}
前端据此不渲染任何 AI 入口 (见 TODO「AI 三态开关与自动回退」)。
"""
from flask import Blueprint, request, jsonify

from app.db import get_conn
from app.ai import (generate_title, gap_analysis, generate_mnemonic,
                    is_configured, ping, AIError)

bp = Blueprint("ai", __name__, url_prefix="/api/ai")


@bp.route("/status", methods=["GET"])
def status():
    """三态: configured / ping_ok(null=未检测) / message / detail。

    带 ?ping=1 时做一次连通测试, detail 里给出可直接排查的字段
    (请求 URL / 模型 / 耗时 / HTTP 状态 / 服务端原文 / 建议)。
    """
    if not is_configured():
        res = ping()          # 未配置时 ping() 会说明缺哪几项
        return jsonify({"configured": False, "ping_ok": None,
                        "message": res["message"], "detail": res["detail"]})
    if request.args.get("ping") != "1":
        return jsonify({"configured": True, "ping_ok": None,
                        "message": "已配置", "detail": {}})
    res = ping()
    msg = res["message"] if res["ok"] else f"已配置但连接失败：{res['message']}"
    return jsonify({"configured": True, "ping_ok": res["ok"],
                    "message": msg, "detail": res["detail"]})


@bp.route("/test", methods=["POST"])
def test():
    """连通测试, 可用表单里尚未保存的值覆盖。

    Body (全部可选): {"base_url": "...", "api_key": "...", "model": "..."}
    api_key 传空字符串表示"沿用已保存的"。返回值与 /status?ping=1 同构, 另加 detail。
    """
    data = request.get_json(force=True) or {}
    res = ping(
        base_url=data.get("base_url"),
        api_key=data.get("api_key") or None,   # 空串 = 不覆盖
        model=data.get("model") or None,
    )
    msg = res["message"] if res["ok"] else f"连接失败：{res['message']}"
    return jsonify({"configured": res["configured"], "ping_ok": res["ok"],
                    "message": msg, "detail": res["detail"]})


@bp.route("/title", methods=["POST"])
def title():
    """根据正文生成标题。"""
    data = request.get_json(force=True) or {}
    content = data.get("content_md") or ""
    if not content.strip():
        return jsonify({"error": "content_md required"}), 400
    if not is_configured():
        return jsonify({"error": "AI 未配置，功能已关闭",
                        "code": "ai_not_configured"}), 503
    try:
        t = generate_title(content)
    except AIError as e:
        return jsonify({"error": str(e), "detail": e.detail}), 502
    return jsonify({"title": t})


@bp.route("/gap", methods=["POST"])
def gap():
    """费曼复述对比分析。
    Body: {"record_id": 42, "user_summary": "我的复述…"}
    标准答案由服务端按 record_id 取, 不信任前端传入的原文 (见 TODO 禁区)。
    结果只返回给前端展示; 评分必须由人点, 禁止自动调 answer。
    """
    data = request.get_json(force=True) or {}
    rid = data.get("record_id")
    summary = (data.get("user_summary") or "").strip()
    if not rid:
        return jsonify({"error": "record_id required"}), 400
    if not summary:
        return jsonify({"error": "user_summary required"}), 400

    with get_conn() as conn:
        row = conn.execute(
            "SELECT content_md FROM study_record WHERE id = ?", (rid,)
        ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404

    if not is_configured():
        return jsonify({"error": "AI 未配置，功能已关闭",
                        "code": "ai_not_configured"}), 503
    try:
        result = gap_analysis(row["content_md"], summary)
    except AIError as e:
        return jsonify({"error": str(e), "detail": e.detail}), 502
    return jsonify(result)


@bp.route("/mnemonic", methods=["POST"])
def mnemonic():
    """为卡片生成速记（助记小技巧）。

    Body: {"record_id": 42}
    原文由服务端按 record_id 取, 不信任前端传入的内容。
    只返回文本, 是否保存由用户点「保存速记」决定 (不自动落库)。
    """
    data = request.get_json(force=True) or {}
    rid = data.get("record_id")
    if not rid:
        return jsonify({"error": "record_id required"}), 400

    with get_conn() as conn:
        row = conn.execute(
            "SELECT title, content_md FROM study_record WHERE id = ?", (rid,)
        ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    if not (row["content_md"] or "").strip():
        return jsonify({"error": "卡片正文为空，无法生成速记"}), 400

    if not is_configured():
        return jsonify({"error": "AI 未配置，功能已关闭",
                        "code": "ai_not_configured"}), 503
    try:
        text = generate_mnemonic(row["title"], row["content_md"])
    except AIError as e:
        return jsonify({"error": str(e), "detail": e.detail}), 502
    return jsonify({"content_md": text})
