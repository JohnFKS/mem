/* Memory Anchor - 设置中心 Tab */

const SettingsTab = {
  state: { settings: null, backups: [] },

  async render() {
    const tab = document.getElementById('tab-settings');
    tab.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-4">
        <!-- 主题与外观 -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
            主题与外观
          </h3>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="theme" value="light" class="accent-brand-600"> 浅色
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="theme" value="dark" class="accent-brand-600"> 深色
            </label>
          </div>
        </div>

        <!-- FSRS 算法参数 -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            FSRS-5 算法参数
          </h3>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">目标保留率 (推荐 0.85 ~ 0.95)</label>
              <div class="flex items-center gap-3">
                <input type="range" id="setRetention" min="0.7" max="0.99" step="0.01" class="flex-1 accent-brand-600">
                <span id="setRetentionVal" class="text-sm font-mono w-12 text-right"></span>
              </div>
              <p class="text-xs text-slate-400 mt-1">数值越高复习频率越高, 但记忆越牢固。设为 0.9 表示希望复习时仍有 90% 概率记得。</p>
            </div>
            <div class="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button id="resetFsrsBtn" class="btn btn-outline text-xs">重置为默认参数</button>
              <span class="text-xs text-slate-400">FSRS-5 默认权重已根据大量数据训练, 通常无需手动调整</span>
            </div>
          </div>
        </div>

        <!-- 快捷键 -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/></svg>
            快捷键
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">新增记录</label>
              <input id="setShortcutNew" type="text" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-mono">
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">打开复习</label>
              <input id="setShortcutReview" type="text" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-mono">
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">搜索</label>
              <input id="setShortcutSearch" type="text" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-mono">
            </div>
          </div>
          <p class="text-xs text-slate-400 mt-2">使用 Ctrl/Alt/Shift + 字母 组合, 例如 Ctrl+N</p>
        </div>

        <!-- 学习目标 -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            学习目标
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">每日新卡片目标</label>
              <input id="setTargetNew" type="number" min="0" max="500" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">每日复习目标</label>
              <input id="setTargetReview" type="number" min="0" max="2000" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
            </div>
          </div>
        </div>

        <!-- 备份与恢复 -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/></svg>
            数据备份与恢复
          </h3>
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" id="setAutoBackup" class="w-4 h-4 accent-brand-600"> 启用自动备份
              </label>
              <div class="flex items-center gap-1 text-sm">
                <span>每</span>
                <input id="setBackupInterval" type="number" min="1" max="90" class="w-14 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800">
                <span>天一次</span>
              </div>
            </div>
            <div class="flex gap-2">
              <button id="createBackupBtn" class="btn btn-primary text-sm">立即备份</button>
              <button id="refreshBackupsBtn" class="btn btn-outline text-sm">刷新列表</button>
            </div>
            <div id="backupList" class="space-y-1 max-h-72 overflow-y-auto"></div>
          </div>
        </div>

        <!-- AI 服务 (可选增强) -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 3.9-2.4 5.2-.8.9-1.6 1.7-1.6 3.3M12 2a7 7 0 0 0-7 7c0 2.4 1.2 3.9 2.4 5.2.8.9 1.6 1.7 1.6 3.3M9 21h6"/></svg>
            AI 服务（可选）
            <span id="aiStatusBadge" class="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">检测中…</span>
          </h3>
          <p class="text-xs text-slate-400 mb-3">
            不配置 = 所有 AI 功能自动关闭，产品完整可用。配置无误后才会出现 AI 入口；
            运行中断线/超时会自动回退到无 AI 路径，不影响复习主流程。
          </p>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Base URL（OpenAI 兼容，如 https://api.example.com/v1）</label>
              <input id="setAiBaseUrl" type="text" placeholder="https://api.example.com/v1" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">API Key（不会回显，留空表示保持已保存的值）</label>
              <input id="setAiApiKey" type="password" autocomplete="off" placeholder="sk-…" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-slate-400 mb-1">模型名（如 gpt-4o-mini）</label>
                <input id="setAiModel" type="text" placeholder="gpt-4o-mini" class="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
              </div>
              <div class="flex items-end">
                <button id="testAiBtn" class="btn btn-outline text-sm">测试连接</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 保存按钮 -->
        <div class="sticky bottom-4 flex justify-end gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur p-3 rounded-lg border border-slate-200 dark:border-slate-700">
          <button id="resetAllBtn" class="btn btn-outline text-sm">重置全部设置</button>
          <button id="saveSettingsBtn" class="btn btn-primary text-sm">保存设置</button>
        </div>
      </div>
    `;
    await this.load();
    this.bindEvents();
  },

  async load() {
    try {
      this.state.settings = await api('/api/settings');
      this.state.backups = (await api('/api/backup')).items || [];
      this.fillForm();
      this.renderBackups();
      this.refreshAiBadge(false);   // 不带 ping, 只反映是否已配置
    } catch (e) {
      toast('加载设置失败: ' + e.message, 'error');
    }
  },

  fillForm() {
    const s = this.state.settings || {};
    document.querySelector(`input[name="theme"][value="${s.theme || 'light'}"]`).checked = true;
    const r = document.getElementById('setRetention');
    r.value = s.request_retention || 0.9;
    document.getElementById('setRetentionVal').textContent = `${Math.round((s.request_retention || 0.9) * 100)}%`;
    document.getElementById('setShortcutNew').value = s.shortcut_new || 'Ctrl+N';
    document.getElementById('setShortcutReview').value = s.shortcut_review || 'Ctrl+R';
    document.getElementById('setShortcutSearch').value = s.shortcut_search || 'Ctrl+K';
    document.getElementById('setTargetNew').value = s.daily_target_new || 10;
    document.getElementById('setTargetReview').value = s.daily_target_review || 50;
    document.getElementById('setAutoBackup').checked = !!s.auto_backup;
    document.getElementById('setBackupInterval').value = s.backup_interval_days || 7;
    // AI 配置: api_key 不回显 (输入框 type=password, 留空保持原值)
    document.getElementById('setAiBaseUrl').value = s.ai_base_url || '';
    document.getElementById('setAiModel').value = s.ai_model || '';
  },

  // 刷新 AI 状态徽章 (未配置 / 已连接 / 连接失败)
  async refreshAiBadge(ping) {
    const st = await refreshAiState({ ping: !!ping });
    const badge = document.getElementById('aiStatusBadge');
    if (!badge) return st;
    let text = '未配置，AI 已关闭', cls = 'bg-slate-100 dark:bg-slate-700 text-slate-500';
    if (st.configured && st.disabled) {
      text = '已配置但连接失败'; cls = 'bg-red-100 dark:bg-red-900/30 text-red-600';
    } else if (st.configured) {
      text = ping ? (st.failCount ? '已配置但连接失败' : '已连接') : '已配置';
      cls = 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600';
    }
    badge.textContent = text;
    badge.className = `ml-1 text-xs px-2 py-0.5 rounded-full ${cls}`;
    return st;
  },

  renderBackups() {
    const wrap = document.getElementById('backupList');
    if (this.state.backups.length === 0) {
      wrap.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">还没有备份记录</div>';
      return;
    }
    wrap.innerHTML = this.state.backups.map(b => `
      <div class="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900/30 rounded text-sm">
        <span class="text-xs">${b.backup_type === 'auto' ? '🤖' : '👤'}</span>
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">${b.backup_time_str}</div>
          <div class="text-xs text-slate-400">${formatBytes(b.file_size)} · ${b.note || ''}</div>
        </div>
        <button data-download="${b.id}" class="btn btn-ghost text-xs" title="下载">⬇</button>
        <button data-restore="${b.id}" class="btn btn-ghost text-xs text-amber-600" title="恢复">↻</button>
        <button data-delete="${b.id}" class="btn btn-ghost text-xs text-red-500" title="删除">✕</button>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-download]').forEach(b => {
      b.onclick = () => { location.href = `/api/backup/${b.dataset.download}/download`; };
    });
    wrap.querySelectorAll('[data-restore]').forEach(b => {
      b.onclick = () => {
        confirmDialog('恢复会覆盖当前数据库, 操作前会自动创建安全快照。确认继续?', async () => {
          try {
            await api(`/api/backup/${b.dataset.restore}/restore`, { method: 'POST' });
            toast('已恢复, 刷新中...', 'success');
            setTimeout(() => location.reload(), 800);
          } catch (e) { toast('恢复失败: ' + e.message, 'error'); }
        }, { danger: true, okText: '恢复' });
      };
    });
    wrap.querySelectorAll('[data-delete]').forEach(b => {
      b.onclick = () => {
        confirmDialog('确定删除此备份?', async () => {
          await api(`/api/backup/${b.dataset.delete}`, { method: 'DELETE' });
          toast('已删除', 'success');
          this.load();
        }, { danger: true, okText: '删除' });
      };
    });
  },

  bindEvents() {
    document.getElementById('setRetention').oninput = (e) => {
      document.getElementById('setRetentionVal').textContent = `${Math.round(e.target.value * 100)}%`;
    };
    document.querySelectorAll('input[name="theme"]').forEach(r => {
      r.onchange = (e) => {
        applyTheme(e.target.value);
      };
    });
    document.getElementById('saveSettingsBtn').onclick = async () => {
      const data = {
        theme: document.querySelector('input[name="theme"]:checked').value,
        request_retention: parseFloat(document.getElementById('setRetention').value),
        shortcut_new: document.getElementById('setShortcutNew').value,
        shortcut_review: document.getElementById('setShortcutReview').value,
        shortcut_search: document.getElementById('setShortcutSearch').value,
        daily_target_new: parseInt(document.getElementById('setTargetNew').value) || 10,
        daily_target_review: parseInt(document.getElementById('setTargetReview').value) || 50,
        auto_backup: document.getElementById('setAutoBackup').checked,
        backup_interval_days: parseInt(document.getElementById('setBackupInterval').value) || 7,
        ai_base_url: document.getElementById('setAiBaseUrl').value.trim(),
        ai_model: document.getElementById('setAiModel').value.trim(),
      };
      // API Key: 留空表示保持已保存的值, 非空才更新
      const key = document.getElementById('setAiApiKey').value;
      if (key) data.ai_api_key = key.trim();
      try {
        const updated = await api('/api/settings', { method: 'PUT', body: data });
        App.settings = updated;
        applyTheme(updated.theme);
        toast('设置已保存', 'success');
        // 保存后即时刷新 AI 状态并做一次连通测试, 无需刷新页面
        await this.refreshAiBadge(true);
        syncAiEntries();
      } catch (e) { toast('保存失败: ' + e.message, 'error'); }
    };
    document.getElementById('testAiBtn').onclick = async () => {
      try {
        const st = await this.refreshAiBadge(true);
        toast(st.configured && !st.disabled ? '连接正常' : (st.configured ? '连接失败，请检查配置' : '尚未配置 AI'),
              st.configured && !st.disabled ? 'success' : 'error');
        syncAiEntries();
      } catch (e) { toast('检测失败: ' + e.message, 'error'); }
    };
    document.getElementById('resetFsrsBtn').onclick = async () => {
      confirmDialog('确定重置 FSRS 参数为默认值? 这不会影响已有卡片的复习进度。', async () => {
        await api('/api/settings/reset_fsrs', { method: 'POST' });
        await this.load();
        toast('已重置', 'success');
      });
    };
    document.getElementById('resetAllBtn').onclick = () => {
      confirmDialog('确定重置所有设置为默认值?', async () => {
        const defaults = {
          theme: 'light', request_retention: 0.9,
          shortcut_new: 'Ctrl+N', shortcut_review: 'Ctrl+R', shortcut_search: 'Ctrl+K',
          daily_target_new: 10, daily_target_review: 50,
          auto_backup: true, backup_interval_days: 7,
        };
        await api('/api/settings', { method: 'PUT', body: defaults });
        await api('/api/settings/reset_fsrs', { method: 'POST' });
        await this.load();
        applyTheme('light');
        toast('已重置', 'success');
      });
    };
    document.getElementById('createBackupBtn').onclick = async () => {
      try {
        const res = await api('/api/backup', { method: 'POST', body: { note: '手动备份' } });
        toast(`已创建备份 (${formatBytes(res.size)})`, 'success');
        this.load();
      } catch (e) { toast('备份失败: ' + e.message, 'error'); }
    };
    document.getElementById('refreshBackupsBtn').onclick = () => this.load();
  },
};
