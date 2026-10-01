import { Dialog, Menu, Plugin, showMessage } from "siyuan";
import { getBlockKramdown } from "./api";

const SETTING_FILE = "mem-capture-settings.json";

interface MemSettings {
  /** 记忆锚地址, 如 http://127.0.0.1:7788 */
  url: string;
  /** 默认标签, 逗号分隔 */
  tags: string;
  /** 默认卡片类型: note 笔记 / quiz 题目(错题) */
  kind: "note" | "quiz";
  /** 是否在卡片末尾追加来源回链 */
  withSource: boolean;
  /** 是否在 AI 可用时用它生成标题 (需记忆锚已配置 AI) */
  useAiTitle: boolean;
}

const DEFAULT_SETTINGS: MemSettings = {
  url: "http://127.0.0.1:7788",
  tags: "思源",
  kind: "note",
  withSource: true,
  useAiTitle: false,
};

export default class MemPlugin extends Plugin {
  private settings: MemSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    const saved = await this.loadData(SETTING_FILE);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved || {});

    // 编辑器右键菜单: 选中文字 -> 发送到记忆锚
    this.eventBus.on("open-menu-content", this.onOpenMenuContent.bind(this));
  }

  onunload() {
    /* 无需清理 */
  }

  openSetting() {
    const d = new Dialog({
      title: "记忆锚快捕 · 设置",
      content: `
        <div class="b3-dialog__content" style="display:flex;flex-direction:column;gap:12px">
          <label class="fn__flex" style="align-items:center;gap:8px">
            <span style="min-width:96px">记忆锚地址</span>
            <input id="memUrl" class="b3-text-field fn__flex-center" style="flex:1"
                   value="${escapeAttr(this.settings.url)}" placeholder="http://127.0.0.1:7788">
          </label>
          <label class="fn__flex" style="align-items:center;gap:8px">
            <span style="min-width:96px">默认标签</span>
            <input id="memTags" class="b3-text-field fn__flex-center" style="flex:1"
                   value="${escapeAttr(this.settings.tags)}" placeholder="思源, 数学">
          </label>
          <label class="fn__flex" style="align-items:center;gap:8px">
            <span style="min-width:96px">默认类型</span>
            <select id="memKind" class="b3-select fn__flex-center" style="flex:1">
              <option value="note" ${this.settings.kind === "note" ? "selected" : ""}>笔记（知识点）</option>
              <option value="quiz" ${this.settings.kind === "quiz" ? "selected" : ""}>题目（错题，需另填解答）</option>
            </select>
          </label>
          <label class="fn__flex" style="align-items:center;gap:8px">
            <input id="memWithSource" type="checkbox" class="b3-switch"
                   ${this.settings.withSource ? "checked" : ""}>
            <span>在卡片末尾追加来源回链（可点击跳回思源）</span>
          </label>
          <div class="b3-dialog__action" style="justify-content:flex-end;gap:8px">
            <button id="memSaveBtn" class="b3-button b3-button--primary">保存</button>
          </div>
          <div class="ft__smaller ft__secondary">
            单向推送：只会向记忆锚建卡，不会修改思源里的任何内容。
          </div>
        </div>`,
      width: "520px",
    });
    const el = d.element;
    el.querySelector("#memSaveBtn")?.addEventListener("click", async () => {
      this.settings.url = (el.querySelector("#memUrl") as HTMLInputElement)?.value?.trim()
        || DEFAULT_SETTINGS.url;
      this.settings.tags = (el.querySelector("#memTags") as HTMLInputElement)?.value?.trim() || "";
      const kind = (el.querySelector("#memKind") as HTMLSelectElement)?.value;
      this.settings.kind = kind === "quiz" ? "quiz" : "note";
      this.settings.withSource = !!(el.querySelector("#memWithSource") as HTMLInputElement)?.checked;
      await this.saveData(SETTING_FILE, this.settings);
      showMessage("记忆锚快捕：设置已保存");
      d.destroy();
    });
  }

  private onOpenMenuContent({ detail }: any) {
    const menu: Menu = detail?.menu;
    if (!menu) return;
    const kindLabel = this.settings.kind === "quiz" ? "（题目）" : "（笔记）";
    menu.addItem({
      iconHTML: "📌",
      label: `发送到记忆锚${kindLabel}`,
      click: () => this.send(detail, this.settings.kind),
    });
    // 与默认类型相反的一项, 省得为了发一道题去改设置
    if (this.settings.kind === "quiz") {
      menu.addItem({
        iconHTML: "📝",
        label: "作为笔记发送到记忆锚",
        click: () => this.send(detail, "note"),
      });
    } else {
      menu.addItem({
        iconHTML: "🧮",
        label: "作为题目发送到记忆锚（错题）",
        click: () => this.send(detail, "quiz"),
      });
    }
  }

  private async send(detail: any, kindOverride?: "note" | "quiz") {
    try {
      // 1) 取选区文字; 为空则退回整个块
      const selection = (window.getSelection()?.toString() || "").trim();
      let content = selection;

      // 2) 取块 ID (用于来源回链与整块兜底)
      const blockId: string =
        detail?.element?.getAttribute?.("data-node-id") ||
        detail?.blockElements?.[0]?.getAttribute?.("data-node-id") ||
        "";

      if (!content && blockId) {
        content = (await getBlockKramdown(blockId)).trim();
      }
      if (!content) {
        showMessage("记忆锚快捕：没有选中内容", 3000, "error");
        return;
      }

      // 3) 文档名 (用于回链显示文字)
      const docName: string =
        detail?.protyle?.title?.element?.textContent?.trim() ||
        detail?.protyle?.background?.ial?.title ||
        "思源";

      const tags = (this.settings.tags || "")
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const kind = kindOverride || this.settings.kind || "note";
      const payload: any = {
        content_md: content,
        title: "", // 由记忆锚侧生成 (AI 可用时可选增强, 否则取首行)
        tags,
        kind, // note=笔记 / quiz=题目(错题), 题目卡后续可在记忆锚里补"标准解答与评分点"
        source: this.settings.withSource && blockId
          ? { doc_name: docName, block_id: blockId, url: `siyuan://blocks/${blockId}` }
          : null,
      };

      const res = await fetch(`${this.settings.url.replace(/\/+$/, "")}/api/records/quick-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        showMessage(`记忆锚快捕：发送失败 (${res.status})`, 4000, "error");
        return;
      }
      const data = await res.json();

      // 4) 图片提示 (初版不同步图片)
      const kindTip = data.kind === "quiz" ? "（题目卡，记得去补标准解答）" : "";
      if (content.includes("![")) {
        showMessage(`已发送${kindTip}（选中内容含图片，仅文字已同步）`, 5000);
      } else {
        showMessage(`已发送到记忆锚${kindTip}：卡片 #${data.id} ${data.title || ""}`.trim(), 5000);
      }
    } catch (e: any) {
      showMessage(`记忆锚快捕：${e?.message || e}`, 4000, "error");
    }
  }
}

function escapeAttr(s: string): string {
  return (s || "").replace(/"/g, "&quot;");
}
