import { uid } from "./prototype-data.js";

export const CALCULATION_SCHEMA_VERSION = 1;
export const calculationOperators = ["+", "-", "*", "/"];
const text = value => typeof value === "string" && value.trim().length > 0;
const versionNumber = value => Number.isInteger(value) && value > 0;
const copy = value => structuredClone(value);
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Persisted binary formula v1: left is a metric; right is a metric or finite constant.
// References are identities, never display names or references to another calculation.
export function newCalculatedMetric() {
  return { schemaVersion: 1, key: uid("calc"), name: "",
    formula: { operator: "/", left: null, right: null },
    format: "number", precision: 2, showInReport: true };
}
export function calculationMetricRef(source, key) {
  return { type: "metric", sourceId: source.id, capabilityId: source.capabilityId, version: source.version, key };
}
export function metricReferenceKey(ref) {
  return JSON.stringify([ref?.sourceId, ref?.capabilityId, ref?.version, ref?.key]);
}
export function isCalculationMetric(field, source) {
  if (!field || field.role !== "metric" || field.type !== "number" || field.calculable === false) return false;
  if (["text", "config", "significance"].includes(field.semanticType)) return false;
  // Older builtin snapshots mislabeled these outputs as numbers. Do not rewrite snapshots.
  if (source?.kind === "rpc" && source.capabilityId === "experiment-config"
    && !["experiment_1", "experiment_5"].includes(field.key)) return false;
  if (source?.kind === "rpc" && ["core-summary", "core-drilldown"].includes(source.capabilityId)
    && field.key === "core_3") return false;
  return !/显著|significance|significant|(?:^|[_\s-])(?:sig|p[_-]?value)(?:$|[_\s-])/i
    .test(`${field.key || ""} ${field.alias || ""} ${field.name || ""}`);
}

// Shared contracts must be supplied by a verified producer and frozen with its version.
// Dimension IDs identify definitions, with immutable versions; names/aliases are not IDs.
export function sharedGrainKey(contract) {
  if (!contract || contract.schemaVersion !== 1
    || !["population", "entity", "experimentNamespace", "groupNamespace", "windowSemantics"].every(key => text(contract[key]))
    || !Array.isArray(contract.dimensions)) return null;
  const dimensions = contract.dimensions;
  if (dimensions.some(dimension => !dimension || !text(dimension.id) || !versionNumber(dimension.version)
    || !["string", "number", "boolean"].includes(dimension.type))
    || new Set(dimensions.map(dimension => dimension.id)).size !== dimensions.length) return null;
  return JSON.stringify([1, contract.population, contract.entity, contract.experimentNamespace,
    contract.groupNamespace, contract.windowSemantics,
    dimensions.map(({ id, version, type }) => [id, version, type]).sort((a, b) => compareIds(a[0], b[0]))]);
}
export function sourceMetricGrains(source, definition, key) {
  if (!definition) return [];
  const modes = source.kind === "sql" ? definition.version?.modes || []
    : definition.dimensions?.length ? definition.dimensions : [{ key: "overall", name: "整体" }];
  return modes.filter(mode => {
    const id = source.kind === "sql" ? mode.id : mode.key;
    if (!(source.dimensionKeys || []).includes(id) && !(source.kind === "rpc" && !definition.dimensions?.length)) return false;
    return source.kind === "sql"
      ? mode.fields?.some(field => field.key === key && isCalculationMetric(field, source))
      : definition.metrics?.some(field => field.key === key && isCalculationMetric(field, source));
  }).map(mode => {
    const contract = mode.calculationGrain;
    const validContract = sharedGrainKey(contract);
    const legacyOverall = ["core-drilldown", "coupon-drilldown"].includes(source.capabilityId) && mode.key === "drill_0";
    const kind = source.kind === "sql" ? mode.kind : mode.kind || (mode.key === "overall" || legacyOverall ? "overall" : "single");
    // A declared shared contract cannot erase a source's actual dimensions.
    const dimensionCount = source.kind === "sql" || kind === "cross" ? mode.members?.length : kind === "overall" ? 0 : 1;
    return { sourceId: source.id, capabilityId: source.capabilityId, version: source.version,
      modeId: source.kind === "sql" ? mode.id : mode.key, kind,
      contract: validContract && contract.dimensions.length === dimensionCount ? copy(contract) : null };
  });
}
const sameRecordGrain = (a, b) => a.sourceId === b.sourceId && a.capabilityId === b.capabilityId
  && a.version === b.version && a.modeId === b.modeId && a.kind === b.kind;
export function commonCalculationGrains(leftGrains, rightGrains) {
  if (rightGrains === null) return leftGrains.map(left => ({ left, right: null }));
  return leftGrains.flatMap(left => rightGrains.filter(right => sameRecordGrain(left, right)
    || (left.kind === right.kind && sharedGrainKey(left.contract) !== null
      && sharedGrainKey(left.contract) === sharedGrainKey(right.contract))).map(right => ({ left, right })));
}
export const commonGrains = commonCalculationGrains;

export function calculationCandidatesFor(module, definitionFor) {
  return (module.sources || []).flatMap(source => {
    if (!text(source.id) || !text(source.capabilityId) || !versionNumber(source.version)
      || module.sources.filter(other => other.id === source.id).length !== 1) return [];
    const definition = definitionFor(source);
    if (!definition) return [];
    return (definition.metrics || []).filter(field => isCalculationMetric(field, source)
      && definition.metrics.filter(other => other.key === field.key).length === 1
      && (source.kind !== "sql" || definition.version.modes.every(mode => mode.fields
        .filter(candidate => candidate.key === field.key).every(candidate => isCalculationMetric(candidate, source)))))
      .map(field => ({ ref: calculationMetricRef(source, field.key), name: field.name, sourceName: definition.name,
        selected: (source.metricKeys || []).includes(field.key), grains: sourceMetricGrains(source, definition, field.key) }));
  });
}
export function resolveCalculationMetricFor(module, ref, definitionFor, { requireSelected = true } = {}) {
  const fail = (code, message) => ({ candidate: null, issues: [{ code, message }] });
  if (!ref || ref.type !== "metric" || ![ref.sourceId, ref.capabilityId, ref.key].every(text) || !versionNumber(ref.version))
    return fail("invalid-reference", "请选择完整的固定版本指标引用。");
  const sources = (module.sources || []).filter(source => source.id === ref.sourceId);
  if (sources.length !== 1) return fail("missing-source", `输入 ${ref.key} 的取数来源已移除或身份不唯一。`);
  const source = sources[0];
  if (source.capabilityId !== ref.capabilityId || source.version !== ref.version)
    return fail("version-mismatch", `输入 ${ref.key} 的能力或固定版本已变更。`);
  const definition = definitionFor(source);
  if (!definition) return fail("missing-version", `输入 ${ref.key} 的固定版本已不可用。`);
  const candidate = calculationCandidatesFor(module, definitionFor).find(entry => metricReferenceKey(entry.ref) === metricReferenceKey(ref));
  if (!candidate) return fail("invalid-metric", `输入 ${ref.key} 已不存在或不是可计算的数值指标。`);
  if (requireSelected && !candidate.selected)
    return { candidate, issues: [{ code: "unselected-metric", message: `输入 ${candidate.name} 已取消取数勾选。` }] };
  return { candidate, issues: [] };
}
export function validateCalculatedMetrics(module, definitionFor, key) {
  const metrics = module.calculatedMetrics ?? [];
  if (!Array.isArray(metrics)) return [{ key: "", code: "invalid-calculations", message: "计算指标配置必须是列表。" }];
  const issues = [];
  for (const metric of metrics) {
    if (key !== undefined && metric?.key !== key) continue;
    const label = metric?.name?.trim?.() || "未命名计算指标";
    const add = (code, message, operand) => issues.push({ key: metric?.key || "", code, message: `${label}：${message}`,
      ...(operand ? { operand } : {}) });
    if (!metric || metric.schemaVersion !== 1) add("invalid-schema", "不支持的计算定义版本。");
    if (!text(metric?.key) || metrics.filter(entry => entry?.key === metric.key).length !== 1)
      add("invalid-key", "计算指标 Key 缺失或重复。");
    if (!text(metric?.name)) add("missing-name", "请填写指标名称。");
    else if (metrics.filter(entry => entry?.name?.trim?.() === metric.name.trim()).length !== 1)
      add("duplicate-name", "计算指标名称不能重复。");
    if (!["number", "percent"].includes(metric?.format)) add("invalid-format", "请选择数值或百分比显示格式。");
    if (!Number.isInteger(metric?.precision) || metric.precision < 0 || metric.precision > 6)
      add("invalid-precision", "小数位须为 0–6 的整数。");
    if (typeof metric?.showInReport !== "boolean") add("invalid-visibility", "请设置报告展示开关。");
    const formula = metric?.formula;
    if (!calculationOperators.includes(formula?.operator)) add("invalid-operator", "仅支持加、减、乘、除二元运算。");
    const inputs = {};
    for (const operand of ["left", "right"]) {
      const ref = formula?.[operand];
      if (operand === "right" && ref?.type === "constant") {
        if (typeof ref.value !== "number" || !Number.isFinite(ref.value)) add("invalid-constant", "常数须为有限数值。", operand);
        else inputs.right = null;
      } else {
        const resolved = resolveCalculationMetricFor(module, ref, definitionFor);
        resolved.issues.forEach(issue => add(issue.code, issue.message, operand));
        if (!resolved.issues.length) inputs[operand] = resolved.candidate.grains;
      }
    }
    if (inputs.left && inputs.right !== undefined && !commonCalculationGrains(inputs.left, inputs.right).length)
      add("incompatible-grain", "指标数据粒度无法对齐。");
  }
  return issues;
}

// Contract-only runtime gate for T3, not an evaluator. One record belongs to one
// experiment/window. The adapter must attest IDs from raw data, never row order/names.
// record.calculationContext = { schemaVersion: 1, capabilityId, version, modeId,
//   grain, experimentId, window: { start, end }, groupKey, dimensionKeys: { [id]: alias } }
// expected is a sourceMetricGrains descriptor. Invalid/duplicate keys never enter rows.
export function indexCalculationRecord(record, expected) {
  const rows = new Map(), issues = [], duplicates = new Set(), context = record?.calculationContext;
  const fail = (code, message) => ({ rows, issues: [{ code, message }] });
  if (!expected || !context || context.schemaVersion !== 1 || !Array.isArray(record.rawRows)
    || record.sourceId !== expected.sourceId || context.capabilityId !== expected.capabilityId
    || context.version !== expected.version || context.modeId !== expected.modeId)
    return fail("record-identity", "取数结果缺少可验证的固定来源身份。");
  const sharedKey = sharedGrainKey(context.grain);
  if (!sharedKey || (expected.contract && sharedKey !== sharedGrainKey(expected.contract)))
    return fail("record-grain", "指标数据粒度无法对齐。");
  // Without a frozen shared contract, even matching runtime metadata stays record-local.
  const grainKey = expected.contract ? sharedKey
    : JSON.stringify([expected.sourceId, expected.capabilityId, expected.version, expected.modeId, sharedKey]);
  const dimensions = [...context.grain.dimensions].sort((a, b) => compareIds(a.id, b.id));
  if ((expected.kind === "overall" && dimensions.length !== 0)
    || (expected.kind === "single" && dimensions.length !== 1)
    || (expected.kind === "cross" && dimensions.length < 2))
    return fail("record-grain", "取数结果与已选粒度不一致。");
  const scalar = value => (typeof value === "string" && value.trim() !== "")
    || (typeof value === "number" && Number.isFinite(value));
  const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!scalar(context.experimentId) || (context.qxExperimentId !== undefined && !scalar(context.qxExperimentId))
    || !date(context.window?.start) || !date(context.window?.end)
    || context.window.start > context.window.end || !text(context.groupKey)
    || ["group_name", "groupName", "is_control"].includes(context.groupKey)
    || dimensions.some(dimension => !text(context.dimensionKeys?.[dimension.id]))
    || new Set(dimensions.map(dimension => context.dimensionKeys[dimension.id])).size !== dimensions.length)
    return fail("record-context", "取数结果缺少实验、分组、观察窗口或结构化维度身份。");
  for (const row of record.rawRows) {
    const groupId = row?.[context.groupKey];
    const values = dimensions.map(dimension => row?.[context.dimensionKeys[dimension.id]]);
    if (!scalar(groupId) || values.some((value, index) => value !== null
      && (typeof value !== dimensions[index].type || (typeof value === "number" && !Number.isFinite(value))))) {
      issues.push({ code: "row-identity", message: "结果行缺少有效分组 ID 或维度原始值。" }); continue;
    }
    const key = JSON.stringify([grainKey,
      context.qxExperimentId ? [context.experimentId, context.qxExperimentId] : context.experimentId,
      groupId, context.window.start, context.window.end, values]);
    if (rows.has(key) || duplicates.has(key)) {
      rows.delete(key); duplicates.add(key);
      issues.push({ code: "duplicate-key", key, message: "同实验、分组、窗口和粒度存在重复组合键。" });
    } else rows.set(key, row);
  }
  return { rows, issues };
}
