@echo off
REM Memory Anchor - Windows 启动脚本
REM 用法:
REM   start.bat                默认启动 http://127.0.0.1:7788
REM   start.bat 8080           指定端口
REM   start.bat 8080 0.0.0.0   指定端口和监听地址

setlocal
cd /d "%~dp0"

set PORT=%1
if "%PORT%"=="" set PORT=7788

set HOST=%2
if "%HOST%"=="" set HOST=127.0.0.1

REM 检查 Python
where python >nul 2>nul
if errorlevel 1 (
  echo 错误: 未找到 python, 请先安装 Python 3.10+ (https://www.python.org/downloads/)
  pause
  exit /b 1
)

REM 检查依赖
python -c "import flask" >nul 2>nul
if errorlevel 1 (
  echo 首次启动, 安装依赖...
  pip install -r requirements.txt
)

echo ================================================
echo   Memory Anchor - 记忆锚
echo   极简桌面学习记忆工具
echo.
echo   访问地址: http://%HOST%:%PORT%
echo   关闭服务: Ctrl + C
echo ================================================

python run.py --host %HOST% --port %PORT%
pause
