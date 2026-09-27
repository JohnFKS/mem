/* Memory Anchor - 复习中心 Tab */

const ReviewTab = {
  state: {
    queue: [],
    currentIndex: 0,
    sessionStats: { reviewed: 0, again: 0, hard: 0, easy: 0 },
    showAnswer: false,
    preview: null,
    sessionStart: Date.now(),
    jumpTarget: null,
  },

  async render() {
    const tab = document.getElementById('tab-review');
    tab.innerHTML = `
      <div class="grid lg:grid-cols-[1fr_280px] gap-4">
        <div id="reviewMain">
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 min-h-[480px] flex flex-col items-center justify-center text-center" id="reviewCardWrap">
            <div class="text-slate-400">
              <svg class="w-16 h-16 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12a9 9 0 1 0 9-9M3 4v5h5"/></svg>
              <p class="text-sm">加载中...</p>
            </div>
          </div>
        </div>
        <div id="reviewSidebar" class="space-y-3">
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 14l4-4 4 4 5-5"/></svg>
              本次会话
            </h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="bg-slate-50 dark:bg-slate-900/30 rounded p-2">
                <div class="text-xs text-slate-400">已复习</div>
                <div class="text-xl font-bold text-brand-600" id="statReviewed">0</div>
              </div>
              <div class="bg-slate-50 dark:bg-slate-900/30 rounded p-2">
                <div class="text-xs text-slate-400">用时</div>
                <div class="text-xl font-bold" id="statTime">0:00</div>
              </div>
              <div class="bg-slate-50 dark:bg-slate-900/30 rounded p-2">
                <div class="text-xs text-slate-400">忘记</div>
                <div class="text-xl font-bold text-red-500" id="statAgain">0</div>
              </div>
              <div class="bg-slate-50 dark:bg-slate-900/30 rounded p-2">
                <div class="text-xs text-slate-400">熟练</div>
                <div class="text-xl font-bold text-emerald-500" id="statEasy">0</div>
              </div>
            </div>
            <button id="endSessionBtn" class="btn btn-outline w-full mt-3 text-xs">结束会话</button>
          </div>
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">队列概况</h3>
            <div class="space-y-1.5 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">队列剩余</span><span id="queueRemaining" class="font-medium">0</span></div>
              <div class="flex justify-between"><span class="text-slate-500">总待复习</span><span id="totalDue" class="font-medium">0</span></div>
              <div class="flex justify-between"><span class="text-slate-500">新卡片</span><span id="totalNew" class="font-medium">0</span></div>
              <div class="flex justify-between"><span class="text-slate-500">今日已复习</span><span id="reviewedToday" class="font-medium">0</span></div>
            </div>
            <div class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full mt-3 overflow-hidden">
              <div id="queueProgress" class="h-full bg-brand-500 transition-all" style="width: 0%"></div>
            </div>
          </div>
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs space-y-1.5">
            <div class="font-semibold text-sm mb-2">键盘快捷键</div>
            <div class="flex justify-between"><span class="text-slate-500">显示答案</span><kbd class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">Space</kbd></div>
            <div class="flex justify-between"><span class="text-slate-500">完全忘记</span><kbd class="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 rounded">1</kbd></div>
            <div class="flex justify-between"><span class="text-slate-500">记忆模糊</span><kbd class="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded">2</kbd></div>
            <div class="flex justify-between"><span class="text-slate-500">熟练掌握</span><kbd class="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded">3</kbd></div>
            <div class="flex justify-between"><span class="text-slate-500">跳过</span><kbd class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">→</kbd></div>
          </div>
        </div>
      </div>
    `;
    await this.loadQueue();
    this.startTimer();
  },

  async loadQueue() {
    try {
      const data = await api('/api/review/queue?limit=200');
      this.state.queue = data.items || [];
      this.state.stats = data.stats || {};
      this.state.currentIndex = 0;
      this.renderCurrent();
      this.renderSidebar();
    } catch (e) {
      toast('加载复习队列失败: ' + e.message, 'error');
    }
  },

  async refreshBadge() {
    try {
      const data = await api('/api/review/queue?limit=1');
      const badge = document.getElementById('dueBadge');
      const total = (data.stats?.queue_size) || 0;
      if (total > 0) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (e) {}
  },

  renderCurrent() {
    const wrap = document.getElementById('reviewCardWrap');
    if (!wrap) return;
    if (this.state.currentIndex >= this.state.queue.length) {
      wrap.innerHTML = `
        <div class="text-center">
          <div class="text-6xl mb-4">🎉</div>
          <h2 class="text-xl font-bold mb-2">复习完成!</h2>
          <p class="text-sm text-slate-500 mb-4">本次共复习 ${this.state.sessionStats.reviewed} 张卡片</p>
          <div class="flex gap-2 justify-center">
            <button class="btn btn-outline" onclick="ReviewTab.loadQueue()">检查新到期</button>
            <button class="btn btn-primary" onclick="App.switchTab('records')">返回记录列表</button>
          </div>
        </div>
      `;
      return;
    }

    const card = this.state.queue[this.state.currentIndex];
    const tags = (card.tags || []).map(t => `<span class="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">#${escapeHtml(t)}</span>`).join('');
    const images = (card.image_paths || []).map(p => `<img src="${p}" class="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 mx-auto">`).join('');
    const isDue = card.due && card.due * 1000 < Date.now();

    wrap.innerHTML = `
      <div class="w-full max-w-2xl mx-auto">
        <div class="flex items-center justify-between mb-3 text-xs text-slate-500">
          <div class="flex items-center gap-2">
            ${stateBadge(card.state)}
            <span>${this.state.currentIndex + 1} / ${this.state.queue.length}</span>
            ${card.pinned ? '<span class="badge badge-pinned">置顶</span>' : ''}
            ${tags}
          </div>
          <div class="flex items-center gap-2">
            ${card.reps > 0 ? `<span>第 ${card.reps + 1} 次复习</span>` : '<span class="text-brand-600">首次学习</span>'}
            <button onclick="ReviewTab.skipCard()" class="btn btn-ghost text-xs">跳过 →</button>
          </div>
        </div>
        <div class="review-card-face">
          <h2 class="text-xl font-bold mb-3">${escapeHtml(card.title)}</h2>
          ${!this.state.showAnswer ? `
            <div class="flex-1 flex items-center justify-center text-slate-400 text-sm py-8">
              <button onclick="ReviewTab.showAnswerFn()" class="px-6 py-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/50 transition">
                💡 点击显示答案内容 (Space)
              </button>
            </div>
          ` : `
            <div class="flex-1 overflow-y-auto">
              ${card.content_md ? `<div class="md-body mb-3 anno-target" id="reviewMdBody">${renderMarkdown(card.content_md)}</div>` : '<p class="text-sm text-slate-400 italic mb-3">(无正文内容)</p>'}
              ${images ? `<div class="space-y-2 mb-3">${images}</div>` : ''}
              ${card.note ? `<div class="text-sm p-2 bg-amber-50 dark:bg-amber-900/20 rounded">${escapeHtml(card.note)}</div>` : ''}
            </div>
            <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div class="text-xs text-slate-400 mb-2 text-center">回忆起来了吗? 选择评分 (1/2/3 键)</div>
              <div class="grid grid-cols-3 gap-2" id="answerBtns">
                <button data-rating="again" class="review-btn p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900">
                  <div class="text-2xl mb-1">😵</div>
                  <div class="text-sm font-medium">完全忘记</div>
                  <div class="text-xs opacity-70" data-preview="again">+10min</div>
                </button>
                <button data-rating="hard" class="review-btn p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-200 dark:border-amber-900">
                  <div class="text-2xl mb-1">🤔</div>
                  <div class="text-sm font-medium">记忆模糊</div>
                  <div class="text-xs opacity-70" data-preview="hard">稍后</div>
                </button>
                <button data-rating="easy" class="review-btn p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-900">
                  <div class="text-2xl mb-1">😎</div>
                  <div class="text-sm font-medium">熟练掌握</div>
                  <div class="text-xs opacity-70" data-preview="easy">数日后</div>
                </button>
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    if (this.state.showAnswer) {
      // 加载预览
      this.loadPreview(card.id);
      // 绑定评分按钮
      document.querySelectorAll('#answerBtns [data-rating]').forEach(btn => {
        btn.onclick = () => this.answer(btn.dataset.rating);
      });
      // 加载并高亮批注 (含右键菜单)
      this.loadAnnotations(card.id);
    } else {
      // 点击卡片本身也可以显示答案
      wrap.querySelector('.review-card-face').onclick = (e) => {
        if (!e.target.closest('button')) this.showAnswerFn();
      };
    }
  },

  async loadPreview(cardId) {
    try {
      const p = await api(`/api/review/preview/${cardId}`);
      this.state.preview = p;
      const again = document.querySelector('[data-preview="again"]');
      const hard = document.querySelector('[data-preview="hard"]');
      const easy = document.querySelector('[data-preview="easy"]');
      if (again) again.textContent = p.again?.scheduled_days > 0 ? `${p.again.scheduled_days}天后` : '10分钟';
      if (hard) hard.textContent = p.hard?.scheduled_days > 0 ? `${p.hard.scheduled_days}天后` : '同日';
      if (easy) easy.textContent = p.easy?.scheduled_days > 0 ? `${p.easy.scheduled_days}天后` : '1天';
    } catch (e) {}
  },

  async loadAnnotations(cardId) {
    const el = document.getElementById('reviewMdBody');
    if (!el) return;
    try {
      // 注意: 后端返回 {items: [...], total: N}, 要取 items
      const res = await api(`/api/records/${cardId}/annotations`);
      const anns = (res && res.items) || [];
      applyAnnotations(el, anns);
      initAnnotationContextMenu(el, cardId);
    } catch (e) {}
  },

  showAnswerFn() {
    this.state.showAnswer = true;
    this.renderCurrent();
  },

  skipCard() {
    this.state.currentIndex++;
    this.state.showAnswer = false;
    this.renderCurrent();
    this.renderSidebar();
  },

  async answer(rating) {
    const card = this.state.queue[this.state.currentIndex];
    if (!card) return;
    try {
      const res = await api(`/api/review/${card.id}/answer`, {
        method: 'POST',
        body: { rating },
      });
      // 更新会话统计
      this.state.sessionStats.reviewed++;
      if (rating === 'again') this.state.sessionStats.again++;
      else if (rating === 'hard') this.state.sessionStats.hard++;
      else if (rating === 'easy') this.state.sessionStats.easy++;

      // 如果 again, 把卡片放到队列末尾再复习一次
      if (rating === 'again' && res.record) {
        // 更新当前卡片的 due 等信息, 然后移到队尾
        this.state.queue[this.state.currentIndex] = res.record;
        const card2 = this.state.queue.splice(this.state.currentIndex, 1)[0];
        this.state.queue.push(card2);
        // 不前进 currentIndex, 因为已经移除了当前
      } else {
        this.state.currentIndex++;
      }
      this.state.showAnswer = false;
      this.renderCurrent();
      this.renderSidebar();
      this.refreshBadge();
    } catch (e) {
      toast('评分失败: ' + e.message, 'error');
    }
  },

  renderSidebar() {
    const reviewed = document.getElementById('statReviewed');
    if (!reviewed) return;
    reviewed.textContent = this.state.sessionStats.reviewed;
    document.getElementById('statAgain').textContent = this.state.sessionStats.again;
    document.getElementById('statEasy').textContent = this.state.sessionStats.easy;
    document.getElementById('queueRemaining').textContent = Math.max(this.state.queue.length - this.state.currentIndex, 0);
    document.getElementById('totalDue').textContent = this.state.stats?.total_due || 0;
    document.getElementById('totalNew').textContent = this.state.stats?.total_new || 0;
    document.getElementById('reviewedToday').textContent = this.state.stats?.reviewed_today || 0;
    const total = this.state.queue.length || 1;
    const pct = (this.state.currentIndex / total) * 100;
    const bar = document.getElementById('queueProgress');
    if (bar) bar.style.width = `${pct}%`;
  },

  startTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      const el = document.getElementById('statTime');
      if (!el) return;
      const sec = Math.floor((Date.now() - this.state.sessionStart) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
  },

  endSession() {
    this.state.sessionStats = { reviewed: 0, again: 0, hard: 0, easy: 0 };
    this.state.sessionStart = Date.now();
    this.state.currentIndex = 0;
    this.state.showAnswer = false;
    this.renderSidebar();
    toast('会话已重置', 'info');
  },

  jumpToCard(cardId) {
    // 从记录详情跳转过来, 优先找到这张卡
    const idx = this.state.queue.findIndex(c => c.id === cardId);
    if (idx >= 0) {
      this.state.currentIndex = idx;
      this.state.showAnswer = false;
      this.renderCurrent();
    } else {
      toast('该卡片当前不在复习队列中', 'info');
    }
  },
};
