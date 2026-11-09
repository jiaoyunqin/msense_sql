import assert from "node:assert/strict";
import {
  copy, experimentInput, resolveExperiment, parseExperimentIds, addExperimentInputs, selectExperimentCandidate,
  initializeMultiAnalysis, workbenchIssues, createAnalysisTask, executeAnalysisTask, createTaskReport, comparisonBoundaries
} from "../src/multi-experiment-data.js";
import { experimentPairKey, findExperimentResult } from "../src/experiment-identity.js";
import { demoMixedModuleReport, moduleView, singleScope, datasetScope } from "../src/multi-report-content.js";
import { reportDescriptor, renderMultiReport, applyModuleReportEvent, prepareModuleCitation, multiAnswer } from "../src/multi-experiment-report.js";
import { matrixPresentation, captureMatrixSnapshot, matrixSelection, matrixEvidenceScope, locateMatrixEvidence } from "../src/matrix-report-data.js";
import { comparisonCalculationRecords, computeModuleCalculations } from "../src/analysis-module-calculation-runtime.js";

let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };
const candidateInput = suffix => experimentInput("DEMO-001", { qxExperimentId: `DEMO-001-QX-${suffix}` });
const seed = demoMixedModuleReport();
const core = seed.snapshot.modules.find(module => module.id === "multi-core").configuration;
const preAA = seed.snapshot.modules.find(module => module.id === "preaa").configuration;
const store = { modules: [
  ...["multi-core", "multi-strategy", "multi-detail"].map(id => ({ id, enabled: true,
    versions: [{ number: 1, configuration: { ...copy(core), id } }] })),
  { id: "single-demo-core", enabled: true, versions: [{ number: 1, configuration: { ...copy(core), analysisType: "single" } }] },
  { id: "preaa", enabled: true, versions: [{ number: 1, configuration: copy(preAA) }] }
] };
initializeMultiAnalysis(store);
const draft = { analysisType: "multi", goal: "平台老客提频", templateId: "demo-template-mixed",
  experiments: [candidateInput("01"), candidateInput("02")], supplement: "" };
const event = (report, view, data, value, type = "change", checked = false) => {
  const target = { dataset: data, value, checked, getAttribute: () => "" };
  return applyModuleReportEvent({ type, target: { closest: () => target } }, report, view);
};

check("重复 Libra ID 可新增两行，候选尚未选定时不自动归属或发起分析", () => {
  const inputs = [];
  assert.deepEqual(addExperimentInputs(inputs, parseExperimentIds("demo-001, DEMO-001 DEMO-002 DEMO-002").ids),
    { added: 3, duplicates: 1 });
  assert.notEqual(inputs[0].rowId, inputs[1].rowId);
  assert.equal(inputs[0].qxExperimentId, "");
  assert.equal(inputs[1].qxExperimentId, "");
  assert.equal(inputs[0].start, "");
  assert(workbenchIssues(store, { ...draft, experiments: inputs }).some(issue => issue.includes("请先选择")));
});
check("同 ID 的第二候选可在首次选择后新增；再次解析不重置已有日期", () => {
  const inputs = [];
  addExperimentInputs(inputs, ["DEMO-001"]);
  selectExperimentCandidate(inputs, inputs[0].rowId, "DEMO-001-QX-02");
  inputs[0].end = "2026-10-20";
  const saved = JSON.stringify(inputs[0]);
  assert.deepEqual(addExperimentInputs(inputs, ["DEMO-001"]), { added: 1, duplicates: 0 });
  assert.equal(JSON.stringify(inputs[0]), saved);
  assert.equal(inputs[1].qxExperimentId, "");
  assert.deepEqual(addExperimentInputs(inputs, ["DEMO-001"]), { added: 0, duplicates: 1 });
});
check("重复候选选择被拦截，稳定行身份与另外一行的候选、日期保持", () => {
  const inputs = [];
  addExperimentInputs(inputs, ["DEMO-001", "DEMO-001"]);
  const [a, b] = inputs;
  selectExperimentCandidate(inputs, a.rowId, "DEMO-001-QX-01");
  a.end = "2026-10-21";
  const saved = JSON.stringify(a), before = JSON.stringify(b);
  assert.throws(() => selectExperimentCandidate(inputs, b.rowId, a.qxExperimentId), /已添加/);
  assert.equal(JSON.stringify(b), before);
  selectExperimentCandidate(inputs, b.rowId, "DEMO-001-QX-02");
  assert.equal(JSON.stringify(a), saved);
  assert.deepEqual([b.start, b.end], ["2026-10-01", "2026-10-07"]);
  assert.equal(selectExperimentCandidate(inputs, a.rowId, a.qxExperimentId), false);
  assert.equal(JSON.stringify(a), saved);
  inputs.splice(inputs.findIndex(input => input.rowId === b.rowId), 1);
  assert.equal(JSON.stringify(inputs[0]), saved);
});
check("按 ID × 候选项去重；同候选改观察日期仍为重复组合", () => {
  assert.equal(workbenchIssues(store, draft).length, 0);
  assert.throws(() => createAnalysisTask(copy(store), {
    ...draft, experiments: [candidateInput("01"), { ...candidateInput("01"), end: "2026-10-20" }]
  }), /组合不能重复/);
  assert.throws(() => createAnalysisTask(copy(store), {
    ...draft, analysisType: "single", templateId: "demo-template-single"
  }), /只能选择/);
});
check("旧输入缺省候选与显式主候选按同一组合去重", () => {
  const legacy = candidateInput("01");
  delete legacy.qxExperimentId;
  assert.equal(experimentPairKey(legacy, resolveExperiment(legacy)), experimentPairKey(candidateInput("01")));
  assert(workbenchIssues(store, { ...draft, experiments: [legacy, candidateInput("01")] })
    .some(issue => issue.includes("组合不能重复")));
});

const task = createAnalysisTask(store, draft);
task.results.reverse();
await executeAnalysisTask(task, () => {}, 0);
const saved = createTaskReport(store, task);
check("同 ID 不同候选分别取数，结果顺序变化不串联日期、组别与数据", () => {
  assert.equal(task.status, "success");
  assert(saved);
  const [a, b] = task.snapshot.experiments.map(entry => findExperimentResult(task.results, entry, task.snapshot));
  assert.notEqual(a.analysisKey, b.analysisKey);
  assert.equal(a.rows[0].days, 14);
  assert.equal(b.rows[0].days, 7);
  assert.equal(a.rows[0].values.dac.value, b.rows[0].values.dac.value * 2);
  assert.equal(a.rows[0].qxExperimentId, "DEMO-001-QX-01");
  assert.equal(b.rows[0].qxExperimentId, "DEMO-001-QX-02");
  const before = JSON.stringify(task.snapshot);
  draft.experiments[1].end = "2026-10-20";
  assert.equal(JSON.stringify(task.snapshot), before);
  draft.experiments[1] = candidateInput("02");
});
check("同 ID 两份单实验结论与 PreAA 证据、计算执行身份分别保存", () => {
  const report = reportDescriptor(saved);
  for (const module of report.moduleContent) {
    const [a, b] = module.experiments;
    assert.notEqual(a.id, b.id);
    assert.match(a.id, /^[A-Za-z][A-Za-z0-9_-]*$/);
    assert.match(b.id, /^[A-Za-z][A-Za-z0-9_-]*$/);
    assert.equal(a.libraId, b.libraId);
    assert(a.label.includes("QX-01") && b.label.includes("QX-02"));
    assert(a.conclusions.every(item => item.scope === singleScope(module.index, a.id)));
    assert(b.conclusions.every(item => item.scope === singleScope(module.index, b.id)));
  }
  const coreModule = report.moduleContent.find(module => module.moduleId === "multi-core");
  assert.notDeepEqual(coreModule.experiments[0].datasets[0].records, coreModule.experiments[1].datasets[0].records);
  for (const entry of saved.snapshot.experiments) {
    const result = findExperimentResult(saved.results, entry, saved.snapshot);
    assert(result.preAA);
    assert(result.moduleCalculations["multi-core"].records.every(record =>
      record.calculationContext.qxExperimentId === entry.input.qxExperimentId
      && record.context.qx_experiment_id === entry.input.qxExperimentId));
  }
});
check("原下拉形态在同 ID 场景下区分候选，模块/表格状态及 AI 引用独立", () => {
  const report = reportDescriptor(saved), view = {};
  const [pre, multi] = report.moduleContent, [a, b] = pre.experiments;
  const html = renderMultiReport(report, view);
  assert(html.includes("钱效实验 ID") && html.includes("DEMO-001-QX-02"));
  event(report, view, { mmSelect: pre.id }, b.id);
  assert.equal(moduleView(view, pre).experimentId, b.id);
  assert.equal(moduleView(view, multi).experimentId, multi.experiments[0].id);
  event(report, view, { mmModule: pre.id, mmExperiment: b.id, mmTable: "0", mmTranspose: "" }, "", "click");
  assert.equal(moduleView(view, pre).tables[`${b.id}:0`].transposed, true);
  assert.equal(moduleView(view, pre).tables[`${a.id}:0`].transposed, false);
  const citation = prepareModuleCitation(report, datasetScope(pre.index, 0, a.id), view);
  assert.equal(citation.scope, datasetScope(pre.index, 0, a.id));
  assert.equal(moduleView(view, pre).experimentId, a.id);
  const answer = multiAnswer(report, "核对数据", singleScope(pre.index, b.id), view).md;
  assert(answer.includes("QX-02") && !answer.includes("QX-01"));
});
check("矩阵将同 Libra ID 的候选拆成两个一级列头，各自组别/值/引用独立", () => {
  const matrix = copy(saved);
  matrix.presentation = matrixPresentation;
  matrix.matrixSnapshot = captureMatrixSnapshot(matrix);
  const report = reportDescriptor(matrix), module = report.moduleContent.find(module => module.moduleId === "multi-core");
  const coreDataset = module.comparison.datasets.find(dataset => dataset.mode === "overall");
  assert.equal(matrixSelection(coreDataset, { selected: coreDataset.columns.map(column => column.key) }).validExperiments, 2);
  assert.equal(coreDataset.columns.length, 6);
  assert.equal(new Set(coreDataset.columns.map(column => column.key)).size, 6);
  const a = coreDataset.columns.find(column => column.qxExperimentId === "DEMO-001-QX-01" && column.groupId === "001-A");
  const b = coreDataset.columns.find(column => column.qxExperimentId === "DEMO-001-QX-02" && column.groupId === "001-A");
  assert.equal(a.libraId, b.libraId);
  assert.equal(a.cells.dac.value, b.cells.dac.value * 2);
  assert.notEqual(a.cells.dac.token, b.cells.dac.token);
  assert.equal(locateMatrixEvidence(module, b.cells.dac.evidence).experiment.id, b.experimentId);
  const before = JSON.stringify(matrix), view = {};
  renderMultiReport(report, view);
  const quote = prepareModuleCitation(report, matrixEvidenceScope(b.cells.dac.evidence), view);
  assert.equal(moduleView(view, module).experimentId, b.experimentId);
  assert.equal(quote.focus, `[data-matrix-cell="${b.cells.dac.token}"]`);
  const answer = multiAnswer(report, "核对数据", matrixEvidenceScope(b.cells.dac.evidence), view).md;
  assert(answer.includes("QX-02") && !answer.includes("QX-01"));
  event(report, view, { matrixModule: module.id, matrixKey: coreDataset.key, matrixExperiment: b.experimentId }, "", "change", false);
  const reading = moduleView(view, module).matrix.datasets[coreDataset.key];
  assert.equal(matrixSelection(coreDataset, reading).experiments, 1);
  assert(coreDataset.columns.filter(column => reading.selected.includes(column.key)).every(column => column.qxExperimentId === "DEMO-001-QX-01"));
  assert.equal(JSON.stringify(matrix), before);
});
check("相同窗口/组别的两个候选可以并行计算，不合并输入行或跨候选运算", () => {
  const overallModule = copy(core);
  overallModule.sources.forEach(source => { source.dimensionKeys = ["overall"]; });
  const records = saved.snapshot.experiments.flatMap(entry => {
    const result = copy(findExperimentResult(saved.results, entry, saved.snapshot));
    const cloned = copy(entry);
    cloned.input.start = "2026-10-01"; cloned.input.end = "2026-10-07";
    result.rows.forEach(row => {
      row.values.dac.value = 2;
      row.values.gmv.value = entry.input.qxExperimentId.endsWith("01") ? 10 : 20;
    });
    return comparisonCalculationRecords(overallModule, result, cloned);
  });
  const calculated = computeModuleCalculations(overallModule, records);
  assert.deepEqual(calculated.issues, []);
  assert.equal(calculated.records.length, 2);
  for (const record of calculated.records) {
    const expected = record.calculationContext.qxExperimentId.endsWith("01") ? 5 : 10;
    assert(record.rawRows.filter(row => !row.is_control).every(row => row["demo-gmv-per-dac"] === expected));
  }
  const invalid = copy(records);
  invalid[0].calculationContext.qxExperimentId = "";
  assert(computeModuleCalculations(overallModule, invalid).issues.some(issue => issue.code === "record-context"));
});
check("矩阵拒绝钱效身份被替换的计算执行，不借用另一候选的记录", () => {
  const matrix = copy(saved);
  matrix.presentation = matrixPresentation;
  const entry = matrix.snapshot.experiments[1];
  const record = findExperimentResult(matrix.results, entry, matrix.snapshot).moduleCalculations["multi-core"].records[0];
  record.calculationContext.qxExperimentId = "DEMO-001-QX-01";
  matrix.matrixSnapshot = captureMatrixSnapshot(matrix);
  const module = reportDescriptor(matrix).moduleContent.find(module => module.moduleId === "multi-core");
  const dataset = module.comparison.datasets.find(dataset => dataset.mode === "calculated:overall");
  const cells = dataset.columns.filter(column => column.qxExperimentId === "DEMO-001-QX-02").flatMap(column => Object.values(column.cells));
  assert(cells.every(cell => cell.status === "unalignable" && cell.reason.includes("钱效候选项")));
});

const retryTask = createAnalysisTask(store, { ...draft, scenario: "fail-last",
  experiments: [candidateInput("01"), experimentInput("DEMO-002"), candidateInput("02")] });
await executeAnalysisTask(retryTask, () => {}, 0);
const partial = createTaskReport(store, retryTask), partialJSON = JSON.stringify(partial);
const firstJSON = JSON.stringify(retryTask.results[0]);
check("失败模拟仅作用于最后候选，同 ID 的已成功项保留；部分报告不借用成功项", () => {
  assert.deepEqual(retryTask.results.map(result => result.status), ["success", "success", "failed"]);
  const report = reportDescriptor(partial);
  assert.equal(report.moduleContent[1].experiments[2].status, "failed");
  assert.deepEqual(report.moduleContent[1].experiments[2].rows, []);
  assert(renderMultiReport(report, {}).includes("DEMO-001 · 钱效 ID DEMO-001-QX-02"));
  const firstOnly = { ...retryTask.snapshot, experiments: retryTask.snapshot.experiments.filter((_, index) => index !== 2) };
  assert.deepEqual(comparisonBoundaries(retryTask.snapshot, retryTask.results), comparisonBoundaries(firstOnly, retryTask.results));
});
await executeAnalysisTask(retryTask, () => {}, 0);
check("仅重试失败候选，成功项不改写，旧部分报告快照不变", () => {
  assert.deepEqual(retryTask.results.map(result => result.attempts), [1, 1, 2]);
  assert.equal(JSON.stringify(retryTask.results[0]), firstJSON);
  assert.equal(JSON.stringify(partial), partialJSON);
  assert.equal(retryTask.status, "success");
  assert(createTaskReport(store, retryTask));
});
check("缺少组合身份的历史结果只兼容唯一 Libra ID，不猜测重复 ID 的归属", () => {
  const legacy = copy(saved);
  legacy.snapshot.experiments = [legacy.snapshot.experiments[1]];
  legacy.results = [copy(findExperimentResult(saved.results, saved.snapshot.experiments[1], saved.snapshot))];
  delete legacy.results[0].analysisKey; delete legacy.results[0].qxExperimentId;
  assert.equal(reportDescriptor(legacy).moduleContent[1].experiments[0].status, "success");
  const ambiguous = copy(saved);
  ambiguous.results.forEach(result => { delete result.analysisKey; delete result.qxExperimentId; });
  assert(reportDescriptor(ambiguous).moduleContent.every(module => module.experiments.every(experiment => experiment.status === "failed")));
  const conflicting = copy(saved);
  conflicting.results[0].analysisKey = conflicting.results[1].analysisKey;
  assert.equal(findExperimentResult(conflicting.results, conflicting.snapshot.experiments[1], conflicting.snapshot), undefined);
});

console.log(`\n${checks} 项实验 ID × 钱效候选项语义检查通过。`);
