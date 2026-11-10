import assert from "node:assert/strict";
import { build } from "esbuild";
import { computeModuleCalculations, calculateBinary, formatCalculatedValue, localCalculationContext } from "../src/analysis-module-calculation-runtime.js";
import { initializeMultiAnalysis, createAnalysisTask, executeAnalysisTask, createTaskReport, experimentInput } from "../src/multi-experiment-data.js";
import { buildReportModules, demoModuleReport, moduleView } from "../src/multi-report-content.js";
import { reportDescriptor, renderMultiReport } from "../src/multi-experiment-report.js";
// In-memory bundle follows Vite's existing JSON imports without changing app sources.
const bundle = await build({ stdin: { contents: 'export * from "./src/analysis-module-data.js"; export { runModule } from "./src/analysis-module-runner.js";',
  resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm" });
const { newAnalysisModule, builtinSource, calculationMetricRef, newCalculatedMetric, initializeModules,
  moduleConfiguration, moduleIssues, runModule } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const clone = value => structuredClone(value);
let count = 0;
const check = (name, test) => { test(); count++; console.log(`PASS ${name}`); };
check("Four operations retain raw values, valid zero and negatives", () => {
  assert(Math.abs(calculateBinary(1.23456, "+", .00004).value - 1.2346) < 1e-12);
  assert.equal(calculateBinary(1, "-", 3).value, -2);
  assert.equal(calculateBinary(-2, "*", 3).value, -6);
  assert.equal(calculateBinary(0, "/", 2).value, 0);
  assert.equal(calculateBinary(2000, "/", 10000).value, .2);
  assert.equal(formatCalculatedValue(.2, { format: "percent", precision: 2 }), "20.00%");
  assert(!formatCalculatedValue(Number.MAX_VALUE, { format: "percent", precision: 2 }).includes("∞"));
  for (const input of [null, undefined, "2", Infinity]) assert.equal(calculateBinary(input, "+", 1).value, null);
  assert.equal(calculateBinary(1, "/", 0).reason, "分母为 0");
  assert.equal(calculateBinary(Number.MAX_VALUE, "*", 2).value, null);
});
const store = { abilities: [], analysis: newAnalysisModule() };
initializeModules(store);
const single = store.modules.find(module => module.id === "calculated-metrics-demo");
const attempt = await runModule(store, single, () => {});
check("Whole module trial stores ratio, inputs, formula and original rows", () => {
  assert.equal(attempt.status, "success");
  const record = attempt.records.find(record => record.calculated), key = single.calculatedMetrics[0].key;
  assert.equal(record.rawRows[0][key], .2);
  assert.deepEqual(record.rawRows[0].calculationInputs[key], { left: 2000, right: 10000 });
  assert(record.fields.find(field => field.key === key).formulaText.includes("核销用户数"));
  assert.equal(attempt.records[0].rawRows[0].coupon_2, 2000);
});
const frozenAttempt = JSON.stringify(attempt);
single.sources[0].metricKeys = ["coupon_0"];
check("Removing a dependency blocks whole trial but allows an original-source trial", () => {
  assert(moduleIssues(store, single).length);
});
const sourceTrial = await runModule(store, single, () => {}, single.sources[0].id);
check("Source trial never validates a broken formula or rewrites history", () => {
  assert.equal(sourceTrial.status, "success");
  assert(!sourceTrial.records.some(record => record.calculated));
  assert(sourceTrial.gaps.some(gap => gap.includes("未验证模块计算指标")));
  assert.equal(JSON.stringify(attempt), frozenAttempt);
});
// Deliberately equal names: identity and native group IDs are the only join keys.
const grain = { schemaVersion: 1, population: "verified-test-population", entity: "user",
  experimentNamespace: "test-libra", groupNamespace: "test-groups", windowSemantics: "inclusive",
  dimensions: [] };
const source = id => ({ id, capabilityId: id, kind: "rpc", version: 1, metricKeys: ["value"], dimensionKeys: ["overall"],
  definition: { name: "same name", metrics: [{ key: "value", name: "same metric", role: "metric", type: "number" }],
    dimensions: [{ key: "overall", name: "整体", calculationGrain: clone(grain) }] } });
const a = source("a"), b = source("b"), metric = newCalculatedMetric();
metric.name = "ratio"; metric.formula.left = calculationMetricRef(a, "value"); metric.formula.right = calculationMetricRef(b, "value");
const module = { sources: [a, b], calculatedMetrics: [metric] };
const record = (input, value, experiment = "EXP-1", group = "g1") => ({ id: input.id, sourceId: input.id,
  modeName: "same name · 整体", fields: [{ key: "value", alias: "native", role: "metric", type: "number" }],
  rawRows: [{ group_id: group, group_name: "same label", native: value }],
  calculationContext: localCalculationContext(input, "overall", {
    libra_id: experiment, start_date: "2026-10-01", end_date: "2026-10-03" }, [], grain) });
check("Cross-source matching uses confirmed grain, not row order", () => {
  const left = record(a, 2), right = record(b, 10);
  left.rawRows.push({ group_id: "g2", group_name: "same label", native: 6 });
  right.rawRows.unshift({ group_id: "g2", group_name: "same label", native: 3 });
  const result = computeModuleCalculations(module, [left, right]);
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.records[0].rawRows.map(row => row[metric.key]), [.2, 2]);
});
check("Different experiments never cross-calculate and remain separate datasets", () => {
  const result = computeModuleCalculations(module, [record(a, 2), record(b, 10, "EXP-2")]);
  assert.equal(result.records.length, 2);
  assert(result.records.every(record => record.rawRows.every(row => row[metric.key] === null)));
  assert(result.records.every(record => record.rawRows[0].calculationReasons[metric.key] === "缺少匹配行"));
});
check("Duplicate keys and unverified shared grains yield explicit errors", () => {
  const duplicate = record(a, 2); duplicate.rawRows.push(clone(duplicate.rawRows[0]));
  assert(computeModuleCalculations(module, [duplicate, record(b, 10)]).issues.some(issue => issue.code === "duplicate-key"));
  const unshared = clone(module); delete unshared.sources[1].definition.dimensions[0].calculationGrain;
  assert(computeModuleCalculations(unshared, [record(a, 2), record(b, 10)]).issues.some(issue => issue.code === "incompatible-grain"));
});
check("Multiple producer modes cannot overwrite the same grain silently", () => {
  const repeated = clone(module);
  repeated.sources[1].dimensionKeys.push("other");
  repeated.sources[1].definition.dimensions.push({ key: "other", kind: "overall", name: "another name", calculationGrain: clone(grain) });
  const extra = record(b, 20); extra.calculationContext.modeId = "other";
  const result = computeModuleCalculations(repeated, [record(a, 2), record(b, 10), extra]);
  assert(result.issues.some(issue => issue.code === "duplicate-key"));
  assert.equal(result.records[0].rawRows[0][metric.key], null);
});
check("Constant zero yields a reason for each row and no significance", () => {
  const constant = clone(module); constant.calculatedMetrics[0].formula.right = { type: "constant", value: 0 };
  const result = computeModuleCalculations(constant, [record(a, 2)]);
  assert.equal(result.issues.length, 0);
  assert.equal(result.records[0].rawRows[0].calculationReasons[metric.key], "分母为 0");
  assert.equal(result.records[0].rawRows[0][metric.key], null);
  assert(!result.records[0].fields.some(field => field.sig || field.uplift));
});
initializeMultiAnalysis(store);
const multi = store.modules.find(module => module.id === "multi-calculated-demo");
multi.sources[0].showInReport = false;
const draft = { analysisType: "multi", goal: "平台老客提频", templateId: "demo-template-multi",
  experiments: ["DEMO-001", "DEMO-002"].map(experimentInput), scenario: "normal", supplement: "" };
const task = createAnalysisTask(store, draft, { trialModule: { ...moduleConfiguration(multi), id: multi.id } });
multi.calculatedMetrics[0].name = "changed current draft";
await executeAnalysisTask(task, () => {}, 0);
const report = createTaskReport(store, task);
check("Multi trial stores separate overall and breakdown calculations with hidden raw sources", () => {
  assert.equal(task.status, "success");
  const content = buildReportModules(report)[0];
  assert.equal(content.experiments[0].datasets.length, 2);
  assert(content.experiments.every(experiment => experiment.datasets.every(dataset => dataset.calculated)));
  assert.notEqual(content.experiments[0].datasets[0].records[1].cells[0].raw, content.experiments[1].datasets[0].records[1].cells[0].raw);
  assert(content.experiments[0].datasets[0].fields[0].name !== multi.calculatedMetrics[0].name);
  assert(content.experiments[0].datasets[1].records.length > 2);
  assert(content.experiments[0].datasets[1].records.some(row => row.label === "较高消费力"));
});
check("Saved trial formulas and values survive matrix rendering without aligning unpublished calculations", () => {
  const before = JSON.stringify(report), descriptor = reportDescriptor(report), view = {};
  const savedDatasets = structuredClone(descriptor.moduleContent[0].experiments.map(experiment => experiment.datasets));
  renderMultiReport(descriptor, view);
  moduleView(view, descriptor.moduleContent[0]).experimentId = "DEMO-002";
  const html = renderMultiReport(descriptor, view);
  assert(!html.includes("data-mm-select"));
  assert(html.includes("当前模块无可对齐的整体数据"));
  assert(html.includes("计算结果缺少可验证的执行身份或来源版本"));
  assert.deepEqual(descriptor.moduleContent[0].experiments.map(experiment => experiment.datasets), savedDatasets);
  assert.equal(JSON.stringify(report), before);
  const hidden = clone(report);
  hidden.results.forEach(result => result.moduleCalculations[multi.id].records.forEach(record =>
    record.fields.filter(field => field.calculated).forEach(field => { field.showInReport = false; })));
  assert.equal(buildReportModules(hidden)[0].experiments[0].datasets.length, 0);
});
check("Existing multi report demo contains saved calculations, not draft recomputation", () => {
  const demo = demoModuleReport(), before = JSON.stringify(demo);
  assert(buildReportModules(demo)[0].experiments[0].datasets.some(dataset => dataset.calculated));
  assert.equal(JSON.stringify(demo), before);
});
console.log(`\n${count} runtime, trial and snapshot checks passed.`);
