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
    // ---- 费曼复述 + gap 分析 (事项3) ----
    feynman: { text: '', result: null },
    // ---- 速记 (mnemonic): 按卡片 id 缓存, 复习时作为回忆线索 ----
    mnemonics: {},
    // ---- 错题 (事项4): hit[i]=false 表示第 i 个得分点没拿到; tags 为错因 ----
    quiz: { hit: [], tags: [] },
    // ---- 待复习列表 (可自由选择复习内容) ----
    selected: new Set(),      // 勾选的卡片 id
    doneIds: new Set(),       // 本次会话已评过分(非 again)的 id
    filter: { kw: '', mode: 'all', tag: '' },
    pool: [],                 // 全部记录, 供「添加卡片」挑选 (含未到期)
    poolSelected: new Set(),
  },

  async render() {
    const tab = document.getElementById('tab-review');
    tab.innerHTML = `
      <div class="grid lg:grid-cols-[1fr_300px] gap-4">
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

          <!-- ===== 待复习列表: 可跳选 / 多选 / 筛选 ===== -->
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold flex items-center gap-1.5">
                <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                待复习列表 <span id="queueListCount" class="text-xs font-normal text-slate-400">0</span>
              </h3>
              <button id="addCardsBtn" class="text-xs text-brand-600 hover:text-brand-700 shrink-0" title="从全部记录里挑卡片加入本次复习(含未到期)">+ 添加卡片</button>
            </div>
            <input id="queueSearch" type="text" placeholder="搜索标题 / 正文…"
                   class="w-full text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
            <div class="flex items-center gap-1 mt-2" id="queueFilterChips">
              <button data-mode="all" class="ql-chip flex-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-600">全部</button>
              <button data-mode="due" class="ql-chip flex-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-600">到期</button>
              <button data-mode="new" class="ql-chip flex-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-600">新卡</button>
            </div>
            <select id="queueTagFilter" class="w-full text-xs px-2 py-1.5 mt-2 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
              <option value="">全部标签</option>
            </select>
            <div class="flex items-center justify-between mt-2 text-xs">
              <label class="flex items-center gap-1.5 text-slate-500 cursor-pointer select-none">
                <input type="checkbox" id="queueSelectAll" class="ql-check"> 全选当前
              </label>
              <button id="startSelectedBtn" class="btn btn-primary text-xs !px-2 !py-1 opacity-50" disabled>复习选中</button>
            </div>
            <div id="queueList" class="mt-2 max-h-[300px] overflow-y-auto scrollbar-thin space-y-0.5 -mr-1 pr-1"></div>
            <p class="text-[10px] text-slate-400 mt-2 leading-snug">点条目直接跳到该卡；勾选后「复习选中」只复习这几张。筛选只影响列表显示，不改变复习顺序。</p>
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
    this.bindSidebarEvents();
    this._loaded = false;
    await this.loadQueue();
    this._loaded = true;
    this.startTimer();
  },

  // ============ 待复习列表: 事件绑定 ============
  bindSidebarEvents() {
    const endBtn = document.getElementById('endSessionBtn');
    if (endBtn) endBtn.onclick = () => this.endSession();

    const addBtn = document.getElementById('addCardsBtn');
    if (addBtn) addBtn.onclick = () => this.openPicker();

    const search = document.getElementById('queueSearch');
    if (search) {
      search.addEventListener('input', debounce(() => {
        this.state.filter.kw = search.value;
        this.renderQueueList();
      }, 200));
    }

    const chips = document.getElementById('queueFilterChips');
    if (chips) {
      chips.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        this.state.filter.mode = b.dataset.mode;
        this.renderQueueList();
      });
    }

    const tagSel = document.getElementById('queueTagFilter');
    if (tagSel) {
      tagSel.addEventListener('change', () => {
        this.state.filter.tag = tagSel.value;
        this.renderQueueList();
      });
    }

    const selAll = document.getElementById('queueSelectAll');
    if (selAll) {
      selAll.addEventListener('change', () => {
        const items = this.filteredQueue();
        items.forEach(({ card }) => {
          if (selAll.checked) this.state.selected.add(card.id);
          else this.state.selected.delete(card.id);
        });
        this.renderQueueList();
      });
    }

    const startBtn = document.getElementById('startSelectedBtn');
    if (startBtn) startBtn.onclick = () => this.startSelected();

    // 列表内事件委托: 复选框 change + 条目点击跳转
    const box = document.getElementById('queueList');
    if (box && !box._bound) {
      box._bound = true;
      box.addEventListener('change', (e) => {
        const cb = e.target.closest('.ql-check');
        if (!cb) return;
        const id = parseInt(cb.dataset.id, 10);
        if (cb.checked) this.state.selected.add(id);
        else this.state.selected.delete(id);
        this.renderQueueList();
      });
      box.addEventListener('click', (e) => {
        if (e.target.closest('.ql-check')) return;   // 复选框自己处理
        const item = e.target.closest('.ql-item');
        if (!item) return;
        this.state.showAnswer = false;
        this.jumpToCard(parseInt(item.dataset.id, 10));
      });
    }
  },

  // ============ 待复习列表: 筛选与渲染 ============
  filteredQueue() {
    const { kw, mode, tag } = this.state.filter;
    const now = Date.now() / 1000;
    const k = (kw || '').trim().toLowerCase();
    const out = [];
    this.state.queue.forEach((card, idx) => {
      if (mode === 'due' && !(card.state !== 'new' && card.due <= now)) return;
      if (mode === 'new' && card.state !== 'new') return;
      if (tag && !(card.tags || []).includes(tag)) return;
      if (k) {
        const hay = `${card.title || ''} ${card.content_md || ''} ${card.note || ''}`.toLowerCase();
        if (!hay.includes(k)) return;
      }
      out.push({ card, idx });
    });
    return out;
  },

  renderQueueList() {
    const box = document.getElementById('queueList');
    if (!box) return;
    const items = this.filteredQueue();
    const now = Date.now() / 1000;

    const cnt = document.getElementById('queueListCount');
    if (cnt) cnt.textContent = `${items.length}/${this.state.queue.length}`;

    // 筛选按钮高亮
    document.querySelectorAll('#queueFilterChips [data-mode]').forEach(b => {
      const on = b.dataset.mode === this.state.filter.mode;
      b.classList.toggle('bg-brand-500', on);
      b.classList.toggle('text-white', on);
      b.classList.toggle('border-brand-500', on);
    });

    // 标签下拉: 补全选项但保留当前值
    const tagSel = document.getElementById('queueTagFilter');
    if (tagSel) {
      const tags = new Set();
      this.state.queue.forEach(c => (c.tags || []).forEach(t => tags.add(t)));
      const cur = this.state.filter.tag;
      tagSel.innerHTML = '<option value="">全部标签</option>' +
        [...tags].sort().map(t => `<option value="${escapeHtml(t)}"${t === cur ? ' selected' : ''}>#${escapeHtml(t)}</option>`).join('');
      if (cur && !tags.has(cur)) {
        tagSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(cur)}" selected>#${escapeHtml(cur)} (无)</option>`);
      }
    }

    // 「复习选中」按钮
    const btn = document.getElementById('startSelectedBtn');
    if (btn) {
      const n = this.state.selected.size;
      btn.textContent = n > 0 ? `复习选中 (${n})` : '复习选中';
      btn.disabled = n === 0;
      btn.classList.toggle('opacity-50', n === 0);
    }
    const selAll = document.getElementById('queueSelectAll');
    if (selAll) {
      const vis = items.map(i => i.card.id);
      selAll.checked = vis.length > 0 && vis.every(id => this.state.selected.has(id));
      selAll.indeterminate = !selAll.checked && vis.some(id => this.state.selected.has(id));
    }

    if (!items.length) {
      box.innerHTML = `<div class="text-xs text-slate-400 text-center py-5">没有匹配的卡片</div>`;
      return;
    }

    const cur = this.state.queue[this.state.currentIndex];
    box.innerHTML = items.map(({ card, idx }) => {
      const isCurrent = cur && cur.id === card.id;
      const done = this.state.doneIds.has(card.id);
      const checked = this.state.selected.has(card.id);
      const isNew = card.state === 'new';
      const overdue = !isNew && card.due <= now;
      const sub = isNew
        ? '<span class="text-brand-500">新卡</span>'
        : (overdue ? `<span class="text-red-500">${dueLabel(card.due)}</span>`
                   : `<span class="text-slate-400">未到期 · ${dueLabel(card.due)}</span>`);
      return `
        <div class="ql-item flex items-start gap-2 px-1.5 py-1.5 rounded-lg cursor-pointer transition
                    ${isCurrent ? 'bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-300 dark:ring-brand-700'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700'}
                    ${done ? 'opacity-50' : ''}"
             data-id="${card.id}" title="点击跳到这张卡">
          <input type="checkbox" class="ql-check mt-0.5" data-id="${card.id}" ${checked ? 'checked' : ''}>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-medium truncate ${done ? 'line-through' : ''}">${done ? '✓ ' : ''}${idx + 1}. ${escapeHtml(card.title || '(无标题)')}</div>
            <div class="flex items-center gap-1 mt-0.5 text-[10px]">
              ${stateBadge(card.state)}<span>${sub}</span>
              ${isCurrent ? '<span class="text-brand-600 dark:text-brand-400 font-medium">· 当前</span>' : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  },

  // 只复习勾选的卡片
  startSelected() {
    const n = this.state.selected.size;
    if (!n) { toast('请先勾选要复习的卡片', 'info'); return; }
    const picked = [];
    this.state.queue.forEach(c => { if (this.state.selected.has(c.id)) picked.push(c); });
    if (!picked.length) return;
    this.state.queue = picked;
    this.state.currentIndex = 0;
    this.state.showAnswer = false;
    this.state.doneIds = new Set();
    this.state.selected = new Set();
    this.renderCurrent();
    this.renderSidebar();
    toast(`已开始复习选中的 ${picked.length} 张卡片`, 'success');
  },

  // ============ 添加卡片: 从全部记录挑(含未到期) ============
  async openPicker() {
    this.state.poolSelected = new Set();
    if (!this.state.pool.length) {
      try {
        const res = await api('/api/records?limit=500');
        this.state.pool = res.items || [];
      } catch (e) {
        toast('加载记录失败: ' + e.message, 'error');
        return;
      }
    }
    const bodyHtml = `
      <div class="p-4 space-y-3">
        <p class="text-xs text-slate-500">勾选任意卡片加入本次复习，包括尚未到期的。已在队列中的会标注，不会重复加入。</p>
        <input id="poolSearch" type="text" placeholder="搜索标题 / 正文 / 标签…"
               class="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
        <div class="flex items-center gap-2">
          <select id="poolState" class="text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
            <option value="">全部状态</option>
            <option value="new">新卡</option>
            <option value="learning">学习中</option>
            <option value="review">复习中</option>
            <option value="relearning">重学</option>
          </select>
          <label class="text-xs flex items-center gap-1.5 text-slate-500 cursor-pointer select-none">
            <input type="checkbox" id="poolInQueue" class="ql-check"> 只看不在队列的
          </label>
        </div>
        <div id="poolList" class="space-y-0.5"></div>
      </div>`;
    const d = openDrawer('添加卡片到本次复习', bodyHtml, { width: '560px' });
    const footer = document.createElement('div');
    footer.className = 'px-4 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-between bg-white dark:bg-slate-800';
    footer.innerHTML = `
      <label class="text-xs flex items-center gap-1.5 text-slate-500 cursor-pointer select-none">
        <input type="checkbox" id="poolSelectAll" class="ql-check"> 全选当前结果
      </label>
      <div class="flex gap-2">
        <button class="btn btn-outline text-xs" onclick="closeDrawer()">取消</button>
        <button class="btn btn-primary text-xs" id="poolConfirm">加入队列 (0)</button>
      </div>`;
    d.appendChild(footer);

    const search = document.getElementById('poolSearch');
    if (search) search.addEventListener('input', debounce(() => this.renderPoolList(), 200));
    const st = document.getElementById('poolState');
    if (st) st.addEventListener('change', () => this.renderPoolList());
    const inq = document.getElementById('poolInQueue');
    if (inq) inq.addEventListener('change', () => this.renderPoolList());
    const all = document.getElementById('poolSelectAll');
    if (all) all.addEventListener('change', () => {
      this.filteredPool().forEach(c => {
        if (all.checked) this.state.poolSelected.add(c.id);
        else this.state.poolSelected.delete(c.id);
      });
      this.renderPoolList();
    });
    const ok = document.getElementById('poolConfirm');
    if (ok) ok.onclick = () => this.confirmPicker();

    const list = document.getElementById('poolList');
    if (list && !list._bound) {
      list._bound = true;
      list.addEventListener('change', (e) => {
        const cb = e.target.closest('.ql-check');
        if (!cb) return;
        const id = parseInt(cb.dataset.id, 10);
        if (cb.checked) this.state.poolSelected.add(id);
        else this.state.poolSelected.delete(id);
        this.renderPoolList();
      });
    }
    this.renderPoolList();
  },

  filteredPool() {
    const kw = (document.getElementById('poolSearch')?.value || '').trim().toLowerCase();
    const st = document.getElementById('poolState')?.value || '';
    const onlyNotIn = document.getElementById('poolInQueue')?.checked || false;
    const inQueue = new Set(this.state.queue.map(c => c.id));
    return this.state.pool.filter(c => {
      if (st && c.state !== st) return false;
      if (onlyNotIn && inQueue.has(c.id)) return false;
      if (kw) {
        const hay = `${c.title || ''} ${c.content_md || ''} ${c.note || ''} ${(c.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  },

  renderPoolList() {
    const box = document.getElementById('poolList');
    if (!box) return;
    const items = this.filteredPool();
    const inQueue = new Set(this.state.queue.map(c => c.id));
    const btn = document.getElementById('poolConfirm');
    if (btn) btn.textContent = `加入队列 (${this.state.poolSelected.size})`;
    const all = document.getElementById('poolSelectAll');
    if (all) {
      all.checked = items.length > 0 && items.every(c => this.state.poolSelected.has(c.id));
      all.indeterminate = !all.checked && items.some(c => this.state.poolSelected.has(c.id));
    }
    if (!items.length) {
      box.innerHTML = `<div class="text-xs text-slate-400 text-center py-6">没有匹配的卡片</div>`;
      return;
    }
    box.innerHTML = items.map(c => {
      const has = inQueue.has(c.id);
      return `
        <label class="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
          <input type="checkbox" class="ql-check mt-0.5" data-id="${c.id}" ${this.state.poolSelected.has(c.id) ? 'checked' : ''}>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate">${escapeHtml(c.title || '(无标题)')}</div>
            <div class="flex items-center gap-1 mt-0.5 text-[10px]">
              ${stateBadge(c.state)}
              <span class="text-slate-400">${c.due ? dueLabel(c.due) : '未排期'}</span>
              ${(c.tags || []).map(t => `<span class="text-slate-400">#${escapeHtml(t)}</span>`).join('')}
              ${has ? '<span class="text-brand-600 dark:text-brand-400">· 已在队列</span>' : ''}
            </div>
          </div>
        </label>`;
    }).join('');
  },

  confirmPicker() {
    const picked = this.state.pool.filter(c => this.state.poolSelected.has(c.id));
    if (!picked.length) { toast('请先勾选卡片', 'info'); return; }
    const inQueue = new Set(this.state.queue.map(c => c.id));
    let added = 0;
    picked.forEach(c => { if (!inQueue.has(c.id)) { this.state.queue.push(c); added++; } });
    this.state.poolSelected = new Set();
    closeDrawer();
    this.renderCurrent();
    this.renderSidebar();
    toast(added ? `已加入 ${added} 张卡片到本次复习` : '所选卡片都已在队列中', added ? 'success' : 'info');
  },

  async loadQueue() {
    try {
      const data = await api('/api/review/queue?limit=500');
      this.state.queue = data.items || [];
      this.state.stats = data.stats || {};
      this.state.currentIndex = 0;
      this.state.selected = new Set();
      this.state.doneIds = new Set();
      // 从记录页「立即复习」跳过来时, loadQueue 可能晚于 jumpToCard 完成,
      // 这里补一次跳转, 否则队列重载会把目标位置冲掉
      if (this.state.jumpTarget) {
        const id = this.state.jumpTarget;
        this.state.jumpTarget = null;
        let idx = this.state.queue.findIndex(c => c.id === id);
        if (idx < 0) idx = await this.ensureInQueue(id);
        if (idx >= 0) this.state.currentIndex = idx;
      }
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
            <button class="btn btn-outline" onclick="ReviewTab.openPicker()">添加卡片继续复习</button>
            <button class="btn btn-primary" onclick="App.switchTab('records')">返回记录列表</button>
          </div>
        </div>
      `;
      this.renderQueueList();
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
            <div class="flex-1 flex flex-col py-4" id="feynmanPanel">
              ${card.kind === 'quiz' && card.content_md ? `
                <div class="md-body mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg anno-target" id="reviewMdBody">
                  <div class="text-xs text-slate-400 mb-1">题目</div>
                  ${renderMarkdown(card.content_md)}
                </div>` : ''}
              <div class="text-xs text-slate-400 mb-2">${card.kind === 'quiz' ? '先自己写一遍解答/思路（错题不接 AI 分析）' : '先用自己的话讲一遍 —— 写不出来正好说明这里还没懂'}</div>
              <textarea id="feynmanText" rows="${card.kind === 'quiz' ? 4 : 5}" placeholder="${card.kind === 'quiz' ? '写下你的解答/思路…' : '用自己的话复述这个知识点…'}"
                class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 resize-y">${escapeHtml(this.state.feynman.text || '')}</textarea>
              <div class="flex items-center gap-2 mt-2">
                <button id="feynmanAnalyzeBtn" type="button"
                  class="px-4 py-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/50 text-sm"
                  style="display:${aiEnabled() && card.kind !== 'quiz' ? '' : 'none'}">🔍 对比分析</button>
                <button onclick="ReviewTab.showAnswerFn()"
                  class="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">跳过，直接看答案 →</button>
              </div>
              <div id="feynmanResult" class="mt-3"></div>
              ${this.renderMnemonicBlock(card)}
            </div>
          ` : `
            <div class="flex-1 overflow-y-auto">
              ${this.renderRecallBlock()}
              ${card.content_md ? `<div class="md-body mb-3 anno-target" id="reviewMdBody">${renderMarkdown(card.content_md)}</div>` : '<p class="text-sm text-slate-400 italic mb-3">(无正文内容)</p>'}
              ${images ? `<div class="space-y-2 mb-3">${images}</div>` : ''}
              ${card.note ? `<div class="text-sm p-2 bg-amber-50 dark:bg-amber-900/20 rounded">${escapeHtml(card.note)}</div>` : ''}
              ${card.kind === 'quiz' ? this.renderQuizSection(card) : ''}
              ${this.renderMnemonicBlock(card)}
            </div>
            <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              ${this.state.feynman.result ? `<div class="text-xs text-slate-400 mb-2 text-center">🤖 建议评分：<b>${escapeHtml(this.state.feynman.result.advice_rating || '')}</b>（仅建议，评分仍由你决定）</div>` : ''}
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
      // 速记 (回忆线索)
      this.loadMnemonics(card.id);
      // ---- 错题 (事项4): 得分点勾选 + 错因 chips ----
      if (card.kind === 'quiz') {
        wrap.querySelectorAll('[data-point]').forEach(cb => {
          cb.onchange = () => {
            this.state.quiz.hit[+cb.dataset.point] = cb.checked;
            this.syncQuizMistakes(card);
          };
        });
        this.syncQuizMistakes(card);
      }
      // advice_rating 提示: 给建议的评分按钮加 ring (仅提示, 不自动评分)
      const r = this.state.feynman.result;
      if (r && r.advice_rating) {
        const b = document.querySelector(`#answerBtns [data-rating="${r.advice_rating}"]`);
        if (b) b.classList.add('ring-2', 'ring-brand-500');
      }
    } else {
      // ---- 费曼复述面板 ----
      const ft = document.getElementById('feynmanText');
      if (ft) ft.addEventListener('input', () => { this.state.feynman.text = ft.value; });
      const ab = document.getElementById('feynmanAnalyzeBtn');
      if (ab) ab.onclick = () => this.runGapAnalysis();
      // 渲染已保存的分析结果 (重新渲染后不丢失)
      if (this.state.feynman.result) this.renderGapResult(this.state.feynman.result);
      // 题目卡在正面显示题干, 题干上的批注高亮与右键菜单也要能用
      if (document.getElementById('reviewMdBody')) this.loadAnnotations(card.id);
      this.loadMnemonics(card.id);
      // 点击卡片本身也可以显示答案 (复述面板内除外, 避免打字时误触)
      wrap.querySelector('.review-card-face').onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('#feynmanPanel')) return;
        this.showAnswerFn();
      };
    }
    // 速记抽屉里增删改后, 复习页的速记区块跟着刷新
    window.__mnemonicViews = (window.__mnemonicViews || []).filter(v => v.recordId !== card.id);
    window.__mnemonicViews.push({ recordId: card.id, redraw: () => this.loadMnemonics(card.id) });

    // 同步左侧列表的"当前"高亮
    this.renderQueueList();
  },

  // ---- 答案面: 把"我刚才写的复述"放在标准内容上方, 方便逐条对比 ----
  renderRecallBlock() {
    const text = (this.state.feynman.text || '').trim();
    const gap = this.state.feynman.result;
    const cover = gap ? Math.max(0, Math.min(100, gap.coverage || 0)) : null;
    const missed = (gap && gap.missed) || [];
    const wrong = (gap && gap.wrong) || [];
    let gapHtml = '';
    if (gap) {
      gapHtml = `
        <div class="mt-2 pt-2 border-t border-brand-200 dark:border-brand-800 text-xs">
          <div class="flex items-center gap-2">
            <span class="text-slate-400">覆盖度</span>
            <div class="flex-1 h-1.5 bg-white dark:bg-slate-800 rounded overflow-hidden">
              <div class="h-full bg-brand-500" style="width:${cover}%"></div>
            </div>
            <span class="font-medium">${cover}%</span>
          </div>
          ${missed.length ? `<div class="mt-1 text-slate-500">遗漏：${missed.map(m => escapeHtml(m)).join('；')}</div>` : ''}
          ${wrong.length ? `<div class="mt-1 text-slate-500">纠错：${wrong.map(w => `${escapeHtml(w.claim || '')} → ${escapeHtml(w.correction || '')}`).join('；')}</div>` : ''}
        </div>`;
    }
    const body = text
      ? `<div class="md-body text-sm">${renderMarkdown(text)}</div>`
      : '<div class="text-xs text-slate-400 italic">本次没有写复述（下次可以先写再翻答案，效果差很多）</div>';
    return `
      <div class="mb-3 p-3 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-900/20">
        <div class="text-xs text-slate-400 mb-1">🗣 我的复述（与下方标准内容对照）</div>
        ${body}
        ${gapHtml}
      </div>`;
  },

  // ---- 速记: 复习时作为回忆线索展示 (缓存按卡片 id) ----
  async loadMnemonics(cardId) {
    try {
      const res = await api(`/api/records/${cardId}/mnemonics`);
      this.state.mnemonics[cardId] = (res && res.items) || [];
    } catch (e) {
      this.state.mnemonics[cardId] = this.state.mnemonics[cardId] || [];
      return;
    }
    // 异步回来后页面可能已切到下一张, 只更新仍属于该卡的区块
    const box = document.getElementById('reviewMnSection');
    const cur = this.state.queue[this.state.currentIndex];
    if (box && cur && cur.id === cardId) {
      box.innerHTML = mnemonicsSection(this.state.mnemonics[cardId] || [], cardId);
    }
  },

  renderMnemonicBlock(card) {
    const items = this.state.mnemonics[card.id] || [];
    return `<div id="reviewMnSection">${mnemonicsSection(items, card.id)}</div>`;
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
    // 翻答案前把复述框里的内容收进 state (点击卡片空白处 / 快捷键触发时也要带上)
    const ta = document.getElementById('feynmanText');
    if (ta) this.state.feynman.text = ta.value;
    this.state.showAnswer = true;
    this.state.quiz = { hit: [], tags: [] };   // 进入评分阶段, 重置得分点勾选
    this.renderCurrent();
  },

  // ============ 费曼复述 + gap 分析 (事项3) ============
  async runGapAnalysis() {
    const card = this.state.queue[this.state.currentIndex];
    if (!card) return;
    const ta = document.getElementById('feynmanText');
    const text = (ta?.value || '').trim();
    if (!text) { toast('先写点复述再对比', 'error'); return; }
    this.state.feynman.text = text;
    const btn = document.getElementById('feynmanAnalyzeBtn');
    if (btn) { btn.disabled = true; btn.textContent = '🔍 分析中…'; }
    try {
      const res = await api('/api/ai/gap', {
        method: 'POST',
        body: { record_id: card.id, user_summary: text },
      });
      this.state.feynman.result = res;
      this.renderGapResult(res);
    } catch (e) {
      // 失败计入熔断: 连续 2 次后隐藏「对比分析」(复述框与跳过按钮仍可用)
      const disabled = aiNoteFailure('对比分析失败: ' + e.message);
      if (disabled && btn) btn.style.display = 'none';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔍 对比分析'; }
    }
  },

  renderGapResult(res) {
    const box = document.getElementById('feynmanResult');
    if (!box || !res) return;
    const cover = Math.max(0, Math.min(100, res.coverage || 0));
    const missed = (res.missed || [])
      .map(m => `<li>${escapeHtml(m)}</li>`).join('');
    const wrong = (res.wrong || []).map(w => `
      <tr>
        <td class="pr-2 align-top text-red-500">${escapeHtml(w.claim || '')}</td>
        <td class="align-top text-emerald-600">${escapeHtml(w.correction || '')}</td>
      </tr>`).join('');
    box.innerHTML = `
      <div class="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 text-sm">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-slate-400">覆盖度</span>
          <div class="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
            <div class="h-full bg-brand-500" style="width:${cover}%"></div>
          </div>
          <span class="text-xs font-medium">${cover}%</span>
        </div>
        ${missed ? `<div class="mb-2"><div class="text-xs text-slate-400 mb-1">遗漏要点</div><ul class="list-disc pl-5 text-xs space-y-0.5">${missed}</ul></div>` : ''}
        ${wrong ? `<div class="mb-2"><div class="text-xs text-slate-400 mb-1">需要纠正</div><table class="text-xs w-full">${wrong}</table></div>` : ''}
        ${res.comment ? `<div class="text-xs text-slate-500 mb-2">💬 ${escapeHtml(res.comment)}</div>` : ''}
        <div class="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <span class="text-xs text-slate-400">建议评分：<b>${escapeHtml(res.advice_rating || '')}</b>（仅建议，评分仍由你决定）</span>
          <div class="flex-1"></div>
          <button id="gapSaveAnnoBtn" type="button" class="btn btn-outline text-xs">💾 存为批注</button>
        </div>
      </div>
    `;
    const sb = document.getElementById('gapSaveAnnoBtn');
    if (sb) sb.onclick = () => this.saveGapAsAnnotation(res);
  },

  async saveGapAsAnnotation(res) {
    const card = this.state.queue[this.state.currentIndex];
    if (!card) return;
    let md = `### 费曼复盘\n\n- 覆盖度: ${res.coverage || 0}%\n`;
    if ((res.missed || []).length) {
      md += '\n**遗漏**:\n' + res.missed.map(m => `- ${m}`).join('\n') + '\n';
    }
    if ((res.wrong || []).length) {
      md += '\n**纠错**:\n' + res.wrong.map(w => `- ${w.claim} → ${w.correction}`).join('\n') + '\n';
    }
    if (res.comment) md += `\n> ${res.comment}\n`;
    try {
      await api(`/api/records/${card.id}/annotations`, {
        method: 'POST',
        body: { quote: '', note_md: md },
      });
      toast('已存为批注', 'success');
    } catch (e) { toast('保存批注失败: ' + e.message, 'error'); }
  },

  // ============ 错题 (事项4) ============
  renderQuizSection(card) {
    const rubric = card.rubric || [];
    let html = '';
    if (card.solution_md) {
      html += `<div class="md-body mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
        <div class="text-xs text-slate-400 mb-1">标准解答</div>
        ${renderMarkdown(card.solution_md)}
      </div>`;
    }
    if (rubric.length) {
      const rows = rubric.map((r, i) => `
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" data-point="${i}" ${this.state.quiz.hit[i] === false ? '' : 'checked'} class="mt-0.5 accent-brand-600">
          <span class="flex-1">${escapeHtml(r.point || '')}</span>
          <span class="text-xs text-slate-400">${r.score} 分</span>
        </label>`).join('');
      html += `<div class="mb-3">
        <div class="text-xs text-slate-400 mb-1">得分点（默认全选 = 拿到分，取消勾选表示没拿到）</div>
        <div class="space-y-1">${rows}</div>
      </div>`;
    }
    html += `<div id="quizMistakeWrap"></div>`;
    return html;
  },

  syncQuizMistakes(card) {
    const wrap = document.getElementById('quizMistakeWrap');
    if (!wrap) return;
    const rubric = card.rubric || [];
    const missed = rubric.map((_, i) => i).filter(i => this.state.quiz.hit[i] === false);
    if (!missed.length) { wrap.innerHTML = ''; return; }
    const chips = Object.keys(MISTAKE_TAGS).map(k => `
      <button type="button" data-tag="${k}"
        class="px-2 py-1 text-xs rounded border ${this.state.quiz.tags.includes(k)
          ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-400 text-brand-700 dark:text-brand-300'
          : 'border-slate-200 dark:border-slate-700 text-slate-500'}">${MISTAKE_TAGS[k]}</button>`).join('');
    wrap.innerHTML = `
      <div class="mb-2">
        <div class="text-xs text-slate-400 mb-1">有 ${missed.length} 个得分点未拿到，请选择错因（至少 1 个才能评分）</div>
        <div class="flex flex-wrap gap-1">${chips}</div>
      </div>`;
    wrap.querySelectorAll('[data-tag]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.tag;
        const i = this.state.quiz.tags.indexOf(t);
        if (i >= 0) this.state.quiz.tags.splice(i, 1);
        else this.state.quiz.tags.push(t);
        this.syncQuizMistakes(card);
      };
    });
  },

  skipCard() {
    this.state.currentIndex++;
    this.state.showAnswer = false;
    this.state.feynman = { text: '', result: null };
    this.state.quiz = { hit: [], tags: [] };
    this.renderCurrent();
    this.renderSidebar();
  },

  async answer(rating) {
    const card = this.state.queue[this.state.currentIndex];
    if (!card) return;
    // ---- 错题 (事项4): 随评分提交漏掉的得分点与错因 ----
    const body = { rating };
    if (card.kind === 'quiz') {
      const rubric = card.rubric || [];
      const missed = rubric.map((_, i) => i).filter(i => this.state.quiz.hit[i] === false);
      if (missed.length && (this.state.quiz.tags || []).length === 0) {
        toast('有未拿到的得分点，请先选择错因', 'error');
        return;
      }
      body.missed_points = missed;
      body.mistake_tags = this.state.quiz.tags || [];
    }
    try {
      const res = await api(`/api/review/${card.id}/answer`, {
        method: 'POST',
        body,
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
        this.state.doneIds.add(card.id);   // 标记已完成(列表里置灰打勾)
        this.state.currentIndex++;
      }
      this.state.showAnswer = false;
      this.state.feynman = { text: '', result: null };   // 翻到下一张清空复述
      this.state.quiz = { hit: [], tags: [] };
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
    this.renderQueueList();
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
    this.state.doneIds = new Set();
    this.state.selected = new Set();
    this.renderCurrent();
    this.renderSidebar();
    toast('会话已重置', 'info');
  },

  async jumpToCard(cardId) {
    // 队列还没加载完(例如从记录页刚切过来): 先记下, loadQueue 完成后自动跳
    if (!this._loaded) {
      this.state.jumpTarget = cardId;
      return;
    }
    // 从记录详情 / 待复习列表跳转过来
    let idx = this.state.queue.findIndex(c => c.id === cardId);
    if (idx < 0) {
      // 不在队列(例如未到期的卡): 拉进来再跳, 支持"提前复习任意卡片"
      idx = await this.ensureInQueue(cardId);
      if (idx < 0) { toast('该卡片当前不在复习队列中', 'info'); return; }
      toast('已将该卡片加入本次复习', 'info');
    }
    this.state.currentIndex = idx;
    this.state.showAnswer = false;
    this.renderCurrent();
    this.renderSidebar();
    // 小屏时把卡片区滚到视野内
    const main = document.getElementById('reviewMain');
    if (main && window.innerWidth < 1024) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async ensureInQueue(cardId) {
    try {
      const r = await api(`/api/records/${cardId}`);
      const card = (r && r.id) ? r : (r && r.record);
      if (card && card.id) {
        this.state.queue.push(card);
        return this.state.queue.length - 1;
      }
    } catch (e) {}
    return -1;
  },
};
