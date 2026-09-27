/* Memory Anchor - 通用工具 */

// ==================== 全局状态 ====================
// 注意: App 在 app.js 中声明, 这里仅声明依赖的占位
window.App = window.App || { settings: null, currentTab: 'records', md: null };

// ==================== API 封装 ====================
async function api(path, options = {}) {
  const opts = {
    headers: { 'Accept': 'application/json' },
    ...options,
  };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  try {
    const res = await fetch(path, opts);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    }
    return res;
  } catch (err) {
    console.error(`API ${path}:`, err);
    throw err;
  }
}

// ==================== Toast ====================
function toast(msg, type = 'info', duration = 2500) {
  const container = document.getElementById('toastContainer');
  if (!container) return alert(msg);
  const colors = {
    info: 'bg-slate-800 text-white',
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    warn: 'bg-amber-500 text-white',
  };
  const el = document.createElement('div');
  el.className = `toast ${colors[type] || colors.info} px-4 py-2 rounded-lg shadow-lg text-sm max-w-xs`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ==================== Markdown 渲染 ====================
function initMarkdown() {
  if (window.markdownit) {
    App.md = window.markdownit({
      html: false,
      linkify: true,
      breaks: true,
      highlight: function (str, lang) {
        if (lang && window.hljs && hljs.getLanguage(lang)) {
          try { return `<pre><code class="hljs language-${lang}">${hljs.highlight(str, {language: lang}).value}</code></pre>`; } catch (e) {}
        }
        return `<pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`;
      }
    });
  } else {
    // fallback: 简单换行
    App.md = { render: s => `<p>${(s||'').replace(/\n/g, '<br>')}</p>` };
  }
}

// 用 KaTeX 渲染一段 LaTeX 公式, 失败时降级为原文 (带错误提示)
function renderKatex(tex, displayMode) {
  tex = (tex || '').trim();
  if (typeof window.katex === 'undefined') {
    const d = displayMode ? '$$' : '$';
    return `${d}${tex}${d}`;
  }
  try {
    return window.katex.renderToString(tex, {
      displayMode: !!displayMode,
      throwOnError: false,
      errorColor: '#e11d48',
    });
  } catch (e) {
    const d = displayMode ? '$$' : '$';
    return `<span class="katex-error" style="color:#e11d48" title="${escapeHtml(e.message || '')}">${d}${tex}${d}</span>`;
  }
}

// 渲染 Markdown, 并正确渲染数学公式 ($$...$$ / $...$ / \[...\] / \(...\))。
// 关键: 先把代码块/行内代码和公式抽离成占位符, 让 markdown-it 不会把公式里的
// 下划线/星号等当成 Markdown 语法破坏掉, 渲染结束后再还原成 KaTeX 的 HTML。
function renderMarkdown(text) {
  if (!App.md) initMarkdown();
  if (!text) return '';
  try {
    // 私有区字符作占位哨兵, 保证不会与正文 / Markdown 符号冲突
    const S = '\uE000';
    const E = '\uE001';
    const codeTok = (i) => `${S}C${i}${E}`;
    const mathTok = (i) => `${S}M${i}${E}`;
    const codeStore = [];
    const mathStore = [];

    let src = String(text);

    // 1) 抽离代码 (围栏 ``` 或 ~~~, 以及行内 `code`), 避免其中 $ \[ 被误判为公式
    src = src.replace(/```[\s\S]*?```/g, (m) => { codeStore.push(m); return codeTok(codeStore.length - 1); });
    src = src.replace(/~~~[\s\S]*?~~~/g, (m) => { codeStore.push(m); return codeTok(codeStore.length - 1); });
    src = src.replace(/`[^`\n]+`/g, (m) => { codeStore.push(m); return codeTok(codeStore.length - 1); });

    // 2) 抽离数学公式 —— 显示公式优先, 再处理行内公式
    src = src.replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => { mathStore.push(renderKatex(t, true)); return mathTok(mathStore.length - 1); });
    src = src.replace(/\\\[([\s\S]+?)\\\]/g, (m, t) => { mathStore.push(renderKatex(t, true)); return mathTok(mathStore.length - 1); });
    src = src.replace(/\$([^$\n]+?)\$/g, (m, t) => { mathStore.push(renderKatex(t, false)); return mathTok(mathStore.length - 1); });
    src = src.replace(/\\\(([^\n]+?)\\\)/g, (m, t) => { mathStore.push(renderKatex(t, false)); return mathTok(mathStore.length - 1); });

    // 3) 交给 markdown-it 渲染 (此时公式与代码都已变成占位符, 不会被 Markdown 语法破坏)
    let html = App.md.render(src);

    // 4) 还原公式 -> KaTeX 生成的 HTML
    html = html.replace(/\uE000M(\d+)\uE001/g, (m, i) => mathStore[+i]);
    // 5) 还原代码 -> 转义后的原文本 (等宽展示)
    html = html.replace(/\uE000C(\d+)\uE001/g, (m, i) => `<code class="hljs">${escapeHtml(codeStore[+i])}</code>`);
    return html;
  } catch (e) {
    console.error('renderMarkdown 失败:', e);
    return `<p>${escapeHtml(text)}</p>`;
  }
}


// ==================== 时间格式化 ====================
function tsToDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function tsToDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function relativeTime(ts) {
  if (!ts) return '';
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff/60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff/3600)}小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff/86400)}天前`;
  return tsToDate(ts);
}

function dueLabel(ts) {
  if (!ts) return '未排期';
  const now = Date.now() / 1000;
  const diff = ts - now;
  if (diff < 0) {
    const overdue = Math.floor(-diff / 86400);
    return overdue === 0 ? '今日到期' : `逾期 ${overdue} 天`;
  }
  if (diff < 3600) return `${Math.floor(diff/60)} 分钟后`;
  if (diff < 86400) return `${Math.floor(diff/3600)} 小时后`;
  const days = Math.floor(diff / 86400);
  return `${days} 天后`;
}

// ==================== 状态徽章 ====================
function stateBadge(state) {
  const map = { new: ['badge-new', '新'], learning: ['badge-learning', '学习中'],
                review: ['badge-review', '复习中'], relearning: ['badge-relearning', '重学'] };
  const [cls, label] = map[state] || ['badge-new', state];
  return `<span class="badge ${cls}">${label}</span>`;
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, n = 100) {
  s = s || '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ==================== 主题切换 ====================
function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
}

async function toggleTheme() {
  const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(newTheme);
  try { await api('/api/settings', { method: 'PUT', body: { theme: newTheme } }); } catch (e) {}
  App.settings = App.settings || {};
  App.settings.theme = newTheme;
}

// ==================== 抽屉组件 ====================
function openDrawer(title, contentHtml, options = {}) {
  const root = document.getElementById('drawerRoot');
  const width = options.width || '540px';
  root.innerHTML = `
    <div class="drawer-backdrop" onclick="closeDrawer()"></div>
    <aside class="drawer" style="width: min(${width}, 100vw);">
      <header class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
        <h2 class="font-semibold text-base truncate">${escapeHtml(title)}</h2>
        <button onclick="closeDrawer()" class="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </header>
      <div class="flex-1 overflow-y-auto" id="drawerBody">${contentHtml}</div>
    </aside>
  `;
  requestAnimationFrame(() => {
    root.querySelector('.drawer').classList.add('open');
    root.querySelector('.drawer-backdrop').classList.add('open');
  });
  return root.querySelector('.drawer');
}

function closeDrawer() {
  const root = document.getElementById('drawerRoot');
  const d = root.querySelector('.drawer');
  const b = root.querySelector('.drawer-backdrop');
  if (d) d.classList.remove('open');
  if (b) b.classList.remove('open');
  setTimeout(() => { root.innerHTML = ''; }, 250);
}

// ==================== 确认对话框 ====================
function confirmDialog(message, onConfirm, options = {}) {
  const root = document.getElementById('drawerRoot');
  const html = `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" id="confirmMask">
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full mx-4 p-5">
        <h3 class="font-semibold text-base mb-2">${escapeHtml(options.title || '确认操作')}</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-4">${escapeHtml(message)}</p>
        <div class="flex gap-2 justify-end">
          <button class="btn btn-outline" id="confirmCancel">取消</button>
          <button class="btn ${options.danger ? 'btn-danger' : 'btn-primary'}" id="confirmOk">${options.okText || '确定'}</button>
        </div>
      </div>
    </div>
  `;
  const old = root.innerHTML;
  root.innerHTML = html;
  document.getElementById('confirmCancel').onclick = () => { root.innerHTML = old; };
  document.getElementById('confirmOk').onclick = () => {
    root.innerHTML = old;
    onConfirm && onConfirm();
  };
}

// ==================== 加载设置 ====================
async function loadSettings() {
  try {
    App.settings = await api('/api/settings');
    applyTheme(App.settings.theme || 'light');
  } catch (e) {
    App.settings = { theme: 'light' };
    applyTheme('light');
  }
}

// ==================== 文件大小格式化 ====================
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ==================== 防抖 ====================
function debounce(fn, wait = 300) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ==================== Markdown 粘贴格式修正 ====================
// 后端 /api/records/format 借鉴 siyuan-plugin-text-process, 对粘贴进来的脏
// Markdown 做规整 (LaTeX 公式 / 项目符号 / 空行 / 换行 等)。
async function formatMarkdownText(text, options = {}) {
  try {
    const res = await api('/api/records/format', { method: 'POST', body: { text, options } });
    return (res && res.text != null) ? res.text : text;
  } catch (e) {
    console.warn('Markdown 格式修正失败:', e);
    return text;
  }
}

// 在光标处插入文本, 并同步光标位置与 input 事件
function insertAtCursor(el, text) {
  if (!el) return;
  const start = el.selectionStart != null ? el.selectionStart : el.value.length;
  const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.selectionStart = el.selectionEnd = pos;
  el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// 给文本框绑定"粘贴时自动修正格式": 拦截纯文本粘贴, 经后端修正后再插入
function bindPasteFormat(textarea, getOptions) {
  if (!textarea) return;
  textarea.addEventListener('paste', async (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const hasImage = Array.from(cd.items || []).some(i => i.type.startsWith('image/'));
    if (hasImage) return; // 图片交给其它处理器
    const opts = getOptions ? getOptions() : {};
    if (!opts || opts.enabled === false) return;
    const clip = cd.getData('text');
    if (clip == null) return;
    e.preventDefault();
    const formatted = await formatMarkdownText(clip, opts.options || {});
    insertAtCursor(e.target, formatted);
  });
}

// ==================== 可复用 Markdown 编辑器组件 ====================
// buildMarkdownEditor: 构建可复用的 Markdown 编辑器 HTML + 初始化逻辑
// 参数 options: { 
//   prefix: ID 前缀 (必填, 避免多实例冲突)
//   showQuote: 是否显示引用框 (批注专用, 默认 false)
//   placeholder: 文本域占位符
//   rows: 文本域行数 (默认 8)
//   label: 编辑器标签文本 (默认 'Markdown 内容')
//   quoteLabel: 引用框标签 (默认 '引用片段')
//   quotePlaceholder: 引用框占位符
//   formatDefaults: 格式选项默认值对象 {optionName: bool}
// }
// 返回值: { html: HTML字符串, init: 初始化函数(container), getValue: 获取值函数, setValue: 设置值函数 }
function buildMarkdownEditor(options = {}) {
  const {
    prefix,
    showQuote = false,
    placeholder = '支持 Markdown 语法\n# 一级标题\n**加粗** *斜体*\n- 列表项\n`code`',
    rows = 8,
    label = 'Markdown 内容',
    quoteLabel = '引用片段',
    quotePlaceholder = '选中的原文片段(可空 = 整卡批注)',
    formatDefaults = {}
  } = options;

  if (!prefix) throw new Error('buildMarkdownEditor: prefix is required');

  const contentId = `${prefix}_content`;
  const autoFormatId = `${prefix}_autoFormat`;
  const fixBtnId = `${prefix}_fixBtn`;
  const previewBtnId = `${prefix}_previewBtn`;
  const quoteId = `${prefix}_quote`;

  // 生成 HTML
  const quoteHtml = showQuote ? `
    <div>
      <label class="block text-xs text-slate-400 mb-1">${quoteLabel}</label>
      <textarea id="${quoteId}" rows="2" placeholder="${quotePlaceholder}" class="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 resize-y"></textarea>
    </div>` : '';

  const html = `
    ${quoteHtml}
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="block text-xs text-slate-400">${label}</label>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer" title="粘贴时自动修正格式(去空行 / 项目符号 / LaTeX 公式等)">
            <input id="${autoFormatId}" type="checkbox" class="w-3.5 h-3.5 accent-brand-600" checked> 粘贴自动修正
          </label>
          <button id="${fixBtnId}" class="text-xs text-brand-600 hover:underline" type="button">修正格式</button>
          <button id="${previewBtnId}" class="text-xs text-brand-600 hover:underline">预览</button>
        </div>
      </div>
      <textarea id="${contentId}" rows="${rows}" placeholder="${placeholder}" class="w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 resize-y"></textarea>
      ${formatOptionsPanel(prefix, formatDefaults)}
    </div>
  `;

  // 初始化函数: 绑定事件、粘贴处理、预览切换
  function init(container) {
    const contentEl = document.getElementById(contentId);
    const fixBtn = document.getElementById(fixBtnId);
    const previewBtn = document.getElementById(previewBtnId);

    if (!contentEl) {
      console.error(`buildMarkdownEditor.init: ${contentId} not found`);
      return;
    }

    // 绑定粘贴格式修正
    bindPasteFormat(contentEl, () => ({
      enabled: document.getElementById(autoFormatId)?.checked,
      options: readFormatOpts(prefix)
    }));

    // 一键修正格式
    fixBtn.onclick = async () => {
      fixBtn.textContent = '修正中...';
      fixBtn.disabled = true;
      contentEl.value = await formatMarkdownText(contentEl.value, readFormatOpts(prefix));
      fixBtn.textContent = '修正格式';
      fixBtn.disabled = false;
      toast('已修正格式', 'success');
    };

    // 预览切换
    previewBtn.onclick = () => {
      if (contentEl.dataset.preview === '1') {
        contentEl.dataset.preview = '0';
        contentEl.style.display = '';
        contentEl.value = contentEl.dataset.raw || contentEl.value;
        previewBtn.textContent = '预览';
        const wrap = document.getElementById(`${contentId}_previewWrap`);
        if (wrap) wrap.remove();
      } else {
        contentEl.dataset.preview = '1';
        contentEl.dataset.raw = contentEl.value;
        contentEl.style.display = 'none';
        const wrap = document.createElement('div');
        wrap.className = 'md-body w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 min-h-[8rem]';
        wrap.id = `${contentId}_previewWrap`;
        wrap.innerHTML = renderMarkdown(contentEl.value);
        contentEl.parentNode.insertBefore(wrap, contentEl);
        previewBtn.textContent = '编辑';
      }
    };
  }

  // 获取值函数
  function getValue() {
    const obj = { content_md: document.getElementById(contentId)?.value || '' };
    if (showQuote) {
      obj.quote = document.getElementById(quoteId)?.value || '';
    }
    return obj;
  }

  // 设置值函数
  function setValue(data) {
    const contentEl = document.getElementById(contentId);
    if (contentEl && data.content_md != null) {
      contentEl.value = data.content_md;
    }
    if (showQuote && data.quote != null) {
      const quoteEl = document.getElementById(quoteId);
      if (quoteEl) quoteEl.value = data.quote;
    }
  }

  return { html, init, getValue, setValue };
}

// ==================== 批注文本标记与悬浮提示 ====================
// 将 Markdown 渲染后的 HTML 中匹配批注引用的部分标记为高亮可悬浮元素
// annotations: [{id, quote, note_md}, ...]
// contentHtml: renderMarkdown() 返回的 HTML 字符串
// 返回: 包含批注标记的 HTML 字符串
function markAnnotatedText(contentHtml, annotations) {
  if (!annotations || annotations.length === 0) return contentHtml;

  const temp = document.createElement('div');
  temp.innerHTML = contentHtml;

  annotations.forEach((ann, idx) => {
    if (!ann.quote || !ann.quote.trim()) return; // 整卡批注不标记

    const walker = document.createTreeWalker(temp, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
      nodes.push(node);
    }

    // 只标记第一个匹配的文本节点
    let marked = false;
    for (const textNode of nodes) {
      if (marked) break;

      const text = textNode.textContent;
      const quoteIndex = text.indexOf(ann.quote);
      if (quoteIndex === -1) continue;

      const before = text.slice(0, quoteIndex);
      const match = text.slice(quoteIndex, quoteIndex + ann.quote.length);
      const after = text.slice(quoteIndex + ann.quote.length);

      const span = document.createElement('span');
      span.className = 'annotated-text';
      span.dataset.annotationId = ann.id;
      span.dataset.annotationIdx = idx;
      span.textContent = match;

      const parent = textNode.parentNode;
      if (before) parent.insertBefore(document.createTextNode(before), textNode);
      parent.insertBefore(span, textNode);
      if (after) parent.insertBefore(document.createTextNode(after), textNode);
      parent.removeChild(textNode);

      marked = true;
    }
  });

  return temp.innerHTML;
}

// 为批注标记的文本绑定悬浮事件
// container: 包含 .annotated-text 元素的父容器 (DOM 元素)
// annotations: [{id, note_md}, ...]
function bindAnnotationTooltip(container, annotations) {
  if (!container || !annotations || annotations.length === 0) return;

  const annotatedElements = container.querySelectorAll('.annotated-text');
  if (annotatedElements.length === 0) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'annotation-tooltip';
  tooltip.innerHTML = `
    <div class="annotation-tooltip-arrow"></div>
    <div class="annotation-tooltip-content md-body"></div>
  `;
  document.body.appendChild(tooltip);

  const contentEl = tooltip.querySelector('.annotation-tooltip-content');

  annotatedElements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      const idx = parseInt(el.dataset.annotationIdx);
      const ann = annotations[idx];
      if (!ann) return;

      contentEl.innerHTML = renderMarkdown(ann.note_md);
      tooltip.classList.add('show');

      const rect = el.getBoundingClientRect();
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.top = `${rect.bottom + 8}px`;
    });

    el.addEventListener('mouseleave', () => {
      tooltip.classList.remove('show');
    });
  });

  // 清理函数：移除 tooltip (在关闭 drawer 或切换卡片时调用)
  return () => {
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
  };
}
