// All detail tables use the same visual treatment for selected metrics.
export const significanceLabel = value => /^(正向显著|负向显著|不显著|显著)$/.test(value);
export const significantResult = cell => /^(正向显著|负向显著|显著)$/.test(cell?.significance);

// Statistics remain sortable, but do not belong in a magnitude comparison.
export const dataBarMetricName = name => Boolean(name)
  && !/检验统计量|显著性|置信区间|(?:^|[ ·_])p[ -]?值|(?:编号|批次|(?:^|[ ·_])id)(?:$|[ ·_])/i.test(name);
export const dataBarColumn = (module, column) => column.index > 0
  && dataBarMetricName(column.metric)
  && module.rows.some(row => {
    const cell = row.cells[column.index];
    return cell?.unit !== "text" && typeof cell?.value === "number" && Number.isFinite(cell.value);
  });

export function compactTableLabel(module, label) {
  if (module.id === "report-module-3") return label.replace(/^实验preaa期间/i, "");
  if (module.id === "report-module-28") return label.replace(/^领券核销间隔(?=均值|P\d)/, "");
  return label;
}

export function comparisonDirection(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

const finite = value => typeof value === "number" && Number.isFinite(value);
export function positiveBarMaximum(values) {
  let max = 0;
  for (const value of values) if (finite(value) && value > max) max = value;
  return max;
}
const barDomains = new WeakMap();
export function columnBarDomains(module) {
  if (!barDomains.has(module)) {
    const domains = new Map();
    for (const column of module.columns) {
      if (column.index === 0) continue;
      const max = positiveBarMaximum(module.rows.map(row => {
        const cell = row.cells[column.index];
        return cell?.unit !== "text" ? cell?.value : null;
      }));
      if (max > 0) domains.set(column.index, { max });
    }
    barDomains.set(module, domains);
  }
  return barDomains.get(module);
}

export function cellBarGeometry(value, domain) {
  if (!finite(value) || value <= 0 || !finite(domain?.max) || domain.max <= 0) return null;
  return { width: Math.min(1, value / domain.max) * 100 };
}

export function dataBarAttributes(value, domain) {
  const bar = cellBarGeometry(value, domain);
  if (!bar) return "";
  return ` class="cf-cell-value" style="--cf-bar-width:${bar.width}%"`;
}
