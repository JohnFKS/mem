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

    print(f"""
╔══════════════════════════════════════════════════╗
║   Memory Anchor · 记忆锚                        ║
║   极简桌面学习记忆工具                          ║
║                                                  ║
║   访问地址: http://{args.host}:{args.port}       ║
║   数据目录: {Path(__file__).resolve().parent / 'data'}
║   关闭服务: Ctrl + C                             ║
╚══════════════════════════════════════════════════╝
""")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)


if __name__ == "__main__":
    main()
