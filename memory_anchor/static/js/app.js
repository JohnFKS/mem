/* Memory Anchor - 主应用入口 */

// App 是全局对象, 在 utils.js 中已初始化为 window.App
// 这里给 App 添加方法
Object.assign(window.App, {
  currentTab: 'records',
  settings: null,
  md: null,

  async init() {
    initMarkdown();
    await loadSettings();
    // AI 是可选增强: 拉取一次配置状态, 决定各 Tab 是否渲染 AI 入口
    await refreshAiState();
    // 从 URL 决定初始 tab
    const path = window.location.pathname.replace('/', '');
    if (['records', 'review', 'stats', 'settings'].includes(path)) {
      this.currentTab = path;
    }
    this.bindEvents();
    await this.switchTab(this.currentTab);
    ReviewTab.refreshBadge();
    setInterval(() => ReviewTab.refreshBadge(), 60000); // 每分钟刷新一次
  },

  bindEvents() {
    // 顶部 Tab 切换
    document.querySelectorAll('#topNav .tab-btn').forEach(btn => {
      btn.onclick = () => this.switchTab(btn.dataset.tab);
    });
    // 主题切换
    document.getElementById('themeToggle').onclick = toggleTheme;
    // 快速新增
    document.getElementById('quickNewBtn').onclick = () => {
      if (this.currentTab !== 'records') this.switchTab('records');
      RecordsTab.showEditor(null);
    };
    // 全局快捷键
    document.addEventListener('keydown', (e) => {
      // 在输入框中不响应 (除了特定组合)
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      const key = `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key.toUpperCase()}`;
      // Ctrl+K 全局搜索 (即使在输入框中也响应)
      if (key === 'Ctrl+K') {
        e.preventDefault();
        this.switchTab('records');
        setTimeout(() => document.getElementById('recSearch')?.focus(), 100);
        return;
      }
      if (inInput) return;
      // 复习页特殊键
      if (this.currentTab === 'review') {
        if (e.key === ' ') {
          e.preventDefault();
          if (!ReviewTab.state.showAnswer) ReviewTab.showAnswerFn();
          return;
        }
        if (e.key === '1') { ReviewTab.answer('again'); return; }
        if (e.key === '2') { ReviewTab.answer('hard'); return; }
        if (e.key === '3' || e.key === '4') { ReviewTab.answer('easy'); return; }
        if (e.key === 'ArrowRight') { ReviewTab.skipCard(); return; }
      }
      // 全局快捷键
      const s = App.settings || {};
      const newSc = (s.shortcut_new || 'Ctrl+N').toUpperCase();
      const revSc = (s.shortcut_review || 'Ctrl+R').toUpperCase();
      if (key === newSc) {
        e.preventDefault();
        this.switchTab('records');
        setTimeout(() => RecordsTab.showEditor(null), 100);
      } else if (key === revSc) {
        e.preventDefault();
        this.switchTab('review');
      }
    });
  },

  async switchTab(tab) {
    this.currentTab = tab;
    // 更新按钮状态
    document.querySelectorAll('#topNav .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // 显示对应面板
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById(`tab-${tab}`);
    panel.classList.remove('hidden');
    // 更新 URL (无刷新)
    const url = tab === 'records' ? '/' : `/${tab}`;
    window.history.replaceState({}, '', url);
    // 渲染对应 Tab
    try {
      if (tab === 'records') await RecordsTab.render();
      else if (tab === 'review') await ReviewTab.render();
      else if (tab === 'stats') await StatsTab.render();
      else if (tab === 'settings') await SettingsTab.render();
    } catch (e) {
      console.error(e);
      panel.innerHTML = `<div class="text-center py-12 text-red-500">加载失败: ${escapeHtml(e.message)}</div>`;
    }
  },
});

// 启动
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
