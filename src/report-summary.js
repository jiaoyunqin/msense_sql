import { renderConclusionText, generatedConclusionAnnotations } from "./report-conclusion-emphasis.js";
import { aiMark } from "./ai-mark.js";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const prose = value => esc(value).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
const listText = item => typeof item === "string" ? item : item?.text;
const summaryRuns = runs => runs.map(run => {
  if (run.note) return `<em class="sv-parenthetical">${esc(run.text)}${run.value ? `<span class="sv-number">${esc(run.value)}</span>${esc(run.suffix || "")}` : ""}</em>`;
  if (["positive", "negative", "neutral"].includes(run.tone)) return `<strong class="sv-highlight sv-highlight-${run.tone}" data-sv-evidence="${esc(run.evidence)}">${run.text ? esc(run.text) : ""}<span class="sv-number">${esc(run.value)}</span></strong>`;
  if (run.value) return `<span class="sv-number">${esc(run.value)}</span>`;
  return esc(run.text);
}).join("");
const chart = `<svg class="ic summary-chart" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 16v5M16 14.639V21M20 10.656V21m2-18-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15M4 18.463V21M8 14.656V21"/></svg>`;

export function renderReportSummary(summary, options = {}) {
  if (!summary) return "";
  const id = esc(summary.id), title = esc(summary.title);
  const textHTML = (text, sourceRuns) => {
    if (!options.emphasis) return prose(text);
    const runs = sourceRuns?.length ? sourceRuns.map(run => ({
      ...run, text: `${run.text || ""}${run.value ?? ""}${run.suffix || ""}`,
      key: run.key ?? (run.value != null && ["positive", "negative", "neutral", "key"].includes(run.tone))
    })) : String(text ?? "").split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean)
      .map(part => part.startsWith("**") ? { text: part.slice(2, -2), strong: true } : { text: part });
    const item = { text: runs.map(run => run.text).join(""), runs, scope: summary.id };
    return renderConclusionText(item, generatedConclusionAnnotations(item, summary.id));
  };
  const blocks = (summary.blocks || []).map(block =>
    `${block.h ? `<h4>${prose(block.h)}</h4>` : ""}${block.list?.length ? `<ul>${block.list.map(item => `<li><p>${textHTML(listText(item), item?.runs)}</p></li>`).join("")}</ul>` : ""}${block.text ? `<p>${block.runs && !options.emphasis ? summaryRuns(block.runs) : textHTML(block.text, block.runs)}</p>` : ""}`
  ).join("");
  return `<section class="sec reference-summary" id="sec-${id}" data-sec="${id}"><div class="ccard" data-card="${id}">
    <div class="ccard-h"><h3 class="t">${chart}<span>${title}</span></h3><span class="grow"></span><button type="button" class="ask-btn mm-ai" data-ask="${id}" aria-label="向 AI 提问：${title}">${aiMark(id)}<span>AI</span></button></div>
    <div class="report-summary-body" data-summary-body>${summary.lead ? `<p class="summary-lead"><strong>${textHTML(summary.lead)}</strong></p>` : ""}${blocks}</div></div></section>`;
}

export function reportSummaryText(summary) {
  return [summary.lead, ...(summary.blocks || []).flatMap(block => [block.h, block.text, ...(block.list || []).map(listText)])]
    .filter(Boolean).join("\n\n");
}
