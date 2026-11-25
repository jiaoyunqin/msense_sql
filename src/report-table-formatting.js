// Display preferences are independent of the saved report and its reading order.
export const formatColors = {
  blue: { label: "蓝色", rgb: "76 125 226", hex: "#4c7de2" },
  teal: { label: "青色", rgb: "39 151 140", hex: "#27978c" },
  amber: { label: "橙色", rgb: "217 151 50", hex: "#d99732" },
  violet: { label: "紫色", rgb: "137 112 195", hex: "#8970c3" }
};

export const barLevels = [
  { id: "low", label: "较小", threshold: "≤ 原列最大绝对值的 1/3", fill: 6 },
  { id: "medium", label: "中等", threshold: "> 1/3 且 ≤ 2/3", fill: 10 },
  { id: "high", label: "较大", threshold: "> 原列最大绝对值的 2/3", fill: 14 }
];

export const significanceLabel = value => /^(正向显著|负向显著|不显著|显著)$/.test(value);
export const significantResult = cell => /^(正向显著|负向显著|显著)$/.test(cell?.significance);

// Statistics remain sortable, but do not belong in a magnitude comparison.
export const dataBarColumn = (module, column) => column.index > 0
  && !/检验统计量|显著性|置信区间|(?:^|[ ·_])p[ -]?值/i.test(column.metric)
  && module.rows.some(row => {
    const cell = row.cells[column.index];
    return cell?.unit !== "text" && typeof cell?.value === "number" && Number.isFinite(cell.value);
  });

export function compactTableLabel(module, label) {
  if (module.id === "report-module-3") return label.replace(/^实验preaa期间/i, "");
  if (module.id === "report-module-28") return label.replace(/^领券核销间隔(?=均值|P\d)/, "");
  return label;
}

export function dataBarAppearance(format, metricIndex, value, domain) {
  const color = formatColors[format.barColor];
  const magnitude = domain?.scale > 0 && Number.isFinite(domain.scale) && Number.isFinite(value)
    ? Math.abs(value) / domain.scale : null;
  const level = magnitude !== null
    ? barLevels[magnitude <= 1 / 3 ? 0 : magnitude <= 2 / 3 ? 1 : 2] : null;
  return { rgb: color.rgb, level };
}

export function normalizeTableFormat(input, metricIds) {
  const value = input && typeof input === "object" ? input : {};
  return {
    trends: true,
    trendPalette: "green-up",
    bars: value.bars === true,
    barMode: "value",
    barColor: Object.hasOwn(formatColors, value.barColor) ? value.barColor : "blue",
    // Bars require an explicit selection. null is only produced by "select all".
    metrics: Array.isArray(value.metrics)
      ? [...new Set(value.metrics)].filter(id => metricIds.includes(id)) : value.metrics === null ? null : []
  };
}

export function comparisonDirection(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

// Start with the quieter defaults instead of reviving v1's automatic all-column bars.
export const formatStorageKey = reportId => `msense-report-table-format-v2:${reportId}`;

export function loadTableFormats(reportId) {
  try {
    const saved = JSON.parse(localStorage.getItem(formatStorageKey(reportId)) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

export function saveTableFormats(reportId, formats) {
  try {
    localStorage.setItem(formatStorageKey(reportId), JSON.stringify(formats));
    return true;
  } catch { return false; }
}

const finite = value => typeof value === "number" && Number.isFinite(value);
const barDomains = new WeakMap();
export function columnBarDomains(module) {
  if (!barDomains.has(module)) {
    const domains = new Map();
    for (const column of module.columns) {
      if (column.index === 0) continue;
      const values = module.rows.map(row => row.cells[column.index])
        .filter(cell => cell?.unit !== "text" && finite(cell?.value)).map(cell => cell.value);
      if (!values.length) continue;
      const min = Math.min(0, ...values), max = Math.max(0, ...values);
      const scale = Math.max(Math.abs(min), Math.abs(max));
      if (scale > 0) domains.set(column.index, { min, max, scale });
    }
    barDomains.set(module, domains);
  }
  return barDomains.get(module);
}

export function cellBarGeometry(value, domain) {
  if (!finite(value) || !domain || !finite(domain.scale) || domain.scale <= 0) return null;
  const min = domain.min / domain.scale, max = domain.max / domain.scale, range = max - min;
  if (!finite(range) || range <= 0) return null;
  const clamp = number => Math.max(0, Math.min(100, number));
  const zero = clamp(-min / range * 100);
  const end = clamp((value / domain.scale - min) / range * 100);
  return { zero, left: Math.min(zero, end), width: Math.abs(end - zero) };
}
