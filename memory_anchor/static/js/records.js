/* Memory Anchor - 记录列表 Tab */

// ============ 格式修正高级选项 ============
// 借鉴 siyuan-plugin-text-process 的可逐项开关模型: 安全子集默认开, 进阶项默认关,
// 用户在"高级格式选项"里按需勾选。这里集中维护选项定义, 供编辑器与导入框复用。
const FORMAT_OPT_DEFS = [
  ['strip_links', '去链接 (保留文字)'],
  ['strip_superscript', '去除上标/角标'],
  ['headings_to_bold', '标题转加粗 (不切卡)'],
  ['normalize_heading_levels', '标题层级归一 (# 起)'],
  ['en_punct_to_cn', '英文标点→中文'],
  ['cn_punct_to_en', '中文标点→英文'],
  ['remove_newlines', '去除换行'],
  ['remove_spaces', '智能去空格'],
  ['add_paragraph_blank', '段间补空行'],
  ['fullwidth_to_halfwidth', '全角转半角'],
];

// 生成可折叠的"高级格式选项"面板 (prefix 用于避免编辑器/导入框 id 冲突)
function formatOptionsPanel(prefix, defaults = {}) {
  const items = FORMAT_OPT_DEFS.map(([k, label]) =>
    `<label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" id="${prefix}_opt_${k}" class="w-3.5 h-3.5 accent-brand-600" ${defaults[k] ? 'checked' : ''}> ${label}</label>`
  ).join('');
  return `<details class="text-xs text-slate-500 mt-1">
    <summary class="cursor-pointer select-none hover:text-slate-700">高级格式选项</summary>
    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 pl-1 border-t border-slate-100 dark:border-slate-700 pt-2">
      ${items}
    </div>
  </details>`;
}

// 读取某前缀下所有高级选项复选框的状态, 返回 {optionName: bool}
function readFormatOpts(prefix) {
  const opts = {};
  FORMAT_OPT_DEFS.forEach(([k]) => {
    const el = document.getElementById(`${prefix}_opt_${k}`);
    if (el) opts[k] = el.checked;
  });
  return opts;
}

const RecordsTab = {
  state: {
    items: [],
    search: '',
    tag: '',
    dateFrom: '',
    dateTo: '',
    state: '',
    selectedIds: new Set(),
    view: 'card', // card | table
  },

  async render() {
    const tab = document.getElementById('tab-records');
    tab.innerHTML = `
      <div class="flex flex-col gap-3 mb-4">
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative flex-1 min-w-[200px]">
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="recSearch" type="text" placeholder="搜索标题/正文/备注 (Ctrl+K)" 
                   class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                   value="${escapeHtml(this.state.search)}">
          </div>
          <select id="recStateFilter" class="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
            <option value="">全部状态</option>
            <option value="new" ${this.state.state==='new'?'selected':''}>新</option>
            <option value="learning" ${this.state.state==='learning'?'selected':''}>学习中</option>
            <option value="review" ${this.state.state==='review'?'selected':''}>复习中</option>
            <option value="relearning" ${this.state.state==='relearning'?'selected':''}>重学</option>
          </select>
          <select id="recTagFilter" class="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 max-w-[160px]">
            <option value="">全部标签${this.state.tag ? ` (${escapeHtml(this.state.tag)})` : ''}</option>
          </select>
          <input id="recDateFrom" type="date" class="px-2 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" value="${this.state.dateFrom}">
          <span class="text-slate-400 text-sm">至</span>
          <input id="recDateTo" type="date" class="px-2 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800" value="${this.state.dateTo}">
          <button id="recResetBtn" class="btn btn-outline" title="重置筛选">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9M3 4v5h5"/></svg>
          </button>
          <div class="ml-auto flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button id="viewCardBtn" class="px-2 py-1 rounded-md text-sm ${this.state.view==='card'?'bg-white dark:bg-slate-700 shadow-sm':''}">卡片</button>
            <button id="viewTableBtn" class="px-2 py-1 rounded-md text-sm ${this.state.view==='table'?'bg-white dark:bg-slate-700 shadow-sm':''}">列表</button>
          </div>
          <button id="recImportBtn" class="btn btn-outline" title="从 Markdown 导入">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            <span class="hidden sm:inline">导入</span>
          </button>
          <button id="recExportBtn" class="btn btn-outline" title="导出">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <span class="hidden sm:inline">导出</span>
          </button>
        </div>
        <div id="recBatchBar" class="hidden items-center gap-2 px-3 py-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg text-sm">
          <span id="batchCount">已选 0 项</span>
          <div class="flex-1"></div>
          <button class="btn btn-outline" data-action="pin">置顶</button>
          <button class="btn btn-outline" data-action="unpin">取消置顶</button>
          <button class="btn btn-outline" data-action="reset_fsrs">重置进度</button>
          <button class="btn btn-danger" data-action="delete">删除</button>
          <button class="btn btn-ghost" id="batchClear">取消</button>
        </div>
      </div>
      <div id="recListContainer" class="space-y-2"></div>
      <div id="recEmpty" class="hidden text-center py-16 text-slate-400">
        <svg class="w-12 h-12 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        <p class="text-sm">还没有学习记录</p>
        <p class="text-xs mt-1">点击右上角「新增」开始你的第一次记忆</p>
      </div>
    `;

    // 绑定事件
    document.getElementById('recSearch').addEventListener('input', debounce((e) => {
      this.state.search = e.target.value;
      this.load();
    }, 300));
    document.getElementById('recStateFilter').addEventListener('change', (e) => {
      this.state.state = e.target.value;
      this.load();
    });
    document.getElementById('recTagFilter').addEventListener('change', (e) => {
      this.state.tag = e.target.value;
      this.load();
    });
    this.loadTagOptions();
    document.getElementById('recDateFrom').addEventListener('change', (e) => {
      this.state.dateFrom = e.target.value;
      this.load();
    });
    document.getElementById('recDateTo').addEventListener('change', (e) => {
      this.state.dateTo = e.target.value;
      this.load();
    });
    document.getElementById('recResetBtn').addEventListener('click', () => {
      this.state = { ...this.state, search: '', tag: '', dateFrom: '', dateTo: '', state: '', selectedIds: new Set() };
      this.render();
    });
    document.getElementById('viewCardBtn').addEventListener('click', () => {
      this.state.view = 'card';
      this.render();
    });
    document.getElementById('viewTableBtn').addEventListener('click', () => {
      this.state.view = 'table';
      this.render();
    });
    document.getElementById('recImportBtn').addEventListener('click', () => this.showImportDialog());
    document.getElementById('recExportBtn').addEventListener('click', () => this.showExportDialog());

    document.querySelectorAll('#recBatchBar [data-action]').forEach(btn => {
      btn.addEventListener('click', () => this.batchAction(btn.dataset.action));
    });
    document.getElementById('batchClear').addEventListener('click', () => {
      this.state.selectedIds.clear();
      this.updateBatchBar();
    });

    await this.load();
  },

  // 标签下拉选项: 从 /api/records/tags 拉全量标签 (带卡片计数)
  async loadTagOptions() {
    const sel = document.getElementById('recTagFilter');
    if (!sel) return;
    let items = [];
    try {
      const res = await api('/api/records/tags');
      items = res.items || [];
    } catch (e) { /* 标签下拉失败不影响主流程 */ }
    const cur = this.state.tag;
    const opts = ['<option value="">全部标签</option>'].concat(
      items.map(t => `<option value="${escapeHtml(t.tag)}"${t.tag === cur ? ' selected' : ''}>#${escapeHtml(t.tag)} (${t.count})</option>`)
    );
    // 当前标签可能已无卡片 (被删/改名), 仍保留选中项, 避免筛选状态悄悄丢失
    if (cur && !items.some(t => t.tag === cur)) {
      opts.push(`<option value="${escapeHtml(cur)}" selected>#${escapeHtml(cur)} (0)</option>`);
    }
    sel.innerHTML = opts.join('');
    sel.value = cur || '';
    this.state.tagOptions = items.map(t => t.tag);
  },

  // 点卡片上的标签徽章 -> 直接按该标签筛选
  setTagFilter(tag) {
    this.state.tag = tag || '';
    const sel = document.getElementById('recTagFilter');
    if (sel) sel.value = this.state.tag;
    this.load();
  },

  async load() {
    try {
      const params = new URLSearchParams();
      if (this.state.search) params.set('search', this.state.search);
      if (this.state.tag) params.set('tag', this.state.tag);
      if (this.state.dateFrom) params.set('date_from', this.state.dateFrom);
      if (this.state.dateTo) params.set('date_to', this.state.dateTo);
      if (this.state.state) params.set('state', this.state.state);
      const data = await api(`/api/records?${params}`);
      this.state.items = data.items || [];
      this.renderList();
    } catch (e) {
      toast('加载失败: ' + e.message, 'error');
    }
  },

  renderList() {
    const container = document.getElementById('recListContainer');
    const empty = document.getElementById('recEmpty');
    if (this.state.items.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    if (this.state.view === 'card') {
      container.innerHTML = this.state.items.map(it => this.cardHtml(it)).join('');
    } else {
      container.innerHTML = this.tableHtml();
    }
    // 绑定点击事件
    container.querySelectorAll('[data-record-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input')) return;
        this.showDetail(parseInt(el.dataset.recordId));
      });
    });
    container.querySelectorAll('[data-edit-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showEditor(parseInt(el.dataset.editId));
      });
    });
    container.querySelectorAll('[data-del-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.delId);
        const it = this.state.items.find(x => x.id === id);
        confirmDialog(`确定删除「${it?.title || ''}」吗?`, () => this.deleteOne(id), { danger: true, okText: '删除' });
      });
    });
    // 卡片上的标签徽章: 点击直接按该标签筛选 (阻止冒泡, 否则会打开详情)
    container.querySelectorAll('[data-tag-filter]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTagFilter(el.dataset.tagFilter);
      });
    });
    container.querySelectorAll('[data-check-id]').forEach(el => {
      el.addEventListener('change', (e) => {
        const id = parseInt(el.dataset.checkId);
        if (e.target.checked) this.state.selectedIds.add(id);
        else this.state.selectedIds.delete(id);
        this.updateBatchBar();
      });
    });
    container.querySelectorAll('[data-pin-id]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.pinId);
        const it = this.state.items.find(x => x.id === id);
        await api(`/api/records/${id}`, { method: 'PUT', body: { pinned: it.pinned ? 0 : 1 } });
        this.load();
      });
    });
  },

  cardHtml(it) {
    const tags = (it.tags || []).map(t => `<button data-tag-filter="${escapeHtml(t)}" title="按标签「${escapeHtml(t)}」筛选" class="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-brand-100 dark:hover:bg-brand-900/40">${escapeHtml(t)}</button>`).join('');
    const mnBadge = (it.mnemonic_count || 0) > 0
      ? `<span class="badge bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" title="已有 ${it.mnemonic_count} 条速记">💡 ${it.mnemonic_count}</span>` : '';
    const images = (it.image_paths || []).slice(0, 3).map(p => `<img src="${p}" class="w-12 h-12 object-cover rounded">`).join('');
    const dueClass = it.due && it.due * 1000 < Date.now() ? 'badge-due' : 'bg-slate-100 dark:bg-slate-700 text-slate-500';
    return `
      <div class="record-card flex items-start gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer" data-record-id="${it.id}">
        <input type="checkbox" data-check-id="${it.id}" ${this.state.selectedIds.has(it.id) ? 'checked' : ''} 
               class="mt-1 w-4 h-4 rounded accent-brand-600" ${this.state.selectedIds.size > 0 ? '' : 'hidden'}>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            ${it.pinned ? '<span class="badge badge-pinned">置顶</span>' : ''}
            <h3 class="font-medium text-sm truncate flex-1">${it.kind === 'quiz' ? '<span class="badge bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 mr-1">题目</span>' : ''}${escapeHtml(it.title)}</h3>
            ${stateBadge(it.state)}
          </div>
          ${this.previewText(it) ? `<div class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-1">${escapeHtml(this.previewText(it))}</div>` : ''}
          <div class="flex items-center gap-1.5 flex-wrap">
            ${tags}
            ${mnBadge}
            ${images ? `<div class="flex gap-1 ml-auto">${images}${(it.image_paths.length > 3) ? `<div class="w-12 h-12 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs text-slate-500">+${it.image_paths.length - 3}</div>` : ''}</div>` : ''}
          </div>
          <div class="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
            <span>📅 ${it.learn_date}</span>
            <span class="badge ${dueClass}">${dueLabel(it.due)}</span>
            ${it.reps > 0 ? `<span>🔁 ${it.reps} 次</span>` : ''}
            ${it.lapses > 0 ? `<span>❌ 忘 ${it.lapses}</span>` : ''}
            <div class="ml-auto flex gap-1">
              <button data-pin-id="${it.id}" title="${it.pinned?'取消置顶':'置顶'}" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                <svg class="w-3.5 h-3.5 ${it.pinned?'text-brand-600':''}" viewBox="0 0 24 24" fill="${it.pinned?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
              </button>
              <button data-edit-id="${it.id}" title="编辑" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button data-del-id="${it.id}" title="删除" class="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // 题目卡详情: 题干之外还要能看到标准解答与评分点 (复习页只在翻答案后才显示)
  quizDetailSection(it) {
    const rubric = it.rubric || [];
    let html = '';
    if ((it.solution_md || '').trim()) {
      html += `<div>
        <div class="text-xs text-slate-400 mb-1">标准解答</div>
        <div class="md-body p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">${renderMarkdown(it.solution_md)}</div>
      </div>`;
    }
    if (rubric.length) {
      html += `<div>
        <div class="text-xs text-slate-400 mb-1">评分点 (${rubric.length})</div>
        <div class="space-y-1 text-sm">
          ${rubric.map(r => `<div class="flex items-start gap-2">
            <span class="text-xs text-slate-400">${r.score} 分</span>
            <span class="flex-1">${escapeHtml(r.point || '')}</span>
          </div>`).join('')}
        </div>
      </div>`;
    }
    if ((it.mistake_tags || []).length) {
      html += `<div>
        <div class="text-xs text-slate-400 mb-1">最近错因</div>
        <div class="flex flex-wrap gap-1">
          ${it.mistake_tags.map(t => `<span class="badge bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">${escapeHtml(mistakeTagLabel(t))}</span>`).join('')}
        </div>
      </div>`;
    }
    return html;
  },

  // 列表卡片上的一行摘要。题目卡若题干为空, 回退到"解答"摘要, 避免卡片看起来空空如也
  previewText(it) {
    const plain = (s) => (s || '').replace(/[#*`>\\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if ((it.content_md || '').trim()) return truncate(plain(it.content_md), 120);
    if (it.kind === 'quiz' && (it.solution_md || '').trim()) {
      return '解答：' + truncate(plain(it.solution_md), 110);
    }
    return '';
  },

  tableHtml() {
    const rows = this.state.items.map(it => `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" data-record-id="${it.id}">
        <td class="px-2 py-2"><input type="checkbox" data-check-id="${it.id}" ${this.state.selectedIds.has(it.id) ? 'checked' : ''} class="w-4 h-4 accent-brand-600" onclick="event.stopPropagation()"></td>
        <td class="px-2 py-2 text-sm truncate max-w-xs">${it.pinned?'📌 ':''}${escapeHtml(it.title)}</td>
        <td class="px-2 py-2 text-xs">${stateBadge(it.state)}</td>
        <td class="px-2 py-2 text-xs text-slate-500">${it.learn_date}</td>
        <td class="px-2 py-2 text-xs"><span class="badge ${it.due && it.due*1000<Date.now()?'badge-due':'bg-slate-100 dark:bg-slate-700 text-slate-500'}">${dueLabel(it.due)}</span></td>
        <td class="px-2 py-2 text-xs text-slate-500">${it.reps}/${it.lapses}</td>
        <td class="px-2 py-2 text-xs">
          <button data-edit-id="${it.id}" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">编辑</button>
          <button data-del-id="${it.id}" class="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded">删除</button>
        </td>
      </tr>
    `).join('');
    return `
      <div class="overflow-x-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
        <table class="w-full">
          <thead class="bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500">
            <tr>
              <th class="px-2 py-2 text-left w-8"></th>
              <th class="px-2 py-2 text-left">标题</th>
              <th class="px-2 py-2 text-left">状态</th>
              <th class="px-2 py-2 text-left">学习日期</th>
              <th class="px-2 py-2 text-left">下次复习</th>
              <th class="px-2 py-2 text-left">复习/遗忘</th>
              <th class="px-2 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-700">${rows}</tbody>
        </table>
      </div>
    `;
  },

  updateBatchBar() {
    const bar = document.getElementById('recBatchBar');
    const count = this.state.selectedIds.size;
    if (count > 0) {
      bar.classList.remove('hidden');
      bar.classList.add('flex');
      document.getElementById('batchCount').textContent = `已选 ${count} 项`;
    } else {
      bar.classList.add('hidden');
      bar.classList.remove('flex');
    }
    // 重新渲染列表以更新 checkbox
    this.renderList();
  },

  async batchAction(action) {
    const ids = Array.from(this.state.selectedIds);
    if (ids.length === 0) return;
    if (action === 'delete') {
      confirmDialog(`确定删除选中的 ${ids.length} 条记录? 关联图片也会被删除。`, async () => {
        await api('/api/records/batch', { method: 'POST', body: { ids, action } });
        this.state.selectedIds.clear();
        toast('已删除', 'success');
        this.load();
      }, { danger: true, okText: '删除' });
      return;
    }
    await api('/api/records/batch', { method: 'POST', body: { ids, action } });
    this.state.selectedIds.clear();
    toast('操作完成', 'success');
    this.load();
  },

  async deleteOne(id) {
    try {
      await api(`/api/records/${id}`, { method: 'DELETE' });
      toast('已删除', 'success');
      this.load();
    } catch (e) { toast('删除失败: ' + e.message, 'error'); }
  },

  // ============ 详情抽屉 ============
  async showDetail(id) {
    try {
      const it = await api(`/api/records/${id}`);
      const tags = (it.tags || []).map(t => `<span class="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">#${escapeHtml(t)}</span>`).join('');
      const images = (it.image_paths || []).map(p => `<img src="${p}" class="w-full rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer" onclick="window.open('${p}','_blank')">`).join('<div class="h-2"></div>');
      const logs = (it.review_logs || []).slice(0, 20).map(l => {
        const ratingMap = {1:['badge-due','忘记'],2:['badge-learning','模糊'],4:['badge-review','熟练']};
        const [cls, label] = ratingMap[l.rating] || ['badge-new', '未知'];
        return `<tr class="border-t border-slate-100 dark:border-slate-700">
          <td class="py-1.5 px-2 text-xs">${tsToDateTime(l.reviewed_at)}</td>
          <td class="py-1.5 px-2"><span class="badge ${cls}">${label}</span></td>
          <td class="py-1.5 px-2 text-xs text-slate-500">${l.elapsed_days}天 → ${l.scheduled_days}天</td>
          <td class="py-1.5 px-2 text-xs text-slate-500">${Math.round(l.retention*100)}%</td>
          <td class="py-1.5 px-2 text-xs text-slate-500">S:${l.stability_after.toFixed(1)} D:${l.difficulty_after.toFixed(1)}</td>
        </tr>`;
      }).join('');

      const content = `
        <div class="p-5 space-y-4">
          <div class="flex items-start gap-2 flex-wrap">
            ${stateBadge(it.state)}
            ${it.pinned ? '<span class="badge badge-pinned">置顶</span>' : ''}
            <span class="badge bg-slate-100 dark:bg-slate-700 text-slate-500">${dueLabel(it.due)}</span>
            <div class="ml-auto flex gap-1">
              <button class="btn btn-outline" onclick="RecordsTab.showEditor(${it.id})">编辑</button>
              <button class="btn btn-primary" onclick="closeDrawer(); App.switchTab('review'); setTimeout(()=>ReviewTab.jumpToCard(${it.id}), 200);">立即复习</button>
            </div>
          </div>
          <div>
            <div class="text-xs text-slate-400 mb-1">标题</div>
            <h1 class="text-lg font-bold">${it.kind === 'quiz' ? '<span class="badge bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 mr-1">题目</span>' : ''}${escapeHtml(it.title)}</h1>
          </div>
          ${tags ? `<div class="flex gap-1 flex-wrap">${tags}</div>` : ''}
          ${it.kind === 'quiz' ? this.quizDetailSection(it) : ''}
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">学习日期</div><div class="font-medium">${it.learn_date}</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">下次复习</div><div class="font-medium">${dueLabel(it.due)}</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">复习次数</div><div class="font-medium">${it.reps} 次</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">遗忘次数</div><div class="font-medium">${it.lapses} 次</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">记忆稳定性</div><div class="font-medium">${it.stability.toFixed(2)} 天</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">难度</div><div class="font-medium">${it.difficulty.toFixed(2)} / 10</div></div>
          </div>
          ${it.content_md ? `
            <div>
              <div class="text-xs text-slate-400 mb-1">Markdown 内容（选中文字右键可添加批注）</div>
              <div class="md-body p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg anno-target" id="detailMdBody">${renderMarkdown(it.content_md)}</div>
            </div>` : ''}
          ${images ? `
            <div>
              <div class="text-xs text-slate-400 mb-1">图片 (${it.image_paths.length})</div>
              <div class="space-y-2">${images}</div>
            </div>` : ''}
          ${it.note ? `<div><div class="text-xs text-slate-400 mb-1">备注</div><div class="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">${escapeHtml(it.note)}</div></div>` : ''}
          ${(it.annotations && it.annotations.length) ? `
            <div>
              <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
                <span>批注 (${it.annotations.length})</span>
                <button class="text-xs text-brand-600 hover:underline" onclick="openAnnotationDrawer(${it.id}, '')">添加批注</button>
              </div>
              <div class="space-y-2">${it.annotations.map(annoListItem).join('')}</div>
            </div>` : `
            <div>
              <button class="btn btn-outline w-full text-sm" onclick="openAnnotationDrawer(${it.id}, '')">+ 添加批注（选中正文右键也可）</button>
            </div>`}
          <div id="detailMnSection">
            ${mnemonicsSection(it.mnemonics || [], it.id)}
          </div>
          ${logs ? `
            <div>
              <div class="text-xs text-slate-400 mb-1">复习历史 (最近 ${Math.min(it.review_logs.length, 20)} 次)</div>
              <div class="overflow-x-auto bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <table class="w-full">
                  <thead class="text-xs text-slate-400">
                    <tr><th class="text-left py-1.5 px-2">时间</th><th class="text-left py-1.5 px-2">评分</th><th class="text-left py-1.5 px-2">间隔</th><th class="text-left py-1.5 px-2">保留率</th><th class="text-left py-1.5 px-2">FSRS</th></tr>
                  </thead>
                  <tbody>${logs}</tbody>
                </table>
              </div>
            </div>` : ''}
        </div>
      `;
      openDrawer(it.title, content, { width: '640px' });
      // 批注: 正文内联高亮 + 右键菜单
      const detailBody = document.getElementById('detailMdBody');
      if (detailBody) {
        applyAnnotations(detailBody, it.annotations || []);
        initAnnotationContextMenu(detailBody, it.id);
      }
      // 速记: 抽屉里增删改后, 局部刷新详情里的速记区块 (不用重开整个抽屉)
      const rid = it.id;
      window.__mnemonicViews = (window.__mnemonicViews || []).filter(v => v.recordId !== rid);
      window.__mnemonicViews.push({
        recordId: rid,
        redraw: async () => {
          const box = document.getElementById('detailMnSection');
          if (!box) return;
          const res = await api(`/api/records/${rid}/mnemonics`).catch(() => null);
          box.innerHTML = mnemonicsSection((res && res.items) || [], rid);
        },
      });
    } catch (e) {
      toast('加载详情失败: ' + e.message, 'error');
    }
  },

  // ============ 编辑器 ============
  showEditor(id = null) {
    const isEdit = !!id;
    const content = `
      <div class="p-5 space-y-3">
        <div>
          <label class="block text-xs text-slate-400 mb-1">标题 *</label>
          <div class="flex items-center gap-2">
            <input id="edTitle" type="text" placeholder="给这条记忆起个名字…" class="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
            <button id="edAiTitleBtn" type="button" title="用 AI 根据正文生成标题"
                    class="btn btn-outline text-sm whitespace-nowrap" style="display:none">✨ AI 标题</button>
          </div>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">标签 (逗号或空格分隔)</label>
          <input id="edTags" type="text" placeholder="例如: 英语, 单词, GRE" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">类型</label>
          <div class="flex items-center gap-4 text-sm">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="edKind" value="note" checked class="accent-brand-600"> 笔记
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="edKind" value="quiz" class="accent-brand-600"> 题目（错题）
            </label>
          </div>
        </div>
        <div id="edQuizFields" style="display:none" class="space-y-3">
          <div>
            <label class="block text-xs text-slate-400 mb-1">标准解答 (Markdown + 公式)</label>
            ${buildMarkdownEditor('sol', { label: '标准解答', rows: 5 })}
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">评分点 rubric（一行一个，格式：分值|要点）</label>
            <textarea id="edRubric" rows="4" placeholder="3|正确列出方程并列出所有受力&#10;1|符号方向约定一致&#10;2|最终数值与单位正确" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"></textarea>
            <p class="text-xs text-slate-400 mt-1">复习时逐条勾选是否拿到分，未拿满需选择错因。</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs text-slate-400 mb-1">学习日期</label>
            <input id="edLearnDate" type="date" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">优先级 (0-9)</label>
            <input id="edPriority" type="number" min="0" max="9" value="0" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
          </div>
        </div>
        <div>
          ${buildMarkdownEditor('ed')}
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">图片 (可粘贴 / 拖拽 / 点击上传)</label>
          <div id="edDropzone" class="dropzone">
            <input id="edFileInput" type="file" multiple accept="image/*" class="hidden">
            <div class="text-sm">📎 点击选择 / 拖拽到此处 / Ctrl+V 粘贴图片</div>
          </div>
          <div id="edImageList" class="flex flex-wrap gap-2 mt-2"></div>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">备注</label>
          <input id="edNote" type="text" placeholder="可选" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
        </div>
        <div class="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <label class="flex items-center gap-1.5 text-sm">
            <input id="edPinned" type="checkbox" class="w-4 h-4 accent-brand-600"> 置顶
          </label>
          <div class="flex-1"></div>
          <button class="btn btn-outline" onclick="closeDrawer()">取消</button>
          <button id="edSaveBtn" class="btn btn-primary">${isEdit ? '保存' : '创建'}</button>
        </div>
      </div>
    `;
    openDrawer(isEdit ? '编辑记录' : '新增记录', content, { width: '560px' });

    const imagePaths = [];
    const renderImageList = () => {
      const list = document.getElementById('edImageList');
      list.innerHTML = imagePaths.map((p, i) => `
        <div class="relative group">
          <img src="${p}" class="w-20 h-20 object-cover rounded border border-slate-200 dark:border-slate-700">
          <button data-remove="${i}" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100">×</button>
        </div>
      `).join('');
      list.querySelectorAll('[data-remove]').forEach(b => {
        b.onclick = () => { imagePaths.splice(parseInt(b.dataset.remove), 1); renderImageList(); };
      });
    };

    // ---- AI 标题 (可选增强): 仅在 AI 已配置且正文非空时出现 ----
    const aiTitleBtn = document.getElementById('edAiTitleBtn');
    const syncAiTitleBtn = () => {
      if (!aiTitleBtn) return;
      const hasContent = (document.getElementById('edContent')?.value || '').trim().length > 0;
      // 未配置 / 熔断回退 / 正文为空 -> 按钮不渲染 (不是置灰)
      aiTitleBtn.style.display = (aiEnabled() && hasContent) ? '' : 'none';
    };
    const edContentEl = document.getElementById('edContent');
    if (edContentEl) edContentEl.addEventListener('input', syncAiTitleBtn);
    if (aiTitleBtn) {
      aiTitleBtn.onclick = async () => {
        const content = (document.getElementById('edContent')?.value || '').trim();
        if (!content) { toast('请先填写正文', 'error'); return; }
        aiTitleBtn.disabled = true;
        const oldText = aiTitleBtn.textContent;
        aiTitleBtn.textContent = '✨ 生成中…';
        try {
          const res = await api('/api/ai/title', { method: 'POST', body: { content_md: content } });
          document.getElementById('edTitle').value = res.title;
          toast('已生成标题', 'success');
        } catch (e) {
          const disabled = aiNoteFailure('生成标题失败', e);
          if (disabled) aiTitleBtn.style.display = 'none';
        } finally {
          aiTitleBtn.disabled = false;
          aiTitleBtn.textContent = oldText;
        }
      };
    }
    syncAiTitleBtn();

    // ---- 事项4 (错题): 类型切换 -> 显示/隐藏解答与 rubric ----
    const quizFields = document.getElementById('edQuizFields');
    const syncQuizFields = () => {
      const kind = document.querySelector('input[name="edKind"]:checked')?.value || 'note';
      if (quizFields) quizFields.style.display = kind === 'quiz' ? '' : 'none';
    };
    document.querySelectorAll('input[name="edKind"]').forEach(r => {
      r.onchange = syncQuizFields;
    });
    syncQuizFields();
    initMarkdownEditor('sol', {});

    // 加载已有数据
    if (isEdit) {
      api(`/api/records/${id}`).then(it => {
        document.getElementById('edTitle').value = it.title || '';
        document.getElementById('edTags').value = (it.tags || []).join(', ');
        document.getElementById('edLearnDate').value = it.learn_date || '';
        document.getElementById('edPriority').value = it.priority || 0;
        document.getElementById('edContent').value = it.content_md || '';
        document.getElementById('edNote').value = it.note || '';
        document.getElementById('edPinned').checked = !!it.pinned;
        // 事项4: 题目卡的解答与 rubric 回显
        const kind = it.kind || 'note';
        const kr = document.querySelector(`input[name="edKind"][value="${kind}"]`);
        if (kr) kr.checked = true;
        const solEl = document.getElementById('solContent');
        if (solEl) solEl.value = it.solution_md || '';
        const rubEl = document.getElementById('edRubric');
        if (rubEl) rubEl.value = rubricToText(it.rubric || []);
        syncQuizFields();
        (it.image_paths || []).forEach(p => imagePaths.push(p));
        renderImageList();
        syncAiTitleBtn();
      });
    } else {
      document.getElementById('edLearnDate').value = new Date().toISOString().slice(0, 10);
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      document.getElementById('edTitle').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    // 文件上传
    const fileInput = document.getElementById('edFileInput');
    const dropzone = document.getElementById('edDropzone');
    dropzone.onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      const fd = new FormData();
      files.forEach(f => fd.append('images', f));
      try {
        const res = await api('/api/records/upload_image', { method: 'POST', body: fd });
        res.urls.forEach(u => imagePaths.push(u));
        renderImageList();
        toast(`已上传 ${res.urls.length} 张图片`, 'success');
      } catch (err) { toast('上传失败: ' + err.message, 'error'); }
    };
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dragover'); };
    dropzone.ondragleave = () => dropzone.classList.remove('dragover');
    dropzone.ondrop = async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length === 0) return;
      const fd = new FormData();
      files.forEach(f => fd.append('images', f));
      const res = await api('/api/records/upload_image', { method: 'POST', body: fd });
      res.urls.forEach(u => imagePaths.push(u));
      renderImageList();
    };
    // 共用 Markdown 编辑器: 粘贴自动修正 + 修正格式 + 预览 + (卡片含图片粘贴上传)
    initMarkdownEditor('ed', {
      imageUploader: async (files) => {
        const fd = new FormData();
        files.forEach(f => fd.append('images', f));
        try {
          const res = await api('/api/records/upload_image', { method: 'POST', body: fd });
          res.urls.forEach(u => imagePaths.push(u));
          renderImageList();
          return res.urls;
        } catch (err) { toast('上传失败: ' + err.message, 'error'); return []; }
      },
    });

    // 保存
    document.getElementById('edSaveBtn').onclick = async () => {
      const data = {
        title: document.getElementById('edTitle').value.trim(),
        tags: document.getElementById('edTags').value,
        learn_date: document.getElementById('edLearnDate').value,
        priority: parseInt(document.getElementById('edPriority').value) || 0,
        content_md: document.getElementById('edContent').value,
        note: document.getElementById('edNote').value,
        pinned: document.getElementById('edPinned').checked ? 1 : 0,
        // ---- 事项4 (错题) ----
        kind: document.querySelector('input[name="edKind"]:checked')?.value || 'note',
        solution_md: document.getElementById('solContent')?.value || '',
        rubric: parseRubricText(document.getElementById('edRubric')?.value || ''),
        image_paths: imagePaths,
      };
      if (!data.title) { toast('请输入标题', 'error'); return; }
      try {
        if (isEdit) {
          await api(`/api/records/${id}`, { method: 'PUT', body: data });
          toast('已保存', 'success');
        } else {
          await api('/api/records', { method: 'POST', body: data });
          toast('已创建', 'success');
        }
        closeDrawer();
        this.load();
        ReviewTab.refreshBadge();
      } catch (e) {
        toast('保存失败: ' + e.message, 'error');
      }
    };
  },

  // ============ 导入对话框 ============
  showImportDialog() {
    const content = `
      <div class="p-5 space-y-3">
        <div class="text-sm text-slate-600 dark:text-slate-300">
          支持从 Markdown 文本批量导入, 每个 <code class="bg-slate-100 dark:bg-slate-700 px-1 rounded"># 一级标题</code> 作为一张卡片标题, 后续内容作为正文。
          若没有标题则整篇作为一张卡片。
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">上传 .md 文件</label>
          <input id="impFile" type="file" accept=".md,.markdown,.txt" class="text-sm">
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs text-slate-400">或直接粘贴 Markdown</label>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer" title="粘贴 / 导入时自动修正格式">
                <input id="impAutoFormat" type="checkbox" class="w-3.5 h-3.5 accent-brand-600" checked> 自动修正
              </label>
              <button id="impFixBtn" class="text-xs text-brand-600 hover:underline" type="button">修正格式</button>
            </div>
          </div>
          <textarea id="impText" rows="8" placeholder="# 第一张卡&#10;内容...&#10;&#10;# 第二张卡&#10;内容..." class="w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 resize-y"></textarea>
          ${formatOptionsPanel('imp')}
        </div>
        <div class="flex justify-end gap-2">
          <button class="btn btn-outline" onclick="closeDrawer()">取消</button>
          <button id="impBtn" class="btn btn-primary">导入</button>
        </div>
      </div>
    `;
    openDrawer('从 Markdown 导入', content, { width: '600px' });
    document.getElementById('impFile').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const text = await f.text();
      document.getElementById('impText').value = text;
    };
    // 粘贴时自动修正
    const impText = document.getElementById('impText');
    bindPasteFormat(impText, () => ({
      enabled: document.getElementById('impAutoFormat')?.checked,
      options: readFormatOpts('imp'),
    }));
    // 一键修正
    const impFixBtn = document.getElementById('impFixBtn');
    impFixBtn.onclick = async () => {
      impFixBtn.textContent = '修正中…';
      impFixBtn.disabled = true;
      impText.value = await formatMarkdownText(impText.value, readFormatOpts('imp'));
      impFixBtn.textContent = '修正格式';
      impFixBtn.disabled = false;
      toast('已修正格式', 'success');
    };
    document.getElementById('impBtn').onclick = async () => {
      const text = document.getElementById('impText').value;
      if (!text.trim()) { toast('请输入或上传内容', 'error'); return; }
      const fix = document.getElementById('impAutoFormat')?.checked ? 1 : 0;
      const options = readFormatOpts('imp');
      try {
        const res = await api('/api/records/import_md', {
          method: 'POST',
          body: { text, fix, options },
        });
        toast(`已导入 ${res.imported} 条记录`, 'success');
        closeDrawer();
        this.load();
        ReviewTab.refreshBadge();
      } catch (e) {
        toast('导入失败: ' + e.message, 'error');
      }
    };
  },

  // ============ 导出对话框 ============
  showExportDialog() {
    const content = `
      <div class="p-5 space-y-3">
        <div class="text-sm text-slate-600 dark:text-slate-300">选择导出格式:</div>
        <button class="btn btn-outline w-full justify-start" onclick="location.href='/api/records/export?format=csv'">
          <span class="text-lg">📊</span>
          <div class="text-left">
            <div class="font-medium">CSV 表格</div>
            <div class="text-xs text-slate-400">所有字段, 适合 Excel 分析</div>
          </div>
        </button>
        <button class="btn btn-outline w-full justify-start" onclick="location.href='/api/records/export?format=md'">
          <span class="text-lg">📝</span>
          <div class="text-left">
            <div class="font-medium">Markdown 单文件</div>
            <div class="text-xs text-slate-400">合并为一份 .md 文档</div>
          </div>
        </button>
        <div class="text-xs text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          导出包含全部记录 (标题/标签/内容/图片/FSRS 参数/复习次数)
        </div>
      </div>
    `;
    openDrawer('导出记录', content, { width: '440px' });
  },
};
