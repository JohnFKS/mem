/* Memory Anchor - 数据统计 Tab */

const StatsTab = {
  state: {
    overview: null,
    heatmap: null,
    retention: null,
    weekly: null,
    tags: null,
  },

  async render() {
    const tab = document.getElementById('tab-stats');
    tab.innerHTML = `
      <div id="statsOverview" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"></div>
      <div class="grid lg:grid-cols-2 gap-4 mb-4">
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 14l4-4 4 4 5-5"/></svg>
            学习热力图 (近 365 天)
          </h3>
          <div id="heatmapWrap" class="overflow-x-auto"></div>
          <div class="flex items-center justify-end gap-1 mt-2 text-xs text-slate-400">
            <span>少</span>
            <div class="heatmap-cell"></div>
            <div class="heatmap-cell heatmap-l1"></div>
            <div class="heatmap-cell heatmap-l2"></div>
            <div class="heatmap-cell heatmap-l3"></div>
            <div class="heatmap-cell heatmap-l4"></div>
            <span>多</span>
          </div>
        </div>
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            保留率趋势 (近 30 天)
          </h3>
          <div id="retentionChart"></div>
        </div>
      </div>
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <h3 class="text-sm font-semibold mb-3">本周活动</h3>
          <div id="weeklyChart"></div>
        </div>
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <h3 class="text-sm font-semibold mb-3">标签分布 Top 10</h3>
          <div id="tagsChart"></div>
        </div>
      </div>
    `;
    await this.loadAll();
  },

  async loadAll() {
    try {
      const [ov, hm, rt, wk, tg] = await Promise.all([
        api('/api/stats/overview'),
        api('/api/stats/heatmap?days=365'),
        api('/api/stats/retention_trend?days=30'),
        api('/api/stats/weekly'),
        api('/api/stats/tags'),
      ]);
      this.state.overview = ov;
      this.state.heatmap = hm.items || [];
      this.state.retention = rt.items || [];
      this.state.weekly = wk.items || [];
      this.state.tags = tg.items || [];
      this.renderOverview();
      this.renderHeatmap();
      this.renderRetentionChart();
      this.renderWeeklyChart();
      this.renderTagsChart();
    } catch (e) {
      toast('加载统计数据失败: ' + e.message, 'error');
    }
  },

  renderOverview() {
    const o = this.state.overview || {};
    const cards = [
      { label: '总卡片数', value: o.total_cards || 0, icon: '📚', color: 'text-brand-600' },
      { label: '今日待复习', value: o.due_today || 0, icon: '⏰', color: 'text-red-500' },
      { label: '今日已复习', value: o.reviewed_today || 0, icon: '✅', color: 'text-emerald-500' },
      { label: '记忆健康度', value: `${o.memory_health || 0}%`, icon: '🧠', color: 'text-purple-500' },
      { label: '累计复习', value: o.total_reps || 0, icon: '🔁', color: 'text-amber-500' },
      { label: '累计遗忘', value: o.total_lapses || 0, icon: '❌', color: 'text-rose-500' },
      { label: '7天新增', value: o.new_7d || 0, icon: '🆕', color: 'text-cyan-500' },
      { label: '7天复习', value: o.review_7d || 0, icon: '📊', color: 'text-indigo-500' },
    ];
    document.getElementById('statsOverview').innerHTML = cards.map(c => `
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-slate-400">${c.label}</span>
          <span class="text-lg">${c.icon}</span>
        </div>
        <div class="text-xl font-bold ${c.color}">${c.value}</div>
      </div>
    `).join('');
  },

  renderHeatmap() {
    const wrap = document.getElementById('heatmapWrap');
    if (!wrap) return;
    const items = this.state.heatmap;
    if (items.length === 0) { wrap.innerHTML = '<div class="text-sm text-slate-400">暂无数据</div>'; return; }

    // 按 7 列 (周) 排列, 类似 GitHub 贡献图
    // 找到第一个日期的星期
    const firstDate = new Date(items[0].date);
    const firstDay = firstDate.getDay(); // 0=Sun
    const cells = [];
    // 前置空白
    for (let i = 0; i < firstDay; i++) cells.push({ empty: true });
    // 数据
    const max = Math.max(...items.map(i => i.total), 1);
    items.forEach(it => {
      let level = 0;
      if (it.total > 0) {
        const ratio = it.total / max;
        if (ratio > 0.75) level = 4;
        else if (ratio > 0.5) level = 3;
        else if (ratio > 0.25) level = 2;
        else level = 1;
      }
      cells.push({ ...it, level });
    });

    // 渲染为 7 行 N 列的网格
    const totalWeeks = Math.ceil(cells.length / 7);
    let html = '<div style="display: grid; grid-template-rows: repeat(7, 11px); grid-auto-flow: column; gap: 2px; min-width: 100%;">';
    cells.forEach(c => {
      if (c.empty) {
        html += '<div></div>';
      } else {
        const cls = c.level > 0 ? `heatmap-l${c.level}` : '';
        const tip = `${c.date}: 学习${c.learn} 复习${c.review}`;
        html += `<div class="heatmap-cell ${cls}" title="${tip}"></div>`;
      }
    });
    html += '</div>';
    wrap.innerHTML = html;
  },

  renderRetentionChart() {
    const wrap = document.getElementById('retentionChart');
    if (!wrap) return;
    const items = this.state.retention.filter(i => i.avg_retention !== null);
    if (items.length === 0) {
      wrap.innerHTML = '<div class="text-sm text-slate-400 text-center py-8">暂无复习数据, 完成几次复习后即可看到保留率趋势</div>';
      return;
    }
    const w = 500, h = 180, pad = 30;
    const values = items.map(i => i.avg_retention);
    const minV = Math.min(...values, 0);
    const maxV = Math.max(...values, 100);
    const range = maxV - minV || 1;
    const xStep = (w - pad * 2) / Math.max(items.length - 1, 1);
    const points = items.map((it, i) => {
      const x = pad + i * xStep;
      const y = h - pad - ((it.avg_retention - minV) / range) * (h - pad * 2);
      return [x, y, it];
    });
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const areaD = pathD + ` L ${points[points.length-1][0].toFixed(1)} ${h-pad} L ${pad} ${h-pad} Z`;
    const labels = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const y = h - pad - t * (h - pad * 2);
      const v = (minV + t * range).toFixed(0);
      return `<line x1="${pad}" y1="${y}" x2="${w-pad}" y2="${y}" stroke="rgba(148,163,184,0.15)" stroke-width="1"/><text x="${pad-5}" y="${y+3}" font-size="9" fill="rgba(100,116,139,0.8)" text-anchor="end">${v}%</text>`;
    }).join('');
    const dots = points.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="rgb(2 132 199)"><title>${p[2].date}: ${p[2].avg_retention}% (${p[2].count}次)</title></circle>`).join('');

    wrap.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" class="w-full">
        ${labels}
        <path d="${areaD}" fill="rgba(2,132,199,0.1)" />
        <path d="${pathD}" fill="none" stroke="rgb(2 132 199)" stroke-width="2"/>
        ${dots}
        <text x="${pad}" y="${h-8}" font-size="9" fill="rgba(100,116,139,0.8)">${items[0].date}</text>
        <text x="${w-pad}" y="${h-8}" font-size="9" fill="rgba(100,116,139,0.8)" text-anchor="end">${items[items.length-1].date}</text>
      </svg>
    `;
  },

  renderWeeklyChart() {
    const wrap = document.getElementById('weeklyChart');
    if (!wrap) return;
    const items = this.state.weekly;
    if (items.length === 0) { wrap.innerHTML = '<div class="text-sm text-slate-400">暂无数据</div>'; return; }
    const max = Math.max(...items.map(i => Math.max(i.learn, i.review, 1)));
    const html = items.map(it => {
      const learnH = (it.learn / max) * 100;
      const reviewH = (it.review / max) * 100;
      return `
        <div class="flex items-center gap-2 mb-2">
          <div class="text-xs text-slate-500 w-10">${it.weekday}</div>
          <div class="flex-1 flex items-end gap-1 h-16">
            <div class="flex-1 bg-brand-200 dark:bg-brand-900/40 rounded-t flex items-end justify-center text-[10px] text-brand-700 dark:text-brand-300" style="height: ${Math.max(learnH, 2)}%; min-height: 14px">${it.learn || ''}</div>
            <div class="flex-1 bg-emerald-200 dark:bg-emerald-900/40 rounded-t flex items-end justify-center text-[10px] text-emerald-700 dark:text-emerald-300" style="height: ${Math.max(reviewH, 2)}%; min-height: 14px">${it.review || ''}</div>
          </div>
          <div class="text-xs text-slate-400 w-16 text-right">${it.learn + it.review}</div>
        </div>
      `;
    }).join('');
    wrap.innerHTML = `
      <div class="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span class="flex items-center gap-1"><span class="w-3 h-3 bg-brand-300 dark:bg-brand-700 rounded"></span>新增学习</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 bg-emerald-300 dark:bg-emerald-700 rounded"></span>复习</span>
      </div>
      ${html}
    `;
  },

  renderTagsChart() {
    const wrap = document.getElementById('tagsChart');
    if (!wrap) return;
    const items = (this.state.tags || []).slice(0, 10);
    if (items.length === 0) {
      wrap.innerHTML = '<div class="text-sm text-slate-400 text-center py-8">还没有使用任何标签</div>';
      return;
    }
    const max = items[0].count;
    wrap.innerHTML = items.map(it => {
      const pct = (it.count / max) * 100;
      return `
        <div class="mb-2">
          <div class="flex justify-between text-xs mb-1">
            <span class="font-medium">${escapeHtml(it.tag)}</span>
            <span class="text-slate-500">${it.count}</span>
          </div>
          <div class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div class="h-full bg-brand-500" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  },
};
