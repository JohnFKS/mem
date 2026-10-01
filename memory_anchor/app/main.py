"""Memory Anchor - Flask 主应用入口"""
import os
import sys
import time
import atexit
from pathlib import Path
from flask import Flask, render_template, jsonify, request, send_from_directory

from app.db import init_db, get_all_settings, get_setting, UPLOAD_DIR
from app.fsrs import fsrs, DEFAULT_WEIGHTS

# 初始化数据库
init_db()

# 应用 fsrs 设置
try:
    rr = float(get_setting("request_retention", 0.9))
    fsrs.REQUEST_RETENTION = rr
except Exception:
    pass
try:
    w = get_setting("fsrs_weights", None)
    if w and isinstance(w, list) and len(w) == len(DEFAULT_WEIGHTS):
        fsrs.w = tuple(w)
except Exception:
    pass

app = Flask(
    __name__,
    static_folder=str(Path(__file__).resolve().parent.parent / "static"),
    template_folder=str(Path(__file__).resolve().parent.parent / "templates"),
)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB 单次请求上限

# 注册蓝图
from app.routes.records import bp as records_bp
from app.routes.review import bp as review_bp
from app.routes.stats import bp as stats_bp
from app.routes.settings import bp as settings_bp
from app.routes.backup import bp as backup_bp
from app.routes.ai import bp as ai_bp

app.register_blueprint(records_bp)
app.register_blueprint(review_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(backup_bp)
app.register_blueprint(ai_bp)


# ---------------- 页面路由 ----------------
@app.route("/")
def index():
    return render_template("index.html", active_tab="records")


@app.route("/review")
def review_page():
    return render_template("index.html", active_tab="review")


@app.route("/stats")
def stats_page():
    return render_template("index.html", active_tab="stats")


@app.route("/settings")
def settings_page():
    return render_template("index.html", active_tab="settings")


# ---------------- 静态文件 ----------------
@app.route("/static/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(str(UPLOAD_DIR), filename)


# ---------------- 启动钩子: 检查自动备份 ----------------
@app.before_request
def _maybe_auto_backup():
    """每个进程只检查一次 (用全局标志)"""
    if getattr(app, "_auto_backup_checked", False):
        return
    app._auto_backup_checked = True
    try:
        auto = get_setting("auto_backup", False)
        if not auto:
            return
        interval_days = int(get_setting("backup_interval_days", 7))
        last = float(get_setting("last_backup_time", 0))
        if last > 0 and (time.time() - last) < interval_days * 86400:
            return
        # 触发自动备份 (复用 backup 模块逻辑)
        from app.routes.backup import auto_backup_check
        with app.test_request_context("/api/backup/auto", method="POST"):
            auto_backup_check()
    except Exception as e:
        print(f"[auto_backup] failed: {e}", file=sys.stderr)


# ---------------- CORS (内网/本机, 暂不做鉴权) ----------------
# 思源笔记界面跑在 127.0.0.1:6806, 插件 fetch 到记忆锚是跨域请求, 需要放行。
# 部署定位为内网, 故 Origin 全放行; 公网化时必须改成白名单, 见 TODO.md 暂缓区。
@app.after_request
def _add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return resp


@app.route("/<path:p>", methods=["OPTIONS"])
def _cors_preflight(p):
    """统一处理 OPTIONS 预检"""
    return ("", 204)


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "payload too large (max 50MB)"}), 413


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return render_template("index.html", active_tab="records"), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "internal server error", "detail": str(e)}), 500


# ---------------- 入口 ----------------
if __name__ == "__main__":
    # 启动参数: 默认 127.0.0.1:7788
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "7788"))
    debug = os.environ.get("DEBUG", "0") == "1"
    print(f"""
╔══════════════════════════════════════════════════╗
║   Memory Anchor · 记忆锚                        ║
║   极简桌面学习记忆工具                          ║
║                                                  ║
║   访问地址: http://{host}:{port}                 ║
║   数据目录: {Path(__file__).resolve().parent.parent / 'data'}
║   关闭服务: Ctrl + C                             ║
╚════════════════════════════════════════════════╝
""")
    app.run(host=host, port=port, debug=debug, threaded=True)
