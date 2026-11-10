import assert from "node:assert/strict";
import { demoModuleReport, demoMixedModuleReport, demoMatrixModuleReport, buildReportModules, moduleView, datasetScope, singleScope } from "../src/multi-report-content.js";
import { reportDescriptor, reportListRow, renderMultiReport, applyModuleReportEvent, prepareModuleCitation, multiAnswer } from "../src/multi-experiment-report.js";
import { captureMatrixSnapshot, buildMatrixComparisons, matrixPresentation, matrixView, matrixSelection, matrixEvidenceScope, locateMatrixEvidence } from "../src/matrix-report-data.js";
import { computeModuleCalculations, comparisonCalculationRecords } from "../src/analysis-module-calculation-runtime.js";
import { initializeMultiAnalysis, experimentInput, createAnalysisTask, executeAnalysisTask, createTaskReport } from "../src/multi-experiment-data.js";

let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };
const copy = value => structuredClone(value);
const fresh = () => demoMatrixModuleReport();
const descriptor = (report, recapture = false) => {
  if (recapture) report.matrixSnapshot = captureMatrixSnapshot(report);
  return reportDescriptor(report);
};
const change = (report, view, data, value, type = "click", checked = false) => {
  const target = { dataset: data, value, checked, getAttribute(name) {
    const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return data[key] ?? null;
  } };
  return applyModuleReportEvent({ type, target: { closest: () => target } }, report, view);
};
const matrixEvent = (report, view, module, data, value, type, checked) =>
  change(report, view, { matrixModule: module.id, ...data }, value, type, checked);
const stateFor = (report, view, index = 0, datasetKey) => {
  const module = report.moduleContent[index], state = moduleView(view, module);
  return { module, state, ...matrixView(state, module.comparison, datasetKey) };
};
const numericShape = report => {
  const results = copy(report.results);
  for (const result of results) for (const saved of Object.values(result.moduleCalculations || {}))
    for (const record of saved.records) {
      record.id = "execution";
      record.evidence.forEach(item => { item.executionId = "execution"; });
    }
  return results;
};
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

check("所有多实验报告入口统一使用矩阵，保留独立路由、名称与保存的原值", () => {
  const original = demoModuleReport(), matrix = fresh();
  assert.equal(matrix.id, "r-multi-matrix");
  assert.equal(matrix.presentation, matrixPresentation);
  assert.equal(reportListRow(matrix).title, "多实验分析 · 跨实验数据对比");
  assert.equal(reportListRow(matrix).rid, matrix.id);
  assert.deepEqual(numericShape(matrix), numericShape(original));
  matrix.snapshot.experiments[0].definition.name = "独立编辑";
  assert.notEqual(original.snapshot.experiments[0].definition.name, "独立编辑");
  for (const saved of [original, demoMixedModuleReport(), { ...demoModuleReport(), id: "saved-task-report" }]) {
    const before = JSON.stringify(saved), report = descriptor(freeze(saved));
    const html = renderMultiReport(report, {});
    assert.equal(report.id, saved.id);
    assert.equal(report.presentation, matrixPresentation);
    assert(!html.includes("data-matrix-view"));
    assert.equal((html.match(/data-mm-select=/g) || []).length, saved.id === "r-mixed-modules" ? 1 : 0);
    for (const module of report.moduleContent.filter(module => module.analysisType === "multi")) {
      assert(module.comparison.datasets.length);
      const section = html.slice(html.indexOf(`data-mm-section="${module.id}"`));
      assert(section.indexOf("多实验分析结论") < section.indexOf('class="mx-experiment-row"'));
      assert(!section.includes(`data-mm-select="${module.id}"`));
      assert(!section.includes("单实验分析结论"));
    }
    assert.equal(JSON.stringify(saved), before);
  }
});

const generatedStore = { multiAnalysis: { tasks: [], reports: [], seeded: true },
  modules: demoModuleReport().snapshot.modules.map(module => ({
  id: module.id, name: module.configuration.name, enabled: true,
  versions: [{ number: module.version, configuration: copy(module.configuration) }]
})) };
initializeMultiAnalysis(generatedStore);
const generatedTask = createAnalysisTask(generatedStore, {
  analysisType: "multi", goal: "平台老客提频", templateId: "", moduleIds: generatedStore.modules.map(module => module.id),
  experiments: ["DEMO-003", "DEMO-001", "DEMO-002"].map(experimentInput), scenario: "normal"
});
await executeAnalysisTask(generatedTask, () => {}, 0);
const generatedSaved = createTaskReport(generatedStore, generatedTask);

check("工作台执行任务生成的正式报告直接采用两级大表格，不需要 Demo 展示标记", () => {
  const original = JSON.stringify(generatedSaved), report = descriptor(freeze(generatedSaved)), view = {};
  assert.equal(generatedSaved.presentation, undefined);
  assert.equal(generatedSaved.matrixSnapshot, undefined);
  assert.equal(generatedStore.multiAnalysis.reports[0], generatedSaved);
  const html = renderMultiReport(report, view);
  assert(!html.includes("data-mm-select") && !html.includes("单实验分析结论"));
  assert(html.includes('class="mx-experiment-row"') && html.includes('class="mx-group-row"'));
  for (const module of report.moduleContent) {
    assert.equal(change(report, view, { mmSelect: module.id }, "DEMO-002", "change"), false);
    if (!module.comparison.datasets.length) {
      assert.equal(module.moduleId, "multi-coupon-interval");
      assert(module.comparison.issues.some(reason => reason.includes("快照未保存")));
      assert(html.includes(`id="sec-${module.id}-matrix"`));
      continue;
    }
    assert.deepEqual([...new Set(module.comparison.datasets[0].columns.map(column => column.experimentId))],
      ["DEMO-003", "DEMO-001", "DEMO-002"]);
    const dataset = module.comparison.datasets[0];
    const changed = matrixEvent(report, view, module, { matrixTranspose: "", matrixKey: dataset.key });
    assert.equal(changed.moduleId, module.id);
    assert.equal(stateFor(report, view, module.index).reading.transposed, true);
  }
  assert(renderMultiReport(report, view).includes("mx-transposed"));
  assert.equal(JSON.stringify(generatedSaved), original);
});

check("历史报告无矩阵快照时按固定结果投影，已有矩阵快照继续作为权威证据", () => {
  for (const presentation of [undefined, "modules", matrixPresentation]) {
    const saved = demoModuleReport();
    saved.presentation = presentation;
    const before = JSON.stringify(saved), report = descriptor(freeze(saved));
    const module = buildReportModules(saved)[0];
    assert.deepEqual(buildMatrixComparisons(saved, module), report.moduleContent[0].comparison);
    const column = report.moduleContent[0].comparison.datasets[0].columns.find(column => column.groupId === "001-A");
    assert.equal(column.cells.roi.value, saved.results[0].rows[0].values.roi.value);
    assert.equal(JSON.stringify(saved), before);
    const fallback = { ...report, presentation, moduleContent: buildReportModules(saved) };
    const view = {};
    assert(renderMultiReport(fallback, view).includes('class="mx-experiment-row"'));
    assert.equal(matrixEvent(fallback, view, module, { matrixTranspose: "", matrixKey: column.cells.roi.evidence.datasetKey }).moduleId, module.id);
    assert.equal(prepareModuleCitation(fallback, singleScope(0, "DEMO-002"), view).scope, `${module.id}-matrix-data-0`);
  }
  const saved = fresh();
  saved.matrixSnapshot[0].datasets[0].experiments[0].rows[1].cells.roi.value = 123;
  assert.equal(descriptor(saved).moduleContent[0].comparison.datasets[0].columns[1].cells.roi.value, 123);
  saved.matrixSnapshot = [];
  assert(descriptor(saved).moduleContent.every(module => module.comparison.datasets.length === 0));
});

check("历史实验和数据集引用迁移到同一大表格，恢复隐藏列且不改写旧阅读状态", () => {
  const saved = demoModuleReport(), before = JSON.stringify(saved), report = descriptor(freeze(saved));
  const view = { modules: { "mm-0": { experimentId: "DEMO-002", tables: {
    "DEMO-002:0": { group: "002-A", transposed: true } } } } };
  renderMultiReport(report, view);
  const { module, state, dataset, reading } = stateFor(report, view);
  const tables = copy(state.tables);
  const table = prepareModuleCitation(report, datasetScope(0, 0), view);
  assert.equal(table.scope, `${module.id}-matrix-data-0`);
  matrixEvent(report, view, module, { matrixClear: "", matrixKey: dataset.key });
  matrixEvent(report, view, module, { matrixTranspose: "", matrixKey: dataset.key });
  const citation = prepareModuleCitation(report, datasetScope(0, 0, "DEMO-003"), view);
  assert.equal(citation.scope, `${module.id}-matrix-data-0`);
  assert.equal(state.experimentId, "DEMO-003");
  assert.equal(reading.selected.length, 1);
  assert.equal(reading.transposed, true);
  const html = renderMultiReport(report, view);
  assert(html.includes(`id="sec-${citation.scope}"`) && html.includes('data-fs="mm-0-matrix-data-0"'));
  assert(!html.includes("data-mm-select"));
  assert.deepEqual(state.tables, tables);
  assert.equal(prepareModuleCitation(report, "mm-0-single-conclusion", view).scope, module.id);
  assert.equal(JSON.stringify(saved), before);
});

check("纯单实验报告保持原数据表，Demo 标记不能改变报告与模块的分析类型", () => {
  const saved = demoModuleReport();
  saved.snapshot.analysisType = "single";
  saved.snapshot.modules.forEach(module => { module.configuration.analysisType = "single"; });
  saved.snapshot.experiments = saved.snapshot.experiments.slice(0, 1);
  saved.results = saved.results.slice(0, 1);
  saved.presentation = matrixPresentation;
  const before = JSON.stringify(saved), report = descriptor(freeze(saved)), view = {};
  assert.equal(report.presentation, "modules");
  assert(report.moduleContent.every(module => !module.comparison));
  const html = renderMultiReport(report, view);
  assert(html.includes("单实验分析结论") && html.includes('class="mm-table"'));
  assert(!html.includes('class="mx-experiment-row"') && !html.includes("多实验分析结论"));
  assert.equal(matrixEvent(report, view, report.moduleContent[0], { matrixTranspose: "" }), false);
  assert.equal(JSON.stringify(saved), before);
});

check("整体核销间隔按 3 实验、4 策略组和 6 指标逐值对齐，不补造对照组", () => {
  const report = descriptor(fresh()), dataset = report.moduleContent[1].comparison.datasets[0];
  assert.deepEqual(dataset.columns.map(column => [column.experimentId, column.groupId]), [
    ["DEMO-001", "001-A"], ["DEMO-001", "001-B"], ["DEMO-002", "002-A"], ["DEMO-003", "003-A"]
  ]);
  const expected = [[4.73, .04, .20, 2.13, 8.08, 13.18], [4.70, .04, .19, 2.14, 7.95, 13.15],
    [8.65, .08, .52, 4.26, 14.32, 19.80], [2.84, .03, .16, 1.06, 4.72, 7.62]];
  dataset.columns.forEach((column, index) => {
    assert.deepEqual(dataset.fields.map(field => column.cells[field.key].value), expected[index]);
    assert(!column.control);
    assert(Object.values(column.cells).every(cell => !Object.hasOwn(cell, "uplift") && !Object.hasOwn(cell, "sig")));
  });
  const html = renderMultiReport(report, {});
  assert(html.includes(">4.70</span>") && html.includes(">0.20</span>") && html.includes(">19.80</span>"));
  assert(html.includes('colspan="2" scope="colgroup"'));
  assert(html.includes('class="mx-group-row"'));
  assert.equal((html.match(/data-mm-select=/g) || []).length, 0);
  assert(!html.includes("data-matrix-view"));
  assert(!html.includes("data-matrix-open"));
  assert(!html.includes("单实验明细"));
  assert.equal((html.match(/class="mm-table mx-table"/g) || []).length, 3);
  assert.equal((html.match(/<select/g) || []).length, 0);
  assert(!html.includes("data-matrix-dataset"));
  assert(!html.includes("固定模拟数据；"));
  assert(!html.includes("mx-evidence"));
  assert(!html.includes("聚焦或点击数值"));
  assert(!html.includes("个整体数据集"));
});

check("矩阵多实验模块只保留多实验结论，旧逐实验引用定位原数据而不恢复结论", () => {
  const saved = fresh(), before = JSON.stringify(saved), report = descriptor(saved), view = {};
  const initial = renderMultiReport(report, view);
  assert(!initial.includes("单实验分析结论") && !initial.includes("data-conclusion-experiment"));
  assert(!initial.includes("data-mm-select"));
  assert(initial.includes('id="sec-report-summary"'));
  for (const module of report.moduleContent) {
    assert(initial.includes(`data-ask="${module.id}"`));
    assert(initial.includes(`id="sec-${module.id}-matrix"`));
  }
  for (const module of report.moduleContent) for (const experiment of module.experiments) {
    const other = report.moduleContent.find(item => item.id !== module.id);
    const otherBefore = JSON.stringify(moduleView(view, other));
    const scope = singleScope(module.index, experiment.id);
    const citation = prepareModuleCitation(report, scope, view);
    assert.equal(citation.scope, `${module.id}-matrix-data-0`);
    const column = module.comparison.datasets[0].columns.find(column => column.experimentId === experiment.id && !column.control);
    assert(citation.focus.includes(Object.values(column.cells)[0].token));
    assert.equal(moduleView(view, module).experimentId, experiment.id);
    assert.equal(JSON.stringify(moduleView(view, other)), otherBefore);
    const html = renderMultiReport(report, view);
    assert(html.includes(`id="sec-${citation.scope}"`));
    assert(!html.includes(`id="sec-${scope}"`) && !html.includes(`data-ask="${scope}"`));
    assert(!html.includes("单实验分析结论"));
    const answer = multiAnswer(report, "总结这个实验", scope, view).md;
    assert(answer.includes(experiment.id));
    assert(answer.includes("查看该实验数据") && !answer.includes("查看该实验分析结论"));
    assert(module.experiments.filter(item => item.id !== experiment.id).every(item => !answer.includes(item.id)));
  }
  assert.equal(JSON.stringify(saved), before);
});

check("移除单实验结论后，失败和不可用实验仍在矩阵中保留原因", () => {
  const saved = fresh();
  saved.results[0].status = "failed";
  saved.results[0].error = "首个实验取数失败";
  delete saved.results[2].couponIntervals;
  const report = descriptor(saved, true), view = {};
  renderMultiReport(report, view);
  const module = report.moduleContent[1];
  for (const id of ["DEMO-001", "DEMO-003"]) {
    const column = module.comparison.datasets[0].columns.find(column => column.experimentId === id);
    const cell = column.cells.interval_mean;
    assert.notEqual(cell.status, "value");
    assert(cell.reason);
    const html = renderMultiReport(report, view);
    assert(html.includes(cell.reason));
    assert(html.includes(`data-matrix-experiment="${id}"`));
    assert(html.includes('class="mm-table mx-table"'));
    assert(!html.includes("data-mm-select") && !html.includes("单实验分析结论"));
  }
  saved.results.forEach(result => { result.status = "failed"; });
  const allFailed = descriptor(saved, true), failedView = {};
  const failedHTML = renderMultiReport(allFailed, failedView);
  assert(!failedHTML.includes("单实验分析结论") && !failedHTML.includes("data-mm-select"));
  assert(failedHTML.includes("首个实验取数失败"));
});

check("核心指标读取原始精度，保留各自对照、零值、增幅和显著性，不跨实验计算", () => {
  const saved = fresh(), report = descriptor(saved), dataset = report.moduleContent[0].comparison.datasets[0];
  assert.equal(dataset.columns.length, 7);
  assert.equal(dataset.columns.filter(column => column.control).length, 3);
  for (const column of dataset.columns.filter(column => !column.control)) {
    const result = saved.results.find(result => result.id === column.experimentId);
    const row = result.rows.find(row => row.groupId === column.groupId);
    for (const field of dataset.fields) {
      assert.equal(column.cells[field.key].value, row.values[field.key].value);
      if (field.uplift) {
        assert.equal(column.cells[field.key].uplift, row.values[field.key].uplift);
        assert.equal(column.cells[field.key].sig, row.values[field.key].sig);
        assert.equal(column.cells[field.key].ownControl.id, row.controlId);
      }
    }
  }
  assert.equal(dataset.columns[0].cells.dac.value, saved.results[0].rows[0].raw.controlDac);
  assert.equal(dataset.columns[0].cells.cost.status, "not-applicable");
  assert.equal(dataset.columns.at(-1).cells.redeemCost.status, "missing");
  assert.equal(dataset.columns.at(-1).cells.redeemCost.reason, "未提供核销补贴");
  assert(renderMultiReport(report, {}).includes("相对本实验对照组"));
});

check("计算指标使用独立整体数据集与已保存计算定义、输入来源和粒度", () => {
  const saved = fresh(), report = descriptor(saved), module = report.moduleContent[0], dataset = module.comparison.datasets[1];
  assert.equal(dataset.mode, "calculated:overall");
  assert.equal(dataset.columns.length, 7);
  assert(dataset.contract.metrics[0].definition.inputs.every(input => input.grain && input.definition && input.unit !== undefined));
  for (const column of dataset.columns) {
    const record = saved.results.find(result => result.id === column.experimentId).moduleCalculations[module.moduleId].records
      .find(record => record.modeId === "overall");
    const raw = record.rawRows.find(row => row.group_id === column.groupId);
    assert.equal(column.cells["demo-gmv-per-dac"].value, raw["demo-gmv-per-dac"]);
    assert.equal(column.cells["demo-gmv-per-dac"].sig, undefined);
  }
  assert(!module.comparison.datasets.some(dataset => dataset.mode.includes("demo-spend")));
});

check("来源版本、粒度、单位、指标语义或精度冲突均保留原因，不对齐异常数值", () => {
  const variants = [
    [contract => { contract.sourceVersion = 2; }, "版本"],
    [contract => { delete contract.grain; }, "依据"],
    [contract => { contract.grain = "batch"; }, "粒度"],
    [contract => { contract.metrics[0].unit = "分钟"; }, "单位"],
    [contract => { contract.metrics[0].definition = "another-statistic"; }, "口径"],
    [contract => { delete contract.metrics[0].definition; }, "语义"],
    [contract => { contract.metrics[0].digits = 1; }, "精度"],
    [contract => { contract.metrics.push(copy(contract.metrics[0])); }, "不唯一"]
  ];
  for (const [mutate, reason] of variants) {
    const saved = fresh();
    mutate(saved.matrixSnapshot[1].datasets[0].experiments[1].contract);
    const dataset = descriptor(saved).moduleContent[1].comparison.datasets[0];
    const cell = dataset.columns.find(column => column.experimentId === "DEMO-002").cells.interval_mean;
    assert.equal(cell.status, "unalignable");
    assert.equal(cell.value, null);
    assert(cell.reason.includes(reason));
    assert.equal(dataset.columns[0].cells.interval_mean.value, 4.73);
  }
});

check("同名计算字段的公式或输入口径不一致时不参与对比", () => {
  for (const mutation of [
    metric => { metric.definition.formula.operator = "*"; },
    metric => { metric.definition.inputs[0].unit = "美元"; },
    metric => { metric.definition.inputs[0].ref.version = 20; }
  ]) {
    const saved = fresh();
    mutation(saved.matrixSnapshot[0].datasets[1].experiments[1].contract.metrics[0]);
    const dataset = descriptor(saved).moduleContent[0].comparison.datasets[1];
    assert.equal(dataset.columns.find(column => column.experimentId === "DEMO-002").cells["demo-gmv-per-dac"].status, "unalignable");
  }
  const saved = fresh();
  saved.results[1].moduleCalculations["multi-core"].records.find(record => record.modeId === "overall").calculationContext.window.end = "2026-01-01";
  const dataset = descriptor(saved, true).moduleContent[0].comparison.datasets[1];
  assert.match(dataset.columns.find(column => column.experimentId === "DEMO-002").cells["demo-gmv-per-dac"].reason, /观察窗口/);
});

for (const [key, conflicting, reason] of [
  ["version", 99, /版本/], ["capabilityId", "unregistered-source", /来源/], ["groupKey", "other_group_id", /组/]
]) check(`Saved calculation context ${key} must match its registered input`, () => {
  const saved = fresh();
  saved.results[1].moduleCalculations["multi-core"].records.find(record => record.modeId === "overall")
    .calculationContext[key] = conflicting;
  const dataset = descriptor(saved, true).moduleContent[0].comparison.datasets[1];
  const cell = dataset.columns.find(column => column.experimentId === "DEMO-002" && !column.control).cells["demo-gmv-per-dac"];
  assert.equal(cell.status, "unalignable");
  assert.equal(cell.value, null);
  assert.match(cell.reason, reason);
  assert.equal(dataset.columns.find(column => column.experimentId === "DEMO-001" && !column.control)
    .cells["demo-gmv-per-dac"].status, "value");
});

check("A saved multiplication result cannot be aligned under a division definition", () => {
  for (const index of [0, 1]) {
    const saved = fresh(), module = saved.snapshot.modules[0], otherDefinition = copy(module.configuration);
    otherDefinition.calculatedMetrics[0].formula.operator = "*";
    const result = saved.results[index], entry = saved.snapshot.experiments[index];
    result.moduleCalculations[module.id] = computeModuleCalculations(otherDefinition,
      comparisonCalculationRecords(otherDefinition, result, entry));
    const before = JSON.stringify(saved.results);
    const report = descriptor(saved, true), dataset = report.moduleContent[0].comparison.datasets[1];
    assert.equal(dataset.contract.metrics[0].definition.formula.operator, "/");
    assert(dataset.fields[0].formulaText.includes("÷"));
    assert(!dataset.fields[0].formulaText.includes("×"));
    const cell = dataset.columns.find(column => column.experimentId === entry.input.id && !column.control).cells["demo-gmv-per-dac"];
    assert.equal(cell.status, "unalignable");
    assert.equal(cell.value, null);
    assert.match(cell.reason, /公式/);
    assert.match(saved.matrixSnapshot[0].datasets[1].experiments[index].rows[0].cells["demo-gmv-per-dac"].reason, /公式/);
    assert(dataset.columns.filter(column => column.experimentId !== entry.input.id)
      .every(column => column.cells["demo-gmv-per-dac"].status === "value"));
    assert.equal(JSON.stringify(saved.results), before);
  }
});

check("Saved calculation evidence must retain its source, reference, grain and group identity", () => {
  const mutations = [
    record => { record.sourceId = "another-result"; },
    record => { record.calculationContext.schemaVersion = 99; },
    record => { record.calculationContext.grain.population = "another-population"; },
    record => { record.calculationContext.grain.groupNamespace = "another-group-namespace"; },
    record => { record.calculationContext.dimensionKeys = { batch: "batch_id" }; },
    record => { record.context.libra_id = "DEMO-003"; },
    record => { record.fields[1].sources[0].ref.capabilityId = "another-capability"; },
    record => { record.fields[1].sources[0].ref.version = 99; },
    record => { record.fields[1].sources.push(copy(record.fields[1].sources[0])); },
    record => { record.fields[1].sources.reverse(); },
    record => { delete record.fields[1].formulaText; },
    record => { record.snapshot.fields[1].formulaText = "conflicting saved formula"; },
    record => { record.fields[1].alias = "group_id"; },
    record => { record.fields[1].precision = 0; },
    record => { record.fields[1].format = "percent"; },
    record => { record.evidence[0].executionId = "another-execution"; },
    record => { record.evidence[0].metricKey = "another-metric"; },
    record => { record.evidence[0].rowIndex = 1; },
    record => { record.rawRows[1].group_id = "003-A"; },
    record => { record.rawRows[1].is_control = 1; },
    record => { record.rawRows.push(copy(record.rawRows[1])); }
  ];
  for (const mutate of mutations) {
    const saved = fresh();
    const record = saved.results[0].moduleCalculations["multi-core"].records.find(record => record.modeId === "overall");
    mutate(record);
    const dataset = descriptor(saved, true).moduleContent[0].comparison.datasets[1];
    assert.equal(dataset.fields[0].precision, 2);
    assert.equal(dataset.fields[0].format, "number");
    const affected = dataset.columns.filter(column => column.experimentId === "DEMO-001");
    assert.deepEqual(affected.map(column => column.groupId), ["001-C", "001-A", "001-B"]);
    assert(affected.every(column => column.cells["demo-gmv-per-dac"].status === "unalignable"), mutate.toString());
    assert(affected.every(column => column.cells["demo-gmv-per-dac"].reason), mutate.toString());
    assert(dataset.columns.filter(column => column.experimentId !== "DEMO-001")
      .every(column => column.cells["demo-gmv-per-dac"].status === "value"), mutate.toString());
  }
});

check("未登记来源版本或指标单位不被默认接受，新报告显示原因且不切换样式", () => {
  for (const mutate of [
    source => { source.version = 99; },
    source => { source.definition.metrics[0].unit = "分钟"; },
    source => { delete source.definition.metrics; }
  ]) {
    const saved = fresh();
    mutate(saved.snapshot.modules[1].configuration.sources[0]);
    const report = descriptor(saved, true), module = report.moduleContent[1];
    assert.equal(module.comparison.datasets.length, 0);
    assert(module.comparison.issues.length);
    const html = renderMultiReport(report, {});
    assert(html.includes("当前模块无可对齐的整体数据"));
    assert(!html.includes('data-mm-select="mm-1"'));
    assert(!html.includes('class="mm-table"'));
  }
});

check("多个同名来源分别展示，证据按来源身份定位而非标题或数组索引", () => {
  const saved = fresh(), source = copy(saved.snapshot.modules[1].configuration.sources[0]);
  source.id = "another-interval-source";
  saved.snapshot.modules[1].configuration.sources.push(source);
  const report = descriptor(saved, true), module = report.moduleContent[1];
  assert.equal(module.comparison.datasets.length, 2);
  assert.equal(module.comparison.datasets[0].title, module.comparison.datasets[1].title);
  assert.notEqual(module.comparison.datasets[0].key, module.comparison.datasets[1].key);
  const evidence = module.comparison.datasets[1].columns[2].cells.interval_p50.evidence;
  const experiment = module.experiments.find(experiment => experiment.id === evidence.experimentId);
  experiment.datasets.reverse();
  experiment.datasets.forEach(dataset => { dataset.title = "同一个标题"; });
  const target = locateMatrixEvidence(module, evidence);
  assert.equal(target.dataset.sourceId, source.id);
  assert.equal(target.row.groupId, "002-A");
});

check("实验、组别、字段顺序变化不串值，同名组始终由身份区分", () => {
  const saved = fresh();
  saved.snapshot.experiments.reverse();
  saved.results[0].couponIntervals.overall.reverse();
  saved.snapshot.experiments.forEach(entry => {
    entry.definition.name = "相同实验名";
    entry.definition.groups.forEach(group => { group.name = "相同组名"; });
  });
  const report = descriptor(saved, true), dataset = report.moduleContent[1].comparison.datasets[0];
  assert.deepEqual(dataset.columns.map(column => column.groupId), ["003-A", "002-A", "001-B", "001-A"]);
  assert.deepEqual(dataset.columns.map(column => column.cells.interval_mean.value), [2.84, 8.65, 4.70, 4.73]);
  saved.matrixSnapshot[1].datasets[0].fields.reverse();
  const reversed = descriptor(saved).moduleContent[1].comparison.datasets[0];
  assert.equal(reversed.fields[0].key, "interval_p90");
  assert.equal(reversed.columns[0].cells.interval_p90.value, 7.62);
});

check("失败、模块缺失、真实零与非数值字符串保持不同语义及有效实验计数", () => {
  const saved = fresh();
  saved.results[0].couponIntervals.overall[0].values.interval_mean = 0;
  saved.results[0].couponIntervals.overall[1].values.interval_mean = "4.70";
  assert.equal(captureMatrixSnapshot(saved)[1].datasets[0].experiments[0].rows[1].cells.interval_mean.status, "missing");
  saved.results[0].couponIntervals.overall[1].values.interval_mean = null;
  saved.results[1].status = "failed";
  saved.results[1].error = "固定失败原因";
  delete saved.results[2].couponIntervals;
  const report = descriptor(saved, true), dataset = report.moduleContent[1].comparison.datasets[0];
  assert.equal(dataset.columns.length, 4);
  assert.equal(dataset.columns[0].cells.interval_mean.value, 0);
  assert.equal(dataset.columns[0].cells.interval_mean.status, "value");
  assert.equal(dataset.columns[1].cells.interval_mean.status, "missing");
  assert.equal(dataset.columns[2].cells.interval_mean.status, "failed");
  assert.equal(dataset.columns[2].cells.interval_mean.reason, "固定失败原因");
  assert.equal(dataset.columns[3].cells.interval_mean.status, "unavailable");
  const view = {};
  const html = renderMultiReport(report, view);
  assert(html.includes(">0.00</span>"));
  assert(html.includes("当前指标表有效实验不足两个"));
  assert.equal(matrixSelection(dataset, stateFor(report, view, 1).reading).validExperiments, 1);
  assert.equal(report.moduleContent[0].comparison.datasets[0].columns.filter(column => column.experimentId === "DEMO-002").length, 2);
});

check("缺失整体时不由券批次合成数值，重复整体记录也不会按首行猜测", () => {
  const saved = fresh();
  saved.snapshot.modules[1].configuration.sources[0].dimensionKeys = ["interval-batch"];
  let report = descriptor(saved, true);
  assert.equal(report.moduleContent[1].comparison.datasets.length, 0);
  assert(renderMultiReport(report, {}).includes("当前模块无可对齐的整体数据"));
  assert(!renderMultiReport(report, {}).includes('data-mm-select="mm-1"'));
  const duplicate = fresh();
  duplicate.results[0].couponIntervals.overall.push(copy(duplicate.results[0].couponIntervals.overall[0]));
  report = descriptor(duplicate, true);
  const cell = report.moduleContent[1].comparison.datasets[0].columns[0].cells.interval_mean;
  assert.equal(cell.status, "unalignable");
  assert.match(cell.reason, /不唯一/);
});

check("Missing overall coupon evidence preserves batch detail without crashing or synthesizing an overall", () => {
  const saved = fresh(), before = copy(saved.results[1].couponIntervals.batches);
  delete saved.results[1].couponIntervals.overall;
  const report = descriptor(saved, true), module = report.moduleContent[1], dataset = module.comparison.datasets[0];
  const cell = dataset.columns.find(column => column.experimentId === "DEMO-002").cells.interval_mean;
  assert.equal(cell.status, "unavailable");
  assert.equal(cell.value, null);
  assert(cell.reason);
  assert.equal(dataset.columns[0].cells.interval_mean.value, 4.73);
  assert(module.experiments[1].datasets.some(dataset => dataset.mode === "interval-batch"));
  assert(!module.experiments[1].datasets.some(dataset => dataset.mode === "interval-overall"));
  renderMultiReport(report, {});
  assert.deepEqual(saved.results[1].couponIntervals.batches, before);
});

check("Batch-only modules show an unavailable matrix without injecting the other report style", () => {
  for (const missing of [undefined, null, []]) {
    const saved = fresh();
    saved.results.forEach(result => { result.couponIntervals.overall = missing; });
    const before = JSON.stringify(saved.results), report = descriptor(saved, true), module = report.moduleContent[1], view = {};
    assert.equal(module.comparison.datasets.length, 0);
    assert(module.comparison.issues.some(reason => reason.includes("整体")));
    const html = renderMultiReport(report, view);
    assert(html.includes("当前模块无可对齐的整体数据"));
    assert(!html.includes('data-mm-select="mm-1"'));
    assert(!html.includes('class="mm-table"'));
    assert(!html.includes("data-matrix-view"));
    for (const experiment of module.experiments) {
      assert.deepEqual(experiment.datasets.map(dataset => dataset.mode), ["interval-batch"]);
      assert.equal(experiment.status, "success");
    }
    assert.equal(JSON.stringify(saved.results), before);
  }
});

check("新 Demo 中的单实验 Pre AA 仍使用原下拉，不增加矩阵或跨实验结论", () => {
  const saved = demoMixedModuleReport();
  saved.presentation = matrixPresentation;
  const report = descriptor(saved, true), html = renderMultiReport(report, {});
  const preAA = html.slice(html.indexOf('data-mm-section="mm-0"'), html.indexOf('data-mm-section="mm-1"'));
  assert(preAA.includes('data-mm-select="mm-0"'));
  assert(preAA.includes("单实验分析结论"));
  assert(!preAA.includes("data-matrix-view"));
  assert(!preAA.includes("多实验分析结论"));
  assert(!report.moduleContent[0].comparison);
  const multi = html.slice(html.indexOf('data-mm-section="mm-1"'));
  assert(multi.includes("多实验分析结论") && !multi.includes("单实验分析结论"));
  assert(!multi.includes("data-mm-select"));
});

check("显示范围默认全选；搜索不清除隐藏选择；清空、单实验提示和恢复全部可用", () => {
  const report = descriptor(fresh()), view = {};
  renderMultiReport(report, view);
  const { module, dataset, reading } = stateFor(report, view, 1);
  assert.equal(reading.selected.length, 4);
  matrixEvent(report, view, module, { matrixSearch: "" }, "DEMO-002", "input");
  assert.equal(reading.selected.length, 4);
  let html = renderMultiReport(report, view);
  assert(html.includes('value="DEMO-002"'));
  matrixEvent(report, view, module, { matrixExperiment: "DEMO-002" }, "", "change", false);
  assert.deepEqual(reading.selected, dataset.columns.filter(column => column.experimentId !== "DEMO-002").map(column => column.key));
  matrixEvent(report, view, module, { matrixClear: "" });
  assert.equal(reading.selected.length, 0);
  html = renderMultiReport(report, view);
  assert(html.includes("当前无可见数据"));
  assert(!html.includes(">4.73</span>"));
  matrixEvent(report, view, module, { matrixGroup: dataset.columns[2].key }, "", "change", true);
  assert(renderMultiReport(report, view).includes("当前仅查看单个实验数据"));
  matrixEvent(report, view, module, { matrixReset: "" });
  assert.equal(reading.selected.length, 4);
  assert.equal(reading.search, "DEMO-002");
});

check("矩阵各指标表的范围、搜索与转置独立，旧阅读状态不恢复单实验结论", () => {
  const report = descriptor(fresh()), view = {};
  renderMultiReport(report, view);
  const { module, dataset, reading, state } = stateFor(report, view);
  const conclusions = JSON.stringify(report.moduleContent.map(module => module.conclusions));
  matrixEvent(report, view, module, { matrixTranspose: "", matrixKey: dataset.key });
  matrixEvent(report, view, module, { matrixGroup: dataset.columns[0].key, matrixKey: dataset.key }, "", "change", false);
  assert.equal(matrixEvent(report, view, module, { matrixView: "detail" }), false);
  const selected = [...reading.selected];
  assert.equal(matrixEvent(report, view, module, { matrixDataset: "" }, module.comparison.datasets[1].key, "change"), false);
  const calculation = stateFor(report, view, 0, module.comparison.datasets[1].key);
  assert.equal(calculation.reading.transposed, false);
  matrixEvent(report, view, module, { matrixClear: "", matrixKey: calculation.dataset.key });
  matrixEvent(report, view, module, { matrixSearch: "", matrixKey: calculation.dataset.key }, "DEMO-003", "input");
  state.experimentId = "DEMO-003"; // Previously saved reading state must not restore removed content.
  assert.equal(calculation.reading.selected.length, 0);
  assert.equal(reading.search, "");
  assert.equal(reading.transposed, true);
  assert.deepEqual(reading.selected, selected);
  assert.equal(state.experimentId, "DEMO-003");
  assert.equal(stateFor(report, view, 1).state.experimentId, "DEMO-001");
  assert.equal(stateFor(report, view, 1).reading.selected.length, 4);
  assert.equal(stateFor(report, view, 1).reading.transposed, false);
  assert.equal(state.matrix.datasetKey, dataset.key);
  const html = renderMultiReport(report, view);
  assert(!html.includes("单实验分析结论") && !html.includes("data-mm-select"));
  assert(html.includes('id="sec-mm-0-matrix-data-0"') && html.includes('id="sec-mm-0-matrix-data-1"'));
  const blocks = html.split('class="sec mx-section"');
  assert(blocks[1].includes("mx-transposed"));
  assert(blocks[2].includes("当前无可见数据") && !blocks[2].includes("mx-transposed"));
  assert.equal(JSON.stringify(report.moduleContent.map(module => module.conclusions)), conclusions);
});

check("每个矩阵引用定位大表格的原实验、数据集、组和指标，保持同一种样式", () => {
  const report = descriptor(fresh()), view = {};
  renderMultiReport(report, view);
  for (const module of report.moduleContent) for (const dataset of module.comparison.datasets) {
    for (const column of dataset.columns) for (const field of dataset.fields) {
      const cell = column.cells[field.key], target = locateMatrixEvidence(module, cell.evidence);
      assert.equal(target.experiment.id, column.experimentId);
      assert.equal(target.dataset.sourceId, dataset.sourceId);
      assert.equal(target.dataset.mode, dataset.mode);
      assert.equal(target.row.groupId, column.groupId);
      const state = moduleView(view, module), tables = copy(state.tables);
      const opened = prepareModuleCitation(report, matrixEvidenceScope(cell.evidence), view);
      assert.equal(opened.scope, `${module.id}-matrix-data-${module.comparison.datasets.indexOf(dataset)}`);
      assert.equal(state.experimentId, column.experimentId);
      assert.equal(state.matrix.datasetKey, dataset.key);
      assert(opened.focus.includes(cell.token));
      const html = renderMultiReport(report, view);
      assert(html.includes(`data-matrix-cell="${cell.token}"`));
      assert(!html.includes(`data-mm-select="${module.id}"`));
      assert(!html.includes(`id="sec-${singleScope(module.index, column.experimentId)}"`));
      assert(!html.includes("data-matrix-view"));
      assert(!html.includes("data-matrix-open"));
      assert.deepEqual(state.tables, tables);
    }
  }
});

check("引用保留大表格方向及已选组，只恢复被引用的隐藏列", () => {
  const report = descriptor(fresh()), view = {};
  renderMultiReport(report, view);
  const { module, state, dataset, reading } = stateFor(report, view, 1);
  matrixEvent(report, view, module, { matrixTranspose: "" });
  matrixEvent(report, view, module, { matrixGroup: dataset.columns[0].key }, "", "change", false);
  const before = copy({ selected: reading.selected, transposed: reading.transposed, datasetKey: state.matrix.datasetKey });
  const cell = dataset.columns[2].cells.interval_p50;
  const citation = matrixEvidenceScope(cell.evidence);
  assert(prepareModuleCitation(report, citation, view).focus.includes(cell.token));
  assert.equal(state.experimentId, "DEMO-002");
  assert.deepEqual({ selected: reading.selected, transposed: reading.transposed, datasetKey: state.matrix.datasetKey }, before);
  const hidden = dataset.columns[0].cells.interval_mean;
  prepareModuleCitation(report, matrixEvidenceScope(hidden.evidence), view);
  assert(reading.selected.includes(dataset.columns[0].key));
  assert.equal(reading.transposed, true);
  prepareModuleCitation(report, citation, view);
  assert.equal(state.experimentId, "DEMO-002");
  assert.equal(matrixEvidenceScope(cell.evidence), citation);
  const answer = multiAnswer(report, "核对该值", citation, view).md;
  assert(answer.includes("DEMO-002") && answer.includes("002-A"));
  assert(answer.includes("4.26") && answer.includes(citation));
  assert(!answer.includes("DEMO-001"));
});

check("多实验模块目录只保留多实验结论与指标表，旧结论及逐实验引用仍可定位", () => {
  const report = descriptor(fresh()), view = {};
  renderMultiReport(report, view);
  const { module, state } = stateFor(report, view, 1);
  const children = report.sections[1].children;
  assert.equal(children.length, module.comparison.datasets.length + module.experiments.length + 1);
  const visible = children.filter(child => !child.hiddenToc);
  assert.deepEqual(visible.map(child => child.short), ["多实验分析结论", ...module.comparison.datasets.map(dataset => dataset.title)]);
  assert(children.slice(1, 1 + module.experiments.length).every(child => child.hiddenToc && child.id.startsWith(`${module.id}-exp-`)));
  assert(children.slice(1 + module.experiments.length).every(child => child.id.startsWith(`${module.id}-matrix-data-`)));
  assert(!children.some(child => child.title.includes("券批次")));
  state.matrix.view = "detail"; // Stale state from the previous demo cannot restore a second style.
  assert.equal(prepareModuleCitation(report, module.id, view).scope, module.id);
  const selectionBefore = state.experimentId;
  const legacyConclusion = `${module.id}-single-conclusion`;
  assert.equal(prepareModuleCitation(report, legacyConclusion, view).scope, module.id);
  assert.equal(state.experimentId, selectionBefore);
  assert(!renderMultiReport(report, view).includes(`id="sec-${legacyConclusion}"`));
  assert.equal(prepareModuleCitation(report, singleScope(1, "DEMO-003"), view).scope, `${module.id}-matrix-data-0`);
  assert.equal(state.experimentId, "DEMO-003");
  assert.equal(prepareModuleCitation(report, legacyConclusion, view).scope, module.id);
  assert.equal(state.experimentId, "DEMO-003");
  const answer = multiAnswer(report, "核对计算", singleScope(1, "DEMO-003"), view).md;
  assert(answer.includes("DEMO-003") && !answer.includes("DEMO-001"));
  assert.equal(prepareModuleCitation(report, `${module.id}-matrix`, view).scope, `${module.id}-matrix`);
  assert.equal(prepareModuleCitation(report, datasetScope(1, 1), view).scope, `${module.id}-matrix`);
  const scopedTable = prepareModuleCitation(report, datasetScope(1, 0, "DEMO-002"), view);
  assert.equal(scopedTable.scope, `${module.id}-matrix-data-0`);
  assert.equal(state.experimentId, "DEMO-002");
  const html = renderMultiReport(report, view);
  assert(html.includes(`id="sec-${scopedTable.scope}"`));
  assert(!html.includes(`data-mm-select="${module.id}"`));
  assert(!html.includes(`id="sec-${singleScope(module.index, "DEMO-002")}"`));
  assert(!html.includes("单实验明细"));
  const core = report.moduleContent[0];
  const tableItem = report.sections[0].children.find(child => child.id === `${core.id}-matrix-data-1`);
  assert.equal(prepareModuleCitation(report, tableItem.id, view).scope, tableItem.id);
  assert.equal(moduleView(view, core).matrix.datasetKey, core.comparison.datasets[1].key);
});

check("失败或缺失的引用保持大表格并显示原实验原因", () => {
  const saved = fresh();
  saved.results[1].status = "failed";
  saved.results[1].error = "该实验数据不可用";
  const report = descriptor(saved, true), view = {};
  renderMultiReport(report, view);
  const { module, state, dataset } = stateFor(report, view, 1);
  const cell = dataset.columns[2].cells.interval_mean;
  const opened = prepareModuleCitation(report, matrixEvidenceScope(cell.evidence), view);
  assert.equal(opened.scope, `${module.id}-matrix-data-0`);
  assert.equal(state.experimentId, "DEMO-002");
  assert.equal(stateFor(report, view, 1).reading.evidence, cell.token);
  assert(renderMultiReport(report, view).includes("该实验数据不可用"));
  assert(!renderMultiReport(report, view).includes(`data-mm-select="${module.id}"`));
});

check("长名称保留完整可访问文本，表头转义同名与引号，所有状态操作不写入冻结快照", () => {
  const saved = fresh();
  const longName = '完整名称 "测试" <标记> '.repeat(12);
  saved.snapshot.experiments[0].definition.name = longName;
  freeze(saved);
  const before = JSON.stringify(saved), report = descriptor(saved), view = {};
  const html = renderMultiReport(report, view);
  assert(html.includes("&quot;测试&quot; &lt;标记&gt;"));
  assert(html.includes('tabindex="0" title="完整名称'));
  const { module, dataset } = stateFor(report, view);
  const changed = matrixEvent(report, view, module, { matrixGroup: dataset.columns[0].key }, "", "change", false);
  assert(changed.focus.includes('\\"DEMO-001\\"'));
  for (let i = 0; i < 3; i++) {
    matrixEvent(report, view, module, { matrixTranspose: "" });
    matrixEvent(report, view, module, { matrixSearch: "" }, "A", "input");
    matrixEvent(report, view, module, { matrixReset: "" });
    prepareModuleCitation(report, matrixEvidenceScope(dataset.columns[1].cells.dac.evidence), view);
    renderMultiReport(report, view);
  }
  assert.equal(JSON.stringify(saved), before);
});

console.log(`\n${checks} 项矩阵报告语义检查通过。多实验模块只展示多实验结论及数据明细，单实验模块保留原交互。`);
