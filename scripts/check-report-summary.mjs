import assert from "node:assert/strict";
import { demoModuleReport, demoMixedModuleReport, demoMatrixModuleReport, moduleView } from "../src/multi-report-content.js";
import { reportDescriptor, renderMultiReport, multiAnswer, multiSuggestions, applyModuleReportEvent, prepareModuleCitation } from "../src/multi-experiment-report.js";
import { renderReportSummary, reportSummaryText } from "../src/report-summary.js";

let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };
const text = report => reportSummaryText(report.summary);
const summaryHTML = report => renderReportSummary(report.summary);
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

check("矩阵、混合及新任务报告都仅在表头与首个模块之间展示核心结论", () => {
  for (const saved of [demoModuleReport(), demoMixedModuleReport(), demoMatrixModuleReport(),
    { ...demoModuleReport(), id: "new-task-report", taskId: "new-task" }]) {
    const original = JSON.stringify(saved);
    const report = reportDescriptor(freeze(saved)), html = renderMultiReport(report, {});
    const summary = html.indexOf(`id="sec-${report.summary.id}"`);
    assert.equal((html.match(/class="sec reference-summary"/g) || []).length, 1);
    assert(html.indexOf("</header>") < summary);
    assert(summary < html.indexOf('data-mm-section="mm-0"'));
    assert(html.includes(summaryHTML(report)));
    assert(!report.sections.some(section => section.id === report.summary.id));
    assert.equal(report.sections[0].no, "01");
    assert.equal(report.moduleContent.length, saved.snapshot.modules.length);
    assert.equal(JSON.stringify(saved), original);
  }
});

check("整份报告汇总显著性、逐实验钱效及其他模块发现，不套用 ROI 达标阈值", () => {
  const report = reportDescriptor(demoMatrixModuleReport()), summary = text(report);
  assert(summary.includes("2 个实验存在正向显著策略组"));
  assert(summary.includes("1 个实验的策略组均不显著"));
  for (const experiment of report.moduleContent[0].experiments) {
    assert(summary.includes(experiment.name) && summary.includes(experiment.id));
    for (const row of experiment.datasets.find(dataset => dataset.mode === "overall").records.filter(row => !row.control)) {
      const roi = row.cells[experiment.datasets[0].fields.findIndex(field => field.key === "roi")].text;
      assert(summary.includes(`GMV-ROI ${roi}`));
    }
  }
  assert(summary.includes("平均核销间隔最短（2.84 小时）"));
  assert(summary.includes("不能据此推断跨实验显著性"));
  assert(!summary.includes("1.8") && !summary.includes("均达标") && !summary.includes("最优组为"));
  assert(text(reportDescriptor(demoMixedModuleReport())).includes("不能据此判定 AA 通过"));
  assert.equal(multiSuggestions(reportDescriptor(demoMixedModuleReport()), "mm-0")[0], "逐个总结本模块各实验的结论");
  const missingMetric = demoModuleReport();
  for (const result of missingMetric.results) for (const row of result.rows) {
    row.values.dac.value = null;
    row.values.dac.reason = "支付天数据未保存";
  }
  assert(!reportDescriptor(missingMetric).summary.lead.includes("支付天 (DAC)方面"));
});

check("模块实验、分组、转置及矩阵显示范围不影响报告核心结论", () => {
  for (const saved of [demoModuleReport(), demoMixedModuleReport(), demoMatrixModuleReport()]) {
    const report = reportDescriptor(saved), original = summaryHTML(report), view = {};
    renderMultiReport(report, view);
    for (const module of report.moduleContent) {
      const matrix = module.comparison;
      const changed = applyModuleReportEvent({ type: matrix ? "click" : "change", target: { closest: () => ({
        dataset: matrix ? { matrixModule: module.id, matrixKey: matrix.datasets[0].key, matrixTranspose: "" }
          : { mmSelect: module.id }, value: module.experiments.at(-1).id }) } }, report, view);
      assert.equal(changed.moduleId, module.id);
      const state = moduleView(view, module);
      state.tables["selected:0"] = { group: "some-group", transposed: true };
      if (state.matrix) for (const table of Object.values(state.matrix.datasets)) {
        table.search = "no-match"; table.transposed = true; table.selected = [];
      }
    }
    assert(renderMultiReport(report, view).includes(original));
    assert.equal(summaryHTML(report), original);
  }
});

check("仅使用报告已选且展示的指标，不引用隐藏的 DAC、GMV 或计算指标", () => {
  const saved = demoModuleReport();
  saved.snapshot.modules = saved.snapshot.modules.slice(0, 1);
  saved.snapshot.template.sections = saved.snapshot.template.sections.slice(0, 1);
  const configuration = saved.snapshot.modules[0].configuration;
  configuration.sources[0].metricKeys = ["roi"];
  delete configuration.calculatedMetrics;
  const report = reportDescriptor(saved), summary = text(report);
  assert(summary.includes("GMV-ROI"));
  assert(!summary.includes("支付天") && !summary.includes("人均支付 GMV") && !summary.includes("增幅") && !summary.includes("结算"));
  configuration.sources[0].showInReport = false;
  const unavailable = text(reportDescriptor(saved));
  assert(!unavailable.includes("GMV-ROI"));
  assert(unavailable.includes("没有可用数据"));
});

check("部分失败、模块数据缺失和字段缺失均保留原因，全失败不生成效果结论", () => {
  const saved = demoMixedModuleReport();
  saved.results[0].status = "failed"; saved.results[0].error = "实验一取数失败";
  delete saved.results[1].preAA;
  const summary = text(reportDescriptor(saved));
  assert(summary.includes("2 个实验已取得数据"));
  assert(summary.includes("实验一取数失败"));
  assert(summary.includes("未使用实验后数据补算"));
  assert(summary.includes("未提供核销补贴"));
  saved.results.forEach(result => { result.status = "failed"; result.error = "取数失败"; });
  const failed = text(reportDescriptor(saved));
  assert(failed.includes("当前没有可用实验结果"));
  assert(!failed.includes("存在正向显著") && !failed.includes("GMV-ROI"));
});

check("同一来源在多个模块重复引用时，整体结果按实验与组去重", () => {
  const saved = demoModuleReport(), duplicate = structuredClone(saved.snapshot.modules[0]);
  duplicate.id = "another-core-module";
  saved.snapshot.modules.push(duplicate);
  saved.snapshot.template.sections.push({ moduleId: duplicate.id, title: duplicate.configuration.name });
  const report = reportDescriptor(saved);
  const core = report.summary.blocks.find(block => block.h === "整体效果与钱效");
  assert.equal(core.list.length, 3);
  assert(report.summary.lead.includes("2 个实验存在正向显著策略组"));
});

check("矩阵无法对齐的结果不进入核心结论，摘要与矩阵保持同一份有效证据", () => {
  const saved = demoMatrixModuleReport();
  const roi = saved.matrixSnapshot[0].datasets[0].experiments[0].contract.metrics.find(field => field.key === "roi");
  roi.unit = "未知单位";
  const summary = text(reportDescriptor(saved));
  assert(summary.includes("GMV-ROI缺失：指标单位不一致"));
  assert(!summary.includes("GMV-ROI 1.72") && !summary.includes("GMV-ROI 1.39"));
  assert(summary.includes("GMV-ROI 1.41"));
  assert(!summary.includes("消费力分层"));
  saved.matrixSnapshot = [];
  const missing = text(reportDescriptor(saved));
  assert(!missing.includes("存在正向显著") && !missing.includes("每支付天 GMV"));
  assert(missing.includes("当前模块无可对齐的整体数据"));
});

check("已保存报告级正文保持原值，旧报告在阅读时汇总且不回写快照", () => {
  const saved = demoModuleReport();
  saved.summary = { id: "saved-summary", title: "历史标题", lead: "已保存的核心结论", blocks: [{ h: "发现", list: ["固定结果"] }] };
  const original = JSON.stringify(saved), report = reportDescriptor(freeze(saved));
  assert.equal(report.summary.id, "saved-summary");
  assert.equal(report.summary.title, "实验核心结论");
  assert.equal(report.summary.lead, saved.summary.lead);
  assert.deepEqual(report.summary.blocks, saved.summary.blocks);
  assert(!text(report).includes("2 个实验存在正向显著"));
  assert.equal(JSON.stringify(saved), original);
});

check("整份报告及核心结论追问包含固定总结，引用不改变模块选择，模块追问仍隔离", () => {
  const report = reportDescriptor(demoMatrixModuleReport()), view = {};
  renderMultiReport(report, view);
  moduleView(view, report.moduleContent[0]).experimentId = "DEMO-003";
  const original = JSON.stringify(view);
  assert.deepEqual(prepareModuleCitation(report, report.summary.id, view), { scope: report.summary.id });
  assert.equal(JSON.stringify(view), original);
  for (const scope of ["all", report.summary.id]) {
    const answer = multiAnswer(report, "总结核心结论", scope, view).md;
    assert(answer.includes(text(report)));
    assert(answer.includes(`[[cite:${report.summary.id}::查看实验核心结论]]`));
    assert.deepEqual(multiSuggestions(report, scope)[0], "总结这份报告的核心结论");
  }
  const module = multiAnswer(report, "总结这个实验", "mm-0-exp-DEMO-003", view).md;
  assert(!module.includes("DEMO-001") && !module.includes("DEMO-002"));
  assert(!module.includes(`[[cite:${report.summary.id}::`));
});

check("共用卡片保留单实验标题、正文层级与 AI 入口，并转义保存的文本", () => {
  const html = renderReportSummary({ id: "summary", title: "实验核心结论", lead: "<img src=x>",
    blocks: [{ h: "发现", list: ["<script>"] }, { text: "正文" }] });
  assert(html.includes('class="sec reference-summary"'));
  assert(html.includes('class="ccard-h"') && html.includes('data-ask="summary"'));
  assert(html.includes('aria-label="向 AI 提问：实验核心结论"'));
  assert(html.includes("<h4>发现</h4>") && html.includes("<ul><li>&lt;script&gt;</li></ul>"));
  assert(html.includes("<p>&lt;img src=x&gt;</p>") && html.includes("<p>正文</p>"));
  assert(!html.includes("<script>") && !html.includes("<img"));
});

console.log(`\n${checks} 项报告核心结论验收通过。`);
