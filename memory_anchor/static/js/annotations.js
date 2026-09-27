/* Memory Anchor - 右键批注功能
 *
 * 设计要点:
 *  - 批注是学习记录的"附属信息", 不单独复习, 也不支持"批注的批注"。
 *  - 每条批注抓两样东西: quote (被批注的原文快照, 可空=整卡批注) + note_md (新理解, 支持 Markdown+公式)。
 *  - 体验: 在卡片正文里选中一段 -> 右键"对选中文字添加批注" -> 选中文字自动变成引用 -> 在下面写笔记。
 *  - 复习页 / 详情页的正文里, 带 quote 的批注会按"引用内容"在**所有出现位置**高亮 (内容相同但位置不同也会全部显示),
 *    悬浮即显示批注笔记; 不依赖脆弱的字符偏移。
 */

// ==================== 批注抽屉 ====================
// recordId: 归属卡片; prefillQuote: 预填引用 (来自选中文字); editAnno: 编辑已有批注对象
async function openAnnotationDrawer(recordId, prefillQuote = '', editAnno = null) {
  const content = `
    <div class="p-5 space-y-4">
      <div>
        <div class="text-xs text-slate-400 mb-1">引用片段（可选，留空=整卡批注；可手改）</div>
        <textarea id="anQuote" rows="2" placeholder="选中正文里的某段文字后右键即可自动带入，也可手动填写或留空" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 resize-y"></textarea>
      </div>
      <div>
        <div class="text-xs text-slate-400 mb-1">批注笔记（支持 Markdown 与公式，与新建卡片一致）</div>
        ${buildMarkdownEditor('an', { label: '批注笔记', rows: 6 })}
      </div>
      <div class="flex items-center gap-2">
        <button id="anSaveBtn" class="btn btn-primary">保存批注</button>
        <button id="anCancelEdit" class="btn btn-outline hidden">取消编辑</button>
      </div>
      <div>
        <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
          <span>已有批注 (<span id="anCount">0</span>)</span>
        </div>
        <div id="anList" class="space-y-2"></div>
      </div>
    </div>
  `;
  openDrawer(editAnno ? '编辑批注' : '添加批注', content, { width: '600px' });

  const listEl = document.getElementById('anList');
  const countEl = document.getElementById('anCount');
  const quoteEl = document.getElementById('anQuote');
  const saveBtn = document.getElementById('anSaveBtn');
  const cancelEditBtn = document.getElementById('anCancelEdit');
  quoteEl.value = (editAnno && editAnno.quote) || prefillQuote || '';
  let editingId = editAnno ? editAnno.id : null;

  initMarkdownEditor('an');

  async function refreshList() {
    const anns = await api(`/api/records/${recordId}/annotations`).catch(() => []);
    countEl.textContent = anns.length;
    listEl.innerHTML = anns.length
      ? anns.map(annoListItem).join('')
      : '<p class="text-xs text-slate-400">暂无批注</p>';
    if (window.refreshAnnoHighlights) window.refreshAnnoHighlights(recordId);
  }

  saveBtn.onclick = async () => {
    const quote = quoteEl.value.trim();
    const note_md = document.getElementById('anContent').value;
    if (!note_md.trim() && !quote) { toast('请填写批注内容或引用', 'error'); return; }
    try {
      if (editingId) {
        await api(`/api/records/${recordId}/annotations/${editingId}`, { method: 'PUT', body: { quote, note_md } });
      } else {
        await api(`/api/records/${recordId}/annotations`, { method: 'POST', body: { quote, note_md } });
      }
      toast('已保存批注', 'success');
      editingId = null;
      quoteEl.value = '';
      document.getElementById('anContent').value = '';
      saveBtn.textContent = '保存批注';
      cancelEditBtn.classList.add('hidden');
      await refreshList();
    } catch (e) { toast('保存失败: ' + e.message, 'error'); }
  };

  cancelEditBtn.onclick = () => {
    editingId = null;
    quoteEl.value = '';
    document.getElementById('anContent').value = '';
    saveBtn.textContent = '保存批注';
    cancelEditBtn.classList.add('hidden');
  };

  await refreshList();
}

// 单条批注的展示 HTML (引用块 + 渲染后的笔记 + 编辑/删除)
function annoListItem(a) {
  const quoteHtml = a.quote
    ? `<blockquote class="border-l-2 border-amber-400 pl-2 text-slate-500 text-xs my-1 whitespace-pre-wrap">${escapeHtml(a.quote)}</blockquote>`
    : '<div class="text-xs text-slate-400 mb-1">整卡批注</div>';
  const noteHtml = a.note_md
    ? renderMarkdown(a.note_md)
    : '<span class="text-slate-400 text-xs">（无笔记内容）</span>';
  const rid = a.record_id != null ? a.record_id : a.recordId;
  return `<div class="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-800" data-aid="${a.id}">
    ${quoteHtml}
    <div class="md-body text-sm">${noteHtml}</div>
    <div class="flex items-center gap-2 mt-2 text-xs">
      <span class="text-slate-400">${relativeTime(a.created_at)}</span>
      <div class="flex-1"></div>
      <button data-act="anno-edit" data-rid="${rid}" data-aid="${a.id}" class="text-brand-600 hover:underline">编辑</button>
      <button data-act="anno-del" data-rid="${rid}" data-aid="${a.id}" class="text-red-500 hover:underline">删除</button>
    </div>
  </div>`;
}

// 全局委托: 批注列表里的编辑/删除 (详情页与批注抽屉共用同一套按钮)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act="anno-edit"],[data-act="anno-del"]');
  if (!btn) return;
  const rid = btn.dataset.rid;
  const aid = btn.dataset.aid;
  if (btn.dataset.act === 'anno-edit') {
    try {
      const a = await api(`/api/records/${rid}/annotations/${aid}`);
      openAnnotationDrawer(rid, '', a);
    } catch (err) { toast('加载失败: ' + err.message, 'error'); }
  } else if (btn.dataset.act === 'anno-del') {
    if (!confirm('确定删除该批注？')) return;
    try {
      await api(`/api/records/${rid}/annotations/${aid}`, { method: 'DELETE' });
      toast('已删除批注', 'success');
      // 刷新当前能找到的批注列表 (详情页 or 批注抽屉)
      const listEl = document.getElementById('anList');
      if (listEl) {
        const anns = await api(`/api/records/${rid}/annotations`).catch(() => []);
        document.getElementById('anCount').textContent = anns.length;
        listEl.innerHTML = anns.length ? anns.map(annoListItem).join('') : '<p class="text-xs text-slate-400">暂无批注</p>';
      }
      if (window.refreshAnnoHighlights) window.refreshAnnoHighlights(rid);
    } catch (err) { toast('删除失败: ' + err.message, 'error'); }
  }
});

// ==================== 正文内联高亮 + 悬浮 ====================
// 把批注按"引用内容"在正文 DOM 的所有文本节点中高亮 (相同内容多处都会显示)
function applyAnnotations(el, annotations) {
  if (!el || !annotations || !annotations.length) return;
  window.__annoNotes = window.__annoNotes || {};
  // 先收集当前所有文本节点
  const textNodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let n;
  while ((n = walker.nextNode())) {
    // 跳过已在高亮 span 内的文本 (避免重复处理)
    if (n.parentNode && n.parentNode.classList && n.parentNode.classList.contains('anno-hl')) continue;
    if (n.nodeValue && n.nodeValue.trim()) textNodes.push(n);
  }
  annotations.forEach(a => {
    if (!a.quote) return; // 整卡批注不高亮
    window.__annoNotes[a.id] = renderMarkdown(a.note_md || '');
    const q = a.quote;
    textNodes.forEach(tn => {
      let pos = tn.nodeValue.indexOf(q);
      if (pos === -1) return;
      const frag = document.createDocumentFragment();
      let rest = tn.nodeValue;
      let from = 0;
      while ((pos = rest.indexOf(q)) !== -1) {
        if (pos > 0) frag.appendChild(document.createTextNode(rest.slice(0, pos)));
        const span = document.createElement('span');
        span.className = 'anno-hl';
        span.dataset.aid = a.id;
        span.textContent = q;
        frag.appendChild(span);
        from += pos + q.length;
        rest = rest.slice(pos + q.length);
      }
      if (rest) frag.appendChild(document.createTextNode(rest));
      tn.parentNode.replaceChild(frag, tn);
    });
  });
}

// 悬浮显示批注笔记 (全局, 初始化一次)
function initAnnotationTooltip() {
  if (window.__annoTooltipInited) return;
  window.__annoTooltipInited = true;
  const tip = document.createElement('div');
  tip.className = 'anno-tooltip';
  tip.style.display = 'none';
  document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => {
    const hl = e.target.closest && e.target.closest('.anno-hl');
    if (!hl) { tip.style.display = 'none'; return; }
    const aid = hl.dataset.aid;
    const html = (window.__annoNotes && window.__annoNotes[aid]) || '';
    tip.innerHTML = `<div class="text-xs text-slate-400 mb-1">批注笔记</div><div class="md-body">${html}</div>`;
    tip.style.display = 'block';
    // 定位 (避免溢出视口)
    const r = hl.getBoundingClientRect();
    tip.style.top = r.bottom + 8 + 'px';
    let left = r.left;
    const tw = tip.offsetWidth;
    if (left + tw > window.innerWidth - 10) left = window.innerWidth - tw - 10;
    tip.style.left = Math.max(8, left) + 'px';
  });
}

// 重新对正文应用批注高亮 (删除/新增批注后刷新用)。外部把"当前卡片正文容器"注册到这里。
window.__annoTargets = [];   // [{recordId, el}]
window.refreshAnnoHighlights = function (recordId) {
  window.__annoTargets
    .filter(t => !recordId || t.recordId === recordId)
    .forEach(t => {
      // 重新渲染正文 + 高亮: 通过回调让宿主用最新批注重绘
      if (t.redraw) t.redraw();
    });
};

// ==================== 右键菜单 ====================
function initAnnotationContextMenu(containerEl, recordId) {
  if (!containerEl) return;
  containerEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const sel = (window.getSelection && window.getSelection().toString()) || '';
    showAnnoMenu(e.clientX, e.clientY, recordId, sel.trim());
  });
}

function showAnnoMenu(x, y, recordId, sel) {
  closeAnnoMenu();
  const menu = document.createElement('div');
  menu.className = 'anno-menu';
  menu.innerHTML = `
    <button data-act="sel" ${sel ? '' : 'disabled'} class="anno-menu-item">对选中文字添加批注</button>
    <button data-act="all" class="anno-menu-item">添加整卡批注</button>
  `;
  menu.style.top = y + 'px';
  menu.style.left = x + 'px';
  document.body.appendChild(menu);
  menu.querySelector('[data-act="sel"]').onclick = () => { closeAnnoMenu(); openAnnotationDrawer(recordId, sel); };
  menu.querySelector('[data-act="all"]').onclick = () => { closeAnnoMenu(); openAnnotationDrawer(recordId, ''); };
  // 点击别处关闭
  setTimeout(() => document.addEventListener('click', closeAnnoMenu, { once: true }), 0);
}

function closeAnnoMenu() {
  document.querySelectorAll('.anno-menu').forEach(m => m.remove());
}

// 初始化全局悬浮提示
initAnnotationTooltip();
