import assert from "node:assert/strict";
import fs from "node:fs";
import { conclusionAnnotations, formatConclusionNumber, generatedConclusionAnnotations, renderConclusionText } from "../src/report-conclusion-emphasis.js";
import { renderReportSummary } from "../src/report-summary.js";
import { demoModuleReport, demoMixedModuleReport } from "../src/multi-report-content.js";
import { reportDescriptor, renderMultiReport } from "../src/multi-experiment-report.js";

const decode = text => text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
const strip = html => decode(html.replace(/<br>\n/g, "\n").replace(/<[^>]+>/g, ""));
const rawText = html => strip(html.replace(/<span class="cf-number" data-cf-raw="([^"]*)"[^>]*>[^<]*<\/span>/g, (_, raw) => raw));
const numberTags = html => [...html.matchAll(/<span class="cf-number" data-cf-raw="([^"]*)"[^>]*>([^<]*)<\/span>/g)]
  .map(match => ({ raw: decode(match[1]), value: decode(match[2]) }));
const directions = html => [...html.matchAll(/<(strong|span)[^>]*data-cf-direction="(up|down)"[^>]*><span[^>]*>([^<]*)<\/span><\/\1>/g)]
  .map(match => [match[2], decode(match[3])]);
const render = (text, annotations = []) => renderConclusionText({ text, scope: "test" }, annotations);
let count = 0;
const check = (name, fn) => { fn(); count++; console.log(`✓ ${name}`); };

check("小数与百分比精确四舍五入、补足两位，整数不补零", () => {
  for (const [raw, expected] of [["4.4071", "4.41"], ["39.8%", "39.80%"], ["95%", "95.00%"], ["1.005", "1.01"],
    ["9.999", "10.00"], ["−0.004", "0.00"], ["+4.1%", "+4.10%"], ["4,757", "4,757"], ["1,999.995", "2,000.00"],
    ["56%", "56.00%"], ["9007199254740993.235", "9007199254740993.24"]]) assert.equal(formatConclusionNumber(raw), expected);
  assert.equal(strip(render("比例56%–58%，小数0.59～0.789，人数1,927人。")), "比例56.00%–58.00%，小数0.59～0.79，人数1,927人。");
});
check("增加标绿、减少标红，不按成本或降级指标反转、不以显著性作门槛", () => {
  assert.deepEqual(directions(render("成本由4.3763元升至4.4071元、4.3932元，增加0.70%、0.39%。")),
    [["up", "4.41"], ["up", "4.39"], ["up", "0.70%"], ["up", "0.39%"]]);
  assert.deepEqual(directions(render("降级率下降1.04%、1.08%，降级增量−4,452.34人，提升+0.23%（不显著）。")),
    [["down", "1.04%"], ["down", "1.08%"], ["down", "−4,452.34"], ["up", "+0.23%"]]);
  assert.deepEqual(directions(render("相对不发券提升2.3%，未提升3%，预计增长+2%，最高4，最低1，增幅0%。")),
    [["up", "2.30%"]]);
  assert.deepEqual(directions(render("指标由-5升至-2，另一项由-2降至-5。")), [["up", "-2"], ["down", "-5"]]);
});
check("方向与重点独立，一般涨跌只着色，明确选择的数字才加粗放大", () => {
  const item = { text: "支付天提升5%，GMV下降2.3%，仅描述变化。", scope: "test" };
  const ordinary = renderConclusionText(item, generatedConclusionAnnotations(item));
  assert.deepEqual(directions(ordinary), [["up", "5.00%"], ["down", "2.30%"]]);
  assert.equal((ordinary.match(/class="cf-highlight /g) || []).length, 0);
  assert.equal((ordinary.match(/class="cf-trend /g) || []).length, 2);
  const selected = renderConclusionText(item, [["5%", "key", "test"]]);
  assert.equal((selected.match(/class="cf-highlight /g) || []).length, 1);
  assert.equal((selected.match(/class="cf-trend /g) || []).length, 1);
  const focal = { text: "策略A增幅+5%，策略B增幅−2.3%。", metricKey: "dac", scope: "test" };
  assert.equal(generatedConclusionAnnotations(focal).length, 2);
  const explicit = renderConclusionText({ runs: [{ text: "关键结果：", strong: true }, { text: "提升" }, { text: "5%", key: true }] });
  assert(explicit.includes("cf-highlight-positive"));
  const sentenceOnly = renderConclusionText({ runs: [{ text: "支付天提升5%，但不显著。", strong: true }] });
  assert(sentenceOnly.includes("cf-key-sentence") && sentenceOnly.includes("cf-trend-positive"));
  assert(!sentenceOnly.includes('class="cf-highlight '));
  assert(strip(sentenceOnly).endsWith("但不显著。"));
});
check("普通绝对值、ROI阈值、置信水平不自动着色，旧业务色只保留重点选择", () => {
  const text = "ROI 6.68、置信水平95%，成本1.8元。";
  assert.deepEqual(directions(render(text)), []);
  const marked = render(text, [["6.68", "positive", "module"], ["1.8元", "negative", "module"]]);
  assert.deepEqual(directions(marked), []);
  assert(marked.includes("cf-highlight-key"));
  assert(!marked.includes("cf-highlight-positive") && !marked.includes("cf-highlight-negative"));
  assert.deepEqual(directions(render("ROI -1.234，原值−4.1元。")), []);
});
check("括号样式优先于重点和方向，支持嵌套括号，不将缩写和价档当注释", () => {
  const html = render("提升2.3%（下降1.234%，包括（占比35%））；价格(5,10]元，支付天(DAC)。",
    [["1.234%", "positive", "module"], ["35%", "key", "module"]]);
  assert.deepEqual(directions(html), [["up", "2.30%"]]);
  assert(!/<em[^>]*>[^<]*<strong/.test(html));
  assert(/<em[^>]*><span[^>]*>1.23%<\/span><\/em>/.test(html));
  assert(/<em[^>]*><span[^>]*>35.00%<\/span><\/em>/.test(html));
  assert(html.includes("支付天(DAC)"));
  assert.equal(strip(html), "提升2.30%（下降1.23%，包括（占比35.00%））；价格(5,10]元，支付天(DAC)。");
  assert.deepEqual(directions(render("缩短0.41小时（8.04%）、0.40小时（7.77%）。")), [["down", "0.41"], ["down", "0.40"]]);
});
check("标识符、日期、时间、版本、分位数和整数编号保持原样", () => {
  const text = "实验DEMO-001，Libra ID 123456，日期2026-10-01，10:30，v1.2，模型2，P50 1.2345小时。";
  assert.equal(strip(render(text)), text.replace("1.2345", "1.23"));
  assert.equal(strip(render("区间(1.235,2.366]元。")), "区间(1.24,2.37]元。");
  assert.deepEqual(directions(render(text)), []);
  assert.equal(strip(render("ROI1.2345；GMV-ROI2.367；v1.2；DEMO-001。")), "ROI1.23；GMV-ROI2.37；v1.2；DEMO-001。");
});
check("富文本跨段数字只格式化一次，概括句加粗且原始精度仍可追溯", () => {
  const item = { runs: [{ text: "三组增量均由低价档主导。", strong: true }, { text: "成本增加4.", strong: true }, { text: "4071元。" }] };
  const html = renderConclusionText(item);
  assert.equal(rawText(html), item.runs.map(run => run.text).join(""));
  assert.equal(numberTags(html).find(number => number.raw === "4.4071").value, "4.41");
  assert(html.includes('title="原始值：4.4071"') && html.includes("cf-key-sentence"));
  assert(render("三组增量均由低价档主导：占比45.4%。").includes('class="cf-key-sentence"'));
  const unsafe = render("<script>alert(1)</script>，下降2.3%");
  assert(!unsafe.includes("<script>") && unsafe.includes("&lt;script&gt;"));
});
check("静态报告全部结论统一两位显示，恢复原值后逐字一致，不修改快照", () => {
  const source = JSON.parse(fs.readFileSync(new URL("../src/report-complete-data.json", import.meta.url), "utf8"));
  const frozen = JSON.stringify(source);
  let numericCount = 0, keyCount = 0;
  const blocks = [["cf-summary", source.summary], ...source.modules.map(module => [`cf-${module.id}`, module.conclusion])];
  for (const [scope, items] of blocks) for (const item of items.flatMap(block => block.items || [block])) {
    const html = renderConclusionText({ ...item, scope }, conclusionAnnotations[scope]);
    assert.equal(rawText(html), item.runs?.length ? item.runs.map(run => run.text).join("") : item.text, scope);
    for (const number of numberTags(html)) {
      numericCount++;
      if (/[.%％]/.test(number.raw)) assert.match(number.value, /[+\-−]?\d(?:[\d,]*)\.\d{2}[%％]?$/);
    }
    keyCount += (html.match(/class="cf-highlight /g) || []).length;
  }
  assert(numericCount > 400 && keyCount > 60);
  assert.equal(JSON.stringify(source), frozen);
});
check("多实验和混合报告使用同一规则，原始结果与AI证据快照不变", () => {
  for (const saved of [demoModuleReport(), demoMixedModuleReport()]) {
    const before = JSON.stringify(saved), report = reportDescriptor(saved), html = renderMultiReport(report, {});
    assert(html.includes("cf-key-sentence") && html.includes('data-cf-direction="up"'));
    for (const number of numberTags(html)) if (/[.%％]/.test(number.raw)) assert.match(number.value, /\.\d{2}[%％]?$/);
    assert.equal(JSON.stringify(saved), before);
  }
  const item = { text: "增幅 +4.1%（不显著）；GMV-ROI 1.7。", scope: "module" };
  const html = renderConclusionText(item, generatedConclusionAnnotations(item, item.scope));
  assert.deepEqual(directions(html), [["up", "+4.10%"]]);
  assert(html.includes("1.70") && html.includes("不显著"));
});
check("已保存的报告级富文本结论也经过统一格式，不回落旧的语义颜色", () => {
  const html = renderReportSummary({ id: "saved", title: "实验核心结论", blocks: [{
    text: "成本上升4.4071元（+2%）",
    runs: [{ text: "成本上升", value: "4.4071", tone: "negative" }, { text: "元（", value: "+2%", suffix: "）", note: true }]
  }] }, { emphasis: true });
  assert.deepEqual(directions(html), [["up", "4.41"]]);
  assert(html.includes("+2.00%") && !html.includes("sv-highlight"));
});
console.log(`\n${count} 项一期分析结论规则检查通过。`);
