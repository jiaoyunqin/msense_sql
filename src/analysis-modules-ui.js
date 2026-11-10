import { createIcons, icons } from "lucide";
import { clone, uid, currentActor, businessGoal } from "./composer-data.js";
import {
  initializeModules, moduleBuiltins, builtinSource, sqlSource, sourceDefinition, newAnalysisModule,
  moduleHash, moduleConfiguration, moduleState, moduleIssues, calculationCandidates,
  calculatedMetricIssues, includeCalculationDependency, newCalculatedMetric, metricReferenceKey, copyModuleSources
} from "./analysis-module-data.js";
import { runModule } from "./analysis-module-runner.js";
import { sourceMetricGrains, commonCalculationGrains } from "./analysis-module-calculations.js";
import { calculationBlockId, reportBlockIds, orderReportMetrics, orderReportDimensions, moveOrderedKey, pruneModuleReportOrder } from "./analysis-module-report-order.js";
import "./analysis-modules.css";
// Share the online catalog presentation with the report template list.
import "./report-template-catalog.css";

const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = (name) => `<i data-lucide="${name}"></i>`;
const button = (action, text, name = "", extra = "", cls = "") => `<button type="button" class="am-button ${cls}" data-action="mod-${action}" ${extra}>${name ? icon(name) : ""}${text}</button>`;
const stateNames = { draft: "草稿", online: "已上线", offline: "已下线" };
const time = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-") : "";
const listTime = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "—";
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const field = (title, key, value, placeholder = "") => `<label class="am-field"><span>${title}</span><input data-model="mod-field.${key}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;
const area = (title, key, value, placeholder = "") => `<label class="am-field am-area"><span>${title}</span><textarea data-model="mod-field.${key}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;

export function createAnalysisModules({ store, outlet, main, persist, showToast, openDialog, closeDialog, render }) {
  initializeModules(store);
  let search = "", creator = "", state = "all", type = "all", sort = "updated", errors = [], running = false;
  let page = 1, pageSize = 20;
  const configurationTabs = new Map();
  let draggedOrder = null;
  const orderAttrs = (kind, block, key) => `data-order-kind="${kind}" data-order-block="${esc(block)}" data-order-key="${esc(key)}"`;
  const orderGrip = (kind, block, key, name) => `<button type="button" class="am-order-grip" draggable="true" ${orderAttrs(kind, block, key)} aria-label="调整${esc(name)}顺序" title="拖拽排序，或用方向键调整">${icon("grip-vertical")}</button>`;
  const creatorOf = module => String(module.createdBy || "").trim();
  const creatorLabel = module => module.createdByName || (creatorOf(module) === currentActor ? "秦娇芸" : creatorOf(module)) || "—";
  const listSelect = (model, label, entries, value) => `<label class="ma-template-select"><select data-model="mod-${model}" aria-label="${label}">${entries.map(([key, name]) => `<option value="${key}" ${key === value ? "selected" : ""}>${name}</option>`).join("")}</select>${icon("chevron-down")}</label>`;
  function activate(id) {
    const module = store.modules.find((entry) => entry.id === id);
    if (module) store.analysis = module;
    return module;
  }
  function renderList() {
    const creatorName = creatorLabel(store.modules.find(module => creatorOf(module) === creator) || {});
    outlet.innerHTML = `<div class="am-list-page ma-template-catalog">
      <header class="am-list-header ma-page-header"><h1>实验分析模块</h1>${button("new", "新建实验分析模块", "plus", "", "ma-button primary")}</header>
      <div class="ma-template-filters" role="search" aria-label="筛选实验分析模块"><label class="ma-template-search">${icon("search")}<input type="search" data-model="mod-search" aria-label="搜索模块名称或说明" placeholder="搜索名称或说明" value="${esc(search)}"></label>
      <details class="am-multi-select am-creator-filter ma-template-creator"><summary aria-label="按创建人筛选"><span>${esc(creator ? creatorName : "全部创建人")}</span>${icon("chevron-down")}</summary>
        <div class="ma-template-creator-menu"><label class="ma-template-search">${icon("search")}<input type="search" data-model="mod-creator-search" aria-label="搜索创建人" placeholder="搜索创建人"></label>
          <div class="am-creator-options ma-template-creator-options" role="listbox" aria-label="创建人"></div></div></details>
      ${listSelect("state", "模块状态", [["all", "全部有效状态"], ["online", "已上线"], ["draft", "草稿"], ["offline", "已下线"]], state)}
      ${listSelect("type", "模块分析类型", [["all", "全部分析类型"], ["single", "单实验分析"], ["multi", "多实验分析"]], type)}
      ${listSelect("sort", "模块排序", [["updated", "最近更新"], ["name", "名称排序"]], sort)}</div>
      <section class="ma-template-results" aria-label="实验分析模块列表"><div class="ma-template-table-scroll" role="region" aria-label="实验分析模块表格" tabindex="0">
        <table class="am-module-table ma-template-table" aria-label="实验分析模块列表"><colgroup><col><col class="ma-col-goal"><col class="ma-col-app"><col class="ma-col-status"><col class="ma-col-creator"><col class="ma-col-time"><col class="ma-col-actions"></colgroup>
          <thead><tr><th scope="col">名称与说明 <span class="am-result-count ma-template-count" aria-live="polite"></span></th><th scope="col">业务目标</th><th scope="col">适用端</th><th scope="col">状态</th><th scope="col">创建人</th><th scope="col">更新时间</th><th scope="col">操作</th></tr></thead><tbody></tbody></table></div>
        <nav class="ma-template-pagination" aria-label="实验分析模块分页">${listSelect("page-size", "每页条数", [10, 20, 50, 100].map(size => [String(size), `${size} 条 / 页`]), String(pageSize))}
          <span class="am-page-info ma-template-page-info" aria-live="polite"></span><div>${button("prev-page", "", "chevron-left", 'aria-label="上一页"', "ma-button ma-template-page-button")}${button("next-page", "", "chevron-right", 'aria-label="下一页"', "ma-button ma-template-page-button")}</div></nav></section></div>`;
    renderCreatorOptions();
    renderListResults();
  }
  function renderCreatorOptions(query = "") {
    const creators = [...new Map(store.modules.filter(module => !module.archived && creatorOf(module))
      .map(module => [creatorOf(module), creatorLabel(module)])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "zh-CN"))
      .filter(([id, name]) => `${id} ${name}`.toLowerCase().includes(query.trim().toLowerCase()));
    outlet.querySelector(".am-creator-options").innerHTML = [["", "全部创建人"], ...creators]
      .map(([value, name]) => `<button type="button" role="option" aria-selected="${creator === value}" data-action="mod-filter-creator" data-creator="${esc(value)}"><span>${esc(name)}</span>${creator === value ? icon("check") : ""}</button>`).join("")
      + (creators.length ? "" : '<p class="am-creator-empty" role="status">未找到匹配的创建人</p>');
    createIcons({ icons });
  }
  function renderListResults() {
    const modules = store.modules.filter((module) => !module.archived
      && (!creator || creatorOf(module) === creator)
      && (state === "all" || moduleState(module) === state)
      && (type === "all" || (module.analysisType || "single") === type)
      && `${module.name} ${module.description}`.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "zh-CN")
        : (b.updatedAt || b.savedAt || "").localeCompare(a.updatedAt || a.savedAt || ""));
    const pages = Math.max(1, Math.ceil(modules.length / pageSize));
    page = Math.min(Math.max(1, page), pages);
    outlet.querySelector(".am-result-count").textContent = `${modules.length} 项`;
    outlet.querySelector(".am-module-table tbody").innerHTML = modules.slice((page - 1) * pageSize, page * pageSize).map(module => {
      const status = moduleState(module), name = module.name || "未命名实验分析模块";
      const id = esc(module.id), person = creatorLabel(module), updatedAt = module.updatedAt || module.savedAt || "";
      return `<tr data-module-id="${id}" data-analysis-type="${esc(module.analysisType || "single")}">
        <th scope="row"><a class="ma-template-name" href="#/modules/${id}" title="${esc(name)}">${esc(name)}</a>${module.description ? `<p class="ma-template-description" title="${esc(module.description)}">${esc(module.description)}</p>` : ""}</th>
        <td>${esc(module.goal || businessGoal)}</td><td>${esc(module.apps?.join("、") || "不限端")}</td>
        <td><span class="ma-template-status ${status}"${module.versions.length ? ` title="已发布 v${module.versions.at(-1).number}"` : ""}>${stateNames[status]}</span></td>
        <td><span class="ma-template-person" title="${esc(creatorOf(module) || person)}"><span class="ma-template-avatar" aria-hidden="true">${esc(person === "—" ? "?" : [...person][0])}</span><span>${esc(person)}</span></span></td>
        <td><time${updatedAt ? ` datetime="${esc(updatedAt)}"` : ""}>${listTime(updatedAt)}</time></td>
        <td><div class="am-row-actions ma-template-row-actions">${button("copy", "", "copy", `data-id="${id}" aria-label="复制${esc(name)}" title="复制"`, "ma-button am-icon-action")}
          <a href="#/modules/${id}" aria-label="编辑${esc(name)}">${icon("pencil")}编辑</a>
          ${button("toggle-state", status === "online" ? "下线" : "上线", "", `data-id="${id}" aria-label="${status === "online" ? "下线" : "上线"}${esc(name)}"`, "ma-button")}
          ${button("archive", "", "archive", `data-id="${id}" aria-label="归档${esc(name)}" title="归档"`, "ma-button am-icon-action")}</div></td></tr>`;
    }).join("") || `<tr><td colspan="7"><div class="ma-template-empty" role="status">${icon("search")}<p>未找到匹配的实验分析模块</p>${button("reset-filters", "清空筛选", "", "", "ma-button text")}</div></td></tr>`;
    outlet.querySelector(".am-page-info").textContent = `第 ${page} / ${pages} 页`;
    outlet.querySelector('[data-action="mod-prev-page"]').disabled = page === 1;
    outlet.querySelector('[data-action="mod-next-page"]').disabled = page === pages;
    createIcons({ icons });
  }
  function options() {
    return [
      ...moduleBuiltins.map((source) => ({ key: `rpc:${source.id}:1`, name: source.name })),
      ...store.abilities.flatMap((ability) => ability.versions.map((version) => ({
        key: `sql:${ability.id}:${version.number}`, name: `${version.name} · v${version.number}`
      })))
    ];
  }
  const optionKey = (source) => `${source.kind}:${source.capabilityId}:${source.version}`;
  const calculationTypes = [["/", "相除（A ÷ B）"], ["+", "相加（A + B）"], ["-", "相减（A − B）"], ["*", "相乘（A × B）"]];
  const operatorLabel = operator => ({ "/": "÷", "+": "+", "-": "−", "*": "×" })[operator] || "÷";
  function calculationPicker(metric, operand, candidates) {
    const ref = metric.formula[operand], key = metric.key;
    if (ref?.type === "constant") return `<div class="am-calc-constant"><input type="number" step="any" data-model="mod-calc.value" data-key="${key}" aria-label="${esc(metric.name || "计算指标")}固定数值" placeholder="输入数值" value="${esc(ref.value ?? "")}">
      ${button("calc-use-metric", "", "list-filter", `data-key="${key}" title="改选指标" aria-label="改选指标"`)}</div>`;
    const current = candidates.find(candidate => metricReferenceKey(candidate.ref) === metricReferenceKey(ref));
    return `<details class="am-multi-select am-calc-picker"><summary aria-label="${operand === "left" ? "指标 A" : "指标 B 或数值"}"><span>${esc(current?.name || (ref ? `已失效：${ref.key}` : "选择指标"))}</span>${icon("chevron-down")}</summary>
      <div class="am-picker-menu"><label class="am-search">${icon("search")}<input type="search" data-model="mod-calc-search" placeholder="搜索指标或取数能力" aria-label="搜索计算输入指标"></label>
        <div class="am-calc-options">${operand === "right" ? button("calc-constant", "使用固定数值", "hash", `data-key="${key}"`, "am-calc-constant-choice") : ""}
        ${[...new Set(candidates.map(candidate => candidate.ref.sourceId))].map(sourceId => {
          const group = candidates.filter(candidate => candidate.ref.sourceId === sourceId);
          return `<div class="am-calc-option-group"><strong>${esc(group[0].sourceName)} · v${group[0].ref.version}</strong>${group.map(candidate =>
            `<button type="button" data-action="mod-calc-select" data-key="${key}" data-operand="${operand}" data-ref="${esc(encodeURIComponent(JSON.stringify(candidate.ref)))}" data-search="${esc(`${candidate.name} ${candidate.sourceName} ${candidate.ref.key}`.toLowerCase())}" aria-pressed="${metricReferenceKey(ref) === metricReferenceKey(candidate.ref)}"><span>${esc(candidate.name)}</span>${metricReferenceKey(ref) === metricReferenceKey(candidate.ref) ? icon("check") : ""}</button>`).join("")}</div>`;
        }).join("")}<p class="am-calc-search-empty" ${candidates.length ? "hidden" : ""}>没有可选的数值指标</p></div></div></details>`;
  }
  function calculationsHTML() {
    const module = store.analysis, metrics = module.calculatedMetrics || [];
    if (!module.sources.length && !metrics.length) return "";
    const candidates = calculationCandidates(store, module);
    return `<section class="am-calculations" aria-label="计算指标">
      <header><strong>计算指标 <span>（可选）</span></strong>${button("calc-add", "添加计算指标", "plus", candidates.length ? "" : 'disabled title="当前取数能力暂无可计算指标"')}</header>
      ${metrics.length ? `<div class="am-calc-head"><span></span><span>指标名称</span><span>计算类型</span><span>表达式</span><span>操作</span></div><div class="am-calc-rows">${metrics.map((metric, index) => `<div class="am-calc-row" data-calculation-key="${metric.key}" ${orderAttrs("metrics", calculationBlockId, metric.key)}>
        ${orderGrip("metrics", calculationBlockId, metric.key, metric.name || "计算指标")}
        <div class="am-calc-cell"><span class="am-calc-mobile-label">指标名称</span><input data-model="mod-calc.name" data-key="${metric.key}" aria-label="计算指标名称" value="${esc(metric.name)}" placeholder="输入指标名称"></div>
        <div class="am-calc-cell"><span class="am-calc-mobile-label">计算类型</span><select data-model="mod-calc.operator" data-key="${metric.key}" aria-label="计算类型">${calculationTypes.map(([value, label]) => `<option value="${value}" ${metric.formula.operator === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        <div class="am-calc-cell"><span class="am-calc-mobile-label">表达式</span><div class="am-calc-expression">${calculationPicker(metric, "left", candidates)}<span class="am-calc-sign">${operatorLabel(metric.formula.operator)}</span>${calculationPicker(metric, "right", candidates)}</div></div>
        <div class="am-calc-row-actions">
          ${button("order-move", "", "arrow-up", `${orderAttrs("metrics", calculationBlockId, metric.key)} data-direction="-1" aria-label="上移${esc(metric.name || "计算指标")}" ${index === 0 ? "disabled" : ""}`)}
          ${button("order-move", "", "arrow-down", `${orderAttrs("metrics", calculationBlockId, metric.key)} data-direction="1" aria-label="下移${esc(metric.name || "计算指标")}" ${index === metrics.length - 1 ? "disabled" : ""}`)}
          <details class="am-multi-select am-calc-more"><summary aria-label="${esc(metric.name || "计算指标")}更多设置" title="更多设置">${icon("ellipsis")}</summary><div class="am-picker-menu">
          <label class="am-field"><span>显示格式</span><select data-model="mod-calc.format" data-key="${metric.key}" aria-label="计算指标显示格式"><option value="number" ${metric.format === "number" ? "selected" : ""}>数值</option><option value="percent" ${metric.format === "percent" ? "selected" : ""}>百分比</option></select></label>
          <label class="am-field"><span>小数位</span><select data-model="mod-calc.precision" data-key="${metric.key}" aria-label="计算指标小数位">${Array.from({ length: 7 }, (_, precision) => `<option value="${precision}" ${metric.precision === precision ? "selected" : ""}>${precision} 位</option>`).join("")}</select></label>
          <label class="am-report-check"><input type="checkbox" data-model="mod-calc.report" data-key="${metric.key}" ${metric.showInReport ? "checked" : ""}>报告中展示</label></div></details>
          ${button("calc-delete", "", "trash-2", `data-key="${metric.key}" title="删除计算指标" aria-label="删除${esc(metric.name || "计算指标")}"`)}</div>
        <div class="am-calc-issues" role="status"></div></div>`).join("")}</div>` : `<p class="am-calc-hint">${candidates.length ? "用已选取数能力的指标进行基础计算。" : "当前取数能力暂无可计算指标"}</p>`}
      </section>`;
  }
  function refreshCalculations() {
    const container = outlet.querySelector(".am-calculations-wrap");
    if (!container) return;
    container.innerHTML = calculationsHTML(); refreshReportOrder(); refreshConfigurationVisibility(); refreshCalculationIssues(); createIcons({ icons });
  }
  function refreshCalculationIssues() {
    const issues = calculatedMetricIssues(store, store.analysis);
    outlet.querySelectorAll(".am-calc-row").forEach(row => {
      const messages = issues.filter(issue => issue.key === row.dataset.calculationKey).map(issue => issue.message);
      row.classList.toggle("invalid", messages.length > 0);
      row.querySelector(".am-calc-issues").innerHTML = [...new Set(messages)].map(message => `<p>${esc(message)}</p>`).join("");
      row.querySelector('[data-model="mod-calc.name"]').setAttribute("aria-invalid", String(messages.length > 0));
    });
    refreshActions();
  }
  function renderPicker() {
    const module = store.analysis;
    const chosen = options().filter((option) => module.sources.some((source) => optionKey(source) === option.key));
    return `<div class="am-source-picker"><label class="am-label">取数模块</label><details class="am-multi-select">
      <summary><span>${esc(chosen.map((option) => option.name).join("，") || "请选择取数模块")}</span>${icon("chevron-down")}</summary>
      <div class="am-picker-menu"><label class="am-search">${icon("search")}<input type="search" data-model="mod-option-search" placeholder="搜索取数模块" aria-label="搜索取数模块"></label><div class="am-picker-options">
      ${options().map((option) => `<label class="am-picker-option" data-option-name="${esc(option.name)}"><input type="checkbox" data-model="mod-source-choice" value="${option.key}" ${chosen.some((entry) => entry.key === option.key) ? "checked" : ""}><span>${esc(option.name)}</span></label>`).join("")}
      </div></div></details>${module.sources.length ? button("clear-sources", "", "x", 'aria-label="清空取数模块" title="清空"') : ""}</div>`;
  }
  function orderChips(kind, blockId, fields) {
    return fields.length ? fields.map(field => `<button type="button" class="am-chip am-order-chip" draggable="true" ${orderAttrs(kind, blockId, field.key)}
      title="拖拽排序，或用方向键调整"${field.showInReport === false ? ' data-report-hidden="true"' : ""}>${icon("grip-vertical")}<span>${esc(field.name || "未命名计算指标")}</span>${field.showInReport === false ? '<small>不展示</small>' : ""}</button>`).join("") : `<small>暂未选择${kind === "metrics" ? "指标" : "维度"}</small>`;
  }
  function sourceSummary(source) {
    const definition = sourceDefinition(store, source);
    if (!definition) return "<p>固定版本已不可用，请移除后重新选择。</p>";
    const metrics = orderReportMetrics(store.analysis, source.id, definition.metrics.filter(field => source.metricKeys.includes(field.key)));
    const dimensions = orderReportDimensions(store.analysis, source.id, definition.dimensions.filter(field => source.dimensionKeys.includes(field.key)));
    return `<div><span>指标</span><div>${orderChips("metrics", source.id, metrics)}</div></div>${definition.dimensions.length ? `<div><span>维度</span><div>${orderChips("dimensions", source.id, dimensions)}</div></div>` : ""}`;
  }
  function calculationDimensionNames() {
    const module = store.analysis;
    const grainsFor = ref => {
      if (!ref || ref.type !== "metric") return [];
      const source = module.sources.find(source => source.id === ref.sourceId);
      return source && source.metricKeys.includes(ref.key) ? sourceMetricGrains(source, sourceDefinition(store, source), ref.key) : [];
    };
    return [...new Set((module.calculatedMetrics || []).flatMap(metric =>
      commonCalculationGrains(grainsFor(metric.formula?.left),
        metric.formula?.right?.type === "constant" ? null : grainsFor(metric.formula?.right)).map(({ left }) => {
        const source = module.sources.find(source => source.id === left.sourceId);
        return sourceDefinition(store, source)?.dimensions.find(dimension => dimension.key === left.modeId)?.name || "整体";
      })))];
  }
  function reportOrderHTML() {
    const module = store.analysis, blocks = reportBlockIds(module);
    if (!blocks.length) return "";
    return `<section class="am-report-order" aria-label="指标与维度及报告顺序">
      <header><strong>指标 × 维度</strong><span>拖拽调整报告展示顺序</span></header>
      <div class="am-order-blocks">${blocks.map((blockId, index) => {
        const source = module.sources.find(source => source.id === blockId);
        const name = source ? sourceDefinition(store, source)?.name || "固定版本已不可用" : "计算指标";
        return `<article class="am-order-block" ${orderAttrs("blocks", blockId, blockId)}>
          <header>${orderGrip("blocks", blockId, blockId, name)}<strong>${esc(name)}</strong>${source?.showInReport === false ? '<span class="am-order-hidden">不在报告中展示</span>' : ""}
            <div class="am-order-block-actions">${button("order-move", "", "arrow-up", `${orderAttrs("blocks", blockId, blockId)} data-direction="-1" aria-label="上移${esc(name)}" ${index === 0 ? "disabled" : ""}`)}${button("order-move", "", "arrow-down", `${orderAttrs("blocks", blockId, blockId)} data-direction="1" aria-label="下移${esc(name)}" ${index === blocks.length - 1 ? "disabled" : ""}`)}</div></header>
          <div class="am-selection-summary">${source ? sourceSummary(source) : `<div><span>指标</span><div>${orderChips("metrics", calculationBlockId, module.calculatedMetrics)}</div></div><div><span>维度</span><div>${calculationDimensionNames().map(name => `<span class="am-chip">${esc(name)}</span>`).join("") || "<small>配置表达式后显示</small>"}</div></div>`}</div>
        </article>`;
      }).join("")}</div><p class="am-order-status" aria-live="polite"></p></section>`;
  }
  function refreshReportOrder() {
    const container = outlet.querySelector(".am-report-order-wrap");
    if (container) { container.innerHTML = reportOrderHTML(); createIcons({ icons }); }
  }
  function metricConfigurationHTML() {
    const module = store.analysis, active = configurationTabs.get(module.id) || "existing";
    return `<section class="am-metric-configuration" aria-label="指标配置"${!module.sources.length && !module.calculatedMetrics?.length ? " hidden" : ""}>
      <header><strong>指标配置</strong><div class="am-configuration-tabs" role="tablist" aria-label="指标配置方式">
        ${[["existing", "已有指标"], ["calculated", "计算指标"]].map(([key, label]) => `<button type="button" role="tab" id="am-tab-${key}" data-action="mod-configuration-tab" data-tab="${key}" aria-controls="am-panel-${key}" aria-selected="${active === key}" tabindex="${active === key ? 0 : -1}">${label}</button>`).join("")}</div></header>
      <div class="am-sources" id="am-panel-existing" role="tabpanel" aria-labelledby="am-tab-existing"${active !== "existing" ? " hidden" : ""}>${module.sources.map(sourceCard).join("") || '<p class="am-calc-hint">先选择取数模块，再选择指标和维度。</p>'}</div>
      <div class="am-calculations-wrap" id="am-panel-calculated" role="tabpanel" aria-labelledby="am-tab-calculated"${active !== "calculated" ? " hidden" : ""}>${calculationsHTML()}</div></section>`;
  }
  function refreshConfigurationVisibility() {
    const module = store.analysis, area = outlet.querySelector(".am-metric-configuration");
    if (!area) return;
    area.hidden = !module.sources.length && !module.calculatedMetrics?.length;
    const active = configurationTabs.get(module.id) || "existing";
    area.querySelectorAll('[role="tab"]').forEach(tab => {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === active));
      tab.tabIndex = tab.dataset.tab === active ? 0 : -1;
    });
    outlet.querySelector(".am-sources").hidden = active !== "existing";
    outlet.querySelector(".am-calculations-wrap").hidden = active !== "calculated";
  }
  function orderKeys(kind, blockId) {
    const module = store.analysis;
    if (kind === "blocks") return reportBlockIds(module);
    if (blockId === calculationBlockId) return module.calculatedMetrics.map(metric => metric.key);
    const source = module.sources.find(source => source.id === blockId), definition = source && sourceDefinition(store, source);
    if (!definition) return [];
    return (kind === "metrics" ? orderReportMetrics(module, blockId, definition.metrics.filter(field => source.metricKeys.includes(field.key)))
      : orderReportDimensions(module, blockId, definition.dimensions.filter(field => source.dimensionKeys.includes(field.key)))).map(field => field.key);
  }
  function reorder(kind, blockId, key, target, focusSelector = "") {
    const module = store.analysis, next = moveOrderedKey(orderKeys(kind, blockId), key, target);
    if (!next) return;
    if (kind === "metrics" && blockId === calculationBlockId) {
      module.calculatedMetrics = next.map(key => module.calculatedMetrics.find(metric => metric.key === key));
      touch(); refreshCalculations();
    } else {
      module.reportOrder ||= {};
      if (kind === "blocks") module.reportOrder.blocks = next;
      else { module.reportOrder[kind] ||= {}; module.reportOrder[kind][blockId] = next; }
      touch(); refreshReportOrder(); refreshActions();
    }
    const status = outlet.querySelector(".am-order-status");
    if (status) status.textContent = "报告展示顺序已更新";
    if (focusSelector) outlet.querySelector(focusSelector)?.focus({ preventScroll: true });
  }
  function sourceCard(source) {
    const module = store.analysis, definition = sourceDefinition(store, source);
    if (!definition) return `<article class="am-source-card" data-source-id="${source.id}"><header><strong>固定版本已不可用</strong>${button("remove-source", "移除", "trash-2", `data-id="${source.id}"`)}</header></article>`;
    const list = (kind, fields, selected) => `<section class="am-choice-column ${kind}"><header><div><strong>${kind === "metric" ? "指标" : "下钻维度"}</strong><span class="am-choice-count">已选 ${selected.length}/${fields.length}</span></div>
      ${fields.length ? button("all", selected.length === fields.length ? "清空" : "全选", "", `data-id="${source.id}" data-kind="${kind}"`) : ""}</header>
      ${fields.length ? `<label class="am-search">${icon("search")}<input type="search" data-model="mod-choice-search" data-kind="${kind}" data-source-id="${source.id}" aria-label="搜索${kind === "metric" ? "指标" : "下钻维度"}" placeholder="${kind === "metric" ? "搜索指标名称、Key 或口径" : "搜索下钻维度名称或 Key"}"></label>
      <div class="am-choice-list">${fields.map((field) => `<label class="am-choice" data-search-text="${esc(`${field.name} ${field.key} ${field.description || ""}`.toLowerCase())}"><input type="checkbox" data-model="mod-choice" data-source-id="${source.id}" data-kind="${kind}" value="${esc(field.key)}" ${selected.includes(field.key) ? "checked" : ""}><span><strong>${esc(field.name)}</strong>${kind === "metric" && field.description ? `<small>${esc(field.description)}</small>` : ""}</span></label>`).join("")}<p class="am-search-empty" hidden>暂无匹配项</p></div>` : `<p class="am-no-dimensions">暂无下钻维度</p>`}</section>`;
    return `<article class="am-source-card ${source.expanded ? "expanded" : ""}" data-source-id="${source.id}">
      <header><button type="button" class="am-source-title" data-action="mod-expand" data-id="${source.id}" aria-expanded="${source.expanded}"><strong>${esc(definition.name)}</strong><span class="am-selected-count">已选 ${source.metricKeys.length} 个指标${definition.dimensions.length ? ` · ${source.dimensionKeys.length} 个维度` : ""}</span>${source.kind === "sql" ? `<span class="am-version-tag">v${source.version}</span>` : ""}</button>
      <div class="am-source-actions"><label class="am-report-check"><input type="checkbox" data-model="mod-report" data-source-id="${source.id}" ${source.showInReport ? "checked" : ""}>报告中展示</label>
      ${module.analysisType !== "multi" ? button("trial-source", "试跑取数", "flask-conical", `data-id="${source.id}" ${running || moduleIssues(store, { ...module, name: module.name || "新模块" }, [source], { sourceTrial: true }).length ? "disabled" : ""}`) : ""}
      ${button("expand", source.expanded ? "收起" : "展开", source.expanded ? "chevron-up" : "chevron-down", `data-id="${source.id}" aria-expanded="${source.expanded}" aria-controls="source-content-${source.id}"`)}
      ${button("remove-source", "移除", "trash-2", `data-id="${source.id}"`)}</div></header>
      <div class="am-source-content" id="source-content-${source.id}" ${source.expanded ? "" : "hidden"}>
        <p class="am-source-description">${esc(definition.description)}</p>
        <div class="am-selection-columns">${list("metric", definition.metrics, source.metricKeys)}${list("dimension", definition.dimensions, source.dimensionKeys)}</div>
      </div></article>`;
  }
  function renderEditor(id) {
    if (id === "new") {
      const module = newAnalysisModule();
      store.modules.push(module); store.analysis = module; persist();
      history.replaceState(null, "", `#/modules/${module.id}`);
    } else if (!activate(id)) { location.hash = "/modules"; return; }
    const module = store.analysis, status = moduleState(module);
    const latest = module.versions.at(-1);
    const changed = latest && latest.signature !== moduleHash(module);
    outlet.innerHTML = `<div class="am-editor">
      <header class="am-editor-header"><div class="am-editor-heading"><a href="#/modules" class="am-button am-back" aria-label="返回实验分析模块">${icon("arrow-left")}</a><div><div class="am-heading-line"><h1>${esc(module.name || "新建实验分析模块")}</h1><span class="am-state ${status}">${!module.savedAt ? "尚未保存" : changed ? "有未发布修改" : latest ? `v${latest.number} · ${stateNames[status]}` : "草稿"}</span></div><p>实验分析模块</p></div></div>
      <div class="am-header-actions">${button("save", "保存草稿", "save")}${button("trial", "试跑", "flask-conical", running || moduleIssues(store, module).length || !module.reasoning.trim() ? "disabled" : "")}${button("publish", "发布新版本", "upload", running ? "disabled" : "", "primary")}</div></header>
      <div class="am-editor-body"><div class="am-form-content"><div class="am-errors">${errors.length ? `<div class="p-issues" role="alert"><ul>${errors.map((error) => `<li>${esc(error)}</li>`).join("")}</ul></div>` : ""}</div>
        <div class="am-basics">${field("模块名称", "name", module.name, "例如：优惠券核销归因")}${field("模块说明", "description", module.description, "说明模块覆盖的分析范围")}
        <div class="am-field"><span>业务目标</span><div class="am-goal">${businessGoal}${icon("chevron-down")}</div></div>
        <label class="am-field"><span>适用端（可选）</span><select data-model="mod-apps"><option value="" ${!module.apps.length ? "selected" : ""}>不选择表示不限端</option><option value="抖音" ${module.apps.join(",") === "抖音" ? "selected" : ""}>抖音</option><option value="极速版" ${module.apps.join(",") === "极速版" ? "selected" : ""}>极速版</option><option value="抖音,极速版" ${module.apps.length > 1 ? "selected" : ""}>抖音、极速版</option></select></label>
        <label class="am-field"><span>分析类型</span><select data-model="mod-field.analysisType"><option value="single" ${module.analysisType === "single" ? "selected" : ""}>单实验分析</option><option value="multi" ${module.analysisType === "multi" ? "selected" : ""}>多实验分析</option></select></label></div>
        <div class="am-picker-wrap">${renderPicker()}</div><div class="am-report-order-wrap">${reportOrderHTML()}</div>
        ${metricConfigurationHTML()}
        ${area("分析思路（可选）", "reasoning", module.reasoning, "如需结论，请说明分析顺序、判断方法和归因证据的组织方式")}
        ${area("注意事项（可选）", "considerations", module.considerations, "补充分析边界、数据口径及需要关注的问题")}
        ${module.attempts.length ? `<details class="am-trial-history"><summary>试跑记录 <span>${module.attempts.length}</span></summary><div>${module.attempts.map((attempt) => `<a href="#/analysis/${attempt.id}"><span>${attempt.sourceTrial ? "取数试跑" : "分析试跑"} · ${attempt.status === "success" ? "成功" : attempt.status === "running" ? "运行中" : "失败"}</span><small>${esc(time(attempt.startedAt))}</small>${icon("arrow-up-right")}</a>`).join("")}</div></details>` : ""}
        ${module.multiAttempts?.length ? `<details class="am-trial-history"><summary>多实验试跑记录 <span>${module.multiAttempts.length}</span></summary><div>${module.multiAttempts.map(attempt => `<a href="${attempt.reportId ? `#/report/${attempt.reportId}` : `#/experiments/task/${attempt.taskId}`}"><span>模块私有试跑 · ${attempt.status === "running" ? "运行中" : attempt.status === "success" ? "成功" : "查看任务"}</span><small>${esc(time(attempt.startedAt))}</small></a>`).join("")}</div></details>` : ""}
      </div><aside class="am-version-panel"><header><strong>版本记录</strong><span>${module.versions.length} 个版本</span></header>
        ${module.versions.length ? module.versions.slice().reverse().map((version) => `<button type="button" data-action="mod-version" data-number="${version.number}"><strong>v${version.number}</strong><small>${esc(time(version.publishedAt))}</small><span>${esc(version.operator)}</span></button>`).join("") : "<p>暂无版本记录</p>"}</aside></div></div>`;
    refreshCalculationIssues(); createIcons({ icons });
  }
  function refreshSources() {
    outlet.querySelector(".am-sources").innerHTML = store.analysis.sources.map(sourceCard).join("") || '<p class="am-calc-hint">先选择取数模块，再选择指标和维度。</p>';
    outlet.querySelector(".am-picker-wrap").innerHTML = renderPicker();
    refreshCalculations(); createIcons({ icons }); refreshActions();
  }
  function refreshActions() {
    const module = store.analysis;
    const trial = outlet.querySelector('[data-action="mod-trial"]');
    if (trial) trial.disabled = running || moduleIssues(store, module).length > 0 || !module.reasoning.trim();
    const publish = outlet.querySelector('[data-action="mod-publish"]');
    if (publish) publish.disabled = running || calculatedMetricIssues(store, module).length > 0;
    const h1 = outlet.querySelector(".am-heading-line h1");
    if (h1) h1.textContent = module.name || "新建实验分析模块";
    const status = outlet.querySelector(".am-heading-line .am-state"), latest = module.versions.at(-1);
    if (status) status.textContent = !module.savedAt ? "尚未保存"
      : latest && latest.signature !== moduleHash(module) ? "有未发布修改"
      : latest ? `v${latest.number} · ${stateNames[moduleState(module)]}` : "草稿";
  }
  function refreshSelection(source) {
    const card = outlet.querySelector(`.am-source-card[data-source-id="${source.id}"]`), definition = sourceDefinition(store, source);
    refreshReportOrder();
    card.querySelector(".am-selected-count").textContent = `已选 ${source.metricKeys.length} 个指标${definition.dimensions.length ? ` · ${source.dimensionKeys.length} 个维度` : ""}`;
    for (const [kind, fields, selected] of [["metric", definition.metrics, source.metricKeys], ["dimension", definition.dimensions, source.dimensionKeys]]) {
      const column = card.querySelector(`.am-choice-column.${kind}`);
      column.querySelector(".am-choice-count").textContent = `已选 ${selected.length}/${fields.length}`;
      const all = column.querySelector('[data-action="mod-all"]');
      if (all) all.textContent = selected.length === fields.length ? "清空" : "全选";
      column.querySelectorAll("input[type=checkbox]").forEach((input) => { input.checked = selected.includes(input.value); });
    }
    const sourceTrial = card.querySelector('[data-action="mod-trial-source"]');
    if (sourceTrial) sourceTrial.disabled = running
      || moduleIssues(store, { ...store.analysis, name: store.analysis.name || "新模块" }, [source], { sourceTrial: true }).length > 0;
    refreshCalculationIssues();
  }
  const touch = () => { pruneModuleReportOrder(store.analysis); store.analysis.updatedAt = new Date().toISOString(); persist(); };
  async function startTrial(sourceId = "") {
    if (running) return;
    running = true;
    try {
      await runModule(store, store.analysis, (attempt) => {
        persist();
        if (location.hash !== `#/analysis/${attempt.id}`) location.hash = `/analysis/${attempt.id}`;
        else render();
      }, sourceId);
    } catch (error) { showToast(error.message); }
    finally { running = false; render(); }
  }
  async function handleAction(trigger) {
    const action = trigger.dataset.action.slice(4), id = trigger.dataset.id;
    if (action === "prev-page" || action === "next-page") {
      page += action === "prev-page" ? -1 : 1;
      renderListResults(); return;
    }
    if (action === "reset-filters") {
      search = ""; creator = ""; state = "all"; type = "all"; sort = "updated"; page = 1;
      renderList(); outlet.querySelector('[data-model="mod-search"]').focus(); return;
    }
    if (action === "filter-creator") {
      creator = trigger.dataset.creator; page = 1;
      const menu = outlet.querySelector(".am-creator-filter");
      menu.querySelector("summary > span").textContent = creator ? creatorLabel(store.modules.find(module => creatorOf(module) === creator) || {}) : "全部创建人";
      menu.querySelector("input").value = "";
      renderCreatorOptions();
      renderListResults();
      menu.open = false;
      menu.querySelector("summary").focus({ preventScroll: true });
      return;
    }
    const module = store.analysis, source = module.sources.find((source) => source.id === id);
    if (action === "new") { location.hash = "/modules/new"; return; }
    if (action === "copy") {
      const original = activate(id), copy = clone(original);
      Object.assign(copy, { id: uid("module"), key: "", name: `${copy.name}（副本）`, createdBy: currentActor, savedAt: "",
        updatedAt: new Date().toISOString(), versions: [], attempts: [], multiAttempts: [], enabled: true, archived: false });
      const remapped = copyModuleSources(original);
      copy.sources = remapped.sources; copy.calculatedMetrics = remapped.calculatedMetrics;
      if (remapped.reportOrder) copy.reportOrder = remapped.reportOrder;
      store.modules.push(copy); store.analysis = copy; persist(); location.hash = `/modules/${copy.id}`; return;
    }
    if (action === "archive") {
      const target = store.modules.find((entry) => entry.id === id);
      openDialog("归档实验分析模块", `<p>归档“${esc(target.name)}”后，将从有效配置列表移除。历史版本和试跑记录保留。</p>`,
        button("cancel", "取消") + button("confirm-archive", "确认归档", "", `data-id="${id}"`)); return;
    }
    if (action === "confirm-archive") {
      store.modules.find((entry) => entry.id === id).archived = true;
      persist(); closeDialog(); render(); showToast("模块已归档"); return;
    }
    if (action === "cancel") { closeDialog(); return; }
    if (action === "configuration-tab") {
      configurationTabs.set(module.id, trigger.dataset.tab);
      refreshConfigurationVisibility(); return;
    }
    if (action === "order-move") {
      const { orderKind: kind, orderBlock: blockId, orderKey: key } = trigger.dataset;
      const keys = orderKeys(kind, blockId), target = keys[keys.indexOf(key) + Number(trigger.dataset.direction)];
      const selector = kind === "metrics" && blockId === calculationBlockId && trigger.closest(".am-calc-row")
        ? `.am-calc-row [data-action="mod-order-move"][data-order-key="${CSS.escape(key)}"][data-direction="${trigger.dataset.direction}"]`
        : `.am-order-grip[data-order-key="${CSS.escape(key)}"]`;
      reorder(kind, blockId, key, target, selector); return;
    }
    if (action.startsWith("calc-")) {
      const metric = module.calculatedMetrics.find(metric => metric.key === trigger.dataset.key);
      if (action === "calc-add") {
        if (!calculationCandidates(store, module).length) return;
        const added = newCalculatedMetric(); module.calculatedMetrics.push(added);
        touch(); refreshCalculations();
        outlet.querySelector(`[data-calculation-key="${added.key}"] input`).focus(); return;
      }
      if (!metric) return;
      if (action === "calc-delete") module.calculatedMetrics = module.calculatedMetrics.filter(entry => entry !== metric);
      if (action === "calc-constant") metric.formula.right = { type: "constant", value: null };
      if (action === "calc-use-metric") metric.formula.right = null;
      if (action === "calc-select") {
        const ref = JSON.parse(decodeURIComponent(trigger.dataset.ref));
        try {
          const included = includeCalculationDependency(store, module, ref);
          metric.formula[trigger.dataset.operand] = ref;
          if (included.added) {
            refreshSelection(module.sources.find(source => source.id === included.sourceId));
            showToast("已加入取数指标");
          }
        } catch (error) { showToast(error.message); return; }
      }
      touch(); refreshCalculations();
      const row = outlet.querySelector(`[data-calculation-key="${metric.key}"]`);
      if (action === "calc-constant") row?.querySelector('[data-model="mod-calc.value"]')?.focus();
      else if (action === "calc-select") row?.querySelectorAll(".am-calc-picker summary")[trigger.dataset.operand === "left" ? 0 : 1]?.focus();
      else if (action === "calc-delete") outlet.querySelector('[data-action="mod-calc-add"]')?.focus();
      return;
    }
    if (action === "toggle-state") {
      const target = activate(id);
      if (!target.versions.length) { location.hash = `/modules/${id}`; showToast("发布版本后即可上线"); return; }
      target.enabled = !target.enabled; touch(); render(); showToast(target.enabled ? "模块已上线" : "模块已下线"); return;
    }
    if (action === "save") {
      if (!module.name.trim()) { errors = ["请填写模块名称。"]; renderEditor(module.id); return; }
      module.key ||= uid("analysis_module"); module.savedAt = new Date().toISOString();
      errors = []; touch(); renderEditor(module.id); showToast("草稿已保存"); return;
    }
    if (action === "publish") {
      errors = moduleIssues(store, module);
      if (errors.length) { renderEditor(module.id); return; }
      if (module.versions.at(-1)?.signature === moduleHash(module)) { showToast("当前配置已经发布"); return; }
      module.key ||= uid("analysis_module"); module.savedAt = new Date().toISOString();
      module.versions.push({ number: module.versions.length + 1, publishedAt: module.savedAt,
        operator: currentActor, signature: moduleHash(module), configuration: moduleConfiguration(module) });
      module.enabled = true; touch(); renderEditor(module.id); showToast(`已发布 v${module.versions.length}`); return;
    }
    if (action === "version") {
      const version = module.versions.find((version) => version.number === Number(trigger.dataset.number));
      openDialog(`版本 v${version.number}`, `<p>${esc(time(version.publishedAt))} · ${esc(version.operator)}</p><pre>${esc(JSON.stringify(version.configuration, null, 2))}</pre>`, button("cancel", "关闭")); return;
    }
    if (action === "expand") {
      source.expanded = !source.expanded; persist();
      const card = outlet.querySelector(`[data-source-id="${id}"]`);
      card.classList.toggle("expanded", source.expanded);
      card.querySelector(".am-source-content").hidden = !source.expanded;
      card.querySelector(".am-source-title").setAttribute("aria-expanded", String(source.expanded));
      const expand = card.querySelector('.am-source-actions [data-action="mod-expand"]');
      expand.innerHTML = `${icon(source.expanded ? "chevron-up" : "chevron-down")}${source.expanded ? "收起" : "展开"}`;
      expand.setAttribute("aria-expanded", String(source.expanded)); createIcons({ icons }); return;
    }
    if (action === "remove-source") { module.sources = module.sources.filter((entry) => entry.id !== id); touch(); refreshSources(); return; }
    if (action === "clear-sources") { module.sources = []; touch(); refreshSources(); return; }
    if (action === "all") {
      const kind = trigger.dataset.kind, definition = sourceDefinition(store, source);
      const key = kind === "metric" ? "metricKeys" : "dimensionKeys";
      const fields = kind === "metric" ? definition.metrics : definition.dimensions;
      source[key] = source[key].length === fields.length ? [] : fields.map((field) => field.key);
      touch(); refreshSelection(source); return;
    }
    if (action === "trial" || action === "trial-source") {
      if (module.analysisType === "multi") {
        const validation = moduleIssues(store, module);
        if (validation.length) { errors = validation; renderEditor(module.id); return; }
        location.hash = `/experiments/module/${module.id}`; return;
      }
      openDialog(action === "trial" ? "分析试跑" : "取数试跑",
        `<div class="am-context-grid">${Object.entries(module.context).map(([key, value]) => field(key === "libra_id" ? "Libra 实验 ID" : key === "start_date" ? "观测开始日期" : key === "end_date" ? "观测结束日期" : key, `context:${key}`, value)).join("")}</div>`,
        button("cancel", "取消") + button("start-trial", "开始试跑", "flask-conical", `data-id="${action === "trial-source" ? id : ""}"`, "primary")); return;
    }
    if (action === "start-trial") { closeDialog(); await startTrial(id); }
  }
  function handleModel(event) {
    const el = event.target, model = el.dataset.model;
    if (!model?.startsWith("mod-")) return false;
    const change = el.type === "checkbox" || el.tagName === "SELECT";
    if (change && event.type !== "change" || !change && event.type !== "input") return true;
    if (model === "mod-search") { search = el.value; page = 1; renderListResults(); return true; }
    if (model === "mod-creator-search") { renderCreatorOptions(el.value); return true; }
    if (model === "mod-page-size") { pageSize = Number(el.value); page = 1; renderListResults(); return true; }
    if (model === "mod-state" || model === "mod-sort" || model === "mod-type") { if (model === "mod-state") state = el.value; else if (model === "mod-type") type = el.value; else sort = el.value; page = 1; renderListResults(); return true; }
    const module = store.analysis;
    if (model === "mod-calc-search") {
      const picker = el.closest(".am-calc-picker"), query = el.value.trim().toLowerCase();
      picker.querySelectorAll("[data-search]").forEach(option => { option.hidden = !option.dataset.search.includes(query); });
      picker.querySelectorAll(".am-calc-option-group").forEach(group => { group.hidden = ![...group.querySelectorAll("[data-search]")].some(option => !option.hidden); });
      picker.querySelector(".am-calc-search-empty").hidden = [...picker.querySelectorAll("[data-search]")].some(option => !option.hidden);
      return true;
    }
    if (model.startsWith("mod-calc.")) {
      const metric = module.calculatedMetrics.find(metric => metric.key === el.dataset.key);
      if (!metric) return true;
      const field = model.slice(9);
      if (field === "operator") {
        metric.formula.operator = el.value;
        el.closest(".am-calc-row").querySelector(".am-calc-sign").textContent = operatorLabel(el.value);
      } else if (field === "value") metric.formula.right.value = el.value.trim() === "" ? null : Number(el.value);
      else if (field === "precision") metric.precision = Number(el.value);
      else if (field === "report") metric.showInReport = el.checked;
      else metric[field] = el.value;
      touch(); refreshReportOrder(); refreshCalculationIssues(); return true;
    }
    if (model.startsWith("mod-field.")) {
      const key = model.slice(10);
      if (key.startsWith("context:")) module.context[key.slice(8)] = el.value;
      else module[key] = el.value;
      touch(); if (key === "analysisType") refreshSources(); else refreshActions(); return true;
    }
    if (model === "mod-apps") { module.apps = el.value.split(",").filter(Boolean); touch(); return true; }
    if (model === "mod-option-search") {
      outlet.querySelectorAll(".am-picker-option").forEach((option) => { option.hidden = !option.dataset.optionName.toLowerCase().includes(el.value.toLowerCase()); }); return true;
    }
    if (model === "mod-source-choice") {
      if (el.checked) {
        const [kind, id, number] = el.value.split(":");
        const source = kind === "rpc" ? builtinSource(id) : sqlSource(store.abilities.find((a) => a.id === id),
          store.abilities.find((a) => a.id === id).versions.find((v) => v.number === Number(number)));
        source.expanded = true; module.sources.push(source);
      } else module.sources = module.sources.filter((source) => optionKey(source) !== el.value);
      touch();
      // Keep the multiple selection menu open and its search while updating selected cards.
      const menu = outlet.querySelector(".am-multi-select"), query = menu.querySelector('input[type="search"]').value;
      refreshSources();
      const next = outlet.querySelector(".am-multi-select"); next.open = true;
      const input = next.querySelector('input[type="search"]'); input.value = query;
      next.querySelectorAll(".am-picker-option").forEach((option) => { option.hidden = !option.dataset.optionName.toLowerCase().includes(query.toLowerCase()); });
      next.querySelector(`input[value="${el.value}"]`)?.focus({ preventScroll: true });
      return true;
    }
    if (model === "mod-choice-search") {
      const column = el.closest(".am-choice-column"), query = el.value.toLowerCase();
      const choices = [...column.querySelectorAll(".am-choice")];
      choices.forEach((choice) => { choice.hidden = !choice.dataset.searchText.includes(query); });
      column.querySelector(".am-search-empty").hidden = choices.some((choice) => !choice.hidden); return true;
    }
    const source = module.sources.find((source) => source.id === el.dataset.sourceId);
    if (model === "mod-report") { source.showInReport = el.checked; touch(); refreshReportOrder(); return true; }
    if (model === "mod-choice") {
      const key = el.dataset.kind === "metric" ? "metricKeys" : "dimensionKeys";
      source[key] = el.checked ? [...new Set([...source[key], el.value])] : source[key].filter((value) => value !== el.value);
      touch(); refreshSelection(source); return true;
    }
    return true;
  }
  document.addEventListener("pointerdown", (event) => {
    outlet.querySelectorAll(".am-multi-select[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; });
  });
  const clearOrderDrag = () => {
    outlet.querySelectorAll(".am-order-dragging, .am-order-drop-target").forEach(el => el.classList.remove("am-order-dragging", "am-order-drop-target"));
    draggedOrder = null;
  };
  const dropTarget = event => {
    if (!draggedOrder) return null;
    const selector = draggedOrder.kind === "blocks" ? ".am-order-block" : ".am-order-chip, .am-calc-row";
    const target = event.target.closest(selector);
    if (!target || target.dataset.orderKind !== draggedOrder.kind
      || (draggedOrder.kind !== "blocks" && target.dataset.orderBlock !== draggedOrder.block)
      || target.dataset.orderKey === draggedOrder.key) return null;
    return target;
  };
  outlet.addEventListener("dragstart", event => {
    const grip = event.target.closest('[draggable="true"][data-order-kind]');
    if (!grip) return;
    draggedOrder = { kind: grip.dataset.orderKind, block: grip.dataset.orderBlock, key: grip.dataset.orderKey,
      fromRow: Boolean(grip.closest(".am-calc-row")) };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedOrder.key);
    (grip.closest(".am-order-chip, .am-calc-row, .am-order-block") || grip).classList.add("am-order-dragging");
  });
  outlet.addEventListener("dragover", event => {
    const target = dropTarget(event);
    outlet.querySelectorAll(".am-order-drop-target").forEach(el => el.classList.remove("am-order-drop-target"));
    if (!target) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
    target.classList.add("am-order-drop-target");
  });
  outlet.addEventListener("drop", event => {
    const target = dropTarget(event), dragged = draggedOrder;
    if (!target) { clearOrderDrag(); return; }
    event.preventDefault();
    const targetKey = target.dataset.orderKey;
    clearOrderDrag();
    const selector = dragged.fromRow ? `.am-calc-row .am-order-grip[data-order-key="${CSS.escape(dragged.key)}"]`
      : `.am-report-order [draggable="true"][data-order-key="${CSS.escape(dragged.key)}"][data-order-kind="${dragged.kind}"]`;
    reorder(dragged.kind, dragged.block, dragged.key, targetKey, selector);
  });
  outlet.addEventListener("dragend", clearOrderDrag);
  outlet.addEventListener("keydown", (event) => {
    const tab = event.target.closest('.am-configuration-tabs [role="tab"]');
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const key = event.key === "Home" ? "existing" : event.key === "End" ? "calculated"
        : tab.dataset.tab === "existing" ? "calculated" : "existing";
      configurationTabs.set(store.analysis.id, key); refreshConfigurationVisibility();
      outlet.querySelector(`#am-tab-${key}`).focus(); return;
    }
    const grip = event.target.closest('[draggable="true"][data-order-kind]');
    if (grip && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const { orderKind: kind, orderBlock: block, orderKey: key } = grip.dataset;
      const keys = orderKeys(kind, block), direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      const selector = grip.closest(".am-calc-row") ? `.am-calc-row .am-order-grip[data-order-key="${CSS.escape(key)}"]`
        : `.am-report-order [draggable="true"][data-order-key="${CSS.escape(key)}"][data-order-kind="${kind}"]`;
      reorder(kind, block, key, keys[keys.indexOf(key) + direction], selector); return;
    }
    if (event.key !== "Escape") return;
    clearOrderDrag();
    const menu = outlet.querySelector(".am-multi-select[open]");
    if (menu) { menu.open = false; menu.querySelector("summary").focus(); }
  });
  return {
    activate, handleAction, handleModel,
    render(id) {
      main.classList.add("am-page"); outlet.classList.add("am-outlet");
      if (id) renderEditor(id); else renderList();
    }
  };
}
