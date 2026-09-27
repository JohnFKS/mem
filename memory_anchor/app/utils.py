"""通用工具函数"""
import os
import hashlib
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta

# 用户时区 (Etc/GMT-8 = UTC+8)
TZ = timezone(timedelta(hours=8))


def now_ts() -> float:
    """当前 Unix 时间戳 (秒)"""
    return time.time()


def today_iso() -> str:
    """今日 ISO 日期 YYYY-MM-DD (UTC+8)"""
    return datetime.now(TZ).strftime("%Y-%m-%d")


def ts_to_iso(ts: float) -> str:
    """Unix 时间戳 -> ISO 日期"""
    if not ts:
        return ""
    return datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d %H:%M")


def ts_to_date(ts: float) -> str:
    if not ts:
        return ""
    return datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d")


def days_between(ts1: float, ts2: float) -> int:
    """两个时间戳相差天数 (按 00:00 切分)"""
    if not ts1 or not ts2:
        return 0
    d1 = datetime.fromtimestamp(ts1, TZ).date()
    d2 = datetime.fromtimestamp(ts2, TZ).date()
    return abs((d2 - d1).days)


def save_uploaded_image(file_storage, upload_dir: Path) -> str:
    """保存上传图片, 返回相对 URL 路径 (static/uploads/xxx.png)"""
    # 用 hash + 时间戳 防止重名
    raw = file_storage.read()
    ext = os.path.splitext(file_storage.filename or "img.png")[1].lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"):
        ext = ".png"
    h = hashlib.md5(raw + str(time.time()).encode()).hexdigest()[:12]
    filename = f"{int(time.time())}_{h}{ext}"
    upload_dir.mkdir(parents=True, exist_ok=True)
    save_path = upload_dir / filename
    save_path.write_bytes(raw)
    return f"/static/uploads/{filename}"


def parse_tags_str(tags_str: str) -> list:
    """逗号或空格分隔的标签 -> 列表"""
    if not tags_str:
        return []
    parts = [t.strip() for t in tags_str.replace(",", " ").split() if t.strip()]
    return parts
