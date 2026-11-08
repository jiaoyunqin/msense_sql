import assert from "node:assert/strict";
import {
  copy, comparisonMetrics, experimentInput, initializeMultiAnalysis, newTemplate, publishTemplate,
  templateIssues, templateModuleCandidates, templateChanged, publishedTemplates,
  createAnalysisTask, executeAnalysisTask, createTaskReport
} from "../src/multi-experiment-data.js";
import {
  reportDescriptor, renderMultiReport, multiAnswer, applyModuleReportEvent, prepareModuleCitation
} from "../src/multi-experiment-report.js";
import { moduleView, singleScope, datasetScope, demoModuleReport, demoMixedModuleReport } from "../src/multi-report-content.js";
import { preAAMetrics } from "../src/pre-aa-demo.js";

const source = { id: "comparison-source", kind: "rpc", capabilityId: "demo-comparison", version: 1,
  showInReport: true, metricKeys: comparisonMetrics.map(field => field.key), dimensionKeys: ["overall", "demo-spend"] };
const preAA = { id: "pre-aa-source", kind: "rpc", capabilityId: "pre-aa", version: 1,
  definition: { id: "pre-aa", name: "PreAA指标", metrics: preAAMetrics, dimensions: [] },
  showInReport: true, metricKeys: preAAMetrics.map(field => field.key), dimensionKeys: [] };
const store = { abilities: [], modules: [
  ["multi-core", "multi"], ["multi-strategy", "multi"], ["multi-detail", "multi"],
  ["single-demo-core", "single"], ["preaa", "single"]
].map(([id, analysisType]) => ({ id, name: id, enabled: true, versions: [{
  number: 1, configuration: { name: id === "preaa" ? "Pre AA" : id, analysisType,
    goal: "平台老客提频", sources: [copy(id === "preaa" ? preAA : source)], reasoning: "分别核对各实验数据。" }
}] })) };
initializeMultiAnalysis(store);
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };

check("多实验模板提供两类已发布模块，单实验模板仅提供单实验模块", () => {
  const isolated = copy(store);
  isolated.modules[0].analysisType = "single"; // Draft edits must not alter published classification.
  const multi = templateModuleCandidates(isolated, newTemplate("multi"));
  assert(multi.some(option => option.module.id === "preaa"));
  assert(multi.some(option => option.module.id === "multi-core" && option.configuration.analysisType === "multi"));
  assert(templateModuleCandidates(isolated, newTemplate("single")).every(option => option.configuration.analysisType === "single"));
  isolated.modules[0].enabled = false;
  isolated.modules[4].archived = true;
  assert(!templateModuleCandidates(isolated, newTemplate("multi")).some(option => ["multi-core", "preaa"].includes(option.module.id)));
});

check("只有单实验模块的多实验草稿不能发布，添加多实验模块后可发布", () => {
  const template = newTemplate("multi");
  Object.assign(template, { name: "混合模块模板", description: "逐实验 PreAA 与综合分析",
    sections: [{ moduleId: "preaa", version: 1, title: "Pre AA", kind: "overall" }] });
  assert(templateIssues(store, template).some(error => error.includes("负责跨实验结论")));
  assert.throws(() => publishTemplate(store, template));
  template.sections.push({ moduleId: "multi-core", version: 1, title: "综合分析", kind: "overall" });
  assert.equal(templateIssues(store, template).length, 0);
  const version = publishTemplate(store, template);
  const snapshot = JSON.stringify(version);
  template.sections.pop();
  assert(templateChanged(template));
  assert.throws(() => publishTemplate(store, template));
  assert.equal(template.versions.length, 1);
  assert.equal(JSON.stringify(version), snapshot);
});

check("单实验模板仍拒绝多实验模块，切换到多实验后保留合法单实验引用", () => {
  const template = copy(store.reportTemplates.find(template => template.id === "demo-template-single"));
  template.sections.push({ moduleId: "multi-core", version: 1, title: "综合分析", kind: "overall" });
  assert(templateIssues(store, template).some(error => error.includes("类型不一致")));
  template.analysisType = "multi";
  assert.equal(templateIssues(store, template).length, 0);
});

const input = { analysisType: "multi", goal: "平台老客提频", templateId: "demo-template-mixed",
  experiments: ["DEMO-003", "DEMO-001", "DEMO-002"].map(experimentInput), scenario: "normal" };
input.experiments[1].groupIds = ["001-B"];
assert(publishedTemplates(store, "multi").some(template => template.id === input.templateId));
const task = createAnalysisTask(store, input);
const originalEvidence = JSON.stringify(task.snapshot.experiments.map(entry => entry.definition.preAA));
await executeAnalysisTask(task, () => {}, 0);
const saved = createTaskReport(store, task), report = reportDescriptor(saved);

check("混合模板冻结模块类型，逐实验保存 PreAA 数据及自身对照组", () => {
  assert.deepEqual(task.snapshot.modules.map(module => module.configuration.analysisType), ["single", "multi"]);
  assert.deepEqual(task.results.map(result => result.id), ["DEMO-003", "DEMO-001", "DEMO-002"]);
  assert.deepEqual(task.results[1].preAA.records.map(row => row.groupId), ["001-C", "001-B"]);
  for (const entry of task.snapshot.experiments) assert(entry.definition.preAA.period[1] < entry.definition.period[0]);
  assert.equal(JSON.stringify(task.snapshot.experiments.map(entry => entry.definition.preAA)), originalEvidence);
  assert.deepEqual(report.moduleContent[0].conclusions, []);
  assert(report.moduleContent[1].conclusions.length > 0);
});

const event = dataset => ({ type: "click", target: { closest: () => ({ dataset }) } });
const selectEvent = (moduleId, experimentId) => ({ type: "change",
  target: { closest: () => ({ dataset: { mmSelect: moduleId }, value: experimentId }) } });
const view = {}, frozenReport = JSON.stringify(saved), html = renderMultiReport(report, view);
check("多实验表头保留全部实验顺序，区分实验周期与各自观察窗口", () => {
  const isolated = copy(saved);
  isolated.snapshot.experiments[0].input.end = "2026-10-20";
  isolated.results[1].status = "failed";
  const descriptor = reportDescriptor(isolated), headerView = {};
  const header = renderMultiReport(descriptor, headerView).split("</header>")[0];
  const positions = input.experiments.map(experiment => header.indexOf(`data-header-experiment="${experiment.id}"`));
  assert(positions.every(position => position >= 0));
  assert(positions[0] < positions[1] && positions[1] < positions[2]);
  assert(header.includes("2026-10-05 至 2026-10-11"));
  assert(header.includes("2026-10-05 至 2026-10-20"));
  for (const entry of isolated.snapshot.experiments) assert(header.includes(entry.definition.name));
  moduleView(headerView, descriptor.moduleContent[1]).experimentId = "DEMO-002";
  assert.equal(renderMultiReport(descriptor, headerView).split("</header>")[0], header);
  assert.equal(JSON.stringify(saved), frozenReport);
});
check("单实验模块使用实验下拉框，每次只展示一份结论与数据", () => {
  const preAASection = html.slice(html.indexOf('data-mm-section="mm-0"'), html.indexOf('data-mm-section="mm-1"'));
  const positions = input.experiments.map(experiment => preAASection.indexOf(`<option value="${experiment.id}"`));
  assert(positions.every(position => position >= 0));
  assert(positions[0] < positions[1] && positions[1] < positions[2]);
  assert.equal((preAASection.match(/单实验分析结论/g) || []).length, 1);
  assert.equal((preAASection.match(/data-selected-experiment=/g) || []).length, 1);
  assert(preAASection.includes('data-mm-select="mm-0"'));
  assert(!preAASection.includes("data-mm-tab=") && !preAASection.includes('role="tabpanel"'));
  assert(!preAASection.includes("多实验分析结论"));
  assert(preAASection.includes("不能据此判定 AA 通过"));
  assert(html.includes('data-mm-select="mm-1"'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

check("目录与表格引用选中对应实验后，独立证据锚点可定位", () => {
  const children = report.sections[0].children;
  const citationView = {};
  for (const entry of input.experiments) {
    assert(children.some(child => child.id === singleScope(0, entry.id) && !child.hiddenToc));
    const tableId = datasetScope(0, 0, entry.id);
    assert(children.some(child => child.id === tableId));
    prepareModuleCitation(report, tableId, citationView);
    const content = renderMultiReport(report, citationView);
    assert(content.includes(`id="sec-${tableId}"`));
    assert(content.includes(`data-fs="${tableId}"`));
    for (const other of input.experiments.filter(other => other.id !== entry.id))
      assert(!content.includes(`id="sec-${datasetScope(0, 0, other.id)}"`));
  }
});

check("操作实验 B 的表格不会修改实验 A、C 或多实验模块的选择", () => {
  const otherSelection = moduleView(view, report.moduleContent[1]).experimentId;
  for (const entry of input.experiments) {
    applyModuleReportEvent(selectEvent("mm-0", entry.id), report, view);
    renderMultiReport(report, view);
  }
  const changed = applyModuleReportEvent(event({ mmModule: "mm-0", mmTable: "0", mmExperiment: "DEMO-002", mmTranspose: "" }), report, view);
  const state = moduleView(view, report.moduleContent[0]);
  assert.equal(state.tables["DEMO-002:0"].transposed, true);
  assert.equal(state.tables["DEMO-001:0"].transposed, false);
  assert.equal(state.tables["DEMO-003:0"].transposed, false);
  assert(changed.focus.includes('data-mm-experiment="DEMO-002"'));
  applyModuleReportEvent(event({ mmModule: "mm-0", mmTable: "0", mmExperiment: "DEMO-002", mmGroup: "002-A" }), report, view);
  assert.equal(state.tables["DEMO-002:0"].group, "002-A");
  assert.equal(state.tables["DEMO-001:0"].group, "all");
  applyModuleReportEvent(selectEvent("mm-0", "DEMO-001"), report, view);
  renderMultiReport(report, view);
  applyModuleReportEvent(selectEvent("mm-0", "DEMO-002"), report, view);
  const restored = renderMultiReport(report, view);
  assert.equal(state.tables["DEMO-002:0"].transposed, true);
  assert.equal(state.tables["DEMO-002:0"].group, "002-A");
  assert(restored.includes(`id="sec-${datasetScope(0, 0, "DEMO-002")}"`));
  assert(!restored.includes(`id="sec-${datasetScope(0, 0, "DEMO-001")}"`));
  assert.equal(moduleView(view, report.moduleContent[1]).experimentId, otherSelection);
  assert.equal(JSON.stringify(saved), frozenReport);
});

check("两个单实验模块和多实验模块的下拉选择各自独立", () => {
  const isolated = copy(saved), duplicate = copy(isolated.snapshot.modules[0]);
  duplicate.id = "second-pre-aa";
  isolated.snapshot.modules.push(duplicate);
  isolated.snapshot.template.sections.push({ moduleId: duplicate.id, version: 1, title: "另一个单实验模块", kind: "overall" });
  const descriptor = reportDescriptor(isolated), tabsView = {};
  renderMultiReport(descriptor, tabsView);
  applyModuleReportEvent(selectEvent("mm-0", "DEMO-002"), descriptor, tabsView);
  assert.equal(moduleView(tabsView, descriptor.moduleContent[2]).experimentId, "DEMO-003");
  assert.equal(moduleView(tabsView, descriptor.moduleContent[1]).experimentId, "DEMO-003");
  applyModuleReportEvent(selectEvent("mm-2", "DEMO-001"), descriptor, tabsView);
  assert.equal(moduleView(tabsView, descriptor.moduleContent[0]).experimentId, "DEMO-002");
  assert.equal(JSON.stringify(saved), frozenReport);
});

check("实验长名称完整进入选项，同名实验仍通过 Libra ID 区分", () => {
  const isolated = copy(saved), longName = "抖音电商运营策略券-品类周期购模型基线实验-多批次老客提频验证".repeat(4);
  isolated.snapshot.experiments.forEach(entry => { entry.definition.name = longName; });
  const descriptor = reportDescriptor(isolated), selectionView = {};
  const content = renderMultiReport(descriptor, selectionView);
  for (const entry of input.experiments) assert(content.includes(`${longName} · ${entry.id}</option>`));
  const change = applyModuleReportEvent(selectEvent("mm-0", "DEMO-002"), descriptor, selectionView);
  assert.equal(change.focus, '[data-mm-select="mm-0"]');
  assert.equal(moduleView(selectionView, descriptor.moduleContent[0]).experimentId, "DEMO-002");
  assert(renderMultiReport(descriptor, selectionView).includes(`id="sec-${datasetScope(0, 0, "DEMO-002")}"`));
  assert.equal(JSON.stringify(saved), frozenReport);
});

check("单实验模块追问保留逐实验证据，表格引用始终定位指定实验", () => {
  const answer = multiAnswer(report, "逐个总结", "mm-0", view).md;
  for (const entry of input.experiments) assert(answer.includes(`[[cite:${singleScope(0, entry.id)}::`));
  assert(!answer.includes("查看多实验分析结论"));
  const scope = datasetScope(0, 0, "DEMO-002");
  const citation = prepareModuleCitation(report, scope, view);
  assert.equal(citation.scope, scope);
  const content = renderMultiReport(report, view);
  const selector = content.match(/<select[^>]*data-mm-select="mm-0"[^>]*>[\s\S]*?<\/select>/)[0];
  assert(selector.includes('<option value="DEMO-002" selected>'));
  assert(content.includes(`id="sec-${scope}"`));
  const scoped = multiAnswer(report, "总结这个实验", scope, view).md;
  assert(scoped.includes("DEMO-002"));
  assert(!scoped.includes("DEMO-001") && !scoped.includes("DEMO-003"));
  assert.equal(JSON.stringify(saved), frozenReport);
});

check("失败实验保留下拉选项，选中显示原因，其他实验仍可查看", () => {
  const partial = copy(saved);
  partial.results[1].status = "failed"; partial.results[1].error = "该实验取数失败";
  const descriptor = reportDescriptor(partial), partialView = {};
  renderMultiReport(descriptor, partialView);
  applyModuleReportEvent(selectEvent("mm-0", "DEMO-001"), descriptor, partialView);
  const content = renderMultiReport(descriptor, partialView);
  const section = content.slice(content.indexOf('data-mm-section="mm-0"'), content.indexOf('data-mm-section="mm-1"'));
  assert(section.includes("该实验取数失败"));
  assert.equal((section.match(/单实验分析结论/g) || []).length, 0);
  for (const entry of input.experiments) assert(section.includes(`<option value="${entry.id}"`));
  applyModuleReportEvent(selectEvent("mm-0", "DEMO-002"), descriptor, partialView);
  const success = renderMultiReport(descriptor, partialView);
  const successSection = success.slice(success.indexOf('data-mm-section="mm-0"'), success.indexOf('data-mm-section="mm-1"'));
  assert.equal((successSection.match(/单实验分析结论/g) || []).length, 1);
  assert(!successSection.includes("<p>该实验取数失败</p>"));
});

check("历史快照缺少 PreAA 时不从实验后数据补算", () => {
  const legacy = copy(saved); legacy.results.forEach(result => { delete result.preAA; });
  const descriptor = reportDescriptor(legacy);
  assert(descriptor.moduleContent[0].experiments.every(experiment => experiment.status === "unavailable"));
  assert(descriptor.moduleContent[0].experiments.every(experiment => !experiment.datasets.length));
  assert(renderMultiReport(descriptor, {}).includes("未使用实验后数据补算"));
});

const changedWindow = copy(input);
changedWindow.experiments[1].end = "2026-10-20";
const secondTask = createAnalysisTask(store, changedWindow);
await executeAnalysisTask(secondTask, () => {}, 0);
check("实验后观察窗口改变核心指标，但 PreAA 实验前证据保持一致", () => {
  assert.deepEqual(secondTask.results[1].preAA, task.results[1].preAA);
  assert.notEqual(secondTask.results[1].rows[0].values.gmv.value, task.results[1].rows[0].values.gmv.value);
  assert.equal(JSON.stringify(saved), frozenReport);
});

check("稳定混合报告展示 PreAA 与综合分析，原多实验样例保留两章", () => {
  const mixed = reportDescriptor(demoMixedModuleReport());
  assert.deepEqual(mixed.moduleContent.map(module => module.analysisType), ["single", "multi"]);
  assert.equal(demoModuleReport().snapshot.modules.length, 2);
  assert.equal(mixed.moduleContent[0].experiments.length, 3);
  assert.equal(mixed.moduleContent[0].experiments.every(experiment => experiment.datasets.length === 1), true);
  const content = renderMultiReport(mixed, {});
  assert(content.includes('data-mm-select="mm-0"'));
  assert(content.includes('data-mm-select="mm-1"'));
});
console.log(`\n${checks} 项混合模块报告验收通过。`);
