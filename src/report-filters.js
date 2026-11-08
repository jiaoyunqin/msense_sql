export const reportTypeOptions = [
  ["all", "全部类型"], ["单实验报告", "单实验报告"], ["多实验报告", "多实验报告"], ["单模块报告", "单模块报告"]
];
export const normalizeReportType = type => type === "实验报告" ? "单实验报告" : type;
export const reportStatusOptions = [
  ["all", "全部状态"], ["running", "分析中"], ["completed", "已完成"],
  ["partial", "部分完成"], ["failed", "分析失败"]
];
export const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fromDay = day => new Date(`${day}T12:00:00`);
export function recentDateRange(days, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days + 1);
  return { timeFrom: localDay(start), timeTo: localDay(now) };
}
export function normalizeReportStatus(record) {
  const status = record.status;
  if (["running", "pending", "fetching", "analyzing"].includes(status)) return "running";
  if (["success", "completed"].includes(status)) return "completed";
  if (status === "partial") return "partial";
  if (status === "interrupted") return record.results?.some(result => result.status === "success") ? "partial" : "failed";
  if (["failed", "timeout", "permission", "insufficient"].includes(status)) return "failed";
  // Legacy report entries are completed artifacts, not task placeholders.
  return record.generated ? "completed" : "failed";
}
export function matchesReportFilters(record, filters) {
  const query = (filters.kw || "").trim().toLowerCase();
  if (filters.scope === "mine" && record.owner !== "秦娇芸") return false;
  if (filters.type !== "all" && normalizeReportType(record.type) !== normalizeReportType(filters.type)) return false;
  if (filters.status !== "all" && normalizeReportStatus(record) !== filters.status) return false;
  if (query && !`${record.title} ${record.exp} ${record.libra} ${record.qx || ""}`.toLowerCase().includes(query)) return false;
  if (filters.timeFrom || filters.timeTo) {
    const date = new Date((record.createdAt || record.created || "").replace(" ", "T"));
    if (!Number.isFinite(date.getTime())) return false;
    const day = localDay(date);
    if (filters.timeFrom && day < filters.timeFrom || filters.timeTo && day > filters.timeTo) return false;
  }
  return true;
}

export function createReportDateFilter({ root, filters, icon, onChange }) {
  let open = false, month = new Date(), first = "", hover = "", focusDay = "";
  const label = () => filters.timeFrom
    ? filters.timeFrom === filters.timeTo ? filters.timeFrom : `${filters.timeFrom} 至 ${filters.timeTo}`
    : "全部时间";
  function html() {
    return `<div class="r-date-control"><button type="button" class="r-date-trigger" data-date-toggle aria-label="按创建时间范围筛选" aria-expanded="${open}" aria-haspopup="dialog">${icon("cal", 16)}<span>${label()}</span></button><div class="r-calendar-slot"></div></div>`;
  }
  function close(restoreFocus = false) {
    open = false; first = ""; hover = "";
    root.querySelector(".r-calendar-slot")?.replaceChildren();
    const trigger = root.querySelector("[data-date-toggle]");
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }
  function renderCalendar() {
    const slot = root.querySelector(".r-calendar-slot");
    if (!slot || !open) return;
    const today = localDay(new Date()), year = month.getFullYear(), index = month.getMonth();
    const start = new Date(year, index, 1);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const from = first || filters.timeFrom, to = first ? hover || first : filters.timeTo;
    const low = from && to ? [from, to].sort()[0] : from, high = from && to ? [from, to].sort()[1] : from;
    focusDay ||= first || filters.timeFrom || today;
    slot.innerHTML = `<div class="r-calendar" role="dialog" aria-label="选择报告创建时间范围">
      <div class="r-calendar-heading"><button type="button" data-date-month="-1" aria-label="上个月">${icon("back", 16)}</button>
        <strong aria-live="polite">${year}年${index + 1}月</strong><button type="button" data-date-month="1" aria-label="下个月" ${year > new Date().getFullYear() || year === new Date().getFullYear() && index >= new Date().getMonth() ? "disabled" : ""}>${icon("side", 16)}</button></div>
      <div class="r-calendar-week">${["一", "二", "三", "四", "五", "六", "日"].map(day => `<span>${day}</span>`).join("")}</div>
      <div class="r-calendar-grid">${Array.from({ length: 42 }, (_, offset) => {
        const date = new Date(start); date.setDate(date.getDate() + offset);
        const day = localDay(date), selected = day === low || day === high;
        return `<button type="button" data-date-day="${day}" aria-label="${day}${day === today ? "，今天" : ""}${selected ? "，已选择" : ""}" aria-pressed="${Boolean(selected)}" tabindex="${day === focusDay ? 0 : -1}"
          class="${date.getMonth() !== index ? "other-month " : ""}${day === today ? "today " : ""}${selected ? "selected " : ""}${low && day > low && day < high ? "in-range" : ""}" ${day > today ? "disabled" : ""}>${date.getDate()}</button>`;
      }).join("")}</div><p class="r-calendar-hint" aria-live="polite">${first ? `已选 ${first}，再选结束日期` : "选择开始和结束日期"}</p>
      <div class="r-calendar-shortcuts">${[7, 30, 90].map(days => `<button type="button" data-date-recent="${days}">近 ${days} 天</button>`).join("")}</div>
      <div class="r-calendar-footer"><button type="button" data-date-clear>清除</button></div></div>`;
    const panel = slot.firstElementChild, rect = panel.getBoundingClientRect();
    if (rect.right > innerWidth - 12) panel.style.left = `${Math.min(0, innerWidth - 12 - rect.right)}px`;
    root.querySelector("[data-date-toggle]").setAttribute("aria-expanded", "true");
  }
  function apply(range) {
    Object.assign(filters, range);
    root.querySelector(".r-date-trigger span").textContent = label();
    close(true); onChange();
  }
  root.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if ("dateToggle" in button.dataset) {
      if (open) close(true);
      else {
        open = true; first = ""; hover = ""; focusDay = filters.timeFrom || localDay(new Date());
        month = fromDay(focusDay); renderCalendar();
        root.querySelector(`[data-date-day="${focusDay}"]`)?.focus({ preventScroll: true });
      }
    }
    if (button.dataset.dateMonth) {
      month = new Date(month.getFullYear(), month.getMonth() + Number(button.dataset.dateMonth), 1);
      focusDay = localDay(month); renderCalendar();
      root.querySelector(`[data-date-month="${button.dataset.dateMonth}"]`)?.focus();
    }
    if (button.dataset.dateRecent) apply(recentDateRange(Number(button.dataset.dateRecent)));
    if ("dateClear" in button.dataset) apply({ timeFrom: "", timeTo: "" });
    if (button.dataset.dateDay && !button.disabled) {
      const day = button.dataset.dateDay;
      if (!first) { first = day; hover = ""; focusDay = day; renderCalendar(); root.querySelector(`[data-date-day="${day}"]`)?.focus(); }
      else { const [timeFrom, timeTo] = [first, day].sort(); apply({ timeFrom, timeTo }); }
    }
  });
  root.addEventListener("keydown", event => {
    if (!open) return;
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    const day = event.target.dataset.dateDay, delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!day || !delta) return;
    event.preventDefault();
    const target = fromDay(day); target.setDate(target.getDate() + delta);
    if (localDay(target) > localDay(new Date())) return;
    focusDay = localDay(target);
    if (!root.querySelector(`[data-date-day="${focusDay}"]`)) month = target;
    renderCalendar(); root.querySelector(`[data-date-day="${focusDay}"]`)?.focus();
  });
  document.addEventListener("pointerdown", event => {
    if (open && !event.target.closest(".r-date-control")) close();
  });
  return { html, close };
}
