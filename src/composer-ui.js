import { createIcons, icons } from "lucide";
import {
  clone, uid, COMPOSER_KEY, loadComposer, newItem, newAbility, makeReference, resolveItem,
  referenceLabel, entities, itemCurrentRun, itemReviewSignature,
  abilityCurrentRun, abilitySignature, defaultContext,
  outputDimensions, directQuery, syncQueryGroups, completeGroup, sourceType, currentActor, businessGoal, businessGoals,
  activeGroups, showsOverall, builtinDimensionOwners, dimensionCategory, dimensionCategoryLabels, knownDimensionValues, metricSQL
} from "./composer-data.js";
import { calculationTypes, aggregations, metricRows, metricFields, metricIssues, newMetric, syncMetrics, entityAlias, userMetricSQL } from "./composer-metrics.js";
import { parameterCatalog, scenarios, formatValue } from "./prototype-data.js";
import {
  sourceLabels, stateLabels, matchesCatalog, catalogPublicationState, trackChanges,
  assertMutable, saveDraft, keyImpact, setArchived
} from "./composer-management.js";
import {
  parseItem, syncDimension, runItem, publishItem, itemPublishIssues, attachItem, runAbility,
  publishAbility, abilityPublishIssues, useVersion, runAnalysis, abilityModes, compileMode
} from "./composer-engine.js";
import { abilityProgress, itemProgress } from "./composer-progress.js";
import { abilityCatalogActions } from "./composer-catalog.js";
import { createPublicationHistory } from "./composer-history.js";
import { createTrialHistory } from "./composer-trial-history.js";
import { findTrialRun as ownedTrialRun, trialRuns, trialExperiment, trialRecordStatus, trialRecordTime } from "./composer-trial-records.js";
import { trialSnapshot } from "./composer-trial-snapshot.js";
import { createDimensionDialog } from "./composer-dimension-dialog.js";
import { listAbilitySources, hasAbilityRetrievalContent, loadAbilityIntoDraft, builtinAbilityCopyIssue, copyBuiltinAbility } from "./retrieval-configs.js";
import "./prototype.css";
import "./composer.css";

const esc = (v = "") => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = (n) => `<i data-lucide="${n}"></i>`;
const btn = (a, t, i = "", c = "", x = "") => `<button type="button" class="p-button ${c}" data-action="${a}" ${x}>${i ? icon(i) : ""}${t}</button>`;
const badge = (t, c = "") => `<span class="p-badge ${c}">${esc(t)}</span>`;
const date = (v) => v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "未保存";
const input = (t, m, v, x = "") => `<label class="p-field"><span>${t}</span><input data-model="${m}" value="${esc(v)}" ${x}></label>`;
const readonlyField = (title, value) => `<div class="p-field"><span>${title}</span><div class="c-readonly-value">${esc(value)}</div></div>`;
const area = (t, m, v) => `<label class="p-field"><span>${t}</span><textarea data-model="${m}">${esc(v)}</textarea></label>`;
const select = (t, m, options, v, x = "") => `<label class="p-field"><span>${t}</span><select data-model="${m}" ${x}>${options.map(([k, n]) => `<option value="${esc(k)}" ${String(k) === String(v) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
const check = (t, m, v, x = "") => `<label class="c-check"><input type="checkbox" data-model="${m}" ${v ? "checked" : ""} ${x}><span>${t}</span></label>`;
const issuesHTML = (list) => list.length ? `<div class="p-issues" role="alert">${icon("circle-alert")}<div><strong>请处理以下问题</strong><ul>${list.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div></div>` : "";
const statuses = { running: "运行中", success: "成功 · 有数据", empty: "成功 · 0 行", failed: "失败", permission: "权限不足", timeout: "超时", insufficient: "分析输入不足" };
const busyAttr = (v) => v ? "disabled" : "";
function syntax(sql) {
  const pattern = /(--[^\n]*|'(?:''|[^'])*'|\$\{\w+\}|\{\{\w+\}\}|\b(?:SELECT|FROM|WHERE|JOIN|LEFT|ON|GROUP|BY|ORDER|AS|AND|OR|IN|BETWEEN|CASE|WHEN|THEN|ELSE|END|DESC|SUM|COUNT|NULLIF|WITH|LIMIT|DISTINCT)\b)/gi;
  let html = "", cursor = 0;
  for (const m of sql.matchAll(pattern)) {
    const t = m[0], cls = t.startsWith("--") ? "comment" : t.startsWith("'") ? "literal" : /^\$|\{/.test(t) ? "param" : "keyword";
    html += esc(sql.slice(cursor, m.index)) + `<span class="sql-${cls}">${esc(t)}</span>`; cursor = m.index + t.length;
  }
  return html + esc(sql.slice(cursor)) + "\n";
}
function table(record, highlight = -1) {
  if (!record?.rawRows?.length) return `<div class="p-empty">${icon("table-2")}<p>${record?.status === "empty" ? "本次执行返回 0 行，请核对筛选条件。" : "本次尚无可用数据。"}</p></div>`;
  return `<div class="p-table-scroll"><table class="p-table"><thead><tr><th>行</th>${record.fields.map((f) => `<th>${esc(f.name)}<small>${esc(f.key)}</small></th>`).join("")}</tr></thead><tbody>${record.rawRows.map((r, i) => `<tr id="evidence-${i}" class="${i === highlight ? "evidence-row" : ""}"><td>${i + 1}</td>${record.fields.map((f) => `<td title="原值：${esc(r[f.alias] === null ? "NULL" : r[f.alias])}">${esc(formatValue(r[f.alias], f, r))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const section = (title, desc, body, actions = "", id = "", cls = "") => `<section class="p-section${cls ? ` ${cls}` : ""}" ${id ? `id="${id}"` : ""}><header><div><h2>${title}</h2>${desc ? `<p>${desc}</p>` : ""}</div><div class="p-actions">${actions}</div></header>${body}</section>`;

export function mountComposer({ capabilities, showToast, applyPresetSelection }) {
  const store = loadComposer(), main = document.querySelector(".main-content"), catalog = document.querySelector(".capability-page");
  const outlet = document.createElement("section"); outlet.className = "prototype-outlet"; main.append(outlet);
  const publicationHistory = createPublicationHistory(outlet);
  const trialHistory = createTrialHistory(outlet);
  const overlay = document.createElement("div"); overlay.className = "p-overlay"; overlay.hidden = true; document.querySelector(".app-shell").append(overlay);
  const trialOverlay = document.createElement("div"); trialOverlay.className = "p-overlay c-trial-overlay"; trialOverlay.hidden = true; document.querySelector(".app-shell").append(trialOverlay);
  let trialSession;
  let ability, item, issues = [], busy = false, fieldDraft, pickerKind = "", dialogKind = "", previousFocus, selectedRecord = "", selectedRun = "", highlight = -1, analysisTab = "output", trialKind = "", attachDraft;
  let parameterOpen = false, parameterSearch = "";
  let catalogSource = "all", catalogGoal = "all", catalogState = "all", pendingArchive;
  let presetId = "", presetResult = "";
  let abilityLoadTarget, abilitySourceSearch = "", abilitySourceId = "", abilityLoadError = "", abilityLoadBusy = false;
  let dimensionPicker, valueDraft;
  let publishFailure = false;
  const progressHTML = new WeakMap();
  const parseTimers = new Map(), parsing = new Map();
  let parseSequence = 0;
  const persist = () => {
    trackChanges(store);
    try { localStorage.setItem(COMPOSER_KEY, JSON.stringify(store)); return true; }
    catch { showToast("本地存储已满或不可用，请导出当前工作区保存。"); return false; }
  };
  const dimensionDialog = createDimensionDialog({
    shell: document.querySelector(".app-shell"), store, persist, showToast,
    canEdit: (owner) => !abilityLoadBlocked(owner),
    onCommit: (owner) => {
      issues = [];
      if (ability === owner) refreshDimensions();
      else if (item?.ownerAbilityId === owner.id) {
        refreshItemDimensions();
      }
    }
  });
  for (const obj of [...store.items, ...store.abilities]) {
    obj.runs.forEach((r) => { if (r.status === "running") { r.status = "failed"; r.error = "页面重载中断了本地任务，请重新运行。"; } });
  }
  store.analysis.attempts.forEach((a) => { if (a.status === "running") { a.status = "insufficient"; a.error = "页面重载中断了本地分析，请重新试跑。"; } });
  persist();
  for (const [id, selection] of Object.entries(store.presetDrafts)) applyPresetSelection(id, selection);
  const catalogActions = document.createElement("div"); catalogActions.className = "p-catalog-actions p-actions";
  catalogActions.innerHTML = btn("new-ability", "新建取数能力", "plus", "primary");
  catalog.querySelector(".capability-count").before(catalogActions);
  const filters = document.createElement("div"); filters.className = "c-catalog-filters";
  filters.innerHTML = select("来源", "catalog-source", [["all", "全部"], ...Object.entries(sourceLabels).map(([k, [label]]) => [k, label])], "all")
    + select("业务目标", "catalog-goal", [["all", "全部"], ...businessGoals.map((goal) => [goal, goal])], "all")
    + select("发布状态", "catalog-state", Object.entries(stateLabels).map(([key, label]) => [key, key === "all" ? "全部" : label]), "all");
  catalog.querySelector(".catalog-toolbar").prepend(filters);
  function refreshIcons() { createIcons({ icons }); }
  function sourceBadge(obj) {
    const [label, color] = sourceLabels[sourceType(obj)]; return badge(label, color);
  }
  function moreActions(obj, type) {
    const source = sourceType(obj);
    if (source === "builtin_rpc" || (source === "builtin_sql" && (type !== "ability" || obj.archived))) return "";
    const issue = source === "builtin_sql" ? builtinAbilityCopyIssue(store, obj) : "";
    const history = type === "ability" && obj.runs?.length
      ? btn("trial-history-catalog", "历史试跑记录", "history", "link", `data-id="${esc(obj.id)}"`) : "";
    const actions = history + (source === "builtin_sql"
      ? `<span class="c-action-hint" ${issue ? `tabindex="0" title="${esc(issue)}" aria-label="${esc(issue)}"` : ""}>${btn("copy-builtin-ability", "复制为自定义 SQL", "copy", "link", `data-id="${esc(obj.id)}" ${issue ? "disabled" : ""}`)}</span>`
      : btn(obj.archived ? "restore" : "archive", obj.archived ? "恢复" : "归档", obj.archived ? "archive-restore" : "archive", "link", `data-id="${esc(obj.id)}" data-type="${type}"`));
    return `<details class="c-more-actions"><summary aria-label="${esc(obj.name)} 更多操作" aria-expanded="false">${icon("ellipsis")}</summary><div aria-label="更多操作">${actions}</div></details>`;
  }
  function keyField(obj) {
    return `<div data-progress-key="${esc(obj.id)}">${keyFieldContent(obj)}</div>`;
  }
  function keyFieldContent(obj) {
    return obj.key && (obj.savedAt || obj.versions.length) ? `<div class="c-key-field">${readonlyField("稳定 Key（系统生成）", obj.key)}</div>` : "";
  }
  function catalogMetadata(obj) {
    const state = catalogPublicationState(store, obj), v = obj.versions?.at(-1);
    const version = v ? badge(`已发布 v${v.number}`, "green") : badge(obj.title ? "版本未提供" : "仅草稿");
    const updated = obj.updatedAt || obj.savedAt || v?.publishedAt;
    const updatedText = updated ? date(updated) : "—";
    return sourceBadge(obj) + version
      + (state === "changed" ? badge(`v${v.number + 1} 草稿待发布`, "amber") : "")
      + (obj.archived ? badge("已归档") : "")
      + `<span class="c-catalog-updated" title="更新时间：${esc(updatedText)}">更新：${esc(updatedText)}</span>`;
  }
  function renderCatalog() {
    const filters = { search: document.querySelector("#catalog-search").value, source: catalogSource, goal: catalogGoal, state: catalogState };
    const list = catalog.querySelector("#capability-list");
    list.querySelectorAll(".c-managed-capability").forEach((el) => el.remove());
    list.querySelectorAll("[data-capability-id]").forEach((el) => {
      const obj = capabilities.find((candidate) => candidate.id === el.dataset.capabilityId);
      el.hidden = !matchesCatalog(store, obj, filters);
      el.querySelector(".c-catalog-meta").innerHTML = catalogMetadata(obj);
    });
    const rows = store.abilities.filter((a) => matchesCatalog(store, a, filters))
    .sort((a, b) => Number(Boolean(b.demo)) - Number(Boolean(a.demo))).map((a) => {
      const actions = abilityCatalogActions(store, a);
      const metricCount = a.metrics.reduce((count, ref) => count + ref.metricKeys.length, 0);
      const action = (name, label, symbol, hint = "", extra = "") => `<button type="button" class="outline-button" data-action="${name}" data-id="${esc(a.id)}" ${hint ? `title="${esc(hint)}"` : ""} ${extra}>${icon(symbol)}${label}</button>`;
      const trial = actions.trial ? action("run-catalog", actions.trial.label, actions.trial.history ? "history" : "flask-conical",
        actions.trial.history ? "查看已有验证记录，获取数据仍需通过配置检查" : "试跑当前配置",
        `data-run-id="${esc(actions.trial.runId)}"`) : "";
      const analysis = actions.analysis ? action("use-ability", "用于分析", "arrow-up-right",
        `使用已发布 v${actions.versionNumber}，不使用当前草稿`) : "";
      return `<article class="capability-panel c-managed-capability" data-managed-id="${esc(a.id)}"><header class="capability-summary"><div class="c-catalog-heading"><button type="button" class="summary-button" data-action="edit-ability" data-id="${esc(a.id)}" aria-label="${esc(a.name)} · ${actions.label}" title="${esc(a.name)}"><span class="capability-type">取数能力</span><strong>${esc(a.name)}</strong><span class="selected-summary">已配置 ${metricCount} 个指标</span></button><div class="c-catalog-meta" aria-label="来源、版本和更新时间">${catalogMetadata(a)}</div></div><div class="summary-actions">${action("edit-ability", actions.label, actions.readOnly ? "eye" : "square-pen")}${trial}${analysis}${moreActions(a, "ability")}</div></header></article>`;
    }).join("");
    list.insertAdjacentHTML("afterbegin", rows);
    catalog.querySelector("#empty-results").hidden = Boolean([...list.children].some((el) => !el.hidden));
    document.querySelector(".capability-count").innerHTML = `${icon("database")}${[...list.children].filter((el) => !el.hidden).length} 项能力`; refreshIcons();
  }
  function header(title, desc, actions, parent = "取数能力", href = "#/capabilities") {
    return `<div class="p-breadcrumb"><a href="${href}">${parent}</a>${icon("chevron-right")}<span>${esc(title)}</span></div><header class="p-page-header"><div><h1>${esc(title)}</h1>${desc ? `<p>${desc}</p>` : ""}</div><div class="p-actions">${actions}</div></header>`;
  }
  function pageProgress(obj = item || ability) {
    return obj.draft ? itemProgress(obj, obj.context || defaultContext, obj.scenario || "normal") : abilityProgress(store, obj);
  }
  function trialEntryHTML(progress, type) {
    if (!progress.trialEntry) return "";
    const history = progress.trialEntry === "history";
    const label = history ? "查看验证" : type === "ability" ? "整体试跑" : "进入取数验证";
    return btn(`${type}-context`, label, history ? "history" : "play", type === "ability" ? "primary" : "",
      `${busyAttr(busy)} ${history && progress.summary ? `data-run-id="${esc(progress.summary.runId)}"` : ""}`);
  }
  function publishEntryHTML(progress, type, trial = false) {
    return progress.canPublish ? btn(`publish-${type}`, type === "item" ? "发布 SQL 取数项" : trial ? "发布取数能力组" : "发布能力", "upload", trial ? "primary" : "", busyAttr(busy)) : "";
  }
  function nextIssueHTML(progress, type) {
    return !progress.hasRuns && !progress.canTrial && !progress.readOnly && (type !== "item" || !item.ownerAbilityId)
      ? `<p class="c-progress-hint">${esc(progress.nextIssue)}</p>` : "";
  }
  function validationSummaryHTML(progress) {
    const summary = progress.summary;
    if (!progress.hasRuns || !summary) return "";
    const tone = summary.status === "reviewed" ? "green" : ["needs_run", "needs_review", "empty", "failed", "permission", "timeout"].includes(summary.status) ? "amber" : "";
    return `<section class="c-validation-summary" aria-label="取数验证摘要"><strong>取数验证</strong>${badge(summary.label, tone)}<time ${summary.at ? `datetime="${esc(summary.at)}"` : ""}>${esc(summary.at ? date(summary.at) : "时间未记录")}</time>${btn("ability-context", "查看结果", "arrow-up-right", "link", `data-run-id="${esc(summary.runId)}"`)}</section>`;
  }
  function availableFocus(root, selector) {
    return [...root.querySelectorAll(selector)].find((el) => !el.disabled && el.getClientRects().length);
  }
  function pageActionFallback() {
    return availableFocus(outlet, '.p-page-header [data-action="save"], .p-page-header [data-action$="-context"], .p-page-header button')
      || availableFocus(main, '[data-action], a[href]');
  }
  function updateProgressHTML(target, html, fallback) {
    if (!target || progressHTML.get(target) === html) return;
    const active = target.contains(document.activeElement) ? document.activeElement : null;
    const model = active?.dataset.model, action = active?.dataset.action, id = active?.dataset.id;
    target.innerHTML = html; progressHTML.set(target, html);
    if (active) {
      const replacement = availableFocus(target, "summary, [data-model], [data-action]");
      const same = [...target.querySelectorAll("[data-model], [data-action]")].find((el) =>
        !el.disabled && (model ? el.dataset.model === model : action && el.dataset.action === action && el.dataset.id === id));
      (same || replacement || fallback?.())?.focus({ preventScroll: true });
    }
  }
  function historyRevision(obj, type) {
    return JSON.stringify([obj.id, type, Boolean(obj.archived), obj.versions.length]);
  }
  function refreshProgress() {
    const obj = item || ability;
    if (!obj) return;
    refreshAbilityLoadControls();
    const type = item ? "item" : "ability", progress = pageProgress(obj);
    if (ability && trialHistory.refresh(ability)) refreshIcons();
    if (trialSession) {
      updateProgressHTML(trialOverlay.querySelector('[data-progress="publish"]'), !trialSession.recordView && trialSession.mode === "result" ? publishEntryHTML(progress, type, true) : "",
        () => availableFocus(trialOverlay, '.c-trial-footer [data-action="close-trial"], [data-action="trial-run"]'));
      return;
    }
    updateProgressHTML(outlet.querySelector('[data-progress="trial"]'), trialEntryHTML(progress, type), pageActionFallback);
    updateProgressHTML(outlet.querySelector('[data-progress="publish"]'), publishEntryHTML(progress, type), pageActionFallback);
    updateProgressHTML(outlet.querySelector("#composer-next-issue"), nextIssueHTML(progress, type));
    outlet.querySelectorAll("[data-progress-key]").forEach((target) => {
      if (target.dataset.progressKey === obj.id) updateProgressHTML(target, keyFieldContent(obj));
    });
    if (ability) updateProgressHTML(outlet.querySelector("#ability-validation-summary"), validationSummaryHTML(progress), pageActionFallback);
    const history = outlet.querySelector("#composer-publication-history"), revision = historyRevision(obj, type);
    if (history && history.dataset.historyRevision !== revision) {
      updateProgressHTML(history, publicationHistory.render(obj, type, versionsHTML(obj, type)), pageActionFallback);
      history.dataset.historyRevision = revision;
    }
  }
  function renderGuide() {
    outlet.innerHTML = header("使用说明", "", btn("new-ability", "新建取数能力", "plus", "primary"))
      + section("配置与发布", "",
        `<ol class="c-guide-steps"><li><strong>新建取数能力</strong><p>填写能力名称和说明。</p></li><li><strong>编写并解析 SQL</strong><p>在“指标”中点击“新建 SQL”。可通过“可用参数”插入入参，解析后确认指标、维度及字段口径，再保存返回能力组。</p></li><li><strong>确认下钻分组</strong><p>检查 SQL 输出的维度；独立组分别取数，交叉组联合取数。其他粒度需提供对应 SQL。</p></li><li><strong>试跑与发布</strong><p>点击“整体试跑”，填写实验 ID 和观测时间，获取数据并核对结果，确认后发布能力。</p></li><li><strong>用于分析</strong><p>选择已发布的能力版本，填写分析思路，点击“分析试跑”；可从结论查看对应数据证据。</p></li></ol>`)
      + section("载入已有取数能力", "", `<p class="c-guide-copy">在可编辑能力页点击“保存草稿”左侧的“载入已有取数能力”，按名称或 Key 搜索来源。有发布版本时载入最新已发布版本，否则载入已保存草稿；已有取数内容会在确认后整体替换。当前能力名称、说明、Key、实验上下文和历史记录保留。载入后点击原“保存草稿”，再按现有流程试跑、核对与发布。</p>`);
    refreshIcons();
  }
  function itemContext() { return item.context || defaultContext; }
  function versionsHTML(obj, type) {
    return obj.versions.length ? obj.versions.slice().reverse().map((v) =>
      `<div class="p-version"><div><strong>v${v.number} · ${esc(v.definition.name)}</strong>${badge(v.fixture ? "预设版本" : "已发布", "green")}<span>${date(v.publishedAt)}</span><small>${esc(v.operation || (v.fixture ? "预设版本" : "发布"))} · ${esc(v.operator || "历史操作人未记录")} · ${type === "ability" ? `${v.modes.length} 份结果` : "SQL 定义"}</small></div><div class="p-actions">${btn("view-version", "查看快照", "file-code", "", `data-type="${type}" data-number="${v.number}"`)}${btn(type === "ability" ? "use-version" : "attach", type === "ability" ? "用于分析" : "关联取数能力组", "arrow-up-right", "", `data-number="${v.number}" ${obj.archived ? "disabled" : ""}`)}</div></div>`
    ).join("") : `<p class="p-muted">暂无发布版本。</p>`;
  }
  function sourceCards(kind) {
    const refs = kind === "metric" ? ability.metrics : ability.dimensions;
    if (!refs.length) return `<div class="c-source-empty">${icon(kind === "metric" ? "chart-no-axes-column" : "list-filter")}<span>选择已有${kind === "metric" ? "指标" : "维度"}，或新建 SQL 定义。</span></div>`;
    return refs.map((ref) => {
      const source = resolveItem(store, ref), origin = store.items.find((s) => s.id === ref.itemId);
      const options = [...(origin.ownerAbilityId === ability.id ? [[0, "能力内草稿"]] : []), ...origin.versions.map((v) => [v.number, `已发布 v${v.number}`])];
      return `<article class="c-source"><div class="c-source-head"><div class="p-row">${icon(source.preset ? "library" : "code-2")}<strong>${esc(source.name)}</strong>${sourceBadge(source)}${origin.archived ? badge("已归档引用") : ""}</div><div class="p-actions">${select("引用版本", `ref.${kind}.${source.id}`, options, ref.version)}${btn("edit-source", ref.version ? "查看 / 复制 SQL" : "编辑 SQL", "square-pen", "link", `data-id="${source.id}" data-version="${ref.version}"`)}${btn("remove-source", "移除", "x", "link", `data-kind="${kind}" data-id="${source.id}"`)}</div></div>${kind === "metric" ? `<div class="c-metric-checks">${metricFields(source).map((f) => check(`${esc(f.name)} <small>${esc(f.key)}</small>`, `metric.${source.id}.${f.key}`, ref.metricKeys.includes(f.key))).join("")}</div>${directQuery(source) && outputDimensions(source).length ? `<p>随此 SQL 一起取数：${outputDimensions(source).map((f) => badge(f.name)).join(" ")} · ${outputDimensions(source).length > 1 ? "交叉" : "单维"}结果</p>` : ""}` : `<p>${esc(source.draft.dimensionName)} · ${esc(source.draft.dimensionKey)} · ${entities[source.draft.entity].name} · ${esc(source.draft.timing)}</p>`}</article>`;
    }).join("");
  }
  function hasOverallData() {
    const ability = dimensionOwner();
    return ability.includeOverall && ability.metrics.some((r) => r.metricKeys.length && !outputDimensions(resolveItem(store, r)).length);
  }
  function dimensionOwner() {
    return ability || store.abilities.find((owner) => owner.id === item?.ownerAbilityId);
  }
  function dimensionOptions() {
    const ability = dimensionOwner();
    const metrics = ability.metrics.filter((r) => r.metricKeys.length).map((r) => resolveItem(store, r));
    const fixed = metrics.find(directQuery);
    const options = store.items.filter((s) => s.kind === "dimension" && !s.archived
      && (s.versions.length || s.ownerAbilityId === ability.id || ability.dimensions.some((r) => r.itemId === s.id)))
      .filter((s) => !builtinDimensionOwners[s.id] || metrics.some((m) => builtinDimensionOwners[s.id].includes(m.id)) || ability.dimensions.some((r) => r.itemId === s.id))
      .map((s) => {
        const ref = ability.dimensions.find((r) => r.itemId === s.id) || makeReference(s);
        const d = resolveItem(store, ref);
        return {
          id: s.id, ref, category: dimensionCategory(s), name: d.draft.dimensionName, key: d.draft.dimensionKey, definition: d,
          detail: dimensionCategory(s) === "builtin" ? metrics.filter((m) => builtinDimensionOwners[s.id].includes(m.id)).map((m) => m.name).join("、") || "已关联的指标内置维度" : d.description,
          reason: !metrics.length ? "请先选择指标" : builtinDimensionOwners[s.id] && !metrics.some((m) => builtinDimensionOwners[s.id].includes(m.id)) ? "请先选择该维度所属的内置指标组" : fixed ? `${fixed.name} 未提供此粒度的 SQL 变体` : metrics.some((m) => m.draft.entity !== d.draft.entity) ? "与所选指标的关联实体不同" : ""
        };
      });
    for (const ref of ability.metrics.filter((r) => r.metricKeys.length)) {
      const query = resolveItem(store, ref), dims = outputDimensions(query);
      if (!directQuery(query) || !dims.length) continue;
      options.push({
        id: `query:${query.id}`, queryItemId: query.id, category: query.preset ? "builtin" : "custom",
        name: dims.map((f) => f.name).join(" × "), key: dims.map((f) => f.key).join(" / "),
        detail: `${query.name} · ${dims.length > 1 ? "交叉" : "单维"}结果`, definition: query,
        reason: dimensionPicker && dimensionPicker.target !== "single" ? "已绑定完整 SQL，其他交叉需提供对应 SQL" : ""
      });
    }
    return options;
  }
  function groupDimensions(group) {
    const ability = dimensionOwner();
    if (group.queryItemId) {
      const ref = ability.metrics.find((r) => r.itemId === group.queryItemId), source = ref && resolveItem(store, ref);
      return source ? outputDimensions(source).map((f) => ({ ...f, itemId: source.id, category: source.preset ? "builtin" : "custom", values: source.draft.parseSample?.find((p) => p.alias === f.alias)?.values || [] })) : [];
    }
    return group.members.flatMap((id) => {
      const ref = ability.dimensions.find((r) => r.itemId === id);
      if (!ref) return [];
      const source = resolveItem(store, ref), d = source.draft;
      return [{ key: d.dimensionKey, name: d.dimensionName, itemId: id, category: dimensionCategory(source), values: d.enumValues?.length ? d.enumValues : knownDimensionValues[id] || [], type: d.valueType }];
    });
  }
  function nameGroup(group) {
    group.name = groupDimensions(group).map((d) => d.name).join(" × ") || "交叉维度";
  }
  function pruneDimensions() {
    const ability = dimensionOwner();
    const used = new Set(ability.groups.filter((g) => !g.queryItemId).flatMap((g) => g.members));
    ability.dimensions = ability.dimensions.filter((r) => used.has(r.itemId));
  }
  function dimensionPickerRows() {
    const ability = dimensionOwner();
    const p = dimensionPicker, target = ability.groups.find((g) => g.id === p.target);
    const existing = new Set(target?.members || (p.target === "single" ? activeGroups(ability).filter((g) => !g.cross).flatMap((g) => g.queryItemId ? [`query:${g.queryItemId}`] : g.members) : []));
    const options = dimensionOptions().filter((d) => d.category === p.tab && [d.name, d.key, d.detail].join(" ").toLowerCase().includes(p.search.toLowerCase()));
    return options.map((d) => {
      const included = existing.has(d.id) || (d.queryItemId && activeGroups(ability).some((g) => g.queryItemId === d.queryItemId));
      const max = p.target !== "single" && p.selected.length + (target?.members.length || 0) >= 4 && !p.selected.includes(d.id);
      const reason = included ? "已添加" : d.reason || (max ? "最多交叉 4 个维度" : "");
      return `<label class="c-dimension-option ${reason ? "unavailable" : ""}" title="${esc(reason || d.detail)}"><input type="checkbox" data-model="dimension-choice" value="${esc(d.id)}" ${included || p.selected.includes(d.id) ? "checked" : ""} ${reason ? "disabled" : ""}><span><strong>${esc(d.name)}</strong><small>${esc(d.key)}</small><small>${esc(reason || d.detail)}</small></span></label>`;
    }).join("") || `<div class="c-dimension-no-results">${p.search ? "没有匹配的维度" : p.tab === "builtin" ? "选择内置指标组后，可使用其自带维度" : p.tab === "custom" ? "暂无自定义维度，可新建 SQL" : "暂无可用公共维度"}</div>`;
  }
  function dimensionPickerHTML() {
    if (!dimensionPicker) return "";
    const p = dimensionPicker, cross = p.target !== "single";
    return `<div class="c-dimension-picker" role="dialog" aria-label="选择维度"><header><strong>${cross ? "选择交叉成员" : "选择下钻维度"}</strong>${btn("dimension-picker-close", "", "x", "link", 'aria-label="关闭维度选择"')}</header><label class="search-field">${icon("search")}<input type="search" data-model="dimension-search" aria-label="搜索维度" placeholder="搜索维度名称或 Key" value="${esc(p.search)}"></label><div class="c-dimension-picker-body"><nav aria-label="维度来源">${Object.entries(dimensionCategoryLabels).map(([key, name]) => `<button type="button" data-action="dimension-tab" data-id="${key}" aria-pressed="${key === p.tab}" class="${key === p.tab ? "active" : ""}">${name}</button>`).join("")}</nav><div id="dimension-picker-options">${dimensionPickerRows()}</div></div><footer><span id="dimension-picker-count">${cross ? "最多交叉 4 个维度" : "多选时分别取数"}</span><div class="p-actions">${p.tab === "custom" ? btn("new-owned-dimension", "新建 SQL 维度", "code-2", "link") : ""}${btn("dimension-picker-confirm", "添加所选", "check", "primary")}</div></footer></div>`;
  }
  function dimensionReferencesHTML(group) {
    const ability = dimensionOwner();
    const kind = group.queryItemId ? "metric" : "dimension";
    const ids = group.queryItemId ? [group.queryItemId] : group.members;
    return ids.map((id) => {
      const ref = (kind === "metric" ? ability.metrics : ability.dimensions).find((r) => r.itemId === id);
      const origin = store.items.find((s) => s.id === id);
      if (!ref || !origin) return "";
      const options = [...(origin.ownerAbilityId === ability.id ? [[0, "能力内草稿"]] : []), ...origin.versions.map((v) => [v.number, `已发布 v${v.number}`])];
      const editAction = kind === "dimension" && !ref.version && origin.ownerAbilityId === ability.id ? "edit-owned-dimension" : "edit-source";
      return `<div class="c-dimension-reference"><span>${esc(resolveItem(store, ref).name)}</span>${select("引用版本", `ref.${kind}.${id}`, options, ref.version, `aria-label="${esc(origin.name)} 维度引用版本"`)}${btn(editAction, ref.version ? "查看 / 复制 SQL" : "编辑 SQL", "square-pen", "link", `data-id="${id}" data-version="${ref.version}"`)}</div>`;
    }).join("");
  }
  function dimensionsHTML() {
    const ability = dimensionOwner();
    const groups = activeGroups(ability);
    return `<div class="c-dimension-toolbar"><label class="c-overall-switch"><input type="checkbox" role="switch" data-model="dimension-overall" ${hasOverallData() && showsOverall(ability) ? "checked" : ""} ${hasOverallData() ? "" : "disabled"}><span class="c-switch-track"></span><span>展示不拆分维度的数据</span></label>${!hasOverallData() && ability.metrics.some((r) => r.metricKeys.length) ? '<span class="c-dimension-note">当前指标未提供整体 SQL</span>' : ""}<div class="p-actions">${btn("dimension-pick-single", "添加维度", "plus")}${btn("dimension-pick-cross", "交叉维度", "combine", "", 'title="最多支持交叉 4 个维度"')}</div></div><div class="c-dimension-sources"><span>维度来源</span>${Object.entries(dimensionCategoryLabels).map(([key, label]) => btn("dimension-pick-source", label, key === "builtin" ? "chart-no-axes-column" : key === "public" ? "library" : "code-2", "", `data-source="${key}"`)).join("")}</div><div class="c-dimension-anchor">${dimensionPickerHTML()}</div>
      <div class="c-inline-dimension-host" data-dimension-editor-host></div><div class="c-dimension-cards">${groups.length ? groups.map((g) => {
        const dims = groupDimensions(g);
        return `<article class="c-dimension-card ${g.cross ? "is-cross" : ""}" data-group-id="${g.id}"><header><span>${g.cross ? icon("combine") + "交叉维度" : "单维拆分"}${g.queryItemId ? badge("SQL 已定义粒度", "purple") : ""}</span>${btn("dimension-remove-group", "", "x", "link", `data-id="${g.id}" aria-label="移除 ${esc(g.name)}"`)}</header>${dims.map((d) => {
          const selected = g.valueFilters?.[d.key], values = selected || d.values;
          return `<div class="c-dimension-row"><div class="c-dimension-name"><strong>${esc(d.name)}</strong><small>${dimensionCategoryLabels[d.category]}</small></div><button type="button" class="c-dimension-values" data-action="dimension-values" data-id="${g.id}" data-key="${esc(d.key)}" aria-label="选择 ${esc(d.name)} 的拆解取值"><span>拆解</span>${values.length ? values.slice(0, 3).map((v) => `<b>${esc(v === null ? "NULL" : v)}</b>`).join("") + (values.length > 3 ? `<b>+${values.length - 3}</b>` : "") : "<b>全部取值</b>"}${!selected && values.length ? '<small>全部</small>' : ""}${icon("chevron-down")}</button>${g.cross && !g.queryItemId ? btn("dimension-remove-member", "", "x", "link", `data-id="${g.id}" data-member="${d.itemId}" aria-label="移除交叉成员 ${esc(d.name)}"`) : ""}</div>`;
        }).join("")}${g.cross && !g.queryItemId && dims.length < 4 ? btn("dimension-pick-member", "请选择维度", "plus", "link c-add-cross-member", `data-id="${g.id}"`) : ""}
        <details class="c-dimension-settings"><summary>更多设置</summary><div class="p-form-grid two">${input("名称", `group.${g.id}.name`, g.name)}${input("说明（选填）", `group.${g.id}.description`, g.description)}</div>${ability.savedAt ? readonlyField("Key（系统生成）", g.key) : ""}${dimensionReferencesHTML(g)}<div class="p-actions">${btn("view-group-sql", "查看 SQL", "code-2", "link", `data-id="${g.id}"`)}</div></details></article>`;
      }).join("") : '<div class="c-dimensions-empty">添加维度，查看指标在不同人群中的分布</div>'}</div>`;
  }
  function refreshDimensions() {
    const section = outlet.querySelector("#ability-dimensions");
    if (!section) { if (item?.kind === "metric") refreshItemDimensions(); return; }
    const focus = document.activeElement;
    section.querySelector(".c-dimensions-content").innerHTML = dimensionsHTML();
    dimensionDialog.restore(section.querySelector("[data-dimension-editor-host]"), focus);
    if (ability.archived) freezeForms();
    refreshIcons(); updateValidity();
  }
  function refreshDimensionOptions() {
    const ability = dimensionOwner();
    const options = outlet.querySelector("#dimension-picker-options");
    if (!options || !dimensionPicker) return;
    options.innerHTML = dimensionPickerRows();
    const members = ability.groups.find((g) => g.id === dimensionPicker.target)?.members.length || 0;
    const count = dimensionPicker.selected.length;
    outlet.querySelector("#dimension-picker-count").textContent = `已选 ${count} 项${dimensionPicker.target === "single" ? " · 分别取数" : ` · 交叉最多 4 项${members ? `（已有 ${members} 项）` : ""}`}`;
    outlet.querySelector('[data-action="dimension-picker-confirm"]').disabled = !count || (dimensionPicker.target === "new" && count < 2);
  }
  function openDimensionPicker(target, tab) {
    const owner = dimensionOwner();
    if (!owner) throw new Error("请先关联取数能力组，再选择维度来源。");
    assertMutable(owner);
    dimensionPicker = { target, tab: "builtin", search: "", selected: [] };
    const available = dimensionOptions();
    dimensionPicker.tab = tab || available.find((d) => !d.reason)?.category || available[0]?.category || "public";
    refreshDimensions(); refreshDimensionOptions();
    outlet.querySelector('[data-model="dimension-search"]')?.focus({ preventScroll: true });
  }
  function closeDimensionPicker() {
    const target = dimensionPicker?.target;
    dimensionPicker = undefined; refreshDimensions();
    const action = target === "single" ? "dimension-pick-single" : target === "new" ? "dimension-pick-cross" : "dimension-pick-member";
    const trigger = [...outlet.querySelectorAll(`[data-action="${action}"]`)].find((el) => action !== "dimension-pick-member" || el.dataset.id === target);
    trigger?.focus({ preventScroll: true });
  }
  function valuePickerHTML() {
    const d = valueDraft;
    return `<div class="c-value-picker">${check("全部取值", "value-all", d.all)}<div class="c-value-options">${d.values.map((v, i) => check(esc(v === null ? "NULL（原值）" : v), `value-choice.${i}`, d.all || d.selected.includes(i), d.all ? "disabled" : "")).join("") || '<p class="c-config-hint">暂无已知取值，可在下方补充。</p>'}</div><div class="c-value-add"><input data-model="value-input" aria-label="补充拆解取值" placeholder="补充取值，多个用逗号分隔" value="${esc(d.input)}">${btn("value-add", "添加")}</div></div>`;
  }
  function refreshValuePicker() {
    const picker = overlay.querySelector("#dimension-value-picker");
    if (!picker) return;
    picker.innerHTML = valuePickerHTML();
    overlay.querySelector('[data-action="value-apply"]').disabled = !valueDraft.all && !valueDraft.selected.length;
  }
  function renderAbility() {
    syncQueryGroups(store, ability);
    const progress = abilityProgress(store, ability);
    outlet.innerHTML = header(ability.name, "配置指标、下钻维度与独立分组，整体试跑后发布给分析模块。",
      (abilityLoadReadOnly(ability) ? "" : btn("ability-load", "载入已有取数能力", "folder-open", "", busyAttr(abilityLoadBlocked(ability))))
      + btn("save", "保存草稿", "save") + `<span class="c-progress-action" data-progress="trial">${trialEntryHTML(progress, "ability")}</span><span class="c-progress-action" data-progress="publish">${publishEntryHTML(progress, "ability")}</span>`)
      + `<div id="composer-next-issue">${nextIssueHTML(progress, "ability")}</div>` + issuesHTML(issues)
      + section("基础信息", "", `<div class="p-form-grid two">${input("能力名称", "ability.name", ability.name)}${readonlyField("业务目标", businessGoal)}</div>${keyField(ability)}${area("能力说明", "ability.description", ability.description)}`)
      + section("指标", "", sourceCards("metric"),
        btn("pick-metric", "从已有指标库选择", "library") + btn("new-owned-metric", "新建 SQL", "plus", "primary"))
      + section("维度", "", `<div class="c-dimensions-content">${dimensionsHTML()}</div>`, "", "ability-dimensions")
      + `<div id="ability-validation-summary">${validationSummaryHTML(progress)}</div>`
      + `<div id="ability-trial-history" data-object-id="${esc(ability.id)}">${trialHistory.render(ability)}</div>`
      + `<div id="composer-publication-history" data-history-revision="${esc(historyRevision(ability, "ability"))}">${publicationHistory.render(ability, "ability", versionsHTML(ability, "ability"))}</div>`
      + `<div class="c-page-more">${moreActions(ability, "ability")}</div>`;
    if (progress.readOnly) freezeForms();
    trialHistory.refresh(ability);
    dimensionDialog.restore(outlet.querySelector("[data-dimension-editor-host]"));
    refreshIcons();
  }
  function freezeForms() {
    outlet.querySelectorAll("[data-model]").forEach((el) => { el.disabled = true; });
    outlet.querySelectorAll("[data-action]").forEach((el) => {
      if (["save", "publish-ability", "publish-item", "back-owner", "attach", "use-ability", "use-version", "sql-template"].includes(el.dataset.action) || /^(new-owned-|pick-|remove-|add-|edit-owned-|edit-field|edit-metric|metric-|template-|dimension-|insert-parameter|parse|accept-diff)/.test(el.dataset.action)) el.disabled = true;
    });
  }
  function resultDetails(record) {
    return `${table(record)}${record.checks?.length ? `<div class="c-associations">${record.checks.map((c) => badge(`${c.dimension}：${c.entities} 个实体 · 缺失 ${c.missing}`, "green")).join("")}</div>` : ""}<details class="p-snapshot"><summary>查看执行 SQL</summary><pre>${esc(record.renderedSql || "")}</pre></details>`;
  }
  function abilityResults() {
    if (trialSession?.recordView) return historicalResultsHTML();
    const run = trialSession ? currentTrialRun() : ability.runs.find((r) => r.id === selectedRun) || ability.runs[0];
    if (!run) return "";
    const valid = run?.status === "success" && run === abilityCurrentRun(store, ability);
    let modes = [];
    if (valid) { try { modes = abilityModes(store, ability); } catch { /* Keep the executed snapshot if configuration is incomplete. */ } }
    const records = (run?.records || []).map((r) => {
      const mode = modes.find((m) => m.id === r.modeId);
      return mode ? { ...r, fields: mode.fields, modeName: mode.name } : r;
    }).filter((r) => !valid || showsOverall(ability) || r.snapshot?.kind !== "overall");
    const record = records.find((r) => r.id === selectedRecord) || records[0];
    const body = !run ? `<div class="p-empty">${icon("play")}<p>运行整个能力，分别核对整体和各下钻组的取数结果。</p></div>` :
      `<div class="p-result-summary"><div class="p-row">${badge(statuses[run.status], run.status === "success" ? "green" : "amber")}${badge(valid ? "当前配置" : "历史 / 待验证")}<span>${run.records.length} 份执行 · ${esc(run.id)}</span></div></div>${issuesHTML(run.error ? [run.error] : [])}${run.status === "running" ? `<div class="p-progress"><span></span>正在运行各指标来源与下钻组合…</div>` : ""}
      <div class="p-mode-tabs">${records.map((r) => btn("select-record", `${esc(r.modeName)} · ${r.rawRows?.length || 0} 行`, "", r === record ? "active" : "", `data-id="${r.id}"`)).join("")}</div>${record ? resultDetails(record) : ""}
      <div class="p-confirm-result">${check("已逐一核对全部结果、指标口径和下钻粒度", "approve-ability", valid && run.approvedFor === abilitySignature(store, ability), valid && ability.scenario === "normal" ? "" : "disabled")}${!valid ? `<small>当前配置或本次运行未通过全部验证，需重新整体试跑。</small>` : ""}</div>`;
    return section("整体试跑结果", "试跑记录仅属于当前能力，不进入用户侧报告列表。", body, "", "ability-results");
  }
  function editorHTML() {
    const d = item.draft;
    return `<div class="c-sql-layout ${parameterOpen ? "parameters-open" : ""}"><div class="c-editor"><div class="p-editor-toolbar"><span>${icon("code-2")}SQL</span><div>${btn("toggle-parameters", "可用参数", "braces", "link", `aria-expanded="${parameterOpen}"`)}${check("自动解析", "draft.autoParse", d.autoParse !== false)}</div></div><div class="p-code"><pre class="p-line-numbers" aria-hidden="true">${d.sql.split("\n").map((_, i) => i + 1).join("\n")}</pre><div class="p-code-body"><pre class="p-code-highlight" aria-hidden="true">${syntax(d.sql)}</pre><textarea id="sql-editor" aria-label="SQL 编辑器" spellcheck="false" data-model="draft.sql">${esc(d.sql)}</textarea></div></div></div><aside class="c-parameter-catalog" id="parameter-catalog" ${parameterOpen ? "" : "hidden"}><header><strong>可用参数</strong>${btn("toggle-parameters", "收起", "x", "link")}</header><label class="search-field">${icon("search")}<input type="search" aria-label="搜索可用参数" data-model="parameter-search" value="${esc(parameterSearch)}" placeholder="搜索名称或 Key"></label><div id="parameter-catalog-list">${parameterRows()}</div><small>点击插入光标位置</small></aside></div><div id="sql-parse-tools">${parseToolsHTML()}</div>`;
  }
  function parameterRows() {
    const types = { number: "数字", string: "字符串", date: "日期", number_list: "数字列表" };
    return parameterCatalog.filter((p) => [p.key, p.name, p.description].join(" ").toLowerCase().includes(parameterSearch.toLowerCase()))
      .map((p) => `<button type="button" class="c-parameter-option" data-action="insert-parameter" data-key="${p.key}"><span><strong>${esc(p.name)}</strong><small>${types[p.type]}</small></span><code>\${${p.key}}</code><p>${esc(p.description)}</p></button>`).join("") || `<p class="p-muted">没有匹配的参数。</p>`;
  }
  function parseToolsHTML() {
    const d = item.draft, pending = parsing.has(item.id);
    return `<div class="c-parse-actions">${btn("parse", d.parsedSql ? "重新校验与解析" : "校验并解析 SQL", "scan-text", "primary", busyAttr(busy || pending))}${btn("sql-template", "获取 SQL 模板", "file-code", "", busyAttr(busy || pending))}<span role="status">${pending ? "正在校验语法与解析字段…" : d.parseError ? "语法校验失败，保留最近成功配置" : d.parsedSql === d.sql ? `语法校验通过 · ${d.fields.length} 个输出字段` : d.autoParse !== false ? "停止输入后自动校验与解析" : "修改 SQL 后请重新校验"}</span></div>${d.parseError ? issuesHTML([d.parseError]) : ""}`;
  }
  const cellInput = (model, value, label, extra = "") => `<input class="c-cell-input" aria-label="${esc(label)}" data-model="${model}" value="${esc(value)}" ${extra}>`;
  const cellSelect = (model, value, label, options) => `<select class="c-cell-input" aria-label="${esc(label)}" data-model="${model}">${options.map(([k, name]) => `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${name}</option>`).join("")}</select>`;
  function dimensionFieldsHTML() {
    const d = item.draft, values = d.enumValues || [], sample = d.parseSample?.find((f) => f.alias === d.valueAlias);
    return `<div class="p-table-scroll"><table class="p-table c-dimension-fields"><thead><tr><th>维度名</th><th>维度 Key</th><th>维度枚举值</th><th>原生类型</th></tr></thead><tbody><tr><td>${cellInput("draft.dimensionName", d.dimensionName, "维度名")}</td><td>${cellInput("draft.dimensionKey", d.dimensionKey, "维度 Key")}<small>SQL 值列：${esc(d.valueAlias || "待选择")}</small></td><td><div class="c-enum-box">${values.map((v, i) => `<span class="c-enum-tag">${esc(v === null ? "NULL（原值）" : v)}<button type="button" data-action="remove-enum" data-index="${i}" aria-label="移除枚举 ${esc(v)}">×</button></span>`).join("")}<input aria-label="添加维度枚举" data-model="enum-input" placeholder="输入枚举，回车或逗号添加"></div><div class="c-enum-actions"><small>${d.enumEdited ? "人工候选值" : "SQL 解析候选值"} · ${values.length} 个</small>${btn("reset-enums", "使用解析候选值", "", "link")}</div></td><td>${cellSelect("draft.valueType", d.valueType, "维度原生类型", [["string", "字符串"], ["number", "数字"], ["unknown", "待确认"]])}<small>静态推断：${esc(sample?.type || "unknown")}</small></td></tr></tbody></table></div>
      <p class="c-config-hint">枚举用于定义候选值；实际取值在试跑中核对。支持中英文逗号批量添加。</p>
      ${!d.valueAlias ? issuesHTML(["检测到多个维度值候选或未找到值列，请在下方选择本取数项的一个维度值列。"]) : ""}
      <details class="c-mapping" ${!d.idAlias || !d.valueAlias ? "open" : ""}><summary>实体与列映射 <span>${esc(d.idAlias || "待选择")} → ${esc(d.valueAlias || "待选择")}</span></summary><div class="p-form-grid two">${select("统计实体", "draft.entity", [["user", "用户"], ["order", "订单"]], d.entity)}${select("实体 ID 输出列", "draft.idAlias", [["", "请选择实体 ID"], ...d.fields.map((f) => [f.alias, f.alias])], d.idAlias)}${select("维度值输出列", "draft.valueAlias", [["", "请选择维度值"], ...d.fields.filter((f) => f.alias !== d.idAlias).map((f) => [f.alias, f.alias])], d.valueAlias)}${input("取值时点 / 更新口径", "draft.timing", d.timing)}</div></details>`;
  }
  function fieldsHTML() {
    const d = item.draft;
    const dims = item.kind === "metric" ? outputDimensions(item) : [];
    const outputTable = `<div class="p-table-scroll"><table class="p-table c-sql-outputs"><thead><tr><th>SQL 输出</th><th>名称</th><th>用途</th><th>类型</th><th>操作</th></tr></thead><tbody>${d.fields.map((f, index) => `<tr><td><code>${esc(f.alias)}</code>${f.review ? badge("需复核", "amber") : ""}</td><td>${cellInput(`output.${index}.name`, f.name, `${f.alias} 名称`)}</td><td>${cellSelect(`output.${index}.role`, f.role, `${f.alias} 角色`, [["metric", "指标字段"], ["dimension", "维度"], ["identity", "分组身份"], ["auxiliary", "辅助"], ["pending", "待确认"]])}</td><td>${cellSelect(`output.${index}.type`, f.type, `${f.alias} 类型`, [["number", "数字"], ["string", "字符串"], ["unknown", "待确认"]])}</td><td>${btn("edit-field", "更多", "settings-2", "link", `data-index="${index}"`)}</td></tr>`).join("")}</tbody></table></div>`;
    return `${dims.length ? `<div class="c-grain-summary">${badge(dims.length > 1 ? "交叉结果" : "单维结果", "purple")}${dims.map((f) => badge(f.name)).join("")}<span>与指标在此 SQL 中一起取数</span></div>` : ""}${d.fields.length ? `<div class="p-diff">${d.diff.filter((f) => f.status === "需复核").map((f) => badge(`${f.alias} · ${f.status}`, "amber")).join("")}</div>${item.kind === "dimension" ? dimensionFieldsHTML() : outputTable}` : `<div class="p-empty">${icon("table-2")}<p>解析 SQL 后自动生成可编辑配置。</p></div>`}
      ${d.removed.length || d.fields.some((f) => f.review) ? `<div class="p-notice">${icon("info")}<span>重新解析已保留人工配置；请检查来源变化${d.removed.length ? `及已删除字段 ${d.removed.map((f) => esc(f.alias)).join("、")}` : ""}。${btn("accept-diff", "已核对字段变化", "check", "link")}</span></div>` : ""}`;
  }
  function metricTableHTML() {
    const rows = metricRows(item), numeric = item.draft.fields.filter((f) => f.type === "number" && !["group_id", "group_name", "is_control"].includes(f.alias));
    const column = (model, value, label) => cellSelect(model, value, label, [["", "请选择字段"], ...numeric.map((f) => [f.alias, f.alias]), ...(value && !numeric.some((f) => f.alias === value) ? [[value, `${value}（已失效）`]] : [])]);
    const tableRows = rows.map((row, index) => {
      const model = `metric-row.${index}`, calc = row.calculation;
      const a = column(`${model}.valueAlias`, row.valueAlias, `${row.name} 字段`);
      const aggregation = cellSelect(`${model}.aggregation`, row.aggregation, `${row.name} 分子聚合`, aggregations);
      const expression = calc === "users" ? `<span class="c-metric-formula-note" title="SQL 需覆盖全量进组用户，包含零订单用户">去重进组用户数</span>` :
        calc === "per_user" ? `${a}${aggregation}<span>/</span><span class="c-metric-formula-note" title="SQL 需覆盖全量进组用户，包含零订单用户">进组用户数</span>` :
          calc === "ratio" ? `${a}${aggregation}<span>/</span>${column(`${model}.denominatorAlias`, row.denominatorAlias, `${row.name} 分母字段`)}${cellSelect(`${model}.denominatorAggregation`, row.denominatorAggregation, `${row.name} 分母聚合`, aggregations)}` :
            `${a}${calc !== "value" ? `<span class="c-metric-formula-note">${calc.toUpperCase()}</span>` : ""}`;
      return `<tr data-metric-key="${esc(row.key)}"><td>${cellInput(`${model}.name`, row.name, `指标 ${index + 1} 名称`)}</td><td>${cellSelect(`${model}.calculation`, calc, `${row.name} 计算类型`, calculationTypes)}</td><td><div class="c-metric-expression">${expression}</div></td><td><div class="c-metric-row-actions">${btn("metric-move-up", "", "arrow-up", "link", `data-index="${index}" aria-label="上移 ${esc(row.name)}" ${index ? "" : "disabled"}`)}${btn("metric-move-down", "", "arrow-down", "link", `data-index="${index}" aria-label="下移 ${esc(row.name)}" ${index < rows.length - 1 ? "" : "disabled"}`)}${btn("metric-copy", "", "copy", "link", `data-index="${index}" aria-label="复制 ${esc(row.name)}"`)}${btn("metric-delete", "", "trash-2", "link", `data-index="${index}" aria-label="删除 ${esc(row.name)}"`)}${btn("edit-metric", "", "ellipsis", "link", `data-index="${index}" aria-label="${esc(row.name)} 更多设置"`)}</div></td></tr>`;
    }).join("");
    return `<div class="c-config-block-toolbar"><span>${rows.length} 个指标</span>${btn("metric-auto", "一键解析配置指标", "wand-sparkles", "", busyAttr(busy || parsing.has(item.id) || !item.draft.sql.trim()))}</div><div class="p-table-scroll"><table class="p-table c-libra-metrics"><thead><tr><th>指标名</th><th>计算类型</th><th>表达式</th><th>操作</th></tr></thead><tbody>${tableRows || '<tr><td colspan="4" class="c-metric-empty">解析 SQL 后自动填充，也可以手动添加指标。</td></tr>'}</tbody></table></div>${btn("metric-add", "添加指标", "plus", "c-add-metric", item.draft.fields.length ? "" : "disabled")}${metricIssues(item).length && rows.length ? `<p class="c-config-hint">${esc(metricIssues(item)[0])}</p>` : ""}`;
  }
  function bindingPending() {
    return item.draft.parameters.some((p) => !parameterCatalog.some((s) => s.key === p.source && s.type === p.expectedType));
  }
  function sqlDimensionsHTML() {
    const dims = outputDimensions(item);
    const candidates = item.draft.fields.filter((f) => !["identity", "dimension"].includes(f.role));
    return `<div class="c-sql-dimension-fields"><h3>当前 SQL 输出维度</h3>${dims.length ? `<div class="p-table-scroll"><table class="p-table c-sql-dimensions-table"><thead><tr><th>SQL 输出</th><th>维度名称</th><th>维度 Key</th><th>原生类型</th><th>操作</th></tr></thead><tbody>${dims.map((f) => {
      const index = item.draft.fields.indexOf(f);
      return `<tr><td><code>${esc(f.alias)}</code>${f.review ? badge("需复核", "amber") : ""}</td><td>${cellInput(`output.${index}.name`, f.name, `${f.alias} 维度名称`)}</td><td><code>${esc(f.key)}</code></td><td>${cellSelect(`output.${index}.type`, f.type, `${f.alias} 维度类型`, [["number", "数字"], ["string", "字符串"], ["unknown", "待确认"]])}</td><td><div class="p-actions">${btn("edit-field", "更多", "settings-2", "link", `data-index="${index}"`)}${btn("dimension-output-remove", "", "x", "link", `data-index="${index}" aria-label="移除 SQL 维度 ${esc(f.name)}"`)}</div></td></tr>`;
    }).join("")}</tbody></table></div>` : '<p class="c-config-hint">当前 SQL 尚未声明维度。</p>'}${candidates.length ? `<div class="c-dimension-output-add">${select("添加输出字段为维度", "dimension-output-candidate", [["", "选择 SQL 输出字段"], ...candidates.map((f) => [f.alias, f.alias])], "")}${btn("dimension-output-add", "添加为维度", "plus")}</div>` : ""}</div>`;
  }
  function itemDimensionsHTML() {
    const owner = dimensionOwner();
    return `<div class="c-config-block-toolbar"><span>${outputDimensions(item).length} 个 SQL 输出维度</span>${btn("dimension-auto", "一键解析配置维度", "wand-sparkles", "", busyAttr(busy || parsing.has(item.id) || !item.draft.sql.trim()))}</div>${sqlDimensionsHTML()}${owner ? `<div class="c-dimension-selection"><h3>可选下钻维度</h3>${dimensionsHTML()}</div>` : `<div class="c-dimension-selection"><h3>可选下钻维度</h3><div class="c-dimension-sources"><span>维度来源</span>${Object.entries(dimensionCategoryLabels).map(([key, label]) => btn("dimension-pick-source", label, key === "builtin" ? "chart-no-axes-column" : key === "public" ? "library" : "code-2", "", `data-source="${key}" disabled title="关联取数能力组后可选择"`)).join("")}</div>${btn("attach", "关联取数能力组", "layers", "", `data-number="${item.versions.at(-1)?.number || 0}"`)}</div>`}`;
  }
  function refreshItemDimensions() {
    const target = outlet.querySelector("#metric-linked-dimensions");
    if (!target || item?.kind !== "metric") return;
    const active = target.contains(document.activeElement) ? document.activeElement : null;
    const model = active?.dataset.model, start = active?.selectionStart, end = active?.selectionEnd;
    target.innerHTML = itemDimensionsHTML();
    dimensionDialog.restore(target.querySelector("[data-dimension-editor-host]"), active);
    const replacement = model && [...target.querySelectorAll("[data-model]")].find((el) => el.dataset.model === model);
    if (replacement) {
      replacement.focus({ preventScroll: true });
      if (typeof start === "number" && replacement.type === "text") replacement.setSelectionRange(start, end);
    }
    if (item.archived || sourceType(item) !== "custom_sql" || dimensionOwner() && abilityLoadReadOnly(dimensionOwner())) {
      if (item.archived || sourceType(item) !== "custom_sql") freezeForms();
      else target.querySelectorAll('.c-dimension-selection [data-model], .c-dimension-selection [data-action]').forEach((el) => { el.disabled = true; });
    }
    refreshIcons(); updateValidity();
  }
  function parameterBindingsHTML() {
    const d = item.draft, pending = bindingPending(), count = d.parameters.filter((p) => parameterCatalog.some((s) => s.key === p.source && s.type === p.expectedType)).length;
    return `<details id="parameter-bindings" class="c-parameter-bindings" ${pending ? "open" : ""}><summary><span>上下文入参绑定</span><small>${d.parameters.length ? `已绑定 ${count}/${d.parameters.length}` : "未使用入参"}</small></summary>${d.parameters.length ? `<div class="c-binding-table">${d.parameters.map((p, i) => {
      const source = parameterCatalog.find((s) => s.key === p.source), mismatch = source && source.type !== p.expectedType;
      return `<div class="p-binding-row"><code>\${${esc(p.name)}}</code>${select("参数类型", `param.${i}.expectedType`, [["number", "数字"], ["string", "字符串"], ["date", "日期"], ["number_list", "数字列表"]], p.expectedType)}${select("绑定上下文", `param.${i}.source`, [["", "请选择来源"], ...parameterCatalog.map((s) => [s.key, `${s.name} · ${s.key}`])], p.source)}<small class="${!source || mismatch ? "c-binding-pending" : ""}">${!source ? "待绑定" : mismatch ? "类型不匹配" : "已绑定"}</small></div>`;
    }).join("")}</div>` : `<p>解析后展示 SQL 实际使用的入参。</p>`}</details>`;
  }
  function renderItem() {
    const d = item.draft, owner = store.abilities.find((a) => a.id === item.ownerAbilityId);
    const progress = itemProgress(item, itemContext(), item.scenario || "normal"), readonly = progress.readOnly;
    const sqlConfig = `<div class="c-block-sql-config" id="sql-config-section"><h3>SQL 配置</h3>${editorHTML()}${parameterBindingsHTML()}${item.kind === "metric" ? `<details class="c-sql-output-settings" id="sql-output-section" ${d.fields.some((f) => f.review || f.role === "pending") || d.removed.length ? "open" : ""}><summary>SQL 输出字段 · ${d.fields.length} 个字段</summary><div id="parsed-fields">${fieldsHTML()}</div></details>` : ""}</div>`;
    outlet.innerHTML = header(item.name, "编写 SQL，校验语法并确认输出字段与参数。",
      (readonly ? "" : btn("save", "保存 SQL", "save")) + `<span class="c-progress-action" data-progress="trial">${trialEntryHTML(progress, "item")}</span><span class="c-progress-action" data-progress="publish">${publishEntryHTML(progress, "item")}</span>` + (readonly ? (sourceType(item) === "builtin_sql" ? btn("copy-source", "复制为自定义 SQL", "copy", "primary", `data-id="${item.id}" data-version="${item.versions.at(-1).number}"`) : "") : owner ? btn("back-owner", "保存并返回能力组", "arrow-right", "primary") : btn("attach", "关联取数能力组", "layers", "primary", `data-number="${item.versions.at(-1)?.number || 0}"`)),
      owner ? owner.name : "取数能力", owner ? `#/ability/${owner.id}` : "#/capabilities")
      + `<div id="composer-next-issue">${nextIssueHTML(progress, "item")}</div>` + issuesHTML(issues)
      + (item.kind === "dimension" ? section("取数项信息", "", input("取数项名称", "item.name", item.name) + keyField(item) + area("说明", "item.description", item.description)) : "")
      + (item.kind === "metric" ? section("指标", "", input("指标组名称", "item.name", item.name) + sqlConfig + `<div id="metric-table">${metricTableHTML()}</div><details class="c-metric-info"><summary>说明与标识</summary>${keyField(item)}${area("说明 / 指标口径", "item.description", item.description)}</details>`, "", "metric-group", "c-config-block") : "")
      + (item.kind === "metric" ? section("维度", "", `<div id="metric-linked-dimensions">${itemDimensionsHTML()}</div>`, "", "metric-dimensions", "c-config-block") : section("维度", "", sqlConfig + `<div class="c-config-block-toolbar"><span>SQL 维度定义</span>${btn("dimension-auto", "一键解析配置维度", "wand-sparkles", "", busyAttr(busy || parsing.has(item.id)))}</div><div id="parsed-fields">${fieldsHTML()}</div>`, "", "dimension-group", "c-config-block"))
      + (item.kind === "dimension" ? "" : `<details id="detail-association" class="p-section c-contract" ${directQuery(item) ? "hidden" : ""}><summary>明细关联设置</summary><div class="p-form-grid">${select("统计实体", "draft.entity", [["user", "用户"], ["order", "订单"]], d.entity)}${input("明细实体列", "draft.entityColumn", d.entityColumn)}${input("明细来源别名", "draft.sourceAlias", d.sourceAlias)}</div></details>`)
      + itemAssociations() + `<div id="composer-publication-history" data-history-revision="${esc(historyRevision(item, "item"))}">${publicationHistory.render(item, "item", versionsHTML(item, "item"))}</div>`
      + `<div class="c-page-more">${moreActions(item, "item")}</div>`;
    const editor = outlet.querySelector("#sql-editor");
    dimensionDialog.restore(outlet.querySelector("[data-dimension-editor-host]"));
    editor.addEventListener("scroll", () => {
      outlet.querySelector(".p-code-highlight").scrollTop = editor.scrollTop; outlet.querySelector(".p-code-highlight").scrollLeft = editor.scrollLeft;
      outlet.querySelector(".p-line-numbers").scrollTop = editor.scrollTop;
    });
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Tab") { e.preventDefault(); editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end"); editor.dispatchEvent(new Event("input", { bubbles: true })); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); outlet.querySelector('[data-action="parse"]').click(); }
    });
    if (readonly) freezeForms();
    refreshIcons();
    if (!readonly && d.autoParse !== false && d.parsedSql !== d.sql && !d.parseError && !parsing.has(item.id)) scheduleParse(item);
  }
  function itemResults() {
    const run = trialSession ? currentTrialRun() : item.runs.find((r) => r.id === selectedRun) || item.runs[0];
    if (!run) return "";
    const valid = run?.status === "success" && run === itemCurrentRun(item, itemContext()) && run.scenario === (item.scenario || "normal");
    const unmatched = valid && run.distinctValues ? run.distinctValues.filter((v) => !(item.draft.enumValues || []).includes(v)) : [];
    let display = run;
    if (valid) {
      const fields = item.kind === "metric" ? compileMode(item).fields : [
        { ...run.fields[0], name: `${entities[item.draft.entity].name} ID` },
        { ...run.fields[1], name: item.draft.dimensionName }
      ];
      display = { ...run, fields };
    }
    return section("独立运行结果", "指标核对聚合结果；维度核对实体唯一性与实际枚举值。",
      !run ? `<div class="p-empty">${icon("play")}<p>可直接运行这个 SQL 取数项。</p></div>` :
        `<div class="p-result-summary"><div class="p-row">${badge(statuses[run.status], run.status === "success" ? "green" : "amber")}${badge(valid ? "当前配置" : "历史 / 待验证")}<span>${run.rawRows?.length || 0} 行 · ${esc(run.id)}</span></div></div>${issuesHTML(run.error ? [run.error] : [])}${run.status === "running" ? `<div class="p-progress"><span></span>正在执行 SQL…</div>` : table(display)}
        ${run.distinctValues ? `<div class="c-associations">${run.distinctValues.map((v) => badge(v === null ? "NULL（原值）" : v)).join("")}</div>` : ""}
        ${unmatched.length ? `<p class="c-config-hint">实际输出包含候选定义之外的值：${unmatched.map((v) => esc(v === null ? "NULL" : v)).join("、")}。可补充枚举定义后重新核对。</p>` : ""}
        <details class="p-snapshot"><summary>查看执行 SQL</summary><pre>${esc(run.renderedSql || "")}</pre></details>
        <div class="p-confirm-result">${check("已核对当前 SQL 输出、口径与原生类型", "approve-item", valid && run.approvedFor === itemReviewSignature(item, itemContext()), valid && (item.scenario || "normal") === "normal" ? "" : "disabled")}${!valid ? "<small>SQL 或配置变化后需要重新运行。</small>" : ""}</div>`, "", "item-results");
  }
  function itemAssociations() {
    const linked = store.abilities.filter((a) => [...a.metrics, ...a.dimensions].some((r) => r.itemId === item.id));
    return section("关联取数能力组", "选择已有组或新建保存；在组内配置其它指标与下钻，然后整体试跑供分析使用。",
      linked.length ? linked.map((a) => {
        const ref = [...a.metrics, ...a.dimensions].find((r) => r.itemId === item.id);
        return `<div class="p-version"><div><strong>${esc(a.name)}</strong><small>${ref.version ? `引用 SQL v${ref.version}` : "能力内 SQL 草稿"} · ${esc(a.goal)}</small></div><div class="p-actions">${btn("edit-ability", "查看能力组", "layers", "", `data-id="${a.id}"`)}${btn("run-catalog", "整体试跑", "play", "", `data-id="${a.id}"`)}${btn("use-ability", "进入分析模块", "arrow-up-right", "", `data-id="${a.id}" ${a.versions.length ? "" : "disabled"}`)}</div></div>`;
      }).join("") : `<div class="c-validation-entry"><span>这个 SQL 还未关联能力组。</span>${btn("attach", "关联 / 新建能力组", "plus", "primary", `data-number="${item.versions.at(-1)?.number || 0}"`)}</div>`);
  }
  function renderAttach() {
    const number = attachDraft.number, existing = store.abilities.filter((a) => !a.archived && ![...a.metrics, ...a.dimensions].some((r) => r.itemId === item.id));
    const allowDraft = !number && (!item.ownerAbilityId || item.ownerAbilityId === attachDraft.target);
    openDialog("关联取数能力组", `<p>${esc(item.name)} · ${number ? `固定 SQL v${number}` : "能力内草稿，随能力组统一试跑和发布"}</p><div class="p-mode-tabs">${btn("attach-existing", "加入已有能力组", "layers", attachDraft.mode === "existing" ? "active" : "")}${btn("attach-new", "新建能力组并加入", "plus", attachDraft.mode === "new" ? "active" : "")}</div>
      ${attachDraft.mode === "existing" ? select("目标取数能力组", "attach-target", [["", "请选择能力组"], ...existing.map((a) => [a.id, a.name])], attachDraft.target) + (!number ? `<p class="c-config-hint">未发布 SQL 只归属一个能力组；跨组复用请先独立试跑并发布 SQL。</p>` : "") :
        `<div class="p-form-grid two">${input("能力组名称", "attach-form.name", attachDraft.name)}${readonlyField("业务目标", businessGoal)}</div>${area("能力组说明", "attach-form.description", attachDraft.description)}`}
      ${item.kind === "dimension" ? `<p class="c-config-hint">维度加入能力组后，还需要选择指标来源才能执行分析。</p>` : ""}${!number && !allowDraft && attachDraft.mode === "existing" ? issuesHTML(["这个 SQL 已归属其他能力组，请先独立发布后复用。"]) : ""}`,
      btn("close", "取消") + btn("confirm-attach", attachDraft.mode === "new" ? "新建并保存能力组" : "保存关联并查看能力组", "check", "primary"));
  }
  function openTrial(kind, id, runId = "", mode = "") {
    const obj = kind === "preset" ? capabilities.find((c) => c.id === id) : (kind === "item" ? store.items : store.abilities).find((o) => o.id === id);
    if (!obj) throw new Error("当前取数配置已不存在。");
    if ((runId || mode === "record") && !ownedTrialRun(obj, runId)) throw new Error("该试跑记录不存在");
    if (trialSession?.obj === obj && trialSession.kind === kind) {
      if (["record", "history"].includes(mode)) showTrialHistory(mode, runId);
      else {
        if (trialSession.recordView) returnCurrentValidation();
        if (runId) { trialSession.mode = "result"; trialSession.runId = runId; selectedRun = runId; selectedRecord = ""; renderTrial(); }
      }
      return;
    }
    if (trialSession) closeTrial();
    closeDialog();
    const focus = document.activeElement;
    const recordView = ["history", "record"].includes(mode);
    trialSession = { kind, obj, recordView, mode: mode || (runId ? "result" : "input"), runId,
      currentValidation: recordView ? { mode: "input", runId: "", selectedRecord: "", issues: [], scroll: 0 } : null,
      background: { ability, item, presetId, selectedRun, selectedRecord, issues }, hash: location.hash,
      focus, focusModel: focus?.dataset.model, focusAction: focus?.dataset.action,
      focusId: focus?.dataset.id, focusRunId: focus?.dataset.runId, scroll: window.scrollY };
    trialKind = kind; item = kind === "item" ? obj : undefined; ability = kind === "ability" ? obj : undefined; presetId = kind === "preset" ? id : "";
    issues = []; selectedRun = obj.runs?.some((run) => run.id === runId) ? runId : ""; selectedRecord = "";
    if (kind === "preset") presetResult = "";
    trialOverlay.hidden = false; document.body.classList.add("p-modal-open");
    trialOverlay.innerHTML = `<button class="p-overlay-backdrop" data-action="close-trial" aria-label="关闭取数验证浮层"></button><section class="c-trial-dialog" role="dialog" aria-modal="true" aria-label="取数验证"><div class="c-trial-body"></div></section>`;
    main.inert = true;
    renderTrial();
    trialOverlay.querySelector('[data-action="close-trial"] + section button')?.focus();
  }
  function closeTrial() {
    if (!trialSession) return;
    const session = trialSession;
    trialSession = undefined; trialKind = "";
    ({ ability, item, presetId, selectedRun, selectedRecord, issues } = session.background);
    trialOverlay.hidden = true; trialOverlay.innerHTML = ""; main.inert = false;
    if (overlay.hidden) document.body.classList.remove("p-modal-open");
    if ((ability || item) && session.hash === location.hash) {
      if (session.parsedBackground) {
        if (item) refreshParseView(); else refreshDimensions();
      } else updateValidity();
    }
    else render();
    window.scrollTo(0, session.scroll);
    const focus = session.focus?.isConnected && !session.focus.disabled && session.focus.getClientRects().length ? session.focus
      : [...main.querySelectorAll("[data-model], [data-action]")].find((el) => !el.disabled && el.getClientRects().length
        && (session.focusModel ? el.dataset.model === session.focusModel : session.focusAction && el.dataset.action === session.focusAction && el.dataset.id === session.focusId && el.dataset.runId === session.focusRunId));
    (focus || pageActionFallback())?.focus({ preventScroll: true });
  }
  function trialScope() {
    if (trialSession?.recordView) {
      const snapshot = trialSnapshot(trialSession.obj, trialSession.runId, trialSession.kind);
      return { obj: trialSession.obj, preset: null, context: snapshot?.context || {},
        metrics: snapshot?.metrics || [], dimensions: snapshot?.dimensions || [], modes: snapshot?.modes || [], snapshot };
    }
    const obj = item || ability || trialSession.obj, preset = trialKind === "preset" ? presetDraft() : null;
    const context = preset ? (preset.context ||= clone(defaultContext)) : item ? (item.context ||= clone(defaultContext)) : ability.context;
    const metrics = preset ? preset.metrics.map((name) => ({ name })) : item ? (item.kind === "metric" ? metricFields(item) : []) : ability.metrics.flatMap((r) => metricFields(resolveItem(store, r)).filter((f) => r.metricKeys.includes(f.key)));
    const dimensions = preset ? preset.dimensions.map((name) => ({ name })) : item ? (item.kind === "dimension" ? [{ name: item.draft.dimensionName }] : outputDimensions(item)) : [...new Map([
      ...activeGroups(ability).flatMap((g) => g.members.map((key) => {
        const source = ability.dimensions.find((r) => r.itemId === key);
        if (source) { const d = resolveItem(store, source).draft; return [d.dimensionKey, { name: d.dimensionName }]; }
        const field = ability.metrics.flatMap((r) => outputDimensions(resolveItem(store, r))).find((f) => f.key === key);
        return [key, field || { name: key }];
      }))
    ]).values()];
    let modes = item ? [{ id: item.id, name: item.name }] : preset ? (preset.dimensions.length ? preset.dimensions : ["整体"]).map((name) => ({ id: name, name })) : [];
    if (ability) { try { modes = abilityModes(store, ability); } catch { /* Fetch validates configuration in this module. */ } }
    return { obj, preset, context, metrics, dimensions, modes };
  }
  function currentTrialRun() {
    return ownedTrialRun(trialSession?.obj, trialSession?.runId);
  }
  function trialHistoryRows(obj, kind) {
    return trialRuns(obj).map((run) => {
      const experiment = trialExperiment(run), label = experiment ? `实验 ${experiment}` : "实验未记录";
      const time = trialRecordTime(run);
      return `<article class="c-trial-history-row"><div>${icon("flask-conical")}<span><strong>${esc(label)}</strong><time>${esc(time)}</time></span></div>${badge(trialRecordStatus(run), run.status === "success" ? "green" : run.status === "running" ? "blue" : "amber")}${btn("trial-record", "查看", "arrow-up-right", "link", `data-kind="${kind}" data-id="${esc(obj.id)}" data-run-id="${esc(run.id)}" aria-label="查看${esc(label)} · ${esc(time)}"`)}</article>`;
    }).join("");
  }
  function renderTrialHistory() {
    const session = trialSession, body = trialOverlay.querySelector(".c-trial-body");
    const scroll = body.scrollTop, active = body.contains(document.activeElement) ? document.activeElement : null;
    const action = active?.dataset.action, id = active?.dataset.id, runId = active?.dataset.runId;
    const openDetails = [...body.querySelectorAll("details")].map((details) => details.open);
    const snapshot = session.mode === "record" ? trialSnapshot(session.obj, session.runId, session.kind) : null;
    const run = snapshot?.run;
    const field = (label, value) => readonlyField(label, value == null || value === "" ? "未记录" : typeof value === "object" ? JSON.stringify(value) : value);
    body.innerHTML = `<header class="c-trial-header"><div><span class="c-trial-eyebrow">取数能力 · 试跑记录 · 只读</span><h1>${snapshot ? `试跑记录 · ${esc(snapshot.name)}` : session.mode === "record" ? "试跑记录" : `${esc(session.obj.name)} · 历史试跑记录`}</h1></div>${btn("close-trial", "", "x", "link", 'aria-label="关闭取数验证"')}</header><div class="c-trial-content">${snapshot ? `
      <div class="c-trial-record-meta">${badge(trialRecordStatus(run), run.status === "success" ? "green" : run.status === "running" ? "blue" : "amber")}<time>${esc(trialRecordTime(run))}</time><span>运行 ID：${esc(run.id)}</span></div>
      <section class="p-section c-trial-detail-info"><header><h2>当次取数信息</h2></header><div class="p-form-grid two">${field("实验 ID", snapshot.context.libra_id)}${field("观测开始", snapshot.context.start_date)}${field("观测结束", snapshot.context.end_date)}</div><details class="c-trial-record-parameters"><summary>其他已记录参数</summary><div class="p-form-grid two">${Object.entries(snapshot.context).filter(([key]) => !["libra_id", "start_date", "end_date"].includes(key)).map(([key, value]) => field(parameterCatalog.find((p) => p.key === key)?.name || key, value)).join("") || '<p class="p-muted">其他参数未记录。</p>'}</div></details>${snapshot.incomplete ? '<p class="c-trial-detail-warning" role="status">当次完整定义未记录或不完整，以下仅展示已保存的字段、任务与结果。</p>' : ""}${snapshot.fieldsIncomplete ? '<p class="c-trial-detail-warning">部分字段定义未记录，仅按已记录列展示原始数据。</p>' : ""}</section>
      <div class="c-trial-evidence"><span>当次证据</span><div>${snapshot.metrics.map((metric) => badge(`指标 · ${metric.name}`)).join("")}${snapshot.dimensions.map((dimension) => badge(`下钻 · ${dimension.name}`)).join("")}${!snapshot.metrics.length && !snapshot.dimensions.length ? '<span class="p-muted">证据定义未记录</span>' : ""}</div></div>
      ${section("当次取数范围", "", trialRangeHTML(snapshot))}
      ${issuesHTML(run.error ? [run.error] : [])}
      <div id="trial-tasks">${trialTasksHTML(snapshot.modes)}</div><div id="trial-results">${trialResultsHTML()}</div>` : session.mode === "record" ? '<div class="p-issues" role="alert">该试跑记录不存在</div>' : `<p class="c-trial-history-note">每次取数为一条记录，包含当次实验、入参和结果。</p><div class="c-trial-history-browser">${trialHistoryRows(session.obj, session.kind) || '<div class="p-empty"><p>暂无历史试跑记录。</p></div>'}</div>`}</div><footer class="c-trial-footer">${session.mode === "record" ? btn("trial-history", "返回历史记录", "arrow-left") : ""}${canReturnCurrentValidation() ? btn("return-current-validation", "返回当前验证", "flask-conical") : ""}${btn("close-trial", "返回配置")}</footer>`;
    body.querySelectorAll("details").forEach((details, index) => { if (openDetails[index] !== undefined) details.open = openDetails[index]; });
    body.scrollTop = scroll; refreshIcons();
    if (active) {
      const replacement = [...body.querySelectorAll("[data-action]")].find((el) => el.dataset.action === action && el.dataset.id === id && el.dataset.runId === runId);
      (replacement || availableFocus(body, '[data-action="close-trial"]'))?.focus({ preventScroll: true });
    }
  }
  function trialRangeHTML(snapshot) {
    const kinds = { overall: "整体", single: "独立维度", cross: "交叉维度" };
    const modes = snapshot.modes;
    const groups = Array.isArray(snapshot.definition?.groups) ? snapshot.definition.groups : [];
    const ranges = modes.length ? modes : groups;
    if (!ranges.length) return '<p class="p-muted">取数范围未记录。</p>';
    return `<div class="c-trial-detail-range">${ranges.map((mode) => {
      const members = Array.isArray(mode.members) ? mode.members : [];
      const fields = Array.isArray(mode.fields) ? mode.fields : [];
      const sources = Array.isArray(mode.sourceDefinitions) ? mode.sourceDefinitions : [];
      return `<article><strong>${esc(mode.name || "任务名称未记录")}</strong><p>${esc(kinds[mode.kind] || (mode.cross === true ? "交叉维度" : "范围类型未记录"))}${members.length ? ` · ${members.map((member) => esc(fields.find((field) => field.key === member)?.name || member)).join(" × ")}` : ""}</p>${mode.description ? `<p>${esc(mode.description)}</p>` : ""}${sources.map((source) => `<p>来源：${esc(source.name || "名称未记录")}${source.draft?.entity ? ` · 实体 ${esc(source.draft.entity)}` : ""}${source.draft?.timing ? ` · ${esc(source.draft.timing)}` : ""}</p>`).join("")}${mode.valueFilters ? `<p>取值范围：${esc(JSON.stringify(mode.valueFilters))}</p>` : ""}</article>`;
    }).join("")}</div>`;
  }
  function canReturnCurrentValidation() {
    if (!trialSession || trialSession.obj.archived) return false;
    if (trialSession.kind === "ability") return abilityProgress(store, trialSession.obj).canTrial && !abilityLoadBlocked(trialSession.obj);
    return trialSession.kind === "item" && !busy && !trialSession.obj.ownerAbilityId
      && itemProgress(trialSession.obj).canTrial;
  }
  function returnCurrentValidation() {
    if (!canReturnCurrentValidation()) throw new Error("当前配置暂不能进入取数验证，请返回配置检查。");
    const session = trialSession, current = session.currentValidation || { mode: "input", runId: "", selectedRecord: "", issues: [], scroll: 0 };
    session.recordView = false; session.mode = current.mode; session.runId = current.runId;
    selectedRun = current.runId; selectedRecord = current.selectedRecord; issues = current.issues;
    renderTrial();
    trialOverlay.querySelector(".c-trial-body").scrollTop = current.scroll;
    const focus = [...trialOverlay.querySelectorAll("[data-model], [data-action]")].find((el) => !el.disabled
      && (current.focusModel ? el.dataset.model === current.focusModel : current.focusAction
        && el.dataset.action === current.focusAction && el.dataset.id === current.focusId && el.dataset.runId === current.focusRunId));
    (focus || availableFocus(trialOverlay, '[data-action="trial-run"], [data-action="close-trial"]'))?.focus({ preventScroll: true });
  }
  function showTrialHistory(mode, runId = "") {
    if (!trialSession) throw new Error("请先打开当前模块的取数验证。");
    if (mode === "record" && !ownedTrialRun(trialSession.obj, runId)) throw new Error("该试跑记录不存在");
    if (!trialSession.recordView) {
      const focus = document.activeElement;
      trialSession.currentValidation = {
        mode: trialSession.mode, runId: trialSession.runId, selectedRecord, issues,
        scroll: trialOverlay.querySelector(".c-trial-body").scrollTop,
        focusModel: focus?.dataset.model, focusAction: focus?.dataset.action,
        focusId: focus?.dataset.id, focusRunId: focus?.dataset.runId,
        advancedOpen: trialOverlay.querySelector(".c-trial-advanced")?.open || false
      };
    }
    trialSession.recordView = true; trialSession.mode = mode; trialSession.runId = runId;
    selectedRun = runId; selectedRecord = ""; issues = [];
    renderTrial();
    trialOverlay.querySelector(".c-trial-body").scrollTop = 0;
    trialOverlay.querySelector('[data-action="close-trial"]')?.focus({ preventScroll: true });
  }
  function trialContextIssues(context) {
    const list = [];
    if (!/^\d+$/.test(String(context.libra_id).trim())) list.push("请填写有效的数字实验 ID。");
    if (![context.start_date, context.end_date].every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v)) list.push("请选择有效的观测开始和结束日期。");
    else if (context.start_date > context.end_date) list.push("观测开始日期不能晚于结束日期。");
    return list;
  }
  function experimentHTML(context) {
    if (!context.libra_id) return "";
    if (String(context.libra_id) === "4823214") return `<strong>优惠券支付实验 · 示例实验</strong><span>实验周期：2026-10-01 至 2026-10-03</span>`;
    return `<span>实验 ${esc(context.libra_id)} · 当前环境未提供此实验的详细信息</span>`;
  }
  function trialResultsHTML() {
    if (trialSession?.recordView) return historicalResultsHTML();
    if (trialSession?.mode !== "result") return "";
    if (trialKind === "preset") return presetResult === presetId ? section("取数结果", "固定样例，结果不随实验与日期变化。", presetResultsHTML()) : "";
    return item ? itemResults() : abilityResults();
  }
  function historicalResultsHTML() {
    const snapshot = trialSnapshot(trialSession.obj, trialSession.runId, trialSession.kind);
    if (!snapshot) return "";
    const { run, records } = snapshot;
    const record = records.find((entry) => entry.id === selectedRecord) || records[0];
    const display = record ? { ...record, fields: record.fields.map((field) => field.rawDisplay ? { ...field, role: "raw" } : field) } : null;
    return section("当次试跑结果", "只读执行快照，不作为当前配置的核对或发布依据。",
      `<div class="p-mode-tabs">${records.map((entry) => btn("select-record", `${esc(entry.modeName)} · ${entry.rawRows.length} 行`, "", entry === record ? "active" : "", `data-id="${esc(entry.id)}"`)).join("")}</div>${record ? `
      <div class="p-row">${badge(trialRecordStatus(record), record.status === "success" ? "green" : "amber")}</div>
      ${issuesHTML(record.error ? [record.error] : [])}${table(display)}
      ${record.checks?.length ? `<div class="c-associations">${record.checks.map((check) => badge(`${check.dimension || "维度名称未记录"}：${check.entities ?? "未记录"} 个实体 · 缺失 ${check.missing ?? "未记录"}`)).join("")}</div>` : ""}
      <details class="p-snapshot"><summary>查看执行 SQL</summary>${record.renderedSql ? `<pre>${esc(record.renderedSql)}</pre>` : '<p class="p-muted">实际执行 SQL 未记录。</p>'}</details>` : `<p class="p-muted">${run.status === "running" ? "任务正在运行，尚未产出结果。" : "本次没有可用结果。"}</p>`}`, "", "trial-record-results");
  }
  function trialTasksHTML(modes) {
    if (trialSession?.recordView) {
      const snapshot = trialSnapshot(trialSession.obj, trialSession.runId, trialSession.kind);
      if (!snapshot) return "";
      return `<div class="c-trial-tasks" aria-label="当次取数任务">${snapshot.modes.map((mode) => {
        const record = snapshot.records.find((entry) => mode.recordId ? entry.id === mode.recordId : entry.modeId === mode.id);
        const state = record?.status || mode.status || (snapshot.run.status === "running" ? "queued" : "");
        return `<div><span>${esc(mode.name)}</span>${badge(state === "queued" ? "等待取数" : trialRecordStatus({ status: state }), state === "success" ? "green" : "")}</div>`;
      }).join("") || '<p class="p-muted">取数任务未记录。</p>'}</div>`;
    }
    if (trialSession?.mode !== "result") return "";
    const run = currentTrialRun(), isPreset = trialKind === "preset";
    if (!run && !(isPreset && presetResult === presetId)) return "";
    const tasks = run?.modes?.length ? run.modes : modes;
    return `<div class="c-trial-tasks" aria-label="取数任务">${tasks.map((mode) => {
      const record = item ? run : run?.records?.find((r) => r.modeId === mode.id);
      const state = isPreset ? "success" : record?.status || (run.status === "running" ? "queued" : run.status);
      const label = { running: "取数中", queued: "等待取数", success: "取数完成", empty: "0 行", failed: "失败", permission: "权限不足", timeout: "超时" }[state] || state;
      return `<div><span>${esc(mode.name)}</span>${badge(label, state === "success" ? "green" : ["failed", "permission", "timeout", "empty"].includes(state) ? "amber" : "")}</div>`;
    }).join("")}</div>`;
  }
  function renderTrial() {
    if (trialSession.recordView) { renderTrialHistory(); return; }
    const { obj, preset, context, metrics, dimensions, modes } = trialScope();
    const body = trialOverlay.querySelector(".c-trial-body"), scroll = body.scrollTop;
    const active = body.contains(document.activeElement) ? document.activeElement : null;
    const model = active?.dataset.model, action = active?.dataset.action;
    const advancedOpen = body.querySelector(".c-trial-advanced")?.open ?? trialSession.currentValidation?.advancedOpen ?? false;
    body.innerHTML = `<header class="c-trial-header"><div><span class="c-trial-eyebrow">取数能力 · 取数验证</span><h1>试跑${item ? " SQL 取数项" : "取数能力"}“${esc(obj.name || obj.title)}”</h1><div class="p-row">${badge(ability?.goal || (preset ? businessGoal : "独立 SQL"), "blue")}${badge(`${metrics.length} 个指标`, "blue")}${badge(`${dimensions.length} 个下钻维度`, "blue")}${busy ? badge("任务运行中", "blue") : ""}</div></div>${preset ? "" : btn("trial-history", `历史试跑记录${obj.runs.length ? `（${obj.runs.length}）` : ""}`, "history")}${badge(item ? "仅执行当前 SQL 取数项" : "仅执行当前取数能力", "blue")}${btn("close-trial", "", "x", "link", 'aria-label="关闭取数验证"')}</header>
      <div class="c-trial-content"><div class="c-trial-evidence"><span>已选证据</span><strong>${metrics.length} 个指标</strong><strong>${dimensions.length} 个下钻维度</strong><div>${metrics.map((f) => badge(`指标 · ${f.name}`)).join("")}${dimensions.map((d) => badge(`下钻 · ${d.name}`)).join("")}</div></div>
      <section class="c-trial-context"><header>${icon("flask-conical")}<strong>输入实验 ID 和观测时间并获取数据</strong></header><div class="c-trial-inputs">${input("实验 ID", "context.libra_id", context.libra_id, `placeholder="例如：4823214" inputmode="numeric" ${busyAttr(busy)}`)}<div><span class="c-trial-label">观测时间</span><div class="c-trial-dates">${input("开始", "context.start_date", context.start_date, `type="date" aria-label="观测开始日期" ${busyAttr(busy)}`)}<span>→</span>${input("结束", "context.end_date", context.end_date, `type="date" aria-label="观测结束日期" ${busyAttr(busy)}`)}</div></div></div><div class="c-trial-experiment" id="trial-experiment" ${context.libra_id ? "" : "hidden"}>${experimentHTML(context)}</div><details class="c-trial-advanced"><summary>更多上下文参数</summary><div class="p-form-grid two">${parameterCatalog.filter((p) => !["libra_id", "start_date", "end_date"].includes(p.key)).map((p) => input(p.name, `context.${p.key}`, context[p.key], busyAttr(busy))).join("")}</div></details><footer><div>取数计划：<strong>${modes.length} 个任务</strong><p>仅获取所选下钻维度或单独配置的整体数据</p></div>${btn("trial-run", busy ? "正在获取数据…" : "获取数据", busy ? "loader-circle" : "database", `primary ${busy ? "is-loading" : ""}`, busyAttr(busy))}</footer></section>
      <div id="trial-validation">${issuesHTML(issues)}</div><div id="trial-tasks">${trialTasksHTML(modes)}</div><div id="trial-results">${trialResultsHTML()}</div></div>
      <footer class="c-trial-footer"><div class="p-actions">${btn("close-trial", preset ? "返回指标选择" : "返回配置")}<span class="c-progress-action" data-progress="publish">${preset || trialSession.mode !== "result" ? "" : publishEntryHTML(pageProgress(obj), item ? "item" : "ability", true)}</span></div></footer>`;
    body.querySelector(".c-trial-advanced").open = advancedOpen;
    body.scrollTop = scroll; refreshIcons();
    if (active) {
      const replacement = [...body.querySelectorAll("[data-model], [data-action]")].find((el) => !el.disabled && (model ? el.dataset.model === model : action && el.dataset.action === action));
      (replacement || availableFocus(body, '.c-trial-footer [data-action="close-trial"]'))?.focus({ preventScroll: true });
    }
  }
  function contextHTML(context) {
    return `<div class="p-form-grid two">${parameterCatalog.map((p) => input(p.name, `context.${p.key}`, context[p.key], p.type === "date" ? 'type="date"' : "")).join("")}</div>`;
  }
  function presetDraft(id = presetId) {
    return store.presetDrafts[id] ||= { metrics: [], dimensions: [], context: clone(defaultContext) };
  }
  function syncPresetSelection(id, selection) {
    const draft = presetDraft(id);
    if (JSON.stringify([draft.metrics, draft.dimensions]) !== JSON.stringify([selection.metrics, selection.dimensions])) {
      draft.metrics = clone(selection.metrics); draft.dimensions = clone(selection.dimensions);
      presetResult = ""; persist();
    }
  }
  function presetResultsHTML() {
    if (presetResult !== presetId) return `<div class="p-empty">${icon("table-2")}<p>尚未展示结果，可点击“查看示例数据”。</p></div>`;
    const selection = presetDraft(), modes = selection.dimensions.length ? selection.dimensions : ["整体"];
    const samples = {
      "实验时间": ["2026-10-01 至 2026-10-03", "2026-10-01 至 2026-10-03"],
      "实验流量": ["0.50", "0.50"], "发券面额": ["无", "10 元券"], "发券时效": ["不适用", "领取后 3 天"],
      "券可用范围": ["不适用", "示例商品"], "领取次数": ["0", "1"], "发券点位": ["不适用", "示例会场"],
      "GMV": ["7200", "8160"], "支付订单量": ["36", "36"], "支付用户数": ["6", "6"],
      "补贴金额": ["0", "240"], "核销率": ["0.6667", "0.6667"]
    };
    return modes.map((dimension) => `<div class="c-preset-result"><h3>${esc(dimension)} · 固定示例</h3><div class="p-table-scroll"><table class="p-table"><thead><tr><th>分组</th>${selection.metrics.map((m) => `<th>${esc(m)}</th>`).join("")}</tr></thead><tbody>${["对照组", "实验组"].map((group, i) => `<tr><td>${group}</td>${selection.metrics.map((m) => `<td>${esc(samples[m]?.[i] ?? "未提供示例值")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`).join("");
  }
  function renderModules() {
    const m = store.analysis, versions = store.abilities.flatMap((a) => a.versions.filter((v) => !a.archived || (m.capabilityId === a.id && m.version === v.number)).map((v) => [`${a.id}:${v.number}`, `${v.name} · v${v.number}${a.archived ? " · 已归档引用" : ""}`]));
    const v = store.abilities.find((a) => a.id === m.capabilityId)?.versions.find((v) => v.number === m.version);
    outlet.innerHTML = header(m.name, "引用确定的取数能力版本，选择输入并配置分析思路。", btn("save", "保存草稿", "save") + btn("analysis-context", "试跑上下文", "settings-2") + btn("analyze", "分析试跑", "flask-conical", "primary", busyAttr(busy)))
      + issuesHTML(issues)
      + section("分析模块信息", "", `<div class="p-form-grid two">${input("模块名称", "analysis.name", m.name)}${readonlyField("业务目标", businessGoal)}</div>${area("说明", "analysis.description", m.description)}`)
      + section("取数能力", "显式引用固定版本；源 SQL 或能力草稿修改不影响当前分析。",
        select("能力版本", "analysis-reference", [["", "请选择已发布能力"], ...versions], `${m.capabilityId}:${m.version}`)
        + (v ? `<div class="p-selection-modes">${v.modes.map((mode) => `<article class="p-selection-mode"><strong>${esc(mode.name)}</strong><p>${mode.kind === "cross" ? "交叉成员" : mode.kind === "single" ? "单维下钻" : "整体"} · ${esc(mode.members.join(" × "))}</p><div class="p-checks">${mode.fields.filter((f) => f.role === "metric").map((f) => check(esc(f.name), `analysis-select.${mode.id}.${f.key}`, m.selections[mode.id]?.includes(f.key))).join("")}</div></article>`).join("")}</div>` : `<div class="p-empty">先完成取数能力试跑、核对与发布。</div>`))
      + section("分析配置", "", area("分析思路", "analysis.reasoning", m.reasoning) + area("注意事项", "analysis.considerations", m.considerations))
      + section("分析试跑记录", "取数成功和分析成功分别记录。", m.attempts.length ? m.attempts.map((a) => `<div class="p-version"><div><strong>${statuses[a.status]}</strong><span>${esc(a.capabilityName)} · v${a.version} · ${date(a.startedAt)}</span><small>${a.reused ? "复用相同输入快照" : "按固定版本重新取数"}</small></div><a class="p-button" href="#/analysis/${a.id}">查看输入与结论 ${icon("arrow-up-right")}</a></div>`).join("") : `<p class="p-muted">暂无分析试跑。</p>`);
    refreshIcons();
  }
  function renderAnalysis(id) {
    const a = store.analysis.attempts.find((a) => a.id === id);
    if (!a) { location.hash = "/modules"; return; }
    const record = a.records.find((r) => r.id === selectedRecord) || a.records[0];
    outlet.innerHTML = header(`${a.capabilityName} · 分析试跑`, `能力 v${a.version} · ${date(a.startedAt)} · ${a.id}`, btn("back-modules", "返回分析配置", "arrow-left"), "分析模块", "#/modules")
      + `<div class="p-analysis-meta">${badge(statuses[a.status], a.status === "success" ? "green" : "amber")}${badge(`Libra ${a.snapshot.context.libra_id}`)}${badge(`${a.snapshot.context.start_date} 至 ${a.snapshot.context.end_date}`)}</div><div class="p-mode-tabs">${btn("analysis-output", "分析输出", "file-text", analysisTab === "output" ? "active" : "")}${btn("analysis-input", "输入数据与证据", "table-2", analysisTab === "input" ? "active" : "")}</div>`
      + (analysisTab === "output" ? section("分析输出", "仅描述实际输入中的组间数值。", a.status === "running" ? `<div class="p-progress"><span></span>正在检查输入并生成证据…</div>` : `<div class="p-conclusions">${a.evidence.map((e) => `<article><div>${icon("chart-no-axes-combined")}<p>${esc(e.text)}</p></div>${btn("evidence", "查看数据证据", "arrow-up-right", "link", `data-execution="${e.executionId}" data-row="${e.rowIndex}"`)}</article>`).join("")}</div><div class="p-analysis-gaps"><h3>判断边界</h3>${a.gaps.map((g) => `<p>${icon("info")}${esc(g)}</p>`).join("")}</div>`)
        : section("本次输入数据", "", `<div class="p-mode-tabs">${a.records.map((r) => btn("analysis-record", esc(r.modeName), "", r === record ? "active" : "", `data-id="${r.id}"`)).join("")}</div>${record ? table(record, highlight) + `<details class="p-snapshot"><summary>查看执行 SQL</summary><pre>${esc(record.renderedSql || "")}</pre></details>` : `<div class="p-empty">尚无可用输入。</div>`}`));
    refreshIcons();
    if (highlight >= 0) outlet.querySelector(`#evidence-${highlight}`)?.scrollIntoView({ block: "center" });
  }
  function render() {
    if (trialSession) { renderTrial(); return; }
    const [page, id, trialId] = location.hash.replace(/^#\/?/, "").split("/");
    if (page === "items") {
      history.replaceState(null, "", "#/capabilities");
      render(); return;
    }
    if (page === "trial") {
      history.replaceState(null, "", `#/${id === "preset" ? "capabilities" : `${id}/${trialId}`}`);
      render(); openTrial(id, trialId); return;
    }
    trialKind = ""; presetId = "";
    ability = page === "ability" ? store.abilities.find((a) => a.id === id) : undefined;
    item = page === "item" ? store.items.find((s) => s.id === id) : undefined;
    catalog.hidden = ["ability", "item", "modules", "analysis", "guide"].includes(page); outlet.hidden = !catalog.hidden;
    if (ability) renderAbility(); else if (item) renderItem();
    else if (page === "modules") renderModules(); else if (page === "analysis") renderAnalysis(id); else if (page === "guide") renderGuide(); else renderCatalog();
    document.querySelectorAll(".nav-item").forEach((a) => {
      const active = a.textContent.includes(["modules", "analysis"].includes(page) ? "实验分析模块" : "取数能力");
      a.classList.toggle("active", active); a.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  function updateValidity(refreshResults = true) {
    const association = outlet.querySelector("#detail-association");
    if (association && item) association.hidden = directQuery(item);
    if (trialSession) {
      if (trialSession.recordView) { renderTrial(); refreshProgress(); return; }
      const { context, modes } = trialScope();
      if (refreshResults) updateProgressHTML(trialOverlay.querySelector("#trial-results"), trialResultsHTML(),
        () => availableFocus(trialOverlay, '.c-trial-footer [data-action="close-trial"]'));
      else progressHTML.delete(trialOverlay.querySelector("#trial-results"));
      updateProgressHTML(trialOverlay.querySelector("#trial-validation"), issuesHTML(issues));
      updateProgressHTML(trialOverlay.querySelector("#trial-tasks"), trialTasksHTML(modes));
      const experiment = trialOverlay.querySelector("#trial-experiment");
      experiment.hidden = !context.libra_id; experiment.innerHTML = experimentHTML(context);
      refreshProgress(); refreshIcons(); return;
    }
    const result = outlet.querySelector(item ? "#item-results" : "#ability-results");
    if (result && (item || ability)) result.replaceWith(document.createRange().createContextualFragment(item ? itemResults() : abilityResults()));
    refreshProgress(); refreshIcons();
  }
  function refreshParseView() {
    if (!item) return;
    if (trialSession) { updateValidity(); return; }
    const tools = outlet.querySelector("#sql-parse-tools");
    if (tools) tools.innerHTML = parseToolsHTML();
    const fields = outlet.querySelector("#parsed-fields");
    if (fields) {
      const active = fields.contains(document.activeElement) ? document.activeElement : null;
      const model = active?.dataset.model, text = active?.value, start = active?.selectionStart, end = active?.selectionEnd;
      const open = [...fields.querySelectorAll("details")].map((el) => el.open);
      fields.innerHTML = fieldsHTML();
      fields.querySelectorAll("details").forEach((el, i) => {
        if (el.classList.contains("c-mapping") && (!item.draft.idAlias || !item.draft.valueAlias)) el.open = true;
        else if (open[i] !== undefined) el.open = open[i];
      });
      const replacement = model && [...fields.querySelectorAll("[data-model]")].find((el) => el.dataset.model === model);
      if (replacement) {
        if (model === "enum-input") replacement.value = text;
        replacement.focus({ preventScroll: true });
        if (typeof start === "number" && replacement.type !== "number") replacement.setSelectionRange?.(start, end);
      }
    }
    const bindings = outlet.querySelector("#parameter-bindings");
    if (bindings) {
      const active = bindings.contains(document.activeElement) ? document.activeElement.dataset.model : null, open = bindings.open;
      bindings.replaceWith(document.createRange().createContextualFragment(parameterBindingsHTML()));
      const replacement = outlet.querySelector("#parameter-bindings"); replacement.open = open;
      if (bindingPending()) replacement.open = true;
      if (active) [...replacement.querySelectorAll("[data-model]")].find((el) => el.dataset.model === active)?.focus({ preventScroll: true });
    }
    refreshMetricTable();
    refreshItemDimensions();
    const outputSection = outlet.querySelector("#sql-output-section");
    if (outputSection) {
      outputSection.querySelector("summary").textContent = `SQL 输出字段 · ${item.draft.fields.length} 个字段`;
      if (item.draft.removed.length || item.draft.fields.some((f) => f.review || f.role === "pending")) outputSection.open = true;
    }
    if (item.archived || sourceType(item) !== "custom_sql") freezeForms();
    updateValidity();
  }
  function refreshMetricTable() {
    const target = outlet.querySelector("#metric-table");
    if (!target) return;
    const active = target.contains(document.activeElement) ? document.activeElement : null;
    const model = active?.dataset.model, start = active?.selectionStart, end = active?.selectionEnd;
    target.innerHTML = metricTableHTML();
    const replacement = model && [...target.querySelectorAll("[data-model]")].find((el) => el.dataset.model === model);
    if (replacement) {
      replacement.focus({ preventScroll: true });
      if (typeof start === "number" && replacement.type === "text") replacement.setSelectionRange(start, end);
    }
    if (item.archived || sourceType(item) !== "custom_sql") freezeForms();
    refreshIcons();
  }
  function syncMetricReferences(target, previousKey = "", nextKey = "", addedKeys = []) {
    for (const ability of store.abilities) {
      const ref = ability.metrics.find((r) => r.itemId === target.id && !r.version);
      if (!ref) continue;
      if (previousKey) ref.metricKeys = ref.metricKeys.map((key) => key === previousKey ? nextKey : key);
      const keys = metricFields(target).map((f) => f.key);
      ref.metricKeys = ref.metricKeys.length ? [...new Set([...ref.metricKeys, ...addedKeys])].filter((key) => keys.includes(key)) : keys;
      syncQueryGroups(store, ability);
    }
  }
  function scheduleParse(target) {
    clearTimeout(parseTimers.get(target.id));
    if (target.archived || sourceType(target) !== "custom_sql" || target.draft.autoParse === false || !target.draft.sql.trim()) return;
    parseTimers.set(target.id, setTimeout(() => { parseTimers.delete(target.id); performParse(target); }, 800));
  }
  async function performParse(target, manual = false) {
    if (target.archived || sourceType(target) !== "custom_sql") return;
    clearTimeout(parseTimers.get(target.id)); parseTimers.delete(target.id);
    const sequence = ++parseSequence; parsing.set(target.id, sequence);
    if (item === target) {
      const tools = outlet.querySelector("#sql-parse-tools"); if (tools) tools.innerHTML = parseToolsHTML();
      refreshIcons();
    }
    try {
      const result = await parseItem(target);
      if (!result.stale) {
        syncMetricReferences(target);
        if (item === target) issues = [];
        if (manual) showToast("SQL 已解析，人工配置已保留");
      }
      return result;
    } catch (error) { if (manual && item === target) showToast(error.message); }
    finally {
      if (parsing.get(target.id) === sequence) parsing.delete(target.id);
      persist();
      const background = trialSession?.background;
      if (background?.item === target || background?.ability && [...background.ability.metrics, ...background.ability.dimensions].some((ref) => ref.itemId === target.id && !ref.version)) trialSession.parsedBackground = true;
      if (item === target) refreshParseView();
      else if (ability && [...ability.metrics, ...ability.dimensions].some((ref) => ref.itemId === target.id && !ref.version)) {
        if (trialSession) updateValidity(); else refreshDimensions();
      }
    }
  }
  function commitEnumInput(el, all = false) {
    if (!item || !el.value.trim()) return;
    const parts = el.value.split(/[,，\n]/), pending = all ? "" : parts.pop();
    const values = parts.map((text) => text.trim()).filter(Boolean).map((text) =>
      item.draft.valueType === "number" && /^-?\d+(\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? Number(text) : text);
    if (!values.length) return;
    item.draft.enumValues = [...new Set([...(item.draft.enumValues || []), ...values])];
    item.draft.enumEdited = true; el.value = pending;
    persist(); refreshParseView();
  }
  function openDialog(title, body, footer = "", wide = false) {
    previousFocus = document.activeElement; overlay.hidden = false; document.body.classList.add("p-modal-open");
    overlay.innerHTML = `<button class="p-overlay-backdrop" data-action="close" aria-label="关闭弹层"></button><aside class="p-drawer ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${title}</h2>${btn("close", "关闭", "x", "link")}</header><div class="p-drawer-body">${body}</div><footer>${footer || btn("close", "关闭")}</footer></aside>`;
    refreshIcons(); overlay.querySelector(".p-drawer input, .p-drawer select, .p-drawer button")?.focus();
  }
  function closeDialog() {
    if (overlay.hidden) { dialogKind = ""; return; }
    const environmentSettings = overlay.querySelector('[data-model="scenario"]');
    const focus = previousFocus; previousFocus = undefined;
    overlay.hidden = true; overlay.innerHTML = ""; if (!trialSession) document.body.classList.remove("p-modal-open"); dialogKind = "";
    abilityLoadTarget = undefined; abilitySourceId = ""; abilityLoadError = "";
    if (environmentSettings) updateValidity();
    const fallback = trialSession ? availableFocus(trialOverlay, '.c-trial-footer [data-action="close-trial"]') : pageActionFallback();
    (focus?.isConnected && !focus.disabled && focus.getClientRects().length ? focus : fallback)?.focus({ preventScroll: true });
  }
  function abilityLoadRunning(target) {
    const running = (obj) => obj?.running || obj?.status === "running" || obj?.runs?.some((run) => run.status === "running");
    return running(target) || store.items.some((source) =>
      (source.ownerAbilityId === target?.id || [...(target?.metrics || []), ...(target?.dimensions || [])].some((ref) => ref.itemId === source.id))
      && running(source));
  }
  function abilityLoadReadOnly(target) {
    return !target || target.archived || target.readOnly || target.readonly || target.preset || target.builtin
      || Object.isFrozen(target) || sourceType(target) !== "custom_sql";
  }
  function abilityLoadBlocked(target) {
    return abilityLoadReadOnly(target) || busy || abilityLoadBusy || abilityLoadRunning(target);
  }
  function assertAbilityLoadTarget(target) {
    if (!target || target !== ability || item || trialSession || location.hash !== `#/ability/${target.id}`
      || !store.abilities.includes(target)) throw new Error("请在当前能力配置页重新打开载入。");
    assertMutable(target);
    if (abilityLoadReadOnly(target)) throw new Error("当前能力只读，不能载入。");
    if (busy || abilityLoadRunning(target)) throw new Error("任务运行中，请等待完成后再载入。");
  }
  function abilitySourceRows() {
    let sources;
    try { sources = listAbilitySources(store, abilityLoadTarget); }
    catch (error) { abilityLoadError = error.message; return ""; }
    const search = abilitySourceSearch.trim().toLocaleLowerCase("zh-CN");
    const rows = sources.filter((source) => [source.name, source.key].join(" ").toLocaleLowerCase("zh-CN").includes(search));
    if (!rows.some((source) => source.id === abilitySourceId)) abilitySourceId = "";
    if (!rows.length) return `<div class="p-empty">${icon("folder-open")}<p>${sources.length ? "没有匹配的取数能力，试试其他名称或 Key。" : "暂无可载入的已保存取数能力。"}</p></div>`;
    return rows.map((source) => `<label><input type="radio" name="ability-source" data-model="ability-source" value="${esc(source.id)}" ${source.id === abilitySourceId ? "checked" : ""}><span><strong>${esc(source.name)}</strong>${badge(source.versionLabel === "已保存草稿" ? source.versionLabel : `已发布 ${source.versionLabel}`)}<p>${esc(source.description || "暂无说明")}</p><small>Key：${esc(source.key || "未生成")}</small></span></label>`).join("");
  }
  function refreshAbilityLoadControls() {
    const entry = outlet.querySelector('[data-action="ability-load"]');
    if (entry) entry.disabled = abilityLoadBlocked(ability);
    if (!abilityLoadTarget) return;
    const blocked = abilityLoadBlocked(abilityLoadTarget);
    const apply = overlay.querySelector('[data-action="ability-load-apply"]');
    if (apply) apply.disabled = blocked || !abilitySourceId;
    overlay.querySelectorAll('[data-model="ability-source"], [data-model="ability-source-search"]').forEach((el) => { el.disabled = blocked; });
    const error = overlay.querySelector("#ability-load-error");
    if (error) error.innerHTML = issuesHTML(abilityLoadError ? [abilityLoadError] : []);
  }
  function refreshAbilitySources() {
    const list = overlay.querySelector("#ability-source-list");
    if (list) list.innerHTML = abilitySourceRows();
    refreshAbilityLoadControls(); refreshIcons();
  }
  function openAbilityLoader() {
    if (abilityLoadBusy) return;
    assertAbilityLoadTarget(ability);
    abilityLoadTarget = ability; abilitySourceSearch = ""; abilitySourceId = ""; abilityLoadError = "";
    openDialog("载入已有取数能力", `<p class="c-ability-load-help">使用最新已发布版本；没有发布版本时使用已保存草稿。载入到当前能力后，仍点击原“保存草稿”保存。</p><label class="search-field c-ability-source-search">${icon("search")}<input type="search" aria-label="搜索取数能力名称或 Key" data-model="ability-source-search" placeholder="搜索能力名称或 Key"></label><div id="ability-load-error" aria-live="polite"></div><div class="c-picker c-ability-source-list" id="ability-source-list">${abilitySourceRows()}</div>`,
      btn("close", "取消") + btn("ability-load-apply", "载入所选能力", "folder-open", "primary", "disabled"));
    refreshAbilityLoadControls();
    overlay.querySelector('[data-model="ability-source-search"]').focus();
  }
  function applyAbilitySource() {
    if (abilityLoadBusy) return;
    const target = abilityLoadTarget, sourceId = abilitySourceId, focus = document.activeElement;
    abilityLoadBusy = true; abilityLoadError = ""; refreshAbilityLoadControls();
    try {
      assertAbilityLoadTarget(target);
      const source = listAbilitySources(store, target).find((candidate) => candidate.id === sourceId);
      if (!source) throw new Error("所选能力已不可用，请重新选择。");
      if (hasAbilityRetrievalContent(target) && !window.confirm(`载入“${source.name}”（${source.versionLabel}）将整体替换当前能力的指标、SQL 和维度取数内容。能力名称、说明、Key、实验上下文和历史记录保持。确认载入？`)) return;
      assertAbilityLoadTarget(target);
      if (!listAbilitySources(store, target).some((candidate) => candidate.id === sourceId)) throw new Error("所选能力已不可用，请重新选择。");
      const result = loadAbilityIntoDraft(store, target, sourceId);
      issues = []; dimensionPicker = undefined; valueDraft = undefined;
      persist(); renderAbility(); closeDialog();
      showToast(`已载入“${result.sourceName}” · ${result.versionLabel}，请点击“保存草稿”。`);
    } catch (error) {
      abilityLoadError = error.message; refreshAbilitySources(); showToast(error.message);
    } finally {
      abilityLoadBusy = false; refreshAbilityLoadControls();
      if (abilityLoadTarget && !overlay.hidden) {
        (focus?.isConnected && !focus.disabled ? focus
          : availableFocus(overlay, '[data-model="ability-source-search"], [data-action="close"]'))?.focus({ preventScroll: true });
      }
    }
  }
  function openPicker(kind) {
    pickerKind = kind;
    const available = store.items.filter((s) => !s.archived && s.kind === kind && s.versions.length && !(kind === "metric" ? ability.metrics : ability.dimensions).some((r) => r.itemId === s.id));
    openDialog(kind === "metric" ? "选择已有指标" : "选择已有维度", `<div class="c-picker">${available.map((s) => `<label><input type="checkbox" name="source-choice" value="${s.id}" ${s.unavailable ? "disabled" : ""}><span><strong>${esc(s.name)}</strong>${badge(s.preset ? "预设" : "SQL", s.preset ? "" : "blue")}<p>${esc(s.unavailable || s.description)}</p><small>v${s.versions.at(-1).number} · ${esc(s.key)}</small></span></label>`).join("") || "<p>暂无可添加的已发布取数项。</p>"}</div>`, btn("close", "取消") + btn("confirm-picker", "添加所选", "plus", "primary"));
  }
  function newSource(kind, owned) {
    if (owned) assertMutable(ability);
    const s = newItem(kind, owned ? ability.id : ""); s.context = clone(owned ? ability.context : defaultContext); s.scenario = "normal";
    store.items.push(s);
    if (owned) {
      (kind === "metric" ? ability.metrics : ability.dimensions).push({ itemId: s.id, version: 0, ...(kind === "metric" ? { metricKeys: [] } : {}) });
      if (kind === "dimension") ability.groups.push(completeGroup({ id: uid("drill"), name: s.draft.dimensionName, members: [s.id], cross: false }));
    }
    persist(); location.hash = `/item/${s.id}`;
  }
  async function handleAction(e) {
    const trigger = e.target.closest("[data-action]"); if (!trigger) return;
    const a = trigger.dataset.action, id = trigger.dataset.id;
    if (trigger.disabled) return;
    try {
      if (a === "close") { closeDialog(); return; }
      if (a === "close-trial") { closeTrial(); return; }
      if (trialSession?.recordView && !["trial-history", "trial-record", "view-trial-record", "select-run", "select-record", "trial-current", "return-current-validation"].includes(a)) {
        throw new Error("试跑记录只读，请返回当前验证。");
      }
      if (a === "environment") {
        const analysisPage = /^#\/(?:modules|analysis)(?:\/|$)/.test(location.hash);
        const target = item || ability || (analysisPage ? store.analysis : null);
        dialogKind = item ? "item-context" : ability ? "ability-context" : "analysis-context";
        openDialog("演示环境", `<p>使用示例数据，配置与发布版本仅保存在当前浏览器。</p>${target ? `<details class="p-scenarios"><summary>测试设置</summary>${select("取数场景", "scenario", Object.entries(scenarios), target.scenario || "normal")}${item || ability ? check("发布失败", "publish-failure", publishFailure) : ""}</details>` : ""}`);
        return;
      }
      if (a === "ability-load") { openAbilityLoader(); return; }
      if (a === "ability-load-apply") { applyAbilitySource(); return; }
      if (item && (["save", "back-owner", "parse", "accept-diff", "remove-enum", "reset-enums", "edit-field", "edit-metric", "save-field", "confirm-save-field", "insert-parameter", "sql-template", "publish-item", "confirm-publish-item", "dimension-auto", "dimension-output-add", "dimension-output-remove"].includes(a) || a.startsWith("metric-") || a.startsWith("template-"))) assertMutable(item);
      if (ability && (["save", "confirm-picker", "remove-source", "remove-group", "add-single", "add-cross", "publish-ability", "confirm-publish-ability"].includes(a) || /^(pick-|dimension-|value-)/.test(a))) assertMutable(ability);
      if (item && /^(dimension-(pick|tab|remove|values)|value-)/.test(a)) { assertMutable(item); assertMutable(dimensionOwner()); }
      if (a === "dimension-auto") {
        if (busy || parsing.has(item.id)) return;
        const target = item;
        await performParse(target, true);
        if (item !== target) return;
        if (item.draft.parsedSql === item.draft.sql && !item.draft.parseError) showToast(`已解析 ${item.kind === "metric" ? outputDimensions(item).length : item.draft.valueCandidates?.length || 0} 个维度，人工配置已保留`);
        return;
      }
      if (a === "dimension-output-add" || a === "dimension-output-remove") {
        const field = a === "dimension-output-add"
          ? item.draft.fields.find((f) => f.alias === outlet.querySelector('[data-model="dimension-output-candidate"]').value)
          : item.draft.fields[Number(trigger.dataset.index)];
        if (!field || field.role === "identity") throw new Error("请选择实际 SQL 输出的业务字段。");
        field.role = a === "dimension-output-add" ? "dimension" : "auxiliary";
        syncMetrics(item); syncMetricReferences(item); persist(); refreshParseView(); return;
      }
      if (a === "dimension-pick-source") { openDimensionPicker("single", trigger.dataset.source); return; }
      if (a === "dimension-pick-single" || a === "dimension-pick-cross" || a === "dimension-pick-member") {
        openDimensionPicker(a === "dimension-pick-single" ? "single" : a === "dimension-pick-cross" ? "new" : id); return;
      }
      if (a === "dimension-picker-close") { closeDimensionPicker(); return; }
      if (a === "dimension-tab") { dimensionPicker.tab = id; refreshDimensions(); refreshDimensionOptions(); return; }
      if (a === "dimension-picker-confirm") {
        const ability = dimensionOwner();
        const p = dimensionPicker, options = dimensionOptions(), selected = p.selected.map((id) => options.find((d) => d.id === id));
        if (!selected.length || selected.some((d) => !d || d.reason)) throw new Error("请重新选择可用维度。");
        const target = ability.groups.find((g) => g.id === p.target);
        if (p.target !== "single" && (selected.length + (target?.members.length || 0) > 4 || (p.target === "new" && selected.length < 2))) throw new Error("交叉维度请选择 2–4 个不同成员。");
        for (const d of selected.filter((d) => !d.queryItemId)) {
          if (!ability.dimensions.some((r) => r.itemId === d.id)) ability.dimensions.push(clone(d.ref));
        }
        if (p.target === "single") {
          for (const d of selected) {
            if (d.queryItemId) ability.groups.find((g) => g.queryItemId === d.queryItemId).enabled = true;
            else if (!activeGroups(ability).some((g) => !g.cross && g.members.includes(d.id))) ability.groups.push(completeGroup({ id: uid("drill"), name: d.name, cross: false, members: [d.id] }));
          }
        } else {
          const group = target || completeGroup({ id: uid("drill"), name: "交叉维度", cross: true, members: [] });
          group.members = [...new Set([...group.members, ...selected.map((d) => d.id)])];
          nameGroup(group);
          if (!target) {
            if (activeGroups(ability).some((g) => !g.queryItemId && [...g.members].sort().join("|") === [...group.members].sort().join("|"))) throw new Error("已添加相同的交叉维度。");
            ability.groups.push(group);
          }
        }
        dimensionPicker = undefined; persist(); refreshDimensions(); return;
      }
      if (a === "dimension-remove-group") {
        const ability = dimensionOwner();
        const group = ability.groups.find((g) => g.id === id);
        if (group.queryItemId) group.enabled = false;
        else ability.groups = ability.groups.filter((g) => g.id !== id);
        pruneDimensions();
        if (!activeGroups(ability).length) ability.showOverall = true;
        persist(); refreshDimensions(); return;
      }
      if (a === "dimension-remove-member") {
        const ability = dimensionOwner();
        const group = ability.groups.find((g) => g.id === id), member = trigger.dataset.member;
        const key = groupDimensions(group).find((d) => d.itemId === member)?.key;
        group.members = group.members.filter((id) => id !== member);
        if (key && group.valueFilters) delete group.valueFilters[key];
        nameGroup(group); pruneDimensions(); persist(); refreshDimensions(); return;
      }
      if (a === "dimension-values") {
        const ability = dimensionOwner();
        const group = ability.groups.find((g) => g.id === id), d = groupDimensions(group).find((d) => d.key === trigger.dataset.key);
        if (!d) throw new Error("该维度已不存在。");
        const filter = group.valueFilters?.[d.key], values = [...(d.values || []), ...(filter || [])];
        for (const run of ability.runs) for (const record of run.records || []) {
          if (!record.modeId.endsWith(`__${id}`)) continue;
          const field = record.fields?.find((f) => f.role === "dimension" && f.key === d.key);
          if (field) values.push(...(record.rawRows || []).map((r) => r[field.alias]));
        }
        valueDraft = { groupId: id, key: d.key, type: d.type, all: !filter, values: [...new Set(values)].filter((v) => v === null || typeof v === d.type), selected: [], input: "" };
        valueDraft.selected = valueDraft.values.flatMap((v, i) => filter?.includes(v) ? [i] : []);
        openDialog(`拆解取值 · ${d.name}`, `<div id="dimension-value-picker">${valuePickerHTML()}</div>`, btn("close", "取消") + btn("value-apply", "应用", "check", "primary"));
        refreshValuePicker(); return;
      }
      if (a === "value-add") {
        const values = valueDraft.input.split(/[,，]/).map((v) => v.trim()).filter(Boolean).map((v) => valueDraft.type === "number" ? Number(v) : v);
        if (values.some((v) => typeof v === "number" && !Number.isFinite(v))) throw new Error("数字维度请填写数字取值。");
        for (const v of values) {
          let index = valueDraft.values.indexOf(v);
          if (index < 0) { index = valueDraft.values.length; valueDraft.values.push(v); }
          if (!valueDraft.selected.includes(index)) valueDraft.selected.push(index);
        }
        valueDraft.input = ""; refreshValuePicker(); return;
      }
      if (a === "value-apply") {
        const ability = dimensionOwner();
        const d = valueDraft, group = ability.groups.find((g) => g.id === d.groupId);
        if (!d.all && !d.selected.length) throw new Error("至少选择一个拆解取值。");
        group.valueFilters ||= {};
        if (d.all) delete group.valueFilters[d.key];
        else group.valueFilters[d.key] = d.selected.map((i) => d.values[i]);
        persist(); closeDialog(); valueDraft = undefined; refreshDimensions(); return;
      }
      if (a === "toggle-parameters") {
        parameterOpen = !parameterOpen;
        outlet.querySelector("#parameter-catalog").hidden = !parameterOpen;
        outlet.querySelector(".c-sql-layout").classList.toggle("parameters-open", parameterOpen);
        outlet.querySelector('[data-action="toggle-parameters"]').setAttribute("aria-expanded", String(parameterOpen));
        return;
      }
      if (a === "insert-parameter") {
        const editor = outlet.querySelector("#sql-editor");
        editor.setRangeText(`\${${trigger.dataset.key}}`, editor.selectionStart, editor.selectionEnd, "end");
        editor.focus(); editor.dispatchEvent(new Event("input", { bubbles: true })); return;
      }
      if (a === "view-group-sql") {
        const ability = dimensionOwner();
        const modes = abilityModes(store, ability).filter((mode) => mode.id.endsWith(`__${id}`));
        openDialog("绑定 SQL", modes.length ? modes.map((mode) => `<h3>${esc(mode.name)}</h3><pre>${esc(mode.sql)}</pre>`).join("") : "<p>选择指标来源并确认输出后可查看本组 SQL。</p>", "", true); return;
      }
      if (a === "archive" || a === "restore") {
        const obj = (trigger.dataset.type === "item" ? store.items : store.abilities).find((o) => o.id === id);
        if (!obj) throw new Error("当前对象已不存在。");
        if (a === "restore") { setArchived(obj, false); persist(); render(); return; }
        pendingArchive = obj;
        const impact = keyImpact(store, obj);
        openDialog("归档", `<p>归档“${esc(obj.name)}”后，不再用于新增选择。已有固定引用和发布记录保留。</p>${impact.length ? `<ul>${impact.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : "<p>当前没有外部引用。</p>"}`, btn("close", "取消") + btn("confirm-archive", "确认归档", "archive", "primary")); return;
      }
      if (a === "confirm-archive") { setArchived(pendingArchive, true); persist(); closeDialog(); render(); return; }
      if (a === "back-modules") { location.hash = "/modules"; return; }
      if (a === "workflow-guide") { location.hash = "/guide"; return; }
      if (a === "back-owner") { saveDraft(item, store); syncMetricReferences(item); persist(); location.hash = `/ability/${item.ownerAbilityId}`; return; }
      if (a === "new-ability") { const ability = newAbility("未命名取数能力"); store.abilities.push(ability); persist(); location.hash = `/ability/${ability.id}`; return; }
      if (a === "run-catalog") {
        const target = store.abilities.find((obj) => obj.id === id), actions = abilityCatalogActions(store, target);
        if (!actions.trial) throw new Error(target.archived ? "此能力已归档，暂无验证记录。" : "请先进入编辑，完成取数配置后再试跑。");
        openTrial("ability", id, actions.trial.runId, actions.trial.history ? "record" : "input"); return;
      }
      if (a === "trial-history-catalog") { openTrial("ability", id, "", "history"); return; }
      if (a === "trial-history") { showTrialHistory("history"); return; }
      if (a === "trial-record" || a === "view-trial-record") {
        const kind = trigger.dataset.kind || "ability", targetId = id || ability?.id;
        if (trialSession) {
          if (trialSession.kind !== kind || trialSession.obj.id !== targetId) throw new Error("该试跑记录不存在");
          showTrialHistory("record", trigger.dataset.runId);
        } else {
          if (a === "view-trial-record" && (!ability || targetId !== ability.id)) throw new Error("该试跑记录不存在");
          openTrial(kind, targetId, trigger.dataset.runId, "record");
        }
        return;
      }
      if (a === "trial-current" || a === "return-current-validation") { returnCurrentValidation(); return; }
      if (a === "copy-builtin-ability") {
        const { target } = copyBuiltinAbility(store, id);
        persist(); closeDialog(); location.hash = `/ability/${target.id}`;
        showToast("已复制为新的自定义能力草稿，请保存后试跑"); return;
      }
      if (a === "edit-ability") { location.hash = `/ability/${id}`; return; }
      if (a === "new-owned-dimension" || a === "edit-owned-dimension") {
        const owner = ability || store.abilities.find((owner) => owner.id === item?.ownerAbilityId);
        const source = a === "edit-owned-dimension" ? store.items.find((s) => s.id === id) : undefined;
        if (!owner) throw new Error("请先将当前 SQL 关联到取数能力组。");
        if (item) assertMutable(item);
        if (a === "edit-owned-dimension" && !source) throw new Error("维度已不存在，请刷新后重试。");
        dimensionPicker = undefined;
        outlet.querySelector(".c-dimension-picker")?.remove();
        dimensionDialog.open(owner, source, outlet.querySelector("[data-dimension-editor-host]")); return;
      }
      if (a.startsWith("new-owned-")) { newSource(a.endsWith("dimension") ? "dimension" : "metric", true); return; }
      if (a === "save") { saveDraft(item || ability || store.analysis, store); persist(); render(); showToast("草稿已保存"); return; }
      if (a === "export") {
        const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "msense-composer-workspace.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
      }
      if (a === "pick-metric" || a === "pick-dimension") { openPicker(a.endsWith("dimension") ? "dimension" : "metric"); return; }
      if (a === "confirm-picker") {
        const ids = [...overlay.querySelectorAll('input[name="source-choice"]:checked')].map((el) => el.value);
        for (const id of ids) attachItem(store, store.items.find((s) => s.id === id), ability, store.items.find((s) => s.id === id).versions.at(-1).number);
        persist(); closeDialog(); render(); return;
      }
      if (a === "edit-source") {
        const s = store.items.find((s) => s.id === id), version = Number(trigger.dataset.version);
        if (!version) { location.hash = `/item/${id}`; return; }
        openDialog(`${esc(s.name)} · v${version}`, `<p>当前能力引用已发布固定版本。复制为能力内 SQL 后可编辑，原来源版本仍保持固定。</p><pre>${esc(s.versions.find((v) => v.number === version).definition.draft.sql)}</pre>`, btn("close", "返回") + btn("copy-source", "复制为自定义 SQL", "copy", "primary", `data-id="${id}" data-version="${version}"`), true); return;
      }
      if (a === "copy-source") {
        const origin = store.items.find((s) => s.id === id);
        if (sourceType(origin) === "builtin_rpc" || origin.archived) throw new Error("此来源不能复制为自定义 SQL。");
        const source = origin.versions.find((v) => v.number === Number(trigger.dataset.version)).definition;
        const targetAbility = ability || (source.kind === "dimension" ? dimensionOwner() : undefined);
        if (targetAbility) assertMutable(targetAbility);
        const s = newItem(source.kind, targetAbility?.id || ""); s.draft = clone(source.draft); s.name = `${source.name} · SQL`; s.description = source.description; s.context = clone(targetAbility?.context || defaultContext); s.scenario = "normal";
        if (s.kind === "dimension") { s.draft.dimensionKey = uid("dimension"); s.draft.dimensionName = s.name; syncDimension(s); }
        store.items.push(s);
        if (targetAbility) {
          const collection = s.kind === "metric" ? targetAbility.metrics : targetAbility.dimensions;
          const ref = collection.find((r) => r.itemId === id); ref.itemId = s.id; ref.version = 0;
          targetAbility.groups.forEach((g) => {
            g.members = g.members.map((member) => member === id ? s.id : member);
            if (g.queryItemId === id) g.queryItemId = s.id;
            if (s.kind === "dimension" && g.valueFilters?.[source.draft.dimensionKey]) {
              g.valueFilters[s.draft.dimensionKey] = g.valueFilters[source.draft.dimensionKey];
              delete g.valueFilters[source.draft.dimensionKey];
            }
          });
          syncQueryGroups(store, targetAbility);
        }
        persist(); closeDialog(); location.hash = `/item/${s.id}`; return;
      }
      if (a === "remove-source") {
        const collection = trigger.dataset.kind === "metric" ? ability.metrics : ability.dimensions;
        collection.splice(collection.findIndex((r) => r.itemId === id), 1);
        if (trigger.dataset.kind === "dimension") {
          ability.groups.forEach((g) => { g.members = g.members.filter((member) => member !== id); });
          ability.groups = ability.groups.filter((g) => g.cross || g.members.length);
        }
        syncQueryGroups(store, ability); persist(); render(); return;
      }
      if (a === "add-single" || a === "add-cross") {
        const cross = a === "add-cross", members = ability.dimensions.slice(0, cross ? 2 : 1).map((r) => r.itemId);
        ability.groups.push(completeGroup({ id: uid("drill"), name: cross ? "交叉下钻" : "独立下钻", cross, members })); persist(); render(); return;
      }
      if (a === "remove-group") { ability.groups = ability.groups.filter((g) => g.id !== id); persist(); render(); return; }
      if (a === "parse") {
        if (busy) return; await performParse(item, true); return;
      }
      if (a === "sql-template") {
        openDialog("获取 SQL 模板", `<p class="c-config-help">应用模板会替换当前 SQL 与指标配置。</p><div class="c-template-options">${item.kind === "metric" ? `${btn("template-users", "用户粒度指标 · 订单量、人均与渗透", "users")}${btn("template-summary", "聚合指标 · 支持独立与交叉下钻", "chart-no-axes-column")}` : btn("template-dimension", "用户消费力维度", "list-filter")}</div>`); return;
      }
      if (a.startsWith("template-")) {
        const d = item.draft, userTemplate = a === "template-users";
        d.sql = userTemplate ? userMetricSQL : a === "template-summary" ? metricSQL() : newItem("dimension").draft.sql;
        d.parsedSql = ""; d.parseError = ""; d.fields = []; d.parameters = []; d.removed = []; d.diff = [];
        delete d.metricDefinitions; delete d.metricKnownAliases; d.excludedMetricAliases = []; d.metricTemplate = userTemplate ? "users" : "";
        closeDialog(); render(); await performParse(item, true);
        if (userTemplate && !d.parseError) {
          const source = d.fields.find((f) => f.alias === "order_cnt");
          const add = (name, calculation, aggregation = "sum", format = "integer") => {
            const m = newMetric(item, source, calculation);
            Object.assign(m, { name, aggregation, format }); return m;
          };
          d.metricDefinitions = [add("User", "users"), add("订单量", "sum"), add("人均订单数", "per_user", "sum", "decimal"),
            add("订单渗透", "per_user", "uv", "percent"), add("下单用户数", "uv")];
          syncMetricReferences(item, "", "", d.metricDefinitions.map((m) => m.key)); persist(); refreshParseView();
        }
        return;
      }
      if (a.startsWith("metric-")) {
        if (a === "metric-auto") {
          if (busy || parsing.has(item.id)) return;
          const target = item, parsed = await performParse(target);
          if (item !== target || !parsed || parsed.stale || item.draft.parseError) return;
        }
        syncMetrics(item);
        const rows = item.draft.metricDefinitions, index = Number(trigger.dataset.index), row = rows[index], added = [];
        if (a === "metric-add") {
          const m = newMetric(item, item.draft.fields.find((f) => f.role === "metric" && f.type === "number"));
          rows.push(m); added.push(m.key);
        } else if (a === "metric-copy") {
          const m = { ...clone(row), alias: uid("metric"), key: uid("metric"), name: `${row.name}（副本）`, fromOutput: false };
          rows.splice(index + 1, 0, m); added.push(m.key);
        } else if (a === "metric-delete") {
          item.draft.excludedMetricAliases = [...new Set([...item.draft.excludedMetricAliases, row.valueAlias])];
          rows.splice(index, 1);
        } else if (a === "metric-move-up" || a === "metric-move-down") {
          const next = index + (a === "metric-move-up" ? -1 : 1);
          if (rows[next]) [rows[index], rows[next]] = [rows[next], rows[index]];
        } else if (a === "metric-auto") {
          item.draft.excludedMetricAliases = []; item.draft.metricKnownAliases = [];
          const before = new Set(rows.map((m) => m.key)); syncMetrics(item);
          added.push(...item.draft.metricDefinitions.filter((m) => !before.has(m.key)).map((m) => m.key));
          showToast("已按 SQL 输出补齐指标，现有配置已保留");
        }
        syncMetricReferences(item, "", "", added); persist(); refreshMetricTable(); updateValidity(); return;
      }
      if (a === "remove-enum") { item.draft.enumValues.splice(Number(trigger.dataset.index), 1); item.draft.enumEdited = true; persist(); refreshParseView(); return; }
      if (a === "reset-enums") { item.draft.enumEdited = false; syncDimension(item); persist(); refreshParseView(); return; }
      if (a === "accept-diff") { item.draft.removed = []; item.draft.fields.forEach((f) => { f.review = false; }); persist(); render(); return; }
      if (a === "edit-field") {
        fieldDraft = clone(item.draft.fields[Number(trigger.dataset.index)]); fieldDraft.index = Number(trigger.dataset.index);
        openDialog("更多字段设置", `<div class="p-field-source"><code>${esc(fieldDraft.alias)}</code><pre>${esc(fieldDraft.source || "")}</pre></div><div class="p-form-grid two">${input("显示名称", "field.name", fieldDraft.name)}${input("输出 Key", "field.key", fieldDraft.key)}${select("业务角色", "field.role", [["metric", "指标"], ["dimension", "维度"], ["identity", "身份"], ["auxiliary", "辅助"]], fieldDraft.role)}${select("原生类型", "field.type", [["number", "数字"], ["string", "字符串"]], fieldDraft.type)}${select("显示格式", "field.format", [["decimal", "小数"], ["currency", "金额"], ["integer", "整数"], ["percent", "百分比"]], fieldDraft.format || "decimal")}${input("小数位数", "field.precision", fieldDraft.precision ?? 2, 'type="number" min="0" max="6"')}${input("单位", "field.unit", fieldDraft.unit || "")}${input("空值显示", "field.nullDisplay", fieldDraft.nullDisplay || "—")}</div>${area("字段口径", "field.description", fieldDraft.description)}${check("对照组比较指标显示为 —", "field.controlDash", fieldDraft.controlDash)}<p class="c-config-hint">仅用于比较指标，普通基值保留原展示；SQL 原值不变。</p>${check("已复核来源与粒度", "field-reviewed", !fieldDraft.review)}`, btn("close", "取消") + btn("save-field", "保存定义", "check", "primary")); return;
      }
      if (a === "edit-metric") {
        syncMetrics(item);
        fieldDraft = clone(item.draft.metricDefinitions[Number(trigger.dataset.index)]);
        fieldDraft.metricKey = fieldDraft.key;
        openDialog("指标更多设置", `<div class="p-form-grid two">${input("指标名称", "field.name", fieldDraft.name)}${input("指标 Key", "field.key", fieldDraft.key)}${select("显示格式", "field.format", [["decimal", "小数"], ["currency", "金额"], ["integer", "整数"], ["percent", "百分比"]], fieldDraft.format)}${input("小数位数", "field.precision", fieldDraft.precision, 'type="number" min="0" max="6"')}${input("单位", "field.unit", fieldDraft.unit || "")}${input("空值显示", "field.nullDisplay", fieldDraft.nullDisplay || "—")}</div>${area("指标口径（选填）", "field.description", fieldDraft.description)}${check("对照组比较指标显示为 —", "field.controlDash", fieldDraft.controlDash)}`, btn("close", "取消") + btn("save-field", "保存", "check", "primary")); return;
      }
      if (a === "save-field" || a === "confirm-save-field") {
        if (fieldDraft.metricKey) {
          const index = item.draft.metricDefinitions.findIndex((m) => m.key === fieldDraft.metricKey);
          if (index < 0) throw new Error("该指标已被删除，请重新打开设置。");
          const previousKey = fieldDraft.metricKey; delete fieldDraft.metricKey; fieldDraft.fromOutput = false;
          item.draft.metricDefinitions[index] = fieldDraft;
          syncMetricReferences(item, previousKey, fieldDraft.key); persist(); closeDialog(); render(); return;
        }
        const index = item.draft.fields.findIndex((f) => f.alias === fieldDraft.alias);
        if (index < 0) throw new Error("该输出已被 SQL 删除，请关闭弹层并重新检查解析结果。");
        const oldKey = item.draft.fields[index].key; delete fieldDraft.index;
        if (a === "save-field" && item.keyLocked && oldKey !== fieldDraft.key) {
          openDialog("确认修改字段 Key", `<p>${esc(oldKey)} → ${esc(fieldDraft.key)}</p><p>将更新当前草稿的指标选择与维度成员；已发布版本不变。</p>${keyImpact(store, item).map((v) => `<p>${esc(v)}</p>`).join("")}`, btn("close", "取消") + btn("confirm-save-field", "确认修改", "check", "primary")); return;
        }
        item.draft.fields[index] = fieldDraft; syncMetrics(item); syncMetricReferences(item, oldKey, fieldDraft.key); persist(); closeDialog(); render(); return;
      }
      if (a === "item-context" || a === "ability-context") { openTrial(item ? "item" : "ability", (item || ability).id, trigger.dataset.runId); return; }
      if (a === "trial-run") {
        if (!trialSession || trialSession.recordView) throw new Error("试跑记录只读，请返回当前验证。");
        if (busy) return;
        if (trialSession.obj.archived) throw new Error("已归档能力不能发起新试跑。");
        if (ability && abilityLoadBlocked(ability)) throw new Error("当前能力暂不能发起新试跑。");
        issues = trialContextIssues(trialScope().context);
        if (issues.length) { updateValidity(); return; }
        if (trialKind === "preset") {
          if (!presetDraft().metrics.length) { issues = ["请先选择至少一个指标。"]; updateValidity(); return; }
          trialSession.mode = "result"; presetResult = presetId; renderTrial(); return;
        }
        const targetItem = item, targetAbility = ability, session = trialSession, target = targetItem || targetAbility;
        busy = true; issues = []; selectedRun = ""; selectedRecord = "";
        session.mode = "result"; session.runId = "";
        const previousRuns = new Set(target.runs.map((run) => run.id));
        const update = () => {
          const created = target.runs.find((run) => !previousRuns.has(run.id));
          if (created) {
            if (session.recordView) {
              session.currentValidation = { ...session.currentValidation, mode: "result", runId: created.id };
            } else {
              session.mode = "result"; session.runId = created.id;
              if (trialSession === session) selectedRun = created.id;
            }
          }
          persist(); if (trialSession) { renderTrial(); refreshProgress(); } else if (item || ability) updateValidity(); else render();
        };
        try {
          if (targetItem) await runItem(targetItem, targetItem.context || defaultContext, targetItem.scenario || "normal", update);
          else await runAbility(store, targetAbility, update);
        } finally { busy = false; update(); } return;
      }
      if (a === "analysis-context") {
        dialogKind = a;
        openDialog("分析试跑上下文", contextHTML(store.analysis.context),
          btn("close", "取消") + btn("context-done", "确认上下文", "check", "primary")); return;
      }
      if (a === "context-done") { closeDialog(); persist(); render(); return; }
      if (a === "select-run") { showTrialHistory("record", trigger.dataset.runId || id); return; }
      if (a === "select-record") {
        if (trialSession?.recordView && !trialSnapshot(trialSession.obj, trialSession.runId, trialSession.kind)?.records.some((record) => record.id === id)) throw new Error("该任务记录不存在");
        selectedRecord = id; updateValidity(); return;
      }
      if (a === "publish-item" || a === "publish-ability") {
        if (trialSession?.recordView) throw new Error("试跑记录只读，不能发布。");
        const list = a === "publish-item" ? itemPublishIssues(item, itemContext(), item.scenario || "normal") : abilityPublishIssues(store, ability);
        openDialog(a === "publish-item" ? "发布 SQL 取数项" : "发布取数能力",
          `<p>发布 v${(item || ability).versions.length + 1} · ${esc((item || ability).name)}</p>${issuesHTML(list)}<p>${a === "publish-item" ? "发布后可关联到其他取数能力。" : "发布后可在分析模块中选择此版本。"}</p>`,
          btn("close", "返回编辑") + btn(a === "publish-item" ? "confirm-publish-item" : "confirm-publish-ability", "确认发布", "upload", "primary", list.length ? "disabled" : "")); return;
      }
      if (a === "confirm-publish-item" || a === "confirm-publish-ability") {
        if (trialSession?.recordView) throw new Error("试跑记录只读，不能发布。");
        if (publishFailure) { showToast("发布失败，未创建版本，请重试"); return; }
        const version = a === "confirm-publish-item" ? publishItem(item, itemContext(), item.scenario || "normal") : publishAbility(store, ability);
        persist(); closeDialog(); render(); showToast(`已发布 v${version.number}`); return;
      }
      if (a === "attach") {
        const fresh = newAbility(`${item.name}取数组`);
        attachDraft = { number: Number(trigger.dataset.number || 0), mode: "existing", target: "", name: fresh.name, description: item.description };
        renderAttach(); return;
      }
      if (a === "attach-existing" || a === "attach-new") { attachDraft.mode = a === "attach-new" ? "new" : "existing"; renderAttach(); return; }
      if (a === "confirm-attach") {
        let target = attachDraft.mode === "existing" ? store.abilities.find((a) => a.id === attachDraft.target) : newAbility(attachDraft.name);
        if (!target) throw new Error("请选择目标取数能力组。");
        if (attachDraft.mode === "new") {
          target.description = attachDraft.description;
          if (!target.name.trim() || !target.description.trim()) throw new Error("请填写能力组名称和说明。");
        }
        attachItem(store, item, target, attachDraft.number);
        if (attachDraft.mode === "new") store.abilities.push(target);
        saveDraft(target, store); persist(); closeDialog(); location.hash = `/ability/${target.id}`; showToast("能力组已保存，可以整体试跑"); return;
      }
      if (a === "use-ability" || a === "use-version") {
        const target = a === "use-ability" ? store.abilities.find((a) => a.id === id) : ability;
        if (!target || !abilityCatalogActions(store, target).analysis) throw new Error("请使用未归档自定义能力的已发布版本。");
        useVersion(store, target, a === "use-version" ? Number(trigger.dataset.number) : target.versions.at(-1).number);
        persist(); location.hash = "/modules"; return;
      }
      if (a === "view-version") {
        const v = (trigger.dataset.type === "item" ? item : ability).versions.find((v) => v.number === Number(trigger.dataset.number));
        openDialog(`固定版本 v${v.number}`, `<pre>${esc(JSON.stringify(v, null, 2))}</pre>`, "", true); return;
      }
      if (a === "analyze") {
        if (busy) return; busy = true; issues = []; render();
        try {
          const attempt = await runAnalysis(store, () => { persist(); render(); });
          selectedRecord = ""; analysisTab = "output"; location.hash = `/analysis/${attempt.id}`;
        } finally { busy = false; persist(); render(); } return;
      }
      if (a === "analysis-output" || a === "analysis-input") { analysisTab = a === "analysis-output" ? "output" : "input"; highlight = -1; render(); return; }
      if (a === "analysis-record") { selectedRecord = id; highlight = -1; render(); return; }
      if (a === "evidence") { selectedRecord = trigger.dataset.execution; highlight = Number(trigger.dataset.row); analysisTab = "input"; render(); return; }
    } catch (error) {
      showToast(error.message);
      if (trialSession?.recordView || error.message === "该试跑记录不存在") return;
      issues = [error.message]; if (overlay.hidden) render();
    }
  }
  function handleModel(e) {
    const el = e.target, model = el.dataset.model; if (!model) return;
    if (el.disabled) return;
    if (trialSession?.recordView) return;
    if (["checkbox", "radio"].includes(el.type) && e.type !== "change") return;
    if (el.tagName === "SELECT" && e.type !== "change") return;
    if (["INPUT", "TEXTAREA"].includes(el.tagName) && !["checkbox", "radio"].includes(el.type) && e.type === "change") return;
    const parts = model.split("."), value = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
    const [kind, key, detail] = parts;
    if (kind === "ability-source-search") {
      abilitySourceSearch = value; abilityLoadError = ""; refreshAbilitySources(); return;
    }
    if (kind === "ability-source") {
      if (e.type !== "change") return;
      abilitySourceId = value; abilityLoadError = ""; refreshAbilityLoadControls(); return;
    }
    if (kind === "parameter-search") {
      parameterSearch = value; outlet.querySelector("#parameter-catalog-list").innerHTML = parameterRows(); refreshIcons(); return;
    }
    if (["catalog-source", "catalog-goal", "catalog-state"].includes(kind)) {
      if (kind === "catalog-source") catalogSource = value;
      else if (kind === "catalog-goal") catalogGoal = value;
      else catalogState = value;
      renderCatalog(); return;
    }
    try {
      if (["item", "draft", "output", "metric-row", "param", "enum-input", "field", "field-reviewed"].includes(kind)) assertMutable(item);
      if (["ability", "metric"].includes(kind)) assertMutable(ability);
      if (["ref", "group", "member", "dimension-overall", "dimension-search", "dimension-choice", "value-all", "value-choice", "value-input"].includes(kind)) {
        if (item) assertMutable(item);
        assertMutable(dimensionOwner());
      }
    } catch (error) { showToast(error.message); return; }
    if (kind === "dimension-search") { dimensionPicker.search = value; refreshDimensionOptions(); return; }
    if (kind === "dimension-choice") {
      dimensionPicker.selected = value ? [...new Set([...dimensionPicker.selected, el.value])] : dimensionPicker.selected.filter((id) => id !== el.value);
      refreshDimensionOptions(); return;
    }
    if (kind === "dimension-output-candidate") return;
    if (kind === "dimension-overall") {
      const owner = dimensionOwner();
      if (!value && !activeGroups(owner).length) { el.checked = true; showToast("请先添加维度，保留至少一种结果展示"); return; }
      owner.showOverall = value; persist(); updateValidity(); return;
    }
    if (kind === "value-input") { valueDraft.input = value; return; }
    if (kind === "value-all") { valueDraft.all = value; refreshValuePicker(); return; }
    if (kind === "value-choice") {
      valueDraft.selected = value ? [...new Set([...valueDraft.selected, Number(key)])] : valueDraft.selected.filter((i) => i !== Number(key));
      refreshValuePicker(); return;
    }
    if ((["item", "ability"].includes(kind) && key === "key") || (kind === "group" && detail === "key") || (kind === "ability" && key === "owner") || (["ability", "analysis"].includes(kind) && key === "goal")) return;
    if (kind === "enum-input") { if (/[,，\n]/.test(value)) commitEnumInput(el); return; }
    if (kind === "field") { fieldDraft[key] = value; return; }
    if (kind === "field-reviewed") { fieldDraft.review = !value; return; }
    if (kind === "attach-target") { attachDraft.target = value; return; }
    if (kind === "attach-form") { if (["name", "description"].includes(key)) attachDraft[key] = value; return; }
    if (kind === "publish-failure") { publishFailure = value; return; }
    if (kind === "context") {
      const obj = trialKind === "preset" ? presetDraft().context : trialKind === "item" || dialogKind === "item-context" ? (item.context ||= clone(defaultContext)) : trialKind === "ability" || dialogKind === "ability-context" ? ability.context : store.analysis.context;
      obj[key] = value;
      issues = []; if (trialKind === "preset") presetResult = "";
      if (trialSession) { trialSession.mode = "input"; trialSession.runId = ""; selectedRun = ""; selectedRecord = ""; }
    } else if (kind === "scenario") (trialKind === "item" || dialogKind === "item-context" ? item : trialKind === "ability" || dialogKind === "ability-context" ? ability : store.analysis).scenario = value;
    else if (kind === "ability") {
      if (key === "showOverall" && !value && !activeGroups(ability).length) { el.checked = true; showToast("请先添加维度，保留至少一种结果展示"); return; }
      ability[key] = value;
    }
    else if (kind === "item") item[key] = value;
    else if (kind === "metric-row") {
      syncMetrics(item);
      const row = item.draft.metricDefinitions[Number(key)]; row[detail] = value; row.fromOutput = false;
      if (detail === "calculation" && ["users", "uv"].includes(value)) row.format = "integer";
      if (detail === "aggregation" && row.calculation === "per_user" && value === "uv") row.format = "percent";
      syncMetricReferences(item); persist();
      if (detail !== "name") refreshMetricTable();
      updateValidity(); return;
    }
    else if (kind === "output") {
      const field = item.draft.fields[Number(key)], oldKey = field.key;
      field[detail] = value;
      if (detail === "role" && value === "metric") item.draft.metricKnownAliases = (item.draft.metricKnownAliases || []).filter((alias) => alias !== field.alias);
      syncMetrics(item);
      syncMetricReferences(item, detail === "key" ? oldKey : "", field.key);
      if (detail === "role") { persist(); refreshParseView(); return; }
      refreshMetricTable();
    }
    else if (kind === "draft") {
      item.draft[key] = value;
      if (key === "entity") item.draft.entityColumn = entities[value].column;
      if (key === "sql") {
        item.draft.parseError = "";
        outlet.querySelector(".p-code-highlight").innerHTML = syntax(value);
        outlet.querySelector(".p-line-numbers").textContent = value.split("\n").map((_, i) => i + 1).join("\n");
        scheduleParse(item);
        outlet.querySelector("#sql-parse-tools").innerHTML = parseToolsHTML();
      }
      if (key === "autoParse") { scheduleParse(item); outlet.querySelector("#sql-parse-tools").innerHTML = parseToolsHTML(); }
      if (item.kind === "dimension" && !["sql", "autoParse"].includes(key)) {
        if (key === "dimensionKey") item.draft.dimensionKeyEdited = true;
        if (key === "valueType") item.draft.valueTypeEdited = true;
        if (key === "valueAlias") {
          if (!item.draft.dimensionKeyEdited) item.draft.dimensionKey = value;
          item.draft.valueTypeEdited = false; item.draft.enumEdited = false;
          item.draft.fields.forEach((f) => { f.review = true; });
        }
        syncDimension(item);
        if (["valueAlias", "idAlias", "entity", "valueType"].includes(key)) { persist(); refreshParseView(); return; }
      }
    } else if (kind === "param") {
      item.draft.parameters[Number(key)][detail] = value;
      persist(); refreshParseView(); return;
    }
    else if (kind === "ref") {
      const ability = dimensionOwner();
      const ref = (key === "metric" ? ability.metrics : ability.dimensions).find((r) => r.itemId === detail);
      ref.version = Number(value);
      if (ref.metricKeys) ref.metricKeys = metricFields(resolveItem(store, ref)).map((f) => f.key);
      syncQueryGroups(store, ability); persist(); render(); return;
    } else if (kind === "metric") {
      const ref = ability.metrics.find((r) => r.itemId === key);
      ref.metricKeys = value ? [...new Set([...ref.metricKeys, detail])] : ref.metricKeys.filter((k) => k !== detail);
      syncQueryGroups(store, ability);
      if (!activeGroups(ability).length) ability.showOverall = true;
      persist(); refreshDimensions(); return;
    } else if (kind === "group") {
      const ability = dimensionOwner();
      const g = ability.groups.find((g) => g.id === key); g[detail] = value;
      if (detail === "cross") { persist(); render(); return; }
    } else if (kind === "member") {
      const ability = dimensionOwner();
      const g = ability.groups.find((g) => g.id === key);
      g.members = value ? (g.cross ? [...new Set([...g.members, detail])] : [detail]) : g.members.filter((m) => m !== detail);
      persist(); render(); return;
    } else if (kind === "approve-item") {
      const run = item.runs.find((r) => r.id === selectedRun) || item.runs[0];
      if (run === itemCurrentRun(item, itemContext()) && run.scenario === "normal") run.approvedFor = value ? itemReviewSignature(item, itemContext()) : "";
    } else if (kind === "approve-ability") {
      const run = ability.runs.find((r) => r.id === selectedRun) || ability.runs[0];
      if (run === abilityCurrentRun(store, ability)) run.approvedFor = value ? abilitySignature(store, ability) : "";
    } else if (kind === "analysis") store.analysis[key] = value;
    else if (kind === "analysis-select") {
      const selections = store.analysis.selections;
      selections[key] = value ? [...new Set([...(selections[key] || []), detail])] : (selections[key] || []).filter((k) => k !== detail);
    } else if (kind === "analysis-reference") {
      if (!value) { store.analysis.capabilityId = ""; store.analysis.version = 0; store.analysis.selections = {}; }
      else { const [id, n] = value.split(":"); useVersion(store, store.abilities.find((a) => a.id === id), Number(n)); }
      persist(); render(); return;
    }
    persist(); updateValidity(!["approve-item", "approve-ability"].includes(kind));
  }
  document.querySelector(".app-shell").addEventListener("click", handleAction);
  document.querySelector(".app-shell").addEventListener("keydown", (e) => {
    if (e.target.dataset.model === "enum-input" && e.key === "Enter") { e.preventDefault(); commitEnumInput(e.target, true); }
  });
  document.querySelector(".app-shell").addEventListener("paste", (e) => {
    if (e.target.dataset.model !== "enum-input") return;
    const text = e.clipboardData?.getData("text") || "";
    if (/[,，\n]/.test(text)) {
      e.preventDefault();
      e.target.setRangeText(text.replace(/\r?\n/g, ","), e.target.selectionStart, e.target.selectionEnd, "end");
      commitEnumInput(e.target, true);
    }
  });
  document.querySelector(".app-shell").addEventListener("focusout", (e) => {
    if (e.target.dataset.model === "enum-input" && e.target.isConnected) commitEnumInput(e.target, true);
  });
  for (const event of ["input", "change"]) document.querySelector(".app-shell").addEventListener(event, handleModel);
  document.addEventListener("keydown", (e) => {
    const activeOverlay = !overlay.hidden ? overlay : !trialOverlay.hidden ? trialOverlay : null;
    if (!activeOverlay) {
      const menu = document.querySelector(".c-more-actions[open]");
      if (menu && e.key === "Escape") {
        e.preventDefault(); menu.open = false; menu.querySelector("summary").focus(); return;
      }
      if (dimensionPicker && e.key === "Escape") { e.preventDefault(); closeDimensionPicker(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); if (activeOverlay === overlay) closeDialog(); else closeTrial(); }
    if (e.key === "Tab") {
      const focusable = [...activeOverlay.querySelectorAll('[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled), [role="dialog"] textarea:not(:disabled), [role="dialog"] select:not(:disabled), [role="dialog"] a[href], [role="dialog"] summary')].filter((el) => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  document.addEventListener("pointerdown", (e) => {
    document.querySelectorAll(".c-more-actions[open]").forEach((menu) => {
      if (!menu.contains(e.target)) menu.open = false;
    });
    if (dimensionPicker && overlay.hidden && trialOverlay.hidden && !e.target.closest('.c-dimension-picker, [data-action^="dimension-pick"]')) {
      dimensionPicker = undefined; outlet.querySelector(".c-dimension-picker")?.remove();
    }
  });
  document.addEventListener("toggle", (e) => {
    const menu = e.target;
    if (!menu.matches?.(".c-more-actions")) return;
    menu.querySelector("summary").setAttribute("aria-expanded", String(menu.open));
    if (menu.open) document.querySelectorAll(".c-more-actions[open]").forEach((other) => {
      if (other !== menu) other.open = false;
    });
  }, true);
  document.querySelector(".app-shell").addEventListener("click", (e) => {
    if (e.target.closest(".c-more-actions [data-action]"))
      e.target.closest(".c-more-actions").open = false;
  });
  document.querySelector("#catalog-search").addEventListener("input", renderCatalog);
  document.querySelectorAll(".nav-item").forEach((a) => {
    if (a.textContent.includes("取数能力")) a.href = "#/capabilities";
    if (a.textContent.includes("实验分析模块")) a.href = "#/modules";
  });
  document.querySelectorAll(".command-body button").forEach((a) => { a.addEventListener("click", () => {
    location.hash = a.textContent.includes("分析") ? "/modules" : "/capabilities";
    const dialog = document.querySelector(".command-dialog"); dialog.classList.remove("open"); dialog.setAttribute("aria-hidden", "true");
  }); });
  window.addEventListener("hashchange", () => { publicationHistory.reset(); trialHistory.reset(); dimensionDialog.close(false); closeDialog(); if (trialSession) closeTrial(); dimensionPicker = undefined; valueDraft = undefined; issues = []; selectedRun = ""; selectedRecord = ""; render(); window.scrollTo(0, 0); });
  render();
  return { openDialog, closeDialog, openTrial, syncPresetSelection };
}
