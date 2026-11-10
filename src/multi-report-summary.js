import { experimentLabel, reportExperimentKey, reportExperimentLabel, findExperimentResult } from "./experiment-identity.js";
import { couponIntervalAcrossSummary } from "./coupon-interval-demo.js";

const coreKeys = new Set(["dac", "gmv", "roi", "cost"]);
const label = experiment => `${experiment.name}（${experimentLabel(experiment)}）`;
const unique = values => [...new Set(values.filter(Boolean))];
const percent = value => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

function summaryModules(modules) {
  return modules.map(module => {
    if (!module.comparison) return module;
    return { ...module, conclusions: [], experiments: module.experiments.map(experiment => {
      const datasets = module.comparison.datasets.flatMap(dataset => {
        const columns = dataset.columns.filter(column => column.experimentId === experiment.id);
        if (!columns.length) return [];
        return [{ ...dataset, calculated: dataset.mode.startsWith("calculated:"), records: columns.map(column => ({
          groupId: column.groupId, groupName: column.groupName, control: column.control, label: column.groupName,
          cells: dataset.fields.map(field => {
            const cell = column.cells[field.key], missing = cell.status !== "value";
            return { text: missing ? "—" : `${field.unit === "元" ? "￥" : ""}${cell.value.toLocaleString("zh-CN", {
              minimumFractionDigits: field.digits, maximumFractionDigits: field.digits,
              style: field.format === "percent" ? "percent" : "decimal" })}`,
              raw: cell.value, missing, reason: cell.reason, uplift: cell.uplift, sig: cell.sig };
          })
        })) }];
      });
      return { ...experiment, datasets, gaps: unique([...experiment.gaps, ...module.comparison.issues]),
        status: experiment.status === "success" && !datasets.length ? "unavailable" : experiment.status };
    }) };
  });
}

// Read only the datasets produced from this report's frozen configuration/results.
// In particular, a raw result can contain metrics that the report never selected.
function coreEvidence(modules) {
  const experiments = new Map();
  for (const module of modules) for (const experiment of module.experiments) {
    if (experiment.status !== "success") continue;
    for (const dataset of experiment.datasets.filter(dataset => dataset.mode === "overall" && !dataset.calculated)) {
      for (const record of dataset.records.filter(record => !record.control)) {
        const fields = dataset.fields.flatMap((field, index) => coreKeys.has(field.key)
          ? [{ field, cell: record.cells[index] }] : []);
        if (!fields.length) continue;
        const entry = experiments.get(experiment.id) || { experiment, groups: new Map() };
        const group = entry.groups.get(record.groupId) || { name: record.groupName, values: new Map() };
        for (const value of fields) if (!group.values.has(value.field.key)) group.values.set(value.field.key, value);
        entry.groups.set(record.groupId, group);
        experiments.set(experiment.id, entry);
      }
    }
  }
  return [...experiments.values()];
}
function metricOverview(evidence, key) {
  const entries = evidence.map(entry => [...entry.groups.values()].flatMap(group => {
    const value = group.values.get(key);
    return value ? [value] : [];
  })).filter(values => values.some(value => !value.cell.missing));
  if (!entries.length) return "";
  const name = entries[0][0].field.name;
  const positive = entries.filter(values => values.some(value => !value.cell.missing && value.cell.sig === "正向显著")).length;
  const negative = entries.filter(values => values.some(value => !value.cell.missing && value.cell.sig === "负向显著")).length;
  const insignificant = entries.filter(values => values.every(value => !value.cell.missing && value.cell.sig === "不显著")).length;
  const detail = [positive && `${positive} 个实验存在正向显著策略组`,
    negative && `${negative} 个实验存在负向显著策略组`, insignificant && `${insignificant} 个实验的策略组均不显著`].filter(Boolean);
  return detail.length ? `${name}方面，${detail.join("，")}。` : "";
}
function coreDetails(entry) {
  return `${label(entry.experiment)}：${[...entry.groups.values()].map(group =>
    `${group.name}（${[...group.values.values()].map(({ field, cell }) => {
      if (cell.missing) return `${field.name}缺失${cell.reason ? `：${cell.reason}` : ""}`;
      if (field.uplift && cell.uplift != null)
        return `${field.name}增幅 ${percent(cell.uplift)}${cell.sig ? `，${cell.sig}` : ""}`;
      return `${field.name} ${cell.text}${field.unit && field.unit !== "元" ? ` ${field.unit}` : ""}`;
    }).join("；")}）`
  ).join("；")}。`;
}
function moduleHighlights(module) {
  const successful = module.experiments.filter(experiment => experiment.status === "success");
  const intervals = couponIntervalAcrossSummary(successful);
  const highlights = [];
  if (intervals.length) highlights.push(intervals.find(text => text.startsWith("当前样本中")) || intervals[0]);
  const preAA = successful.filter(experiment => experiment.datasets.some(dataset => dataset.mode === "pre-aa"));
  if (preAA.length) highlights.push(`已保留 ${preAA.length} 个实验的实验前指标。当前仅提供汇总数据，未提供方差和显著性检验，不能据此判定 AA 通过。`);
  const layered = successful.filter(experiment => experiment.datasets.some(dataset => dataset.mode === "demo-spend"));
  if (layered.length) {
    const uplift = layered.some(experiment => experiment.datasets.some(dataset =>
      dataset.mode === "demo-spend" && dataset.fields.some(field => field.uplift)));
    highlights.push(`已保留 ${layered.length} 个实验的消费力分层数据${uplift
      ? "，各分层相对该实验自身同层对照组计算增幅；未提供分层显著性。" : "，具体指标结果见模块数据明细。"}`);
  }
  const calculated = successful.flatMap(experiment => experiment.datasets.filter(dataset => dataset.calculated && !dataset.dimensioned)
    .flatMap(dataset => dataset.records.filter(record => !record.control).map(record =>
      `${label(experiment)} / ${record.groupName}：${dataset.fields.map((field, index) =>
        `${field.name} ${record.cells[index].text}${record.cells[index].reason ? `（${record.cells[index].reason}）` : ""}`).join("；")}。`)));
  if (calculated.length) highlights.push(...calculated, "计算指标使用各实验已保存的计算结果，未附加显著性。");
  if (!highlights.length && !successful.some(experiment => experiment.datasets.some(dataset => dataset.mode === "overall"))) {
    highlights.push(!successful.length ? "当前模块没有可用数据，暂未形成分析结论。"
      : module.conclusions[0]?.text || `已保留 ${successful.length} 个实验的 ${unique(successful.flatMap(experiment => experiment.datasets.map(dataset => dataset.title))).join("、")}，具体结果见模块数据明细。`);
  }
  return highlights;
}
export function buildMultiReportSummary(report, modules) {
  if (report.summary?.lead || report.summary?.blocks?.length)
    return { ...report.summary, id: report.summary.id || "report-summary", title: "实验核心结论" };
  modules = summaryModules(modules);
  const evidence = coreEvidence(modules);
  const count = report.snapshot.experiments.length;
  const success = report.snapshot.experiments.filter(entry =>
    findExperimentResult(report.results, entry, report.snapshot)?.status === "success").length;
  const overview = ["dac", "gmv"].map(key => metricOverview(evidence, key)).filter(Boolean).join("");
  const blocks = [];
  if (evidence.length) blocks.push({ h: "整体效果与钱效", list: evidence.map(coreDetails) });
  for (const module of modules) {
    const list = moduleHighlights(module);
    if (list.length) blocks.push({ h: module.title, list });
  }
  const missing = [];
  for (const entry of report.snapshot.experiments) {
    const result = findExperimentResult(report.results, entry, report.snapshot);
    if (result?.status !== "success") missing.push(
      `${entry.definition.name}（${reportExperimentLabel(report.snapshot, entry)}）：${result?.error || "未保存已完成的实验数据"}。`);
    const id = reportExperimentKey(report.snapshot, entry);
    for (const module of modules) {
      const experiment = module.experiments.find(experiment => experiment.id === id);
      if (!experiment || result?.status !== "success") continue;
      const reasons = unique([experiment.status !== "success" && experiment.error, ...experiment.gaps,
        ...experiment.datasets.flatMap(dataset => dataset.records.flatMap(record => record.cells
          .filter(cell => cell.missing && !record.control).map(cell => cell.reason || "部分指标未提供数据")))]);
      if (reasons.length) missing.push(`${label(experiment)} / ${module.title}：${reasons.join("；")}。`);
    }
  }
  if (missing.length) blocks.push({ h: "数据完整性", list: missing });
  if (evidence.some(entry => [...entry.groups.values()].some(group => ["dac", "gmv"].some(key => group.values.get(key)?.cell.uplift != null))))
    blocks.push({ text: "增幅均相对各实验自身对照组，显著性沿用该实验已保存结果。不同实验的人群、策略与观察窗口不同，不能据此推断跨实验显著性或直接确定最优策略。" });
  return { id: "report-summary", title: "实验核心结论",
    lead: `本报告覆盖 ${count} 个实验、${modules.length} 个分析模块，${success} 个实验已取得数据。${overview || (success ? "核心结论按各模块已保存的结果汇总。" : "当前没有可用实验结果，暂未形成效果结论。")}`,
    blocks };
}
