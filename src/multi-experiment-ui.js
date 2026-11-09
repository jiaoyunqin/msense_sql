import { createIcons, icons } from "lucide";
import {
  copy, multiId, analysisTypes, demoGoal, demoExperiments, parseExperimentIds, experimentInput, findExperiment, experimentCandidates, resolveExperiment,
  experimentIssues, newTemplate, templateChanged, templateIssues, templateStatus, setTemplateEnabled, publishTemplate, publishedTemplates,
  initializeMultiAnalysis, workbenchModuleOptions, workbenchIssues, createAnalysisTask, executeAnalysisTask, createTaskReport
} from "./multi-experiment-data.js";
import { reportDescriptor, reportListRow, renderMultiReport, multiSuggestions, multiAnswer, applyModuleReportEvent, prepareModuleCitation } from "./multi-experiment-report.js";
import { demoModuleReport, demoMixedModuleReport, moduleView, singleScope } from "./multi-report-content.js";
import { referenceDescriptor, referenceListRow, renderReferenceReport, referenceEvent, referenceAnswer } from "./report-reference.js";
import { moduleConfiguration, moduleIssues } from "./analysis-module-data.js";
import { renderTemplateEditor, renderTemplatePicker, renderTemplatePickerRows, templateModuleOptions, templateEditorStatus } from "./report-template-editor.js";
import "./multi-experiment.css";
import "./report-template-catalog.css";
import "./experiment-workbench.css";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = name => `<i data-lucide="${name}"></i>`;
const button = (action, text, extra = "", cls = "") => `<button type="button" class="ma-button ${cls}" data-action="ma-${action}" ${extra}>${text}</button>`;
const options = (entries, value) => entries.map(([key, label]) => `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(label)}</option>`).join("");
const field = (title, model, value, extra = "") => `<label class="ma-field"><span>${title}</span><input data-model="ma-${model}" value="${esc(value)}" ${extra}></label>`;
const select = (title, model, entries, value, extra = "") => `<label class="ma-field"><span>${title}</span><select data-model="ma-${model}" ${extra}>${options(entries, value)}</select></label>`;
const errorsHTML = errors => errors.length ? `<div class="ma-errors" role="alert"><strong>请处理以下问题</strong><ul>${errors.map(error => `<li>${esc(error)}</li>`).join("")}</ul></div>` : "";
const panel = (number, title, body, subtitle = "", actions = "") => `<section class="ma-panel"><header><div class="ma-panel-heading"><span class="ma-step">${number}</span><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div></div><div>${actions}</div></header>${body}</section>`;
const dateTime = value => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未保存";
const dateLabel = value => value ? value.split("-").map(Number).map((part, index) => `${part}${["年", "月", "日"][index]}`).join("") : "请选择日期";
const observationDate = (title, model, value, extra = "") => `<label class="ma-observation-date">
  <span class="ma-observation-date-caption">${title}</span><span class="ma-observation-date-value">${dateLabel(value)}</span>${icon("calendar-days")}
  <input type="date" data-model="ma-${esc(model)}" value="${esc(value)}" ${extra}></label>`;

export function createMultiExperimentUI({ store, outlet, main, persist, showToast, render, openDialog, closeDialog, onReportsChanged = () => {} }) {
  initializeMultiAnalysis(store);
  let errors = [], note = "", templateType = "all", templateSearch = "", activeTemplate, trialModule;
  let templateCreator = "", templateState = "all", templateSort = "updated", templatePage = 1, templatePageSize = 20;
  let templateModuleSelection = new Set();
  let workbenchExpanded = false;
  const templateStateNames = { online: "已上线", draft: "草稿", offline: "已下线", archived: "已归档" };
  const creatorLabel = template => template.createdByName || (template.createdBy === "sheriqin.01" ? "秦娇芸" : template.createdBy) || "—";
  const templateTime = value => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "—";
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const reportViews = new Map();
  const bundledReport = demoModuleReport();
  const mixedReport = demoMixedModuleReport();
  const defaultDraft = type => ({ analysisType: type, goal: demoGoal, templateId: publishedTemplates(store, type)[0]?.id || "",
    catalogType: "all", moduleIds: [], experiments: [], bulk: "", supplement: "", unifiedStart: "", unifiedEnd: "", scenario: "normal" });
  const draft = () => {
    const state = store.multiAnalysis.draft ||= defaultDraft("single");
    state.moduleIds ||= [];
    state.catalogType ||= "all";
    return state;
  };
  const save = () => { persist(); };
  function renderTemplateCreators(query = "") {
    const creators = [...new Map(store.reportTemplates.filter(template => !template.archived && template.createdBy)
      .map(template => [template.createdBy, creatorLabel(template)])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "zh-CN"))
      .filter(([id, name]) => `${id} ${name}`.toLowerCase().includes(query.trim().toLowerCase()));
    outlet.querySelector(".ma-template-creator-options").innerHTML = [["", "全部创建人"], ...creators]
      .map(([id, name]) => `<button type="button" role="option" aria-selected="${templateCreator === id}" data-action="ma-filter-template-creator" data-creator="${esc(id)}"><span>${esc(name)}</span>${templateCreator === id ? icon("check") : ""}</button>`).join("")
      + (creators.length ? "" : '<p role="status">未找到匹配的创建人</p>');
    createIcons({ icons });
  }
  function renderTemplateRows() {
    const templates = store.reportTemplates.filter(template => !template.archived
      && (templateType === "all" || (template.analysisType || "single") === templateType)
      && (!templateCreator || template.createdBy === templateCreator)
      && (templateState === "all" || templateStatus(template) === templateState)
      && `${template.name} ${template.description}`.toLowerCase().includes(templateSearch.trim().toLowerCase()))
      .sort((a, b) => templateSort === "name" ? a.name.localeCompare(b.name, "zh-CN")
        : (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const pages = Math.max(1, Math.ceil(templates.length / templatePageSize));
    templatePage = Math.min(Math.max(1, templatePage), pages);
    outlet.querySelector(".ma-template-count").textContent = `${templates.length} 项`;
    outlet.querySelector(".ma-template-table tbody").innerHTML = templates.slice((templatePage - 1) * templatePageSize, templatePage * templatePageSize).map(template => {
      const status = templateStatus(template), creator = creatorLabel(template);
      const initial = creator === "—" ? "?" : [...creator][0];
      const name = template.name || "未命名模板";
      return `<tr data-template-id="${esc(template.id)}" data-analysis-type="${esc(template.analysisType || "single")}">
        <th scope="row"><a class="ma-template-name" href="#/templates/${esc(template.id)}" title="${esc(name)}">${esc(name)}</a>${template.description ? `<p class="ma-template-description" title="${esc(template.description)}">${esc(template.description)}</p>` : ""}</th>
        <td>${esc(template.goal || demoGoal)}</td><td>${esc(template.apps?.join("、") || "不限端")}</td><td>${template.sections.length}</td>
        <td><span class="ma-template-status ${status}"${template.versions.length ? ` title="已发布 v${template.versions.at(-1).number}${templateChanged(template) ? " · 有未发布修改" : ""}"` : ""}>${templateStateNames[status]}</span></td>
        <td><span class="ma-template-person" title="${esc(template.createdBy || creator)}"><span class="ma-template-avatar" aria-hidden="true">${esc(initial)}</span><span>${esc(creator)}</span></span></td>
        <td><time datetime="${esc(template.updatedAt)}">${templateTime(template.updatedAt)}</time></td>
        <td><div class="ma-template-row-actions"><a href="#/templates/${esc(template.id)}" aria-label="编辑${esc(name)}">${icon("pencil")}编辑</a>
          ${button("toggle-template", status === "online" ? "下线" : "上线", `data-id="${esc(template.id)}" aria-label="${status === "online" ? "下线" : "上线"}${esc(name)}"`, "ma-template-action")}
          ${button("archive-template", icon("archive"), `data-id="${esc(template.id)}" aria-label="归档${esc(name)}" title="归档"`, "ma-template-action ma-template-archive")}</div></td></tr>`;
    }).join("") || `<tr><td colspan="8"><div class="ma-template-empty">${icon("search")}<p>没有符合条件的模板</p>${button("reset-template-filters", "清空筛选", "", "text")}</div></td></tr>`;
    outlet.querySelector(".ma-template-page-info").textContent = `第 ${templatePage} / ${pages} 页`;
    outlet.querySelector('[data-action="ma-template-prev"]').disabled = templatePage === 1;
    outlet.querySelector('[data-action="ma-template-next"]').disabled = templatePage === pages;
    createIcons({ icons });
  }
  function renderTemplates(id) {
    if (!id) {
      activeTemplate = null;
      const creatorName = creatorLabel(store.reportTemplates.find(template => template.createdBy === templateCreator) || {});
      const filter = (model, label, entries, value) => `<label class="ma-template-select"><select data-model="ma-${model}" aria-label="${label}">${options(entries, value)}</select>${icon("chevron-down")}</label>`;
      outlet.innerHTML = `<div class="ma-page ma-template-catalog"><header class="ma-page-header"><h1>实验报告模板</h1>${button("new-template", `${icon("plus")}新建实验报告模板`, "", "primary")}</header>
        <div class="ma-template-filters" role="search" aria-label="筛选实验报告模板">
          <label class="ma-template-search">${icon("search")}<input type="search" data-model="ma-template-search" aria-label="搜索模板名称或说明" placeholder="搜索名称或说明" value="${esc(templateSearch)}"></label>
          <details class="ma-template-creator"><summary aria-label="按创建人筛选"><span>${esc(templateCreator ? creatorName : "全部创建人")}</span>${icon("chevron-down")}</summary>
            <div class="ma-template-creator-menu"><label class="ma-template-search">${icon("search")}<input type="search" data-model="ma-template-creator-search" aria-label="搜索创建人" placeholder="搜索创建人"></label>
              <div class="ma-template-creator-options" role="listbox" aria-label="创建人"></div></div></details>
          ${filter("template-state", "模板状态", [["all", "全部有效状态"], ["online", "已上线"], ["draft", "草稿"], ["offline", "已下线"]], templateState)}
          ${filter("template-filter", "模板分析类型", [["all", "全部分析类型"], ...Object.entries(analysisTypes)], templateType)}
          ${filter("template-sort", "模板排序", [["updated", "最近更新"], ["name", "名称排序"]], templateSort)}</div>
        <section class="ma-template-results" aria-label="实验报告模板列表"><div class="ma-template-table-scroll" role="region" aria-label="实验报告模板表格" tabindex="0">
          <table class="ma-template-table" aria-label="实验报告模板列表"><colgroup><col><col class="ma-col-goal"><col class="ma-col-app"><col class="ma-col-count"><col class="ma-col-status"><col class="ma-col-creator"><col class="ma-col-time"><col class="ma-col-actions"></colgroup>
            <thead><tr><th scope="col">名称与说明 <span class="ma-template-count" aria-live="polite"></span></th><th scope="col">业务目标</th><th scope="col">适用端</th><th scope="col">模块数</th><th scope="col">状态</th><th scope="col">创建人</th><th scope="col">更新时间</th><th scope="col">操作</th></tr></thead><tbody></tbody></table></div>
          <nav class="ma-template-pagination" aria-label="实验报告模板分页">${filter("template-page-size", "每页条数", [10, 20, 50, 100].map(size => [String(size), `${size} 条 / 页`]), String(templatePageSize))}
            <span class="ma-template-page-info" aria-live="polite"></span><div>${button("template-prev", icon("chevron-left"), 'aria-label="上一页"', "ma-template-page-button")}${button("template-next", icon("chevron-right"), 'aria-label="下一页"', "ma-template-page-button")}</div></nav></section></div>`;
      renderTemplateCreators(); renderTemplateRows(); return;
    }
    if (id === "new") {
      activeTemplate = newTemplate("single"); store.reportTemplates.push(activeTemplate); save();
      history.replaceState(null, "", `#/templates/${activeTemplate.id}`);
    } else activeTemplate = store.reportTemplates.find(template => template.id === id);
    if (!activeTemplate) { location.hash = "/templates"; return; }
    outlet.innerHTML = renderTemplateEditor(store, activeTemplate, errors);
    createIcons({ icons });
  }
  function renderExperimentRows() {
    const state = draft();
    const rows = outlet.querySelector(".ma-experiment-rows");
    if (!rows) { updateWorkbenchSummary(); return; }
    rows.hidden = outlet.querySelector(".ma-home") && !state.experiments.length;
    rows.innerHTML = state.experiments.map(input => {
      const candidates = experimentCandidates(input.id), experiment = resolveExperiment(input);
      const pending = candidates.length > 1 && input.qxExperimentId === "";
      const limits = experiment ? `min="${experiment.available[0]}" max="${experiment.available[1]}"` : "";
      const rowErrors = pending ? [] : experimentIssues(input, state.goal);
      return `<article class="ma-experiment-row" data-experiment-id="${esc(input.id)}">
        <div class="ma-observation-grid"><div class="ma-observation-field"><span>实验 ID</span>
          <div class="ma-parsed-id"><input value="${esc(input.id)}" readonly aria-label="实验 ID ${esc(input.id)}">
            ${button("remove-experiment", icon("x"), `data-id="${esc(input.id)}" aria-label="移除实验 ${esc(input.id)}" title="移除实验"`, "ma-remove-experiment")}</div></div>
          <div class="ma-observation-field"><span>观测时间</span><div class="ma-observation-dates">
            ${observationDate("开始", `date-start.${input.id}`, input.start, `aria-label="${esc(input.id)} 观测开始日期" ${limits} ${pending || !candidates.length ? "disabled" : ""}`)}
            <span class="ma-observation-arrow" aria-hidden="true">${icon("arrow-right")}</span>
            ${observationDate("结束", `date-end.${input.id}`, input.end, `aria-label="${esc(input.id)} 观测结束日期" ${limits} ${pending || !candidates.length ? "disabled" : ""}`)}</div></div></div>
        ${candidates.length > 1 ? `<label class="ma-candidate-field"><span>钱效实验候选项</span><span class="ma-candidate-select">
          <select data-model="ma-qx-experiment" data-id="${esc(input.id)}" aria-label="${esc(input.id)} 钱效实验候选项" class="${pending ? "placeholder" : ""}">
            ${options([["", "该 ID 匹配多个实验，请选择"], ...candidates.map(candidate => [candidate.qxExperimentId,
              `${candidate.name} · ${candidate.period.join(" 至 ")} · 钱效实验 ID ${candidate.qxExperimentId}`])], input.qxExperimentId ?? candidates[0].qxExperimentId)}</select>${icon("chevron-down")}</span></label>` : ""}
        ${experiment ? `<div class="ma-observation-summary ready"><div><strong>${esc(experiment.name)}</strong><span>实验周期：${experiment.period.join(" 至 ")}</span></div>
          <span>观测结束日最晚为 ${experiment.available[1]}（示例数据范围）</span></div>`
          : pending ? '<div class="ma-observation-summary">该实验 ID 匹配到多个与当前分析配置业务目标一致的钱效实验，请先选择。</div>' : ""}
        <div class="ma-row-errors" role="status">${rowErrors.map(error => `<p>${esc(error)}</p>`).join("")}</div></article>`;
    }).join("");
    updateWorkbenchSummary(); createIcons({ icons });
  }
  function workbenchInput() {
    const state = draft();
    if (trialModule || state.analysisType !== "single") return state;
    return { ...state, experiments: parseExperimentIds(state.bulk).ids.map(id => ({
      ...experimentInput(id), start: state.unifiedStart, end: state.unifiedEnd
    })) };
  }
  function updateWorkbenchSummary() {
    const state = draft(), template = publishedTemplates(store, state.analysisType).find(template => template.id === state.templateId);
    const footer = outlet.querySelector(".ma-home-footer");
    if (footer) {
      const selected = workbenchModuleOptions(store, state.analysisType, state.goal)
        .filter(option => state.moduleIds.includes(option.module.id));
      const name = state.moduleIds.length ? selected.map(option => option.configuration.name).join("、")
        : template?.selectedVersion.configuration.name;
      footer.querySelector(".ma-home-selected strong").textContent = name || "请选择报告模板或实验分析模块";
      const input = workbenchInput();
      footer.querySelector('[data-action="ma-generate"]').disabled = workbenchIssues(store, input).length > 0
        || store.multiAnalysis.tasks.some(task => task.status === "running");
      if (state.analysisType === "multi") outlet.querySelector(".ma-home-input-count").textContent = `已添加 ${input.experiments.length} 个独立实验`;
      else {
        const issue = outlet.querySelector(".ma-home-single-issue");
        issue.textContent = input.experiments.length > 1 ? "多个实验请选择多实验分析模板或模块。"
          : input.experiments.some(input => !findExperiment(input.id)) ? "未找到实验，请使用下方示例实验。" : "";
      }
      return;
    }
    const summary = outlet.querySelector(".ma-workbench-summary");
    if (!summary) return;
    summary.innerHTML = `<span class="ma-overline">本次分析</span><h2>${analysisTypes[state.analysisType]}</h2><div class="ma-count"><strong>${state.experiments.length}</strong><span>个独立实验</span></div>
      <dl><dt>业务目标</dt><dd>${state.goal}</dd><dt>报告模板</dt><dd>${esc(template?.selectedVersion.configuration.name || "尚未选择")}</dd><dt>固定版本</dt><dd>${template ? `v${template.selectedVersion.number}` : "—"}</dd></dl>
      ${trialModule ? '<p class="ma-notice">本次为模块私有试跑，结果保留在模块上下文。</p>' : ""}
      ${button("generate", trialModule ? "开始模块试跑" : "生成报告", "", "primary ma-full")}
      <p class="ma-notice">逐实验取数与分析；失败项可单独重试。</p><a href="#/history" class="ma-text-link">查看过往报告 →</a>`;
  }
  function renderWorkbenchHome() {
    const state = draft(), templates = publishedTemplates(store, state.catalogType);
    const modules = workbenchModuleOptions(store, state.catalogType, state.goal);
    const multi = state.analysisType === "multi";
    const card = (id, name, description, type, selected) => `<button type="button" class="ma-home-card ${type} ${selected ? "selected" : ""}"
      data-action="ma-${type === "template" ? "choose-template" : "choose-workbench-module"}" data-id="${esc(id)}"
      aria-pressed="${selected}" title="${esc(name)}">
      <span class="ma-home-card-title"><span class="ma-home-card-icon">${icon(type === "template" ? "file-chart-column" : "chart-no-axes-combined")}</span><strong>${esc(name)}</strong></span>
      ${description ? `<span class="ma-home-card-description">${esc(description)}</span>` : ""}
      ${selected && type === "module" ? `<span class="ma-home-card-check">${icon("check")}</span>` : ""}</button>`;
    const dates = `<div class="ma-observation-dates">${observationDate("开始", "unifiedStart", state.unifiedStart, 'aria-label="观察开始日期"')}
      <span class="ma-observation-arrow" aria-hidden="true">${icon("arrow-right")}</span>${observationDate("结束", "unifiedEnd", state.unifiedEnd, 'aria-label="观察结束日期"')}</div>`;
    outlet.innerHTML = `<div class="ma-page ma-home">
      <header class="ma-home-welcome"><h1>欢迎，秦娇芸</h1><p>输入实验 ID 和观测时间，选择报告模板或实验分析模块。</p></header>
      <section class="ma-home-catalog" aria-labelledby="ma-home-templates"><header><h2 id="ma-home-templates">实验报告模板</h2>
        <div class="ma-home-catalog-tools"><label class="ma-home-type"><select data-model="ma-workbench-filter" aria-label="筛选分析类型">${options([["all", "全部"], ...Object.entries(analysisTypes)], state.catalogType)}</select>${icon("chevron-down")}</label>
        <span>${templates.length} 个已上线模板</span></div></header>
        <div class="ma-home-card-grid">${templates.map(template => {
          const configuration = template.selectedVersion.configuration;
          return card(template.id, configuration.name, configuration.description, "template", template.id === state.templateId && !state.moduleIds.length);
        }).join("") || '<p class="ma-home-empty">暂无同类型的已上线模板。<a href="#/templates/new">新建实验报告模板</a></p>'}</div></section>
      <section class="ma-home-catalog" aria-labelledby="ma-home-modules"><header><h2 id="ma-home-modules">实验分析模块</h2><span>${modules.length} 个已上线模块</span></header>
        <div class="ma-home-card-grid" id="ma-home-module-grid">${(workbenchExpanded ? modules : modules.slice(0, 12)).map(({ module, configuration }) =>
          card(module.id, configuration.name, configuration.description, "module", state.moduleIds.includes(module.id))).join("")
          || '<p class="ma-home-empty">暂无同类型的已上线分析模块。<a href="#/modules">管理实验分析模块</a></p>'}</div>
        ${modules.length > 12 ? `<button type="button" class="ma-home-expand" data-action="ma-expand-workbench-modules" aria-expanded="${workbenchExpanded}" aria-controls="ma-home-module-grid">${icon(workbenchExpanded ? "chevron-up" : "chevron-down")}${workbenchExpanded ? "收起" : `展开全部（另有 ${modules.length - 12} 项）`}</button>` : ""}</section>
      <section class="ma-home-input-panel" aria-labelledby="ma-home-input-title"><header>${icon("flask-conical")}<h2 id="ma-home-input-title">输入实验 ID 和观测时间并开始</h2></header>
        <div class="ma-home-input-body">${errorsHTML(errors)}<div class="ma-home-input-grid ${multi ? "multi" : ""}">
          <div><label class="ma-field"><span>实验 ID</span>${multi
            ? `<textarea class="ma-bulk" data-model="ma-bulk" placeholder="多个 ID 用逗号、空格或换行分隔">${esc(state.bulk)}</textarea>`
            : `<input data-model="ma-bulk" value="${esc(state.bulk)}" placeholder="例如：DEMO-001" autocomplete="off">`}</label>
            ${multi ? `<div class="ma-home-parse-actions">${button("parse", "解析并添加")}<span class="ma-home-input-count">已添加 ${state.experiments.length} 个独立实验</span></div>` : '<p class="ma-home-single-issue" role="status"></p>'}</div>
          ${multi ? "" : `<div><span class="ma-home-field-label">观测时间</span>${dates}</div>`}
        </div>
        ${multi ? '<p class="ma-parse-note" role="status"></p><div class="ma-experiment-rows"></div>' : ""}
        <details class="ma-home-supplement" ${state.supplement ? "open" : ""}><summary>${icon("plus")}添加补充信息</summary>
          <label class="ma-field"><textarea data-model="ma-supplement" aria-label="补充信息（可选）" placeholder="补充实验背景或希望关注的问题">${esc(state.supplement)}</textarea></label></details>
        <details class="ma-home-examples"><summary>示例实验</summary><div>${button("fill-demo", "填入示例实验", "", "text")}<span>本地示例数据：DEMO-001 / DEMO-002 / DEMO-003</span></div>
          ${select("取数场景", "scenario", [["normal", "全部成功"], ["fail-last", "最后一个实验首次取数失败"]], state.scenario)}</details>
        </div><footer class="ma-home-footer"><div><p class="ma-home-selected"><span>已选择：</span><strong></strong></p><p>将完成取数与报告生成；配置了分析思路的模块会生成结论</p></div>
          ${button("generate", `${icon("sparkles")}开始分析`, "disabled", "primary")}</footer></section></div>`;
    if (multi) {
      outlet.querySelector(".ma-parse-note").textContent = note;
      renderExperimentRows();
    } else updateWorkbenchSummary();
    createIcons({ icons });
  }
  function renderWorkbench(moduleId) {
    trialModule = moduleId ? store.modules.find(module => module.id === moduleId) : null;
    const state = draft();
    if (trialModule && state.analysisType !== trialModule.analysisType) {
      Object.assign(state, defaultDraft(trialModule.analysisType)); save();
    }
    if (!trialModule) { renderWorkbenchHome(); return; }
    outlet.innerHTML = `<div class="ma-page"><header class="ma-page-header"><div><h1>${trialModule ? `${esc(trialModule.name)} · 试跑` : "实验分析"}</h1><p>在同一业务目标下，对比独立实验的策略表现。</p></div><span class="ma-demo-tag">模拟数据</span></header>
      <div class="ma-workbench-layout"><div>${errorsHTML(errors)}
      ${panel("01", "选择分析模板", `<div class="ma-form-grid">
        ${select("分析类型", "analysis-type", Object.entries(analysisTypes), state.analysisType, trialModule ? "disabled" : "")}
        ${select("报告模板", "template-choice", [["", "请选择已发布模板"], ...publishedTemplates(store, state.analysisType).map(template => [template.id, `${template.selectedVersion.configuration.name} · v${template.selectedVersion.number}`])], state.templateId)}</div>
        <p class="ma-notice">${demoGoal} · <a href="#/templates">管理报告模板</a>${trialModule ? ' · 分析使用当前模块草稿快照' : ""}</p>`)}
      ${panel("02", "添加独立实验", `<label class="ma-field"><span>实验 ID</span><textarea class="ma-bulk" data-model="ma-bulk" placeholder="多个 ID 用逗号、空格或换行分隔&#10;DEMO-001, DEMO-002, DEMO-003">${esc(state.bulk)}</textarea></label>
        <div class="ma-bulk-actions">${button("parse", "解析并添加", "", "primary")}${button("fill-demo", "填入示例实验")}<span>支持 DEMO-001 / 002 / 003</span></div>
        <p class="ma-parse-note" role="status">${esc(note)}</p><div class="ma-experiment-rows"></div>`)}
      ${panel("03", "补充分析背景", `<label class="ma-field"><span>补充信息（可选）</span><textarea data-model="ma-supplement" placeholder="例如：关注券时效差异，请结合人群和观察窗口解释结果">${esc(state.supplement)}</textarea></label>
        <details class="ma-method"><summary>演示任务场景</summary>${select("取数场景", "scenario", [["normal", "全部成功"], ["fail-last", "最后一个实验首次取数失败"]], state.scenario)}<p class="ma-notice">用于验证部分失败与重试，不调用生产取数服务。</p></details>`)}
      </div><aside class="ma-workbench-summary"></aside></div></div>`;
    renderExperimentRows(); createIcons({ icons });
  }
  function renderTask(id) {
    trialModule = null;
    const task = store.multiAnalysis.tasks.find(task => task.id === id);
    if (!task) { outlet.innerHTML = '<div class="ma-empty">任务不存在。<a href="#/experiments">返回实验分析</a></div>'; return; }
    const statuses = { pending: "待开始", fetching: "取数中", analyzing: "分析中", success: "成功", failed: "失败" };
    const successes = task.results.filter(result => result.status === "success").length;
    const failures = task.results.filter(result => result.status === "failed").length;
    outlet.innerHTML = `<div class="ma-page ma-task-page"><header class="ma-page-header"><div><a href="#/experiments" class="ma-back">${icon("arrow-left")}实验分析</a><h1>${esc(task.snapshot.template.name)}</h1><p>${task.id} · ${dateTime(task.startedAt)}</p></div><span class="ma-demo-tag">模拟任务</span></header>
      <section class="ma-panel"><header><div><h2>${task.status === "running" ? "正在逐实验分析" : failures ? "分析部分完成" : "分析已完成"}</h2><p>${successes}/${task.results.length} 个实验成功${failures ? ` · ${failures} 个失败` : ""}</p></div>
        ${task.status !== "running" && failures ? button("retry", "重试失败项", `data-id="${task.id}"`, "primary") : ""}</header>
      <div class="ma-task-progress"><span style="width:${(successes + failures) / task.results.length * 100}%"></span></div>
      <div class="ma-task-list">${task.results.map(result => `<article><span class="ma-task-dot ${result.status}"></span><div><strong>${result.id} · ${esc(task.snapshot.experiments.find(entry => entry.input.id === result.id).definition.name)}</strong>
        <p>${statuses[result.status]}${result.error ? ` · ${esc(result.error)}` : ""}</p></div><small>${result.attempts ? `第 ${result.attempts} 次` : ""}</small></article>`).join("")}</div>
      ${task.reportId && task.status !== "running" ? `<div class="ma-task-result"><p>${failures ? "报告包含成功实验，失败项已明确标记。" : "报告已生成，配置与数据已固定保存。"}</p><a class="ma-button primary" href="#/report/${task.reportId}">查看${task.private ? "模块试跑" : "分析"}报告 →</a></div>`
        : task.status !== "running" ? `<div class="ma-warning">${task.snapshot.analysisType === "multi" && successes < 2 ? "成功实验不足 2 个，暂不生成横向比较。请重试失败项。" : "尚未生成报告。"}</div>` : ""}
      <details class="ma-method"><summary>本次输入快照</summary><p>${analysisTypes[task.snapshot.analysisType]} · ${task.private ? "模块草稿快照" : task.snapshot.origin === "modules" ? "已发布模块快照" : `模板 v${task.snapshot.templateVersion}`}</p>${task.snapshot.experiments.map(({ input }) => `<p>${input.id} · ${input.start} 至 ${input.end} · ${input.groupIds.join("、")}</p>`).join("")}</details></section>
      ${task.private ? `<a href="#/modules/${task.moduleId}">返回模块配置</a>` : ""}</div>`;
    createIcons({ icons });
  }
  const updateTask = task => {
    if (task.private) {
      const attempt = store.modules.find(module => module.id === task.moduleId)?.multiAttempts?.find(attempt => attempt.taskId === task.id);
      if (attempt) attempt.status = task.status;
    }
    save(); onReportsChanged(); if (location.hash === `#/experiments/task/${task.id}`) renderTask(task.id);
  };
  async function runTask(task) {
    await executeAnalysisTask(task, updateTask);
    createTaskReport(store, task); updateTask(task);
  }
  async function handleAction(trigger) {
    const action = trigger.dataset.action.slice(3), state = draft(), id = trigger.dataset.id;
    if (action === "choose-template") {
      const template = publishedTemplates(store, "all").find(template => template.id === id);
      if (!template) { showToast("模板已下线或发布版本不可用"); return; }
      state.analysisType = template.selectedVersion.configuration.analysisType;
      state.templateId = id; state.moduleIds = []; errors = []; save(); renderWorkbenchHome();
      [...outlet.querySelectorAll('[data-action="ma-choose-template"]')].find(card => card.dataset.id === id)?.focus();
    }
    if (action === "choose-workbench-module") {
      const option = workbenchModuleOptions(store, "all", state.goal).find(option => option.module.id === id);
      if (!option) { showToast("模块已下线或发布版本不可用"); return; }
      const type = option.configuration.analysisType || "single";
      if (state.moduleIds.length && type !== state.analysisType) {
        showToast("当前单独模块组合需保持同一分析类型，请先取消已选模块"); return;
      }
      state.analysisType = type;
      state.templateId = "";
      state.moduleIds = state.moduleIds.includes(id) ? state.moduleIds.filter(moduleId => moduleId !== id) : [...state.moduleIds, id];
      errors = []; save(); renderWorkbenchHome();
      [...outlet.querySelectorAll('[data-action="ma-choose-workbench-module"]')].find(card => card.dataset.id === id)?.focus();
    }
    if (action === "expand-workbench-modules") {
      workbenchExpanded = !workbenchExpanded; renderWorkbenchHome();
      outlet.querySelector('[data-action="ma-expand-workbench-modules"]')?.focus();
    }
    if (action === "new-template") { errors = []; location.hash = "/templates/new"; }
    if (action === "copy-template") {
      const source = store.reportTemplates.find(template => template.id === id), template = newTemplate(source.analysisType);
      Object.assign(template, templateConfigurationForCopy(source));
      store.reportTemplates.push(template); save(); errors = []; location.hash = `/templates/${template.id}`;
    }
    if (action === "toggle-template") {
      const template = store.reportTemplates.find(template => template.id === id);
      try { setTemplateEnabled(store, template, templateStatus(template) !== "online"); }
      catch (error) { showToast(error.message); return; }
      save(); renderTemplateRows(); showToast(template.enabled ? "模板已上线" : "模板已下线");
    }
    if (action === "archive-template") {
      const template = store.reportTemplates.find(template => template.id === id);
      openDialog("归档实验报告模板", `<p>归档「${esc(template.name || "未命名模板")}」后，模板将从列表移除，不能用于新建分析。已生成的报告保留。</p>`,
        '<button type="button" class="ma-button" data-action="close">取消</button>' + button("confirm-archive-template", "确认归档", `data-id="${esc(id)}"`, "primary"));
    }
    if (action === "confirm-archive-template") {
      const template = store.reportTemplates.find(template => template.id === id);
      template.archived = true; template.enabled = false; template.updatedAt = new Date().toISOString();
      save(); closeDialog(); renderTemplates(); showToast("模板已归档");
    }
    if (action === "filter-template-creator") {
      templateCreator = trigger.dataset.creator; templatePage = 1;
      const menu = outlet.querySelector(".ma-template-creator");
      menu.open = false;
      menu.querySelector("summary > span").textContent = trigger.textContent.trim();
      menu.querySelector("input").value = "";
      renderTemplateCreators(); renderTemplateRows(); menu.querySelector("summary").focus();
    }
    if (action === "reset-template-filters") {
      templateType = "all"; templateSearch = ""; templateCreator = ""; templateState = "all"; templatePage = 1;
      renderTemplates();
    }
    if (action === "template-prev" || action === "template-next") {
      templatePage += action === "template-prev" ? -1 : 1; renderTemplateRows();
    }
    if (action === "save-template" || action === "publish-template") {
      errors = action === "publish-template" ? templateIssues(store, activeTemplate) : [];
      if (!errors.length) {
        if (action === "publish-template") publishTemplate(store, activeTemplate);
        activeTemplate.savedAt = activeTemplate.updatedAt = new Date().toISOString(); save();
        showToast(action === "publish-template" ? `模板已发布 v${activeTemplate.versions.at(-1).number}` : "模板草稿已保存");
      }
      renderTemplates(activeTemplate.id);
    }
    if (action === "add-section") {
      templateModuleSelection = new Set(activeTemplate.sections.map(section => section.moduleId));
      openDialog("添加实验分析模块", renderTemplatePicker(store, activeTemplate, templateModuleSelection),
        button("confirm-template-modules", "完成", "", "primary"));
      document.querySelector('[data-model="ma-template-module-search"]')?.focus();
    }
    if (action === "confirm-template-modules") {
      const choices = templateModuleOptions(store, activeTemplate);
      const availableIds = new Set(choices.map(choice => choice.module.id));
      // A search only changes visibility. Keep selections outside the current search,
      // and keep unavailable/type-mismatched existing references for explicit removal.
      const sections = activeTemplate.sections.filter(section =>
        !availableIds.has(section.moduleId) || templateModuleSelection.has(section.moduleId));
      const retainedIds = new Set(sections.map(section => section.moduleId));
      for (const { module, version, configuration } of choices) {
        if (templateModuleSelection.has(module.id) && !retainedIds.has(module.id)) {
          sections.push({ moduleId: module.id, version: version.number, title: configuration.name, kind: "overall" });
          retainedIds.add(module.id);
        }
      }
      activeTemplate.sections = sections;
      save(); closeDialog(); renderTemplates(activeTemplate.id);
    }
    if (action === "clear-template-goal" || action === "clear-template-apps") {
      if (action === "clear-template-goal") activeTemplate.goal = "";
      else activeTemplate.apps = [];
      save(); renderTemplates(activeTemplate.id);
    }
    if (action === "insert-template-mention") {
      const model = trigger.dataset.field;
      if (!["reasoning", "considerations"].includes(model)) return;
      const textarea = outlet.querySelector(`[data-model="ma-template-${model}"]`);
      const from = textarea.selectionStart, to = textarea.selectionEnd;
      const inserted = `@${trigger.dataset.value} `;
      textarea.setRangeText(inserted, from, to, "end");
      activeTemplate[model] = textarea.value;
      trigger.closest("details").open = false;
      save(); textarea.focus();
    }
    if (action === "remove-section" || action === "move-section") {
      const index = Number(trigger.dataset.index), sections = activeTemplate.sections;
      if (action === "remove-section") sections.splice(index, 1);
      else {
        const to = index + Number(trigger.dataset.direction);
        if (to < 0 || to >= sections.length) return;
        const [section] = sections.splice(index, 1); sections.splice(to, 0, section);
      }
      save(); renderTemplates(activeTemplate.id);
    }
    if (action === "fill-demo") {
      state.bulk = (state.analysisType === "single" ? demoExperiments.slice(0, 1) : demoExperiments).map(experiment => experiment.id).join("\n");
      outlet.querySelector('[data-model="ma-bulk"]').value = state.bulk;
      if (!trialModule && state.analysisType === "single") {
        [state.unifiedStart, state.unifiedEnd] = demoExperiments[0].period;
        outlet.querySelector('[data-model="ma-unifiedStart"]').value = state.unifiedStart;
        outlet.querySelector('[data-model="ma-unifiedEnd"]').value = state.unifiedEnd;
        refreshObservationDates();
      }
      save(); updateWorkbenchSummary();
    }
    if (action === "parse") {
      const parsed = parseExperimentIds(state.bulk), existing = new Set(state.experiments.map(input => input.id));
      let duplicates = parsed.duplicates, added = 0;
      for (const id of parsed.ids) {
        if (existing.has(id)) duplicates++;
        else { state.experiments.push(experimentInput(id, { requireSelection: true })); existing.add(id); added++; }
      }
      note = parsed.ids.length ? `已添加 ${added} 个实验${duplicates ? `，已去重 ${duplicates} 个重复 ID` : ""}。` : "请先填写实验 ID。";
      outlet.querySelector(".ma-parse-note").textContent = note; errors = []; save(); renderExperimentRows();
    }
    if (action === "remove-experiment") { state.experiments = state.experiments.filter(input => input.id !== id); save(); renderExperimentRows(); }
    if (action === "generate") {
      if (store.multiAnalysis.tasks.some(task => task.status === "running")) { showToast("已有分析正在运行，请等待当前任务完成"); return; }
      if (!trialModule && state.analysisType === "single") state.experiments = workbenchInput().experiments;
      errors = workbenchIssues(store, state, { trialModule });
      if (trialModule) errors.push(...moduleIssues(store, trialModule));
      if (errors.length) { renderWorkbench(trialModule?.id); return; }
      let task;
      try {
        task = createAnalysisTask(store, state, { trialModule: trialModule ? { ...moduleConfiguration(trialModule), id: trialModule.id } : null });
      } catch (error) { errors = [error.message]; renderWorkbench(trialModule?.id); return; }
      save(); location.hash = `/experiments/task/${task.id}`; await runTask(task);
    }
    if (action === "retry") {
      const task = store.multiAnalysis.tasks.find(task => task.id === id);
      if (!task || task.status === "running") return;
      await runTask(task);
    }
  }
  function templateConfigurationForCopy(template) {
    return { name: `${template.name}（副本）`, description: template.description, goal: template.goal,
      apps: copy(template.apps || []), reasoning: template.reasoning || "", considerations: template.considerations || "",
      sections: copy(template.sections) };
  }
  function handleModel(event) {
    const el = event.target, model = el.dataset.model;
    if (!model?.startsWith("ma-")) return false;
    const isChange = el.type === "checkbox" || el.tagName === "SELECT";
    if (event.type !== (isChange ? "change" : "input")) return true;
    const key = model.slice(3), state = draft();
    if (key === "template-module-search") {
      document.querySelector(".mt-picker-grid").innerHTML = renderTemplatePickerRows(store, activeTemplate, templateModuleSelection, el.value);
      createIcons({ icons }); return true;
    }
    if (key === "template-module-choice") {
      if (el.checked) templateModuleSelection.add(el.value); else templateModuleSelection.delete(el.value);
      el.closest(".mt-picker-card").classList.toggle("selected", el.checked);
      return true;
    }
    if (key === "template-creator-search") { renderTemplateCreators(el.value); return true; }
    if (["template-search", "template-filter", "template-state", "template-sort", "template-page-size"].includes(key)) {
      if (key === "template-search") templateSearch = el.value;
      else if (key === "template-filter") templateType = el.value;
      else if (key === "template-state") templateState = el.value;
      else if (key === "template-sort") templateSort = el.value;
      else templatePageSize = Number(el.value);
      templatePage = 1; renderTemplateRows(); return true;
    }
    if (["template-name", "template-description", "template-type", "template-goal", "template-apps", "template-reasoning", "template-considerations"].includes(key) && activeTemplate) {
      const property = key === "template-type" ? "analysisType" : key.slice(9);
      activeTemplate[property] = property === "apps" ? el.value.split(",").filter(Boolean) : el.value;
      save();
      if (["template-type", "template-goal", "template-apps"].includes(key)) {
        errors = key === "template-type" ? templateIssues(store, activeTemplate)
          .filter(error => error.includes("类型不一致") || error.includes("负责跨实验结论")) : [];
        renderTemplates(activeTemplate.id);
      } else if (key === "template-name") {
        outlet.querySelector(".mt-heading h1").textContent = activeTemplate.name || "新建实验报告模板";
      }
      outlet.querySelector(".mt-status").textContent = templateEditorStatus(activeTemplate);
      return true;
    }
    if (key.startsWith("section-")) {
      const [part, index] = key.split("."), section = activeTemplate.sections[Number(index)];
      if (part === "section-module") { const [moduleId, version] = el.value.split(":"); section.moduleId = moduleId; section.version = Number(version); }
      else section[part === "section-title" ? "title" : "kind"] = el.value;
      save(); return true;
    }
    if (key === "analysis-type") {
      state.analysisType = el.value; state.templateId = publishedTemplates(store, state.analysisType)[0]?.id || "";
      state.moduleIds = []; workbenchExpanded = false;
      errors = []; save(); renderWorkbench(); return true;
    }
    if (key === "workbench-filter") {
      if (!["all", "single", "multi"].includes(el.value)) return true;
      state.catalogType = el.value; workbenchExpanded = false;
      save(); renderWorkbenchHome();
      outlet.querySelector('[data-model="ma-workbench-filter"]')?.focus();
      return true;
    }
    if (key === "template-choice") state.templateId = el.value;
    else if (key === "qx-experiment") {
      const input = state.experiments.find(input => input.id === el.dataset.id);
      if (!input) return true;
      Object.assign(input, experimentInput(input.id, { qxExperimentId: el.value }));
      save(); renderExperimentRows();
      [...outlet.querySelectorAll('[data-model="ma-qx-experiment"]')].find(select => select.dataset.id === input.id)?.focus();
      return true;
    } else if (key.startsWith("date-")) {
      const [part, id] = key.split("."), input = state.experiments.find(input => input.id === id);
      input[part === "date-start" ? "start" : "end"] = el.value;
    } else state[key] = el.value;
    save(); refreshObservationDates(); updateWorkbenchSummary();
    if (key.startsWith("date-")) {
      const row = el.closest(".ma-experiment-row"), input = state.experiments.find(input => input.id === row.dataset.experimentId);
      row.querySelector(".ma-row-errors").innerHTML = experimentIssues(input, state.goal).map(error => `<p>${esc(error)}</p>`).join("");
    }
    return true;
  }
  function refreshObservationDates() {
    outlet.querySelectorAll(".ma-observation-date").forEach(label => {
      label.querySelector(".ma-observation-date-value").textContent = dateLabel(label.querySelector("input").value);
    });
  }
  outlet.addEventListener("click", event => {
    const input = event.target.closest('.ma-observation-date input[type="date"]');
    if (input && !input.disabled && input.showPicker) {
      try { input.showPicker(); } catch { /* Keep the native date input available as a fallback. */ }
    }
  });
  document.addEventListener("click", event => {
    const menu = outlet.querySelector(".ma-template-creator[open]");
    if (menu && !menu.contains(event.target)) menu.open = false;
  });
  outlet.addEventListener("keydown", event => {
    const menu = outlet.querySelector(".ma-template-creator[open]");
    if (event.key === "Escape" && menu) {
      menu.open = false; menu.querySelector("summary").focus(); event.preventDefault();
    }
  });
  function reportView(report) { if (!reportViews.has(report.id)) reportViews.set(report.id, {}); return reportViews.get(report.id); }
  return {
    handleAction, handleModel,
    render(page, id, extra) {
      main.classList.add("am-page"); outlet.classList.add("am-outlet");
      if (page === "templates") renderTemplates(id);
      else if (id === "task") renderTask(extra);
      else renderWorkbench(id === "module" ? extra : "");
    },
    reports: {
      getReport: id => {
        if (id === "r-single-reference") return referenceDescriptor();
        const saved = id === bundledReport.id ? bundledReport : id === mixedReport.id ? mixedReport
          : store.multiAnalysis.reports.find(report => report.id === id);
        return saved && reportDescriptor(saved);
      },
      getList: () => [
        referenceListRow(),
        reportListRow(bundledReport),
        reportListRow(mixedReport),
        ...store.multiAnalysis.reports.filter(report => !report.private).map(reportListRow),
        ...store.multiAnalysis.tasks.filter(task => !task.private && (task.status === "running" || !task.reportId))
          .map(task => ({ ...reportListRow(task), href: `#/experiments/task/${task.id}`, taskOnly: true }))
      ],
      renderBody: report => report.referenceReport ? renderReferenceReport(report, reportView(report)) : report.custom ? renderMultiReport(report, reportView(report)) : null,
      suggestions: (report, scope) => report?.referenceReport ? ["总结这份报告的核心结论", "PreAA 的显著性标准有什么区别？", "哪些类目的表现需要进一步核对？"] : report?.custom ? multiSuggestions(report, scope) : null,
      answer: (report, question, scope) => report?.referenceReport ? referenceAnswer(question, scope) : report?.custom ? multiAnswer(report, question, scope, reportView(report)) : null,
      normalizeScope(report, scope) {
        if (!report?.moduleReport || report.referenceReport) return scope;
        const module = report.moduleContent.find(module => scope?.startsWith(`${module.id}-data-`));
        return module ? singleScope(module.index, moduleView(reportView(report), module).experimentId) : scope;
      },
      beforeGoto(report, scope) {
        if (!report.custom || report.referenceReport) return false;
        return prepareModuleCitation(report, scope, reportView(report));
      },
      handleEvent(event, report) {
        if (!report?.custom) return false;
        if (report.referenceReport) return referenceEvent(event, reportView(report));
        return applyModuleReportEvent(event, report, reportView(report));
      }
    }
  };
}
