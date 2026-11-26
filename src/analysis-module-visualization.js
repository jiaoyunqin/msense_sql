import { calculationBlockId } from "./analysis-module-report-order.js";
import { dataBarMetricName } from "./report-table-formatting.js";

export const reportBarId = (sourceId, key) => JSON.stringify([sourceId, key]);
export const reportBarIds = configuration => new Set((Array.isArray(configuration?.reportDataBars)
  ? configuration.reportDataBars : []).filter(ref => typeof ref?.sourceId === "string" && typeof ref?.key === "string")
  .map(({ sourceId, key }) => reportBarId(sourceId, key)));

export function reportBarCandidates(module, resolveSource = source => source.definition) {
  const candidates = [];
  for (const source of module.sources || []) {
    if (!source.showInReport) continue;
    const definition = resolveSource(source);
    for (const field of definition?.metrics || []) {
      if (!source.metricKeys.includes(field.key) || field.type !== "number"
        || ![undefined, "number"].includes(field.semanticType) || !dataBarMetricName(field.name)) continue;
      if (source.kind === "sql" && !definition.version?.modes.some(mode => source.dimensionKeys.includes(mode.id)
        && mode.fields.some(output => output.role === "metric" && output.key === field.key))) continue;
      candidates.push({ sourceId: source.id, key: field.key, name: field.name, sourceName: definition.name });
    }
  }
  for (const metric of module.calculatedMetrics || []) {
    if (metric.showInReport && metric.name?.trim() && dataBarMetricName(metric.name))
      candidates.push({ sourceId: calculationBlockId, key: metric.key, name: metric.name, sourceName: "计算指标" });
  }
  return candidates;
}

export function normalizeReportBars(configuration, candidates) {
  const selected = reportBarIds(configuration);
  return candidates.filter(({ sourceId, key }) => selected.delete(reportBarId(sourceId, key)))
    .map(({ sourceId, key }) => ({ sourceId, key }));
}

const normalized = value => String(value ?? "").normalize("NFKC").toLowerCase()
  .replace(/[‐‑‒–—−]/g, "-").replace(/\s+/g, " ");
const commonAliases = {
  dac: ["DAC", "支付天"], gmv: ["人均GMV"], roi: ["ROI"], cost: ["结算成本", "用增成本"],
  redeemCost: ["核销成本"], incrementalGmv: ["增量GMV"]
};
const escapeRegex = term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function termsFor(candidate) {
  const interval = candidate.name.match(/^领券核销间隔(均值|P\d+)$/i);
  const aliases = Object.hasOwn(commonAliases, candidate.key) ? commonAliases[candidate.key] : [];
  return new Set([candidate.name, ...aliases, ...(interval ? [interval[1]] : [])]
    .map(term => normalized(term).replaceAll(" ", "")).filter(Boolean));
}

// The local demo recommends only named candidates, never an invented or ambiguous field.
export function recommendReportBars(reasoning, candidates) {
  const text = normalized(reasoning);
  const matches = [];
  for (const candidate of candidates) for (const term of termsFor(candidate)) {
    const pattern = [...term].map(escapeRegex).join("\\s*");
    const prefix = /^[a-z0-9]/.test(term) ? "(?<![a-z0-9_])" : "";
    const suffix = /[a-z0-9]$/.test(term) ? "(?![a-z0-9_])" : "";
    for (const match of text.matchAll(new RegExp(`${prefix}${pattern}${suffix}`, "g")))
      matches.push({ candidate, start: match.index, end: match.index + match[0].length });
  }
  const primary = matches.filter(match => !matches.some(other =>
    other.start <= match.start && other.end >= match.end && (other.start < match.start || other.end > match.end)));
  const selected = new Map();
  for (const { candidate, start, end } of primary.sort((a, b) => a.start - b.start)) {
    const sameMention = primary.filter(other => other.start === start && other.end === end);
    const identity = reportBarId(candidate.sourceId, candidate.key);
    if (sameMention.some(({ candidate: other }) => reportBarId(other.sourceId, other.key) !== identity)) continue;
    const clause = text.slice(text.lastIndexOf("。", start - 1) + 1, start);
    if (/(?:不关注|不考虑|不分析|不看|无需关注|忽略|排除)\s*$/.test(clause)) continue;
    selected.set(identity, { sourceId: candidate.sourceId, key: candidate.key });
    if (selected.size === 3) break;
  }
  return [...selected.values()];
}
