import { createReportContent } from "./report-demo-content.js";
import "./report-history.css";

const STORAGE_KEY = "msense-report-followups-v1";
const MODEL_OPTIONS = [
  { id: "auto", name: "自动", contextLimit: 128000 },
  { id: "doubao-2.1-lite", name: "豆包 2.1 Lite", badge: "0921 新版", contextLimit: 64000 },
  { id: "doubao-2.1-pro", name: "豆包 2.1 Pro", contextLimit: 128000 },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", badge: "新上线", contextLimit: 192000 },
  { id: "orange-5.5", name: "Orange 5.5", badge: "当前繁忙", contextLimit: 128000 },
  { id: "gpt-6-astra", name: "GPT-6 Astra", contextLimit: 192000 },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", contextLimit: 1000000 },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", contextLimit: 128000 }
];
const REASONING_OPTIONS = [
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
  ["very-high", "极高"],
  ["maximum", "最高"]
];
const DEFAULT_MODEL = "orange-5.5";
const DEFAULT_REASONING = "high";

export function mountReportHistory({ main, shell, showToast }) {
  const content = createReportContent();
  const { esc, ic, flatSections, findSec, blocksHTML, askBtn, secHTML, tableBlockHTML, renderMD, answer, suggFor } = content;
  const root = document.createElement("section");
  root.id = "report-history";
  root.hidden = true;
  main.append(root);
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  let report, popup, popupAnchor, fullscreenAnchor;
  let reportContextTokens = 0;
  let modelMenuOpen = false;
  let reasoningMenuOpen = false;
  let sessions = {};
  try { sessions = JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {}; } catch { /* Use in-memory sessions when storage is unavailable. */ }
  let migratedInline = false;
  // A reload cannot resume a frontend stream. Move legacy inline follow-ups
  // into the primary conversation so report content remains immutable.
  for (const saved of Object.values(sessions)) {
    saved.messages ||= [];
    for (const turn of [...(saved.messages || []), ...Object.values(saved.inline || {}).flat()]) {
      if (turn.role !== "user" && !turn.done) { turn.done = true; turn.stopped = true; }
    }
    if (!saved.inlineMigrated) {
      for (const [scope, turns] of Object.entries(saved.inline || {})) {
        for (const turn of turns) {
          if (turn.moved) continue;
          saved.messages.push(
            { role: "user", q: turn.q, scope, quote: turn.quote || "" },
            { ...turn, role: "assistant", scope }
          );
        }
      }
      saved.inline = {};
      saved.inlineMigrated = true;
      migratedInline = true;
    }
  }
  if (migratedInline) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch { /* Keep the migrated conversation in memory. */ }
  }
  const tasks = new Map();
  const filters = { scope: "all", type: "all", time: "all", kw: "" };
  const narrow = () => window.innerWidth < 1100;
  const session = () => {
    const s = sessions[report.id] ||= { messages: [], draft: "", quote: "", focusScope: "", topicStart: 0, historyExpanded: false, inlineMigrated: true };
    s.messages ||= [];
    s.focusScope = s.focusScope || (s.scope && s.scope !== "all" ? s.scope : "");
    s.scope = "all";
    s.topicStart = Number.isInteger(s.topicStart) ? Math.max(0, Math.min(s.topicStart, s.messages.length)) : 0;
    s.historyExpanded = Boolean(s.historyExpanded);
    s.model = MODEL_OPTIONS.some(option => option.id === s.model) ? s.model : DEFAULT_MODEL;
    s.reasoning = REASONING_OPTIONS.some(([value]) => value === s.reasoning) ? s.reasoning : DEFAULT_REASONING;
    return s;
  };
  const save = () => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch { /* The current conversation remains available in memory. */ }
  };
  const scopeLabel = scope => scope === "all" ? "整份报告" : findSec(report, scope)?.title || "整份报告";
  const taskKey = scope => `${report.id}:${scope}`;
  const modelOption = id => MODEL_OPTIONS.find(option => option.id === id) || MODEL_OPTIONS.find(option => option.id === DEFAULT_MODEL);
  const reasoningLabel = value => REASONING_OPTIONS.find(([option]) => option === value)?.[1] || "高";

  function contextUsage() {
    const s = session();
    const model = modelOption(s.model);
    const conversationText = JSON.stringify(s.messages) + s.draft + s.quote;
    const used = Math.max(1, reportContextTokens + Math.ceil(conversationText.length * .58));
    return { used, limit: model.contextLimit, percent: Math.max(1, Math.min(99, Math.round(used / model.contextLimit * 100))) };
  }

  function tokenLabel(value) {
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k` : String(value);
  }

  function modelControlsHTML() {
    const s = session();
    const model = modelOption(s.model);
    const usage = contextUsage();
    return `<span class="ai-context-meter" role="status" aria-label="上下文已使用 ${usage.percent}%，约 ${tokenLabel(usage.used)} / ${tokenLabel(usage.limit)} tokens" title="上下文约 ${tokenLabel(usage.used)} / ${tokenLabel(usage.limit)} tokens">
      <span class="ai-context-ring" style="--context:${usage.percent}"></span></span>
      <button class="ai-model-trigger" id="aiModelToggle" type="button" aria-haspopup="menu" aria-expanded="${modelMenuOpen}" title="选择模型和推理强度">
        ${ic("sparkles", 14)}<span class="ai-model-name">${esc(model.name)}</span><span class="ai-reasoning-value">${esc(reasoningLabel(s.reasoning))}</span>${ic("down", 12)}
      </button>
      <div class="ai-model-popover${reasoningMenuOpen ? " reasoning-open" : ""}" role="menu" aria-label="模型与推理强度" ${modelMenuOpen ? "" : "hidden"}>
        <div class="ai-model-main">
          <div class="ai-model-list" role="listbox" aria-label="选择模型">
            ${MODEL_OPTIONS.map(option => `<button type="button" class="ai-model-option${option.id === s.model ? " selected" : ""}" data-model-id="${option.id}" role="option" aria-selected="${option.id === s.model}">
              <span class="ai-provider-icon">${ic("sparkles", 14)}</span><span>${esc(option.name)}</span>${option.badge ? `<small>${esc(option.badge)}</small>` : ""}${option.id === s.model ? ic("check", 15) : ""}
            </button>`).join("")}
          </div>
          <button type="button" class="ai-reasoning-toggle" data-reasoning-toggle aria-expanded="${reasoningMenuOpen}">
            ${ic("target", 15)}<span>推理强度</span><b>${esc(reasoningLabel(s.reasoning))}</b>${ic("side", 14)}
          </button>
        </div>
        <div class="ai-reasoning-menu" role="listbox" aria-label="选择推理强度" ${reasoningMenuOpen ? "" : "hidden"}>
          ${REASONING_OPTIONS.map(([value, label]) => `<button type="button" data-reasoning-level="${value}" role="option" aria-selected="${value === s.reasoning}"><span>${esc(label)}</span>${value === s.reasoning ? ic("check", 15) : ""}</button>`).join("")}
        </div>
      </div>`;
  }

  function renderModelControls() {
    const controls = $("#aiConfig");
    if (controls) controls.innerHTML = modelControlsHTML();
  }

  function cancelTasks() {
    tasks.forEach(task => { task.cancelled = true; task.turn.done = true; task.turn.stopped = true; });
    tasks.clear();
    if (report) save();
  }

  function closePopup(restoreFocus = false) {
    popup?.remove();
    popup = undefined;
    popupAnchor?.classList.remove("on");
    popupAnchor?.setAttribute("aria-expanded", "false");
    popupAnchor?.setAttribute("aria-pressed", "false");
    if (restoreFocus) popupAnchor?.focus({ preventScroll: true });
    popupAnchor = undefined;
  }

  function setExpanded(on) {
    root.classList.toggle("expanded", on);
    const button = $("#aiFold");
    if (!button) return;
    button.innerHTML = ic(on ? "down" : "chevup");
    button.setAttribute("aria-label", on ? "收起对话" : "展开对话");
    button.setAttribute("aria-expanded", String(on));
  }

  function render(page, id) {
    if (page === "report" && report?.id === id && !root.hidden) return;
    cancelTasks();
    closePopup();
    modelMenuOpen = false;
    reasoningMenuOpen = false;
    shell.classList.remove("has-report-agent");
    root.classList.remove("detail", "expanded");
    root.hidden = !["history", "report"].includes(page);
    report = undefined;
    reportContextTokens = 0;
    if (root.hidden) { root.innerHTML = ""; return; }
    report = page === "report" ? content.reports[id] : undefined;
    if (page === "report" && !report) {
      root.innerHTML = `<div class="r-empty"><h1>报告不存在</h1><a href="#/history" class="btn-o">${ic("back")}返回过往分析报告</a></div>`;
      return;
    }
    if (!report) { renderList(); return; }
    reportContextTokens = Math.ceil(JSON.stringify(report).length * .58);
    content.state.report = report;
    content.state.tabs = {};
    content.state.transposed = {};
    root.classList.add("detail");
    shell.classList.add("has-report-agent");
    renderReport();
  }

  function renderList() {
    root.innerHTML = `<header class="r-list-header"><div><h1>过往分析报告</h1><p>查看实验分析进度与已生成的报告。</p></div>
      <div class="r-list-actions"><div class="seg" role="group" aria-label="报告范围">${[["mine", "我的"], ["all", "全部"]].map(([value, label]) => `<button data-r-scope="${value}" class="${filters.scope === value ? "on" : ""}" aria-pressed="${filters.scope === value}">${label}</button>`).join("")}</div>
      <button class="btn-o" data-r-refresh>${ic("refresh")}刷新</button></div></header>
      <div class="r-filters" role="search"><label class="r-search">${ic("search")}<input type="search" id="report-search" placeholder="搜索实验 ID / 名称" aria-label="搜索报告或实验 ID" value="${esc(filters.kw)}"></label>
      ${filterSelect("type", "报告类型", [["all", "全部类型"], ["实验报告", "实验报告"], ["单模块报告", "单模块报告"]])}
      ${filterSelect("time", "创建时间", [["all", "全部时间"], ["7", "近 7 天"], ["30", "近 30 天"]])}</div><div class="r-cards"></div>`;
    renderCards();
  }

  function filterSelect(key, label, options) {
    return `<select data-r-filter="${key}" aria-label="${label}">${options.map(([value, name]) => `<option value="${value}" ${filters[key] === value ? "selected" : ""}>${name}</option>`).join("")}</select>`;
  }

  function renderCards() {
    const kw = filters.kw.trim().toLowerCase();
    const rows = content.list.filter(r => {
      const age = (new Date() - new Date(r.created.replace(" ", "T"))) / 864e5;
      return (filters.scope === "all" || r.owner === "秦娇芸") && (filters.type === "all" || r.type === filters.type)
        && (filters.time === "all" || age >= 0 && age <= Number(filters.time))
        && (!kw || `${r.title} ${r.exp} ${r.libra} ${r.qx}`.toLowerCase().includes(kw));
    });
    $(".r-cards").innerHTML = rows.length ? rows.map(r => `<article class="rcard">
      <span class="rcard-icon">${ic("file", 20)}</span><div class="rcard-copy">
      <a class="rcard-link" href="#/report/${r.rid}"><strong>${esc(r.title)}</strong><span>实验名称：${esc(r.exp)}</span></a>
      <p class="rcard-type">${esc(r.type)} · 实验 ID ${esc(r.libra)} · 钱效平台 ID ${esc(r.qx)}</p>
      <div class="rcard-meta"><span class="r-owner"><span class="r-avatar">${esc(r.owner[0])}</span>${esc(r.owner)}</span><time>创建时间：${esc(r.created)}</time><time>生成时间：${esc(r.generated)}</time></div></div>
      <a href="#/report/${r.rid}" class="r-view-link">查看报告${ic("side", 14)}</a></article>`).join("")
      : `<div class="r-empty">${ic("search", 24)}<p>没有符合条件的报告</p><button class="btn-o" data-r-reset>重置筛选</button></div>`;
  }

  function renderReport() {
    const summary = report.summary;
    root.innerHTML = `<div class="r-reading"><div class="r-report-toolbar"><a href="#/history">${ic("back")}过往分析报告</a><span>${esc(report.kind)}</span></div>
      <div id="view" tabindex="-1"><div class="rlayout">${content.tocHTML(report)}
      <article class="report" id="report" aria-label="分析报告正文"><header class="rhead"><p class="eyebrow">实验分析报告</p><h1>${esc(report.title)}</h1>
      <dl class="meta">${report.meta.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd title="${esc(value)}">${esc(value)}</dd></div>`).join("")}</dl></header>
      ${summary ? `<section class="sec" id="sec-${summary.id}" data-sec="${summary.id}"><div class="ccard" data-card="${summary.id}"><div class="ccard-h"><span class="t">${ic("chart")}${esc(summary.title)}</span><span class="grow"></span>${askBtn(summary.id)}</div>
      <p class="lead">${esc(summary.lead)}</p>${blocksHTML(summary.blocks)}</div></section>` : ""}
      ${flatSections(report).map(secHTML).join("")}</article></div></div></div>
      <aside class="ai" id="ai" aria-label="报告追问助手"><div class="ai-h"><span class="mark">${ic("sparkles", 14)}</span><strong>报告追问</strong><span class="grow"></span>
      <button class="ai-new-topic" id="aiNew" title="开启新话题" aria-label="开启新话题">${ic("newchat", 14)}<span>开启新话题</span></button>
      <button class="icon-btn" id="aiWide" title="加宽对话框" aria-label="加宽对话框" aria-pressed="false">${ic("expand")}</button>
      <button class="icon-btn" id="aiFold" aria-label="展开对话" aria-expanded="false">${ic("chevup")}</button></div>
      <div class="ai-ctx">${ic("file")}<div><small>上下文选取整份报告的全部内容</small><b title="${esc(report.title)}">${esc(report.title)}</b></div></div>
      <div class="ai-msgs" id="aiMsgs" role="log" aria-label="报告追问对话记录" aria-live="polite" aria-relevant="additions"></div>
      <form class="ai-in" id="aiForm"><div class="box"><div id="aiFocus"></div><div id="aiQuote"></div><textarea id="aiText" rows="2" aria-label="向报告助手提问" placeholder="针对这份报告提问…">${esc(session().draft)}</textarea>
      <div class="box-f"><div class="ai-config" id="aiConfig"></div><button class="send" id="aiSend" type="submit" aria-label="发送">${ic("up")}</button></div></div><small class="r-input-hint">Enter 发送 · Shift+Enter 换行</small></form></aside>
      <button class="sel-ask" id="selAsk" hidden>${ic("sparkles", 14)}追问这段</button>`;
    renderAgent(); autoGrow();
    $("#view").addEventListener("scroll", () => { syncToc(); positionPopup(); positionSelection(); }, { passive: true });
    syncToc();
  }

  function turnHTML(turn, index) {
    if (turn.role === "user") return `<div class="msg u">${turn.quote ? `<blockquote class="qref">${esc(turn.quote)}</blockquote>` : ""}<div class="bubble">${esc(turn.q)}</div>
      </div>`;
    return `<div class="msg a" data-turn="${index}"><span class="mark sm">${ic("sparkles", 12)}</span>
      <div class="answer-body"><div class="steps">${turn.done ? ic("check", 13) : '<span class="dots"><i></i><i></i><i></i></span>'}${esc(turn.stopped ? "已停止生成" : turn.done ? "已结合报告内容回答" : turn.step || "正在读取报告内容…")}</div>
      <div class="md">${renderMD(turn.md || "")}${!turn.done && turn.md ? '<span class="caret"></span>' : ""}</div>
      ${turn.done && !turn.stopped ? `<div class="follow">${(turn.follow || []).slice(0, 3).map(q => `<button data-q="${esc(q)}" data-q-scope="${esc(turn.scope || "all")}">${esc(q)}</button>`).join("")}</div>` : ""}
      ${turn.done ? `<div class="acts"><button data-copy="${index}">${ic("copy", 12)}复制</button><button data-regen="${index}">${ic("refresh", 12)}重新生成</button></div>` : ""}</div></div>`;
  }

  function recommendationsHTML() {
    return `<section class="ai-recs" aria-label="整份报告推荐追问">
      <div class="ai-recs-h"><span>推荐问题</span></div>
      ${suggFor(null).map(q => `<button class="sugg" data-q="${esc(q)}" data-q-scope="all">${ic("sparkles", 14)}${esc(q)}</button>`).join("")}</section>`;
  }

  function renderAgent({ focusHistory = false } = {}) {
    if (!report || !$("#aiMsgs")) return;
    const s = session(), pane = $("#aiMsgs");
    if (s.focusScope && !findSec(report, s.focusScope)) s.focusScope = "";
    const history = s.messages.slice(0, s.topicStart);
    const current = s.messages.slice(s.topicStart);
    const historyHTML = history.length ? `<section class="ai-history" aria-label="最近对话记录">
      ${s.historyExpanded ? `<div class="ai-history-turns">${history.map((turn, i) => turnHTML(turn, i)).join("")}</div>` : ""}
      <button type="button" class="ai-history-toggle" data-history-toggle aria-expanded="${s.historyExpanded}">
        <span class="ai-history-line"></span><span class="ai-history-copy">最近对话记录已${s.historyExpanded ? "展开" : "收起"}，<em>点击${s.historyExpanded ? "收起" : "展开"}</em></span><span class="ai-history-line"></span>
      </button></section>` : "";
    const currentHTML = current.length ? current.map((turn, i) => turnHTML(turn, s.topicStart + i)).join("")
      : `<div class="ai-empty"><span class="mark">${ic("sparkles", 14)}</span><h3>${history.length ? "已开启新话题" : "对这份报告有什么想问的？"}</h3>
      <p>${history.length ? "之前的对话已保留在上方，可以继续针对这份报告提问。" : "可以总结结论、对比实验组、解释指标，或讨论下一步策略。点击回答中的引用可查看报告原文。"}</p></div>`;
    pane.innerHTML = historyHTML + currentHTML + (!current.length ? recommendationsHTML() : "");
    $("#aiFocus").innerHTML = s.focusScope ? `<div class="focus-chip">${ic("target", 12)}<span>关注：${esc(scopeLabel(s.focusScope))}</span><button type="button" data-remove-focus aria-label="清除关注模块">${ic("x", 12)}</button></div>` : "";
    $("#aiQuote").innerHTML = s.quote ? `<div class="qchip">${ic("quote", 12)}<span>${esc(s.quote)}</span><button type="button" data-remove-quote aria-label="移除引用">${ic("x", 12)}</button></div>` : "";
    $("#aiText").placeholder = s.focusScope ? `针对「${scopeLabel(s.focusScope)}」提问…` : "针对这份报告提问…";
    $$("[data-ask]").forEach(button => {
      const active = popup?.dataset.scope === button.dataset.ask;
      button.classList.toggle("on", active);
      button.setAttribute("aria-expanded", String(active));
      button.setAttribute("aria-pressed", String(active));
    });
    pane.setAttribute("aria-busy", String(tasks.has(taskKey("chat"))));
    const historyToggle = pane.querySelector("[data-history-toggle]");
    pane.scrollTop = focusHistory && historyToggle
      ? Math.max(0, historyToggle.offsetTop - pane.clientHeight / 2)
      : s.messages.length ? pane.scrollHeight : 0;
    renderModelControls();
    updateSend();
  }

  // Frontend demo adapter: replace with POST /reports/:id/followups for a model service.
  // Request: {reportId, scope, question, quote, history, model, reasoning}; response: {steps, md, follow}.
  async function generate(turn, destination, reportId) {
    const key = `${reportId}:${destination}`;
    const task = { turn, cancelled: false }; tasks.set(key, task);
    const tick = () => {
      if (report?.id !== reportId || task.cancelled) return;
      renderAgent();
    };
    const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));
    try {
      const result = answer(turn.q, turn.scope, turn.quote);
      tick(); save();
      for (const step of result.steps || []) {
        if (task.cancelled) return;
        turn.step = step + "…"; tick(); await delay(180);
      }
      const tokens = result.md.match(/\[\[cite:[^\]]+\]\]|.{1,28}|\n/g) || [];
      for (const token of tokens) {
        if (task.cancelled) return;
        turn.md = (turn.md || "") + token; tick(); await delay(18);
      }
      if (!task.cancelled) { turn.done = true; turn.follow = result.follow || []; }
    } catch {
      turn.done = true; turn.stopped = true;
      turn.md = "本次回答未完成，请重新提问。";
    } finally {
      if (tasks.get(key) === task) tasks.delete(key);
      save();
      if (report?.id === reportId) renderAgent();
    }
  }

  function stop(destination) {
    const task = tasks.get(taskKey(destination));
    if (!task) return;
    task.cancelled = true; task.turn.done = true; task.turn.stopped = true;
    tasks.delete(taskKey(destination)); save();
    renderAgent();
  }

  function send(question, requestedScope = "") {
    const q = String(question || "").trim();
    if (!q || !report || tasks.has(taskKey("chat"))) return;
    const s = session();
    const scope = findSec(report, requestedScope) ? requestedScope : findSec(report, s.focusScope) ? s.focusScope : "all";
    const turn = { role: "assistant", q, scope, quote: s.quote, model: s.model, reasoning: s.reasoning, md: "", done: false };
    s.messages.push({ role: "user", q, scope, quote: s.quote }, turn);
    s.focusScope = scope === "all" ? "" : scope;
    s.draft = ""; s.quote = ""; $("#aiText").value = ""; autoGrow();
    modelMenuOpen = false;
    reasoningMenuOpen = false;
    if (narrow()) setExpanded(true);
    generate(turn, "chat", report.id);
  }

  function openPopup(button, scope) {
    if (!findSec(report, scope)) return;
    if (popup?.dataset.scope === scope) { closePopup(true); return; }
    closePopup();
    modelMenuOpen = false;
    reasoningMenuOpen = false;
    renderModelControls();
    popupAnchor = button;
    popup = document.createElement("div");
    popup.className = "pop";
    popup.dataset.scope = scope;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", `追问${scopeLabel(scope)}`);
    const busy = tasks.has(taskKey("chat"));
    popup.innerHTML = `<div class="pop-h">${ic("sparkles", 14)}<span>追问「${esc(scopeLabel(scope))}」</span><button type="button" class="icon-btn" data-close-popup aria-label="关闭追问">${ic("x", 14)}</button></div>
      ${suggFor(scope).map(q => `<button type="button" class="pop-q" data-pq="${esc(q)}" ${busy ? "disabled" : ""}>${esc(q)}</button>`).join("")}
      <form class="pop-in"><input placeholder="请输入问题" aria-label="输入模块追问" autocomplete="off"><button type="submit" disabled>提问</button></form>`;
    root.append(popup);
    button.classList.add("on");
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-pressed", "true");
    positionPopup();
    popup.querySelector("input")?.focus({ preventScroll: true });
  }

  function positionPopup() {
    if (!popup || !popupAnchor?.isConnected) return;
    const anchor = popupAnchor.getBoundingClientRect();
    const panel = popup.getBoundingClientRect();
    const view = $("#view")?.getBoundingClientRect();
    if (view && (anchor.bottom < view.top || anchor.top > view.bottom)) { closePopup(); return; }
    const rightEdge = narrow() ? window.innerWidth : $(".ai")?.getBoundingClientRect().left || window.innerWidth;
    const bottomEdge = narrow() ? $(".ai")?.getBoundingClientRect().top || window.innerHeight : window.innerHeight;
    popup.style.left = Math.max(12, Math.min(anchor.right - panel.width, rightEdge - panel.width - 12)) + "px";
    popup.style.top = Math.max(52, Math.min(anchor.bottom + 8, bottomEdge - panel.height - 12)) + "px";
  }

  function askFromPopup(question) {
    const q = String(question || "").trim();
    const scope = popup?.dataset.scope;
    if (!q || !scope || tasks.has(taskKey("chat"))) return;
    closePopup();
    send(q, scope);
  }

  function updateSend() {
    const busy = tasks.has(taskKey("chat")), button = $("#aiSend");
    button.disabled = !busy && !$("#aiText").value.trim();
    button.classList.toggle("stop", busy);
    button.setAttribute("aria-label", busy ? "停止生成" : "发送");
    button.innerHTML = ic(busy ? "stop" : "up");
    $("#aiNew").disabled = busy;
  }

  function autoGrow() {
    const textarea = $("#aiText");
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(140, textarea.scrollHeight) + "px";
  }

  function gotoSection(scope, block) {
    const section = $(`#sec-${scope}`);
    const target = block ? section?.querySelector(`[data-bid="${block}"]`) || section : section;
    if (!target) return;
    if (narrow()) setExpanded(false);
    target.scrollIntoView({ block: block ? "center" : "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const card = target.closest(".ccard") || target;
    target.classList.add("hl-quote"); card.classList.add("flash");
    window.setTimeout(() => { target.classList.remove("hl-quote"); card.classList.remove("flash"); }, 2000);
  }

  function syncToc() {
    const sections = $$(".sec");
    let current = sections[0]?.dataset.sec;
    sections.forEach(el => { if (el.getBoundingClientRect().top < 180) current = el.dataset.sec; });
    $$(".toc-item").forEach(el => {
      el.classList.toggle("active", el.dataset.goto === current);
      if (el.dataset.goto === current) el.setAttribute("aria-current", "location"); else el.removeAttribute("aria-current");
    });
  }

  function closeFullscreen() {
    $(".tblock.fs")?.classList.remove("fs"); $(".fs-mask")?.remove();
    fullscreenAnchor?.focus({ preventScroll: true });
  }

  function toggleFullscreen(scope, anchor) {
    if ($(`#tb-${scope}`)?.classList.contains("fs")) { closeFullscreen(); return; }
    closeFullscreen(); fullscreenAnchor = anchor;
    const mask = document.createElement("button"); mask.className = "fs-mask"; mask.dataset.closeFullscreen = "";
    mask.setAttribute("aria-label", "关闭数据全屏"); root.append(mask);
    $(`#tb-${scope}`)?.classList.add("fs");
    $(`#tb-${scope} [data-fs]`)?.focus({ preventScroll: true });
  }

  root.addEventListener("input", e => {
    if (e.target.id === "report-search") { filters.kw = e.target.value; renderCards(); }
    if (e.target.id === "aiText") { session().draft = e.target.value; save(); autoGrow(); renderModelControls(); updateSend(); }
    if (e.target.closest(".pop-in")) {
      const submit = popup?.querySelector('[type="submit"]');
      if (submit) submit.disabled = !e.target.value.trim() || tasks.has(taskKey("chat"));
    }
  });
  root.addEventListener("change", e => {
    if (e.target.dataset.rFilter) { filters[e.target.dataset.rFilter] = e.target.value; renderCards(); }
  });
  root.addEventListener("submit", e => {
    e.preventDefault();
    if (e.target.id === "aiForm") { if (tasks.has(taskKey("chat"))) stop("chat"); else send($("#aiText").value); }
    if (e.target.matches(".pop-in")) askFromPopup(e.target.querySelector("input")?.value);
  });
  root.addEventListener("click", e => {
    const button = e.target.closest("button");
    if (!button) return;
    const d = button.dataset;
    if (button.id === "aiModelToggle") {
      modelMenuOpen = !modelMenuOpen;
      reasoningMenuOpen = false;
      renderModelControls();
      return;
    }
    if (d.modelId) {
      session().model = d.modelId;
      modelMenuOpen = false;
      reasoningMenuOpen = false;
      save();
      renderModelControls();
      showToast(`已切换为 ${modelOption(d.modelId).name}`);
      return;
    }
    if ("reasoningToggle" in d) {
      reasoningMenuOpen = !reasoningMenuOpen;
      renderModelControls();
      return;
    }
    if (d.reasoningLevel) {
      session().reasoning = d.reasoningLevel;
      modelMenuOpen = false;
      reasoningMenuOpen = false;
      save();
      renderModelControls();
      showToast(`推理强度已设为${reasoningLabel(d.reasoningLevel)}`);
      return;
    }
    if (d.rScope) { filters.scope = d.rScope; renderList(); }
    if ("rRefresh" in d) { renderCards(); showToast("已刷新报告列表"); }
    if ("rReset" in d) { Object.assign(filters, { scope: "all", type: "all", time: "all", kw: "" }); renderList(); }
    if (d.ask) openPopup(button, d.ask);
    if ("closePopup" in d) closePopup(true);
    if (d.pq) askFromPopup(d.pq);
    if (d.q) send(d.q, d.qScope);
    if (d.goto) gotoSection(d.goto);
    if (d.cite) { const [scope, block] = d.cite.split(":"); gotoSection(scope, block); }
    if (d.tab) {
      const [scope, tab] = d.tab.split(":"); content.state.tabs[scope] = tab;
      $(`#tb-${scope}`).innerHTML = tableBlockHTML(findSec(report, scope));
    }
    if (d.tr) {
      content.state.transposed[d.tr] = !content.state.transposed[d.tr];
      $(`#tb-${d.tr}`).innerHTML = tableBlockHTML(findSec(report, d.tr));
    }
    if (d.fs) toggleFullscreen(d.fs, button);
    if ("closeFullscreen" in d) closeFullscreen();
    if ("removeQuote" in d) { session().quote = ""; save(); renderAgent(); }
    if ("removeFocus" in d) { session().focusScope = ""; save(); renderAgent(); }
    if ("historyToggle" in d) {
      session().historyExpanded = !session().historyExpanded;
      save(); renderAgent({ focusHistory: true });
    }
    if (button.id === "aiNew" && !tasks.has(taskKey("chat"))) {
      const s = session();
      if (s.topicStart === s.messages.length) {
        showToast("当前已经是新话题");
      } else {
        Object.assign(s, { topicStart: s.messages.length, historyExpanded: false, focusScope: "", scope: "all", quote: "", draft: "" });
        $("#aiText").value = ""; autoGrow(); save(); renderAgent({ focusHistory: true });
        showToast("已开启新话题，之前的对话可向上查看");
      }
      $("#aiText").focus({ preventScroll: true });
    }
    if (button.id === "aiWide") {
      const wide = root.classList.toggle("wide");
      button.innerHTML = ic(wide ? "shrink" : "expand"); button.setAttribute("aria-pressed", String(wide));
      button.setAttribute("aria-label", wide ? "恢复对话框宽度" : "加宽对话框");
    }
    if (button.id === "aiFold") setExpanded(!root.classList.contains("expanded"));
    if ("copy" in d) {
      const text = button.closest(".answer-body")?.querySelector(".md")?.innerText || "";
      const copying = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
      copying.then(() => showToast("已复制回答"), () => showToast("复制失败，请手动选择文本"));
    }
    if ("regen" in d && !tasks.has(taskKey("chat"))) {
      const turn = session().messages[Number(d.regen)];
      Object.assign(turn, { model: session().model, reasoning: session().reasoning, md: "", done: false, stopped: false });
      generate(turn, "chat", report.id);
    }
  });
  document.addEventListener("mousedown", e => {
    if (!report) return;
    if (popup && !e.target.closest("#report-history .pop, #report-history .ask-btn")) closePopup();
    if (modelMenuOpen && !e.target.closest("#aiConfig")) {
      modelMenuOpen = false;
      reasoningMenuOpen = false;
      renderModelControls();
    }
  });
  document.addEventListener("keydown", e => {
    if (!report) return;
    if (e.key === "Escape") {
      if (modelMenuOpen) {
        modelMenuOpen = false;
        reasoningMenuOpen = false;
        renderModelControls();
      } else if ($(".tblock.fs")) closeFullscreen();
      else if (popup) closePopup(true);
      else setExpanded(false);
      $("#selAsk").hidden = true;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); if (narrow()) setExpanded(true); $("#aiText").focus({ preventScroll: true });
    }
    if (e.target.id === "aiText" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault(); send(e.target.value);
    }
  });
  function positionSelection() {
    if (!report) return;
    const selection = window.getSelection(), text = selection?.toString().trim();
    const start = selection?.anchorNode?.parentElement?.closest("[data-sec]");
    const end = selection?.focusNode?.parentElement?.closest("[data-sec]");
    const button = $("#selAsk");
    if (!text || text.length < 4 || !start || start !== end || !$("#report").contains(start)) { button.hidden = true; return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const view = $("#view").getBoundingClientRect();
    if (rect.bottom < view.top || rect.top > view.bottom) { button.hidden = true; return; }
    button.dataset.quote = text.slice(0, 400); button.dataset.quoteScope = start.dataset.sec; button.hidden = false;
    button.style.top = Math.max(view.top + 4, rect.top - 40) + "px";
    button.style.left = Math.max(8, Math.min(window.innerWidth - 120, rect.left)) + "px";
  }
  root.addEventListener("mouseup", e => {
    if (e.target.closest("#report")) positionSelection();
  });
  root.addEventListener("keyup", e => { if (e.shiftKey) positionSelection(); });
  root.addEventListener("mousedown", e => { if (e.target.closest("#selAsk")) e.preventDefault(); });
  root.addEventListener("click", e => {
    const button = e.target.closest("#selAsk");
    if (!button) return;
    session().quote = button.dataset.quote;
    session().focusScope = button.dataset.quoteScope;
    button.hidden = true;
    window.getSelection()?.removeAllRanges(); save(); renderAgent();
    if (narrow()) setExpanded(true);
    $("#aiText").focus({ preventScroll: true });
  });
  window.addEventListener("resize", () => {
    closePopup();
    if ($("#selAsk")) $("#selAsk").hidden = true;
  });
  return { render };
}
