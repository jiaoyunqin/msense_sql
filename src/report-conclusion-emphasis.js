const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// Reviewed key evidence, scoped to its source module. The legacy tone column
// is selection metadata only: phase-one colors come from numeric direction,
// never a business-benefit verdict. Context disambiguates repeated values.
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

const numberPattern = /[+＋\-−]?\d+(?:,\d{3})*(?:\.\d+)?(?:[%％])?/g;
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const contains = (range, start, end) => range.start <= start && range.end >= end;
const sourceText = item => item.runs?.length ? item.runs.map(run => run.text ?? "").join("") : String(item.text ?? "");
const intervalPattern = /[（(\[［]\s*[+\-−]?\d+(?:\.\d+)?\s*[,，]\s*[+\-−]?\d+(?:\.\d+)?\s*[）)\]］]/g;

// Decimal-string rounding avoids binary floating-point errors (e.g. 1.005).
// Only prose decimals and percentages change; source values remain untouched.
export function formatConclusionNumber(raw) {
  const match = raw.match(/^([+＋\-−]?)(\d+(?:,\d{3})*)(?:\.(\d+))?([%％]?)$/);
  if (!match || (!match[3] && !match[4])) return raw;
  const [, sign, integer, fraction = "", percent] = match;
  let hundredths = BigInt(integer.replaceAll(",", "")) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (Number(fraction[2] || 0) >= 5) hundredths++;
  let whole = String(hundredths / 100n);
  if (integer.includes(",")) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Do not display a negative zero after rounding.
  const prefix = hundredths === 0n && /[-−]/.test(sign) ? "" : sign;
  return `${prefix}${whole}.${String(hundredths % 100n).padStart(2, "0")}${percent}`;
}

function protectedRanges(text) {
  const patterns = [
    /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/g,
    /\d{1,2}:\d{2}(?::\d{2})?/g,
    /[A-Za-z][A-Za-z\d]*(?:[-_.][A-Za-z\d]+)*/g,
    /(?:实验\s*ID|Libra\s*ID|版本)\s*[:：]?\s*[vV]?\d+(?:\.\d+)*/gi
  ];
  return patterns.flatMap(pattern => [...text.matchAll(pattern)].map(match => {
    // Metric names may directly precede a value; those digits are not an ID.
    const metric = match[0].match(/^(?:GMV-ROI|ROI|DAC|GMV)(?=\d)/)?.[0];
    return { start: match.index, end: match.index + (metric || match[0]).length };
  }));
}

function noteRanges(text, protectedText) {
  const intervals = [...text.matchAll(intervalPattern)].map(match => ({ start: match.index, end: match.index + match[0].length }));
  const stack = [], ranges = [];
  for (let index = 0; index < text.length; index++) {
    if ([...protectedText, ...intervals].some(range => contains(range, index, index + 1))) continue;
    if ("（(".includes(text[index])) stack.push(index);
    else if ("）)".includes(text[index]) && stack.length) {
      const start = stack.pop(), value = text.slice(start, index + 1);
      if (stack.length) continue;
      const abbreviation = /^[（(][A-Za-z][\w\s/+.-]*[）)]$/.test(value) && !numbersIn(value).length;
      if (!abbreviation) ranges.push({ start, end: index + 1 });
    }
  }
  return ranges;
}

function numbersIn(text) {
  const protectedText = protectedRanges(text);
  return [...text.matchAll(numberPattern)].flatMap(match => {
    let raw = match[0], start = match.index;
    // A range dash is a separator, not a negative sign on its upper bound.
    if (/^-/.test(raw) && /[\d%％]$/.test(text.slice(0, start))) { start++; raw = raw.slice(1); }
    const token = { start, end: start + raw.length, raw };
    return protectedText.some(range => overlaps(range, token)) ? [] : [token];
  });
}

const upWords = "提升|提高|上升|上涨|增加|增长|增至|升至|升高|扩大|多";
const downWords = "下降|降低|下跌|减少|缩短|缩减|降至|降为|低";
function directionOf(text, token, tokens) {
  const raw = token.raw;
  const previous = tokens.filter(item => item.end <= token.start).at(-1);
  const sincePrevious = text.slice(previous?.end || 0, token.start);
  const prefix = text.slice(0, token.start);
  const clause = prefix.split(/[，,；;。！？：:（）()]/).at(-1);
  const cue = clause.match(new RegExp(`(${upWords}|${downWords})(?:约|近|了|为|至|达|到|分别|相对|绝对|累计|\\s)*$`));
  const before = cue ? clause.slice(0, cue.index) : clause;
  if (/(?:未|没有|不|无|并非)(?:明显|显著|继续|持续|进一步|发生|出现|见|能|会)*$/.test(before)
    || /(?:预计|预期|目标|假设|如果|若|计划|有望|可能)[^，；。]*$/.test(before)) return null;
  // "降至 0" and "升至 -2" describe target values, not signed changes.
  if (cue && /(?:至|到|为)\s*$/.test(cue[0]))
    return new RegExp(`^(?:${upWords})$`).test(cue[1]) ? "positive" : "negative";
  if (Number(raw.replaceAll(",", "").replace(/[％%]/g, "").replace("−", "-").replace("＋", "+")) === 0) return null;
  const inList = previous && /^(?:[%％万亿元人名张天小时个百分点/日\s]*[、/和及～~–—-]\s*)$/.test(sincePrevious);
  // A signed delta has direction; a negative absolute ROI/value need not
  // describe a decrease. Keep the sign's meaning tied to its local context.
  const changeContext = cue || /增幅|增量|变化|变动|差值|差额|正向|负向/.test(clause)
    || inList && directionOf(text, previous, tokens);
  if (/^[+＋]/.test(raw) && changeContext) return "positive";
  if (/^[-−]/.test(raw) && changeContext) return "negative";
  // Continue an explicitly directed number list, including its repeated unit.
  if (inList)
    return directionOf(text, previous, tokens);
  if (!cue) return null;
  if (/最$/.test(before)) return null;
  return new RegExp(`^(?:${upWords})$`).test(cue[1]) ? "positive" : "negative";
}

// Demo key selection follows the message's focal metric and named evidence.
// A direction by itself must never select a number as key.
export function generatedConclusionAnnotations(item, scope = "") {
  const text = sourceText(item), tokens = numbersIn(text);
  return tokens.filter(token =>
    (["dac", "gmv", "roi", "cost"].includes(item.metricKey) && /[.%％]/.test(token.raw))
    || /(?:ROI|均值|P50|P90|平均间隔|核销间隔)[^\d，；。]{0,8}$/.test(text.slice(0, token.start)))
    .map(token => [token.raw, "key", item.scope || scope, null, token.start]);
}

function summaryRange(item, text, runs) {
  if (item.kind === "heading" || runs.some(run => run.strong) || item.note) return null;
  if (item.summary) {
    const start = text.indexOf(item.summary);
    return start >= 0 ? { start, end: start + item.summary.length } : null;
  }
  // Prefer an existing concise judgement, not a numeric evidence enumeration.
  const judgement = /最高|最低|最短|最长|为主|主导|主要|集中|提升|下降|改善|差异|不同|通过|接近|短于|高于|低于|更高|更低|达标|表现|覆盖|未提供|无法|不足/;
  const excluded = [...protectedRanges(text), ...noteRanges(text, protectedRanges(text))];
  for (const match of text.matchAll(/[^。！？\n]+[。！？]?/g)) {
    const sentence = match[0];
    const colon = sentence.indexOf("：");
    const candidate = colon > 0 && colon < 110 ? sentence.slice(0, colon + 1) : sentence;
    const mainText = candidate.split("").map((character, index) =>
      excluded.some(range => contains(range, match.index + index, match.index + index + 1)) ? " " : character).join("");
    if (candidate.length > 160 || !judgement.test(mainText) || /[+\-−]?\d+\.\d|[%％]/.test(mainText)) continue;
    const range = { start: match.index, end: match.index + candidate.length };
    return range;
  }
  return null;
}

export function renderConclusionText(item, annotations = []) {
  let offset = 0;
  const runs = (item.runs?.length ? item.runs : [{ text: item.text }]).map(run => {
    const text = String(run.text ?? ""), start = offset;
    offset += text.length;
    return { ...run, start, end: offset, text };
  });
  const text = runs.map(run => run.text).join("");
  const highlights = annotations.flatMap(([value, , evidence, context, position]) => {
    const anchor = context ? text.indexOf(context) : 0;
    if (anchor < 0) return [];
    const start = Number.isInteger(position) && text.slice(position, position + value.length) === value
      ? position : text.indexOf(value, anchor);
    return start < 0 || (context && !Number.isInteger(position) && start + value.length > anchor + context.length) ? []
      : [{ start, end: start + value.length, evidence }];
  }).sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((range, index, all) => !all.slice(0, index).some(previous => previous.end > range.start));
  const notes = [...noteRanges(text, protectedRanges(text)), ...runs.filter(run => run.note)];
  const numbers = numbersIn(text);
  const trendNumbers = numbers.filter(token => !notes.some(note => overlaps(note, token)));
  const directionText = text.split("").map((character, index) => notes.some(note => contains(note, index, index + 1)) ? " " : character).join("");
  const summary = summaryRange(item, text, runs);
  const boundaries = [...new Set([0, text.length, ...[...runs, ...highlights, ...notes, ...numbers, ...(summary ? [summary] : [])]
    .flatMap(range => [range.start, range.end])])]
    // Keep each number atomic even when rich-text runs split its digits.
    .filter(offset => !numbers.some(token => token.start < offset && offset < token.end)).sort((a, b) => a - b);

  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const span = { start, end }, token = numbers.find(range => contains(range, start, end));
    const highlight = highlights.find(range => overlaps(range, span));
    const note = notes.some(range => overlaps(range, span));
    const strong = runs.some(run => run.strong && overlaps(run, span)) || summary && contains(summary, start, end);
    const direction = !note && token && directionOf(directionText, token, trendNumbers);
    const key = Boolean(token && (highlight || runs.some(run => run.key && overlaps(run, span))));
    const value = text.slice(start, end), formatted = token ? formatConclusionNumber(value) : value;
    let html = esc(formatted).replaceAll("\n", "<br>\n");
    if (token) html = `<span class="cf-number" data-cf-raw="${esc(value)}"${formatted !== value ? ` title="原始值：${esc(value)}"` : ""}>${html}</span>`;
    if (note) return `<em class="cf-parenthetical">${html}</em>`;
    if (key || highlight && !token) {
      html = `<strong class="cf-highlight cf-highlight-${direction || "key"}" data-cf-evidence="${esc(highlight?.evidence || item.scope || "")}"${direction ? ` data-cf-direction="${direction === "positive" ? "up" : "down"}"` : ""}>${html}</strong>`;
    } else if (direction) {
      html = `<span class="cf-trend cf-trend-${direction}" data-cf-direction="${direction === "positive" ? "up" : "down"}">${html}</span>`;
    } else if (strong && !token) html = `<strong class="cf-key-sentence">${html}</strong>`;
    return html;
  }).join("");
}
