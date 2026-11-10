import assert from "node:assert/strict";
import { build } from "esbuild";
import { orderedItems, moveOrderedKey, applyModuleRecordOrder, applyModuleDatasetOrder, pruneModuleReportOrder } from "../src/analysis-module-report-order.js";
import { initializeMultiAnalysis, createAnalysisTask, executeAnalysisTask, createTaskReport, experimentInput } from "../src/multi-experiment-data.js";
import { buildReportModules } from "../src/multi-report-content.js";
import { captureMatrixSnapshot, buildMatrixComparisons } from "../src/matrix-report-data.js";

const bundle = await build({ stdin: { contents: 'export * from "./src/analysis-module-data.js"; export { runModule } from "./src/analysis-module-runner.js";',
  resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm" });
const { newAnalysisModule, initializeModules, moduleConfiguration, moduleHash, copyModuleSources, runModule } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const clone = value => structuredClone(value);
let count = 0;
const check = (name, test) => { test(); count++; console.log(`PASS ${name}`); };
const store = { abilities: [], analysis: newAnalysisModule() };
initializeModules(store); initializeMultiAnalysis(store);
check("Unconfigured legacy modules omit reportOrder and keep their display defaults", () => {
  const module = store.modules.find(module => module.id === "core-overall");
  assert(!Object.hasOwn(moduleConfiguration(module), "reportOrder"));
  const data = [{ sourceId: module.sources[0].id, fields: [{ key: "b" }, { key: "a" }],
    records: [{ cells: [2, 1] }] }];
  assert.deepEqual(applyModuleDatasetOrder(module, data), data);
});
check("Removed and duplicate keys are ignored; newly selected items append stably", () => {
  const fields = ["a", "b", "new", "other"].map(key => ({ key }));
  assert.deepEqual(orderedItems(fields, ["removed", "b", "b", "a"]).map(field => field.key), ["b", "a", "new", "other"]);
  assert.deepEqual(moveOrderedKey(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
  assert.equal(moveOrderedKey(["a"], "a", "missing"), null);
  const module = { sources: [{ id: "source", metricKeys: ["b"], dimensionKeys: [] }],
    reportOrder: { blocks: ["removed", "source"], metrics: { source: ["a", "b"] } } };
  pruneModuleReportOrder(module);
  module.sources[0].metricKeys.push("a");
  assert.deepEqual(orderedItems(fields, module.reportOrder.metrics.source).map(field => field.key), ["b", "a", "new", "other"]);
  assert.deepEqual(module.reportOrder.blocks, ["source"]);
});
check("Fields and their cells move together; equal metric keys across sources remain independent", () => {
  const module = { sources: [{ id: "a" }, { id: "b" }], reportOrder: {
    blocks: ["b", "a"], metrics: { a: ["y", "x"] }, dimensions: { a: ["drill", "overall"] }
  } };
  const data = ["a", "b"].flatMap(sourceId => ["overall", "drill"].map(mode => ({ sourceId, mode,
    fields: [{ key: "x" }, { key: "y" }], records: [{ cells: [`${sourceId}-x`, `${sourceId}-y`] }] })));
  const frozen = JSON.stringify(data), ordered = applyModuleDatasetOrder(module, data);
  assert.deepEqual(ordered.map(item => [item.sourceId, item.mode]), [["b", "overall"], ["b", "drill"], ["a", "drill"], ["a", "overall"]]);
  assert.deepEqual(ordered[2].records[0].cells, ["a-y", "a-x"]);
  assert.deepEqual(ordered[0].records[0].cells, ["b-x", "b-y"]);
  assert.equal(JSON.stringify(data), frozen);
});
check("Record sorting preserves identity, dimension fields, raw rows and evidence", () => {
  const module = { sources: [{ id: "a" }], reportOrder: { metrics: { a: ["y", "x"] } } };
  const fields = [{ key: "group", role: "identity" }, { key: "city", role: "dimension" },
    { key: "x", role: "metric" }, { key: "y", role: "metric" }];
  const records = [{ sourceId: "a", fields, snapshot: { fields }, rawRows: [{ group: "g1", city: "city", x: 0, y: -2 }],
    evidence: [{ metricKey: "x", text: "0" }] }];
  const frozen = JSON.stringify(records), [ordered] = applyModuleRecordOrder(module, records);
  assert.deepEqual(ordered.fields.map(field => field.key), ["group", "city", "y", "x"]);
  assert.deepEqual(ordered.snapshot.fields, ordered.fields);
  assert.deepEqual(ordered.rawRows, records[0].rawRows);
  assert.deepEqual(ordered.evidence, records[0].evidence);
  assert.equal(JSON.stringify(records), frozen);
});
const module = clone(store.modules.find(module => module.id === "multi-calculated-demo"));
const sourceId = module.sources[0].id, second = clone(module.calculatedMetrics[0]);
second.key = "calc-order-second"; second.name = "GMV × 2"; second.formula.operator = "*";
second.formula.right = { type: "constant", value: 2 };
module.calculatedMetrics.push(second);
const oldHash = moduleHash(module), published = moduleConfiguration(module);
module.calculatedMetrics.reverse();
module.reportOrder = { blocks: ["module-calculations", sourceId],
  metrics: { [sourceId]: ["gmv", "dac"] }, dimensions: { [sourceId]: ["demo-spend", "overall"] } };
check("Order participates in configuration hashes and copy remaps every source identity", () => {
  assert.notEqual(moduleHash(module), oldHash);
  assert(!published.reportOrder);
  const copied = copyModuleSources(module), id = copied.sources[0].id;
  assert.notEqual(id, sourceId);
  assert.deepEqual(copied.reportOrder.blocks, ["module-calculations", id]);
  assert.deepEqual(copied.reportOrder.metrics[id], ["gmv", "dac"]);
  assert.deepEqual(copied.reportOrder.dimensions[id], ["demo-spend", "overall"]);
  assert.equal(copied.calculatedMetrics[0].formula.left.sourceId, id);
  copied.reportOrder.metrics[id].reverse();
  assert.deepEqual(module.reportOrder.metrics[sourceId], ["gmv", "dac"]);
});
const single = clone(module);
single.analysisType = "single"; single.context = { ...single.context, libra_id: "DEMO-001", start_date: "2026-10-01", end_date: "2026-10-03" };
const before = clone(single); before.calculatedMetrics.reverse(); delete before.reportOrder;
const baselineAttempt = await runModule(store, before, () => {});
const frozenAttempt = JSON.stringify(baselineAttempt);
const attempt = await runModule(store, single, () => {});
check("Single trial sorts calculation fields and source dimensions without changing any calculation", () => {
  assert.equal(attempt.status, "success");
  assert.equal(attempt.records[0].sourceId, "module-calculations");
  assert.deepEqual(attempt.records[0].fields.filter(field => field.calculated).map(field => field.key), single.calculatedMetrics.map(metric => metric.key));
  assert.deepEqual(attempt.records.filter(record => record.sourceId === sourceId).map(record => record.modeId), ["demo-spend", "overall"]);
  for (const record of attempt.records) {
    const baseline = baselineAttempt.records.find(other => other.sourceId === record.sourceId && other.modeId === record.modeId);
    assert.deepEqual(record.rawRows, baseline.rawRows);
  }
  assert.equal(JSON.stringify(baselineAttempt), frozenAttempt);
});
const draft = { analysisType: "multi", goal: "平台老客提频", templateId: "demo-template-multi",
  experiments: ["DEMO-001", "DEMO-002"].map(experimentInput), scenario: "normal", supplement: "" };
const task = createAnalysisTask(store, draft, { trialModule: { ...moduleConfiguration(module), id: module.id } });
await executeAnalysisTask(task, () => {}, 0);
const report = createTaskReport(store, task);
check("Multi reports use saved metric and block order with cells matched by original field identity", () => {
  assert.equal(task.status, "success");
  const content = buildReportModules(report)[0];
  for (const experiment of content.experiments) {
    assert.equal(experiment.datasets[0].sourceId, "module-calculations");
    assert.deepEqual(experiment.datasets[0].fields.map(field => field.key), module.calculatedMetrics.map(metric => metric.key));
    const raw = experiment.datasets.find(dataset => dataset.sourceId === sourceId);
    assert.equal(raw.mode, "demo-spend");
    assert.deepEqual(raw.fields.map(field => field.key), ["gmv", "dac"]);
    const original = report.results.find(result => result.id === experiment.id).breakdowns[0];
    assert.equal(raw.records[0].cells[0].raw, original.values.gmv.value);
    assert.equal(raw.records[0].cells[1].raw, original.values.dac.value);
  }
});
check("Matrix snapshots preserve configured row order and remain alignable", () => {
  // A private trial has version 0. Matrix evidence requires a published version.
  const matrixReport = clone(report);
  matrixReport.snapshot.modules[0].version = 1;
  matrixReport.matrixSnapshot = captureMatrixSnapshot(matrixReport);
  const saved = matrixReport.matrixSnapshot[0].datasets;
  assert.equal(saved[0].sourceId, "module-calculations");
  assert.deepEqual(saved[0].fields.map(field => field.key), module.calculatedMetrics.map(metric => metric.key));
  assert.deepEqual(saved[1].fields.map(field => field.key), ["gmv", "dac"]);
  const comparison = buildMatrixComparisons(matrixReport, buildReportModules(matrixReport)[0]);
  assert.equal(comparison.datasets[0].sourceId, "module-calculations");
  assert(comparison.datasets.every(dataset => dataset.columns.every(column =>
    Object.values(column.cells).every(cell => cell.status !== "unalignable"))));
});
check("Changing current draft after report generation cannot reorder a saved report or published version", () => {
  const frozen = JSON.stringify(report), view = JSON.stringify(buildReportModules(report));
  module.reportOrder.blocks.reverse(); module.calculatedMetrics.reverse();
  module.reportOrder.metrics[sourceId].reverse();
  buildReportModules(report);
  assert.equal(JSON.stringify(report), frozen);
  assert.equal(JSON.stringify(buildReportModules(report)), view);
  assert(!published.reportOrder);
});
console.log(`\n${count} report order and snapshot checks passed.`);
