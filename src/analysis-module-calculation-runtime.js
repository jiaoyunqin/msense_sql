import { uid } from "./prototype-data.js";
import {
  resolveCalculationMetricFor, validateCalculatedMetrics, commonCalculationGrains,
  indexCalculationRecord, sharedGrainKey
} from "./analysis-module-calculations.js";

export function calculateBinary(left, operator, right) {
  if (left === null || left === undefined || right === null || right === undefined)
    return { value: null, reason: "输入为空" };
  if (typeof left !== "number" || typeof right !== "number")
    return { value: null, reason: "输入不是数值" };
  if (!Number.isFinite(left) || !Number.isFinite(right))
    return { value: null, reason: "输入不是有限数值" };
  if (operator === "/" && right === 0) return { value: null, reason: "分母为 0" };
  const value = operator === "+" ? left + right : operator === "-" ? left - right
    : operator === "*" ? left * right : operator === "/" ? left / right : NaN;
  return Number.isFinite(value) ? { value, reason: "" } : { value: null, reason: "计算结果不是有限数值" };
}
export function formatCalculatedValue(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const percent = field.format === "percent";
  return value.toLocaleString("zh-CN", {
    style: percent ? "percent" : "decimal",
    minimumFractionDigits: field.precision ?? 2, maximumFractionDigits: field.precision ?? 2
  });
}
export function localCalculationContext(source, modeId, context, dimensions = [], grain = null) {
  return { schemaVersion: 1, capabilityId: source.capabilityId, version: source.version, modeId,
    experimentId: context.libra_id,
    ...(context.qx_experiment_id !== undefined ? { qxExperimentId: context.qx_experiment_id } : {}),
    window: { start: context.start_date, end: context.end_date },
    groupKey: "group_id", dimensionKeys: Object.fromEntries(dimensions.map(field => [field.key, field.alias])),
    grain: grain || { schemaVersion: 1, population: `local:${source.capabilityId}:v${source.version}`,
      entity: "experiment-group", experimentNamespace: "local-libra", groupNamespace: "local-libra-group",
      windowSemantics: "inclusive-observation",
      dimensions: dimensions.map(field => ({ id: field.key, version: source.version, type: field.type })) } };
}
const defaultDefinition = source => source.definition || source.calculationDefinition;
const signs = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export function computeModuleCalculations(module, inputRecords, definitionFor = defaultDefinition) {
  const records = [], issues = validateCalculatedMetrics(module, definitionFor);
  if (issues.length || !module.calculatedMetrics?.length) return { records, issues };
  const datasets = new Map();
  function indexed(grain) {
    const rows = new Map(), problems = [], seen = new Set();
    const inputs = inputRecords.filter(record => record.sourceId === grain.sourceId
      && record.calculationContext?.modeId === grain.modeId);
    if (!inputs.length) problems.push({ code: "missing-record", message: "未取得该指标粒度的数据" });
    for (const record of inputs) {
      const index = indexCalculationRecord(record, grain);
      problems.push(...index.issues);
      for (const [key, row] of index.rows) {
        if (seen.has(key)) {
          rows.delete(key); problems.push({ code: "duplicate-key", message: "同实验、分组、窗口和粒度存在重复组合键。" });
        } else { seen.add(key); rows.set(key, { row, record }); }
      }
    }
    return { rows, problems };
  }
  function rawInput(entry, ref) {
    if (!entry) return { value: null, reason: "缺少匹配行" };
    const fields = entry.record.fields.filter(field => field.key === ref.key);
    if (fields.length !== 1) return { value: null, reason: "输入字段缺失或不唯一" };
    const value = entry.row[fields[0].alias];
    return { value, reason: entry.row.calculationReasons?.[ref.key] || "" };
  }
  for (const metric of module.calculatedMetrics) {
    const formula = metric.formula;
    const left = resolveCalculationMetricFor(module, formula.left, definitionFor).candidate;
    const right = formula.right.type === "constant" ? null
      : resolveCalculationMetricFor(module, formula.right, definitionFor).candidate;
    const formulaText = `${left.sourceName} / ${left.name} ${signs[formula.operator]} ${right ? `${right.sourceName} / ${right.name}` : formula.right.value}`;
    for (const pair of commonCalculationGrains(left.grains, right ? right.grains : null)) {
      const a = indexed(pair.left), b = pair.right ? indexed(pair.right) : null;
      const problems = [...a.problems, ...(b?.problems || [])];
      if (problems.length) {
        issues.push(...problems.map(problem => ({ ...problem, key: metric.key, message: `${metric.name}：${problem.message}` })));
        continue;
      }
      const grainIdentity = pair.left.contract ? sharedGrainKey(pair.left.contract)
        : JSON.stringify([pair.left.sourceId, pair.left.modeId]);
      const first = [...a.rows.values()][0];
      if (!first) {
        issues.push({ key: metric.key, code: "empty-record", message: `${metric.name}：该粒度没有数据行。` }); continue;
      }
      for (const key of new Set([...a.rows.keys(), ...(b?.rows.keys() || [])])) {
        const inputA = a.rows.get(key), inputB = b?.rows.get(key);
        const anchor = inputA || inputB, raw = anchor.row, context = anchor.record.calculationContext;
        const identity = JSON.stringify([grainIdentity,
          context.qxExperimentId ? [context.experimentId, context.qxExperimentId] : context.experimentId, context.window]);
        let dataset = datasets.get(identity);
        if (!dataset) {
          const dimensions = anchor.record.fields.filter(field => field.role === "dimension");
          const modeName = anchor.record.modeName.split(" · ").slice(1).join(" · ") || "整体";
          dataset = { id: uid("calcdata"), calculated: true, modeName: `计算指标 · ${modeName}`,
            modeId: pair.left.modeId, sourceId: "module-calculations", status: "success",
            context: structuredClone(anchor.record.context || {}), fields: [
              { key: "group_name", alias: "group_name", name: "分组", role: "identity", type: "string" },
              ...structuredClone(dimensions)
            ], rowMap: new Map(), evidence: [], calculationContext: structuredClone(context) };
          datasets.set(identity, dataset);
        }
        // A formula's value remains raw; display formatting is applied by the view only.
        if (!dataset.fields.some(field => field.key === metric.key)) dataset.fields.push({
          key: metric.key, alias: metric.key, name: metric.name, role: "metric", type: "number",
          calculated: true, format: metric.format, precision: metric.precision, showInReport: metric.showInReport,
          formulaText, sources: [left, ...(right ? [right] : [])].map(candidate =>
            ({ name: candidate.name, sourceName: candidate.sourceName, ref: candidate.ref })) });
        if (!dataset.rowMap.has(key)) {
          const row = { group_id: raw[anchor.record.calculationContext.groupKey],
            group_name: raw.group_name ?? raw[anchor.record.calculationContext.groupKey],
            is_control: raw.is_control, calculationReasons: {}, calculationInputs: {} };
          for (const [dimensionId, alias] of Object.entries(dataset.calculationContext.dimensionKeys))
            row[alias] = raw[context.dimensionKeys[dimensionId]];
          dataset.rowMap.set(key, row);
        }
        const inputLeft = rawInput(inputA, formula.left);
        const inputRight = right ? rawInput(inputB, formula.right) : { value: formula.right.value, reason: "" };
        const cell = inputLeft.reason || inputRight.reason
          ? { value: null, reason: inputLeft.reason || inputRight.reason }
          : calculateBinary(inputLeft.value, formula.operator, inputRight.value);
        const row = dataset.rowMap.get(key);
        if (metric.key in row) {
          row[metric.key] = null; row.calculationReasons[metric.key] = "粒度输入不唯一";
          issues.push({ key: metric.key, code: "duplicate-key", message: `${metric.name}：同一粒度存在多份输入，不能确定计算值。` });
          continue;
        }
        row[metric.key] = cell.value;
        row.calculationReasons[metric.key] = cell.reason;
        row.calculationInputs[metric.key] = { left: inputLeft.value ?? null, right: inputRight.value ?? null };
      }
    }
  }
  for (const dataset of datasets.values()) {
    dataset.rawRows = [...dataset.rowMap.values()];
    delete dataset.rowMap;
    // Formulas with different compatible row sets do not receive synthetic zeroes.
    for (const row of dataset.rawRows) for (const field of dataset.fields.filter(field => field.calculated)) {
      if (!(field.key in row)) { row[field.key] = null; row.calculationReasons[field.key] = "缺少匹配行"; }
    }
    dataset.snapshot = { fields: structuredClone(dataset.fields), members: [], sql: "" };
    dataset.renderedSql = "";
    dataset.rawRows.forEach((row, rowIndex) => {
      for (const field of dataset.fields.filter(field => field.calculated)) dataset.evidence.push({
        executionId: dataset.id, rowIndex, metricKey: field.key,
        text: `${row.group_name}：${field.name} ${formatCalculatedValue(row[field.key], field)}${row.calculationReasons[field.key] ? `（${row.calculationReasons[field.key]}）` : ""}；公式：${field.formulaText}。`
      });
    });
    records.push(dataset);
  }
  return { records, issues };
}

// Adapter for the existing independent-experiment fixture, using producer IDs
// and native dimension codes. It does not borrow another capability's results.
export function comparisonCalculationRecords(module, result, entry) {
  const records = [];
  for (const source of module.sources.filter(source => source.capabilityId === "demo-comparison")) {
    const definition = defaultDefinition(source);
    if (!definition?.metrics || !definition.dimensions) continue;
    const metrics = definition.metrics.filter(field => source.metricKeys.includes(field.key));
    for (const modeId of source.dimensionKeys.filter(id => ["overall", "demo-spend"].includes(id))) {
      const dimensioned = modeId === "demo-spend";
      const inputs = dimensioned ? result.breakdowns || [] : result.rows || [];
      const dimensions = dimensioned ? [{ key: "demo-spend", alias: "dimension_value", name: "消费力分层", role: "dimension", type: "string",
        valueLabels: { high: "较高消费力", standard: "一般消费力" } }] : [];
      const control = new Map();
      const strategyRows = inputs.map(row => {
        const dimensionValue = dimensioned ? row.dimensionValue : null;
        if (dimensioned && dimensionValue === undefined) return null;
        const values = Object.fromEntries(metrics.map(field => [field.key, row.values[field.key]?.value ?? null]));
        const missing = Object.fromEntries(metrics.filter(field => row.values[field.key]?.reason).map(field => [field.key, row.values[field.key].reason]));
        control.set(dimensionValue, { group_id: row.controlId, group_name: row.controlName, is_control: 1,
          ...(dimensioned ? { dimension_value: dimensionValue } : {}),
          ...Object.fromEntries(metrics.map(field => [field.key, field.key === "dac" ? row.raw.controlDac : field.key === "gmv" ? row.raw.controlGmv : null])),
          calculationReasons: Object.fromEntries(metrics.filter(field => !["dac", "gmv"].includes(field.key)).map(field => [field.key, "该指标仅适用于策略组"])) });
        return { group_id: row.groupId, group_name: row.groupName, is_control: 0,
          ...(dimensioned ? { dimension_value: dimensionValue } : {}), ...values, calculationReasons: missing };
      }).filter(Boolean);
      const context = { libra_id: entry.input.id,
        ...(entry.definition.qxExperimentId ? { qx_experiment_id: entry.definition.qxExperimentId } : {}),
        start_date: entry.input.start, end_date: entry.input.end };
      records.push({ id: uid("demodata"), sourceId: source.id, modeId, modeName: `${definition.name} · ${dimensioned ? "消费力分层" : "整体"}`,
        status: "success", context, fields: [{ key: "group_name", alias: "group_name", name: "分组", role: "identity", type: "string" },
          ...dimensions, ...metrics.map(field => ({ ...field, alias: field.key }))],
        rawRows: [...control.values(), ...strategyRows],
        calculationContext: localCalculationContext(source, modeId, context, dimensions,
          definition.dimensions.find(dimension => dimension.key === modeId)?.calculationGrain) });
    }
  }
  return records;
}
