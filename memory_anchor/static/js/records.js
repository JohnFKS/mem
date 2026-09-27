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
    const tags = (it.tags || []).map(t => `<span class="badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${escapeHtml(t)}</span>`).join('');
    const images = (it.image_paths || []).slice(0, 3).map(p => `<img src="${p}" class="w-12 h-12 object-cover rounded">`).join('');
    const dueClass = it.due && it.due * 1000 < Date.now() ? 'badge-due' : 'bg-slate-100 dark:bg-slate-700 text-slate-500';
    return `
      <div class="record-card flex items-start gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer" data-record-id="${it.id}">
        <input type="checkbox" data-check-id="${it.id}" ${this.state.selectedIds.has(it.id) ? 'checked' : ''} 
               class="mt-1 w-4 h-4 rounded accent-brand-600" ${this.state.selectedIds.size > 0 ? '' : 'hidden'}>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            ${it.pinned ? '<span class="badge badge-pinned">置顶</span>' : ''}
            <h3 class="font-medium text-sm truncate flex-1">${escapeHtml(it.title)}</h3>
            ${stateBadge(it.state)}
          </div>
          ${it.content_md ? `<div class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-1">${escapeHtml(truncate(it.content_md.replace(/[#*`>\\-]/g,''), 120))}</div>` : ''}
          <div class="flex items-center gap-1.5 flex-wrap">
            ${tags}
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
      const annsRes = await api(`/api/annotations/record/${id}`);
      const annotations = annsRes.items || [];

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

      const annsHtml = annotations.map(ann => `
        <div class="p-3 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
          ${ann.quote ? `<div class="text-xs text-slate-500 italic border-l-2 border-slate-300 dark:border-slate-600 pl-2">"${escapeHtml(ann.quote)}"</div>` : ''}
          <div class="md-body text-sm">${renderMarkdown(ann.note_md)}</div>
          <div class="flex items-center gap-2 text-[10px] text-slate-400">
            <span>${tsToDateTime(ann.created_at)}</span>
            <div class="ml-auto flex gap-1">
              <button class="text-brand-600 hover:underline" onclick="RecordsTab.editAnnotation(${ann.id}, ${id})">编辑</button>
              <button class="text-red-600 hover:underline" onclick="RecordsTab.deleteAnnotation(${ann.id}, ${id})">删除</button>
            </div>
          </div>
        </div>
      `).join('');

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
            <h1 class="text-lg font-bold">${escapeHtml(it.title)}</h1>
          </div>
          ${tags ? `<div class="flex gap-1 flex-wrap">${tags}</div>` : ''}
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">学习日期</div><div class="font-medium">${it.learn_date}</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">下次复习</div><div class="font-medium">${dueLabel(it.due)}</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">复习次数</div><div class="font-medium">${it.reps} 次</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">遗忘次数</div><div class="font-medium">${it.lapses} 次</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">记忆稳定性</div><div class="font-medium">${it.stability.toFixed(2)} 天</div></div>
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded p-2"><div class="text-slate-400">难度</div><div class="font-medium">${it.difficulty.toFixed(2)} / 10</div></div>
          </div>
          ${it.content_md ? `
            <div id="detailContent">
              <div class="text-xs text-slate-400 mb-1">Markdown 内容</div>
              <div class="md-body p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg select-text">${renderMarkdown(it.content_md)}</div>
            </div>` : ''}
          ${images ? `
            <div>
              <div class="text-xs text-slate-400 mb-1">图片 (${it.image_paths.length})</div>
              <div class="space-y-2">${images}</div>
            </div>` : ''}
          ${it.note ? `<div><div class="text-xs text-slate-400 mb-1">备注</div><div class="text-sm p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">${escapeHtml(it.note)}</div></div>` : ''}
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="text-xs text-slate-400">批注 (${annotations.length})</div>
              <button class="btn btn-outline text-xs" onclick="RecordsTab.addAnnotation(${id})">+ 新增批注</button>
            </div>
            <div class="space-y-2">${annsHtml || '<div class="text-xs text-slate-400 text-center py-4">暂无批注</div>'}</div>
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

      // 绑定文本选中事件用于快捷批注
      setTimeout(() => {
        const detailContent = document.getElementById('detailContent');
        if (detailContent) {
          detailContent.addEventListener('mouseup', () => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            if (selectedText) {
              RecordsTab.addAnnotation(id, selectedText);
            }
          });
        }
      }, 100);
    } catch (e) {
      toast('加载详情失败: ' + e.message, 'error');
    }
  },

  // ============ 批注功能 ============
  addAnnotation(recordId, selectedQuote = '') {
    const editor = buildMarkdownEditor({
      prefix: 'ann',
      showQuote: true,
      rows: 5,
      label: '批注笔记',
      quoteLabel: '引用片段',
      quotePlaceholder: '选中的原文片段 (可空 = 整卡批注)'
    });

    const content = `
      <div class="p-5 space-y-3">
        ${editor.html}
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button class="btn btn-outline" onclick="closeDrawer()">取消</button>
          <button id="annSaveBtn" class="btn btn-primary">保存</button>
        </div>
      </div>
    `;
    openDrawer('新增批注', content, { width: '560px' });
    setTimeout(() => {
      editor.init();
      if (selectedQuote) {
        editor.setValue({ quote: selectedQuote, content_md: '' });
      }
      document.getElementById('annSaveBtn').onclick = async () => {
        const data = editor.getValue();
        if (!data.content_md.trim()) {
          toast('请输入批注内容', 'error');
          return;
        }
        try {
          await api('/api/annotations', {
            method: 'POST',
            body: { record_id: recordId, quote: data.quote, note_md: data.content_md }
          });
          toast('批注已保存', 'success');
          closeDrawer();
          this.showDetail(recordId);
        } catch (e) {
          toast('保存失败: ' + e.message, 'error');
        }
      };
    }, 100);
  },

  async editAnnotation(annId, recordId) {
    try {
      const annsRes = await api(`/api/annotations/record/${recordId}`);
      const ann = (annsRes.items || []).find(a => a.id === annId);
      if (!ann) return;

      const editor = buildMarkdownEditor({
        prefix: 'ann',
        showQuote: true,
        rows: 5,
        label: '批注笔记',
        quoteLabel: '引用片段'
      });

      const content = `
        <div class="p-5 space-y-3">
          ${editor.html}
          <div class="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button class="btn btn-outline" onclick="closeDrawer()">取消</button>
            <button id="annSaveBtn" class="btn btn-primary">保存</button>
          </div>
        </div>
      `;
      openDrawer('编辑批注', content, { width: '560px' });
      setTimeout(() => {
        editor.init();
        editor.setValue({ quote: ann.quote, content_md: ann.note_md });
        document.getElementById('annSaveBtn').onclick = async () => {
          const data = editor.getValue();
          if (!data.content_md.trim()) {
            toast('请输入批注内容', 'error');
            return;
          }
          try {
            await api(`/api/annotations/${annId}`, {
              method: 'PUT',
              body: { quote: data.quote, note_md: data.content_md }
            });
            toast('已更新', 'success');
            closeDrawer();
            this.showDetail(recordId);
          } catch (e) {
            toast('更新失败: ' + e.message, 'error');
          }
        };
      }, 100);
    } catch (e) {
      toast('加载失败: ' + e.message, 'error');
    }
  },

  async deleteAnnotation(annId, recordId) {
    confirmDialog('确定删除此批注吗?', async () => {
      try {
        await api(`/api/annotations/${annId}`, { method: 'DELETE' });
        toast('已删除', 'success');
        this.showDetail(recordId);
      } catch (e) {
        toast('删除失败: ' + e.message, 'error');
      }
    }, { danger: true, okText: '删除' });
  },

  // ============ 编辑器 ============
  showEditor(id = null) {
    const isEdit = !!id;
    const content = `
      <div class="p-5 space-y-3">
        <div>
          <label class="block text-xs text-slate-400 mb-1">标题 *</label>
          <input id="edTitle" type="text" placeholder="给这条记忆起个名字…" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">标签 (逗号或空格分隔)</label>
          <input id="edTags" type="text" placeholder="例如: 英语, 单词, GRE" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
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
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs text-slate-400">Markdown 内容</label>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer" title="粘贴时自动修正格式 (去空行 / 项目符号 / LaTeX 公式等)">
                <input id="edAutoFormat" type="checkbox" class="w-3.5 h-3.5 accent-brand-600" checked> 粘贴自动修正
              </label>
              <button id="edFixBtn" class="text-xs text-brand-600 hover:underline" type="button">修正格式</button>
              <button id="edPreviewBtn" class="text-xs text-brand-600 hover:underline">预览</button>
            </div>
          </div>
          <textarea id="edContent" rows="8" placeholder="支持 Markdown 语法&#10;# 一级标题&#10;**加粗** *斜体*&#10;- 列表项&#10;\`code\`" class="w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 resize-y"></textarea>
          ${formatOptionsPanel('ed')}
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
        (it.image_paths || []).forEach(p => imagePaths.push(p));
        renderImageList();
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
    // 粘贴处理: 图片走上传, 纯文本可选自动格式修正
    document.getElementById('edContent').addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items || [];
      const files = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        const fd = new FormData();
        files.forEach(f => fd.append('images', f));
        const res = await api('/api/records/upload_image', { method: 'POST', body: fd });
        res.urls.forEach(u => imagePaths.push(u));
        renderImageList();
        // 同时插入 markdown 引用
        const ta = e.target;
        const ins = res.urls.map(u => `![](${u})`).join('\n');
        const start = ta.selectionStart;
        ta.value = ta.value.slice(0, start) + ins + '\n' + ta.value.slice(start);
        ta.selectionStart = ta.selectionEnd = start + ins.length + 1;
        return;
      }
      // 纯文本粘贴: 若开启自动修正, 经后端规整后再插入 (含用户勾选的进阶选项)
      const autoFmt = document.getElementById('edAutoFormat')?.checked;
      if (autoFmt) {
        const clip = e.clipboardData?.getData('text');
        if (clip != null) {
          e.preventDefault();
          const formatted = await formatMarkdownText(clip, readFormatOpts('ed'));
          insertAtCursor(e.target, formatted);
        }
      }
    });

    // 一键修正当前文本域格式
    const edFixBtn = document.getElementById('edFixBtn');
    edFixBtn.onclick = async () => {
      const ta = document.getElementById('edContent');
      edFixBtn.textContent = '修正中…';
      edFixBtn.disabled = true;
      ta.value = await formatMarkdownText(ta.value, readFormatOpts('ed'));
      edFixBtn.textContent = '修正格式';
      edFixBtn.disabled = false;
      toast('已修正格式', 'success');
    };

    // 预览切换
    document.getElementById('edPreviewBtn').onclick = () => {
      const ta = document.getElementById('edContent');
      const btn = document.getElementById('edPreviewBtn');
      if (ta.dataset.preview === '1') {
        ta.dataset.preview = '0';
        ta.style.display = '';
        ta.value = ta.dataset.raw || ta.value;
        btn.textContent = '预览';
      } else {
        ta.dataset.preview = '1';
        ta.dataset.raw = ta.value;
        ta.style.display = 'none';
        const wrap = document.createElement('div');
        wrap.className = 'md-body w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 min-h-[8rem]';
        wrap.id = 'edPreviewWrap';
        wrap.innerHTML = renderMarkdown(ta.value);
        ta.parentNode.insertBefore(wrap, ta);
        btn.textContent = '编辑';
      }
    };

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
