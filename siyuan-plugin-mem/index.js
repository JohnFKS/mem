"use strict";const s=require("siyuan");async function E(o,t){return await(await fetch(o,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}async function C(o){const t=await E("/api/block/getBlockKramdown",{id:o});return t&&t.data&&t.data.kramdown||""}const v="mem-capture-settings.json",y={url:"http://127.0.0.1:7788",tags:"思源",kind:"note",withSource:!0,useAiTitle:!1};class I extends s.Plugin{constructor(){super(...arguments),this.settings={...y},this.topBarEl=null}async onload(){const t=await this.loadData(v);this.settings=Object.assign({},y,t||{}),this.addIcons('<symbol id="iconMemCapture" viewBox="0 0 32 32"><path fill="currentColor" d="M16 2c-4.4 0-8 3.6-8 8 0 5.5 8 20 8 20s8-14.5 8-20c0-4.4-3.6-8-8-8zM16 12.5A2.5 2.5 0 1 1 16 7.5a2.5 2.5 0 0 1 0 5z"/></symbol>'),this.topBarEl=this.addTopBar({title:"记忆锚快捕 · 点击打开设置",icon:"iconMemCapture",position:"right",callback:()=>this.openSetting()}),this.eventBus.on("open-menu-content",this.onOpenMenuContent.bind(this))}onunload(){this.topBarEl=null}openSetting(){var n;const t=new s.Dialog({title:"记忆锚快捕 · 设置",content:`
        <div class="b3-dialog__content" style="display:flex;flex-direction:column;gap:12px">
          <label class="fn__flex" style="align-items:center;gap:8px">
            <span style="min-width:96px">记忆锚地址</span>
            <input id="memUrl" class="b3-text-field fn__flex-center" style="flex:1"
                   value="${q(this.settings.url)}" placeholder="http://127.0.0.1:7788">
          </label>
          <label class="fn__flex" style="align-items:center;gap:8px">
            <span style="min-width:96px">默认标签</span>
            <input id="memTags" class="b3-text-field fn__flex-center" style="flex:1"
                   value="${q(this.settings.tags)}" placeholder="思源, 数学">
          </label>
          <label class="fn__flex" style="align-items:center;gap:8px">
            <span style="min-width:96px">默认类型</span>
            <select id="memKind" class="b3-select fn__flex-center" style="flex:1">
              <option value="note" ${this.settings.kind==="note"?"selected":""}>笔记（知识点）</option>
              <option value="quiz" ${this.settings.kind==="quiz"?"selected":""}>题目（错题，需另填解答）</option>
            </select>
          </label>
          <label class="fn__flex" style="align-items:center;gap:8px">
            <input id="memWithSource" type="checkbox" class="b3-switch"
                   ${this.settings.withSource?"checked":""}>
            <span>在卡片末尾追加来源回链（可点击跳回思源）</span>
          </label>
          <div class="b3-dialog__action" style="justify-content:flex-end;gap:8px">
            <button id="memSaveBtn" class="b3-button b3-button--primary">保存</button>
          </div>
          <div class="ft__smaller ft__secondary">
            单向推送：只会向记忆锚建卡，不会修改思源里的任何内容。
          </div>
        </div>`,width:"520px"}),e=t.element;(n=e.querySelector("#memSaveBtn"))==null||n.addEventListener("click",async()=>{var a,c,i,r,u,d;this.settings.url=((c=(a=e.querySelector("#memUrl"))==null?void 0:a.value)==null?void 0:c.trim())||y.url,this.settings.tags=((r=(i=e.querySelector("#memTags"))==null?void 0:i.value)==null?void 0:r.trim())||"";const l=(u=e.querySelector("#memKind"))==null?void 0:u.value;this.settings.kind=l==="quiz"?"quiz":"note",this.settings.withSource=!!((d=e.querySelector("#memWithSource"))!=null&&d.checked),await this.saveData(v,this.settings),s.showMessage("记忆锚快捕：设置已保存"),t.destroy()})}onOpenMenuContent({detail:t}){const e=t==null?void 0:t.menu;if(!e)return;const n=this.settings.kind==="quiz"?"（题目）":"（笔记）";e.addItem({id:"mem-send-default",iconHTML:"📌",label:`发送到记忆锚${n}`,click:()=>this.send(t,this.settings.kind)}),this.settings.kind==="quiz"?e.addItem({id:"mem-send-note",iconHTML:"📝",label:"作为笔记发送到记忆锚",click:()=>this.send(t,"note")}):e.addItem({id:"mem-send-quiz",iconHTML:"🧮",label:"作为题目发送到记忆锚（错题）",click:()=>this.send(t,"quiz")})}async send(t,e){var n,l,a,c,i,r,u,d,b,k,w,x,_;try{let m=(((n=window.getSelection())==null?void 0:n.toString())||"").trim();const h=((a=(l=t==null?void 0:t.element)==null?void 0:l.getAttribute)==null?void 0:a.call(l,"data-node-id"))||((r=(i=(c=t==null?void 0:t.blockElements)==null?void 0:c[0])==null?void 0:i.getAttribute)==null?void 0:r.call(i,"data-node-id"))||"";if(!m&&h&&(m=(await C(h)).trim()),!m){s.showMessage("记忆锚快捕：没有选中内容",3e3,"error");return}const T=((k=(b=(d=(u=t==null?void 0:t.protyle)==null?void 0:u.title)==null?void 0:d.element)==null?void 0:b.textContent)==null?void 0:k.trim())||((_=(x=(w=t==null?void 0:t.protyle)==null?void 0:w.background)==null?void 0:x.ial)==null?void 0:_.title)||"思源",M=(this.settings.tags||"").split(/[,，\s]+/).map(B=>B.trim()).filter(Boolean),$=e||this.settings.kind||"note",z={content_md:m,title:"",tags:M,kind:$,source:this.settings.withSource&&h?{doc_name:T,block_id:h,url:`siyuan://blocks/${h}`}:null},g=await fetch(`${this.settings.url.replace(/\/+$/,"")}/api/records/quick-capture`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(z)});if(!g.ok){s.showMessage(`记忆锚快捕：发送失败 (${g.status})`,4e3,"error");return}const f=await g.json(),S=f.kind==="quiz"?"（题目卡，记得去补标准解答）":"";m.includes("![")?s.showMessage(`已发送${S}（选中内容含图片，仅文字已同步）`,5e3):s.showMessage(`已发送到记忆锚${S}：卡片 #${f.id} ${f.title||""}`.trim(),5e3)}catch(p){s.showMessage(`记忆锚快捕：${(p==null?void 0:p.message)||p}`,4e3,"error")}}}function q(o){return(o||"").replace(/"/g,"&quot;")}module.exports=I;
