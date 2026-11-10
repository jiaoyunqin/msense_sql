import { clone, uid, hash } from "./composer-data.js";
import { runAnalysis } from "./composer-engine.js";
import { sourceDefinition, moduleIssues, moduleConfiguration } from "./analysis-module-data.js";
import { computeModuleCalculations, localCalculationContext, comparisonCalculationRecords } from "./analysis-module-calculation-runtime.js";
import { findExperiment, experimentInput, experimentIssues, deriveGroup, deriveBreakdowns } from "./multi-experiment-data.js";
import { applyModuleRecordOrder } from "./analysis-module-report-order.js";

function fixedRpcRecords(store, module, source) {
  const definition = sourceDefinition(store, source);
  if (source.capabilityId === "demo-comparison") {
    const experiment = findExperiment(String(module.context.libra_id));
    if (!experiment) throw new Error("独立实验模拟指标请使用 DEMO-001、DEMO-002 或 DEMO-003 试跑。");
    const input = { ...experimentInput(experiment.id), start: module.context.start_date, end: module.context.end_date };
    const issues = experimentIssues(input);
    if (issues.length) throw new Error(issues.join(" "));
    return comparisonCalculationRecords({ sources: [source] }, {
      rows: experiment.groups.filter(group => input.groupIds.includes(group.id)).map(group => deriveGroup(experiment, input, group)),
      breakdowns: deriveBreakdowns(experiment, input)
    }, { input, definition: experiment }).map(record => ({ ...record, evidence: [], fixedSample: true,
      snapshot: { fields: record.fields, sql: "", members: [] }, renderedSql: "" }));
  }
  const metrics = definition.metrics.filter((field) => source.metricKeys.includes(field.key));
  const dimensions = definition.dimensions.filter((field) => source.dimensionKeys.includes(field.key));
  const scopes = dimensions.length ? dimensions : [{ key: "overall", name: "整体" }];
  const sampleValue = (field, groupIndex) => {
    const factor = groupIndex ? 1.12 : 1;
    if (source.capabilityId === "experiment-config") {
      const values = [
        ["2026-10-01 至 2026-10-03", "2026-10-01 至 2026-10-03"], [.5, .5],
        ["无", "10 元券"], ["不适用", "领取后 3 天"], ["不适用", "示例商品"],
        [0, 1], ["不适用", "示例会场"]
      ];
      return values[Number(field.key.split("_").at(-1))][groupIndex];
    }
    if (field.name.includes("显著性")) return groupIndex ? .08 : .2;
    if (source.capabilityId.startsWith("coupon-")) {
      const values = [10000, 12000, 2000, 2400, .2, 48000, 8000];
      const value = values[Number(field.key.split("_").at(-1))];
      return field.key === "coupon_4" ? value : value * factor;
    }
    if (field.name.includes("率") || field.name.includes("增幅")) return .4 * factor;
    if (field.name.includes("ROI")) return 2.4 * factor;
    // A metric's fixed sample does not change when neighboring metrics are deselected.
    return (Number(field.key.split("_").at(-1)) + 1) * 100 * factor;
  };
  return scopes.map((dimension) => {
    const id = uid("rpcdata");
    const overall = dimension.key === "overall" || dimension.key === "drill_0";
    const dimensionFields = overall ? [] : [{
      key: dimension.key, alias: "dimension_value", name: dimension.name, role: "dimension", type: "string",
      valueLabels: { "fixed-sample-bucket": "固定样例" }
    }];
    const fields = [
      { alias: "group_name", key: "group_name", name: "分组", role: "identity", type: "string" },
      ...dimensionFields,
      ...metrics.map((field) => ({ ...field, alias: field.key,
        type: typeof sampleValue(field, 0), format: "decimal", precision: 2 }))
    ];
    const rawRows = ["对照组", "实验组"].map((group, groupIndex) => Object.fromEntries([
      ["group_id", groupIndex ? 2 : 1], ["group_name", group], ["is_control", groupIndex ? 0 : 1],
      ...(!overall ? [["dimension_value", "fixed-sample-bucket"]] : []),
      ...metrics.map((field) => [field.key, sampleValue(field, groupIndex)])
    ]));
    return { id, modeId: dimension.key, modeName: `${definition.name} · ${dimension.name}`, sourceId: source.id,
      status: "success", fields, rawRows, fixedSample: true, context: clone(module.context),
      calculationContext: localCalculationContext(source, dimension.key, module.context, dimensionFields, dimension.calculationGrain),
      snapshot: { members: [], sql: "", fields }, renderedSql: "",
      evidence: metrics.map((field) => ({
        executionId: id, rowIndex: 1, controlIndex: 0, metricKey: field.key,
        text: `${definition.name} · ${dimension.name}：实验组${field.name}为 ${rawRows[1][field.key]}，对照组为 ${rawRows[0][field.key]}。`
      })) };
  });
}
export async function runModule(store, module, changed, sourceId = "") {
  const snapshot = clone(module);
  delete snapshot.attempts;
  const sources = snapshot.sources.filter((source) => !sourceId || source.id === sourceId);
  const issues = moduleIssues(store, snapshot, sources, { sourceTrial: Boolean(sourceId) });
  if (issues.length) throw new Error(issues.join(" "));
  if (!snapshot.reasoning.trim() && !sourceId) throw new Error("请填写分析思路。");
  const attempt = {
    id: uid("analysis"), moduleId: module.id, startedAt: new Date().toISOString(),
    status: "running", snapshot, version: module.versions.at(-1)?.number || 0,
    capabilityName: module.name, records: [], evidence: [], gaps: [], reused: false,
    configurationKey: hash(moduleConfiguration(module)), sourceTrial: Boolean(sourceId)
  };
  module.attempts.unshift(attempt); changed(attempt);
  try {
    for (const source of sources) {
      const definition = sourceDefinition(store, source);
      if (source.kind === "rpc") {
        if (snapshot.scenario !== "normal") throw new Error("内置 RPC 固定样例仅支持正常场景。");
        const records = fixedRpcRecords(store, snapshot, source);
        attempt.records.push(...records);
        if (source.showInReport) attempt.evidence.push(...records.flatMap((record) => record.evidence));
        attempt.gaps.push("内置 RPC 使用本地固定样例，结果不随实验或日期变化。");
      } else {
        const work = { ...snapshot, capabilityId: source.capabilityId, version: source.version, attempts: [],
          reasoning: sourceId ? "核对所选指标和维度的输入数据。" : snapshot.reasoning,
          selections: Object.fromEntries(definition.version.modes.map((mode) => [mode.id,
            source.dimensionKeys.includes(mode.id)
              ? mode.fields.filter((field) => field.role === "metric" && source.metricKeys.includes(field.key)).map((field) => field.key)
              : []])) };
        const result = await runAnalysis({ ...store, analysis: work });
        attempt.records.push(...result.records.map((record) => {
          const mode = definition.version.modes.find(mode => mode.id === record.modeId);
          const dimensions = record.fields?.filter(field => field.role === "dimension") || [];
          return { ...record, sourceId: source.id, calculationContext: localCalculationContext(source, record.modeId,
            snapshot.context, dimensions, mode?.calculationGrain) };
        }));
        const retrieved = result.records.length && result.records.every(record => record.status === "success");
        const onlyNullValues = result.error?.endsWith(" 存在空值，不能当作 0 参与分析。");
        if (result.status !== "success" && !(snapshot.calculatedMetrics?.length && retrieved && onlyNullValues))
          throw new Error(result.error || result.gaps.join(" "));
        if (source.showInReport) attempt.evidence.push(...result.evidence);
        attempt.gaps.push(...result.gaps);
      }
      changed(attempt);
    }
    if (!sourceId && snapshot.calculatedMetrics?.length) {
      const calculations = computeModuleCalculations(snapshot, attempt.records, source => sourceDefinition(store, source));
      attempt.records.push(...calculations.records);
      attempt.evidence.push(...calculations.records.flatMap(record => record.evidence));
      if (calculations.issues.length) throw new Error([...new Set(calculations.issues.map(issue => issue.message))].join(" "));
    }
    if (sourceId && snapshot.calculatedMetrics?.length) attempt.gaps.push("本次只核对该能力原始数据，未验证模块计算指标。");
    attempt.records = applyModuleRecordOrder(snapshot, attempt.records);
    attempt.status = "success";
    attempt.gaps = [...new Set(attempt.gaps)];
    attempt.evidence.forEach((evidence, index) => { evidence.id = `evidence_${index + 1}`; });
  } catch (error) {
    attempt.status = "insufficient"; attempt.error = error.message;
    attempt.evidence = []; attempt.gaps = [error.message];
  }
  attempt.finishedAt = new Date().toISOString(); changed(attempt);
  return attempt;
}
