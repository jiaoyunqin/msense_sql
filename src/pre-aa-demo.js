// Explicit fictional evidence from before each demo experiment began.
// These values do not derive from post-launch treatment effects or the observation window.
export const preAAMetrics = [
  { key: "preaa_0", name: "PreAA GMV", unit: "元", digits: 2 },
  { key: "preaa_1", name: "PreAA 订单量", unit: "单", digits: 0 },
  { key: "preaa_2", name: "PreAA 支付用户数", unit: "人", digits: 0 }
];
const fixtures = {
  "DEMO-001": { period: ["2026-09-24", "2026-09-30"], groups: {
    "001-C": [1800000, 96000, 48000], "001-A": [1778200, 94450, 47420], "001-B": [1732500, 92500, 46160]
  } },
  "DEMO-002": { period: ["2026-09-26", "2026-10-02"], groups: {
    "002-C": [1128000, 69400, 31500], "002-A": [1109600, 68150, 30970]
  } },
  "DEMO-003": { period: ["2026-09-28", "2026-10-04"], groups: {
    "003-C": [386400, 32500, 11700], "003-A": [379200, 31900, 11560]
  } }
};
export function createPreAAEvidence(definition, input) {
  const fixture = fixtures[definition.id];
  if (!fixture) return null;
  return {
    period: [...fixture.period],
    records: [definition.control, ...definition.groups.filter(group => input.groupIds.includes(group.id))]
      .map(group => ({ groupId: group.id, groupName: group.name, control: group.id === definition.control.id,
        values: Object.fromEntries(preAAMetrics.map((field, index) => [field.key, fixture.groups[group.id]?.[index] ?? null])) }))
  };
}
export function preAADataset(source, result, entry) {
  const fields = preAAMetrics.filter(field => source.metricKeys.includes(field.key));
  const evidence = result.preAA;
  if (!fields.length || !evidence) return null;
  return {
    sourceId: source.id, sourceName: source.definition?.name || "PreAA指标", sourceVersion: source.version,
    mode: "pre-aa", title: "Pre AA · 实验前指标", firstColumn: "实验分组", fields,
    experimentId: entry.input.id, evidencePeriod: [...evidence.period],
    records: evidence.records.map(row => ({
      id: row.groupId, groupId: row.groupId, groupName: row.groupName, label: row.groupName, control: row.control,
      cells: fields.map(field => {
        const value = row.values[field.key];
        return { text: value == null ? "—" : `${field.unit === "元" ? "￥" : ""}${value.toLocaleString("zh-CN", { minimumFractionDigits: field.digits, maximumFractionDigits: field.digits })}`,
          raw: value, missing: value == null, reason: value == null ? "未保存该实验的 PreAA 指标" : "" };
      })
    }))
  };
}
export function preAASingleSummary(datasets) {
  const dataset = datasets.find(dataset => dataset.mode === "pre-aa");
  if (!dataset) return [];
  return [
    `PreAA 数据来自实验启动前 ${dataset.evidencePeriod.join(" 至 ")}，各组数据分别保留。`,
    ...dataset.records.filter(row => !row.control).map(row => `${row.groupName}：${dataset.fields
      .map((field, index) => `${field.name} ${row.cells[index].text}${field.unit && field.unit !== "元" ? ` ${field.unit}` : ""}`).join("；")}。`),
    "当前仅提供实验前汇总指标，未提供方差和显著性检验，不能据此判定 AA 通过。"
  ];
}
