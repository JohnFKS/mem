"""Memory Anchor 启动入口
用法: python3 run.py [--port 7788] [--host 127.0.0.1] [--debug]
"""
import argparse
import os
import sys
from pathlib import Path

# 把当前目录加入 sys.path, 让 `app` 包可被导入
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import app
from app.db import init_db

init_db()


def main():
    parser = argparse.ArgumentParser(description="Memory Anchor - 极简桌面学习记忆工具")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址 (默认 127.0.0.1)")
    parser.add_argument("--port", type=int, default=7788, help="端口 (默认 7788)")
    parser.add_argument("--debug", action="store_true", help="调试模式")
    args = parser.parse_args()

    # 兼容发布/部署场景: 尊重 PORT 环境变量, 并监听 0.0.0.0 以便反向代理可达
    port = int(os.environ.get("PORT", args.port))
    host = os.environ.get("HOST") or args.host
    if "PORT" in os.environ and host == "127.0.0.1":
        host = "0.0.0.0"

    print(f"""
╔══════════════════════════════════════════════════╗
║   Memory Anchor · 记忆锚                        ║
║   极简桌面学习记忆工具                          ║
║                                                  ║
║   访问地址: http://{host}:{port}                 ║
║   数据目录: {Path(__file__).resolve().parent / 'data'}
║   关闭服务: Ctrl + C                             ║
╚════════════════════════════════════════════════╝
""")
    app.run(host=host, port=port, debug=args.debug, threaded=True)


if __name__ == "__main__":
    main()
