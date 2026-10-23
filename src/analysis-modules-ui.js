import { createIcons, icons } from "lucide";
import { clone, uid, currentActor, businessGoal } from "./composer-data.js";
import {
  initializeModules, moduleBuiltins, builtinSource, sqlSource, sourceDefinition, newAnalysisModule,
  moduleHash, moduleConfiguration, moduleState, moduleIssues
} from "./analysis-module-data.js";
import { runModule } from "./analysis-module-runner.js";
import "./analysis-modules.css";

const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = (name) => `<i data-lucide="${name}"></i>`;
const button = (action, text, name = "", extra = "", cls = "") => `<button type="button" class="am-button ${cls}" data-action="mod-${action}" ${extra}>${name ? icon(name) : ""}${text}</button>`;
const stateNames = { draft: "草稿", online: "已上线", offline: "已下线" };
const time = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }).replaceAll("/", "-") : "";
const field = (title, key, value, placeholder = "") => `<label class="am-field"><span>${title}</span><input data-model="mod-field.${key}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;
const area = (title, key, value, placeholder = "") => `<label class="am-field am-area"><span>${title}</span><textarea data-model="mod-field.${key}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;

export function createAnalysisModules({ store, outlet, main, persist, showToast, openDialog, closeDialog, render }) {
  initializeModules(store);
  let search = "", state = "all", sort = "updated", errors = [], running = false;
  function activate(id) {
    const module = store.modules.find((entry) => entry.id === id);
    if (module) store.analysis = module;
    return module;
  }
  function renderList() {
    const modules = store.modules.filter((module) => !module.archived);
    outlet.innerHTML = `<div class="am-list-page">
      <header class="am-list-header"><div><h1>实验分析模块</h1><p>${modules.length} 项有效配置</p></div>${button("new", "新建实验分析模块", "plus", "", "primary")}</header>
      <div class="am-toolbar"><div class="am-filters"><label class="am-search">${icon("search")}<input type="search" data-model="mod-search" aria-label="搜索模块名称或说明" placeholder="搜索名称或说明" value="${esc(search)}"></label>
      <select data-model="mod-state" aria-label="模块状态">${[["all", "全部有效状态"], ["online", "已上线"], ["draft", "草稿"], ["offline", "已下线"]].map(([value, name]) => `<option value="${value}" ${state === value ? "selected" : ""}>${name}</option>`).join("")}</select>
      <select data-model="mod-sort" aria-label="模块排序"><option value="updated" ${sort === "updated" ? "selected" : ""}>最近更新</option><option value="name" ${sort === "name" ? "selected" : ""}>名称排序</option></select></div>
      <p class="am-result-count"></p></div><div class="am-module-grid"></div></div>`;
    renderListResults();
  }
  function renderListResults() {
    const modules = store.modules.filter((module) => !module.archived
      && (state === "all" || moduleState(module) === state)
      && `${module.name} ${module.description}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "zh-CN")
        : (b.updatedAt || b.savedAt || "").localeCompare(a.updatedAt || a.savedAt || ""));
    outlet.querySelector(".am-result-count").textContent = `${modules.length} 项`;
    outlet.querySelector(".am-module-grid").innerHTML = modules.map((module) => {
      const status = moduleState(module);
      return `<article class="am-module-card" data-module-id="${module.id}">
        <div class="am-card-top"><span class="am-module-icon">${icon("flask-conical")}</span><span class="am-state ${status}">${stateNames[status]}</span></div>
        <a class="am-card-title" href="#/modules/${module.id}">${esc(module.name || "未命名实验分析模块")}</a>
        <p class="am-card-description">${esc(module.description)}</p>
        <div class="am-tags"><span>${businessGoal}</span><span>${esc(module.apps.join("、") || "不限端")}</span></div>
        <footer>${module.updatedAt || module.savedAt ? `<small>更新于 ${esc(time(module.updatedAt || module.savedAt))}</small>` : "<span></span>"}
        <div class="am-card-actions">${button("copy", "", "copy", `data-id="${module.id}" aria-label="复制${esc(module.name)}" title="复制"`)}
        <a href="#/modules/${module.id}" class="am-button">${icon("pencil")}编辑</a>
        ${button("toggle-state", status === "online" ? "下线" : "上线", "", `data-id="${module.id}"`)}
        ${button("archive", "", "archive", `data-id="${module.id}" aria-label="归档${esc(module.name)}" title="归档"`)}
        </div></footer></article>`;
    }).join("") || `<div class="am-empty">未找到匹配的实验分析模块</div>`;
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
  function renderPicker() {
    const module = store.analysis;
    const chosen = options().filter((option) => module.sources.some((source) => optionKey(source) === option.key));
    return `<div class="am-source-picker"><label class="am-label">取数模块</label><details class="am-multi-select">
      <summary><span>${esc(chosen.map((option) => option.name).join("，") || "请选择取数模块")}</span>${icon("chevron-down")}</summary>
      <div class="am-picker-menu"><label class="am-search">${icon("search")}<input type="search" data-model="mod-option-search" placeholder="搜索取数模块" aria-label="搜索取数模块"></label><div class="am-picker-options">
      ${options().map((option) => `<label class="am-picker-option" data-option-name="${esc(option.name)}"><input type="checkbox" data-model="mod-source-choice" value="${option.key}" ${chosen.some((entry) => entry.key === option.key) ? "checked" : ""}><span>${esc(option.name)}</span></label>`).join("")}
      </div></div></details>${module.sources.length ? button("clear-sources", "", "x", 'aria-label="清空取数模块" title="清空"') : ""}</div>`;
  }
  function sourceSummary(source) {
    const definition = sourceDefinition(store, source);
    if (!definition) return "<p>固定版本已不可用，请移除后重新选择。</p>";
    const metrics = definition.metrics.filter((field) => source.metricKeys.includes(field.key));
    const dimensions = definition.dimensions.filter((field) => source.dimensionKeys.includes(field.key));
    return `<div><span>指标</span><div>${metrics.length ? metrics.map((field) => `<span class="am-chip">${esc(field.name)}</span>`).join("")
      : "<small>暂未选择指标</small>"}</div></div>${definition.dimensions.length ? `<div><span>维度</span><div>${dimensions.length ? dimensions.map((field) => `<span class="am-chip">${esc(field.name)}</span>`).join("") : "<small>暂未选择维度</small>"}</div></div>` : ""}`;
  }
  function sourceCard(source, index) {
    const module = store.analysis, definition = sourceDefinition(store, source);
    if (!definition) return `<article class="am-source-card" data-source-id="${source.id}"><header><strong>固定版本已不可用</strong>${button("remove-source", "移除", "trash-2", `data-id="${source.id}"`)}</header></article>`;
    const list = (kind, fields, selected) => `<section class="am-choice-column ${kind}"><header><div><strong>${kind === "metric" ? "指标" : "下钻维度"}</strong><span class="am-choice-count">已选 ${selected.length}/${fields.length}</span></div>
      ${fields.length ? button("all", selected.length === fields.length ? "清空" : "全选", "", `data-id="${source.id}" data-kind="${kind}"`) : ""}</header>
      ${fields.length ? `<label class="am-search">${icon("search")}<input type="search" data-model="mod-choice-search" data-kind="${kind}" data-source-id="${source.id}" aria-label="搜索${kind === "metric" ? "指标" : "下钻维度"}" placeholder="${kind === "metric" ? "搜索指标名称、Key 或口径" : "搜索下钻维度名称或 Key"}"></label>
      <div class="am-choice-list">${fields.map((field) => `<label class="am-choice" data-search-text="${esc(`${field.name} ${field.key} ${field.description || ""}`.toLowerCase())}"><input type="checkbox" data-model="mod-choice" data-source-id="${source.id}" data-kind="${kind}" value="${esc(field.key)}" ${selected.includes(field.key) ? "checked" : ""}><span><strong>${esc(field.name)}</strong>${kind === "metric" && field.description ? `<small>${esc(field.description)}</small>` : ""}</span></label>`).join("")}<p class="am-search-empty" hidden>暂无匹配项</p></div>` : `<p class="am-no-dimensions">暂无下钻维度</p>`}</section>`;
    return `<article class="am-source-card ${source.expanded ? "expanded" : ""}" data-source-id="${source.id}">
      <header><button type="button" class="am-source-title" data-action="mod-expand" data-id="${source.id}" aria-expanded="${source.expanded}"><strong>${esc(definition.name)}</strong><span class="am-selected-count">已选 ${source.metricKeys.length} 个指标${definition.dimensions.length ? ` · ${source.dimensionKeys.length} 个维度` : ""}</span>${source.kind === "sql" ? `<span class="am-version-tag">v${source.version}</span>` : ""}</button>
      <div class="am-source-actions"><label class="am-report-check"><input type="checkbox" data-model="mod-report" data-source-id="${source.id}" ${source.showInReport ? "checked" : ""}>报告中展示</label>
      ${button("move", "", "arrow-up", `data-id="${source.id}" data-direction="-1" aria-label="上移${esc(definition.name)}" ${index === 0 ? "disabled" : ""}`)}
      ${button("move", "", "arrow-down", `data-id="${source.id}" data-direction="1" aria-label="下移${esc(definition.name)}" ${index === module.sources.length - 1 ? "disabled" : ""}`)}
      ${button("trial-source", "试跑取数", "flask-conical", `data-id="${source.id}" ${running || moduleIssues(store, { ...module, name: module.name || "新模块" }, [source]).length ? "disabled" : ""}`)}
      ${button("expand", source.expanded ? "收起" : "展开", source.expanded ? "chevron-up" : "chevron-down", `data-id="${source.id}" aria-expanded="${source.expanded}" aria-controls="source-content-${source.id}"`)}
      ${button("remove-source", "移除", "trash-2", `data-id="${source.id}"`)}</div></header>
      <div class="am-source-content" id="source-content-${source.id}" ${source.expanded ? "" : "hidden"}>
        <p class="am-source-description">${esc(definition.description)}</p><div class="am-selection-summary">${sourceSummary(source)}</div>
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
        <label class="am-field"><span>适用端（可选）</span><select data-model="mod-apps"><option value="" ${!module.apps.length ? "selected" : ""}>不选择表示不限端</option><option value="抖音" ${module.apps.join(",") === "抖音" ? "selected" : ""}>抖音</option><option value="极速版" ${module.apps.join(",") === "极速版" ? "selected" : ""}>极速版</option><option value="抖音,极速版" ${module.apps.length > 1 ? "selected" : ""}>抖音、极速版</option></select></label></div>
        <div class="am-picker-wrap">${renderPicker()}</div><div class="am-sources">${module.sources.map(sourceCard).join("")}</div>
        ${area("分析思路（可选）", "reasoning", module.reasoning, "如需结论，请说明分析顺序、判断方法和归因证据的组织方式")}
        ${area("注意事项（可选）", "considerations", module.considerations, "补充分析边界、数据口径及需要关注的问题")}
        ${module.attempts.length ? `<details class="am-trial-history"><summary>试跑记录 <span>${module.attempts.length}</span></summary><div>${module.attempts.map((attempt) => `<a href="#/analysis/${attempt.id}"><span>${attempt.sourceTrial ? "取数试跑" : "分析试跑"} · ${attempt.status === "success" ? "成功" : attempt.status === "running" ? "运行中" : "失败"}</span><small>${esc(time(attempt.startedAt))}</small>${icon("arrow-up-right")}</a>`).join("")}</div></details>` : ""}
      </div><aside class="am-version-panel"><header><strong>版本记录</strong><span>${module.versions.length} 个版本</span></header>
        ${module.versions.length ? module.versions.slice().reverse().map((version) => `<button type="button" data-action="mod-version" data-number="${version.number}"><strong>v${version.number}</strong><small>${esc(time(version.publishedAt))}</small><span>${esc(version.operator)}</span></button>`).join("") : "<p>暂无版本记录</p>"}</aside></div></div>`;
    createIcons({ icons });
  }
  function refreshSources() {
    outlet.querySelector(".am-sources").innerHTML = store.analysis.sources.map(sourceCard).join("");
    outlet.querySelector(".am-picker-wrap").innerHTML = renderPicker();
    createIcons({ icons }); refreshActions();
  }
  function refreshActions() {
    const module = store.analysis;
    const trial = outlet.querySelector('[data-action="mod-trial"]');
    if (trial) trial.disabled = running || moduleIssues(store, module).length > 0 || !module.reasoning.trim();
    const h1 = outlet.querySelector(".am-heading-line h1");
    if (h1) h1.textContent = module.name || "新建实验分析模块";
    const status = outlet.querySelector(".am-heading-line .am-state"), latest = module.versions.at(-1);
    if (status) status.textContent = !module.savedAt ? "尚未保存"
      : latest && latest.signature !== moduleHash(module) ? "有未发布修改"
      : latest ? `v${latest.number} · ${stateNames[moduleState(module)]}` : "草稿";
  }
  function refreshSelection(source) {
    const card = outlet.querySelector(`[data-source-id="${source.id}"]`), definition = sourceDefinition(store, source);
    card.querySelector(".am-selection-summary").innerHTML = sourceSummary(source);
    card.querySelector(".am-selected-count").textContent = `已选 ${source.metricKeys.length} 个指标${definition.dimensions.length ? ` · ${source.dimensionKeys.length} 个维度` : ""}`;
    for (const [kind, fields, selected] of [["metric", definition.metrics, source.metricKeys], ["dimension", definition.dimensions, source.dimensionKeys]]) {
      const column = card.querySelector(`.am-choice-column.${kind}`);
      column.querySelector(".am-choice-count").textContent = `已选 ${selected.length}/${fields.length}`;
      const all = column.querySelector('[data-action="mod-all"]');
      if (all) all.textContent = selected.length === fields.length ? "清空" : "全选";
      column.querySelectorAll("input[type=checkbox]").forEach((input) => { input.checked = selected.includes(input.value); });
    }
    card.querySelector('[data-action="mod-trial-source"]').disabled = running
      || moduleIssues(store, { ...store.analysis, name: store.analysis.name || "新模块" }, [source]).length > 0;
    refreshActions();
  }
  const touch = () => { store.analysis.updatedAt = new Date().toISOString(); persist(); };
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
    const module = store.analysis, source = module.sources.find((source) => source.id === id);
    if (action === "new") { location.hash = "/modules/new"; return; }
    if (action === "copy") {
      const original = activate(id), copy = clone(original);
      Object.assign(copy, { id: uid("module"), key: "", name: `${copy.name}（副本）`, savedAt: "",
        updatedAt: new Date().toISOString(), versions: [], attempts: [], enabled: true, archived: false });
      copy.sources.forEach((source) => { source.id = uid("source"); });
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
    if (action === "move") {
      const from = module.sources.indexOf(source), to = from + Number(trigger.dataset.direction);
      if (to < 0 || to >= module.sources.length) return;
      module.sources.splice(from, 1); module.sources.splice(to, 0, source); touch(); refreshSources(); return;
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
    if (model === "mod-search") { search = el.value; renderListResults(); return true; }
    if (model === "mod-state" || model === "mod-sort") { if (model === "mod-state") state = el.value; else sort = el.value; renderListResults(); return true; }
    const module = store.analysis;
    if (model.startsWith("mod-field.")) {
      const key = model.slice(10);
      if (key.startsWith("context:")) module.context[key.slice(8)] = el.value;
      else module[key] = el.value;
      touch(); refreshActions(); return true;
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
    if (model === "mod-report") { source.showInReport = el.checked; touch(); return true; }
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
  outlet.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
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
