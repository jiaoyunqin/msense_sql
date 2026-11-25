const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// Reviewed claims, scoped to their source module. A positive number is not
// automatically a benefit: costs, statistical uncertainty and metric meaning
// determine tone. "key" marks important descriptive evidence without a verdict.
// Optional context disambiguates a value repeated in different claims.
export const conclusionAnnotations = {
  "cf-summary": [
    ["10.42%、13.18%、12.85%", "positive", "report-module-10"],
    ["4,757、6,022、5,871", "key", "report-module-10"],
    ["4.3763元", "key", "report-module-10"],
    ["4.4071元、4.3932元", "negative", "report-module-10"],
    ["0.70%、0.39%", "negative", "report-module-10"],
    ["4.32、4.23、6.68", "key", "report-module-10"],
    ["1.77%", "positive", "report-module-10"],
    ["143.11万元", "positive", "report-module-10"],
    ["35.71%–39.76%", "key", "report-module-11"],
    ["3.60–3.69元", "key", "report-module-11"],
    ["37.52%", "key", "report-module-11"],
    ["44.94%–46.36%", "key", "report-module-12"],
    ["48.63%", "key", "report-module-12"],
    ["21.64%–24.57%", "key", "report-module-13"],
    ["22.70%–36.73%", "key", "report-module-13"],
    ["84.83%–87.94%", "key", "report-module-14"],
    ["2.72元", "key", "report-module-14"],
    ["38.62%、37.08%", "key", "report-module-14"],
    ["54.92%、80.42%、80.64%", "key", "report-module-16"],
    ["5.39%、5.09%、4.93%", "negative", "report-module-16"],
    ["38.16%、34.23%", "key", "report-module-16"],
    ["7.25%", "key", "report-module-17"],
    ["6.97%、6.76%", "negative", "report-module-17"],
    ["0.59–0.78", "key", "report-module-18"],
    ["326万–329万元", "key", "report-module-18"],
    ["0.45–0.69", "key", "report-module-19"],
    ["20–22", "key", "report-module-19"],
    ["2.48万", "key", "report-module-20"],
    ["3.24万、3.16万", "key", "report-module-20"],
    ["5.09、4.68、4.70小时", "key", "report-module-28"],
    ["12.01%、10.12%、10.21%", "key", "report-module-30"],
    ["1.59%、2.57%、2.31%", "positive", "report-module-26"],
    ["1,927、3,120、2,805人", "key", "report-module-26"],
    ["4,452、4,416、4,597", "positive", "report-module-26"],
    ["56%–58%", "key", "report-module-27"],
    ["39%–44%", "key", "report-module-27"],
    ["0.39%–0.70%", "key", "report-module-10"]
  ],
  "cf-report-module-10": [
    ["+10.42%、+13.18%、+12.85%", "positive", "report-module-10"],
    ["2.38万、3.01万、2.94万", "key", "report-module-10"],
    ["4.38、4.41、4.39元", "key", "report-module-10"],
    ["基线模型成本最低", "key", "report-module-10"],
    ["4.32、4.23、6.68", "key", "report-module-10"]
  ],
  "cf-report-module-11": [
    ["0.95万、1.11万、1.05万", "key", "report-module-11"],
    ["39.8%、36.8%、35.7%", "key", "report-module-11"],
    ["40.4%", "key", "report-module-11"],
    ["45.3%", "key", "report-module-11"],
    ["37.5%", "key", "report-module-11"]
  ],
  "cf-report-module-12": [
    ["45.4%、46.4%、44.9%", "key", "report-module-12"],
    ["21.7%、19.5%", "key", "report-module-12"],
    ["21.5%、19.6%", "key", "report-module-12"],
    ["48.6%、20.9%", "key", "report-module-12"]
  ],
  "cf-report-module-13": [
    ["21.6%、11.5%", "key", "report-module-13"],
    ["24.3%、10.6%", "key", "report-module-13"],
    ["24.6%、10.4%", "key", "report-module-13"],
    ["36.7%、15.9%", "key", "report-module-13"],
    ["29.6%、14.5%", "key", "report-module-13"],
    ["22.7%、8.9%", "key", "report-module-13"]
  ],
  "cf-report-module-14": [
    ["2.09万、2.55万、2.51万", "key", "report-module-14"],
    ["87.9%、84.8%、85.5%", "key", "report-module-14"],
    ["35.1%", "key", "report-module-14"],
    ["39.3%", "key", "report-module-14"],
    ["38.6%", "key", "report-module-14"],
    ["37.1%", "key", "report-module-14"]
  ],
  "cf-report-module-16": [
    ["80.42%、80.64%", "key", "report-module-16"],
    ["54.92%", "key", "report-module-16"],
    ["4.09%、3.98%", "key", "report-module-16"],
    ["8.07、9.55、9.85", "key", "report-module-16"],
    ["14.64%", "negative", "report-module-16"]
  ],
  "cf-report-module-17": [
    ["25.8%–28.2%", "key", "report-module-17"],
    ["31.1%–34.9%", "key", "report-module-17"],
    ["24.4%、24.8%", "key", "report-module-17"],
    ["5.49%–5.72%", "key", "report-module-17"],
    ["12.89、15.27", "key", "report-module-17"],
    ["15.75", "key", "report-module-17"]
  ],
  "cf-report-module-18": [
    ["34.9%–36.3%、32.9%–34.2%", "key", "report-module-18"],
    ["56.5%、65.9%、66.1%", "key", "report-module-18"]
  ],
  "cf-report-module-19": [
    ["15.1%–16.1%", "key", "report-module-19"],
    ["12.2%–12.4%", "key", "report-module-19"],
    ["0.7%–0.9%", "key", "report-module-19"],
    ["13.3%、12.5%、10.5%", "key", "report-module-19"],
    ["8.0%→8.8%/9.7%", "key", "report-module-19"]
  ],
  "cf-report-module-20": [
    ["65.4%–69.3%、59.5%–63.9%、42.5%–47.4%", "key", "report-module-20"],
    ["20.9%–23.3%、13.6%–16.4%", "key", "report-module-20"],
    ["47.4%", "key", "report-module-20", "最高，为47.4%"]
  ],
  "cf-report-module-28": [
    ["4.68、4.70小时", "key", "report-module-28"],
    ["5.09小时", "key", "report-module-28"],
    ["0.41小时", "key", "report-module-28"],
    ["0.40小时", "key", "report-module-28"]
  ],
  "cf-report-module-30": [
    ["93.52%～94.58%", "key", "report-module-30"],
    ["12.01%", "key", "report-module-30"],
    ["10.12%、10.21%", "key", "report-module-30"]
  ],
  "cf-report-module-29": [
    ["86%～89%", "key", "report-module-29"],
    ["10.83%、10.77%", "key", "report-module-29"],
    ["13.44%", "key", "report-module-29"]
  ],
  "cf-report-module-26": [
    ["1.59%、2.57%、2.31%", "positive", "report-module-26"],
    ["+1,926.98、+3,120.36、+2,805.34人", "positive", "report-module-26"],
    ["0.31%", "positive", "report-module-26"],
    ["0.17%、0.23%", "key", "report-module-26"],
    ["1.04%、1.04%、1.08%", "positive", "report-module-26"],
    ["−4,452.34、−4,415.70、−4,597.43人", "positive", "report-module-26"],
    ["1.53%–1.57%", "key", "report-module-26"]
  ],
  "cf-report-module-27": [
    ["2.08%", "positive", "report-module-27"],
    ["1,246.67人", "key", "report-module-27", "对应跃迁增量 1,246.67人"],
    ["0.61%", "positive", "report-module-27"],
    ["−3,338.85人", "positive", "report-module-27", "降级增量 −3,338.85人"],
    ["2.95%", "positive", "report-module-27"],
    ["1,818.14人", "key", "report-module-27", "跃迁增量 1,818.14人"],
    ["−1,398.66人", "positive", "report-module-27", "降级增量 −1,398.66人"],
    ["−668.35人", "key", "report-module-27", "保持增量 −668.35人"],
    ["−21.17人", "positive", "report-module-27"],
    ["36.65%", "negative", "report-module-27"],
    ["−14.46人", "negative", "report-module-27"],
    ["38.53%", "negative", "report-module-27"],
    ["+14.46人", "negative", "report-module-27"],
    ["−21.97人", "negative", "report-module-27"],
    ["−4.00人", "key", "report-module-27"]
  ]
};

const numericHTML = text => text.split(/([+\-−]?\d+(?:,\d{3})*(?:\.\d+)?(?:%|％|万|亿)?(?:[–—~～][+\-−]?\d+(?:,\d{3})*(?:\.\d+)?(?:%|％|万|亿)?)?(?:元|小时|人|名|个百分点|张|天)?)/g)
  .filter(Boolean).map(part => /^[+\-−]?\d/.test(part) ? `<span class="cf-number">${esc(part)}</span>` : esc(part)).join("");

// Generated conclusions carry the saved within-experiment significance in prose.
// Match that explicit evidence, never the numeric sign alone. Costs and
// descriptive measures stay neutral unless a reviewed business verdict exists.
export function generatedConclusionAnnotations(item, scope = "") {
  const text = String(item.text || ""), annotations = [];
  for (const match of text.matchAll(/增幅\s*([+＋\-−]?\d+(?:\.\d+)?%)\s*[（(，,]\s*(正向显著|负向显著|不显著)/g)) {
    const clause = text.slice(0, match.index).split(/[；;：:）)]/).at(-1);
    const cost = item.metricKey === "cost" || /成本|消耗|费用/.test(clause);
    const tone = cost || match[2] === "不显著" ? "key" : match[2] === "正向显著" ? "positive" : "negative";
    annotations.push([match[1], tone, item.scope || scope, match[0], match.index + match[0].indexOf(match[1])]);
  }
  for (const match of text.matchAll(/(?:ROI\s+|(?:均值|P50|P90|间隔)[^；。]*?)([+\-−]?\d+(?:,\d{3})*(?:\.\d+)?(?:～|–|-)?\d*(?:\.\d+)?(?:\s*小时)?)/gi)) {
    annotations.push([match[1], "key", item.scope || scope, match[0], match.index + match[0].indexOf(match[1])]);
  }
  return annotations;
}

export function renderConclusionText(item, annotations = []) {
  let offset = 0;
  const runs = (item.runs?.length ? item.runs : [{ text: item.text }]).map(run => {
    const text = String(run.text ?? ""), start = offset;
    offset += text.length;
    return { ...run, start, end: offset, text };
  });
  const text = runs.map(run => run.text).join("");
  const highlights = annotations.flatMap(([value, tone, evidence, context, position]) => {
    const anchor = context ? text.indexOf(context) : 0;
    if (anchor < 0 || !["positive", "negative", "key"].includes(tone)) return [];
    const start = Number.isInteger(position) && text.slice(position, position + value.length) === value
      ? position : text.indexOf(value, anchor);
    return start < 0 || (context && !Number.isInteger(position) && start + value.length > anchor + context.length) ? []
      : [{ start, end: start + value.length, tone, evidence }];
  }).sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((range, index, all) => !all.slice(0, index).some(previous => previous.end > range.start));
  const notes = [...text.matchAll(/（[^（）()[\]［］\n]*）|\([^（）()[\]［］\n]*\)/g)]
    .filter(match => !/^[（(][A-Za-z][\w\s/+.-]*[）)]$/.test(match[0]))
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
  const boundaries = [...new Set([0, text.length, ...[...runs, ...highlights, ...notes].flatMap(range => [range.start, range.end])])].sort((a, b) => a - b);

  // Match claims against the full item before preserving source formatting.
  // This handles numbers split across rich-text runs and keeps note styles
  // from weakening the foreground, weight or size of selected evidence.
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const run = runs.find(range => range.start <= start && range.end >= end);
    const highlight = highlights.find(range => range.start <= start && range.end >= end);
    const note = run?.note || notes.some(range => range.start <= start && range.end >= end);
    let html = numericHTML(text.slice(start, end)).replaceAll("\n", "<br>\n");
    if (highlight) html = `<strong class="cf-highlight cf-highlight-${highlight.tone}" data-cf-evidence="${esc(highlight.evidence)}">${html}</strong>`;
    else if (run?.strong) html = `<strong>${html}</strong>`;
    if (note) html = `<em class="${run?.note ? "cf-note" : "cf-parenthetical"}">${html}</em>`;
    return html;
  }).join("");
}
