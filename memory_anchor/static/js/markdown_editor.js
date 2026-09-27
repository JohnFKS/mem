/* Memory Anchor - 可复用 Markdown 编辑器组件
 * 抽离自"新建/编辑卡片"的内容输入区, 让"批注"等场景复用同一套输入能力:
 *   - 粘贴自动修正格式 (去空行 / 项目符号 / LaTeX 公式等, 见后端 /api/records/format)
 *   - 「修正格式」按钮 (一键规整)
 *   - 「预览」按钮 (KaTeX 公式渲染, 见 utils.renderMarkdown)
 *   - 高级格式选项面板 (formatOptionsPanel, 定义在 records.js)
 * 通过 prefix 区分不同实例 (如 'ed' 卡片编辑器, 'an' 批注编辑器), 避免 id 冲突。
 */

// 生成编辑器 HTML (工具栏 + 文本框 + 高级格式选项)
// opts: { label, placeholder, rows }
function buildMarkdownEditor(prefix, opts = {}) {
  const taClass = "w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 resize-y";
  const ph = opts.placeholder || "支持 Markdown 语法&#10;# 一级标题&#10;**加粗** *斜体*&#10;- 列表项&#10;`code`";
  return `
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="block text-xs text-slate-400">${opts.label || 'Markdown 内容'}</label>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer" title="粘贴时自动修正格式 (去空行 / 项目符号 / LaTeX 公式等)">
            <input id="${prefix}AutoFormat" type="checkbox" class="w-3.5 h-3.5 accent-brand-600" checked> 粘贴自动修正
          </label>
          <button id="${prefix}FixBtn" class="text-xs text-brand-600 hover:underline" type="button">修正格式</button>
          <button id="${prefix}PreviewBtn" class="text-xs text-brand-600 hover:underline" type="button">预览</button>
        </div>
      </div>
      <textarea id="${prefix}Content" rows="${opts.rows || 8}" placeholder="${ph}" class="${taClass}"></textarea>
      ${formatOptionsPanel(prefix)}
    </div>`;
}

// 预览切换: 在文本框与渲染结果之间切换
function togglePreview(prefix) {
  const ta = document.getElementById(prefix + 'Content');
  const btn = document.getElementById(prefix + 'PreviewBtn');
  if (!ta || !btn) return;
  const existing = document.getElementById(prefix + 'PreviewWrap');
  if (ta.dataset.preview === '1') {
    ta.dataset.preview = '0';
    ta.style.display = '';
    if (existing) existing.remove();
    btn.textContent = '预览';
  } else {
    if (existing) existing.remove();
    ta.dataset.preview = '1';
    ta.dataset.raw = ta.value;
    ta.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'md-body w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 min-h-[8rem] overflow-auto';
    wrap.id = prefix + 'PreviewWrap';
    wrap.innerHTML = renderMarkdown(ta.value);
    ta.parentNode.insertBefore(wrap, ta);
    btn.textContent = '编辑';
  }
}

// 初始化编辑器交互: 粘贴 (图片上传回调 + 文本自动修正) / 修正格式 / 预览
// opts: { imageUploader?: async (files[]) => urls[] }
function initMarkdownEditor(prefix, opts = {}) {
  const ta = document.getElementById(prefix + 'Content');
  if (!ta) return;

  // 粘贴处理
  ta.addEventListener('paste', async (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    // 1) 图片: 交给上传回调
    if (opts.imageUploader) {
      const files = Array.from(cd.items || [])
        .filter(i => i.type && i.type.startsWith('image/'))
        .map(i => i.getAsFile())
        .filter(Boolean);
      if (files.length) {
        e.preventDefault();
        const urls = await opts.imageUploader(files);
        if (urls && urls.length) {
          const ins = urls.map(u => `![](${u})`).join('\n');
          insertAtCursor(ta, ins + '\n');
        }
        return;
      }
    }
    // 2) 纯文本: 若开启自动修正, 经后端规整后再插入 (含用户勾选的进阶选项)
    const autoFmtEl = document.getElementById(prefix + 'AutoFormat');
    const autoFmt = autoFmtEl && autoFmtEl.checked;
    if (autoFmt) {
      const clip = cd.getData('text');
      if (clip != null) {
        e.preventDefault();
        const formatted = await formatMarkdownText(clip, readFormatOpts(prefix));
        insertAtCursor(ta, formatted);
      }
    }
  });

  // 一键修正当前文本域格式
  const fix = document.getElementById(prefix + 'FixBtn');
  if (fix) fix.onclick = async () => {
    fix.textContent = '修正中…';
    fix.disabled = true;
    ta.value = await formatMarkdownText(ta.value, readFormatOpts(prefix));
    fix.textContent = '修正格式';
    fix.disabled = false;
    toast('已修正格式', 'success');
  };

  // 预览切换
  const pv = document.getElementById(prefix + 'PreviewBtn');
  if (pv) pv.onclick = () => togglePreview(prefix);
}
