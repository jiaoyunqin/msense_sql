import assert from "node:assert/strict";
import fs from "node:fs";
import {
  showcase, denominator, contribution, shareEvidence, barDomain, barGeometry,
  normalizeReading, readingState, visibleRows, topContributors
} from "../src/report-showcase-data.js";
import {
  showcaseDescriptor, showcaseListRow, renderShowcaseReport,
  showcaseEvent, showcaseBeforeGoto, showcaseAnswer
} from "../src/report-showcase.js";

let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };
const original = JSON.stringify(showcase);
const source = JSON.parse(fs.readFileSync(new URL("../src/report-reference-data.json", import.meta.url), "utf8"));
// Parsing is confined to verification: the runtime consumes typed snapshot values.
const numeric = text => Number(text.split("\n")[0].replaceAll(",", "").replace("￥", "").replace("万", "")) * (text.includes("万") ? 10000 : 1);
const fields = ["dac", "delta", "daily", "redemptionCost", "cost", "roi", "gmv", "gmvDelta"];
function sameValues(row, saved) {
  fields.forEach((field, index) => assert(Math.abs(row[field] - numeric(saved[index + 1])) < 1e-8, `${row.label || "整体"} / ${field}`));
  assert.equal(row.gmvDeltaDisplay, saved[8]);
  for (const [field, index] of [["dac", 1], ["gmv", 7]]) {
    assert.equal(row[`${field}Lift`], Number(saved[index].match(/增幅 ([\d.-]+)%/)[1]));
    assert.equal(row[`${field}Significance`], saved[index].split("\n")[2]);
  }
}
const event = (view, data, { value, checked, type = data.svControl ? "change" : "click" } = {}) =>
  showcaseEvent({ type, target: { closest: () => ({ dataset: data, value, checked }) } }, view);
const htmlFor = view => renderShowcaseReport(showcaseDescriptor(), view);
const rowIds = html => [...html.matchAll(/data-sv-action="table-row" data-sv-id="([^"]+)"/g)].map(match => match[1]);
const chartIds = html => [...html.matchAll(/data-sv-action="chart-row" data-sv-id="([^"]+)"/g)].map(match => match[1]);
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)
} });

check("九个人群及整体数值、显著性与原快照逐项一致，保留源 GMV 精度", () => {
  const rows = source.modules.find(module => module.id === "report-module-11").rows;
  assert.equal(showcase.rows.length, rows.length);
  showcase.rows.forEach((row, index) => {
    assert.equal(row.label, rows[index][0]); sameValues(row, rows[index]);
    assert.equal(row.deltaSignificance, null); assert.equal(row.shareSignificance, null);
    assert.equal(row.evidence.row, index);
  });
  sameValues(showcase.overall, source.modules.find(module => module.id === "report-module-10").rows[1]);
  assert.equal(showcase.overall.controlDac, 0.28);
  assert.throws(() => { showcase.rows[0].delta = 0; }, TypeError);
});

check("占比使用全部分层合计并保留证据；有效零值、负值及无效分母明确区分", () => {
  assert.equal(denominator, 20531.26);
  assert(Math.abs(denominator - showcase.overall.delta - 27.65) < 1e-8);
  assert(Math.abs(showcase.rows.reduce((sum, row) => sum + contribution(row.delta), 0) - 100) < 1e-10);
  assert.equal(contribution(0), 0);
  assert(contribution(-50) < 0);
  for (const total of [0, -1, null, undefined, NaN, Infinity, "10"]) {
    // undefined intentionally selects the function's documented default denominator.
    if (total !== undefined) assert.equal(contribution(1, total), null);
  }
  for (const missing of [null, undefined, NaN, Infinity, "0"]) assert.equal(contribution(missing), null);
  const evidence = shareEvidence(showcase.rows[0]);
  assert.equal(evidence.denominatorRows.length, 9);
  assert.equal(evidence.denominator, denominator);
  assert.equal(evidence.source.dimension, "电商人群八分层");
  assert.equal(evidence.significance, null);
  assert.deepEqual(topContributors, ["young-low-female", "young-low-male"]);
  assert(barGeometry(-10, barDomain([-10, 30])).left === 0);
  assert.equal(barGeometry(-10, barDomain([-10, 30])).zero, 25);
  assert.equal(barGeometry(0, barDomain([0])).width, 0);
  assert.equal(barGeometry(null, barDomain([0])), null);
});

check("独立报告描述和列表一致，结构顺序正确，图表位于明细后", () => {
  const descriptor = showcaseDescriptor(), html = htmlFor({});
  assert.equal(descriptor.id, showcaseListRow().rid);
  assert.equal(descriptor.kind, "单实验报告");
  let previous = html.indexOf("</header>");
  for (const section of descriptor.sections) {
    const position = html.indexOf(`id="sec-${section.id}"`);
    assert(position > previous); previous = position;
  }
  const segment = html.slice(html.indexOf('id="sec-sv-segments"'));
  assert(segment.indexOf("<table") < segment.indexOf('<figure class="sv-chart"'));
  assert(segment.includes("缺少标签") && segment.includes("占比口径与数据来源"));
  assert(!/NaN|Infinity|undefined/.test(html));
  assert.deepEqual(rowIds(html), chartIds(html));
});

check("筛选、排序、转置、指标切换共用稳定人群身份，分母及图表尺度不变", () => {
  const view = { showcase: normalizeReading() };
  const defaultHTML = htmlFor(view);
  assert.deepEqual(rowIds(defaultHTML).slice(0, 2), topContributors);
  event(view, { svControl: "sort" }, { value: "asc" });
  assert.equal(visibleRows(view.showcase)[0].id, "untagged");
  event(view, { svControl: "sort" }, { value: "source" });
  assert.deepEqual(rowIds(htmlFor(view)), showcase.rows.map(row => row.id));
  event(view, { svAction: "transpose" });
  event(view, { svControl: "population", svId: "young-low-female" }, { checked: false });
  let html = htmlFor(view);
  assert(html.includes("sv-transposed"));
  assert.deepEqual(rowIds(html), chartIds(html));
  assert.equal(rowIds(html).length, 8);
  assert(html.includes('data-sv-denominator="20531.26"'));
  const bar = (html, id) => html.match(new RegExp(`data-sv-action="chart-row" data-sv-id="${id}"[\\s\\S]*?class="sv-bar" style="([^"]+)"`))[1];
  assert.equal(bar(html, "young-low-male"), bar(defaultHTML, "young-low-male"));
  event(view, { svAction: "metric", svMetric: "delta" });
  html = htmlFor(view);
  assert(html.includes('data-sv-metric="delta" aria-pressed="true"'));
  assert.deepEqual(rowIds(html), chartIds(html));
  assert.equal(view.showcase.sort, "source");
});

check("图表和表格互相定位；AI 引用可恢复空态下隐藏的人群且保留转置与排序", () => {
  const view = { showcase: normalizeReading({ transposed: true, sort: "asc", visible: [] }) };
  assert(htmlFor(view).includes("尚未选择人群"));
  assert(!htmlFor(view).includes('<figure class="sv-chart"'));
  const question = showcaseAnswer("哪些人群贡献最高？", "all");
  const scopes = [...question.md.matchAll(/\[\[cite:([\w-]+)::/g)].map(match => match[1]);
  assert.equal(scopes.length, 2);
  for (const scope of scopes) {
    const change = showcaseBeforeGoto(scope, view);
    assert.equal(change.moduleId, "sv-segments");
    assert.equal(change.scope, "sv-segments");
    assert(change.focus.includes(view.showcase.selected));
  }
  assert.equal(view.showcase.visible.length, 2);
  assert.equal(view.showcase.transposed, true);
  assert.equal(view.showcase.sort, "asc");
  const toChart = event(view, { svAction: "table-row", svId: "young-low-male" });
  assert(toChart.focus.includes('data-sv-action="chart-row"'));
  const toTable = event(view, { svAction: "chart-row", svId: "young-low-male" });
  assert(toTable.focus.includes('data-sv-action="table-row"'));
  assert.equal(showcaseBeforeGoto("sv-evidence-unknown", view), false);
  assert.equal(showcaseBeforeGoto("sv-overall", view), false);
});

check("恢复全部和默认可用，持久化仅保存阅读偏好，损坏存储可恢复", () => {
  const view = { showcase: normalizeReading() };
  event(view, { svAction: "none" });
  assert.equal(readingState({}).visible.length, 0);
  event(view, { svAction: "all" });
  assert.equal(view.showcase.visible.length, 9);
  event(view, { svControl: "bars" }, { checked: false });
  assert.equal(readingState({}).dataBars, false);
  assert(!htmlFor(view).includes('class="sv-data-bar"'));
  assert(![...storage.values()][0].includes("denominator"));
  assert(![...storage.values()][0].includes("selected"));
  event(view, { svAction: "reset" });
  assert.deepEqual(readingState({}), normalizeReading());
  storage.set([...storage.keys()][0], "{invalid");
  assert.deepEqual(readingState({}), normalizeReading());
  assert.deepEqual(normalizeReading({ metric: "bad", visible: ["unknown", "untagged", "untagged"] }).visible, ["untagged"]);
});

check("阅读操作不改写核心结论、源数据或整体值，显著性解释不越界", () => {
  const view = { showcase: normalizeReading() }, report = showcaseDescriptor();
  const summary = JSON.stringify(report.summary);
  event(view, { svAction: "transpose" }); event(view, { svAction: "none" });
  renderShowcaseReport(report, view);
  assert.equal(JSON.stringify(report.summary), summary);
  assert.equal(JSON.stringify(showcase), original);
  assert(showcaseAnswer("贡献高代表显著吗？", "sv-segments").md.includes("不能沿用"));
  assert(showcaseAnswer("分层合计为什么与整体不同？", "all").md.includes("不足以解释差额"));
});
console.log(`\n${checks} showcase semantic checks passed.`);
