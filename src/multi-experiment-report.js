import { analysisTypes } from "./multi-experiment-data.js";
import { buildReportModules, moduleView, moduleScope, singleScope, datasetScope } from "./multi-report-content.js";
import { normalizeReportStatus } from "./report-filters.js";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = name => ({ chart: '<path d="M3 3v16h18M7 13l4-5 4 2 5-7"/>', data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  info: '<path d="M8 6h12M8 12h12M8 18h12m-16-6 1 1 2-3m-3 8 1 1 2-3"/>' }[name] || "");
const svg = name => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${icon(name)}</svg>`;
const ai = scope => `<button type="button" class="ask-btn mm-ai" data-ask="${scope}">${svg("chart")} AI</button>`;
const singleExperimentModule = (report, module) => report.snapshot.analysisType === "multi" && module.analysisType === "single";
function moduleNavigation(report, module) {
  const root = { id: module.id, no: "", title: module.title,
    short: module.analysisType === "multi" ? "多实验分析结论" : "单实验分析结论" };
  if (singleExperimentModule(report, module)) return [root, ...module.experiments.flatMap((experiment, index) => [
    { id: singleScope(module.index, experiment.id), no: `${module.index + 1}.${index + 1}`,
      title: `${module.title} · ${experiment.name} · ${experiment.id}`, short: `${experiment.name} · ${experiment.id}` },
    ...experiment.datasets.map((dataset, datasetIndex) => ({
      id: datasetScope(module.index, datasetIndex, experiment.id), no: "", title: dataset.title, short: dataset.title, hiddenToc: true
    }))
  ])];
  return [root,
    ...Array.from({ length: module.datasetCount }, (_, datasetIndex) => ({
      id: datasetScope(module.index, datasetIndex), no: `${module.index + 1}.${datasetIndex + 1}`,
      title: module.experiments.find(experiment => experiment.datasets[datasetIndex])?.datasets[datasetIndex].title || "数据集",
      short: module.experiments.find(experiment => experiment.datasets[datasetIndex])?.datasets[datasetIndex].title || "数据集"
    })),
    ...module.experiments.map(experiment => ({ id: singleScope(module.index, experiment.id), no: "", hiddenToc: true,
      title: `${module.title} · ${experiment.name} · ${experiment.id}`, short: experiment.id }))
  ];
}
export function reportDescriptor(saved) {
  const modules = buildReportModules(saved), success = saved.results.filter(result => result.status === "success").length;
  return { ...saved, custom: true, moduleReport: true, presentation: "modules", moduleContent: modules,
    kind: saved.private ? "模块试跑" : saved.snapshot.analysisType === "multi" ? "多实验报告" : "实验报告",
    title: saved.snapshot.template.name,
    meta: [["业务目标", saved.snapshot.goal], ["分析类型", analysisTypes[saved.snapshot.analysisType]],
      ["实验范围", `${success}/${saved.results.length} 个实验成功`],
      [saved.snapshot.origin === "modules" ? "模块版本" : "模板版本", saved.private ? "模块草稿快照"
        : saved.snapshot.origin === "modules" ? saved.snapshot.modules.map(module => `${module.configuration.name} · v${module.version}`).join("、")
        : `v${saved.snapshot.templateVersion}`]],
    sections: modules.map(module => ({ group: true, no: String(module.index + 1).padStart(2, "0"), title: module.title,
      children: moduleNavigation(saved, module) })) };
}
export function reportListRow(report) {
  const createdAt = report.createdAt || report.startedAt;
  return { rid: report.id, title: report.snapshot.template.name,
    type: report.snapshot.analysisType === "multi" ? "多实验报告" : "实验报告",
    exp: `${report.results.length} 个独立实验 · ${report.snapshot.experiments.map(entry => entry.definition.name).join("、")}`,
    libra: report.snapshot.experiments.map(entry => entry.input.id).join(" / "), qx: "本地模拟", status: normalizeReportStatus(report),
    owner: "秦娇芸", createdAt, created: new Date(createdAt).toLocaleString("sv-SE").slice(0, 16),
    generated: report.createdAt ? new Date(report.createdAt).toLocaleString("sv-SE").slice(0, 16) : "", multi: true };
}
function conclusionHTML(title, messages, scope) {
  return `<div class="ccard mm-conclusion" data-card="${scope}"><div class="ccard-h"><span class="t">${svg("chart")}${title}</span><span class="grow"></span>${ai(scope)}</div>
    ${messages.length ? `<ul>${messages.map(message => `<li>${esc(message.text)}</li>`).join("")}</ul>` : '<p class="mm-muted">当前没有可用分析结论。</p>'}</div>`;
}
function cellHTML(cell) {
  const title = cell.reason || (cell.raw != null ? `原值：${cell.raw}${cell.control != null ? `；自身对照组：${cell.control}` : ""}` : cell.text);
  return `<div class="mm-cell" title="${esc(title)}"><span>${esc(cell.text)}</span>${cell.uplift !== undefined ? `<small>增幅 ${cell.uplift == null ? "—" : `${cell.uplift > 0 ? "+" : ""}${cell.uplift.toFixed(2)}%`}</small>` : ""}
    ${cell.sig ? `<small class="mm-sig ${cell.sig === "正向显著" ? "positive" : cell.sig === "负向显著" ? "negative" : ""}">${esc(cell.sig)}</small>` : ""}${cell.missing && cell.reason ? `<small class="mm-missing">${esc(cell.reason)}</small>` : ""}</div>`;
}
function datasetHTML(module, experiment, dataset, datasetIndex, view, scopedToExperiment = false) {
  const id = datasetScope(module.index, datasetIndex, scopedToExperiment ? experiment.id : ""), key = `${experiment.id}:${datasetIndex}`;
  const state = view.tables[key] ||= { group: "all", transposed: false };
  const groups = [...new Map(dataset.records.map(record => [record.groupId, record.groupName])).entries()];
  const rows = dataset.records.filter(record => state.group === "all" || record.groupId === state.group);
  const table = state.transposed
    ? `<table class="mm-table"><thead><tr><th class="mm-fixed">字段 / 数据</th>${rows.map(row => `<th>${esc(row.label)}${dataset.mode === "demo-spend" ? `<small>${esc(row.groupName)}</small>` : ""}</th>`).join("")}</tr></thead><tbody>${dataset.fields.map((field, index) =>
      `<tr data-bid="${field.key}"><th class="mm-fixed" scope="row" title="${esc(field.formulaText || field.description || "")}">${esc(field.name)}${field.unit ? `<small>${field.unit}</small>` : ""}</th>${rows.map(row => `<td>${cellHTML(row.cells[index])}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : `<table class="mm-table"><thead><tr><th class="mm-fixed">${dataset.firstColumn}</th>${dataset.fields.map(field => `<th title="${esc(field.formulaText || field.description || "")}">${esc(field.name)}${field.unit ? `<small>${field.unit}</small>` : ""}</th>`).join("")}</tr></thead><tbody>${rows.map(row =>
      `<tr data-bid="${row.id}"><th class="mm-fixed" scope="row">${esc(row.label)}${dataset.dimensioned || dataset.mode === "demo-spend" ? `<small>${esc(row.groupName)}</small>` : row.control ? '<small class="mm-control">对照组</small>' : ""}</th>${row.cells.map(cell => `<td>${cellHTML(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return `<section class="sec mm-dataset tblock" id="sec-${id}" data-sec="${id}" aria-label="${esc(dataset.title)}" data-dataset-index="${datasetIndex}">
    <div class="tblock" id="tb-${id}"><h3 class="mm-dataset-title">${esc(dataset.title)}</h3>
      <div class="mm-table-toolbar"><div class="mm-group-tabs" role="tablist" aria-label="${esc(dataset.title)}实验组">
        ${[["all", "全部"], ...groups].map(([groupId, name]) => `<button type="button" role="tab" aria-selected="${state.group === groupId}" class="${state.group === groupId ? "on" : ""}" data-mm-group="${esc(groupId)}" data-mm-module="${module.id}" data-mm-experiment="${experiment.id}" data-mm-table="${datasetIndex}">${esc(name)}</button>`).join("")}
      </div><div class="mm-table-tools"><small>${rows.length} 条数据</small><button class="btn-o sm" type="button" data-mm-transpose data-mm-module="${module.id}" data-mm-experiment="${experiment.id}" data-mm-table="${datasetIndex}" aria-pressed="${state.transposed}">⇄ 转置</button><button class="btn-o sm" type="button" data-fs="${id}">⛶ 全屏</button></div></div>
      <div class="tbl-wrap mm-table-scroll" tabindex="0" aria-label="${esc(dataset.title)}，可横向滚动">${table}</div>
      ${dataset.calculated ? `<details class="mm-notes"><summary>计算公式与输入来源</summary><ul>${dataset.fields.map(field =>
        `<li>${esc(field.name)}：${esc(field.formulaText)}；${field.sources.map(source => `${esc(source.sourceName)} v${source.ref.version}`).join("、")}</li>`).join("")}</ul></details>` : ""}
      <p class="mm-source">${esc(dataset.sourceName)} · ${dataset.calculated && !dataset.sourceVersion ? "模块草稿快照" : `v${dataset.sourceVersion || 1}`} · ${experiment.id}${dataset.evidencePeriod ? ` · 实验前 ${dataset.evidencePeriod.join(" 至 ")}` : ""}</p></div></section>`;
}
function experimentHTML(report, module, experiment, state, scopedToExperiment = false) {
  const singleId = singleScope(module.index, experiment.id);
  return `<div class="mm-experiment-content" id="sec-${singleId}" data-sec="${singleId}" data-selected-experiment="${experiment.id}">
    <div class="mm-experiment-meta"><span>${experiment.id}</span><span>观察窗口 ${experiment.input.start} 至 ${experiment.input.end}</span><span>对照组：${esc(experiment.definition.control.name)}</span></div>
    ${experiment.status === "success" ? `${conclusionHTML("单实验分析结论", experiment.conclusions, singleId)}
      <div class="mm-data-heading">${svg("data")}<strong>数据明细</strong><span>${experiment.datasets.length} 个数据集</span></div>
      ${experiment.datasets.map((dataset, datasetIndex) => datasetHTML(module, experiment, dataset, datasetIndex, state, scopedToExperiment)).join("")}`
      : `<div class="mm-unavailable" role="status"><strong>该实验暂不可查看</strong><p>${esc(experiment.error || "分析尚未完成")}</p>${experiment.gaps.map(gap => `<p>${esc(gap)}</p>`).join("")}<p>可切换查看其他实验的数据与结论。</p>${report.taskId ? `<a href="#/experiments/task/${report.taskId}">返回任务处理</a>` : ""}</div>`}
    </div>`;
}
function experimentSelectorHTML(module, experiment) {
  return `<div class="mm-experiment-bar"><div><strong>查看单个实验</strong><span>${module.experiments.length} 个实验</span></div>
    <label><span class="mm-sr-only">${esc(module.title)}：选择实验</span><select data-mm-select="${module.id}"
      aria-label="${esc(module.title)}：选择实验" title="${esc(experiment.name)} · ${experiment.id}">${module.experiments.map(item =>
      `<option value="${item.id}" ${item.id === experiment.id ? "selected" : ""}>${esc(item.name)} · ${item.id}${item.status === "success" ? "" : " · 数据不可用"}</option>`).join("")}</select></label></div>`;
}
function reportExperimentHeader(report) {
  const range = (start, end) => start && end ? `${start} 至 ${end}` : "未提供";
  return `<div class="mm-report-experiments" aria-label="报告实验信息">${report.snapshot.experiments.map(({ input, definition }) =>
    `<dl class="meta mm-report-experiment" data-header-experiment="${esc(input.id)}">
      <div><dt>实验名称</dt><dd title="${esc(definition.name)}">${esc(definition.name)}</dd></div>
      <div><dt>Libra ID</dt><dd>${esc(input.id)}</dd></div>
      <div><dt>实验周期</dt><dd>${esc(range(definition.period?.[0], definition.period?.[1]))}</dd></div>
      <div><dt>观察窗口</dt><dd>${esc(range(input.start, input.end))}</dd></div>
    </dl>`).join("")}</div>`;
}
export function renderMultiReport(report, view) {
  const modules = report.moduleContent || buildReportModules(report), failed = report.results.filter(result => result.status !== "success");
  const multi = report.snapshot.analysisType === "multi";
  return `<header class="rhead mm-report-header"><p class="eyebrow">实验分析报告 <span class="ma-demo-tag">分析类型：${esc(analysisTypes[report.snapshot.analysisType])}</span></p><h1>${esc(report.title)}</h1>
    ${multi ? `<div class="mm-report-context">${report.meta.filter(([label]) => label !== "分析类型").map(([label, value]) => `<span>${esc(label)}：${esc(value)}</span>`).join("")}</div>`
      : `<dl class="meta">${report.meta.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`}
    <p class="mm-report-sub">生成时间：${new Date(report.createdAt).toLocaleString("zh-CN", { hour12: false })} · ${modules.length} 个分析模块${report.private ? " · 模块私有试跑" : ""}</p>
    ${multi ? reportExperimentHeader(report) : ""}
    ${failed.length ? `<div class="ma-warning">部分完成：${failed.map(result => esc(`${result.id} ${result.error || "数据未完成"}`)).join("；")}${report.taskId ? ` <a href="#/experiments/task/${report.taskId}">返回任务</a>` : ""}</div>` : ""}
    ${report.snapshot.supplement ? `<details class="mm-supplement"><summary>用户补充信息</summary><p>${esc(report.snapshot.supplement)}</p></details>` : ""}</header>
    ${modules.map(module => {
      const state = moduleView(view, module), experiment = module.experiments.find(experiment => experiment.id === state.experimentId) || module.experiments[0];
      const cross = report.snapshot.analysisType === "multi" && module.analysisType === "multi";
      return `<section class="sec mm-module" id="sec-${module.id}" data-sec="${module.id}" data-mm-section="${module.id}" data-module-analysis-type="${module.analysisType}">
        <header class="mm-module-heading"><h2>${esc(module.title)}</h2><p>${esc(module.description)}</p></header>
        ${cross ? conclusionHTML("多实验分析结论", module.conclusions, module.id) : ""}
        ${experimentSelectorHTML(module, experiment)}
        ${experimentHTML(report, module, experiment, state, singleExperimentModule(report, module))}</section>`;
    }).join("")}`;
}
function scopeContext(report, scope, view) {
  const modules = report.moduleContent || buildReportModules(report);
  const module = modules.find(module => scope === module.id || scope?.startsWith(`${module.id}-`));
  if (!module) return { modules };
  const exact = module.experiments.find(experiment => scope === singleScope(module.index, experiment.id)
    || scope?.startsWith(`${singleScope(module.index, experiment.id)}-data-`));
  const selected = scope?.includes("-data-") ? module.experiments.find(experiment => experiment.id === moduleView(view || {}, module).experimentId) : null;
  return { modules: [module], module, experiment: exact || selected };
}
export function multiSuggestions(report, scope) {
  if (scope?.includes("-exp-") || scope?.includes("-data-")) return ["总结这个实验在本模块的表现", "这些指标如何计算，缺失值是什么原因？"];
  if (report.moduleContent?.find(module => module.id === scope)?.analysisType === "single")
    return ["逐个总结本模块各实验的结论", "核对各实验的数据来源与缺失项"];
  return ["总结本模块各实验的表现差异", "哪些差异需要结合观察期和人群解释？", "切换实验后应重点核对哪些数据？"];
}
export function multiAnswer(report, question, scope = "all", view = {}) {
  const context = scopeContext(report, scope, view), lines = [];
  for (const module of context.modules) {
    const experiments = context.experiment ? [context.experiment] : module.analysisType === "single"
      ? module.experiments : module.experiments.filter(experiment => experiment.status === "success");
    lines.push(`**${module.title}**`);
    if (!context.experiment && module.analysisType === "multi")
      lines.push(...module.conclusions.map(conclusion => conclusion.text), `[[cite:${module.id}::查看多实验分析结论]]`);
    for (const experiment of experiments) {
      if (context.experiment || module.analysisType === "single" || /核对|计算|缺失/.test(question)) {
        lines.push(`${experiment.name}（${experiment.id}）：`, ...(experiment.conclusions.length ? experiment.conclusions.map(conclusion => conclusion.text) : [experiment.error || "未提供分析结论"]),
          `[[cite:${singleScope(module.index, experiment.id)}::查看该实验结论与数据]]`);
      }
    }
    if (/计算|缺失/.test(question)) {
      if (module.configuration.statisticsNotes) lines.push(
        "领券核销间隔 = 核销时间 − 领券时间，单位为小时；均值与各分位数在对应实验、策略组的已核销样本中分别统计。未提供值保留缺失原因。",
        ...module.configuration.statisticsNotes);
      else lines.push(module.configuration.sources.some(source => source.capabilityId === "pre-aa")
        ? "PreAA 使用各实验启动前保存的数据；未保存的数据不会用实验后指标补算，也未提供 AA 显著性检验。"
        : "计算使用各实验自己的对照组与本次观察窗口；未提供值保留缺失原因。显著性为模拟字段，不通过跨实验排序重新推断。");
    }
  }
  const evidence = context.experiment ? `${context.module.title} / ${context.experiment.id}` : context.module ? `${context.module.title} / 全部成功实验` : "本报告各模块的成功实验";
  return { steps: ["读取固定模块快照", "核对当前实验与数据来源"], md: `本地模拟回答 · 证据范围：${evidence}。\n\n${lines.join("\n\n")}`, follow: multiSuggestions(report, scope) };
}
export function applyModuleReportEvent(event, report, view) {
  const target = event.target.closest("[data-mm-select],[data-mm-group],[data-mm-transpose]");
  if (!target) return false;
  if (target.dataset.mmSelect) {
    if (event.type !== "change") return false;
    const module = report.moduleContent.find(module => module.id === target.dataset.mmSelect);
    if (!module?.experiments.some(experiment => experiment.id === target.value)) return false;
    moduleView(view, module).experimentId = target.value;
    return { moduleId: module.id, focus: `[data-mm-select="${module.id}"]` };
  }
  if (event.type !== "click") return false;
  const module = report.moduleContent.find(module => module.id === target.dataset.mmModule), state = module && moduleView(view, module);
  if (!state) return false;
  const experimentId = target.dataset.mmExperiment || state.experimentId;
  const experiment = module.experiments.find(experiment => experiment.id === experimentId);
  if (!experiment?.datasets[Number(target.dataset.mmTable)]) return false;
  const key = `${experimentId}:${target.dataset.mmTable}`, table = state.tables[key] ||= { group: "all", transposed: false };
  if (target.dataset.mmGroup) table.group = target.dataset.mmGroup;
  else table.transposed = !table.transposed;
  const control = target.dataset.mmGroup ? `[data-mm-group="${target.dataset.mmGroup}"]` : "[data-mm-transpose]";
  return { moduleId: module.id, focus: `${control}[data-mm-module="${module.id}"][data-mm-table="${target.dataset.mmTable}"]${target.dataset.mmExperiment ? `[data-mm-experiment="${experimentId}"]` : ""}` };
}
export function prepareModuleCitation(report, scope, view) {
  const modules = report.moduleContent;
  if (!modules) return false;
  // Keep legacy follow-up references useful without changing old messages.
  const legacy = { "ma-overall": modules[0]?.id, "ma-strategy": modules.find(module => module.experiments.some(experiment => experiment.datasets.some(dataset => dataset.mode === "strategy")))?.id,
    "ma-detail": modules[0]?.id, "ma-boundary": modules[0]?.id };
  const resolved = legacy[scope] || scope;
  const module = modules.find(module => resolved === module.id || resolved?.startsWith(`${module.id}-`));
  if (!module) return false;
  const experiment = module.experiments.find(experiment => resolved === singleScope(module.index, experiment.id)
    || resolved?.startsWith(`${singleScope(module.index, experiment.id)}-data-`));
  if (experiment) moduleView(view, module).experimentId = experiment.id;
  return { scope: resolved, moduleId: module.id };
}
