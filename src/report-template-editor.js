import { sourceDefinition } from "./analysis-module-data.js";
import { templateChanged, templateModuleCandidates, analysisTypes } from "./multi-experiment-data.js";
import "./report-template-editor.css";
import { sectionIdentity, normalizeDirectory } from "./report-directory-data.js";
import { directoryEditorHTML } from "./report-directory-ui.js";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = name => `<i data-lucide="${name}"></i>`;
const button = (action, text, attrs = "", cls = "") => `<button type="button" class="ma-button ${cls}" data-action="ma-${action}" ${attrs}>${text}</button>`;
const badge = text => `<span class="mt-badge">${esc(text)}</span>`;
const options = (entries, selected) => entries.map(([value, name]) => `<option value="${esc(value)}" ${selected === value ? "selected" : ""}>${esc(name)}</option>`).join("");
const field = (label, model, value, placeholder) => `<label class="mt-field"><span>${label}</span><input data-model="ma-template-${model}" value="${esc(value)}" placeholder="${placeholder}"></label>`;

export function templateEditorStatus(template) {
  const last = template.versions.at(-1);
  return !template.savedAt && !template.updatedAt ? "尚未保存"
    : last ? templateChanged(template) ? "有未发布修改" : `v${last.number} · ${template.enabled ? "已上线" : "已下线"}` : "草稿";
}

export function templateModuleOptions(store, template) {
  return templateModuleCandidates(store, template);
}

export function templateModuleSummary(store, section) {
  const module = store.modules.find(module => module.id === section.moduleId);
  const version = module?.versions.find(version => version.number === section.version);
  const configuration = version?.configuration;
  const metrics = new Map(), dimensions = new Map();
  for (const source of configuration?.sources || []) {
    if (source.showInReport === false) continue;
    const definition = sourceDefinition(store, source);
    for (const metric of definition?.metrics || []) {
      if (source.metricKeys.includes(metric.key)) metrics.set(`${source.capabilityId}:${metric.key}`, metric.name);
    }
    for (const dimension of definition?.dimensions || []) {
      if (source.dimensionKeys.includes(dimension.key)
        && !["overall", "整体", "整体（不拆分）"].includes(dimension.key)
        && !["整体", "整体（不拆分）"].includes(dimension.name)) {
        dimensions.set(`${source.capabilityId}:${dimension.key}`, dimension.name);
      }
    }
  }
  for (const metric of configuration?.calculatedMetrics || []) {
    if (metric.showInReport !== false) metrics.set(`calculated:${metric.id}`, metric.name);
  }
  return { name: configuration?.name || section.title || module?.name || "模块不可用",
    analysisType: configuration?.analysisType || "single",
    available: Boolean(configuration && !module.archived && module.enabled !== false),
    metrics: [...metrics.values()], dimensions: [...dimensions.values()] };
}

export function templateDirectoryItems(store, template) {
  return template.sections.map((section, index) => ({
    id: sectionIdentity(section, index), title: templateModuleSummary(store, section).name
  }));
}

export function ensureTemplateDirectory(store, template) {
  template.sections.forEach((section, index) => { section.id ||= sectionIdentity(section, index); });
  const items = templateDirectoryItems(store, template);
  template.directory = normalizeDirectory(template.directory || { entries: template.sections.map((section, index) => ({
    id: section.id, title: section.title !== items[index].title ? section.title : "", groupId: ""
  })) }, items);
  // Keep legacy display overrides even when a default directory was added at publication.
  template.directory.entries.forEach(entry => {
    const index = template.sections.findIndex(section => section.id === entry.id);
    const title = template.sections[index]?.title;
    if (!entry.title && title && title !== items[index]?.title) entry.title = title;
  });
  return items;
}

export function syncTemplateDirectory(store, template) {
  const items = templateDirectoryItems(store, template), defaults = new Map(items.map(item => [item.id, item.title]));
  template.directory = normalizeDirectory(template.directory, items);
  const sections = new Map(template.sections.map((section, index) => [sectionIdentity(section, index), section]));
  template.sections = template.directory.entries.map(entry => ({
    ...sections.get(entry.id), id: entry.id, title: entry.title.trim() || defaults.get(entry.id)
  }));
}

function moduleSummaryHTML(store, template) {
  const summaries = template.sections.map(section => templateModuleSummary(store, section));
  const metricCount = summaries.reduce((count, entry) => count + entry.metrics.length, 0);
  const dimensionCount = summaries.reduce((count, entry) => count + entry.dimensions.length, 0);
  const chips = values => values.map(badge).join("");
  return `<section class="mt-summary" aria-label="已选分析模块：当前可用指标与下钻维度"><header><div><strong>已选分析模块：当前可用指标与下钻维度</strong>${badge(`${metricCount} 个指标`)}${badge(`${dimensionCount} 个下钻维度`)}</div>${button("add-section", `${icon("plus")}添加模块`, !template.goal ? "disabled" : "")}</header>
    <div class="mt-summary-list">${summaries.map((entry, index) => `<article data-mt-module="${esc(template.sections[index].id)}"><header><div class="mt-summary-module"><strong>${esc(entry.name)}</strong>${badge(analysisTypes[entry.analysisType])}<span class="mt-version">v${template.sections[index].version}</span></div><div class="mt-summary-module-tools"><small>${entry.metrics.length} 个指标 · ${entry.dimensions.length} 个下钻维度</small>${button("remove-section", icon("x"), `data-index="${index}" aria-label="移除${esc(entry.name)}" title="移除模块"`, "mt-icon-button")}</div></header>
      ${!entry.available ? '<p class="mt-module-warning">模块已下线或固定版本不可用，请重新选择。</p>' : ""}
      <div class="mt-chip-row"><span>指标</span><div>${chips(entry.metrics) || '<small>无可展示指标</small>'}</div></div>
      <div class="mt-chip-row"><span>下钻维度</span><div>${badge("整体（不拆分）")}${chips(entry.dimensions)}</div></div></article>`).join("") || `<p class="mt-empty">${template.goal ? "尚未添加实验分析模块" : "请先选择业务目标"}</p>`}</div></section>`;
}

export function renderTemplateEditor(store, template, errors = []) {
  const directoryItems = ensureTemplateDirectory(store, template);
  const last = template.versions.at(-1);
  const status = templateEditorStatus(template);
  const dropdown = (label, model, entries, value, clear = "") => `<div class="mt-field"><label for="mt-${model}">${label}</label><div class="mt-select-row"><div class="mt-select"><select id="mt-${model}" data-model="ma-template-${model}">${options(entries, value)}</select>${icon("chevron-down")}</div>${clear && value ? button(`clear-template-${model}`, icon("x"), `aria-label="${clear}" title="${clear}"`, "mt-icon-button") : ""}</div></div>`;
  const references = [...new Set(template.sections.flatMap(section => {
    const summary = templateModuleSummary(store, section);
    return [...summary.metrics, ...summary.dimensions];
  }))];
  const textarea = (label, model, value, placeholder) => `<div class="mt-field mt-textarea"><label for="mt-${model}">${label}</label><div><textarea id="mt-${model}" data-model="ma-template-${model}" placeholder="${placeholder}">${esc(value || "")}</textarea>
    <details class="mt-mentions"><summary aria-label="引用${label}中的指标或维度" title="引用指标或维度">@</summary><div class="mt-mention-menu">${references.map(name => button("insert-template-mention", esc(name), `data-field="${model}" data-value="${esc(name)}"`)).join("") || '<p>添加实验分析模块后可引用指标与维度</p>'}</div></details></div></div>`;
  return `<div class="mt-editor"><header class="mt-editor-header"><div class="mt-heading"><a href="#/templates" class="mt-back" aria-label="返回实验报告模板">${icon("arrow-left")}</a><div><div class="mt-heading-line"><h1>${esc(template.name || "新建实验报告模板")}</h1><span class="mt-badge mt-status">${status}</span></div><p>实验报告模板</p></div></div><div class="mt-actions">${button("save-template", `${icon("save")}保存草稿`)}${button("publish-template", `${icon("upload")}发布新版本`, "", "primary")}</div></header>
    <div class="mt-editor-body"><div class="mt-form">
      ${errors.length ? `<div class="ma-errors" role="alert"><strong>请处理以下问题</strong><ul>${errors.map(error => `<li>${esc(error)}</li>`).join("")}</ul></div>` : ""}
      <div class="mt-basics">${field("模板名称", "name", template.name, "例如：优惠券实验归因报告")}${field("模板说明", "description", template.description, "说明报告覆盖的分析场景")}
        ${dropdown("业务目标", "goal", [["", "请选择业务目标"], ["平台老客提频", "平台老客提频"]], template.goal, "清除业务目标")}
        ${dropdown("适用端（可选）", "apps", [["", "不选择表示不限端"], ["抖音", "抖音"], ["极速版", "极速版"], ["抖音,极速版", "抖音、极速版"]], template.apps?.join(",") || "", "清除适用端")}
        ${dropdown("分析类型", "type", [["single", "单实验分析"], ["multi", "多实验分析"]], template.analysisType || "single")}</div>
      <section class="mt-modules" aria-label="已选分析模块与目录设置">
        ${moduleSummaryHTML(store, template)}
        <details class="mt-directory"><summary>${icon("list-tree")}目录设置<small>分组 · 显示标题 · 阅读顺序</small>${icon("chevron-down")}</summary>
          ${directoryEditorHTML(template.directory, directoryItems, "template")}</details></section>
      ${textarea("分析思路（可选）", "reasoning", template.reasoning, "如需结论，请说明分析顺序、判断方法和归因证据的组织方式")}
      ${textarea("注意事项（可选）", "considerations", template.considerations, "补充口径、观察窗口或结果解读边界")}
    </div><aside class="mt-versions"><header><strong>版本记录</strong><span>${template.versions.length} 个版本</span></header><div class="mt-combination-count">已组合 ${template.sections.length} 个实验分析模块</div>
      ${last ? `<div class="mt-version-list">${template.versions.slice().reverse().map(version => `<details><summary><strong>v${version.number}</strong><time>${new Date(version.publishedAt).toLocaleString("zh-CN", { hour12: false })}</time>${icon("chevron-down")}</summary><p>${esc(version.configuration.name)}</p><p>${version.configuration.analysisType === "multi" ? "多实验分析" : "单实验分析"} · ${version.configuration.sections.length} 个实验分析模块</p><small>${esc(version.operator)}</small></details>`).join("")}</div>` : '<p class="mt-version-empty">暂无版本记录</p>'}</aside></div></div>`;
}

export function renderTemplatePickerRows(store, template, selected, query = "") {
  const choices = templateModuleOptions(store, template).filter(({ configuration }) =>
    `${configuration.name} ${configuration.description || ""} ${analysisTypes[configuration.analysisType || "single"]}`.toLowerCase().includes(query.trim().toLowerCase()));
  return choices.map(({ module, configuration }) => `<label class="mt-picker-card ${selected.has(module.id) ? "selected" : ""}"><input type="checkbox" data-model="ma-template-module-choice" value="${esc(module.id)}" ${selected.has(module.id) ? "checked" : ""}>
    <div><header><strong>${esc(configuration.name)}</strong>${badge("已上线")}</header>${configuration.description ? `<p>${esc(configuration.description)}</p>` : ""}<div class="mt-picker-meta">${badge(analysisTypes[configuration.analysisType || "single"])}<small>${esc(configuration.goal || template.goal)} · ${esc(configuration.apps?.join("、") || "不限端")}</small></div></div></label>`).join("")
    || '<p class="mt-picker-empty" role="status">没有符合条件的已上线实验分析模块</p>';
}

export function renderTemplatePicker(store, template, selected) {
  return `<p class="mt-picker-help">新增选择使用模块当前线上版本。${template.analysisType === "multi" ? "可混选两类模块；发布时至少需要一个多实验分析模块。" : ""}</p><label class="mt-picker-search">${icon("search")}<input type="search" data-model="ma-template-module-search" aria-label="搜索模块名称或说明" placeholder="搜索模块名称或说明"></label>
    <div class="mt-picker-grid">${renderTemplatePickerRows(store, template, selected)}</div>`;
}
