// Fictional report evidence. Overall quantiles are saved independently of batch quantiles.
export const couponIntervalCapability = "demo-coupon-interval";
export const couponIntervalModes = ["interval-overall", "interval-batch"];
export const couponIntervalMetrics = [
  ["mean", "均值"], ["p10", "P10"], ["p25", "P25"], ["p50", "P50"], ["p75", "P75"], ["p90", "P90"]
].map(([key, label]) => ({ key: `interval_${key}`, name: `领券核销间隔${label}`, unit: "小时", digits: 2,
  description: key === "mean" ? "已核销优惠券从领取到核销的平均间隔。"
    : `${label.slice(1)}% 的已核销优惠券在此间隔内完成核销；按每个实验、策略组的原始样本分别统计。` }));

const fixtures = {
  "001-A": {
    overall: [4.73, .04, .20, 2.13, 8.08, 13.18],
    batches: [[4.62, .04, .09, 1.23, 7.82, 13.15], [5.01, .04, .28, 2.88, 8.57, 12.94],
      [4.45, .03, .12, 1.66, 7.72, 12.74], [4.36, .04, .13, 1.14, 7.80, 13.04],
      [4.74, .04, .19, 2.11, 8.12, 13.26], [6.04, .10, .55, 4.34, 9.82, 14.06]]
  },
  "001-B": {
    overall: [4.70, .04, .19, 2.14, 7.95, 13.15],
    batches: [[5.03, .04, .16, 2.25, 8.05, 13.30], [4.82, .04, .25, 2.42, 8.12, 12.86],
      [4.61, .03, .14, 1.82, 7.88, 12.90], [4.30, .04, .11, 1.08, 7.70, 12.88],
      [4.69, .04, .18, 2.09, 8.04, 13.12], [5.68, .08, .47, 3.21, 9.20, 13.92]]
  },
  "002-A": {
    overall: [8.65, .08, .52, 4.26, 14.32, 19.80],
    batches: [[7.82, .07, .38, 3.64, 12.52, 18.72], [8.14, .08, .42, 3.82, 13.36, 19.26],
      [9.36, .10, .61, 4.85, 15.42, 21.84], [8.72, .09, .54, 4.32, 14.08, 20.06],
      [10.24, .12, .76, 5.62, 16.98, 23.40], [7.56, .06, .34, 3.21, 12.16, 18.10]]
  },
  "003-A": {
    overall: [2.84, .03, .16, 1.06, 4.72, 7.62],
    batches: [[2.25, .02, .10, .72, 3.58, 6.24], [2.64, .03, .14, .96, 4.38, 7.10],
      [3.28, .04, .22, 1.42, 5.42, 8.82], [2.76, .03, .16, 1.02, 4.72, 7.44],
      [3.42, .04, .24, 1.56, 5.66, 9.16], [2.38, .02, .12, .84, 3.98, 6.62]]
  }
};
const couponNames = {
  "DEMO-001": ["食品复购券", "饮料周期购券", "生鲜复购券", "水果周期购券", "休闲食品券", "老客复购专享券"],
  "DEMO-002": ["纸品囤货券", "家居清洁券", "洗护补货券", "厨房日用券", "收纳好物券", "个人护理券"],
  "DEMO-003": ["食品唤回券", "日用唤回券", "服饰唤回券", "商城复购券", "家居唤回券", "老朋友专享券"]
};
const values = stats => Object.fromEntries(couponIntervalMetrics.map((field, i) => [field.key, stats[i]]));
export function createCouponIntervalEvidence(definition) {
  const names = couponNames[definition.id];
  if (!names) return null;
  return {
    overall: definition.groups.filter(group => fixtures[group.id]).map(group =>
      ({ groupId: group.id, values: values(fixtures[group.id].overall) })),
    batches: definition.groups.filter(group => fixtures[group.id]).flatMap(group =>
      fixtures[group.id].batches.map((stats, index) => ({
        groupId: group.id, batchId: `MOCK-${group.id}-${String(index + 1).padStart(2, "0")}`, couponName: names[index],
        strategy: { ...definition.strategy, ...group.strategy,
          ...(definition.id === "DEMO-003" ? { coupon: index < 3 ? "满 29 减 3" : "满 59 减 6" } : {}) },
        values: values(stats)
      })))
  };
}
const batchFields = [
  ["batchId", "券批次"], ["couponName", "券名称"], ["coupon", "发券面额"], ["validity", "发券时效"],
  ["range", "券可用范围"], ["count", "领取次数"], ["placement", "发券点位"]
].map(([key, name]) => ({ key, name, unit: "" }));
export function couponIntervalDataset(source, result, entry, mode) {
  const metrics = couponIntervalMetrics.filter(field => source.metricKeys.includes(field.key));
  const evidence = result.couponIntervals;
  if (!metrics.length || !evidence || !couponIntervalModes.includes(mode)) return null;
  const overall = mode === "interval-overall";
  const fields = [...(overall ? [{ key: "overall", name: "整体", unit: "" }] : batchFields), ...metrics];
  const groups = new Map(entry.definition.groups.map(group => [group.id, group.name]));
  const records = (overall ? evidence.overall : evidence.batches)
    .filter(row => entry.input.groupIds.includes(row.groupId) && groups.has(row.groupId))
    .map(row => ({
      id: overall ? row.groupId : row.batchId, groupId: row.groupId, groupName: groups.get(row.groupId),
      label: groups.get(row.groupId), batchId: row.batchId, couponName: row.couponName,
      cells: fields.map(field => {
        if (!field.key.startsWith("interval_")) return {
          text: overall ? "整体" : row[field.key] ?? row.strategy[field.key] ?? "—"
        };
        const raw = row.values[field.key];
        return { text: raw == null ? "—" : `${raw.toFixed(2)} 小时`, raw,
          missing: raw == null, reason: raw == null ? "未提供该间隔统计值" : "" };
      })
    }));
  if (!records.length) return null;
  return { sourceId: source.id, sourceName: source.definition?.name || "领券核销间隔分布（模拟）",
    sourceVersion: source.version, mode, title: `领券核销间隔分布（${overall ? "整体" : "券批次ID"}）`,
    firstColumn: "实验分组", fields, records, experimentId: entry.input.id };
}

const rawValue = (dataset, record, key) => record.cells[dataset.fields.findIndex(field => field.key === key)]?.raw;
const hours = value => `${value.toFixed(2)} 小时`;
function overallSummary(dataset, row) {
  return ["interval_mean", "interval_p50", "interval_p90"].flatMap(key => {
    const value = rawValue(dataset, row, key);
    return value == null ? [] : [`${key === "interval_mean" ? "均值" : key.slice(9).toUpperCase()} ${hours(value)}`];
  }).join("，");
}
function batchRange(dataset, groupId) {
  const rows = dataset.records.filter(row => (!groupId || row.groupId === groupId)
    && rawValue(dataset, row, "interval_p50") != null)
    .sort((a, b) => rawValue(dataset, a, "interval_p50") - rawValue(dataset, b, "interval_p50"));
  return rows.length ? { fastest: rows[0], slowest: rows.at(-1),
    min: rawValue(dataset, rows[0], "interval_p50"), max: rawValue(dataset, rows.at(-1), "interval_p50") } : null;
}
export function couponIntervalSingleSummary(datasets) {
  const overall = datasets.find(dataset => dataset.mode === "interval-overall");
  const batches = datasets.find(dataset => dataset.mode === "interval-batch");
  const messages = [];
  for (const row of overall?.records || []) {
    const summary = overallSummary(overall, row);
    if (summary) messages.push(`${row.groupName}：${summary}。`);
  }
  if (overall?.records.length === 2) {
    const means = overall.records.map(row => rawValue(overall, row, "interval_mean"));
    const medians = overall.records.map(row => rawValue(overall, row, "interval_p50"));
    if ([...means, ...medians].every(value => value != null)) messages.push(
      `两组整体均值相差 ${hours(Math.abs(means[0] - means[1]))}，P50 相差 ${hours(Math.abs(medians[0] - medians[1]))}；整体时效接近，需继续按券批次核对，未做显著性判定。`);
  }
  if (batches) for (const [groupId, groupName] of new Map(batches.records.map(row => [row.groupId, row.groupName]))) {
    const range = batchRange(batches, groupId);
    if (range) messages.push(`${groupName}：${new Set(batches.records.filter(row => row.groupId === groupId).map(row => row.batchId)).size} 个券批次中，`
      + `${range.fastest.couponName}（${range.fastest.batchId}）P50 最短，为 ${hours(range.min)}；`
      + `${range.slowest.couponName}（${range.slowest.batchId}）P50 最长，为 ${hours(range.max)}。批次配置与完整分位数见下方明细。`);
  }
  return messages;
}
export function couponIntervalAcrossSummary(experiments) {
  const evidence = experiments.filter(experiment => experiment.status === "success").map(experiment => ({
    experiment, overall: experiment.datasets.find(dataset => dataset.mode === "interval-overall"),
    batches: experiment.datasets.find(dataset => dataset.mode === "interval-batch")
  })).filter(item => item.overall || item.batches);
  if (!evidence.length) return [];
  if (evidence.length < 2) return ["本模块可用的核销间隔数据不足两个实验，暂不形成跨实验比较。"];
  const messages = [];
  const summaries = evidence.filter(item => item.overall).map(({ experiment, overall }) =>
    `${experiment.id}（${experiment.name}）：${overall.records.map(row => `${row.groupName} ${overallSummary(overall, row)}`).join("；")}`);
  if (summaries.length) messages.push(`整体核销时效：${summaries.join("。")}。`);
  const means = evidence.flatMap(({ experiment, overall }) => (overall?.records || []).map(row =>
    ({ experiment, row, mean: rawValue(overall, row, "interval_mean") }))).filter(item => item.mean != null)
    .sort((a, b) => a.mean - b.mean);
  if (new Set(means.map(item => item.experiment.id)).size > 1) {
    const fastest = means[0], slowest = means.at(-1);
    messages.push(`当前样本中，${fastest.experiment.id} 的${fastest.row.groupName}平均核销间隔最短（${hours(fastest.mean)}），`
      + `${slowest.experiment.id} 的${slowest.row.groupName}最长（${hours(slowest.mean)}）。各实验的券时效、人群和观察窗口不同，该排序仅描述已核销样本的时效。`);
  }
  const ranges = evidence.filter(item => item.batches).flatMap(({ experiment, batches }) => {
    const range = batchRange(batches);
    return range ? [`${experiment.id} 各批次 P50 为 ${hours(range.min)} 至 ${hours(range.max)}`] : [];
  });
  if (ranges.length) messages.push(`券批次差异：${ranges.join("；")}。建议切换实验查看具体批次，避免用整体均值替代批次判断。`);
  messages.push("未发券对照组不参与领券核销间隔统计。间隔更短表示已核销优惠券更快完成使用，不能直接推断转化增量或钱效更高；本模块未提供显著性检验。");
  return messages;
}
