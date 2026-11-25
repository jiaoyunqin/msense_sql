import source from "./report-complete-data.json";

export const completeSource = source;
export const moduleScope = module => `cf-${module.id}`;
export const summaryScope = "cf-summary";
export const rowGroup = row => row.cells[0].text.replace(/\s+/g, " ").trim();
export const columnGroups = module => module.columns.some(column => column.group);
const defaults = () => ({ group: "all", transposed: false });
const storageKey = "msense-complete-report-reading-v2";
const orderStorageKey = `msense-report-table-order-v1:${source.id}`;
const metricGroups = new WeakMap();
const finite = value => typeof value === "number" && Number.isFinite(value);

// Metric identity follows the original header span, never its current position.
export function moduleMetrics(module) {
  if (!metricGroups.has(module)) {
    let start = 0;
    metricGroups.set(module, module.headerRows[0].flatMap(header => {
      const columns = module.columns.slice(start, start + header.colspan);
      start += header.colspan;
      return columns[0]?.index ? [{ id: columns[0].id, label: header.text, columns }] : [];
    }));
  }
  return metricGroups.get(module);
}

export const sortableColumn = (module, id) => module.columns.find(column => column.id === id && column.index > 0
  && module.rows.some(row => row.cells[column.index]?.unit !== "text" && finite(row.cells[column.index]?.value)));

export function normalizeReading(module, input = {}) {
  const ids = moduleMetrics(module).map(metric => metric.id);
  const order = Array.isArray(input.metricOrder) ? [...new Set(input.metricOrder)].filter(id => ids.includes(id)) : [];
  return {
    group: input.group === "all" || module.groups.includes(input.group) ? input.group : "all",
    transposed: input.transposed === true,
    metricOrder: [...order, ...ids.filter(id => !order.includes(id))],
    sort: input.sort && sortableColumn(module, input.sort.column)
      ? { column: input.sort.column, direction: input.sort.direction === "asc" ? "asc" : "desc" } : null
  };
}

export function readingState(view, module) {
  if (!view.completeTables) {
    let saved, orders;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}"); } catch { saved = {}; }
    try { orders = JSON.parse(localStorage.getItem(orderStorageKey) || "{}"); } catch { orders = {}; }
    view.completeTables = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    for (const item of source.modules) {
      if (orders?.[item.id] && typeof orders[item.id] === "object") {
        view.completeTables[item.id] = { ...view.completeTables[item.id],
          sort: orders[item.id].sort, metricOrder: orders[item.id].metricOrder };
      }
    }
  }
  return view.completeTables[module.id] = normalizeReading(module, view.completeTables[module.id] || defaults());
}

export function saveReading(view) {
  try { sessionStorage.setItem(storageKey, JSON.stringify(view.completeTables)); } catch { /* Reading remains usable without storage. */ }
  try {
    localStorage.setItem(orderStorageKey, JSON.stringify(Object.fromEntries(
      Object.entries(view.completeTables).map(([id, state]) => [id, { sort: state.sort, metricOrder: state.metricOrder }])
    )));
  } catch { /* Sorting remains usable in memory when storage is unavailable. */ }
}

export function moduleRows(module, state) {
  const rows = columnGroups(module) || state.group === "all" ? module.rows : module.rows.filter(row => rowGroup(row) === state.group);
  const column = state.sort && sortableColumn(module, state.sort.column);
  if (!column) return rows;
  const value = row => {
    const cell = row.cells[column.index];
    return cell?.unit !== "text" && finite(cell?.value) ? cell.value : null;
  };
  return [...rows].sort((a, b) => {
    const left = value(a), right = value(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return (left === right ? 0 : left < right ? -1 : 1) * (state.sort.direction === "asc" ? 1 : -1);
  });
}

export function moduleColumns(module, state) {
  const metrics = moduleMetrics(module);
  const order = normalizeReading(module, state).metricOrder;
  return [module.columns[0], ...order.flatMap(id => metrics.find(metric => metric.id === id).columns)]
    .filter(column => !column.group || state.group === "all" || column.group === state.group);
}

export function moveMetric(module, state, sourceId, targetId, after = false) {
  const order = normalizeReading(module, state).metricOrder;
  if (sourceId === targetId || !order.includes(sourceId) || !order.includes(targetId)) return false;
  const next = order.filter(id => id !== sourceId);
  next.splice(next.indexOf(targetId) + Number(after), 0, sourceId);
  if (next.every((id, index) => id === order[index])) return false;
  state.metricOrder = next;
  return true;
}

export { columnBarDomains, cellBarGeometry } from "./report-table-formatting.js";
