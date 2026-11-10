import { comparisonMetrics, strategyFields, formatMetric, comparisonBoundaries, copy,
  demoExperiments, experimentInput, deriveGroup, deriveBreakdowns } from "./multi-experiment-data.js";
import { formatCalculatedValue, computeModuleCalculations, comparisonCalculationRecords } from "./analysis-module-calculation-runtime.js";
import { calculationMetricRef } from "./analysis-module-calculations.js";
import { couponIntervalCapability, couponIntervalModes, couponIntervalMetrics, createCouponIntervalEvidence,
  couponIntervalDataset, couponIntervalSingleSummary, couponIntervalAcrossSummary } from "./coupon-interval-demo.js";
import { preAAMetrics, createPreAAEvidence, preAADataset, preAASingleSummary } from "./pre-aa-demo.js";
import { captureMatrixSnapshot, matrixPresentation } from "./matrix-report-data.js";
import { findExperimentResult, reportExperimentKey, reportExperimentLabel, experimentLabel, selectedCandidateId } from "./experiment-identity.js";
import { applyModuleDatasetOrder } from "./analysis-module-report-order.js";

const metric = key => comparisonMetrics.find(field => field.key === key);
const fmt = (value, key) => formatMetric(value, metric(key) || { digits: 2 });
const lift = value => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
export const moduleScope = index => `mm-${index}`;
export const singleScope = (index, experimentId) => `${moduleScope(index)}-exp-${experimentId}`;
export const datasetScope = (index, datasetIndex, experimentId = "") =>
  `${experimentId ? singleScope(index, experimentId) : moduleScope(index)}-data-${datasetIndex}`;
const numericCell = (value, field, suffix = "") => ({
  text: value == null ? "—" : `${field.unit === "元" ? "￥" : ""}${formatMetric(value, field)}${suffix}`,
  missing: value == null, reason: value == null ? "未提供数据" : ""
});
function metricCell(row, field) {
  const value = row.values[field.key];
  return { ...numericCell(value.value, field), reason: value.reason || "",
    uplift: field.uplift ? value.uplift : undefined, sig: field.uplift ? value.sig : "",
    raw: value.value, control: row.raw[field.key === "dac" ? "controlDac" : "controlGmv"] };
}
function coreDataset(source, result, entry, mode) {
  const fields = comparisonMetrics.filter(field => source.metricKeys.includes(field.key));
  if (!fields.length) return null;
  const overall = mode === "overall", rows = overall ? result.rows || [] : result.breakdowns || [];
  const title = overall ? "核心指标 · 整体" : "核心指标 · 消费力分层";
  const records = rows.map(row => ({
    id: `${row.groupId}-${row.dimension || "overall"}`, groupId: row.groupId, groupName: row.groupName,
    label: overall ? row.groupName : row.dimension,
    cells: fields.map(field => metricCell(row, field))
  }));
  if (overall && rows.length) {
    const row = rows[0];
    records.unshift({ id: row.controlId, groupId: row.controlId, groupName: row.controlName,
      label: row.controlName, control: true, cells: fields.map(field => {
        if (field.key === "dac" || field.key === "gmv")
          return numericCell(row.raw[field.key === "dac" ? "controlDac" : "controlGmv"], field);
        return { text: "—", missing: true, reason: "该增量 / 成本指标仅适用于策略组" };
      }) });
  }
  return { sourceId: source.id, sourceName: source.definition?.name || "独立实验核心指标（模拟）",
    sourceVersion: source.version, mode, title, firstColumn: overall ? "实验分组" : "消费力分层",
    fields, records, experimentId: entry.reportKey || entry.input.id };
}
function backgroundDataset(source, result, entry) {
  const definition = source.definition;
  const selection = [
    ["experiment_0", "period", "实验时间"], ["experiment_1", "traffic", "实验流量"],
    ["experiment_2", "coupon", "发券面额"], ["experiment_3", "validity", "发券时效"],
    ["experiment_4", "range", "券可用范围"], ["experiment_5", "count", "领取次数"],
    ["experiment_6", "placement", "发券点位"]
  ].filter(([key]) => source.metricKeys.includes(key));
  if (!selection.length) return null;
  const rows = result.rows || [], fields = selection.map(([key, strategyKey, name]) => ({ key, strategyKey, name, unit: "" }));
  const control = entry.definition.control;
  const records = [{ id: control.id, groupId: control.id, groupName: control.name, label: control.name, control: true,
    cells: fields.map(field => ({ text: field.strategyKey === "period" ? entry.definition.period.join(" 至 ")
      : field.strategyKey === "traffic" ? entry.definition.strategy.traffic || "未提供" : "—", reason: "对照组未发券" })) },
  ...rows.map(row => ({ id: row.groupId, groupId: row.groupId, groupName: row.groupName, label: row.groupName,
    cells: fields.map(field => ({ text: field.strategyKey === "period" ? entry.definition.period.join(" 至 ") : row.strategy[field.strategyKey] || "未提供" })) }))];
  return { sourceId: source.id, sourceName: definition?.name || "实验背景与配置", sourceVersion: source.version,
    mode: "strategy", title: "实验背景与配置", firstColumn: "实验分组", fields, records, experimentId: entry.reportKey || entry.input.id };
}
function calculatedDataset(record, entry, version) {
  const fields = record.fields.filter(field => field.calculated && field.showInReport);
  if (!fields.length) return null;
  const dimensions = record.fields.filter(field => field.role === "dimension");
  return { calculated: true, sourceId: "module-calculations", sourceName: "当前分析模块计算结果",
    sourceVersion: version, mode: `calculated:${record.modeId}`, title: record.modeName,
    firstColumn: dimensions.length ? dimensions.map(field => field.name).join(" × ") : "实验分组",
    dimensioned: dimensions.length > 0, fields, experimentId: entry.reportKey || entry.input.id,
    records: record.rawRows.map((row, index) => ({
      id: `calculated-${index}`, groupId: row.group_id, groupName: row.group_name, control: row.is_control === 1,
      label: dimensions.length ? dimensions.map(field => field.valueLabels?.[row[field.alias]] ?? row[field.alias] ?? "—").join(" × ") : row.group_name,
      cells: fields.map(field => ({ text: formatCalculatedValue(row[field.alias], field), raw: row[field.alias],
        missing: row[field.alias] === null, reason: row.calculationReasons?.[field.key] || "" }))
    })) };
}
function moduleMetrics(module, mode = null) {
  return comparisonMetrics.filter(field => module.configuration.sources.some(source =>
    source.showInReport && source.capabilityId === "demo-comparison" && source.metricKeys.includes(field.key)
    && (!mode || source.dimensionKeys.includes(mode))));
}
function summarizeSingle(module, entry, result, datasets, index) {
  const fields = moduleMetrics(module, "overall"), breakdownFields = moduleMetrics(module, "demo-spend"), rows = result.rows || [];
  const scope = singleScope(index, entry.reportKey || entry.input.id);
  if (result.status !== "success") return [];
  const messages = [];
  messages.push(...preAASingleSummary(datasets).map(text => ({ text, scope })));
  messages.push(...couponIntervalSingleSummary(datasets).map(text => ({ text, scope })));
  if (breakdownFields.length && datasets.some(dataset => dataset.mode === "demo-spend")) {
    messages.push({ text: `${entry.definition.name}包含${new Set((result.breakdowns || []).map(row => row.dimension)).size}档消费力分层；每档均对应本实验自身同一分层对照组，未提供分层显著性。`, scope });
  }
  if (fields.length) {
    for (const row of rows) {
      const details = fields.filter(field => ["dac", "gmv", "roi", "cost"].includes(field.key)).map(field => {
        const value = row.values[field.key];
        return `${field.name} ${fmt(value.value, field.key)}${field.unit ? ` ${field.unit}` : ""}${field.uplift ? `，增幅 ${lift(value.uplift)}（${value.sig}）` : ""}`;
      });
      if (details.length) messages.push({ text: `${row.groupName}：${details.join("；")}。`, scope });
    }
    if (rows.some(row => fields.some(field => row.values[field.key].value === null)))
      messages.push({ text: "部分指标未提供原始数据或无法计算，数据表保留缺失原因。", scope });
  }
  const background = datasets.find(dataset => dataset.mode === "strategy");
  if (background) {
    for (const row of background.records.filter(row => !row.control)) {
      messages.push({ text: `${row.label}：${background.fields.map((field, index) => `${field.name}为${row.cells[index].text}`).join("；")}。`,
        scope });
    }
  }
  for (const dataset of datasets.filter(dataset => dataset.calculated)) {
    for (const row of dataset.records.filter(row => !row.control)) messages.push({
      text: `${row.groupName}${dataset.dimensioned ? ` / ${row.label}` : ""}：${dataset.fields.map((field, i) =>
        `${field.name} ${row.cells[i].text}${row.cells[i].reason ? `（${row.cells[i].reason}）` : ""}`).join("；")}。计算结果未附加显著性。`,
      scope
    });
  }
  if (!messages.length && datasets.length) messages.push({ text: `已展示${datasets.length}个数据集，当前模块没有可生成结论的已配置模拟指标。`, scope });
  return messages;
}
function summarizeAcross(module, experiments, index) {
  const successful = experiments.filter(experiment => experiment.status === "success"), fields = moduleMetrics(module, "overall");
  if (successful.length < 2) return [{ text: "当前模块可用实验不足两个，暂不形成跨实验比较；可查看已有实验数据。", scope: moduleScope(index) }];
  const messages = [];
  messages.push(...couponIntervalAcrossSummary(experiments).map(text => ({ text, scope: moduleScope(index) })));
  for (const field of fields.filter(field => ["dac", "roi", "cost"].includes(field.key))) {
    messages.push({ text: successful.map(experiment => `${experimentLabel(experiment)}（${experiment.name}）：${experiment.rows.map(row => {
      const value = row.values[field.key];
      return `${row.groupName} ${field.uplift ? `增幅 ${lift(value.uplift)}（${value.sig}）` : fmt(value.value, field.key) + (field.unit ? ` ${field.unit}` : "")}`;
    }).join("、")}`).join("；") + `。${field.uplift ? "增幅均相对各实验自身对照组。" : `以上为${field.name}的逐实验结果。`}`,
    scope: moduleScope(index), metricKey: field.key });
  }
  if (!fields.length && successful.some(experiment => experiment.datasets.some(dataset => dataset.mode === "demo-spend"))) {
    messages.push({ text: successful.map(experiment => {
      const datasets = experiment.datasets.filter(dataset => dataset.mode === "demo-spend");
      const dimensions = [...new Set(datasets.flatMap(dataset => dataset.records.map(row => row.label)))];
      return `${experimentLabel(experiment)}（${experiment.name}）：${dimensions.join("、") || "未提供分层数据"}`;
    }).join("；") + "。本模块只配置分层数据；请切换实验核对各分层原值与自身对照组增幅，未提供分层显著性。",
    scope: moduleScope(index) });
  }
  const hasBackground = successful.some(experiment => experiment.datasets.some(dataset => dataset.mode === "strategy"));
  if (hasBackground) messages.push({ text: successful.map(experiment => {
    const dataset = experiment.datasets.find(dataset => dataset.mode === "strategy");
    return `${experimentLabel(experiment)}：${dataset?.records.filter(row => !row.control).map(row =>
      `${row.label}（${dataset.fields.map((field, i) => `${field.name}：${row.cells[i].text}`).join("；")}）`).join("；") || "未提供配置"}`;
  }).join("。") + "。配置不同仅描述策略差异，不能直接据此确定因果。", scope: moduleScope(index) });
  const calculated = successful.filter(experiment => experiment.datasets.some(dataset => dataset.calculated));
  if (calculated.length) messages.push({ text: calculated.map(experiment =>
    `${experimentLabel(experiment)}：${experiment.datasets.filter(dataset => dataset.calculated && !dataset.dimensioned).flatMap(dataset =>
      dataset.records.filter(row => !row.control).map(row => `${row.groupName}（${dataset.fields.map((field, i) =>
        `${field.name} ${row.cells[i].text}`).join("；")}）`)).join("；") || "计算结果见分层明细"}`
  ).join("。") + "。各实验分别计算，请在数据明细中核对；未跨实验混算或推断显著性。", scope: moduleScope(index) });
  if (!messages.length) messages.push({ text: `本模块已保留 ${successful.length} 个实验的数据，具体结果见本模块数据明细。`, scope: moduleScope(index) });
  return messages;
}
export function buildReportModules(report) {
  return report.snapshot.modules.map((module, index) => {
    const chapter = report.snapshot.template.sections[index];
    const sources = module.configuration.sources.filter(source => source.showInReport);
    const experiments = report.snapshot.experiments.map(savedEntry => {
      const id = reportExperimentKey(report.snapshot, savedEntry);
      const entry = id === savedEntry.input.id ? savedEntry : { ...savedEntry, reportKey: id };
      const result = findExperimentResult(report.results, entry, report.snapshot) || { status: "failed", error: "未保存该实验的数据" };
      let datasets = [];
      const gaps = [];
      if (result.status === "success") for (const source of sources) {
        if (source.capabilityId === "demo-comparison") {
          for (const mode of source.dimensionKeys.filter(mode => ["overall", "demo-spend"].includes(mode))) {
            const dataset = coreDataset(source, result, entry, mode);
            if (dataset) datasets.push(dataset);
          }
          if (source.dimensionKeys.some(mode => !["overall", "demo-spend"].includes(mode))) gaps.push("部分粒度尚无模拟数据。");
        } else if (source.capabilityId === "experiment-config") {
          const dataset = backgroundDataset(source, result, entry);
          if (dataset) datasets.push(dataset);
        } else if (source.capabilityId === "pre-aa") {
          const dataset = preAADataset(source, result, entry);
          if (dataset) datasets.push(dataset);
          else gaps.push("本次快照未保存该实验的 PreAA 数据，未使用实验后数据补算。");
        } else if (source.capabilityId === couponIntervalCapability) {
          for (const mode of source.dimensionKeys.filter(mode => couponIntervalModes.includes(mode))) {
            const dataset = couponIntervalDataset(source, result, entry, mode);
            if (dataset) datasets.push(dataset);
          }
          if (!result.couponIntervals) gaps.push("本次快照未保存领券核销间隔数据。");
        } else gaps.push(`${source.definition?.name || source.capabilityId}未接入本次模拟数据，未用其他能力数据替代。`);
      }
      if (result.status === "success" && module.configuration.calculatedMetrics?.length) {
        const saved = result.moduleCalculations?.[module.id];
        if (!saved) gaps.push("本次历史快照未保存计算结果，未使用当前草稿补算。");
        else {
          gaps.push(...saved.issues.map(issue => issue.message));
          for (const record of saved.records) {
            const dataset = calculatedDataset(record, entry, module.version);
            if (dataset) datasets.push(dataset);
          }
        }
      }
      datasets = applyModuleDatasetOrder(module.configuration, datasets);
      const status = result.status === "success" && !datasets.length ? "unavailable" : result.status;
      const conclusions = summarizeSingle(module, entry, result, datasets, index);
      if (entry.reportKey) datasets.forEach(dataset => { dataset.experimentId = id; });
      return { id,
        ...(entry.reportKey ? { libraId: entry.input.id, qxExperimentId: selectedCandidateId(entry.input, entry.definition),
          label: reportExperimentLabel(report.snapshot, entry) } : {}),
        name: entry.definition.name, input: entry.input, definition: entry.definition,
        status, error: result.error || (status === "unavailable" ? "本模块没有可展示的已配置数据集。" : ""),
        datasets, gaps, rows: result.status === "success" ? result.rows || [] : [], conclusions };
    });
    const analysisType = module.configuration.analysisType || "single";
    return { index, id: moduleScope(index), moduleId: module.id, version: module.version, analysisType,
      title: module.configuration.name || chapter.title, chapterTitle: chapter.title,
      description: module.configuration.description || "", configuration: module.configuration,
      experiments, conclusions: analysisType === "multi" ? summarizeAcross(module, experiments, index) : [],
      boundaries: comparisonBoundaries(report.snapshot, report.results),
      datasetCount: Math.max(0, ...experiments.map(experiment => experiment.datasets.length)) };
  });
}
export function moduleView(view, module) {
  view.modules ||= {};
  const state = view.modules[module.id] ||= { experimentId: module.experiments.find(e => e.status === "success")?.id || module.experiments[0]?.id, tables: {} };
  state.tables ||= {};
  return state;
}
export function demoModuleReport() {
  const sources = [
    { id: "demo-core-source", capabilityId: "demo-comparison", kind: "rpc", version: 1,
      definition: { id: "demo-comparison", name: "独立实验核心指标（模拟）",
        metrics: comparisonMetrics.map(field => ({ ...field, type: "number", role: "metric" })),
        dimensions: [{ key: "overall", name: "整体" }, { key: "demo-spend", name: "消费力分层" }] }, showInReport: true,
      metricKeys: comparisonMetrics.map(field => field.key), dimensionKeys: ["overall", "demo-spend"] },
    { id: "demo-interval-source", capabilityId: couponIntervalCapability, kind: "rpc", version: 1,
      definition: { name: "领券核销间隔分布（模拟）",
        metrics: couponIntervalMetrics.map(field => ({ ...field, type: "number", role: "metric" })),
        dimensions: [{ key: "interval-overall", name: "整体" }, { key: "interval-batch", name: "券批次ID" }] },
      showInReport: true, metricKeys: couponIntervalMetrics.map(field => field.key), dimensionKeys: [...couponIntervalModes] }
  ];
  const modules = [
    { id: "multi-core", version: 1, configuration: { name: "核心指标表现", description: "比较支付频次、增量贡献与补贴成本",
      sources: [sources[0]], analysisType: "multi", reasoning: "分别核对实验自身对照组，比较指标增幅、ROI 与成本，再结合分层查看来源。",
      considerations: "不同人群与观察期不能直接得出跨实验显著性。" } },
    { id: "multi-coupon-interval", version: 1, configuration: { name: "领券核销间隔分布", description: "比较各实验从领券到核销的时效，按整体与券批次查看分布。",
      sources: [sources[1]], analysisType: "multi",
      reasoning: "先比较各实验、策略组的均值及 P10 / P25 / P50 / P75 / P90，再按券批次定位核销时效差异。统计单位为已核销优惠券，间隔单位为小时。",
      considerations: "仅统计观察窗口内已核销优惠券，未核销券不进入间隔分布，未发券对照组不参与比较。实验人群、券时效与观察窗口不同，间隔更短不能直接推断转化增量更大。",
      statisticsNotes: ["均值及各分位数按实验、策略组和券批次分别统计；整体分位数不能由各券批次分位数直接取平均。",
        "仅统计观察窗口内已核销优惠券；未核销券及未发券对照组不进入间隔分布。",
        "本模块为固定模拟数据，未提供核销间隔显著性检验；不能仅凭间隔判断策略因果、增量或钱效。"] } }
  ];
  modules[0].configuration.calculatedMetrics = [{ schemaVersion: 1, key: "demo-gmv-per-dac", name: "每支付天 GMV",
    formula: { operator: "/", left: calculationMetricRef(sources[0], "gmv"), right: calculationMetricRef(sources[0], "dac") },
    format: "number", precision: 2, showInReport: true }];
  const experiments = demoExperiments.map(definition => ({ input: experimentInput(definition.id), definition: copy(definition) }));
  const results = experiments.map(({ input, definition }) => {
    const result = { id: input.id, status: "success", rows: definition.groups.map(group => deriveGroup(definition, input, group)),
      breakdowns: deriveBreakdowns(definition, input), couponIntervals: createCouponIntervalEvidence(definition), moduleCalculations: {} };
    result.moduleCalculations[modules[0].id] = computeModuleCalculations(modules[0].configuration,
      comparisonCalculationRecords(modules[0].configuration, result, { input, definition }));
    return result;
  });
  return { id: "r-multi-modules", createdAt: "2026-11-08T09:00:00+08:00", taskId: "", private: false, status: "success",
    snapshot: { analysisType: "multi", goal: "平台老客提频", templateId: "demo-module-report", templateVersion: 1,
      template: { name: "老客提频 · 多实验分析报告", description: "逐模块查看多实验分析结论与数据明细。",
        sections: modules.map((module, i) => ({ moduleId: module.id, version: 1, title: module.configuration.name, kind: i ? "detail" : "overall" })) },
      modules, experiments, supplement: "" },
    results };
}
export function demoMixedModuleReport() {
  const report = demoModuleReport();
  report.snapshot.modules = report.snapshot.modules.slice(0, 1);
  report.snapshot.template.sections = report.snapshot.template.sections.slice(0, 1);
  const source = { id: "demo-pre-aa-source", capabilityId: "pre-aa", kind: "rpc", version: 1,
    definition: { id: "pre-aa", name: "PreAA指标", metrics: preAAMetrics, dimensions: [] },
    metricKeys: preAAMetrics.map(field => field.key), dimensionKeys: [], showInReport: true };
  const module = { id: "preaa", version: 1, configuration: {
    name: "Pre AA", description: "分别核对每个实验启动前的各组指标。",
    analysisType: "single", sources: [source], reasoning: "按实验分别保留实验前指标，核对各组数据。",
    considerations: "只有汇总数据，未提供方差与显著性检验，不能判定 AA 通过。"
  } };
  report.id = "r-mixed-modules";
  report.snapshot.templateId = "demo-mixed-report";
  report.snapshot.template.name = "多实验分析 · PreAA 与核心表现";
  report.snapshot.template.analysisType = "multi";
  report.snapshot.modules.unshift(module);
  report.snapshot.template.sections.unshift({ moduleId: module.id, version: 1, title: module.configuration.name, kind: "overall" });
  for (const entry of report.snapshot.experiments) {
    entry.definition.preAA = createPreAAEvidence(entry.definition, entry.input);
    report.results.find(result => result.id === entry.input.id).preAA = copy(entry.definition.preAA);
  }
  return report;
}
export function demoMatrixModuleReport() {
  const report = demoModuleReport();
  report.id = "r-multi-matrix";
  report.presentation = matrixPresentation;
  report.createdAt = "2026-11-09T09:00:00+08:00";
  report.snapshot.templateId = "demo-matrix-report";
  report.snapshot.template.name = "多实验分析 · 跨实验数据对比";
  report.matrixSnapshot = captureMatrixSnapshot(report);
  return report;
}
