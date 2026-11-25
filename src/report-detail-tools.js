import { columnBarDomains, cellBarGeometry, dataBarColumn, dataBarAppearance, comparisonDirection, significantResult } from "./report-table-formatting.js";
import { tableFormat, formatButton, formatPanel, tableFormatEvent } from "./report-table-format-controls.js";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const finite = value => typeof value === "number" && Number.isFinite(value);
const storageKey = reportId => `msense-report-table-order-v1:${reportId}`;
const metricKey = field => field.viewKey ?? field.key;
const selector = (name, value) => `[${name}=${JSON.stringify(String(value))}]`;

// Adapters retain the original fields, records and cell evidence. Only display
// preferences use this common model, shared by matrix and single-module tables.
export function detailTable(module, scope, dataset, matrix = false) {
  const fields = dataset.fields;
  const records = matrix ? dataset.columns : dataset.records;
  return {
    id: `dt-${scope}`, scope: module.id, fields, records, grouped: matrix,
    columns: [{ id: "label", index: 0 }, ...fields.map((field, index) => ({
      id: metricKey(field), index: index + 1, metric: field.name
    }))],
    rows: records.map(record => ({ record, cells: [{ unit: "text" }, ...fields.map((field, index) => {
      const cell = matrix ? record.cells[metricKey(field)] : record.cells[index];
      const value = matrix ? cell?.value : cell?.raw;
      return { value: (matrix ? cell?.status === "value" : !cell?.missing) && finite(value) ? value : null,
        unit: finite(value) ? field.unit || "number" : "text", lift: cell?.uplift };
    })] }))
  };
}

const availableMetrics = new WeakMap();
export function detailMetrics(model) {
  if (!availableMetrics.has(model)) availableMetrics.set(model, model.fields.flatMap((field, index) =>
    dataBarColumn(model, model.columns[index + 1]) ? [{ id: metricKey(field), label: field.name }] : []));
  return availableMetrics.get(model);
}

export function detailReading(view, model) {
  if (!view.detailReadings) {
    try { view.detailReadings = JSON.parse(localStorage.getItem(storageKey(view.reportId)) || "{}"); } catch { /* Use defaults. */ }
    if (!view.detailReadings || typeof view.detailReadings !== "object" || Array.isArray(view.detailReadings)) view.detailReadings = {};
  }
  const saved = view.detailReadings[model.id] || {}, ids = model.fields.map(metricKey);
  const order = Array.isArray(saved.metricOrder) ? [...new Set(saved.metricOrder)].filter(id => ids.includes(id)) : [];
  const sortable = id => model.columns.some(column => column.id === id
    && model.rows.some(row => finite(row.cells[column.index]?.value)));
  return view.detailReadings[model.id] = {
    metricOrder: [...order, ...ids.filter(id => !order.includes(id))],
    sort: saved.sort && sortable(saved.sort.column)
      ? { column: saved.sort.column, direction: saved.sort.direction === "asc" ? "asc" : "desc" } : null
  };
}

export const detailFields = (model, reading) => reading.metricOrder.map(id => model.fields.find(field => metricKey(field) === id));

export function detailRecords(model, reading, visible = model.records) {
  const index = reading.sort && model.columns.find(column => column.id === reading.sort.column)?.index;
  if (!index) return visible;
  const value = record => model.rows.find(row => row.record === record)?.cells[index]?.value;
  const compare = (a, b) => {
    const left = value(a), right = value(b);
    if (!finite(left)) return finite(right) ? 1 : 0;
    if (!finite(right)) return -1;
    return (left === right ? 0 : left < right ? -1 : 1) * (reading.sort.direction === "asc" ? 1 : -1);
  };
  if (!model.grouped) return [...visible].sort(compare);
  const groups = [...new Set(visible.map(record => record.experimentId))].map(id => ({
    records: visible.filter(record => record.experimentId === id),
    // Sorting uses the original first valid strategy, so hiding a group does
    // not change another experiment's rank. Experiment groups stay intact.
    representative: model.records.find(record => record.experimentId === id && !record.control && finite(value(record)))
      || model.records.find(record => record.experimentId === id && finite(value(record)))
  }));
  return groups.sort((a, b) => compare(a.representative, b.representative)).flatMap(group => group.records);
}

const context = (view, models) => ({ source: { id: view.reportId, modules: models }, metrics: detailMetrics, scope: model => model.scope });
export const detailFormat = (view, model) => tableFormat(view, model, context(view, [model]));
export function detailControls(view, model) {
  return `${formatButton(model, view)}<button type="button" class="btn-o sm cf-reset-order" data-detail-table="${model.id}" data-detail-reset>恢复排序</button>`;
}
export function detailPanel(view, model, format) {
  return formatPanel(model, view, format, { metrics: detailMetrics(model) });
}

const grip = '<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.2"/><circle cx="8" cy="4" r="1.2"/><circle cx="4" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="8" cy="12" r="1.2"/></svg>';
const sortIcon = '<svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true"><path class="cf-sort-up" d="m7 2 4 5H3z"/><path class="cf-sort-down" d="m7 14 4-5H3z"/></svg>';
export function detailHeading(model, field, reading) {
  const id = metricKey(field), direction = reading.sort?.column === id ? reading.sort.direction : "none";
  const sortable = model.rows.some(row => finite(row.cells[model.columns.find(column => column.id === id).index]?.value));
  const attrs = `data-detail-table="${model.id}"`;
  const label = `<span class="cf-heading-label">${esc(field.name)}${field.unit ? `<small>${esc(field.unit)}</small>` : ""}</span>`;
  return `<div class="cf-heading" ${attrs} data-detail-field="${esc(id)}">
    <button type="button" class="cf-metric-grip" ${attrs} data-detail-metric="${esc(id)}" draggable="true" aria-label="调整${esc(field.name)}顺序" title="拖动调整指标顺序；按住 Alt 加方向键也可调整">${grip}</button>
    ${sortable ? `<button type="button" class="cf-sort-heading" ${attrs} data-detail-sort="${esc(id)}" data-direction="${direction}" title="${model.grouped ? "按每个实验首个可用策略组的数值排序，实验内组别保持完整" : "按指标数值排序"}">${label}<span class="cf-sort-icon">${sortIcon}</span></button>` : label}</div>`;
}
export const detailSortAria = (field, reading) => reading.sort?.column === metricKey(field)
  ? ` aria-sort="${reading.sort.direction === "asc" ? "ascending" : "descending"}"` : "";

export function detailValue(text, value, model, field, format) {
  const column = model.columns.find(column => column.id === metricKey(field));
  const allowed = format.bars && (format.metrics === null || format.metrics.includes(column.id));
  const domain = allowed && dataBarColumn(model, column) ? columnBarDomains(model).get(column.index) : null;
  const bar = cellBarGeometry(value, domain);
  const appearance = bar ? dataBarAppearance(format, detailMetrics(model).findIndex(metric => metric.id === column.id), value, domain) : null;
  return `<span${bar ? ` class="cf-cell-value" style="--cf-bar-left:${bar.left}%;--cf-bar-width:${bar.width}%;--cf-bar-zero:${bar.zero}%;--cf-bar-rgb:${appearance.rgb};${appearance.level ? `--cf-bar-fill:${appearance.level.fill}%;` : ""}"${bar.zero > 0 && bar.zero < 100 ? " data-cf-bar-axis" : ""}${appearance.level ? ` data-cf-bar-level="${appearance.level.id}"` : ""}` : ""}>${esc(text)}</span>`;
}

export function detailComparison(cell, format) {
  const direction = comparisonDirection(cell.uplift);
  const emphasized = format.trends && direction && direction !== "flat" && significantResult({ significance: cell.sig });
  const arrow = direction === "up" ? "M6 11V1m-4 4 4-4 4 4" : "M6 1v10m-4-4 4 4 4-4";
  return `${Object.hasOwn(cell, "uplift") ? `<small class="cf-change cf-change-${emphasized ? direction : "muted"}" title="${esc(cell.sig || "")}">${emphasized ? `<svg width="11" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${arrow}"/></svg>` : ""}增幅 ${finite(cell.uplift) ? `${cell.uplift > 0 ? "+" : ""}${cell.uplift.toFixed(2)}%` : "—"}</small>` : ""}
    ${cell.sig ? `<small>${esc(cell.sig)}</small>` : ""}`;
}

export function detailEvent(event, view, models) {
  const formatChange = tableFormatEvent(event, view, context(view, models));
  if (formatChange) return formatChange;
  const target = event.target.closest("[data-detail-table]");
  const model = target && models.find(model => model.id === target.dataset.detailTable);
  if (!model) return false;
  const reading = detailReading(view, model), id = target.dataset.detailSort || target.dataset.detailMetric || target.dataset.detailField;
  let focus = `[data-detail-table="${model.id}"]${selector("data-detail-sort", id)}`, changed = false;
  const move = (from, to, after) => {
    if (!reading.metricOrder.includes(from) || !reading.metricOrder.includes(to) || from === to) return false;
    const next = reading.metricOrder.filter(key => key !== from);
    next.splice(next.indexOf(to) + Number(after), 0, from);
    if (next.every((key, index) => key === reading.metricOrder[index])) return false;
    reading.metricOrder = next;
    focus = `[data-detail-table="${model.id}"]${selector("data-detail-metric", from)}`;
    return true;
  };
  if (event.type === "click" && target.hasAttribute("data-detail-sort")) {
    reading.sort = reading.sort?.column !== id ? { column: id, direction: "desc" }
      : reading.sort.direction === "desc" ? { column: id, direction: "asc" } : null;
    changed = true;
  } else if (event.type === "click" && target.hasAttribute("data-detail-reset")) {
    reading.metricOrder = model.fields.map(metricKey); reading.sort = null; changed = true;
    focus = `[data-detail-table="${model.id}"][data-detail-reset]`;
  } else if (event.type === "keydown" && target.hasAttribute("data-detail-metric") && event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const after = ["ArrowRight", "ArrowDown"].includes(event.key);
    const to = reading.metricOrder[reading.metricOrder.indexOf(id) + (after ? 1 : -1)];
    changed = move(id, to, after);
  } else if (event.type === "dragstart" && target.hasAttribute("data-detail-metric")) {
    view.detailDrag = { table: model.id, metric: id };
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }
    target.closest("th")?.classList.add("cf-dragging");
    return false;
  } else if (["dragover", "dragenter", "drop"].includes(event.type) && view.detailDrag?.table === model.id) {
    const heading = event.target.closest("[data-detail-field]");
    if (!heading) return false;
    event.preventDefault();
    const rect = heading.getBoundingClientRect();
    const vertical = !heading.closest("thead");
    const after = vertical ? event.clientY > rect.top + rect.height / 2 : event.clientX > rect.left + rect.width / 2;
    if (event.type === "drop") {
      changed = move(view.detailDrag.metric, heading.dataset.detailField, after); view.detailDrag = null;
      event.target.closest(".mm-updated-report")?.querySelectorAll(".cf-dragging,.cf-drop-before,.cf-drop-after").forEach(item => item.classList.remove("cf-dragging", "cf-drop-before", "cf-drop-after"));
    } else {
      event.target.closest(".mm-updated-report")?.querySelectorAll(".cf-drop-before,.cf-drop-after").forEach(item => item.classList.remove("cf-drop-before", "cf-drop-after"));
      heading.closest("th")?.classList.add(after ? "cf-drop-after" : "cf-drop-before");
      return false;
    }
  } else if (event.type === "dragend") {
    view.detailDrag = null;
    event.target.closest(".mm-updated-report")?.querySelectorAll(".cf-dragging,.cf-drop-before,.cf-drop-after").forEach(item => item.classList.remove("cf-dragging", "cf-drop-before", "cf-drop-after"));
  }
  if (!changed) return false;
  try { localStorage.setItem(storageKey(view.reportId), JSON.stringify(view.detailReadings)); } catch { /* Retain in memory. */ }
  return { moduleId: model.scope, focus };
}
