"""
SQLite 数据库初始化与连接管理
4 张核心表: StudyRecord, ReviewLog, Settings, BackupLog
"""

import os
import sqlite3
import json
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR = BASE_DIR / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DB_DIR / "memory_anchor.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row  # 返回 dict-like 行
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS study_record (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL DEFAULT '',
    tags            TEXT NOT NULL DEFAULT '[]',        -- JSON array
    content_md      TEXT NOT NULL DEFAULT '',          -- markdown 正文
    image_paths     TEXT NOT NULL DEFAULT '[]',        -- JSON array of relative paths
    learn_date      TEXT NOT NULL,                     -- ISO date 'YYYY-MM-DD'
    note            TEXT NOT NULL DEFAULT '',
    -- FSRS 状态
    state           TEXT NOT NULL DEFAULT 'new',       -- new / learning / review / relearning
    stability       REAL NOT NULL DEFAULT 0,
    difficulty      REAL NOT NULL DEFAULT 0,
    reps            INTEGER NOT NULL DEFAULT 0,
    lapses          INTEGER NOT NULL DEFAULT 0,        -- 遗忘次数
    last_review     REAL NOT NULL DEFAULT 0,           -- unix ts
    due             REAL NOT NULL DEFAULT 0,           -- unix ts 下次到期
    -- 元信息
    priority        INTEGER NOT NULL DEFAULT 0,
    pinned          INTEGER NOT NULL DEFAULT 0,
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_due ON study_record(due);
CREATE INDEX IF NOT EXISTS idx_study_state ON study_record(state);
CREATE INDEX IF NOT EXISTS idx_study_pinned ON study_record(pinned);
CREATE INDEX IF NOT EXISTS idx_learn_date ON study_record(learn_date);

CREATE TABLE IF NOT EXISTS review_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id       INTEGER NOT NULL,
    rating          INTEGER NOT NULL,                  -- 1=again 2=hard 4=easy
    reviewed_at     REAL NOT NULL,                     -- unix ts
    elapsed_days    INTEGER NOT NULL DEFAULT 0,
    scheduled_days  INTEGER NOT NULL DEFAULT 0,
    retention       REAL NOT NULL DEFAULT 0,           -- 复习前保留率
    state_before    TEXT NOT NULL DEFAULT '',
    state_after     TEXT NOT NULL DEFAULT '',
    stability_before REAL NOT NULL DEFAULT 0,
    stability_after  REAL NOT NULL DEFAULT 0,
    difficulty_before REAL NOT NULL DEFAULT 0,
    difficulty_after  REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (record_id) REFERENCES study_record(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_review_record ON review_log(record_id);
CREATE INDEX IF NOT EXISTS idx_review_time ON review_log(reviewed_at);

CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL                      -- JSON-encoded value
);

CREATE TABLE IF NOT EXISTS backup_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    backup_time     REAL NOT NULL,
    backup_type     TEXT NOT NULL,                     -- auto / manual
    file_path       TEXT NOT NULL,
    file_size       INTEGER NOT NULL DEFAULT 0,
    note            TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS annotation (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id       INTEGER NOT NULL,
    quote           TEXT NOT NULL DEFAULT '',          -- 引用片段 (可空 = 整卡批注)
    note_md         TEXT NOT NULL DEFAULT '',          -- 批注笔记 (Markdown+公式)
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL,
    FOREIGN KEY (record_id) REFERENCES study_record(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_annotation_record ON annotation(record_id);
"""


DEFAULT_SETTINGS = {
    "theme": "light",                       # light / dark
    "request_retention": 0.9,
    "fsrs_weights": list(__import__("app.fsrs", fromlist=["DEFAULT_WEIGHTS"]).DEFAULT_WEIGHTS),
    "shortcut_new": "Ctrl+N",
    "shortcut_review": "Ctrl+R",
    "shortcut_search": "Ctrl+K",
    "auto_backup": True,
    "backup_interval_days": 7,
    "last_backup_time": 0,
    "daily_target_new": 10,
    "daily_target_review": 50,
    "quiet_hours_start": "23:00",
    "quiet_hours_end": "07:00",
}


def init_db():
    """初始化数据库表 + 默认设置"""
    with get_conn() as conn:
        conn.executescript(SCHEMA_SQL)
        # 写入默认设置 (只在不存在时写入)
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)",
                (k, json.dumps(v)),
            )
    return True


def get_setting(key: str, default=None):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        if row is None:
            return default
        try:
            return json.loads(row["value"])
        except (ValueError, TypeError):
            return row["value"]


def set_setting(key: str, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value)),
        )
    return True


def get_all_settings() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    out = dict(DEFAULT_SETTINGS)
    for r in rows:
        try:
            out[r["key"]] = json.loads(r["value"])
        except (ValueError, TypeError):
            out[r["key"]] = r["value"]
    return out
