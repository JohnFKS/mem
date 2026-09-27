"""
FSRS-5 间隔重复算法核心实现
基于 Free Spaced Repetition Scheduler v5 标准
论文参考: https://github.com/open-spaced-repetition/fsrs4anki/wiki

简化为 3 档评分:
  - "again"   完全忘记 (rating=1)
  - "hard"    记忆模糊 (rating=2)
  - "easy"    熟练掌握 (rating=4)

记忆状态机:
  - New       新卡片, 未学习
  - Learning  学习阶段 (短间隔)
  - Review    复习阶段 (长间隔)
  - Relearning 重学阶段 (遗忘后)
"""

import math
import time
from dataclasses import dataclass, field, asdict
from typing import Literal, Optional
from datetime import datetime, timezone, timedelta

# 评分类型
Rating = Literal["again", "hard", "easy"]
STATE = Literal["new", "learning", "review", "relearning"]

# FSRS-5 默认 19 个权重 (w[0..18])
# 前 8 个: 初始稳定性 (4 个评分对应 4 个状态)
# w[8]:   初始难度偏移
# w[9..17]: 难度与稳定性更新参数
# w[18]:  短间隔到长间隔的转换阈值 (默认 1 天内的复习算 learning)
DEFAULT_WEIGHTS = (
    0.4072, 1.1829, 3.1262, 15.4742,
    7.2102, 0.5316, 1.0651, 0.0234,
    1.6160,
    0.1544, 1.0736, 1.8455, 0.4850, 0.6443,
    0.0, 1.0532, 0.8288, 0.1558,
    0.5 * 60 * 24,  # ~ 1 day in minutes? 实际 FSRS 用秒数: 86400/2
)


@dataclass
class SchedulingState:
    """排程状态: 算法对一个卡片在某次评分后产生的下一步状态"""
    memory_state: Optional["MemoryState"]  # None 表示新卡
    reviewed_at: float  # unix timestamp
    due: float  # unix timestamp
    elapsed_days: int = 0
    scheduled_days: int = 0


@dataclass
class MemoryState:
    """FSRS 记忆状态: 稳定性 + 难度"""
    stability: float
    difficulty: float
    last_review: float = 0.0  # unix ts

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> Optional["MemoryState"]:
        if not d:
            return None
        return cls(
            stability=float(d.get("stability", 1.0)),
            difficulty=float(d.get("difficulty", 5.0)),
            last_review=float(d.get("last_review", 0.0)),
        )


class FSRS5:
    """FSRS-5 算法引擎

    对外暴露 4 个核心方法:
      - new_card_state()           新卡片初始状态
      - schedule(card, rating, now) 根据评分排程, 返回新的 SchedulingState
      - retrievability(card, now)  当前保留率
      - reset()                    重置为默认权重
    """

    REQUEST_RETENTION = 0.9   # 目标保留率 90%
    MAX_INTERVAL = 36500       # 最大间隔 (天), 约 100 年
    FACTOR = 19.0 / 81.0
    DECAY = -0.5

    def __init__(self, weights: tuple = DEFAULT_WEIGHTS, request_retention: float = None):
        self.w = tuple(weights)
        if request_retention is not None:
            self.REQUEST_RETENTION = request_retention

    # -------------------- 基础数学 --------------------
    def _init_stability(self, rating: int) -> float:
        """新卡初始稳定性 (rating: 1..4)"""
        idx = max(0, min(3, rating - 1))
        return max(self.w[idx], 0.1)

    def _init_difficulty(self, rating: int) -> float:
        """新卡初始难度 (rating: 1..4)"""
        # D0(G) = w[8] - (G-3) * w[9], 限制在 [1, 10]
        d = self.w[8] - (rating - 3) * self.w[9]
        return min(max(d, 1.0), 10.0)

    def _next_difficulty(self, d: float, rating: int) -> float:
        """更新难度: 向均值 5.0 软回归"""
        next_d = d - self.w[9] * (rating - 3)
        # 均值回归
        next_d = self._mean_reversion(self.w[8], next_d)
        return min(max(next_d, 1.0), 10.0)

    def _mean_reversion(self, init: float, current: float) -> float:
        return self.w[10] * init + (1 - self.w[10]) * current

    def _next_recall_stability(self, d: float, s: float, r: float, rating: int) -> float:
        """复习阶段稳定性更新"""
        if rating == 2:  # hard
            hard_penalty = self.w[15]
            easy_bonus = 1.0
        elif rating == 4:  # easy
            hard_penalty = 1.0
            easy_bonus = self.w[16]
        else:  # good (3) — 我们只用 1/2/4, 但保留兼容
            hard_penalty = 1.0
            easy_bonus = 1.0

        # 稳定性增量公式
        # S' = S * (1 + exp(w[11]) * (11 - D) * S^(-w[12]) * (exp((1-R) * w[13]) - 1) * hard_penalty * easy_bonus)
        # 上限: S * w[14] (防止遗忘时过分衰减)
        con = self._next_difficulty(d, rating) if rating == 1 else d
        if rating == 1:  # again - 稳定性下降
            return max(self._next_forget_stability(d, s, r), 0.1)
        return max(
            s * (1 + math.exp(self.w[11]) * (11 - con) * (s ** (-self.w[12]))
                 * (math.exp((1 - r) * self.w[13]) - 1) * hard_penalty * easy_bonus),
            s,  # 不允许下降 (除非 again)
        )

    def _next_forget_stability(self, d: float, s: float, r: float) -> float:
        """遗忘后 (again) 的新稳定性"""
        return self.w[11] * (d ** (-self.w[12])) * ((s + 1) ** self.w[13] - 1) * math.exp((1 - r) * self.w[14])

    def _next_short_term_stability(self, s: float, rating: int) -> float:
        """learning / relearning 阶段短间隔稳定性"""
        # 简化: 用初始稳定性作为基线
        return max(s * (0.5 if rating == 1 else 1.0 if rating == 2 else 1.3), 0.1)

    # -------------------- 保留率 --------------------
    def retrievability(self, state: MemoryState, now: float) -> float:
        """计算当前保留率 (0..1)

        R(t) = (1 + t / (9 * S))^(-1)   FSRS-5 通用遗忘曲线
        """
        if state is None or state.last_review == 0:
            return 0.0
        elapsed_days = max((now - state.last_review) / 86400.0, 0.0)
        # FSRS-5 用幂函数遗忘曲线
        decay = self.DECAY
        factor = self.FACTOR
        return (1 + factor * elapsed_days / max(state.stability, 0.1)) ** decay

    # -------------------- 间隔计算 --------------------
    def _next_interval(self, s: float) -> int:
        """根据目标保留率计算下次间隔 (天)"""
        # I = (9 * S * (1/R^(1/DECAY) - 1))  (FSRS-5 反推)
        if s <= 0:
            return 1
        # 反推: R = (1 + FACTOR * t/S)^DECAY  =>  t = S * (R^(1/DECAY) - 1) / FACTOR
        try:
            t = s * (self.REQUEST_RETENTION ** (1.0 / self.DECAY) - 1) / self.FACTOR
        except (ValueError, ZeroDivisionError):
            t = s
        return max(int(round(t)), 1)

    # -------------------- 主入口 --------------------
    def schedule(self, state: Optional[MemoryState], rating: int, now: float,
                 elapsed_days: int = 0) -> SchedulingState:
        """对一张卡片评分, 返回下一步排程

        rating: 1=again, 2=hard, 3=good, 4=easy  (本系统用 1/2/4)
        """
        # 映射评分到内部 1..4
        r = max(1, min(4, rating))

        if state is None or state.last_review == 0:
            # ---------- 新卡 ----------
            new_stability = self._init_stability(r)
            new_difficulty = self._init_difficulty(r)
            new_state = MemoryState(
                stability=new_stability,
                difficulty=new_difficulty,
                last_review=now,
            )
            # 新卡首次评分使用 short interval (learning 阶段)
            # again -> 1 分钟, hard -> 5 分钟, easy -> 4 天
            if r == 1:
                due = now + 60
            elif r == 2:
                due = now + 5 * 60
            elif r == 3:
                due = now + 10 * 60
            else:  # easy
                days = max(self._next_interval(new_stability), 4)
                due = now + days * 86400
            return SchedulingState(
                memory_state=new_state,
                reviewed_at=now,
                due=due,
                elapsed_days=0,
                scheduled_days=max(int((due - now) / 86400), 0),
            )

        # ---------- 已学过的卡 ----------
        r_current = self.retrievability(state, now)
        new_difficulty = self._next_difficulty(state.difficulty, r)
        new_stability = self._next_recall_stability(state.difficulty, state.stability, r_current, r)
        new_state = MemoryState(
            stability=new_stability,
            difficulty=new_difficulty,
            last_review=now,
        )

        if r == 1:
            # again -> 重学, 短间隔 10 分钟
            due = now + 10 * 60
        else:
            days = self._next_interval(new_stability)
            days = min(days, self.MAX_INTERVAL)
            due = now + days * 86400

        return SchedulingState(
            memory_state=new_state,
            reviewed_at=now,
            due=due,
            elapsed_days=elapsed_days,
            scheduled_days=max(int((due - now) / 86400), 0),
        )

    # -------------------- 便利方法 --------------------
    def rating_to_int(self, rating: str) -> int:
        return {"again": 1, "hard": 2, "good": 3, "easy": 4}.get(rating, 3)

    def rating_label(self, rating: int) -> str:
        return {1: "完全忘记", 2: "记忆模糊", 3: "一般", 4: "熟练掌握"}.get(rating, "未知")


# 单例
fsrs = FSRS5()
