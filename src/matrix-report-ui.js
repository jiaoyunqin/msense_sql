import { moduleView } from "./multi-report-content.js";
import { matrixView, matrixSelection, findMatrixCell } from "./matrix-report-data.js";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const attr = ([name, value]) => `[${name}=${JSON.stringify(value)}]`;
const statuses = { missing: "未提供", "not-applicable": "不适用", failed: "取数失败", unavailable: "数据不可用", unalignable: "无法对齐" };
const columnLabel = column => column.experimentLabel || column.experimentId;
export const usesMatrix = (report, module) => report.snapshot.analysisType === "multi" && module.analysisType === "multi";
function numberText(cell, field) {
  if (cell.status !== "value") return "—";
  return cell.value.toLocaleString("zh-CN", { minimumFractionDigits: field.digits, maximumFractionDigits: field.digits,
    style: field.format === "percent" ? "percent" : "decimal" });
}
function auxiliaryHTML(cell) {
  if (!cell.ownControl || cell.status !== "value") return "";
  return `${Object.hasOwn(cell, "uplift") ? `<small>增幅 ${cell.uplift == null ? "—" : `${cell.uplift > 0 ? "+" : ""}${cell.uplift.toFixed(2)}%`}</small>` : ""}
    ${cell.sig ? `<small>${esc(cell.sig)}</small>` : ""}
    ${Object.hasOwn(cell, "uplift") || cell.sig ? "<small>相对本实验对照组</small>" : ""}`;
}
function cellHTML(module, column, field) {
  const cell = column.cells[field.key];
  const description = `${column.experimentName} · ${columnLabel(column)} / ${column.groupName} · ${column.groupId} / ${field.name}：${numberText(cell, field)} ${field.unit || ""}${cell.reason ? `；${cell.reason}` : ""}`;
  return `<td><button type="button" class="mx-cell" data-matrix-cell="${cell.token}" data-matrix-module="${module.id}"
    data-matrix-key="${esc(cell.evidence.datasetKey)}" data-cell-status="${cell.status}" aria-label="${esc(description)}" title="${esc(description)}">
    <span>${numberText(cell, field)}</span>${cell.status !== "value" ? `<small>${statuses[cell.status] || "未提供"}</small>` : ""}
    ${auxiliaryHTML(cell)}</button></td>`;
}
function experimentInfo(column) {
  const definition = column.definition;
  return `${column.experimentName} · ${columnLabel(column)}；实验周期：${definition.period?.join(" 至 ") || "未提供"}；观察窗口：${column.input.start} 至 ${column.input.end}；对照组：${definition.control.name} · ${definition.control.id}；${Object.values(definition.strategy || {}).join("；")}`;
}
function experimentHeader(column) {
  return `<div class="mx-experiment" tabindex="0" title="${esc(experimentInfo(column))}" aria-label="${esc(experimentInfo(column))}">
    <span class="mx-name">${esc(column.experimentName)}</span><small>${esc(columnLabel(column))}</small>
    <span class="mx-context">${esc(experimentInfo(column))}</span></div>`;
}
function scopeHTML(module, dataset, reading, selection) {
  const key = `data-matrix-key="${esc(dataset.key)}"`;
  const id = `${module.id}-matrix-data-${module.comparison.datasets.indexOf(dataset)}`;
  const groups = [...new Set(dataset.columns.map(column => column.experimentId))].map(id =>
    dataset.columns.filter(column => column.experimentId === id));
  const query = reading.search.trim().toLocaleLowerCase();
  let visible = 0;
  const content = groups.map(columns => {
    const first = columns[0], matches = columns.filter(column =>
      `${column.experimentName} ${columnLabel(column)} ${column.groupName} ${column.groupId}`.toLocaleLowerCase().includes(query));
    if (!matches.length) return "";
    visible++;
    const selected = columns.filter(column => reading.selected.includes(column.key)).length;
    return `<fieldset><legend><label><input type="checkbox" data-matrix-experiment="${esc(first.experimentId)}"
      data-matrix-module="${module.id}" ${key} ${selected === columns.length ? "checked" : ""} ${selected && selected < columns.length ? 'data-indeterminate aria-checked="mixed"' : ""}>
      <span>${esc(first.experimentName)}<small>${esc(columnLabel(first))} · ${selected}/${columns.length} 组已选</small></span></label></legend>
      ${matches.map(column => `<label class="mx-group-option"><input type="checkbox" data-matrix-group="${esc(column.key)}"
        data-matrix-module="${module.id}" ${key} ${reading.selected.includes(column.key) ? "checked" : ""}>
        <span>${esc(column.groupName)}<small>${esc(column.groupId)}${column.control ? " · 对照组" : ""}${Object.values(column.cells).every(cell => cell.status !== "value") ? " · 无有效数值" : ""}</small></span></label>`).join("")}</fieldset>`;
  }).join("");
  return `<details class="mx-scope" data-matrix-details="scope-${id}">
    <summary>显示范围：${selection.experiments} 个实验 · ${selection.columns.length} 个组</summary>
    <div class="mx-scope-menu"><label class="mx-search-label">搜索实验 / 组别<input type="search"
      data-matrix-search data-matrix-module="${module.id}" ${key} value="${esc(reading.search)}" placeholder="实验名称、Libra ID 或组别"></label>
      <div class="mx-scope-actions"><button type="button" data-matrix-reset data-matrix-module="${module.id}" ${key}>恢复全部</button>
        <button type="button" data-matrix-clear data-matrix-module="${module.id}" ${key}>清空选择</button></div>
      <div class="mx-scope-options">${content || (visible ? "" : '<p role="status">没有匹配的实验或组别；已选项保持不变。</p>')}</div>
    </div></details>`;
}
export function matrixHTML(module, state) {
  const id = `${module.id}-matrix`;
  if (!module.comparison.datasets.length) return `<section class="sec mx-section" id="sec-${id}" data-sec="${id}">
    <div class="mm-unavailable" role="status"><p>当前模块无可对齐的整体数据。</p>
    ${module.comparison.issues.length ? `<p>${esc(module.comparison.issues.join("；"))}</p>` : ""}</div></section>`;
  return `<div id="sec-${id}">${module.comparison.datasets.map((dataset, index) =>
    matrixTableHTML(module, state, dataset, index)).join("")}
    ${module.comparison.issues.length ? `<p class="mx-notice">${esc(module.comparison.issues.join("；"))}</p>` : ""}</div>`;
}
function matrixTableHTML(module, state, dataset, index) {
  const { reading } = matrixView(state, module.comparison, dataset.key), id = `${module.id}-matrix-data-${index}`;
  const key = `data-matrix-key="${esc(dataset.key)}"`;
  const selection = matrixSelection(dataset, reading), { columns } = selection;
  const groups = [...new Set(columns.map(column => column.experimentId))].map(experimentId =>
    columns.filter(column => column.experimentId === experimentId));
  const table = reading.transposed
    ? `<table class="mm-table mx-table mx-transposed"><thead><tr><th class="mx-fixed">实验 / Libra ID</th><th class="mx-group-fixed">实验组</th>${dataset.fields.map(field =>
      `<th scope="col">${esc(field.name)}${field.unit ? `<small>${esc(field.unit)}</small>` : ""}</th>`).join("")}</tr></thead><tbody>
      ${groups.map(group => group.map((column, index) => `<tr>${index === 0 ? `<th class="mx-fixed" scope="rowgroup" rowspan="${group.length}">${experimentHeader(column)}</th>` : ""}
        <th class="mx-group-fixed" scope="row">${esc(column.groupName)}<small>${esc(column.groupId)}${column.control ? " · 对照组" : ""}</small></th>
        ${dataset.fields.map(field => cellHTML(module, column, field)).join("")}</tr>`).join("")).join("")}</tbody></table>`
    : `<table class="mm-table mx-table"><thead><tr class="mx-experiment-row"><th class="mx-fixed" rowspan="2" scope="col">指标</th>${groups.map(group =>
      `<th colspan="${group.length}" scope="colgroup" class="mx-group-start">${experimentHeader(group[0])}</th>`).join("")}</tr>
      <tr class="mx-group-row">${groups.map(group => group.map((column, index) =>
        `<th scope="col" class="${index === 0 ? "mx-group-start" : ""}">${esc(column.groupName)}<small>${esc(column.groupId)}${column.control ? " · 对照组" : ""}${Object.values(column.cells).every(cell => cell.status !== "value") ? " · 数据不可用" : ""}</small></th>`).join("")).join("")}</tr></thead>
      <tbody>${dataset.fields.map(field => `<tr><th class="mx-fixed" scope="row" title="${esc(field.description || field.formulaText || "")}">${esc(field.name)}${field.unit ? `<small>${esc(field.unit)}</small>` : ""}</th>
        ${columns.map(column => cellHTML(module, column, field)).join("")}</tr>`).join("")}</tbody></table>`;
  return `<section class="sec mx-section" id="sec-${id}" data-sec="${id}"><div class="tblock mx-block" id="tb-${id}">
    <h3 class="mm-dataset-title">${esc(dataset.title)}</h3>
    <div class="mx-toolbar">${scopeHTML(module, dataset, reading, selection)}<div class="mm-table-tools">
        <button class="btn-o sm" type="button" data-matrix-transpose data-matrix-module="${module.id}" ${key} aria-pressed="${reading.transposed}">⇄ 转置</button>
        <button class="btn-o sm" type="button" data-fs="${id}">⛶ 全屏</button></div></div>
    ${selection.experiments === 1 ? '<p class="mx-notice" role="status">当前仅查看单个实验数据。</p>' : ""}
    ${columns.length && selection.validExperiments < 2 ? '<p class="mx-notice" role="status">当前指标表有效实验不足两个；保留已有数据，不形成跨实验比较。</p>' : ""}
    ${columns.length ? `<div class="tbl-wrap mx-scroll" tabindex="0" aria-label="${esc(dataset.title)}，可横向和纵向滚动">${table}</div>`
      : `<div class="mm-unavailable" role="status"><p>尚未选择实验组，当前无可见数据。</p><button type="button" class="btn-o sm" data-matrix-reset data-matrix-module="${module.id}" ${key}>恢复全部</button></div>`}
    </div></section>`;
}
export function focusMatrixEvidence(module, state, token) {
  const found = findMatrixCell(module.comparison, token);
  if (!found) return false;
  const { matrix } = matrixView(state, module.comparison);
  matrix.datasetKey = found.dataset.key;
  const { reading } = matrixView(state, module.comparison);
  reading.evidence = token;
  if (!reading.selected.includes(found.column.key)) reading.selected.push(found.column.key);
  state.experimentId = found.column.experimentId;
  return { moduleId: module.id, scope: `${module.id}-matrix-data-${module.comparison.datasets.indexOf(found.dataset)}`, scroll: true,
    focus: `[data-matrix-cell="${token}"]` };
}
export function applyMatrixEvent(event, report, view) {
  const target = event.target.closest("[data-matrix-module]");
  if (!target) return false;
  const module = report.moduleContent.find(module => module.id === target.dataset.matrixModule);
  if (!module || !usesMatrix(report, module)) return false;
  const state = moduleView(view, module);
  const data = target.dataset;
  const { dataset, reading } = matrixView(state, module.comparison, data.matrixKey);
  if (data.matrixKey !== undefined && !dataset) return false;
  const control = name => `${attr([name, target.getAttribute?.(name) ?? ""])}[data-matrix-module="${module.id}"]${data.matrixKey !== undefined ? attr(["data-matrix-key", data.matrixKey]) : ""}`;
  let focus;
  if (event.type === "input" && "matrixSearch" in data && reading) {
    reading.search = target.value;
    focus = control("data-matrix-search");
  } else if (event.type === "change" && ("matrixGroup" in data || "matrixExperiment" in data) && reading) {
    const keys = data.matrixExperiment ? dataset.columns.filter(column => column.experimentId === data.matrixExperiment).map(column => column.key)
      : dataset.columns.filter(column => column.key === data.matrixGroup).map(column => column.key);
    reading.selected = target.checked ? [...new Set([...reading.selected, ...keys])] : reading.selected.filter(key => !keys.includes(key));
    focus = control(data.matrixExperiment ? "data-matrix-experiment" : "data-matrix-group");
  } else if (event.type === "click" && "matrixReset" in data && reading) {
    reading.selected = dataset.columns.map(column => column.key);
    focus = control("data-matrix-reset");
  } else if (event.type === "click" && "matrixClear" in data && reading) {
    reading.selected = [];
    focus = control("data-matrix-clear");
  } else if (event.type === "click" && "matrixTranspose" in data && reading) {
    reading.transposed = !reading.transposed;
    focus = control("data-matrix-transpose");
  } else if (["click", "focusin"].includes(event.type) && data.matrixCell && reading) {
    if (reading.evidence === data.matrixCell || !findMatrixCell(module.comparison, data.matrixCell)) return false;
    reading.evidence = data.matrixCell;
    focus = `[data-matrix-cell="${data.matrixCell}"]`;
  } else return false;
  return { moduleId: module.id, focus };
}
