/* Memory Anchor - 速记模块 (mnemonic)
 *
 * 与批注并列的第二个附属模块, 专门记"方便记忆的小技巧": 口诀 / 谐音 / 类比 / 图像化 / 反例。
 * 设计要点:
 *  - 输入格式完全复用"格式化输入"组件 (buildMarkdownEditor + initMarkdownEditor):
 *    粘贴自动修正 / 一键修正格式 / 预览 / 高级格式选项, 与新建卡片、批注保持同一套手感。
 *  - AI 生成是可选增强: 未配置或熔断时 ✨ 按钮不渲染 (见 utils.js 的 AI 三态开关)。
 *    生成结果只填进输入框, **由用户确认后再保存**, 绝不自动落库。
 *  - 速记不单独复习, 只挂在卡片上, 复习时作为回忆线索展示。
 */

// 单条速记的展示 HTML (渲染后的 Markdown + 来源标记 + 编辑/删除)
function mnemonicListItem(m) {
  const rid = m.record_id != null ? m.record_id : m.recordId;
  const src = m.source === 'ai'
    ? '<span class="badge bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300">✨ AI</span>'
    : '';
  return `<div class="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-800" data-mid="${m.id}">
    <div class="md-body text-sm">${renderMarkdown(m.content_md || '')}</div>
    <div class="flex items-center gap-2 mt-2 text-xs">
      <span class="text-slate-400">${relativeTime(m.created_at)}</span>
      ${src}
      <div class="flex-1"></div>
      <button data-act="mn-edit" data-rid="${rid}" data-mid="${m.id}" class="text-brand-600 hover:underline">编辑</button>
      <button data-act="mn-del" data-rid="${rid}" data-mid="${m.id}" class="text-red-500 hover:underline">删除</button>
    </div>
  </div>`;
}

// 只读区块 (记录详情 / 复习页用): 标题 + 列表 + 添加按钮
function mnemonicsSection(items, recordId, opts = {}) {
  const list = (items || []);
  const body = list.length
    ? `<div class="space-y-2">${list.map(mnemonicListItem).join('')}</div>`
    : '<p class="text-xs text-slate-400">还没有速记。把容易忘的点压成一句口诀／一个画面，复习时一眼就能想起来。</p>';
  const addBtn = opts.readonly ? '' :
    `<button class="btn btn-outline w-full text-sm mt-2" onclick="openMnemonicDrawer(${recordId})">+ 添加速记</button>`;
  return `<div>
    <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
      <span>💡 速记 (${list.length})</span>
      ${opts.hint ? `<span class="text-slate-400">${opts.hint}</span>` : ''}
    </div>
    ${body}
    ${addBtn}
  </div>`;
}

// ==================== 速记抽屉 ====================
// recordId: 归属卡片; editItem: 编辑已有速记对象
async function openMnemonicDrawer(recordId, editItem = null) {
  const content = `
    <div class="p-5 space-y-4">
      <div class="text-xs text-slate-500 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 leading-relaxed">
        速记 = 帮你"想起来"的小技巧，不是知识点的复述。<br>
        口诀／谐音／首字母、类比、画面感、易混对比、反例，写一句能立刻复用的就够。
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs text-slate-400">速记内容（支持 Markdown 与公式）</div>
          <button id="mnAiBtn" type="button" data-ai="1" title="用 AI 根据卡片正文生成速记"
                  class="text-xs text-brand-600 hover:underline" style="display:none">✨ AI 生成速记</button>
        </div>
        ${buildMarkdownEditor('mn', { label: '速记内容', rows: 5,
          placeholder: '- **口诀**：要点 → 顺口的一句话&#10;- **类比**：…&#10;- **反例**：…' })}
      </div>
      <div class="flex items-center gap-2">
        <button id="mnSaveBtn" class="btn btn-primary">保存速记</button>
        <button id="mnCancelEdit" class="btn btn-outline hidden">取消编辑</button>
      </div>
      <div>
        <div class="text-xs text-slate-400 mb-1 flex items-center justify-between">
          <span>已有速记 (<span id="mnCount">0</span>)</span>
        </div>
        <div id="mnList" class="space-y-2"></div>
      </div>
    </div>
  `;
  openDrawer(editItem ? '编辑速记' : '添加速记', content, { width: '600px' });

  const listEl = document.getElementById('mnList');
  const countEl = document.getElementById('mnCount');
  const saveBtn = document.getElementById('mnSaveBtn');
  const cancelEditBtn = document.getElementById('mnCancelEdit');
  const aiBtn = document.getElementById('mnAiBtn');
  let editingId = editItem ? editItem.id : null;
  let aiSource = editItem ? (editItem.source || 'user') : 'user';

  initMarkdownEditor('mn');
  if (editItem) document.getElementById('mnContent').value = editItem.content_md || '';
  syncAiEntries();

  async function refreshList() {
    const res = await api(`/api/records/${recordId}/mnemonics`).catch(() => null);
    const items = (res && res.items) || [];
    countEl.textContent = items.length;
    listEl.innerHTML = items.length
      ? items.map(mnemonicListItem).join('')
      : '<p class="text-xs text-slate-400">暂无速记</p>';
    return items;
  }

  saveBtn.onclick = async () => {
    const content_md = (document.getElementById('mnContent').value || '').trim();
    if (!content_md) { toast('请填写速记内容', 'error'); return; }
    try {
      if (editingId) {
        await api(`/api/records/${recordId}/mnemonics/${editingId}`,
                  { method: 'PUT', body: { content_md, source: aiSource } });
      } else {
        await api(`/api/records/${recordId}/mnemonics`,
                  { method: 'POST', body: { content_md, source: aiSource } });
      }
      toast('已保存速记', 'success');
      editingId = null;
      aiSource = 'user';
      document.getElementById('mnContent').value = '';
      saveBtn.textContent = '保存速记';
      cancelEditBtn.classList.add('hidden');
      await refreshList();
      if (window.refreshMnemonicViews) window.refreshMnemonicViews(recordId);
    } catch (e) { toast('保存失败: ' + e.message, 'error'); }
  };

  cancelEditBtn.onclick = () => {
    editingId = null;
    aiSource = 'user';
    document.getElementById('mnContent').value = '';
    saveBtn.textContent = '保存速记';
    cancelEditBtn.classList.add('hidden');
  };

  // ---- AI 生成 (可选增强): 只填进输入框, 由用户确认后保存 ----
  if (aiBtn) {
    aiBtn.onclick = async () => {
      aiBtn.disabled = true;
      const old = aiBtn.textContent;
      aiBtn.textContent = '✨ 生成中…';
      try {
        const res = await api('/api/ai/mnemonic', {
          method: 'POST', body: { record_id: Number(recordId) },
        });
        const text = (res && res.content_md) || '';
        if (!text.trim()) { toast('AI 返回空速记', 'error'); return; }
        // 已有内容时追加而不是覆盖, 避免把用户自己写的冲掉
        const ta = document.getElementById('mnContent');
        ta.value = ta.value.trim() ? `${ta.value.trim()}\n${text}` : text;
        aiSource = 'ai';
        toast('已生成，可修改后再保存', 'success');
      } catch (e) {
        const disabled = aiNoteFailure('生成速记失败', e);
        if (disabled) aiBtn.style.display = 'none';
      } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = old;
      }
    };
  }

  await refreshList();
}

// 全局委托: 速记列表里的编辑/删除 (详情页 / 速记抽屉共用)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act="mn-edit"],[data-act="mn-del"]');
  if (!btn) return;
  const rid = btn.dataset.rid;
  const mid = btn.dataset.mid;
  if (btn.dataset.act === 'mn-edit') {
    try {
      const res = await api(`/api/records/${rid}/mnemonics`);
      const m = ((res && res.items) || []).find(x => String(x.id) === String(mid));
      if (m) openMnemonicDrawer(rid, m);
    } catch (err) { toast('加载失败: ' + err.message, 'error'); }
  } else if (btn.dataset.act === 'mn-del') {
    if (!confirm('确定删除该速记？')) return;
    try {
      await api(`/api/records/${rid}/mnemonics/${mid}`, { method: 'DELETE' });
      toast('已删除速记', 'success');
      // 抽屉里刷新列表
      const listEl = document.getElementById('mnList');
      if (listEl) {
        const res = await api(`/api/records/${rid}/mnemonics`).catch(() => null);
        const items = (res && res.items) || [];
        document.getElementById('mnCount').textContent = items.length;
        listEl.innerHTML = items.length ? items.map(mnemonicListItem).join('')
                                        : '<p class="text-xs text-slate-400">暂无速记</p>';
      }
      if (window.refreshMnemonicViews) window.refreshMnemonicViews(Number(rid));
    } catch (err) { toast('删除失败: ' + err.message, 'error'); }
  }
});

// 让宿主页面(详情/复习)在速记变动后能局部刷新。由宿主注册回调。
window.__mnemonicViews = [];
window.refreshMnemonicViews = function (recordId) {
  window.__mnemonicViews
    .filter(v => !recordId || v.recordId === Number(recordId))
    .forEach(v => { if (v.redraw) v.redraw(); });
};

window.openMnemonicDrawer = openMnemonicDrawer;
window.mnemonicListItem = mnemonicListItem;
window.mnemonicsSection = mnemonicsSection;
