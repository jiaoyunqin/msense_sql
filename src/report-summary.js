const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const prose = value => esc(value).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
const chart = `<svg class="ic summary-chart" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 16v5M16 14.639V21M20 10.656V21m2-18-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15M4 18.463V21M8 14.656V21"/></svg>`;
const aiMark = id => `<svg class="summary-ai-mark" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
  <defs><linearGradient id="${id}-ai-mark" x1="9" y1="2" x2="9" y2="17" gradientUnits="userSpaceOnUse"><stop stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".18"/></linearGradient></defs>
  <path d="M3 15V5l6 8 6-8v10" stroke="url(#${id}-ai-mark)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 3V1.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

export function renderReportSummary(summary) {
  if (!summary) return "";
  const id = esc(summary.id), title = esc(summary.title);
  const blocks = (summary.blocks || []).map(block =>
    `${block.h ? `<h4>${prose(block.h)}</h4>` : ""}${block.list?.length ? `<ul>${block.list.map(text => `<li><p>${prose(text)}</p></li>`).join("")}</ul>` : ""}${block.text ? `<p>${prose(block.text)}</p>` : ""}`
  ).join("");
  return `<section class="sec reference-summary" id="sec-${id}" data-sec="${id}"><div class="ccard" data-card="${id}">
    <div class="ccard-h"><h3 class="t">${chart}<span>${title}</span></h3><span class="grow"></span><button type="button" class="ask-btn mm-ai" data-ask="${id}" aria-label="向 AI 提问：${title}">${aiMark(id)}<span>AI</span></button></div>
    <div class="report-summary-body" data-summary-body>${summary.lead ? `<p class="summary-lead"><strong>${prose(summary.lead)}</strong></p>` : ""}${blocks}</div></div></section>`;
}

export function reportSummaryText(summary) {
  return [summary.lead, ...(summary.blocks || []).flatMap(block => [block.h, block.text, ...(block.list || [])])]
    .filter(Boolean).join("\n\n");
}
