const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function renderReportSummary(summary) {
  if (!summary) return "";
  const id = esc(summary.id), title = esc(summary.title);
  const blocks = (summary.blocks || []).map(block =>
    `${block.h ? `<h4>${esc(block.h)}</h4>` : ""}${block.list?.length ? `<ul>${block.list.map(text => `<li>${esc(text)}</li>`).join("")}</ul>` : ""}${block.text ? `<p>${esc(block.text)}</p>` : ""}`
  ).join("");
  return `<section class="sec reference-summary" id="sec-${id}" data-sec="${id}"><div class="ccard" data-card="${id}">
    <div class="ccard-h"><span class="t">${title}</span><span class="grow"></span><button type="button" class="ask-btn mm-ai" data-ask="${id}" aria-label="向 AI 提问：${title}">AI</button></div>
    <div data-summary-body>${summary.lead ? `<p>${esc(summary.lead)}</p>` : ""}${blocks}</div></div></section>`;
}

export function reportSummaryText(summary) {
  return [summary.lead, ...(summary.blocks || []).flatMap(block => [block.h, block.text, ...(block.list || [])])]
    .filter(Boolean).join("\n\n");
}
