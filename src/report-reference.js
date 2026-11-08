import source from "./report-reference-data.json";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const cleanConclusion = text => text.replace(/^(?:实验核心结论|分析结论)\nAI\n\n/, "");
const scope = module => `ref-${module.id}`;
const shortName = module => module.title.replace(/^核心指标表现-|^领券核销情况-/, "").replace("电商人群八分层", "电商人群八分层");
function prose(text) {
  return cleanConclusion(text).split("\n\n").map(part => {
    const lines = part.split("\n");
    if (lines.length > 1) return `<ul>${lines.map(line => `<li>${esc(line)}</li>`).join("")}</ul>`;
    if (["分维度增量来源", "领券核销", "preAA 验证通过"].includes(part)) return `<h4>${esc(part)}</h4>`;
    return `<p>${esc(part)}</p>`;
  }).join("");
}
const ask = id => `<button type="button" class="ask-btn mm-ai" data-ask="${id}" aria-label="向 AI 提问：${esc(id === "ref-summary" ? "实验核心结论" : "分析结论")}">AI</button>`;
export function referenceDescriptor() {
  const children = (start, end, number) => source.modules.slice(start, end).map((module, i) => ({
    id: scope(module), title: module.title, short: shortName(module), no: `${number}.${i + 1}` }));
  return { id: "r-single-reference", custom: true, moduleReport: true, referenceReport: true,
    kind: "实验报告", title: source.title, createdAt: source.capturedAt,
    meta: [["实验", "品类增长-应季趋势类目券包-基线策略"], ["Libra ID", "5640220"],
      ["实验周期", "2026-08-28 至 2026-09-03"], ["观察窗口", "2026-08-28 至 2026-09-17"]],
    summary: { id: "ref-summary", title: "实验核心结论" },
    sections: [{ id: scope(source.modules[0]), title: "实验背景和配置", no: "01" },
      { id: scope(source.modules[1]), title: "preAA", no: "02" },
      { title: "核心指标表现", no: "03", group: true, children: children(2, 7, 3) },
      { title: "领券核销情况", no: "04", group: true, children: children(7, 12, 4) }] };
}
export function referenceListRow() {
  return { rid: "r-single-reference", title: "老客复购实验分析 · 完整复刻样例", exp: "品类增长-应季趋势类目券包-基线策略",
    type: "实验报告", status: "completed", libra: "5640220", qx: "27730", owner: "秦娇芸",
    created: "2026-11-08 09:00", generated: "2026-11-08 09:00", createdAt: "2026-11-08T09:00:00+08:00" };
}
function cell(text) {
  const lines = text.split("\n");
  return `<div class="reference-cell">${lines.map((line, index) => {
    const sig = /^(正向显著|负向显著|不显著|显著)$/.test(line);
    if (!index) return `<span${sig ? ` class="reference-sig ${line === "正向显著" ? "positive" : line === "负向显著" ? "negative" : line === "显著" ? "significant" : ""}"` : ""}>${esc(line)}</span>`;
    return `<small${sig ? ` class="reference-sig ${line === "正向显著" ? "positive" : line === "负向显著" ? "negative" : line === "显著" ? "significant" : ""}"` : ""}>${esc(line)}</small>`;
  }).join("")}</div>`;
}
function table(module, state) {
  const isGroup = module.headers[0] === "实验分组";
  const rows = isGroup && state.group !== "全部" ? module.rows.filter(row => row[0].split("\n")[0] === state.group) : module.rows;
  const body = state.transposed
    ? `<table class="dt reference-table"><thead><tr><th class="lead">字段 / 数据</th>${rows.map(row => `<th>${esc(row[0].split("\n")[0])}</th>`).join("")}</tr></thead><tbody>${module.headers.map((header, index) => `<tr><th class="lead">${esc(header)}</th>${rows.map(row => `<td>${cell(row[index])}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : `<table class="dt reference-table"><thead><tr>${module.headers.map((header, index) => `<th class="${index ? "" : "lead"}">${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr data-bid="row-${rowIndex}">${row.map((value, index) => `<td class="${index ? "" : "lead"}${module.id === "report-module-2" ? " reference-config-cell" : ""}">${cell(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const id = scope(module);
  return `<div class="data tblock" id="tb-${id}">
    <div class="data-h"><strong>数据明细</strong><span class="pill">1 个数据集</span></div><h3 class="tbl-title">${esc(module.tableTitle)}</h3>
    <div class="tabs-row"><div class="tabs" role="tablist" aria-label="${esc(module.tableTitle)}实验组">${["全部", ...(isGroup ? ["对照组", "实验组1"] : ["实验组1"])].map(group => `<button type="button" class="tab ${state.group === group ? "on" : ""}" role="tab" aria-selected="${state.group === group}" data-ref-module="${module.id}" data-ref-group="${group}">${group}</button>`).join("")}</div>
      <div class="tbl-tools"><small>${rows.length} 条数据</small><button class="btn-o sm" type="button" data-ref-module="${module.id}" data-ref-transpose aria-pressed="${state.transposed}">⇄ 转置</button><button class="btn-o sm" type="button" data-fs="${id}">⛶ 全屏</button></div></div>
    <div class="tbl-wrap" tabindex="0" aria-label="${esc(module.tableTitle)}，可横向滚动">${body}</div></div>`;
}
export function renderReferenceReport(report, view) {
  view.referenceTables ||= {};
  return `<header class="rhead mm-report-header"><p class="eyebrow">实验分析报告</p><h1>${esc(report.title)}</h1>
    <dl class="meta">${report.meta.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
    <p class="mm-report-sub">线上报告复刻样例 · <a href="${source.source}" target="_blank" rel="noreferrer">查看来源</a> · 采集于 2026-11-08</p></header>
    <section class="sec reference-summary" id="sec-ref-summary" data-sec="ref-summary"><div class="ccard"><div class="ccard-h"><span class="t">实验核心结论</span><span class="grow"></span>${ask("ref-summary")}</div>${prose(source.summary)}</div></section>
    ${source.modules.map(module => {
      const state = view.referenceTables[module.id] ||= { group: "全部", transposed: false }, id = scope(module);
      return `<section class="sec reference-module" id="sec-${id}" data-sec="${id}" data-mm-section="${id}">
        <h2 class="sec-h2">${esc(module.title)}</h2>${module.description ? `<p class="sec-sub">${esc(module.description)}</p>` : ""}
        ${module.conclusion ? `<div class="ccard"><div class="ccard-h"><span class="t">分析结论</span><span class="grow"></span>${ask(id)}</div>${prose(module.conclusion)}</div>` : ""}
        ${table(module, state)}</section>`;
    }).join("")}`;
}
export function referenceEvent(event, view) {
  const target = event.target.closest("[data-ref-group],[data-ref-transpose]");
  if (event.type !== "click" || !target) return false;
  view.referenceTables ||= {};
  const state = view.referenceTables[target.dataset.refModule] ||= { group: "全部", transposed: false };
  if (target.dataset.refGroup) state.group = target.dataset.refGroup; else state.transposed = !state.transposed;
  return { moduleId: `ref-${target.dataset.refModule}`, focus: `[data-ref-module="${target.dataset.refModule}"]${target.dataset.refGroup ? `[data-ref-group="${target.dataset.refGroup}"]` : "[data-ref-transpose]"}` };
}
export function referenceAnswer(question, requestedScope) {
  const module = source.modules.find(module => scope(module) === requestedScope);
  const body = module ? cleanConclusion(module.conclusion) || "该模块保存实验配置，请查看下方数据表。"
    : cleanConclusion(source.summary);
  return { steps: ["读取复刻报告的固定内容"], md: `本地模拟解读 · 仅引用该报告已保存内容。\n\n${body}\n\n[[cite:${module ? scope(module) : "ref-summary"}::查看报告证据]]`,
    follow: ["这段结论使用了哪些数据？", "PreAA 的显著性标准有什么区别？"] };
}
