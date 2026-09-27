"""Memory Anchor - 演示数据填充脚本
用法: python3 seed_demo.py
会向空数据库添加 12 张示例卡片, 涵盖不同主题/状态/FSRS 阶段,
方便用户首次启动后立即体验复习流程。
"""
import sys
import time
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.db import init_db, get_conn
from app.fsrs import fsrs, MemoryState
from app.utils import now_ts, today_iso


SAMPLE_CARDS = [
    # (title, tags, content_md, note)
    ("Python 装饰器本质",
     ["Python", "进阶"],
     """# 装饰器

装饰器是**接受函数返回函数**的高阶函数, 本质: `hello = log(hello)`。

## 标准模板

```python
from functools import wraps

def log(func):
    @wraps(func)
    def wrapper(*args, **kw):
        print(f"calling {func.__name__}")
        return func(*args, **kw)
    return wrapper

@log
def hello():
    print("hi")
```

## 关键点

- `@wraps(func)` 保留原函数元信息 (`__name__`, `__doc__`)
- `*args, **kw` 兼容任意签名
- 装饰器可以叠加: `@log @timer @cache`""",
     "重点是闭包和 *args/**kw"),

    ("二分查找边界条件",
     ["算法", "二分"],
     """# 二分查找

## 三种边界写法

### 1. 标准左闭右闭 [l, r]
```python
def bs(arr, target):
    l, r = 0, len(arr) - 1
    while l <= r:
        mid = (l + r) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            l = mid + 1
        else:
            r = mid - 1
    return -1
```

### 2. 找左边界 (第一个 >= target)
- 循环条件 `l < r`
- `r = mid` 而不是 `mid - 1`

### 3. 找右边界 (最后一个 <= target)
- `l = mid + 1`, `r = mid`

## 易错点

- 整数溢出: `mid = l + (r - l) // 2`
- 死循环: 检查 `l = mid` 还是 `l = mid + 1`""",
     "三种边界写法要分清"),

    ("HTTP 状态码 301 vs 302",
     ["网络", "HTTP"],
     """# 301 vs 302

| 状态码 | 含义 | 是否缓存 | SEO 影响 |
|--------|------|---------|---------|
| 301 | 永久重定向 | 浏览器永久缓存 | PageRank 转移到新 URL |
| 302 | 临时重定向 | 不缓存 | 保留原 URL 权重 |

## 使用场景

- **301**: 域名迁移、HTTP → HTTPS、URL 规范化
- **302**: A/B 测试、临时维护页、按地域跳转

## 相关状态码

- 307: 临时重定向, **保留 HTTP 方法** (302 可能 POST → GET)
- 308: 永久重定向, 保留方法""",
     ""),

    ("Git rebase 和 merge 区别",
     ["Git", "协作"],
     """# rebase vs merge

## merge (保留历史)
```
A---B---C feature
   /
*---D---E---F main
       \\
        M merge commit
```

## rebase (线性历史)
```
A'---B'---C' feature (基于 main 重放)
       /
*---D---E---F main
```

## 选择原则

- 公共分支 (main/develop): 用 merge, 保留真实历史
- 个人 feature 分支: 用 rebase, 保持线性整洁
- **黄金法则**: 不要 rebase 已经推送到远程的公共分支""",
     "黄金法则: 不 rebase 公共分支"),

    ("SQL JOIN 类型一览",
     ["SQL", "数据库"],
     """# SQL JOIN

## 四种 JOIN

```sql
-- INNER JOIN: 两表都有的
SELECT * FROM A INNER JOIN B ON A.id = B.aid;

-- LEFT JOIN: 左表全部 + 右表匹配
SELECT * FROM A LEFT JOIN B ON A.id = B.aid;

-- RIGHT JOIN: 右表全部 + 左表匹配
SELECT * FROM A RIGHT JOIN B ON A.id = B.aid;

-- FULL OUTER JOIN: 两表并集
SELECT * FROM A FULL OUTER JOIN B ON A.id = B.aid;
```

## 文氏图记忆

- INNER = 交集
- LEFT = 左圆 + 交集
- RIGHT = 右圆 + 交集
- FULL = 并集""",
     ""),

    ("快速排序实现",
     ["算法", "排序"],
     """# 快速排序

## Lomuto 分区 (简单版)

```python
def quicksort(arr, l, r):
    if l >= r:
        return
    pivot = arr[r]
    i = l
    for j in range(l, r):
        if arr[j] < pivot:
            arr[i], arr[j] = arr[j], arr[i]
            i += 1
    arr[i], arr[r] = arr[r], arr[i]
    quicksort(arr, l, i - 1)
    quicksort(arr, i + 1, r)
```

## 复杂度

- 平均: O(n log n)
- 最坏: O(n²) (已排序数组 + 取末尾 pivot)
- 空间: O(log n) 递归栈

## 优化

- 随机 pivot 避免最坏情况
- 三数取中 (首/中/末的中位数)
- 小数组切换到插入排序 (n < 10)""",
     ""),

    ("React useEffect 依赖数组",
     ["React", "前端"],
     """# useEffect 依赖

## 三种形式

```jsx
// 1. 每次渲染都执行
useEffect(() => { ... });

// 2. 仅首次挂载执行
useEffect(() => { ... }, []);

// 3. 依赖变化时执行
useEffect(() => { ... }, [dep1, dep2]);
```

## 清理函数

```jsx
useEffect(() => {
  const id = setInterval(() => ...);
  return () => clearInterval(id);  // 清理
}, []);
```

## 易错点

- 依赖数组遗漏 → 闭包陈旧值
- 对象/数组作为依赖 → 每次都是新引用, 死循环
- 解法: 用 `useMemo` / `useCallback` 稳定引用""",
     "依赖数组遗漏会导致闭包陈旧值"),

    ("Docker 镜像分层原理",
     ["Docker", "DevOps"],
     """# Docker 镜像分层

## 分层结构

每个 `RUN`, `COPY`, `ADD` 指令创建一个新层, 上层依赖下层。

```
Layer 5: CMD ["python", "app.py"]      ← 容器启动层
Layer 4: COPY . /app                    ← 应用代码
Layer 3: RUN pip install -r req.txt     ← 依赖
Layer 2: WORKDIR /app
Layer 1: FROM python:3.12-slim          ← 基础镜像
```

## 缓存优化

- 把**变化少**的层放前面 (依赖安装)
- 把**变化多**的层放后面 (代码复制)
- `docker layer cache` 命中规则: 上层未变才复用

## 多阶段构建

```dockerfile
FROM node:20 AS build
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /dist /usr/share/nginx/html
```

最终镜像只包含 nginx + dist, 体积小很多。""",
     ""),

    ("TCP 三次握手",
     ["网络", "TCP"],
     """# TCP 三次握手

## 流程

```
Client                              Server
  |                                   |
  | ---- SYN, seq=x ----------------> |  (1) 客户端发起
  |                                   |
  | <--- SYN+ACK, seq=y, ack=x+1 ---- |  (2) 服务端确认+发起
  |                                   |
  | ---- ACK, ack=y+1 --------------> |  (3) 客户端确认
  |                                   |
  | <===== 数据双向传输 ============> |
```

## 为什么是三次?

- **两次不够**: 服务端无法确认客户端的接收能力, 可能建立死连接
- **四次多余**: SYN+ACK 可以合并, 不需要分两次发

## 状态变迁

- 客户端: CLOSED → SYN_SENT → ESTABLISHED
- 服务端: LISTEN → SYN_RCVD → ESTABLISHED""",
     "三次握手保证双方收发能力都被确认"),

    ("Python GIL 全局解释器锁",
     ["Python", "并发"],
     """# GIL (Global Interpreter Lock)

## 是什么

CPython 解释器中的一把互斥锁, **同一进程内任一时刻只有一个线程执行 Python 字节码**。

## 为什么需要

- 保护引用计数 (PyObject 内部 `ob_refcnt`)
- 简化 C 扩展开发

## 影响

- CPU 密集型多线程**无法多核并行** (反而因切换更慢)
- IO 密集型多线程**仍有效** (IO 时释放 GIL)

## 解决方案

| 场景 | 方案 |
|------|------|
| CPU 密集 | `multiprocessing` 多进程 |
| IO 密集 | `threading` / `asyncio` |
| C 扩展 | 释放 GIL (`Py_BEGIN_ALLOW_THREADS`) |

## Python 3.13+ 实验性 No-GIL

PEP 703 提议移除 GIL, 3.13 已有实验性构建版本。""",
     ""),

    ("Bash 常用快捷键",
     ["Linux", "Shell"],
     """# Bash 快捷键

## 光标移动

- `Ctrl+A`: 行首
- `Ctrl+E`: 行尾
- `Ctrl+W`: 删除光标前一个单词
- `Ctrl+U`: 删除光标前到行首
- `Ctrl+K`: 删除光标到行尾
- `Ctrl+Y`: 粘贴上述删除的内容

## 历史

- `Ctrl+R`: 反向搜索历史
- `Ctrl+P` / `Ctrl+N`: 上一条 / 下一条
- `!!`: 上一条命令 (`sudo !!`)
- `!$`: 上一条命令的最后一个参数

## 进程控制

- `Ctrl+Z`: 挂起到后台 (`fg` / `bg` 恢复)
- `Ctrl+D`: EOF (退出 shell)
- `Ctrl+L`: 清屏""",
     ""),

    ("FSRS-5 vs SM-2",
     ["记忆法", "FSRS"],
     """# FSRS-5 vs SM-2

## SM-2 (Anki 老算法)

- 1985 年提出, 固定公式: `I(n) = I(n-1) * EF`
- EF (Easiness Factor) 根据评分调整: 1.3 ~ 2.5
- 4 档评分: Again / Hard / Good / Easy

## FSRS-5 (2024)

- 基于 5 亿条复习数据训练
- 19 个权重参数
- **目标保留率**可调 (默认 90%)
- 引入**记忆稳定性 S** 和**难度 D** 独立建模
- 幂函数遗忘曲线: `R = (1 + t/(9S))^(-0.5)`

## 实测效果

| 算法 | 同样保留率下复习次数 | 难卡处理 |
|------|---------------------|---------|
| SM-2 | 100% (基准) | 间隔容易过长 |
| FSRS-5 | **-31%** | 难度独立建模, 自动缩短间隔 |

## 适用场景

- 通用记忆: FSRS-5 默认参数即可
- 进阶: 收集 1000+ 自己的复习记录后用 FSRS optimizer 个性化训练""",
     ""),
]


def seed():
    init_db()
    now = now_ts()
    today = today_iso()
    # 检查是否已有数据
    with get_conn() as conn:
        cnt = conn.execute("SELECT COUNT(*) AS c FROM study_record").fetchone()["c"]
        if cnt > 0:
            print(f"数据库已有 {cnt} 条记录, 跳过填充。如需重新填充请先清空 data/ 目录。")
            return

    # 插入卡片
    created_ids = []
    with get_conn() as conn:
        for i, (title, tags, content, note) in enumerate(SAMPLE_CARDS):
            # 让部分卡片已经处于不同 FSRS 状态, 方便演示
            if i < 4:
                # 4 张为 new 状态, due=now
                state, stability, difficulty, last_review, due = "new", 0, 0, 0, now
            elif i < 8:
                # 4 张为 review 状态, 2 张已到期 2 张未到期
                if i < 6:
                    due = now - 86400  # 1 天前到期
                else:
                    due = now + 3 * 86400  # 3 天后到期
                state = "review"
                stability = 5.0 + i
                difficulty = 5.0
                last_review = now - 7 * 86400
            else:
                # 4 张为 relearning 状态 (最近遗忘)
                state = "relearning"
                stability = 0.5
                difficulty = 8.0
                last_review = now - 3600
                due = now - 1800  # 半小时前到期

            cur = conn.execute(
                """INSERT INTO study_record
                (title, tags, content_md, image_paths, learn_date, note,
                 state, stability, difficulty, reps, lapses, last_review, due,
                 priority, pinned, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    title, json.dumps(tags, ensure_ascii=False), content, "[]",
                    today, note, state, stability, difficulty,
                    i,  # reps
                    1 if state == "relearning" else 0,  # lapses
                    last_review, due,
                    0, 0, now, now,
                ),
            )
            created_ids.append(cur.lastrowid)

            # 为 review/relearning 状态的卡片添加历史复习日志
            if state != "new":
                for r in range(1, 4):
                    review_time = last_review - r * 86400
                    rating = 4 if r % 2 == 1 else 2
                    conn.execute(
                        """INSERT INTO review_log
                        (record_id, rating, reviewed_at, elapsed_days, scheduled_days,
                         retention, state_before, state_after,
                         stability_before, stability_after,
                         difficulty_before, difficulty_after)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (
                            cur.lastrowid, rating, review_time, r, r + 1,
                            0.85, "review", "review",
                            stability - r, stability - r + 1,
                            difficulty - 0.1 * r, difficulty,
                        ),
                    )

    print(f"✅ 已填充 {len(created_ids)} 张演示卡片")
    print(f"   其中: 4 张 new (待首次学习)")
    print(f"        4 张 review (2 已到期, 2 未到期)")
    print(f"        4 张 relearning (遗忘后待重学)")
    print()
    print("现在启动应用即可看到完整演示:")
    print("  python3 run.py")
    print("  然后访问 http://127.0.0.1:7788")


if __name__ == "__main__":
    seed()
