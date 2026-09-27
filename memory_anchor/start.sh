#!/usr/bin/env bash
# Memory Anchor - Linux/macOS 启动脚本
# 用法:
#   ./start.sh            默认启动 http://127.0.0.1:7788
#   ./start.sh 8080       指定端口
#   ./start.sh 8080 0.0.0.0  指定端口和监听地址(局域网可访问)

set -e
cd "$(dirname "$0")"

PORT="${1:-7788}"
HOST="${2:-127.0.0.1}"

# 检查 Python
if ! command -v python3 &> /dev/null; then
  echo "错误: 未找到 python3, 请先安装 Python 3.10+"
  exit 1
fi

# 检查依赖, 缺失则自动安装
if ! python3 -c "import flask" &> /dev/null; then
  echo "首次启动, 安装依赖..."
  pip3 install -r requirements.txt
fi

# 启动
echo "================================================"
echo "  Memory Anchor · 记忆锚"
echo "  极简桌面学习记忆工具"
echo ""
echo "  访问地址: http://${HOST}:${PORT}"
echo "  关闭服务: Ctrl + C"
echo "================================================"
exec python3 run.py --host "$HOST" --port "$PORT"
