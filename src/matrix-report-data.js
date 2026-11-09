import { comparisonMetrics } from "./multi-experiment-data.js";
import { couponIntervalCapability, couponIntervalMetrics } from "./coupon-interval-demo.js";
import { validateCalculatedMetrics } from "./analysis-module-calculations.js";
import { localCalculationContext } from "./analysis-module-calculation-runtime.js";
import { findExperimentResult, reportExperimentKey, selectedCandidateId, repeatedLibraId, experimentLabel } from "./experiment-identity.js";

export const matrixPresentation = "matrix-demo-v1";
const clone = value => structuredClone(value);
const identity = (...parts) => JSON.stringify(parts);
const finite = value => typeof value === "number" && Number.isFinite(value);
const coreDefinitions = {
  dac: "group.per-user-payment-days.observation-total",
  gmv: "group.per-user-paid-gmv.observation-total",
  incrementalDac: "(group.dac-own-control.dac)*group.users",
  incrementalGmv: "(group.gmv-own-control.gmv)*group.users",
  dailyDac: "incrementalDac/inclusive-observation-days",
  redeemCost: "redemption/positive-incrementalDac",
  cost: "settlement-subsidy/positive-incrementalDac",
  roi: "incrementalGmv/settlement-subsidy"
};
const registrations = {
  "demo-comparison": { version: 1, mode: "overall", grain: "experiment-group/observed-users/overall/inclusive-observation/v1",
    fields: comparisonMetrics, definitions: coreDefinitions, control: true },
  [couponIntervalCapability]: { version: 1, mode: "interval-overall",
    grain: "experiment-group/redeemed-coupons/overall/inclusive-observation/v1", fields: couponIntervalMetrics,
    definitions: Object.fromEntries(couponIntervalMetrics.map(field => [field.key,
      `redeemed-coupons.redemption-minus-claim-hours.${field.key}.sample-statistic/v1`])), control: false }
};
export const matrixDatasetKey = dataset => identity(dataset.sourceId, dataset.mode);
export const matrixColumnKey = (experimentId, groupId) => identity(experimentId, groupId);
export const matrixEvidenceToken = evidence => encodeURIComponent(identity(
  evidence.moduleId, evidence.datasetKey, evidence.experimentId, evidence.groupId, evidence.metricKey
));
export const matrixEvidenceScope = evidence => `${evidence.moduleScope}-matrix-cell-${matrixEvidenceToken(evidence)}`;

function numeric(value, reason = "", status) {
  if (status && status !== "value") return { status, value: null, reason };
  if (finite(value)) return { status: "value", value, reason: "" };
  return { status: "missing", value: null, reason: reason || "未提供" };
}
function contract(source, registration, fields) {
  return { schemaVersion: 1, sourceId: source.id, capabilityId: source.capabilityId, sourceVersion: source.version,
    grain: registration.grain, mode: registration.mode,
    metrics: fields.map(field => ({ key: field.key, unit: field.unit, digits: field.digits,
      definition: registration.definitions[field.key] })) };
}
function sourceProblem(source, registration, fields) {
  if (source.version !== registration.version) return "来源版本未登记，不能安全对齐";
  for (const field of fields) {
    const definitions = source.definition?.metrics?.filter(item => item.key === field.key) || [];
    if (definitions.length !== 1 || definitions[0].unit !== field.unit || definitions[0].type !== "number")
      return "指标语义或单位缺少依据 / 与登记定义不一致";
  }
  return "";
}
function savedGroups(entry, registration) {
  return [...(registration.control ? [{ ...entry.definition.control, control: true }] : []),
    ...entry.definition.groups.filter(group => entry.input.groupIds.includes(group.id))];
}
function rawSourceRows(result, entry, source, registration, fields) {
  const saved = savedGroups(entry, registration);
  const sourceRows = source.capabilityId === couponIntervalCapability ? result.couponIntervals?.overall : result.rows;
  const groupOrder = [...new Set((Array.isArray(sourceRows) ? sourceRows : []).map(row => row.groupId))];
  const groups = [...saved.filter(group => group.control),
    ...groupOrder.flatMap(id => saved.filter(group => !group.control && group.id === id)),
    ...saved.filter(group => !group.control && !groupOrder.includes(group.id))];
  if (result.status !== "success") return groups.map(group => ({ groupId: group.id, groupName: group.name,
    control: Boolean(group.control), cells: Object.fromEntries(fields.map(field => [field.key,
      numeric(null, result.error || "该实验取数失败", "failed")])) }));
  if (source.capabilityId === couponIntervalCapability) {
    const rows = Array.isArray(result.couponIntervals?.overall) ? result.couponIntervals.overall : null;
    return groups.map(group => {
      const matches = rows?.filter(row => row.groupId === group.id) || [];
      return { groupId: group.id, groupName: group.name, control: false,
        cells: Object.fromEntries(fields.map(field => [field.key, matches.length > 1
          ? numeric(null, "同实验、组别的整体记录不唯一", "unalignable")
          : !rows ? numeric(null, "快照未保存该实验的整体核销间隔", "unavailable")
            : numeric(matches[0]?.values?.[field.key], "未提供该间隔统计值")])) };
    });
  }
  // Control values are taken only from the same experiment's saved control references.
  const rows = (result.rows || []).filter(row => row.qxExperimentId === undefined
    || row.qxExperimentId === selectedCandidateId(entry.input, entry.definition));
  const controlRows = rows.filter(row => row.controlId === entry.definition.control.id);
  return groups.filter(group => !group.control || controlRows.length).map(group => ({
    groupId: group.id, groupName: group.name, control: Boolean(group.control),
    cells: Object.fromEntries(fields.map(field => {
      if (group.control) {
        if (!["dac", "gmv"].includes(field.key))
          return [field.key, numeric(null, "该增量 / 成本指标仅适用于策略组", "not-applicable")];
        const values = controlRows.map(row => row.raw[field.key === "dac" ? "controlDac" : "controlGmv"]);
        return [field.key, values.every(value => Object.is(value, values[0]))
          ? numeric(values[0]) : numeric(null, "自身对照组原值不一致", "unalignable")];
      }
      const matches = rows.filter(row => row.groupId === group.id && row.experimentId === entry.input.id);
      if (matches.length > 1) return [field.key, numeric(null, "同实验、组别的整体记录不唯一", "unalignable")];
      const row = matches[0], value = row?.values[field.key], cell = numeric(value?.value, value?.reason);
      if (field.uplift && row?.controlId === entry.definition.control.id) {
        cell.ownControl = { id: row.controlId, name: row.controlName,
          value: row.raw[field.key === "dac" ? "controlDac" : "controlGmv"] };
        if (Object.hasOwn(value || {}, "uplift")) cell.uplift = value.uplift;
        if (Object.hasOwn(value || {}, "sig")) cell.sig = value.sig;
      }
      return [field.key, cell];
    }))
  }));
}
function calculationContract(module, record, fields) {
  const metrics = fields.map(field => {
    const definition = module.configuration.calculatedMetrics.find(metric => metric.key === field.key);
    const formula = definition?.formula;
    const refs = formula?.left && formula?.right
      ? [formula.left, ...(formula.right.type === "constant" ? [] : [formula.right])] : [];
    return { key: field.key, unit: definition?.format === "percent" ? "%" : "", digits: definition?.precision,
      format: definition?.format, definition: definition ? { formula: clone(formula), inputs: refs.map(ref => {
        const source = module.configuration.sources.find(source => source.id === ref.sourceId);
        const registration = source && registrations[source.capabilityId];
        return { ref: clone(ref), grain: registration?.grain, definition: registration?.definitions[ref.key],
          unit: source?.definition?.metrics?.find(field => field.key === ref.key)?.unit };
      }) } : null };
  });
  const input = metrics[0]?.definition?.inputs[0]?.ref;
  const source = module.configuration.sources.find(source => source.id === input?.sourceId);
  // The comparison signature comes from the declaration, never the first execution's metadata.
  return { schemaVersion: 1, sourceId: "module-calculations", capabilityId: module.id, sourceVersion: module.version,
    mode: `calculated:${record.modeId}`, grain: source ? localCalculationContext(source, record.modeId, {}).grain : null, metrics };
}
function calculationProblem(module, record, fields, entry) {
  const context = record.calculationContext;
  if (!Number.isInteger(module.version) || module.version < 1 || record.sourceId !== "module-calculations"
    || !record.id || record.calculated !== true || record.status !== "success" || context?.schemaVersion !== 1)
    return "计算结果缺少可验证的执行身份或来源版本";
  if (!context.grain || record.modeId !== "overall" || context.modeId !== record.modeId
    || !context.dimensionKeys || Object.keys(context.dimensionKeys).length || context.grain.dimensions?.length
    || record.fields.some(field => field.role === "dimension"))
    return "计算指标缺少明确的整体粒度依据";
  if (context.groupKey !== "group_id") return "保存的计算组别 Key 与登记定义不一致";
  if (context.experimentId !== entry.input.id || context.window?.start !== entry.input.start || context.window?.end !== entry.input.end
    || record.context?.libra_id !== entry.input.id || record.context?.start_date !== entry.input.start
    || record.context?.end_date !== entry.input.end)
    return "计算结果的实验身份或观察窗口不一致";
  const candidateId = selectedCandidateId(entry.input, entry.definition);
  if ((context.qxExperimentId !== undefined && context.qxExperimentId !== candidateId)
    || (record.context?.qx_experiment_id !== undefined && record.context.qx_experiment_id !== candidateId)
    || (entry.requiresCandidateIdentity && (context.qxExperimentId !== candidateId || record.context?.qx_experiment_id !== candidateId)))
    return "计算结果的钱效候选项身份不一致或缺失";
  const groups = savedGroups(entry, { control: true });
  if (!Array.isArray(record.rawRows) || !record.rawRows.length
    || record.rawRows.some(row => groups.filter(group => group.id === row.group_id
      && row.is_control === (group.control ? 1 : 0)).length !== 1)
    || new Set(record.rawRows.map(row => row.group_id)).size !== record.rawRows.length)
    return "计算结果的组身份缺失、不唯一或与任务快照不一致";
  if (!fields.length) return "保存的计算字段缺失";
  for (const field of fields) {
    const definitions = module.configuration.calculatedMetrics.filter(metric => metric.key === field.key);
    if (definitions.length !== 1) return "计算定义缺失或不唯一";
    if (validateCalculatedMetrics(module.configuration, source => source.definition, field.key).length)
      return "计算定义或输入来源、版本、粒度不一致";
    const definition = definitions[0], formula = definition.formula;
    const refs = [formula.left, ...(formula.right.type === "constant" ? [] : [formula.right])];
    if (definition.format !== field.format || definition.precision !== field.precision || !definition.showInReport
      || field.alias !== field.key || field.type !== "number" || field.role !== "metric"
      || record.fields.filter(item => item.key === field.key || item.alias === field.alias).length !== 1
      || canonical(refs) !== canonical(field.sources?.map(source => source.ref)))
      return "保存的计算输入或格式与计算定义不一致";
    const inputs = [];
    for (const ref of refs) {
      const source = module.configuration.sources.find(source => source.id === ref.sourceId);
      const registration = registrations[source.capabilityId];
      if (registration?.version !== source.version || registration.mode !== "overall"
        || !source.dimensionKeys.includes("overall") || !registration.definitions[ref.key]
        || sourceProblem(source, registration, registration.fields.filter(field => field.key === ref.key)))
        return "计算输入来源、版本或指标口径未登记";
      if (context.capabilityId !== source.capabilityId || context.version !== source.version)
        return "保存的计算输入来源或版本与登记定义不一致";
      const grain = localCalculationContext(source, "overall", {}).grain;
      const declaredGrain = source.definition.dimensions?.find(dimension => dimension.key === "overall")?.calculationGrain;
      if (canonical(context.grain) !== canonical(grain) || (declaredGrain && canonical(declaredGrain) !== canonical(grain)))
        return "保存的计算输入粒度与登记口径不一致";
      inputs.push({ ref: clone(ref), sourceName: source.definition.name,
        name: source.definition.metrics.find(metric => metric.key === ref.key).name });
    }
    if (canonical(field.sources) !== canonical(inputs)) return "保存的计算输入来源信息与定义不一致";
    const operand = input => `${input.sourceName} / ${input.name}`;
    const signs = { "+": "+", "-": "−", "*": "×", "/": "÷" };
    const formulaText = `${operand(inputs[0])} ${signs[formula.operator]} ${inputs[1] ? operand(inputs[1]) : formula.right.value}`;
    // Legacy executions save the formula as text plus structured operand refs; do not infer it from values.
    if (field.formulaText !== formulaText) return "保存的执行公式与计算定义不一致";
    const savedFields = record.snapshot?.fields?.filter(item => item.key === field.key) || [];
    if (savedFields.length !== 1 || canonical(savedFields[0]) !== canonical(field))
      return "保存的执行字段快照与计算定义不一致";
    const evidence = record.evidence?.filter(item => item.metricKey === field.key) || [];
    if (evidence.length !== record.rawRows.length || record.rawRows.some((row, index) =>
      evidence.filter(item => item.executionId === record.id && item.rowIndex === index).length !== 1))
      return "计算证据的执行、指标或结果行身份缺失 / 不唯一";
  }
  return "";
}

// The bundled demo captures numeric evidence once. Readers never parse display strings,
// recalculate results, or use table titles/row positions as join keys.
export function captureMatrixSnapshot(report) {
  const entries = report.snapshot.experiments.map(entry => repeatedLibraId(report.snapshot, entry.input.id)
    ? { ...entry, requiresCandidateIdentity: true } : entry);
  return report.snapshot.modules.map(module => {
    const datasets = [], issues = [];
    for (const source of module.configuration.sources.filter(source => source.showInReport)) {
      const registration = registrations[source.capabilityId];
      if (!registration || !source.dimensionKeys.includes(registration.mode)) {
        issues.push(`${source.definition?.name || source.id}：当前来源无已登记的整体粒度`); continue;
      }
      const fields = registration.fields.filter(field => source.metricKeys.includes(field.key));
      if (!fields.length) continue;
      if (source.capabilityId === couponIntervalCapability && !entries.some(entry => {
        const rows = findExperimentResult(report.results, entry, report.snapshot)?.couponIntervals?.overall;
        return Array.isArray(rows) && rows.some(row => savedGroups(entry, registration).some(group => group.id === row.groupId));
      })) {
        issues.push(`${source.definition?.name || source.id}：快照未保存可对齐的整体核销间隔`);
        continue;
      }
      const reason = sourceProblem(source, registration, fields);
      const semantics = contract(source, registration, fields);
      datasets.push({ key: matrixDatasetKey({ sourceId: source.id, mode: registration.mode }),
        sourceId: source.id, sourceName: source.definition?.name || source.id, mode: registration.mode,
        title: source.capabilityId === couponIntervalCapability ? "领券核销间隔（整体）" : "核心指标（整体）",
        contract: semantics, fields: clone(fields),
        experiments: entries.map(entry => {
          const result = findExperimentResult(report.results, entry, report.snapshot) || { status: "failed" };
          return { id: reportExperimentKey(report.snapshot, entry), contract: clone(semantics), reason,
            rows: rawSourceRows(result, entry, source, registration, fields) };
        }) });
    }
    const calculations = entries.flatMap(entry =>
      (findExperimentResult(report.results, entry, report.snapshot)?.moduleCalculations?.[module.id]?.records || [])
        .map(record => ({ record, entry })));
    const modes = [...new Set(calculations.filter(({ record }) => record.modeId === "overall").map(({ record }) => record.modeId))];
    for (const mode of modes) {
      const candidates = calculations.filter(({ record }) => record.modeId === mode);
      const first = (candidates.find(({ record, entry }) =>
        !calculationProblem(module, record, record.fields.filter(field => field.calculated && field.showInReport), entry)) || candidates[0]).record;
      const fields = first.fields.filter(field => field.calculated && field.showInReport);
      if (!fields.length) continue;
      const semantics = calculationContract(module, first, fields);
      datasets.push({ key: matrixDatasetKey({ sourceId: "module-calculations", mode: `calculated:${mode}` }),
        sourceId: "module-calculations", sourceName: "当前分析模块计算结果", mode: `calculated:${mode}`,
        title: "计算指标（整体）", contract: semantics,
        fields: fields.map(field => ({ ...clone(field), unit: field.format === "percent" ? "%" : "", digits: field.precision })),
        experiments: entries.map(entry => {
          const result = findExperimentResult(report.results, entry, report.snapshot);
          const matches = result?.moduleCalculations?.[module.id]?.records.filter(record => record.modeId === mode) || [];
          const record = matches.length === 1 ? matches[0] : null;
          const actualFields = record?.fields.filter(field => field.calculated && field.showInReport) || [];
          const reason = matches.length > 1 ? "保存的同粒度计算结果不唯一" : record
            ? calculationProblem(module, record, actualFields, entry) : "";
          const groups = record && !reason ? record.rawRows.map(row => ({ id: row.group_id, name: row.group_name, control: row.is_control === 1 }))
            : savedGroups(entry, { control: true });
          return { id: reportExperimentKey(report.snapshot, entry), contract: record ? calculationContract(module, record, actualFields) : clone(semantics), reason,
            rows: groups.map(group => {
              const matches = record && !reason ? record.rawRows.filter(row => row.group_id === group.id) : [], raw = matches[0];
              return { groupId: group.id, groupName: group.name, control: group.control,
                cells: Object.fromEntries(fields.map(field => {
                  const actual = actualFields.find(item => item.key === field.key);
                  return [field.key, result?.status !== "success" ? numeric(null, result?.error || "该实验取数失败", "failed")
                    : !record ? numeric(null, "未保存本实验计算结果", "unavailable")
                      : reason ? numeric(null, reason, "unalignable")
                        : matches.length !== 1 ? numeric(null, "计算结果组身份不唯一", "unalignable")
                          : numeric(actual ? raw[actual.alias] : null, raw?.calculationReasons?.[field.key])];
                })) };
            }) };
        }) });
    }
    return { moduleId: module.id, datasets, issues };
  });
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function contractProblem(expected, actual, field) {
  if (!actual || actual.schemaVersion !== 1 || !actual.grain) return "缺少明确的来源 / 粒度依据";
  if (expected.sourceId !== actual.sourceId || expected.capabilityId !== actual.capabilityId) return "来源身份不一致";
  if (expected.sourceVersion !== actual.sourceVersion || !actual.sourceVersion) return "来源版本不一致";
  if (expected.mode !== actual.mode || canonical(expected.grain) !== canonical(actual.grain)) return "数据粒度不一致";
  const a = expected.metrics.filter(metric => metric.key === field.key);
  const b = actual.metrics?.filter(metric => metric.key === field.key) || [];
  if (a.length !== 1 || b.length !== 1 || !a[0].definition || !b[0].definition) return "指标语义缺失或不唯一";
  if (a[0].unit === undefined || a[0].unit !== b[0].unit) return "指标单位不一致";
  if (canonical(a[0].definition) !== canonical(b[0].definition)) return "计算定义或指标口径不一致";
  if (a[0].digits !== b[0].digits || a[0].format !== b[0].format) return "来源精度或数值格式不一致";
  if (!Number.isInteger(b[0].digits) || b[0].digits < 0 || b[0].digits > 20) return "来源数值精度缺少依据";
  return "";
}
export function buildMatrixComparisons(report, module) {
  const saved = report.matrixSnapshot?.find(item => item.moduleId === module.moduleId);
  if (!saved) return { datasets: [], issues: ["当前模块无可对齐的整体数据"] };
  const issues = [...saved.issues], datasets = [];
  for (const dataset of saved.datasets) {
    const columns = module.experiments.flatMap(experiment => {
      const matches = dataset.experiments.filter(item => item.id === experiment.id);
      const entry = matches.length === 1 ? matches[0] : null;
      if (!entry) { issues.push(`${experiment.id}：整体数据身份缺失或不唯一`); return []; }
      return entry.rows.map(row => {
        const cells = Object.fromEntries(dataset.fields.map(field => {
          const reason = entry.reason || (entry.rows.filter(item => item.groupId === row.groupId).length !== 1 ? "组身份不唯一" : "")
            || contractProblem(dataset.contract, entry.contract, field);
          const original = row.cells[field.key] || numeric(null);
          const cell = reason ? numeric(null, reason, "unalignable") : clone(original);
          const evidence = { moduleId: module.moduleId, moduleScope: module.id, datasetKey: dataset.key,
            sourceId: dataset.sourceId, sourceVersion: entry.contract?.sourceVersion, mode: dataset.mode,
            experimentId: experiment.id, groupId: row.groupId, metricKey: field.key };
          return [field.key, { ...cell, evidence, token: matrixEvidenceToken(evidence) }];
        }));
        return { key: matrixColumnKey(experiment.id, row.groupId), experimentId: experiment.id,
          ...(experiment.libraId ? { libraId: experiment.libraId, qxExperimentId: experiment.qxExperimentId,
            experimentLabel: experimentLabel(experiment) } : {}),
          experimentName: experiment.name, groupId: row.groupId, groupName: row.groupName, control: row.control,
          input: experiment.input, definition: experiment.definition, cells };
      });
    });
    if (!columns.some(column => Object.values(column.cells).some(cell => cell.status !== "unalignable"))) {
      issues.push(`${dataset.title}：${columns[0] && Object.values(columns[0].cells)[0]?.reason || "缺少整体记录"}`); continue;
    }
    datasets.push({ ...dataset, columns });
  }
  return { datasets, issues };
}
export function matrixView(state, comparison, datasetKey) {
  state.matrix ||= { datasetKey: comparison.datasets[0]?.key, datasets: {} };
  const matrix = state.matrix;
  const dataset = comparison.datasets.find(dataset => dataset.key === (datasetKey ?? matrix.datasetKey))
    || (datasetKey === undefined ? comparison.datasets[0] : null);
  if (!dataset) return { matrix };
  if (datasetKey === undefined) matrix.datasetKey = dataset.key;
  const reading = matrix.datasets[dataset.key] ||= { selected: dataset.columns.map(column => column.key),
    transposed: false, search: "", experimentId: state.experimentId };
  return { matrix, dataset, reading };
}
export function matrixSelection(dataset, reading) {
  const columns = dataset.columns.filter(column => reading.selected.includes(column.key));
  return { columns, experiments: new Set(columns.map(column => column.experimentId)).size,
    validExperiments: new Set(columns.filter(column => Object.values(column.cells).some(cell => cell.status === "value"))
      .map(column => column.experimentId)).size };
}
export function findMatrixCell(comparison, token) {
  for (const dataset of comparison.datasets) for (const column of dataset.columns) {
    const cell = Object.values(column.cells).find(cell => cell.token === token);
    if (cell) return { dataset, column, cell };
  }
  return null;
}
export function locateMatrixEvidence(module, evidence) {
  const experiment = module.experiments.find(item => item.id === evidence.experimentId);
  const matches = experiment?.datasets.filter(dataset => dataset.sourceId === evidence.sourceId
    && dataset.sourceVersion === evidence.sourceVersion && dataset.mode === evidence.mode) || [];
  if (matches.length !== 1) return { experiment, reason: "原快照未保存唯一的对应数据集" };
  const dataset = matches[0], rows = dataset.records.filter(row => row.groupId === evidence.groupId);
  if (rows.length !== 1 || !dataset.fields.some(field => field.key === evidence.metricKey))
    return { experiment, reason: "原快照未保存唯一的对应组别 / 指标记录" };
  return { experiment, dataset, datasetIndex: experiment.datasets.indexOf(dataset), row: rows[0] };
}
