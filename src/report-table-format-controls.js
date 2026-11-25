import { formatColors, barLevels, compactTableLabel, normalizeTableFormat, loadTableFormats, saveTableFormats } from "./report-table-formatting.js";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const formatIcon = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 8h16M8 8v9M11 11h4M11 14h2"/></svg>';
const closeIcon = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>';

export function tableFormat(view, module, context) {
  view.completeFormats ||= loadTableFormats(context.source.id);
  return view.completeFormats[module.id] = normalizeTableFormat(
    view.completeFormats[module.id], context.metrics(module).map(metric => metric.id)
  );
}

export function formatButton(module, view) {
  const open = view.completeFormatOpen === module.id;
  return `<button type="button" class="btn-o sm cf-format-trigger${open ? " on" : ""}"
    data-cf-format="toggle" data-cf-module="${module.id}" aria-expanded="${open}"
    aria-controls="cf-format-${module.id}">${formatIcon}条件格式</button>`;
}

export function formatPanel(module, view, format, options = {}) {
  if (view.completeFormatOpen !== module.id) return "";
  const metrics = options.metrics || [], chosen = format.metrics || metrics.map(metric => metric.id);
  const attrs = key => `data-cf-format="${key}" data-cf-module="${module.id}"`;
  const toggle = (key, label, checked, disabled = false) => `<label class="cf-format-switch"><span>${label}</span><input type="checkbox" role="switch" aria-label="${label}" ${attrs(key)}${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span class="cf-switch-track" aria-hidden="true"></span></label>`;
  return `<section class="cf-format-panel" id="cf-format-${module.id}" aria-label="本表条件格式">
    <div class="cf-format-heading"><strong>条件格式</strong><span>当前表格</span><div class="cf-format-actions">
      <button type="button" class="cf-format-reset" ${attrs("reset")}>恢复默认</button>
      <button type="button" class="cf-format-close" ${attrs("close")} aria-label="收起条件格式">${closeIcon}</button>
    </div></div>
    <div class="cf-format-grid">
      <div class="cf-format-section">
        ${toggle("bars", "单元格数据条", format.bars)}
        <p>按数值绝对值分层，颜色越深表示幅度越大；检验统计量不参与。</p>
        <fieldset class="cf-bar-options" aria-label="数据条颜色"${!format.bars ? " disabled" : ""}>${Object.entries(formatColors).map(([key, color]) =>
          `<label title="${color.label} ${color.hex}"><input type="radio" name="cf-bar-${module.id}" value="${key}" ${attrs("barColor")}${format.barColor === key ? " checked" : ""}><span style="--cf-swatch:${color.hex}"><i aria-hidden="true"></i>${color.label}</span></label>`
        ).join("")}</fieldset>
        <div class="cf-bar-levels" aria-label="按绝对值从小到大三等分分层">${barLevels.map(level =>
          `<span title="${level.threshold}"><i aria-hidden="true" style="background:rgb(${formatColors[format.barColor].rgb} / ${level.fill}%)"></i>${level.label}</span>`
        ).join("")}</div><small class="cf-format-hint">按原列最大绝对值分三档，负值仍向左延伸。</small>
        <details class="cf-format-metrics"${format.bars && !chosen.length ? " open" : ""}><summary>应用指标 <span>${chosen.length} / ${metrics.length}</span><span aria-hidden="true">⌄</span></summary>
          <div class="cf-format-metric-list"><label><input type="checkbox" ${attrs("allMetrics")}${chosen.length === metrics.length ? " checked" : ""}${chosen.length && chosen.length < metrics.length ? " data-indeterminate" : ""}${!format.bars ? " disabled" : ""}>全部可用指标</label>
            ${metrics.map(metric => `<label title="${esc(metric.label)}"><input type="checkbox" ${attrs("metric")} value="${esc(metric.id)}"${chosen.includes(metric.id) ? " checked" : ""}${!format.bars ? " disabled" : ""}>${esc(compactTableLabel(module, metric.label))}</label>`).join("")}
          </div>
        </details>
        ${format.bars && !chosen.length ? '<small class="cf-format-hint">未选择指标，当前不显示数据条。</small>' : ""}
      </div>
    </div>
    <div class="cf-format-footer" role="status">${view.completeFormatStorageUnavailable ? "已应用；当前浏览器无法保存，刷新后将恢复默认。" : "设置自动保存在当前浏览器，仅作用于本表。"}<span>数据条按原列完整数据缩放</span></div>
  </section>`;
}

export function tableFormatEvent(event, view, context) {
  const source = context.source;
  const metricsFor = context.metrics;
  const scopeFor = context.scope;
  if (event.type === "keydown" && event.key === "Escape" && view.completeFormatOpen) {
    const id = view.completeFormatOpen;
    view.completeFormatOpen = null;
    event.preventDefault(); event.stopPropagation();
    const module = source.modules.find(item => item.id === id);
    return { moduleId: module ? scopeFor(module) : `cf-${id}`, focus: `[data-cf-module="${id}"][data-cf-format="toggle"]` };
  }
  const target = event.target.closest("[data-cf-format]");
  if (!target) return false;
  const action = target.dataset.cfFormat;
  const isInput = ["bars", "barColor", "metric", "allMetrics"].includes(action);
  if (event.type !== (isInput ? "change" : "click")) return false;
  const module = source.modules.find(item => item.id === target.dataset.cfModule);
  if (!module) return false;
  const format = tableFormat(view, module, context), ids = metricsFor(module).map(metric => metric.id);
  if (action === "toggle" || action === "close") {
    const previous = view.completeFormatOpen;
    view.completeFormatOpen = action === "close" || previous === module.id ? null : module.id;
    // Remove another table's open editor without re-rendering its table/scroll state.
    if (previous && previous !== view.completeFormatOpen) {
      event.target.closest(".cf-report")?.querySelector(`#cf-format-${previous}`)?.remove();
      const oldTrigger = event.target.closest(".cf-report")?.querySelector(`[data-cf-module="${previous}"][data-cf-format="toggle"]`);
      oldTrigger?.setAttribute("aria-expanded", "false");
      oldTrigger?.classList.remove("on");
    }
  } else {
    if (action === "reset") view.completeFormats[module.id] = normalizeTableFormat({}, ids);
    else if (action === "bars") format[action] = target.checked;
    else if (action === "barColor") format[action] = target.value;
    else if (action === "allMetrics") format.metrics = target.checked ? null : [];
    else if (action === "metric") {
      const selected = new Set(format.metrics || ids);
      if (target.checked) selected.add(target.value); else selected.delete(target.value);
      format.metrics = selected.size === ids.length ? null : [...selected];
    } else return false;
    view.completeFormats[module.id] = normalizeTableFormat(view.completeFormats[module.id], ids);
    if (action === "bars" && format.bars && Array.isArray(format.metrics) && !format.metrics.length) {
      // The report preserves existing <details> state when it replaces this module.
      target.closest(".cf-format-panel")?.querySelector(".cf-format-metrics")?.setAttribute("open", "");
    }
    view.completeFormatStorageUnavailable = !saveTableFormats(source.id, view.completeFormats);
  }
  return { moduleId: scopeFor(module),
    focus: `[data-cf-module="${module.id}"][data-cf-format="${["toggle", "close"].includes(action) ? "toggle" : action}"]${["metric", "barColor"].includes(action) ? `[value=${JSON.stringify(target.value)}]` : ""}` };
}
