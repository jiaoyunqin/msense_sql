import { directoryHeading } from "./report-directory-data.js";
import { renderReportSummary } from "./report-summary.js";
import { conclusionAnnotations, renderConclusionText } from "./report-conclusion-emphasis.js";
import {
  completeSource as source, moduleScope, summaryScope, rowGroup, columnGroups,
  readingState, saveReading, moduleRows, moduleColumns, columnBarDomains, cellBarGeometry,
  moduleMetrics, sortableColumn, moveMetric
} from "./report-complete-data.js";
import "./report-complete.css";
import { comparisonDirection, formatColors, dataBarAppearance, dataBarColumn, compactTableLabel, significanceLabel, significantResult } from "./report-table-formatting.js";
import { tableFormat, formatMetrics, formatButton, formatPanel, tableFormatEvent } from "./report-table-format-ui.js";
import "./report-table-formatting.css";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const findModule = id => source.modules.find(module => module.id === id || moduleScope(module) === id);
const ask = scope => `<button type="button" class="ask-btn mm-ai" data-ask="${scope}" aria-label="向 AI 提问：分析结论">AI</button>`;
const conclusionIcon = `<svg class="ic cf-conclusion-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V14M9 19V10M14 19V13M19 19V5M3 10l6-5 5 3 6-6"/></svg>`;
const textBlocks = blocks => blocks.flatMap(block => block.kind === "list" ? block.items.map(item => item.text) : [block.text]).filter(Boolean);

export function completeDescriptor() {
  return {
    id: source.id, title: source.title, kind: "单实验报告", custom: true, moduleReport: true,
    completeReport: true, presentationVersion: 2, createdBy: "sheriqin.01",
    meta: source.meta,
    summary: { id: summaryScope, title: "实验核心结论", blocks: textBlocks(source.summary).map(text => ({ text })) },
    sections: [{ id: summaryScope, title: "实验核心结论", no: "01" },
      ...source.modules.map((module, index) => ({
        id: moduleScope(module), sourceModuleId: module.id, title: module.title, no: String(index + 2).padStart(2, "0")
      }))]
  };
}

export function completeListRow() {
  return { rid: source.id, title: source.title, type: "单实验报告", status: "completed",
    exp: source.meta.find(([label]) => label === "实验")?.[1], owner: "秦娇芸", qx: "—",
    libra: source.meta.find(([label]) => label === "实验ID")?.[1],
    created: "2026-11-23 15:00", generated: "2026-11-23 15:00", createdAt: "2026-11-23T15:00:00+08:00", href: `#/report/${source.id}` };
}

const numberText = text => text.split(/([+\-−]?\d+(?:,\d{3})*(?:\.\d+)?(?:%|％|万|亿)?(?:[–—~～][+\-−]?\d+(?:,\d{3})*(?:\.\d+)?(?:%|％|万|亿)?)?)/g)
  .filter(Boolean).map(part => /^[+\-−]?\d/.test(part) ? `<span class="cf-number">${esc(part)}</span>` : esc(part)).join("");

function typography(text) {
  // Format complete parentheses before emphasis, so highlighted numbers retain
  // their note styling. Half-open price intervals such as (5,10] are not notes.
  return text.split(/(（[^（）()[\]［］\n]*）|\([^（）()[\]［］\n]*\))/g).filter(Boolean).map(part => {
    const html = numberText(part);
    return /^[（(]/.test(part) && /[）)]$/.test(part) && !/^[（(][A-Za-z][\w\s/+.-]*[）)]$/.test(part)
      ? `<em class="cf-parenthetical">${html}</em>` : html;
  }).join("");
}

const runsHTML = (item, scope) => renderConclusionText(item, conclusionAnnotations[scope]);

function blocksHTML(blocks, scope) {
  return blocks.map(block => block.kind === "heading" ? `<h4>${runsHTML(block, scope)}</h4>`
    : block.kind === "list" ? `<${block.ordered ? "ol" : "ul"}>${block.items.map(item => `<li>${runsHTML(item, scope)}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`
      : `<p>${runsHTML(block, scope)}</p>`).join("");
}

function summaryHTML(report) {
  return renderReportSummary({ ...report.summary, blocks: [] }).replace(
    '<div class="report-summary-body" data-summary-body></div>',
    `<div class="report-summary-body" data-summary-body>${blocksHTML(source.summary, summaryScope)}</div>`
  );
}

function cellHTML(cell, domain, format, metricIndex, separateSignificance = false) {
  const bar = cell.unit === "text" ? null : cellBarGeometry(cell.value, domain);
  const appearance = bar ? dataBarAppearance(format, metricIndex, cell.value, domain) : null;
  const numeric = cell.unit !== "text" && typeof cell.value === "number" && Number.isFinite(cell.value);
  return `<div class="reference-cell${numeric ? " cf-numeric-cell" : ""}">${cell.text.split("\n").map((line, index) => {
    // Only decorate an explicit saved comparison. Never infer it from the raw
    // value, a percentage unit, or a significance label.
    const comparison = index > 0 && /^增幅\s/.test(line);
    const direction = comparison ? comparisonDirection(cell.lift) : null;
    const emphasized = format.trends && significantResult(cell) && direction && direction !== "flat";
    if (comparison) {
      const arrow = direction === "up" ? "M6 11V1m-4 4 4-4 4 4" : direction === "down" ? "M6 1v10m-4-4 4 4 4-4" : "M1 6h10";
      const visible = line.replace(/^增幅\s+/, "").replace(/^\d/, direction === "up" ? "+$&" : "$&");
      return `<small class="cf-change cf-change-${emphasized ? direction : "muted"}" title="${esc([line, cell.significance].filter(Boolean).join("；"))}">${emphasized ? `<svg width="11" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${arrow}"/></svg>` : ""}${typography(visible)}</small>`;
    }
    const sig = significanceLabel(line);
    if (sig && index > 0 && separateSignificance) return "";
    const cls = sig ? `reference-sig ${line === "正向显著" ? "positive" : line === "负向显著" ? "negative" : line === "显著" ? "significant" : ""}` : "";
    const tag = index ? "small" : "span";
    const levelStyle = appearance?.level ? `--cf-bar-fill:${appearance.level.fill}%;` : "";
    const barStyle = !index && bar ? ` class="cf-cell-value" style="--cf-bar-left:${bar.left}%;--cf-bar-width:${bar.width}%;--cf-bar-zero:${bar.zero}%;--cf-bar-rgb:${appearance.rgb};${levelStyle}"${bar.zero > 0 && bar.zero < 100 ? " data-cf-bar-axis" : ""}${appearance.level ? ` data-cf-bar-level="${appearance.level.id}" title="按绝对值分层：${appearance.level.label}（${appearance.level.threshold}）"` : ""}` : "";
    return `<${tag}${barStyle || (cls ? ` class="${cls}"` : "")}>${typography(line)}</${tag}>`;
  }).filter(Boolean).join("\n")}</div>`;
}

function separateSignificance(row, column, columns) {
  const cell = row.cells[column.index];
  if (!significanceLabel(cell?.significance)) return false;
  return columns.some(peer => peer.index !== column.index && peer.group === column.group
    && peer.metric.replace(/显著性(?:[（(][^）)]*[）)])?/, "").replace(/的$/, "") === column.metric
    && row.cells[peer.index]?.text.trim() === cell.significance);
}

const gripIcon = `<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">${[4, 8, 12].flatMap(y => [4, 8].map(x => `<circle cx="${x}" cy="${y}" r="1.2"/>`)).join("")}</svg>`;
const sortIcon = `<svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true"><path class="cf-sort-up" d="m7 2 4 5H3z"/><path class="cf-sort-down" d="m7 14 4-5H3z"/></svg>`;

function dragHandle(module, metric) {
  return metric ? `<button type="button" class="cf-metric-grip" draggable="true" data-cf-module="${module.id}" data-cf-drag="${metric.id}"
    aria-label="拖动调整指标顺序：${esc(metric.label)}" title="拖动调整指标顺序，也可聚焦后使用方向键">${gripIcon}</button>` : "";
}

function sortHeading(module, column, label, state) {
  const visibleLabel = compactTableLabel(module, label);
  if (!column || !sortableColumn(module, column.id)) return `<span class="cf-heading-label" title="${esc(label)}">${esc(visibleLabel)}</span>`;
  const active = state.sort?.column === column.id, direction = active ? state.sort.direction : "";
  const next = direction === "desc" ? "从低到高" : "从高到低";
  return `<button type="button" class="cf-sort-heading" data-cf-module="${module.id}" data-cf-sort="${column.id}"
    data-direction="${direction}" aria-label="${esc(column.label)}：${active ? `当前${direction === "desc" ? "从高到低" : "从低到高"}，` : ""}点击${next}排序" title="按${esc(column.label)}${next}排序"><span class="cf-heading-label">${esc(visibleLabel)}</span><span class="cf-sort-icon">${sortIcon}</span></button>`;
}

function sortAttribute(state, column) {
  return state.sort && column && state.sort.column === column.id ? ` aria-sort="${state.sort.direction === "desc" ? "descending" : "ascending"}"` : "";
}

function headersHTML(module, columns, state) {
  const selected = new Set(columns.map(column => column.index));
  const positions = new Map(columns.map((column, index) => [column.index, index]));
  const metrics = moduleMetrics(module);
  const occupied = module.headerRows.map(() => []);
  return module.headerRows.map((row, rowIndex) => {
    let index = 0;
    const headers = row.flatMap(header => {
      while (occupied[rowIndex][index]) index++;
      const start = index, end = start + header.colspan;
      for (let r = rowIndex; r < rowIndex + header.rowspan; r++)
        for (let c = start; c < end; c++) occupied[r][c] = true;
      index = end;
      const visible = Array.from({ length: header.colspan }, (_, i) => start + i).filter(i => selected.has(i));
      if (!visible.length) return [];
      const metric = rowIndex === 0 ? metrics.find(metric => metric.columns[0].index === start) : null;
      const column = header.colspan === 1 ? module.columns.find(column => column.index === start) : null;
      return [{ position: positions.get(visible[0]), html: `<th class="${start === 0 ? "lead" : header.colspan > 1 ? "grp" : column && sortableColumn(module, column.id) ? "cf-numeric-column" : ""}"
        colspan="${visible.length}" rowspan="${header.rowspan}"${sortAttribute(state, column)}${metric ? ` data-cf-metric="${metric.id}"` : ""}><div class="cf-heading">${dragHandle(module, metric)}${sortHeading(module, column, header.text, state)}</div></th>` }];
    });
    return `<tr>${headers.sort((a, b) => a.position - b.position).map(header => header.html).join("")}</tr>`;
  }).join("");
}

function tableHTML(module, state, view) {
  const id = moduleScope(module), rows = moduleRows(module, state), columns = moduleColumns(module, state);
  const domains = columnBarDomains(module), metrics = moduleMetrics(module);
  const format = tableFormat(view, module);
  // Use original metric identities, never the sorted/filtered screen position.
  const metricIndices = new Map(formatMetrics(module).flatMap((metric, index) =>
    metric.columns.map(column => [column.index, index])));
  const barColumns = new Set(metrics.filter(metric => format.metrics === null || format.metrics.includes(metric.id))
    .flatMap(metric => metric.columns.filter(column => dataBarColumn(module, column)).map(column => column.index)));
  const cell = (row, column) => cellHTML(row.cells[column.index],
    format.bars && barColumns.has(column.index) ? domains.get(column.index) : null, format, metricIndices.get(column.index) ?? 0,
    separateSignificance(row, column, columns));
  const customized = state.sort || state.metricOrder.some((metricId, index) => metricId !== metrics[index].id);
  const body = state.transposed
    ? `<table class="dt reference-table cf-transposed" data-cf-module="${module.id}"><thead><tr><th class="lead">字段 / 数据</th>${rows.map(row =>
      `<th id="cf-evidence-${row.id}" tabindex="-1">${esc(row.cells[0].text)}</th>`).join("")}</tr></thead><tbody>${columns.map(column => {
      const metric = metrics.find(metric => metric.columns.some(item => item.id === column.id));
      return `<tr${metric ? ` data-cf-metric="${metric.id}"` : ""}><th class="lead" scope="row"${sortAttribute(state, column)}><div class="cf-heading">${dragHandle(module, metric)}${sortHeading(module, column, column.label, state)}</div></th>${rows.map(row =>
        `<td class="${sortableColumn(module, column.id) ? "cf-numeric-column" : ""}" data-cf-source-row="${row.id}" data-cf-source-column="${column.index}">${cell(row, column)}</td>`).join("")}</tr>`;
    }).join("")}</tbody></table>`
    : `<table class="dt reference-table" data-cf-module="${module.id}"><thead>${headersHTML(module, columns, state)}</thead><tbody>${rows.map(row =>
      `<tr data-cf-source-row="${row.id}">${columns.map(column =>
        `<td class="${column.index ? sortableColumn(module, column.id) ? "cf-numeric-column" : "" : "lead"}${module.id === "report-module-2" ? " reference-config-cell" : ""}" data-cf-source-column="${column.index}"${column.index === 0 ? ` id="cf-evidence-${row.id}" tabindex="-1"` : ""}>${cell(row, column)}</td>`
      ).join("")}</tr>`).join("")}</tbody></table>`;
  return `<div class="data tblock" id="tb-${id}" data-cf-trend-palette="${format.trendPalette}" data-cf-bar-mode="${format.barMode}" style="--cf-bar-rgb:${formatColors[format.barColor].rgb}">
    <div class="data-h"><strong>数据明细</strong></div><h3 class="tbl-title">${esc(module.tableTitle)}</h3>
    <div class="tabs-row"><div class="tabs" role="tablist" aria-label="${esc(module.tableTitle)}实验组">${[["all", "全部"], ...module.groups.map(group => [group, group])].map(([value, label]) =>
      `<button type="button" class="tab ${state.group === value ? "on" : ""}" role="tab" aria-selected="${state.group === value}" data-cf-module="${module.id}" data-cf-group="${esc(value)}">${esc(label)}</button>`
    ).join("")}</div><div class="tbl-tools"><small>${rows.length} 条数据</small>
      ${customized ? `<button class="btn-o sm cf-reset-order" type="button" data-cf-module="${module.id}" data-cf-reset-order title="恢复原始数据顺序与指标顺序">恢复排序</button>` : ""}
      ${formatButton(module, view)}
      <button class="btn-o sm" type="button" data-cf-module="${module.id}" data-cf-transpose aria-pressed="${state.transposed}">⇄ 转置</button>
      <button class="btn-o sm" type="button" data-fs="${id}">⛶ 全屏</button></div></div>
    ${formatPanel(module, view, format)}
    <div class="tbl-wrap" tabindex="0" aria-label="${esc(module.tableTitle)}，可横向滚动">${body}</div></div>`;
}

function moduleHTML(module, report, view) {
  const scope = moduleScope(module), section = report.sections.find(section => section.id === scope);
  return `${directoryHeading(report, scope, esc)}<section class="sec reference-module" id="sec-${scope}" data-sec="${scope}" data-mm-section="${scope}">
    <h2 class="sec-h2">${esc(section?.title || module.title)}</h2>${module.description ? `<p class="sec-sub">${esc(module.description)}</p>` : ""}
    ${module.conclusion.length ? `<div class="ccard"><div class="ccard-h"><h3 class="t">${conclusionIcon}<span>分析结论</span></h3><span class="grow"></span>${ask(scope)}</div>
      <div class="cf-prose">${blocksHTML(module.conclusion, scope)}</div></div>` : ""}
    ${tableHTML(module, readingState(view, module), view)}</section>`;
}

export function renderCompleteReport(report, view = {}) {
  const order = report.directory?.entries.map(entry => entry.id) || source.modules.map(moduleScope);
  return `<div class="cf-report"><header class="rhead mm-report-header"><p class="eyebrow">实验分析报告</p>
    <h1>${esc(report.title)}</h1><dl class="meta">${report.meta.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></header>
    ${summaryHTML(report)}${order.map(findModule).filter(Boolean).map(module => moduleHTML(module, report, view)).join("")}</div>`;
}

export function completeBeforeGoto(scope, view) {
  if (!scope?.startsWith("cf-evidence-")) return false;
  const rowId = scope.slice("cf-evidence-".length);
  const module = source.modules.find(module => module.rows.some(row => row.id === rowId));
  if (!module) return false;
  const state = readingState(view, module), row = module.rows.find(row => row.id === rowId);
  if (!columnGroups(module) && state.group !== "all") state.group = rowGroup(row);
  saveReading(view);
  return { moduleId: moduleScope(module), scope: moduleScope(module), focus: `#cf-evidence-${rowId}`, scroll: true };
}

function clearDrag(view) {
  const drag = view.completeDrag;
  drag?.table.querySelectorAll(".cf-dragging,.cf-drop-before,.cf-drop-after").forEach(element =>
    element.classList.remove("cf-dragging", "cf-drop-before", "cf-drop-after"));
  view.completeDrag = null;
}

function dragEvent(event, view) {
  if (event.type === "dragend") { clearDrag(view); return false; }
  if (event.type === "dragstart") {
    const handle = event.target.closest("[data-cf-drag]");
    if (!handle) return false;
    const table = handle.closest("table"), metric = handle.dataset.cfDrag;
    clearDrag(view);
    view.completeDrag = { table, metric, moduleId: handle.dataset.cfModule };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", metric);
    table.querySelectorAll(`[data-cf-metric="${metric}"]`).forEach(element => element.classList.add("cf-dragging"));
    return false;
  }
  const drag = view.completeDrag;
  if (!drag) return false;
  const target = event.target.closest("[data-cf-metric]");
  drag.table.querySelectorAll(".cf-drop-before,.cf-drop-after").forEach(element => element.classList.remove("cf-drop-before", "cf-drop-after"));
  if (!target || target.closest("table") !== drag.table || target.dataset.cfMetric === drag.metric) return false;
  event.preventDefault();
  const targets = [...drag.table.querySelectorAll(`[data-cf-metric="${target.dataset.cfMetric}"]`)];
  const first = targets[0].getBoundingClientRect(), last = targets.at(-1).getBoundingClientRect();
  const vertical = drag.table.classList.contains("cf-transposed");
  const after = vertical ? event.clientY > (first.top + last.bottom) / 2 : event.clientX > (first.left + last.right) / 2;
  if (event.type === "dragover" || event.type === "dragenter") {
    event.dataTransfer.dropEffect = "move";
    (after ? targets.at(-1) : targets[0]).classList.add(after ? "cf-drop-after" : "cf-drop-before");
    const wrap = drag.table.closest(".tbl-wrap"), rect = wrap.getBoundingClientRect();
    if (vertical) wrap.scrollTop += event.clientY < rect.top + 32 ? -18 : event.clientY > rect.bottom - 32 ? 18 : 0;
    else wrap.scrollLeft += event.clientX < rect.left + 40 ? -24 : event.clientX > rect.right - 40 ? 24 : 0;
    return false;
  }
  if (event.type !== "drop") return false;
  const module = findModule(drag.moduleId), state = readingState(view, module);
  const moved = moveMetric(module, state, drag.metric, target.dataset.cfMetric, after);
  clearDrag(view);
  if (!moved) return false;
  saveReading(view);
  return { moduleId: moduleScope(module), focus: `[data-cf-module="${module.id}"][data-cf-drag="${drag.metric}"]` };
}

export function completeEvent(event, view) {
  const formatChange = tableFormatEvent(event, view);
  if (formatChange) return formatChange;
  if (["dragstart", "dragenter", "dragover", "drop", "dragend"].includes(event.type)) return dragEvent(event, view);
  if (event.type === "keydown") {
    const handle = event.target.closest("[data-cf-drag]");
    if (!handle || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return false;
    event.preventDefault();
    const module = findModule(handle.dataset.cfModule), state = readingState(view, module);
    const after = ["ArrowDown", "ArrowRight"].includes(event.key);
    const targetId = state.metricOrder[state.metricOrder.indexOf(handle.dataset.cfDrag) + (after ? 1 : -1)];
    if (!moveMetric(module, state, handle.dataset.cfDrag, targetId, after)) return false;
    saveReading(view);
    return { moduleId: moduleScope(module), focus: `[data-cf-module="${module.id}"][data-cf-drag="${handle.dataset.cfDrag}"]` };
  }
  if (event.type !== "click") return false;
  const target = event.target.closest("[data-cf-group],[data-cf-transpose],[data-cf-sort],[data-cf-reset-order]");
  if (!target) return false;
  const module = findModule(target.dataset.cfModule);
  if (!module) return false;
  const state = readingState(view, module);
  let control;
  if (target.hasAttribute("data-cf-group")) {
    state.group = target.dataset.cfGroup;
    // A filtered strategy keeps the chosen metric, using that strategy's values.
    const current = module.columns.find(column => column.id === state.sort?.column);
    if (current?.group && state.group !== "all" && current.group !== state.group) {
      const metric = moduleMetrics(module).find(metric => metric.columns.some(column => column.id === current.id));
      const equivalent = metric?.columns.find(column => column.group === state.group);
      state.sort = equivalent && sortableColumn(module, equivalent.id) ? { ...state.sort, column: equivalent.id } : null;
    }
    control = `[data-cf-group="${esc(state.group)}"]`;
  } else if (target.hasAttribute("data-cf-sort")) {
    if (!sortableColumn(module, target.dataset.cfSort)) return false;
    state.sort = { column: target.dataset.cfSort,
      direction: state.sort?.column === target.dataset.cfSort && state.sort.direction === "desc" ? "asc" : "desc" };
    control = `[data-cf-sort="${target.dataset.cfSort}"]`;
  } else if (target.hasAttribute("data-cf-reset-order")) {
    state.sort = null; state.metricOrder = moduleMetrics(module).map(metric => metric.id);
    control = "[data-cf-transpose]";
  } else {
    state.transposed = !state.transposed;
    control = "[data-cf-transpose]";
  }
  saveReading(view);
  return { moduleId: moduleScope(module), focus: `[data-cf-module="${module.id}"]${control}` };
}

export const completeSuggestions = scope => scope === summaryScope || !scope || scope === "all"
  ? ["三个策略组的整体表现如何？", "GMV-ROI 可以确认达标吗？", "核销间隔与重复核销有什么变化？"]
  : ["总结本模块的结论", "这段结论使用了哪些数据？", "本模块有哪些口径限制？"];

export function completeAnswer(question, scope) {
  const module = findModule(scope);
  let body;
  if (/ROI|达标/.test(question)) {
    body = `${source.summary[1].text}\n\n[[cite:cf-report-module-10::查看整体指标与口径]]`;
  } else if (/间隔|重复|张数/.test(question) && !module) {
    body = `${source.summary[9].text}\n\n${source.summary[10].text}\n\n[[cite:cf-report-module-28::查看间隔分布]] [[cite:cf-report-module-30::查看核销张数分布]]`;
  } else if (module) {
    const row = module.rows.find(row => rowGroup(row) === "基线模型") || module.rows[0];
    body = `${textBlocks(module.conclusion).join("\n\n") || "请查看本模块的原始数据明细。"}\n\n[[cite:cf-evidence-${row.id}::查看原始明细]]`;
  } else {
    body = `${source.summary[0].text}\n\n${source.summary[1].text}\n\n[[cite:cf-report-module-10::查看整体表现]] [[cite:cf-report-module-11::查看人群增量来源]]`;
  }
  return { steps: ["读取报告结论与原始明细"], md: body, follow: completeSuggestions(scope) };
}
