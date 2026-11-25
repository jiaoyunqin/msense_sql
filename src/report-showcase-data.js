// Typed snapshot of report-reference-data.json / report-module-10 and 11.
// Keep source precision. Significance belongs to its metric, never to adjacent fields.
const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const showcase = freeze({
  id: "r-visualization-demo",
  experiment: "品类增长-应季趋势类目券包-基线策略",
  experimentId: "5640220",
  group: "实验组1",
  period: "2026-08-28 至 2026-09-03",
  window: "2026-08-28 至 2026-09-17",
  capturedAt: "2026-11-08T11:02:55.042Z",
  overall: {
    controlDac: 0.28, dac: 0.32, dacLift: 14.51, dacSignificance: "正向显著",
    delta: 20503.61, daily: 2929.0877, redemptionCost: 8.1335, cost: 4.3496,
    roi: 1.17, roiThreshold: 1.8, gmv: 61.9836, gmvLift: 0.91,
    gmvSignificance: "不显著", gmvDelta: 286900, gmvDeltaDisplay: "￥28.69万"
  },
  rows: [
    { id: "young-low-male", label: "年轻低消费力男性", dac: 0.27, dacLift: 13.14, delta: 5091.12, daily: 727.3034, redemptionCost: 8.3766, cost: 4.5147, roi: 0.89, gmv: 46.8843, gmvLift: 0.72, gmvDelta: 55200, gmvDeltaDisplay: "￥5.52万" },
    { id: "young-low-female", label: "年轻低消费力女性", dac: 0.36, dacLift: 20.16, delta: 7633.57, daily: 1090.5095, redemptionCost: 7.3639, cost: 4.1373, roi: -2.22, gmv: 60.0158, gmvLift: 0.48, gmvDelta: 36500, gmvDeltaDisplay: "￥3.65万" },
    { id: "young-high-male", label: "年轻中高消费力男性", dac: 0.31, dacLift: 12.44, delta: 2811.32, daily: 401.6171, redemptionCost: 8.6854, cost: 4.6851, roi: 7.32, gmv: 75.4197, gmvLift: 1.87, gmvDelta: 112500, gmvDeltaDisplay: "￥11.25万" },
    { id: "young-high-female", label: "年轻中高消费力女性", dac: 0.44, dacLift: 14.39, delta: 2687.46, daily: 383.9231, redemptionCost: 8.989, cost: 4.2017, roi: -81.75, gmv: 121.7471, gmvLift: 0.59, gmvDelta: 34500, gmvDeltaDisplay: "￥3.45万" },
    { id: "older-low-female", label: "年长低消费力女性", dac: 0.26, dacLift: 8.86, delta: 632.87, daily: 90.4098, redemptionCost: 8.6619, cost: 4.8536, roi: 6.39, gmv: 36.7975, gmvLift: 3.35, gmvDelta: 35500, gmvDeltaDisplay: "￥3.55万" },
    { id: "older-low-male", label: "年长低消费力男性", dac: 0.24, dacLift: 10.43, delta: 584.08, daily: 83.4394, redemptionCost: 6.6908, cost: 3.5203, roi: -42.31, gmv: 30.5818, gmvLift: -0.94, gmvDelta: -7341, gmvDeltaDisplay: "￥-7,341" },
    { id: "older-high-male", label: "年长中高消费力男性", dac: 0.31, dacLift: 7.18, delta: 419.43, daily: 59.9181, redemptionCost: 11.7095, cost: 6.2717, roi: 5.87, gmv: 61.9461, gmvLift: 2.35, gmvDelta: 28300, gmvDeltaDisplay: "￥2.83万" },
    { id: "older-high-female", label: "年长中高消费力女性", dac: 0.39, dacLift: 12.91, delta: 520.28, daily: 74.3252, redemptionCost: 7.3805, cost: 3.4712, roi: 13.15, gmv: 97.9748, gmvLift: -0.87, gmvDelta: -9923, gmvDeltaDisplay: "￥-9,923" },
    { id: "untagged", label: "缺少标签", dac: 0.24, dacLift: 20.48, delta: 151.13, daily: 21.59, redemptionCost: 7.8821, cost: 4.2056, roi: 86.12, gmv: 34.4888, gmvLift: 0.21, gmvDelta: 271, gmvDeltaDisplay: "￥271" }
  ].map((row, index) => ({
    ...row, sourceIndex: index, dacSignificance: "正向显著", gmvSignificance: "不显著",
    deltaSignificance: null, shareSignificance: null,
    evidence: { module: "report-module-11", row: index, experimentId: "5640220", group: "实验组1", dimension: "电商人群八分层" }
  }))
});

export const denominator = Math.round(showcase.rows.reduce((sum, row) => sum + row.delta, 0) * 100) / 100;
export const finite = value => typeof value === "number" && Number.isFinite(value);
export function contribution(value, total = denominator) {
  return finite(value) && finite(total) && total > 0 ? value / total * 100 : null;
}
export function shareEvidence(row) {
  return {
    value: contribution(row.delta), numerator: row.delta, denominator,
    formula: "该人群增量累计 DAC ÷ 全部九行分层增量合计 × 100%",
    source: row.evidence, denominatorRows: showcase.rows.map(item => item.id),
    significance: null, status: contribution(row.delta) === null ? "invalid" : "valid"
  };
}
export const topContributors = showcase.rows.filter(row => row.delta > 0)
  .toSorted((a, b) => b.delta - a.delta || a.sourceIndex - b.sourceIndex).slice(0, 2).map(row => row.id);
export const topShare = contribution(showcase.rows.filter(row => topContributors.includes(row.id)).reduce((sum, row) => sum + row.delta, 0));
export const youngShare = contribution(showcase.rows.filter(row => row.id.startsWith("young-")).reduce((sum, row) => sum + row.delta, 0));

// One scale for the full snapshot, including zero. Filtering must never rescale it.
export function barDomain(values) {
  const valid = values.filter(finite);
  const min = Math.min(0, ...valid), max = Math.max(0, ...valid);
  return { min, max: min === max ? min + 1 : max };
}
export function barGeometry(value, domain) {
  const span = domain.max - domain.min;
  if (!finite(value) || !finite(span) || span <= 0) return null;
  const zero = -domain.min / span * 100;
  const end = (value - domain.min) / span * 100;
  return { zero, left: Math.min(zero, end), width: Math.abs(end - zero) };
}

const preferenceKey = "msense-visualization-reading-v1";
const allIds = () => showcase.rows.map(row => row.id);
export function normalizeReading(saved = {}) {
  saved = saved && typeof saved === "object" ? saved : {};
  return {
    metric: saved.metric === "delta" ? "delta" : "share",
    sort: ["desc", "asc", "source"].includes(saved.sort) ? saved.sort : "desc",
    visible: Array.isArray(saved.visible) ? allIds().filter(id => saved.visible.includes(id)) : allIds(),
    transposed: saved.transposed === true, dataBars: saved.dataBars !== false, selected: null
  };
}
export function readingState(view) {
  if (!view.showcase) {
    let saved;
    try { saved = JSON.parse(globalThis.localStorage?.getItem(preferenceKey) || "null"); } catch { /* Storage is optional. */ }
    view.showcase = normalizeReading(saved);
  }
  return view.showcase;
}
export function saveReading(state) {
  const { selected, ...preferences } = state;
  try { globalThis.localStorage?.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Retain in-memory preferences. */ }
}
export function visibleRows(state) {
  return showcase.rows.filter(row => state.visible.includes(row.id)).toSorted((a, b) => {
    if (state.sort === "source") return a.sourceIndex - b.sourceIndex;
    const aValue = state.metric === "share" ? contribution(a.delta) : a.delta;
    const bValue = state.metric === "share" ? contribution(b.delta) : b.delta;
    if (!finite(aValue) || !finite(bValue)) return Number(finite(bValue)) - Number(finite(aValue)) || a.sourceIndex - b.sourceIndex;
    return (state.sort === "asc" ? aValue - bValue : bValue - aValue) || a.sourceIndex - b.sourceIndex;
  });
}
