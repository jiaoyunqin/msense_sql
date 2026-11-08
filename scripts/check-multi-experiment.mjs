import assert from "node:assert/strict";
import {
  copy, comparisonMetrics, demoExperiments, findExperiment, experimentInput, parseExperimentIds, experimentIssues,
  observedDays, initializeMultiAnalysis, templateIssues, templateStatus, templateChanged, setTemplateEnabled, publishTemplate, newTemplate, publishedTemplates,
  workbenchModuleOptions, workbenchIssues, createAnalysisTask, executeAnalysisTask, createTaskReport, comparisonBoundaries,
  deriveGroup, deriveBreakdowns, reportMetrics
} from "../src/multi-experiment-data.js";
import { reportDescriptor, renderMultiReport, multiAnswer } from "../src/multi-experiment-report.js";
import { moduleView, singleScope } from "../src/multi-report-content.js";

const metricSource = { id: "test-source", capabilityId: "demo-comparison", version: 1, showInReport: true, metricKeys: comparisonMetrics.map(metric => metric.key), dimensionKeys: ["overall", "demo-spend"] };
const modules = [["multi-core", "multi"], ["multi-strategy", "multi"], ["multi-detail", "multi"], ["single-demo-core", "single"]]
  .map(([id, analysisType]) => ({ id, name: id, enabled: true, versions: [{
    number: 1, configuration: { name: id, analysisType, sources: [copy(metricSource)], reasoning: "独立实验分析" }
  }] }));
const store = { modules };
initializeMultiAnalysis(store);
const draft = {
  analysisType: "multi", goal: "平台老客提频", templateId: "demo-template-multi",
  experiments: demoExperiments.map(experiment => experimentInput(experiment.id)), supplement: "关注短时效券",
  scenario: "fail-last"
};
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };
check("独立实验 ID 去重，支持中英文分隔符", () => {
  assert.deepEqual(parseExperimentIds("demo-001，DEMO-002\nDEMO-001 DEMO-003"), { ids: ["DEMO-001", "DEMO-002", "DEMO-003"], duplicates: 1 });
});
check("未知身份、非法日期、反向窗口和无策略组被拦截", () => {
  assert(experimentIssues(experimentInput("UNKNOWN")).length);
  assert.equal(observedDays("2026-02-30", "2026-03-03"), null);
  assert.equal(observedDays("2026-10-14", "2026-10-01"), null);
  assert(experimentIssues({ ...experimentInput("DEMO-001"), groupIds: [] }).length);
});
check("实验期后追踪允许，未覆盖窗口准确拦截", () => {
  assert.equal(experimentIssues({ ...experimentInput("DEMO-001"), end: "2026-10-20" }).length, 0);
  assert(experimentIssues({ ...experimentInput("DEMO-001"), end: "2026-11-20" }).length);
});
check("多实验要求不同实验；单实验不能替代多实验", () => {
  assert(workbenchIssues(store, { ...draft, experiments: [draft.experiments[0]] }).length);
  assert(workbenchIssues(store, { ...draft, experiments: [draft.experiments[0], draft.experiments[0]] }).length);
  assert(workbenchIssues(store, { ...draft, analysisType: "single", templateId: "demo-template-single" }).length);
});
check("模块类型、下线和无效版本阻止模板发布与任务引用", () => {
  const invalid = copy(store.reportTemplates[1]);
  invalid.sections[0].moduleId = "multi-core";
  assert(templateIssues(store, invalid).length);
  const module = store.modules[0]; module.enabled = false;
  assert.equal(publishedTemplates(store, "multi").length, 0);
  module.enabled = true;
  invalid.sections[0].version = 999;
  assert.throws(() => publishTemplate(store, invalid));
  assert.throws(() => publishTemplate(store, newTemplate()));
});
check("模板列表草稿上线需校验；重新上线保留原发布快照", () => {
  const invalid = newTemplate();
  assert.equal(templateStatus(invalid), "draft");
  assert.throws(() => setTemplateEnabled(store, invalid, true));
  assert.equal(invalid.versions.length, 0);
  const template = newTemplate("multi");
  Object.assign(template, { name: "上线验收模板", description: "本地验收", sections: copy(store.reportTemplates[0].sections) });
  setTemplateEnabled(store, template, true);
  assert.equal(templateStatus(template), "online");
  assert.equal(template.versions.length, 1);
  const snapshot = JSON.stringify(template.versions[0]);
  setTemplateEnabled(store, template, false);
  assert.equal(templateStatus(template), "offline");
  template.name = ""; // An unfinished edit must not replace the valid published version.
  setTemplateEnabled(store, template, true);
  assert.equal(templateStatus(template), "online");
  assert.equal(template.versions.length, 1);
  assert.equal(JSON.stringify(template.versions[0]), snapshot);
});
check("归档模板不再参与新分析，已有模板版本保留", () => {
  const isolated = copy(store), template = isolated.reportTemplates[0], snapshot = JSON.stringify(template.versions);
  template.archived = true;
  assert.equal(templateStatus(template), "archived");
  assert(!publishedTemplates(isolated, "multi").some(candidate => candidate.id === template.id));
  assert.throws(() => setTemplateEnabled(isolated, template, true));
  assert.equal(JSON.stringify(template.versions), snapshot);
});
check("模板适用端与分析文本进入固定版本；旧版缺省字段兼容", () => {
  assert.equal(newTemplate().analysisType, "single");
  const template = newTemplate("multi");
  Object.assign(template, { name: "版本配置验证", description: "模板复刻验证",
    apps: ["抖音"], reasoning: "先核对核心指标", considerations: "关注观察窗口",
    sections: copy(store.reportTemplates[0].sections) });
  const version = publishTemplate(store, template);
  assert.equal(templateChanged(template), false);
  template.apps.push("极速版"); template.reasoning = "修改后的思路";
  assert.deepEqual(version.configuration.apps, ["抖音"]);
  assert.equal(version.configuration.reasoning, "先核对核心指标");
  assert.equal(version.configuration.considerations, "关注观察窗口");
  assert.equal(templateChanged(template), true);
  const legacy = copy(template);
  legacy.apps = []; legacy.reasoning = ""; legacy.considerations = "";
  delete legacy.versions[0].configuration.apps;
  delete legacy.versions[0].configuration.reasoning;
  delete legacy.versions[0].configuration.considerations;
  assert.equal(templateChanged(legacy), false);
  legacy.goal = "";
  assert(templateIssues(store, legacy).includes("请选择业务目标。"));
});
check("首页候选模块只读取同类型已上线版本，草稿名称不覆盖发布名称", () => {
  const isolated = copy(store);
  isolated.modules[0].name = "未发布的新名称";
  isolated.modules[1].enabled = false;
  isolated.modules[2].archived = true;
  const choices = workbenchModuleOptions(isolated, "multi");
  assert.deepEqual(choices.map(choice => choice.module.id), ["multi-core"]);
  assert.equal(choices[0].configuration.name, "multi-core");
});
check("全部筛选展示两类配置，但全部不能作为任务分析类型", () => {
  const before = JSON.stringify(draft);
  assert.equal(publishedTemplates(store, "all").length,
    publishedTemplates(store, "single").length + publishedTemplates(store, "multi").length);
  assert.equal(workbenchModuleOptions(store, "all").length,
    workbenchModuleOptions(store, "single").length + workbenchModuleOptions(store, "multi").length);
  assert.equal(JSON.stringify(draft), before);
  assert.throws(() => createAnalysisTask(store, { ...draft, analysisType: "all" }));
});
check("单独模块选择拒绝类型不一致、下线、归档、重复及模板混选", () => {
  const isolated = copy(store), input = { ...copy(draft), templateId: "", moduleIds: ["multi-core"] };
  assert.equal(workbenchIssues(isolated, input).length, 0);
  for (const moduleIds of [["single-demo-core"], ["unknown"], ["multi-core", "multi-core"]]) {
    assert.throws(() => createAnalysisTask(isolated, { ...input, moduleIds }));
  }
  assert.throws(() => createAnalysisTask(isolated, { ...input, templateId: "demo-template-multi" }));
  isolated.modules[0].enabled = false;
  assert.throws(() => createAnalysisTask(isolated, input));
  isolated.modules[0].enabled = true; isolated.modules[0].archived = true;
  assert.throws(() => createAnalysisTask(isolated, input));
});
const moduleStore = copy(store), moduleInput = { ...copy(draft), templateId: "", moduleIds: ["multi-detail", "multi-core"], scenario: "normal" };
const moduleTask = createAnalysisTask(moduleStore, moduleInput);
moduleStore.modules[2].versions[0].configuration.name = "任务后修改";
moduleInput.moduleIds.reverse();
await executeAnalysisTask(moduleTask, () => {}, 0);
check("首页模块生成正式报告，固定选择顺序及发布版本，不创建隐含模板", () => {
  assert.equal(moduleTask.private, false);
  assert.equal(moduleTask.snapshot.origin, "modules");
  assert.equal(moduleTask.snapshot.templateId, "");
  assert.deepEqual(moduleTask.snapshot.modules.map(module => module.id), ["multi-detail", "multi-core"]);
  assert.equal(moduleTask.snapshot.modules[0].configuration.name, "multi-detail");
  assert.equal(moduleStore.reportTemplates.length, store.reportTemplates.length);
  const saved = createTaskReport(moduleStore, moduleTask), report = reportDescriptor(saved);
  assert.equal(saved.private, false);
  assert(report.meta.some(([label, value]) => label === "模块版本" && value.includes("multi-detail · v1")));
  assert(renderMultiReport(report, {}).includes("DEMO-001"));
});
const original = copy(draft);
const task = createAnalysisTask(store, draft);
draft.experiments[0].end = "2026-10-20";
store.modules[0].versions[0].configuration.name = "被编辑";
check("任务冻结逐实验日期和模块版本", () => {
  assert.equal(task.snapshot.experiments[0].input.end, "2026-10-14");
  assert.equal(task.snapshot.modules[0].configuration.name, "multi-core");
});
await executeAnalysisTask(task, () => {}, 0);
check("部分失败保留两个成功实验，失败数据不进入比较", () => {
  assert.deepEqual(task.results.map(result => result.status), ["success", "success", "failed"]);
  assert.equal(task.results[2].rows.length, 0);
});
const partial = createTaskReport(store, task), frozen = JSON.stringify(partial);
check("指标以各实验自己的对照组计算", () => {
  const row = task.results[1].rows[0];
  assert(Math.abs(row.values.dac.uplift - 15) < 1e-9);
  assert(Math.abs(row.values.incrementalDac.value - (.01955 - .017) * 14 * 88000) < 1e-6);
  assert(Math.abs(row.values.roi.value - (2.58 - 2.2) * 88000 / 23800) < 1e-9);
  assert.equal(row.controlId, "002-C");
});
const successRows = JSON.stringify(task.results[0].rows);
await executeAnalysisTask(task, () => {}, 0);
const complete = createTaskReport(store, task);
check("只重试失败项；旧部分报告仍是不可变快照", () => {
  assert.deepEqual(task.results.map(result => result.attempts), [1, 1, 2]);
  assert.equal(JSON.stringify(task.results[0].rows), successRows);
  assert.equal(JSON.stringify(partial), frozen);
  assert.notEqual(complete.id, partial.id);
});
check("缺失、零分母和负增量不会变成伪成本或伪零值", () => {
  assert.equal(task.results[2].rows[0].values.redeemCost.value, null);
  const definition = findExperiment("DEMO-001"), group = copy(definition.groups[0]);
  group.subsidyDaily = 0; group.dacDaily = definition.control.dacDaily - .001;
  const row = deriveGroup(definition, experimentInput(definition.id), group);
  assert.equal(row.values.roi.value, null);
  assert.equal(row.values.cost.value, null);
  assert(row.values.incrementalDac.value < 0);
});
check("分层与整体一致；分层显著性不继承整体显著性", () => {
  const definition = findExperiment("DEMO-001"), input = experimentInput(definition.id);
  const breakdown = deriveBreakdowns(definition, input).filter(row => row.groupId === "001-A");
  const aggregate = deriveGroup(definition, input, definition.groups[0]);
  assert(Math.abs(breakdown.reduce((sum, row) => sum + row.values.incrementalDac.value, 0) - aggregate.values.incrementalDac.value) < 1e-6);
  assert(breakdown.every(row => row.values.dac.sig === "未提供分层显著性"));
});
check("窗口和人群差异明确标示解释边界", () => {
  const boundaries = comparisonBoundaries(complete.snapshot, complete.results);
  assert(boundaries.some(text => text.includes("观察天数不同")));
  assert(boundaries.some(text => text.includes("跨实验差异显著")));
});
check("报告展示与追问来源相同；视图筛选不改写快照", () => {
  const report = reportDescriptor(complete), view = {};
  const html = renderMultiReport(report, view);
  assert(html.includes("DEMO-001") && html.includes("消费力分层"));
  const before = JSON.stringify(complete);
  moduleView(view, report.moduleContent[0]).experimentId = "DEMO-002"; renderMultiReport(report, view);
  assert.equal(JSON.stringify(complete), before);
  assert.equal(moduleView(view, report.moduleContent[1]).experimentId, "DEMO-001");
  assert(multiAnswer(report, "怎么计算 ROI", singleScope(0, "DEMO-002"), view).md.includes("[[cite:mm-0-exp-DEMO-002::"));
  const selected = copy(complete.snapshot);
  selected.modules.forEach(module => { module.configuration.sources[0].metricKeys = ["roi"]; });
  assert.deepEqual(reportMetrics(selected).map(metric => metric.key), ["roi"]);
});
check("只成功一个实验时不产生横向报告", () => {
  const one = copy(task); one.results.slice(1).forEach(result => { result.status = "failed"; result.rows = []; });
  assert.equal(createTaskReport(store, one), null);
});
const privateTask = createAnalysisTask(store, { ...original, templateId: "" }, { trialModule: {
  id: "multi-core", name: "模块试跑", description: "", analysisType: "multi", sources: [copy(metricSource)]
} });
privateTask.scenario = "normal";
await executeAnalysisTask(privateTask, () => {}, 0);
check("模块试跑保存私有记录，并与正式报告区分", () => {
  const report = createTaskReport(store, privateTask);
  assert(report.private);
  assert.equal(privateTask.snapshot.origin, "trial");
  assert.equal(privateTask.snapshot.templateId, "");
  assert.equal(store.modules[0].multiAttempts[0].reportId, report.id);
});
check("重载中断可恢复，已成功实验不重新取数", () => {
  task.status = "running"; task.executing = true; task.results[2].status = "fetching";
  initializeMultiAnalysis(store);
  assert.equal(task.status, "interrupted"); assert.equal(task.executing, undefined);
  assert.equal(task.results[0].status, "success"); assert.equal(task.results[2].status, "failed");
});
console.log(`\n${checks} 项多实验语义验收通过。`);
