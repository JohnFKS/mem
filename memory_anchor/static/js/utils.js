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
    // 5) 还原代码 -> 围栏代码渲染为 <pre><code> (带 hljs 高亮), 行内代码渲染为 <code>
    html = html.replace(/\uE000C(\d+)\uE001/g, (m, i) => {
      const raw = codeStore[+i] || '';
      // 围栏代码块: ```lang\n...\n```  或 ~~~
      const fence = raw.match(/^(?:```|~~~)([^\n]*)\n([\s\S]*?)\n?(?:```|~~~)$/);
      if (fence) {
        const lang = (fence[1] || '').trim();
        const code = fence[2];
        let inner;
        if (lang && window.hljs && hljs.getLanguage && hljs.getLanguage(lang)) {
          try { inner = hljs.highlight(code, { language: lang }).value; }
          catch (e) { inner = escapeHtml(code); }
        } else {
          inner = escapeHtml(code);
        }
        return `<pre><code class="hljs${lang ? ' language-' + escapeHtml(lang) : ''}">${inner}</code></pre>`;
      }
      // 行内代码 `code`
      const inline = raw.replace(/^`|`$/g, '');
      return `<code class="hljs">${escapeHtml(inline)}</code>`;
    });
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
