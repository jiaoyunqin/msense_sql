import { renderReportSummary } from "./report-summary.js";
import { directoryHeading, directoryOrdinal } from "./report-directory-data.js";
import {
  showcase, denominator, finite, contribution, shareEvidence, topContributors, topShare, youngShare,
  barDomain, barGeometry, normalizeReading, readingState, saveReading, visibleRows
} from "./report-showcase-data.js";
import { dataBarAttributes } from "./report-table-formatting.js";

const SUMMARY = "sv-summary", OVERALL = "sv-overall", SEGMENTS = "sv-segments";
const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (value, digits = 2) => finite(value) ? value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const percent = value => finite(value) ? `${number(value)}%` : "—";
const signed = value => finite(value) ? `${value > 0 ? "+" : ""}${number(value)}%` : "—";
const paths = {
  chart: '<path d="M4 20h16M7 16V9m5 7V4m5 12v-5"/>',
  arrow: '<path d="m9 5 7 7-7 7M4 12h12"/>',
  sort: '<path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4"/>',
  transpose: '<path d="M4 7h14l-3-3m3 3-3 3M20 17H6l3 3m-3-3 3-3"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  filter: '<path d="M4 7h16M7 12h10m-7 5h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>'
};
const icon = name => `<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.chart}</svg>`;
const action = (name, label, attrs = "", cls = "") => `<button type="button" class="sv-button ${cls}" data-sv-action="${name}" ${attrs}>${label}</button>`;
const ask = scope => `<button type="button" class="ask-btn mm-ai" data-ask="${scope}" aria-label="向 AI 追问本节结论">AI</button>`;
const evidenceLink = (id, label) => action("evidence", `${label}${icon("arrow")}`, `data-sv-id="${id}"`, "sv-evidence");
const emphasis = (value, tone, evidence) => `<strong class="sv-highlight sv-highlight-${tone}" data-sv-evidence="${evidence}"><span class="sv-number">${value}</span></strong>`;

export function showcaseDescriptor() {
  return {
    id: showcase.id, createdBy: "sheriqin.01", custom: true, moduleReport: true, showcaseReport: true,
    kind: "单实验报告", title: "老客复购实验 · 增量来源分析", createdAt: "2026-11-23T09:00:00+08:00",
    meta: [["实验", showcase.experiment], ["Libra ID", showcase.experimentId], ["实验周期", showcase.period], ["观察窗口", showcase.window]],
    summary: {
      id: SUMMARY, title: "实验核心结论",
      blocks: [
        { text: "支付天数提升，增量主要来自年轻低消费力人群；GMV 回报仍需关注。" },
        { text: `实验组支付天（DAC）**提升 14.51%，正向显著**，实验整体增量累计 DAC 为 **20,503.61**。年轻低消费力女性和男性的增量合计占全部分层的 **${percent(topShare)}**，是本次增量的主要来源。`,
          runs: [{ text: "实验组支付天（DAC）提升 " }, { value: "14.51%", tone: "positive", evidence: "overall.dacSignificance" },
            { text: "，正向显著。实验整体增量累计 DAC 为 " }, { value: "20,503.61" },
            { text: "。年轻低消费力女性和男性的增量合计占全部分层的 " }, { value: percent(topShare), tone: "neutral", evidence: "segments.topShare" },
            { text: "，是本次增量的主要来源。" }] },
        { text: "GMV-ROI 为 **1.17**，低于原报告采用的 1.8 达标线；人均支付 GMV 增幅 +0.91%，不显著。人群贡献占比描述增量构成，不代表该人群的 ROI 或统计显著性。",
          runs: [{ text: "GMV-ROI 为 " }, { value: "1.17", tone: "negative", evidence: "overall.roiThreshold" },
            { text: "，未达标" }, { text: "（原报告达标线 ", value: "1.8", suffix: "）", note: true },
            { text: "；人均支付 GMV 增幅 " }, { value: "+0.91%" }, { text: "，不显著。人群贡献占比描述增量构成，不代表该人群的 ROI 或统计显著性。" }] }
      ]
    },
    sections: [
      { id: SUMMARY, title: "实验核心结论", no: "01" },
      { id: OVERALL, title: "整体效果", no: "02" },
      { id: SEGMENTS, title: "电商人群贡献", no: "03" }
    ]
  };
}
export function showcaseListRow() {
  return { rid: showcase.id, title: "老客复购实验 · 数据可视化 Showcase", exp: showcase.experiment,
    type: "单实验报告", status: "completed", libra: showcase.experimentId, qx: "27730", owner: "秦娇芸",
    created: "2026-11-23 09:00", generated: "2026-11-23 09:00", createdAt: "2026-11-23T09:00:00+08:00" };
}

function sectionHead(number, title, subtitle) {
  return `<div class="sv-section-heading"><span class="sv-section-number">${number}</span><div><h2 class="sec-h2">${title}</h2><p class="sv-muted">${subtitle}</p></div></div>`;
}
function conclusion(scope, body) {
  return `<div class="ccard sv-conclusion"><div class="ccard-h"><h3 class="t">${icon("chart")}分析结论</h3><span class="grow"></span>${ask(scope)}</div>${body}</div>`;
}
const columns = [
  { id: "delta", label: "增量累计 DAC", digits: 2, sortable: true },
  { id: "share", label: "分层增量占比", sortable: true },
  { id: "dac", label: "支付天（DAC）", digits: 2, lift: "dacLift", significance: "dacSignificance" },
  { id: "daily", label: "增量日均 DAC", digits: 4 },
  { id: "cost", label: "单增量 DAC 用增成本（结算）", digits: 4, currency: true },
  { id: "redemptionCost", label: "单增量 DAC 核销成本", digits: 4, currency: true },
  { id: "roi", label: "GMV-ROI", digits: 2 },
  { id: "gmv", label: "人均支付 GMV", digits: 4, currency: true, lift: "gmvLift", significance: "gmvSignificance" },
  { id: "gmvDelta", label: "增量支付 GMV", digits: 0, currency: true }
];
function metricCell(row, column) {
  if (column.id === "share") {
    const evidence = shareEvidence(row), domain = barDomain(showcase.rows.map(item => contribution(item.delta)));
    return `<div class="sv-share-value" title="${esc(evidence.formula)}；${number(evidence.numerator)} ÷ ${number(evidence.denominator)}" data-sv-numerator="${row.delta}" data-sv-denominator="${denominator}">
      <span${dataBarAttributes(evidence.value, domain)}>${percent(evidence.value)}</span></div>`;
  }
  const value = row[column.id];
  const formatted = column.id === "gmvDelta" ? row.gmvDeltaDisplay : `${column.currency && finite(value) ? "￥" : ""}${number(value, column.digits)}`;
  return `<span class="sv-numeric">${esc(formatted)}</span>${column.lift ? `<small class="sv-cell-detail">增幅 ${signed(row[column.lift])}</small><small class="sv-significance ${row[column.significance] === "正向显著" ? "sv-positive" : ""}">${esc(row[column.significance] || "显著性未提供")}</small>` : ""}`;
}
function overallHTML(title = "整体效果", order = "02") {
  const data = showcase.overall, overallColumns = columns.filter(column => column.id !== "share");
  return `<section class="sec sv-section" id="sec-${OVERALL}" data-sec="${OVERALL}" data-mm-section="${OVERALL}">
    ${sectionHead(order, esc(title), "先看实验整体收益，再拆解人群增量来源。")}
    ${conclusion(OVERALL, `<p>支付天（DAC）提升 ${emphasis(signed(data.dacLift), "positive", "overall.dacSignificance")}，正向显著；单增量 DAC 用增成本（结算）为 <span class="sv-number">￥${number(data.cost)}</span>。</p><p>GMV-ROI 为 ${emphasis(number(data.roi), "negative", "overall.roiThreshold")}，未达原报告标准 <em class="sv-parenthetical">（达标线 <span class="sv-number">${data.roiThreshold}</span>）</em>；人均支付 GMV 的变化不显著。</p>`)}
    <div class="sv-kpis" aria-label="整体关键指标">
      <div><span>增量累计 DAC</span><strong>${number(data.delta)}</strong><small>实验整体口径</small></div>
      <div><span>支付天（DAC）增幅</span><strong class="sv-positive">${signed(data.dacLift)}</strong><small>正向显著</small></div>
      <div><span>GMV-ROI</span><strong class="sv-negative">${number(data.roi)}</strong><small>未达标 · 原报告达标线 ${data.roiThreshold}</small></div>
    </div>
    <div class="sv-data-heading"><h3>数据明细</h3><span class="sv-muted">实验组与对照组</span></div>
    <div class="tbl-wrap mx-scroll sv-table-wrap" tabindex="0" aria-label="整体指标明细，可横向滚动">
      <table class="dt sv-table"><caption class="sv-sr-only">实验整体指标，缺失数值用破折号表示</caption><thead><tr><th scope="col" class="lead">实验分组</th>${overallColumns.map(column => `<th scope="col">${column.label}</th>`).join("")}</tr></thead>
      <tbody><tr><th scope="row" class="lead">对照组</th>${overallColumns.map(column => `<td>${column.id === "dac" ? number(data.controlDac) : "—"}</td>`).join("")}</tr>
      <tr><th scope="row" class="lead">${showcase.group}</th>${overallColumns.map(column => `<td>${metricCell(data, column, {})}</td>`).join("")}</tr></tbody></table>
    </div>
  </section>`;
}
function sortingHeader(column, state) {
  if (!column.sortable) return column.label;
  return action("sort-column", `${column.label}${icon("sort")}`, `data-sv-metric="${column.id}" aria-label="按${column.label}排序"`, state.metric === column.id && state.sort !== "source" ? "sv-active" : "");
}
function tableHTML(rows, state) {
  const identity = row => `<button type="button" class="sv-row-link" data-sv-action="table-row" data-sv-id="${row.id}" aria-pressed="${state.selected === row.id}" aria-label="${row.label}，定位贡献图">${row.label}${icon("arrow")}</button>`;
  const selected = row => `${state.selected === row.id ? " sv-selected" : ""}${topContributors.includes(row.id) ? " sv-top" : ""}`;
  const rowAttrs = row => `class="${selected(row)}" data-bid="${row.id}"`;
  const sortAttr = column => column.sortable && state.metric === column.id && state.sort !== "source" ? ` aria-sort="${state.sort === "asc" ? "ascending" : "descending"}"` : "";
  return `<div class="tbl-wrap mx-scroll sv-table-wrap" tabindex="0" aria-label="人群分层明细，可横向滚动">
    <table class="dt sv-table ${state.transposed ? "sv-transposed" : ""}"><caption class="sv-sr-only">电商人群八分层，含缺少标签；分层增量占比的分母固定为 ${number(denominator)}</caption>
    ${state.transposed
      ? `<thead><tr><th scope="col" class="lead">指标 / 人群</th>${rows.map(row => `<th scope="col" ${rowAttrs(row)}>${identity(row)}</th>`).join("")}</tr></thead><tbody>${columns.map(column => `<tr><th scope="row" class="lead"${sortAttr(column)}>${sortingHeader(column, state)}</th>${rows.map(row => `<td class="${selected(row)}">${metricCell(row, column, state)}</td>`).join("")}</tr>`).join("")}</tbody>`
      : `<thead><tr><th scope="col" class="lead">电商人群八分层</th>${columns.map(column => `<th scope="col"${sortAttr(column)}>${sortingHeader(column, state)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row => `<tr ${rowAttrs(row)}><th scope="row" class="lead">${identity(row)}</th>${columns.map(column => `<td>${metricCell(row, column, state)}</td>`).join("")}</tr>`).join("")}</tbody>`}
    </table></div>`;
}
function chartHTML(rows, state) {
  const isShare = state.metric === "share";
  const value = row => isShare ? contribution(row.delta) : row.delta;
  const domain = barDomain(showcase.rows.map(value));
  // Round the axis upward once for the complete snapshot; all filtered views reuse it.
  domain.max = isShare ? Math.ceil(domain.max / 10) * 10 : Math.ceil(domain.max / 2000) * 2000;
  const tick = number => isShare ? `${number.toFixed(0)}%` : number.toLocaleString("zh-CN");
  return `<figure class="sv-chart" aria-labelledby="sv-chart-title" aria-describedby="sv-chart-note">
    <div class="sv-chart-head"><div><h3 id="sv-chart-title">人群增量贡献</h3><p id="sv-chart-note">深蓝强调增量最高的两个人群；点击人群可定位明细。</p></div>
      <div class="sv-segmented" role="group" aria-label="图表指标">${[["share", "分层增量占比"], ["delta", "增量累计 DAC"]].map(([id, label]) => action("metric", label, `data-sv-metric="${id}" aria-pressed="${state.metric === id}"`)).join("")}</div></div>
    <div class="sv-chart-body"><div class="sv-chart-axis" aria-hidden="true"><span>人群</span><div>${[0, 1, 2, 3, 4].map(index => `<span>${tick(domain.min + (domain.max - domain.min) * index / 4)}</span>`).join("")}</div><span>${isShare ? "占比" : "DAC"}</span></div>
    ${rows.map(row => {
      const geometry = barGeometry(value(row), domain), isTop = topContributors.includes(row.id);
      return `<div class="sv-chart-row${isTop ? " sv-top" : ""}${state.selected === row.id ? " sv-selected" : ""}">
        <button type="button" class="sv-chart-button" data-sv-action="chart-row" data-sv-id="${row.id}" aria-pressed="${state.selected === row.id}" aria-describedby="sv-tip-${row.id}" aria-label="${row.label}，${isShare ? "分层增量占比" : "增量累计 DAC"} ${isShare ? percent(value(row)) : number(value(row))}，定位明细">
          <span class="sv-chart-label">${row.label}</span><span class="sv-chart-track" aria-hidden="true"><i class="sv-zero" style="left:${geometry?.zero || 0}%"></i>${geometry ? `<i class="sv-bar" style="left:${geometry.left}%;width:${geometry.width}%"></i>` : ""}</span><strong>${isShare ? percent(value(row)) : number(value(row))}</strong>
        </button>
        <div class="sv-tooltip" id="sv-tip-${row.id}" role="tooltip"><strong>${row.label}</strong><dl><div><dt>增量累计 DAC</dt><dd>${number(row.delta)}</dd></div><div><dt>分层增量占比</dt><dd>${percent(contribution(row.delta))}</dd></div><div><dt>全部分层合计</dt><dd>${number(denominator)}</dd></div></dl><p>占比 = 该人群增量 ÷ 全部分层合计<br>增量 / 占比显著性：源数据未提供</p></div>
      </div>`;
    }).join("")}</div>
    <figcaption>占全部分层增量合计 · 分母 ${number(denominator)} · 显示范围不改变分母与坐标尺度</figcaption>
  </figure>`;
}
function methodology() {
  const difference = Math.round((denominator - showcase.overall.delta) * 100) / 100;
  return `<details class="sv-methodology" id="sv-methodology"><summary>占比口径与数据来源${icon("down")}</summary>
    <div><p><strong>分层增量占比</strong> = 该人群增量累计 DAC ÷ 全部九行分层增量合计 × 100%。分母包含八个人群与“缺少标签”，筛选只影响显示范围。</p>
      <dl><div><dt>全部分层增量合计</dt><dd>${number(denominator)}</dd></div><div><dt>实验整体增量</dt><dd>${number(showcase.overall.delta)}</dd></div><div><dt>分层合计 − 整体</dt><dd>+${number(difference)}</dd></div></dl>
      <p>两种口径尚未完全对齐，以上差额无法仅由两位小数的四舍五入解释。因此占比仅描述这份分层数据内部的构成，不能视为占实验整体增量的比例。</p>
      <p>数值来自 2026-11-08 保存的报告快照；原报告按“万”展示的 GMV 保持其显示精度。支付天（DAC）与人均支付 GMV 的显著性仅用于各自指标；源数据未单独提供增量累计 DAC 或占比的检验结果。</p>
      <a href="#/report/r-single-reference">查看完整来源报告${icon("arrow")}</a></div></details>`;
}
function segmentsHTML(state, title = "电商人群贡献", order = "03") {
  const rows = visibleRows(state), selected = rows.find(row => row.id === state.selected);
  return `<section class="sec sv-section" id="sec-${SEGMENTS}" data-sec="${SEGMENTS}" data-mm-section="${SEGMENTS}">
    ${sectionHead(order, esc(title), "核心指标表现 · 电商人群八分层")}
    ${conclusion(SEGMENTS, `<p><strong>年轻低消费力人群是主要增量来源，合计贡献 ${emphasis(percent(topShare), "neutral", "segments.topShare")}。</strong></p><p>${evidenceLink("young-low-female", "年轻低消费力女性")}与${evidenceLink("young-low-male", "年轻低消费力男性")}分别贡献 <span class="sv-number">${percent(contribution(showcase.rows[1].delta))}</span> 和 <span class="sv-number">${percent(contribution(showcase.rows[0].delta))}</span>；四个年轻人群合计占比为 <span class="sv-number">${percent(youngShare)}</span>。</p><p class="sv-muted"><em class="sv-parenthetical">（以上占比均以全部分层增量合计为分母）</em>贡献集中反映增量来源，不据此判断人群的经营收益。</p>`)}
    <div class="data tblock sv-data" id="tb-${SEGMENTS}">
      <div class="sv-data-heading"><h3>数据明细</h3><span class="sv-group-label">${showcase.group}</span><span class="grow"></span>${action("reset", `${icon("reset")}恢复默认`, "", "sv-reset")}<button type="button" class="sv-button" data-fs="${SEGMENTS}" aria-label="切换数据明细与贡献图全屏">${icon("expand")}<span class="sv-enter-fs">全屏</span><span class="sv-leave-fs">退出全屏</span></button></div>
      <div class="sv-controls">
        <label class="sv-sort">排序<select data-sv-control="sort" aria-label="表格与图表排序"><option value="desc" ${state.sort === "desc" ? "selected" : ""}>贡献从高到低</option><option value="asc" ${state.sort === "asc" ? "selected" : ""}>贡献从低到高</option><option value="source" ${state.sort === "source" ? "selected" : ""}>原始顺序</option></select></label>
        ${action("transpose", `${icon("transpose")}转置`, `aria-pressed="${state.transposed}"`)}
        <span class="grow"></span><span class="sv-count" aria-live="polite">${rows.length} / ${showcase.rows.length} 个人群</span>
      </div>
      <div class="sv-analysis-scroll mx-scroll">
        <details class="sv-visibility"><summary>${icon("filter")}显示范围<span>${state.visible.length === showcase.rows.length ? "全部人群" : `已选 ${rows.length} 项`}</span>${icon("down")}</summary><div class="sv-filter-content">
          <div class="sv-filter-actions"><span>选择需要比较的人群</span>${action("all", "全选")}${action("none", "清空")}</div>
          <div class="sv-filter-grid">${showcase.rows.map(row => `<label class="sv-check"><input type="checkbox" data-sv-control="population" data-sv-id="${row.id}" ${state.visible.includes(row.id) ? "checked" : ""}>${row.label}</label>`).join("")}</div>
        </div></details>
        <div class="sv-reading-note"><span>占比以全部分层增量合计 <strong>${number(denominator)}</strong> 为分母</span><span>明细与图表共用排序、显示范围</span></div>
        ${rows.length ? tableHTML(rows, state) : `<div class="sv-empty" role="status">${icon("filter")}<h4>尚未选择人群</h4><p>选择人群后查看明细与贡献图。</p>${action("all", "恢复全部人群", "", "sv-primary")}</div>`}
        <div class="sv-selection-status" role="status">${selected ? `已定位：${selected.label} · 增量 ${number(selected.delta)} · 分层占比 ${percent(contribution(selected.delta))}` : "点击表格中的人群名称或图表条形，可定位对应证据。"}</div>
        ${rows.length ? chartHTML(rows, state) : ""}
        ${methodology()}
      </div>
    </div>
  </section>`;
}
export function renderShowcaseReport(report, view) {
  const state = readingState(view);
  return `<div class="sv-report"><header class="rhead sv-header"><p class="eyebrow">实验分析报告 <span>数据可视化样例</span></p><h1>${esc(report.title)}</h1><dl class="meta">${report.meta.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl></header>
    ${renderReportSummary(report.summary)}${(report.directory?.entries || report.sections.filter(section => section.id !== SUMMARY)).map((entry, index) =>
      `${directoryHeading(report, entry.id, esc)}${entry.id === OVERALL ? overallHTML(entry.title, directoryOrdinal(report, entry.id) || String(index + 2).padStart(2, "0")) : entry.id === SEGMENTS ? segmentsHTML(state, entry.title, directoryOrdinal(report, entry.id) || String(index + 2).padStart(2, "0")) : ""}`
    ).join("")}</div>`;
}
function revealEvidence(view, id, target = "table-row") {
  if (!showcase.rows.some(row => row.id === id)) return false;
  const state = readingState(view);
  if (!state.visible.includes(id)) state.visible.push(id);
  state.selected = id;
  saveReading(state);
  return { moduleId: SEGMENTS, scope: SEGMENTS, focus: `[data-sv-action="${target}"][data-sv-id="${id}"]`, scroll: true };
}
export function showcaseBeforeGoto(scope, view) {
  return scope?.startsWith("sv-evidence-") ? revealEvidence(view, scope.slice("sv-evidence-".length)) : false;
}
export function showcaseEvent(event, view) {
  const target = event.target.closest("[data-sv-action],[data-sv-control]");
  if (!target) return false;
  const { svAction: actionName, svControl: control, svId: id, svMetric: metric } = target.dataset;
  if (control ? event.type !== "change" : event.type !== "click") return false;
  const state = readingState(view);
  if (["evidence", "chart-row", "table-row"].includes(actionName)) return revealEvidence(view, id, actionName === "table-row" ? "chart-row" : "table-row");
  let focus = control ? `[data-sv-control="${control}"]${id ? `[data-sv-id="${id}"]` : ""}`
    : `[data-sv-action="${actionName}"]${metric ? `[data-sv-metric="${metric}"]` : ""}`;
  if (control === "sort" && ["desc", "asc", "source"].includes(target.value)) state.sort = target.value;
  else if (control === "population" && showcase.rows.some(row => row.id === id)) {
    state.visible = showcase.rows.filter(row => row.id === id ? target.checked : state.visible.includes(row.id)).map(row => row.id);
    if (!state.visible.includes(state.selected)) state.selected = null;
  } else if (actionName === "transpose") state.transposed = !state.transposed;
  else if (actionName === "metric" && ["share", "delta"].includes(metric)) state.metric = metric;
  else if (actionName === "sort-column" && ["share", "delta"].includes(metric)) {
    state.sort = state.metric === metric && state.sort === "desc" ? "asc" : "desc"; state.metric = metric;
  } else if (actionName === "all") {
    state.visible = showcase.rows.map(row => row.id);
    // The empty-state recovery button disappears after selection; focus the stable summary.
    focus = ".sv-visibility > summary";
  } else if (actionName === "none") { state.visible = []; state.selected = null; }
  else if (actionName === "reset") Object.assign(state, normalizeReading());
  else return false;
  saveReading(state);
  return { moduleId: SEGMENTS, focus };
}
export function showcaseSuggestions(scope) {
  return scope === OVERALL
    ? ["整体效果如何？", "GMV-ROI 达到原报告标准了吗？", "分层合计为什么与整体不同？"]
    : ["哪些人群贡献最高？", "分层增量占比如何计算？", "贡献高代表显著吗？"];
}
export function showcaseAnswer(question, scope) {
  const citation = id => `[[cite:sv-evidence-${id}::查看${showcase.rows.find(row => row.id === id).label}明细]]`;
  let body;
  if (/分母|计算|口径|合计|不同|差异/.test(question)) {
    body = `分层增量占比 = 该人群增量累计 DAC ÷ 全部九行分层增量合计（${number(denominator)}）× 100%。筛选人群不会改变分母。\n\n实验整体增量为 ${number(showcase.overall.delta)}，与分层合计相差 27.65，当前快照不足以解释差额。这份样例仅比较分层内部构成，不能直接当作占实验整体增量的比例。\n\n${citation("young-low-female")}`;
  } else if (/显著/.test(question)) {
    body = `高贡献表示该人群占分层增量的比例较大。源表仅提供支付天（DAC）与人均支付 GMV 的显著性；增量累计 DAC 和分层增量占比没有独立的检验结果，不能沿用相邻指标的“正向显著”。\n\n${citation("young-low-female")}`;
  } else if (scope === OVERALL || /整体|ROI|达标|回报/.test(question)) {
    body = "实验整体增量累计 DAC 为 20,503.61，支付天（DAC）增幅 +14.51%，正向显著。GMV-ROI 为 1.17，低于原报告 1.8 达标线；人均支付 GMV 增幅 +0.91%，不显著。\n\n[[cite:sv-overall::查看整体指标]]";
  } else {
    body = `年轻低消费力女性增量 ${number(showcase.rows[1].delta)}，分层占比 ${percent(contribution(showcase.rows[1].delta))}；年轻低消费力男性增量 ${number(showcase.rows[0].delta)}，分层占比 ${percent(contribution(showcase.rows[0].delta))}。两者合计占 ${percent(topShare)}。\n\n${citation("young-low-female")} ${citation("young-low-male")}\n\n以上比较描述增量来源，不能据此推断 ROI 或统计显著性。`;
  }
  return { steps: ["读取样例固定数据与占比口径"], md: `本地样例解读 · 仅依据已保存的报告数据。\n\n${body}`, follow: showcaseSuggestions(scope) };
}
