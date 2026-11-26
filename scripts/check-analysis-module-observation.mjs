import assert from "node:assert/strict";
import { moduleObservationInput } from "../src/analysis-module-observation.js";
import { calculationCandidatesFor, parseCalculationNotes } from "../src/analysis-module-calculations.js";
import { createAnalysisTask, executeAnalysisTask, createTaskReport, experimentInput, demoGoal } from "../src/multi-experiment-data.js";
import { demoModuleReport } from "../src/multi-report-content.js";
import { reportDescriptor } from "../src/multi-experiment-report.js";

const input = { start: "2026-11-01", end: "2026-11-10" };
const definition = { period: ["2026-11-01", "2026-11-05"] };
assert.equal(moduleObservationInput({}, input, definition).input, input);
assert.equal(moduleObservationInput({ observation: { anchor: "start", days: 7 } }, input, definition).input.end, "2026-11-08");
assert.equal(moduleObservationInput({ observation: { anchor: "end", days: 0 } }, input, definition).input.end, "2026-11-05");
assert.equal(moduleObservationInput({ observation: { anchor: "end", days: 2147483647 } }, input, definition).input, input);
assert.match(moduleObservationInput({ observation: { anchor: "end", days: 0 } }, { ...input, start: "2026-11-06" }, definition).error, /无可用数据/);
assert.match(moduleObservationInput({ observation: { anchor: "start", days: 1.5 } }, input, definition).error, /无效/);

const { configuration } = demoModuleReport().snapshot.modules[0];
const candidates = calculationCandidatesFor(configuration, source => source.definition);
const parsed = parseCalculationNotes("每支付天 GMV = 人均支付 GMV ÷ 支付天 (DAC)\n无效 = 人均支付 GMV / 0", candidates);
assert.equal(parsed.length, 1);
assert.deepEqual([parsed[0].name, parsed[0].formula.left.key, parsed[0].formula.right.key], ["每支付天 GMV", "gmv", "dac"]);
assert.equal(parseCalculationNotes("错误 = 未选指标 + 100", candidates).length, 0);
assert.equal(parseCalculationNotes("错误 = 人均支付 GMV + 100", [...candidates, { ...candidates.find(metric => metric.ref.key === "gmv") }]).length, 0);

const savedModules = [
  { id: "whole", configuration: { ...configuration, name: "跟随实验分析" } },
  { id: "shortened", configuration: { ...configuration, name: "观察至第 7 天", calculatedMetrics: parsed, observation: { anchor: "start", days: 7 } } }
];
const store = {
  multiAnalysis: { tasks: [], reports: [] }, reportTemplates: [],
  modules: savedModules.map(module => ({ ...module, enabled: true, versions: [{ number: 1, configuration: module.configuration }] }))
};
const task = createAnalysisTask(store, {
  analysisType: "multi", goal: demoGoal, moduleIds: savedModules.map(module => module.id),
  experiments: ["DEMO-001", "DEMO-002"].map(id => experimentInput(id))
});
await executeAnalysisTask(task, () => {}, 0);
assert.equal(task.status, "success");
const result = task.results[0];
assert.equal(task.snapshot.experiments[0].input.end, "2026-10-14");
assert.equal(result.moduleObservations.shortened.end, "2026-10-08");
assert.equal(result.moduleCalculations.shortened.records[0].context.end_date, "2026-10-08");
const saved = createTaskReport(store, task), report = reportDescriptor(saved);
const [whole, shortened] = report.moduleContent;
assert.equal(whole.experiments[0].input.end, "2026-10-14");
assert.equal(shortened.experiments[0].input.end, "2026-10-08");
const byKey = (module, key) => module.comparison.datasets[0].columns.find(column => !column.control).cells[key].value;
assert(byKey(shortened, "dac") < byKey(whole, "dac"));
assert(shortened.comparison.datasets.some(dataset => dataset.mode === "calculated:overall"));
const original = JSON.stringify(saved);
store.modules[1].versions[0].configuration.observation.days = 3;
assert.equal(JSON.stringify(saved), original);
assert.equal(reportDescriptor(saved).moduleContent[1].experiments[0].input.end, "2026-10-08");

console.log("模块观测区间、计算公式识别与报告快照检查通过。");
