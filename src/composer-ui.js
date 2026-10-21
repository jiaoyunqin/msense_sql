import { createIcons, icons } from "lucide";
import {
  clone, uid, COMPOSER_KEY, loadComposer, newItem, newAbility, makeReference, resolveItem,
  referenceLabel, entities, itemIssues, abilityIssues, itemCurrentRun, itemReviewSignature,
  abilityCurrentRun, abilitySignature, abilityQuerySignature, defaultContext
} from "./composer-data.js";
import { parameterCatalog, scenarios, formatValue } from "./prototype-data.js";
import {
  parseItem, syncDimension, runItem, publishItem, itemPublishIssues, attachItem, runAbility,
  publishAbility, abilityPublishIssues, useVersion, runAnalysis
} from "./composer-engine.js";
import "./prototype.css";
import "./composer.css";

const esc = (v = "") => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = (n) => `<i data-lucide="${n}"></i>`;
const btn = (a, t, i = "", c = "", x = "") => `<button type="button" class="p-button ${c}" data-action="${a}" ${x}>${i ? icon(i) : ""}${t}</button>`;
const badge = (t, c = "") => `<span class="p-badge ${c}">${esc(t)}</span>`;
const date = (v) => v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "未保存";
const input = (t, m, v, x = "") => `<label class="p-field"><span>${t}</span><input data-model="${m}" value="${esc(v)}" ${x}></label>`;
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
  return `<div class="p-table-scroll"><table class="p-table"><thead><tr><th>行</th>${record.fields.map((f) => `<th>${esc(f.name)}<small>${esc(f.key)}</small></th>`).join("")}</tr></thead><tbody>${record.rawRows.map((r, i) => `<tr id="evidence-${i}" class="${i === highlight ? "evidence-row" : ""}"><td>${i + 1}</td>${record.fields.map((f) => `<td title="原值：${esc(r[f.alias] === null ? "NULL" : r[f.alias])}">${esc(formatValue(r[f.alias], f))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const section = (title, desc, body, actions = "", id = "") => `<section class="p-section" ${id ? `id="${id}"` : ""}><header><div><h2>${title}</h2><p>${desc}</p></div><div class="p-actions">${actions}</div></header>${body}</section>`;

export function mountComposer({ capabilities, showToast }) {
  const store = loadComposer(), main = document.querySelector(".main-content"), catalog = document.querySelector(".capability-page");
  const outlet = document.createElement("section"); outlet.className = "prototype-outlet"; main.append(outlet);
  const overlay = document.createElement("div"); overlay.className = "p-overlay"; overlay.hidden = true; document.querySelector(".app-shell").append(overlay);
  let ability, item, issues = [], busy = false, fieldDraft, pickerKind = "", dialogKind = "", previousFocus, selectedRecord = "", selectedRun = "", highlight = -1, analysisTab = "output", trialKind = "", attachDraft;
  const parseTimers = new Map(), parsing = new Map();
  let parseSequence = 0;
  const persist = () => {
    try { localStorage.setItem(COMPOSER_KEY, JSON.stringify(store)); }
    catch { showToast("本地存储已满或不可用，请导出当前工作区保存。"); }
  };
  for (const obj of [...store.items, ...store.abilities]) {
    obj.runs.forEach((r) => { if (r.status === "running") { r.status = "failed"; r.error = "页面重载中断了本地任务，请重新运行。"; } });
  }
  store.analysis.attempts.forEach((a) => { if (a.status === "running") { a.status = "insufficient"; a.error = "页面重载中断了本地分析，请重新试跑。"; } });
  persist();
  const catalogActions = document.createElement("div"); catalogActions.className = "p-catalog-actions p-actions";
  catalogActions.innerHTML = btn("workflow-guide", "配置流程", "route") + btn("new-ability", "新建取数能力", "plus", "primary");
  catalog.querySelector(".capability-count").before(catalogActions);
  const notice = document.createElement("div"); notice.className = "p-notice";
  notice.innerHTML = `${icon("info")}<span>第一次体验可以打开“优惠券支付分析 · 完整示例”，已有解析字段、取数结果和分析记录。${btn("demo-fields", "看解析字段", "", "link")}${btn("demo-results", "看试跑结果", "", "link")}${btn("demo-analysis", "看分析输出", "", "link")}</span>`;
  catalog.querySelector(".catalog-toolbar").after(notice);
  const catalogTools = document.createElement("details"); catalogTools.className = "c-catalog-tools";
  catalogTools.innerHTML = `<summary>SQL 复用管理</summary><p>能力内新建的 SQL 随能力组管理；需要独立发布、跨组复用时再进入 SQL 库。</p>${btn("item-library", "管理可复用 SQL", "code-2")}${btn("sample-info", "示例数据说明", "info")}`;
  catalog.append(catalogTools);
  function refreshIcons() { createIcons({ icons }); }
  function renderCatalog() {
    const search = document.querySelector("#catalog-search").value.toLowerCase();
    const goal = document.querySelector(".select-button span").textContent;
    const list = catalog.querySelector("#capability-list");
    list.querySelectorAll(".c-managed-capability").forEach((el) => el.remove());
    const rows = store.abilities.filter((a) =>
      [a.name, a.key, a.description].join(" ").toLowerCase().includes(search) && (goal === "请选择业务目标" || a.goal === goal)
    ).sort((a, b) => Number(Boolean(b.demo)) - Number(Boolean(a.demo))).map((a) => {
      const v = a.versions.at(-1);
      return `<article class="capability-panel c-managed-capability" data-managed-id="${a.id}"><header class="capability-summary"><div class="c-managed-title"><span class="capability-type">取数能力</span><strong>${esc(a.name)}</strong>${badge(v ? `已发布 v${v.number}${a.demo ? " · Mock" : ""}` : "草稿", v ? "green" : "")}</div><div class="p-actions">${btn("edit-ability", "配置指标与 SQL", "square-pen", "", `data-id="${a.id}"`)}${btn("run-catalog", a.runs.length ? "查看结果 / 试跑" : "整体试跑", "play", "", `data-id="${a.id}"`)}${btn("use-ability", "用于分析", "arrow-up-right", "", `data-id="${a.id}" ${v ? "" : "disabled"}`)}</div></header><div class="c-managed-body"><p>${esc(a.description || "待填写能力说明")}</p><small>${a.metrics.length} 个指标来源 · ${a.dimensions.length} 个维度 · ${a.groups.length} 个下钻组</small>${a.demo ? `<div class="p-actions c-demo-links">${btn("demo-fields", "查看 SQL 与解析字段", "code-2", "link")}${btn("demo-results", "查看已成功取数结果", "table-2", "link")}${btn("demo-analysis", "查看已有分析输出", "file-text", "link")}</div>` : ""}</div></article>`;
    }).join("");
    list.insertAdjacentHTML("afterbegin", rows);
    catalog.querySelector("#empty-results").hidden = Boolean(list.children.length);
    document.querySelector(".capability-count").innerHTML = `${icon("database")}${capabilities.length + store.abilities.length} 项能力`; refreshIcons();
  }
  function header(title, desc, actions, parent = "取数能力", href = "#/capabilities") {
    return `<div class="p-breadcrumb"><a href="${href}">${parent}</a>${icon("chevron-right")}<span>${esc(title)}</span>${badge("本地模拟", "blue")}</div><header class="p-page-header"><div><h1>${esc(title)}</h1><p>${desc}</p></div><div class="p-actions">${actions}</div></header>`;
  }
  function workflowSteps(current) {
    return `<nav class="c-workflow" aria-label="DS 配置流程">${[["ability", "1", "配置能力"], ["sql", "2", "编写与解析 SQL"], ["trial", "3", "试跑与发布"], ["analysis", "4", "分析应用"]].map(([key, step, label]) => `<span class="${current === key ? "current" : ""}"><b>${step}</b>${label}</span>`).join("")}${btn("workflow-guide", "完整说明", "", "link")}</nav>`;
  }
  function renderGuide() {
    outlet.innerHTML = header("DS 自定义 SQL 配置流程", "从一个取数能力开始，将指标、维度和 SQL 保存在同一组内。", btn("new-ability", "开始新建能力", "plus", "primary"), "取数能力", "#/capabilities")
      + section("先体验已发布示例", "示例已带解析字段、成功取数结果和分析输出，不需要先填写配置。",
        `<div class="c-guide-example"><strong>优惠券支付分析 · 完整示例</strong><p>支付 GMV、订单量、平均订单金额；SQL 消费分层与生命周期；整体 + 两个单维 + 一个交叉，共 4 份取数结果。</p><div class="p-actions">${btn("demo-fields", "1. 看 SQL 和解析字段", "code-2")}${btn("demo-results", "2. 看试跑结果", "table-2")}${btn("demo-analysis", "3. 看分析输出", "file-text")}</div></div>`)
      + section("实际配置与发布", "正常路径不需要先到 SQL 库单独发布。",
        `<ol class="c-guide-steps"><li><strong>打开已有能力，或新建取数能力</strong><p>填写名称、业务目标、负责人和说明，决定分析模块将引用哪一组取数能力。</p></li><li><strong>在“指标”中新建 SQL 指标</strong><p>填写 SQL，自动解析输出；确认名称、Key、类型和口径。点击“保存并返回能力组”，自动关联，无须再次添加。</p></li><li><strong>选择下钻维度，按需新建 SQL 维度</strong><p>已有维度可直接选；SQL 维度提供每个实体唯一的 ID 和取值。确认列映射、枚举与取值时点，再保存返回。独立下钻分别取数；交叉组联合取数。</p></li><li><strong>保存配置，整体试跑并核对</strong><p>点击“整体试跑”，输入实验 ID 与观测时间，获取数据，逐一查看整体和下钻结果并勾选核对。</p></li><li><strong>发布取数能力</strong><p>发布固定整个组的 SQL、指标、维度、参数及下钻定义。能力内 SQL 无须先独立发布。</p></li><li><strong>用于分析，配置分析思路并试跑</strong><p>选择已发布的能力版本，选择实际指标与模式，填写分析思路和注意事项，点击“分析试跑”，查看结论并跳转数据证据。</p></li></ol>`)
      + section("已有能力与 SQL 复用", "SQL 库是可选管理入口。",
        `<p class="c-guide-copy">已有可编辑能力直接进入“配置指标与 SQL”。需要跨多个能力复用同一 SQL 时，才走“独立 SQL → 独立试跑 → 核对并发布 SQL → 关联已有或新建能力”。普通配置只需在能力内编辑，随能力统一发布。</p>`)
      + section("发布上线分别指什么", "页面能力发布和站点部署是两件独立的操作。",
        `<p class="c-guide-copy">DS 发布能力后，分析模块可引用该版本；当前原型把配置与版本保存在这个浏览器。GitHub 推送 main 后，Vercel 自动部署页面，供你查看最新交互。生产环境还需接入真实取数、权限、版本注册与分析服务，才能完成业务上线。</p><p class="c-guide-copy">如果看到截图中的旧离线页面，请打开最新在线地址继续体验。迭代完成后再统一导出。</p>`);
    refreshIcons();
  }
  function itemContext() { return item.context || defaultContext; }
  function statusBar() {
    if (item) {
      const d = item.draft, run = itemCurrentRun(item, itemContext());
      return `<div class="p-statusbar" id="composer-status">${badge(d.parsedSql === d.sql && !d.parseError ? "SQL 已解析" : "SQL 待解析", d.parsedSql === d.sql && !d.parseError ? "green" : "")}${badge(itemIssues(item).length ? "配置待确认" : "配置已确认", itemIssues(item).length ? "" : "green")}${badge(run && run.scenario === (item.scenario || "normal") ? "当前取数有效" : "当前取数待验证", run && run.scenario === (item.scenario || "normal") ? "green" : "")}${badge(item.versions.length ? `已发布 v${item.versions.at(-1).number}` : "尚未发布", "blue")}<span class="p-status-note">独立运行验证后，可发布并加入已有能力</span></div>`;
    }
    const run = abilityCurrentRun(store, ability);
    return `<div class="p-statusbar" id="composer-status">${badge(abilityIssues(store, ability).length ? "组合待校验" : "组合校验通过", abilityIssues(store, ability).length ? "" : "green")}${badge(run ? "全部取数有效" : "全部取数待验证", run ? "green" : "")}${badge(run?.approvedFor === abilitySignature(store, ability) ? "结果已核对" : "结果待核对", run?.approvedFor === abilitySignature(store, ability) ? "green" : "")}${badge(ability.versions.length ? `已发布 v${ability.versions.at(-1).number}` : "尚未发布", "blue")}<span class="p-status-note">分析模块引用发布后的能力版本</span></div>`;
  }
  function versionsHTML(obj, type) {
    return obj.versions.length ? obj.versions.slice().reverse().map((v) =>
      `<div class="p-version"><div><strong>v${v.number} · ${esc(v.definition.name)}</strong>${badge(v.fixture ? "预设示例" : "已发布 · 本地", "green")}<span>${date(v.publishedAt)}</span><small>${type === "ability" ? `${v.modes.length} 份独立 Dataset · 完整定义已固定` : "SQL、参数绑定和输出定义已固定"}</small></div><div class="p-actions">${btn("view-version", "查看快照", "file-code", "", `data-type="${type}" data-number="${v.number}"`)}${btn(type === "ability" ? "use-version" : "attach", type === "ability" ? "用于分析" : "关联取数能力组", "arrow-up-right", "", `data-number="${v.number}"`)}</div></div>`
    ).join("") : `<p class="p-muted">暂无发布版本。</p>`;
  }
  function sourceCards(kind) {
    const refs = kind === "metric" ? ability.metrics : ability.dimensions;
    if (!refs.length) return `<div class="c-source-empty">${icon(kind === "metric" ? "chart-no-axes-column" : "list-filter")}<span>选择已有${kind === "metric" ? "指标" : "维度"}，或新建 SQL 定义。</span></div>`;
    return refs.map((ref) => {
      const source = resolveItem(store, ref), origin = store.items.find((s) => s.id === ref.itemId);
      const options = [...(origin.ownerAbilityId === ability.id ? [[0, "能力内草稿"]] : []), ...origin.versions.map((v) => [v.number, `已发布 v${v.number}`])];
      return `<article class="c-source"><div class="c-source-head"><div class="p-row">${icon(source.preset ? "library" : "code-2")}<strong>${esc(source.name)}</strong>${badge(source.preset ? "已有" : "自定义 SQL", source.preset ? "" : "blue")}</div><div class="p-actions">${select("引用版本", `ref.${kind}.${source.id}`, options, ref.version)}${btn("edit-source", ref.version ? "查看 / 复制 SQL" : "编辑 SQL", "square-pen", "link", `data-id="${source.id}" data-version="${ref.version}"`)}${btn("remove-source", "移除", "x", "link", `data-kind="${kind}" data-id="${source.id}"`)}</div></div>${kind === "metric" ? `<div class="c-metric-checks">${source.draft.fields.filter((f) => f.role === "metric").map((f) => check(`${esc(f.name)} <small>${esc(f.key)}</small>`, `metric.${source.id}.${f.key}`, ref.metricKeys.includes(f.key))).join("")}</div>` : `<p>${esc(source.draft.dimensionName)} · ${esc(source.draft.dimensionKey)} · ${entities[source.draft.entity].name} · ${esc(source.draft.timing)}</p>`}</article>`;
    }).join("");
  }
  function groupsHTML() {
    return ability.groups.length ? ability.groups.map((g) => `<article class="c-drill"><div class="c-drill-head">${input("下钻组名称", `group.${g.id}.name`, g.name)}${check("交叉维度", `group.${g.id}.cross`, g.cross)}${btn("remove-group", "移除组", "x", "link", `data-id="${g.id}"`)}</div><div class="c-metric-checks">${ability.dimensions.map((r) => { const d = resolveItem(store, r); return check(`${esc(d.draft.dimensionName)} ${badge(d.preset ? "已有" : "SQL")}`, `member.${g.id}.${d.id}`, g.members.includes(d.id)); }).join("")}</div><small>${g.cross ? "成员在同一 SQL 中关联并联合 GROUP BY；至少选择两个。" : "选择一个成员，独立产生一份下钻结果。"}</small></article>`).join("") : `<p class="p-muted">尚无下钻组；可以仅运行整体指标。</p>`;
  }
  function renderAbility() {
    outlet.innerHTML = header(ability.name, "配置指标、下钻维度与独立分组，整体试跑后发布给分析模块。",
      btn("save", "保存草稿", "save") + btn("validate", "校验配置", "list-checks") + btn("ability-context", "整体试跑", "play", "primary", busyAttr(busy)) + btn("publish-ability", "发布能力", "upload", "", busyAttr(busy)))
      + workflowSteps("ability") + statusBar() + issuesHTML(issues)
      + section("基础信息", "用于能力目录展示与分析模块关联。", `<div class="p-form-grid">${input("能力名称", "ability.name", ability.name)}${input("稳定 Key", "ability.key", ability.key, busyAttr(ability.keyLocked))}${select("业务目标", "ability.goal", [["平台老客提频", "平台老客提频"], ["新客转化", "新客转化"], ["用户召回", "用户召回"]], ability.goal)}${input("负责人", "ability.owner", ability.owner)}</div>${area("能力说明", "ability.description", ability.description)}`)
      + section("指标", "每个指标来源可输出多个最终指标；按本次所选粒度直接执行 SQL。", sourceCards("metric"),
        btn("pick-metric", "从已有指标库选择", "library") + btn("new-owned-metric", "新建 SQL 指标", "plus", "primary"))
      + section("下钻维度", "已有维度和 SQL 维度均可选入下钻组。", sourceCards("dimension"),
        btn("pick-dimension", "从已有维度库选择", "library") + btn("new-owned-dimension", "新建 SQL 维度", "plus", "primary"))
      + section("下钻分组", "多个独立组分别运行；开启交叉后计算该组的真实联合结果。",
        `<div class="c-overall">${check("同时输出整体结果", "ability.includeOverall", ability.includeOverall)}</div>${groupsHTML()}`,
        btn("add-single", "添加独立下钻组", "plus") + btn("add-cross", "添加交叉组", "git-merge"))
      + section("取数验证", "在统一试跑面板核对整体和下钻数据，再发布用于分析。", `<div class="c-validation-entry"><span>${ability.runs.length ? `${statuses[ability.runs[0].status]} · ${date(ability.runs[0].startedAt)}` : "还没有试跑记录"}</span>${btn("ability-context", ability.runs.length ? "查看结果 / 重新试跑" : "进入取数验证", "arrow-up-right")}</div>`)
      + section("发布记录", "已发布版本保持固定；修改草稿后需要重新整体试跑。", versionsHTML(ability, "ability"));
    refreshIcons();
  }
  function resultDetails(record) {
    return `${table(record)}${record.checks?.length ? `<div class="c-associations">${record.checks.map((c) => badge(`${c.dimension}：${c.entities} 个实体 · 缺失 ${c.missing}`, "green")).join("")}</div>` : ""}<details class="p-snapshot"><summary>本次实际 SQL 与数据契约</summary><pre>${esc(record.renderedSql || "")}</pre><pre>${esc(JSON.stringify({ standard_dataset: record.dataset, prototype_adapter: record.adapter }, null, 2))}</pre></details>`;
  }
  function abilityResults() {
    const run = ability.runs.find((r) => r.id === selectedRun) || ability.runs[0];
    const record = run?.records.find((r) => r.id === selectedRecord) || run?.records[0];
    const valid = run?.status === "success" && run.signature === abilityQuerySignature(store, ability);
    const body = !run ? `<div class="p-empty">${icon("play")}<p>运行整个能力，分别核对整体和各下钻组的取数结果。</p></div>` :
      `<div class="p-run-history">${ability.runs.map((r) => btn("select-run", `${statuses[r.status]} · ${date(r.startedAt)}`, "", r === run ? "active" : "", `data-id="${r.id}"`)).join("")}</div><div class="p-result-summary"><div class="p-row">${badge(statuses[run.status], run.status === "success" ? "green" : "amber")}${badge(valid ? "当前配置" : "历史 / 待验证")}<span>${run.records.length} 份执行 · ${esc(run.id)}</span></div></div>${issuesHTML(run.error ? [run.error] : [])}${run.status === "running" ? `<div class="p-progress"><span></span>正在运行各指标来源与下钻组合…</div>` : ""}
      <div class="p-mode-tabs">${run.records.map((r) => btn("select-record", `${esc(r.modeName)} · ${r.rawRows?.length || 0} 行`, "", r === record ? "active" : "", `data-id="${r.id}"`)).join("")}</div>${record ? resultDetails(record) : ""}
      <div class="p-confirm-result">${check("已逐一核对全部结果、指标口径和下钻粒度", "approve-ability", valid && run.approvedFor === abilitySignature(store, ability), valid && ability.scenario === "normal" ? "" : "disabled")}${!valid ? `<small>当前配置或本次运行未通过全部验证，需重新整体试跑。</small>` : ""}</div>`;
    return section("整体试跑结果", "每个指标来源 × 每个整体 / 下钻组各自产出 Dataset。", body, "", "ability-results");
  }
  function renderLibrary() {
    outlet.innerHTML = header("SQL 取数项", "SQL 指标和维度可以独立运行、核对、发布，再加入取数能力。",
      btn("new-item-metric", "新建 SQL 指标", "plus", "primary") + btn("new-item-dimension", "新建 SQL 维度", "plus") + btn("export", "导出工作区", "download"))
      + `<div class="p-mode-tabs">${btn("library-all", "全部取数项", "layers", "active")}</div><div class="p-custom-list">${store.items.filter((s) => !s.preset).map((s) => `<article class="p-custom-card"><div class="p-custom-icon">${icon(s.kind === "metric" ? "code-2" : "list-filter")}</div><div class="p-custom-copy"><div class="p-row"><strong>${esc(s.name)}</strong>${badge(s.kind === "metric" ? "SQL 指标" : "SQL 维度", "blue")}${badge(s.versions.length ? `已发布 v${s.versions.at(-1).number}` : "草稿", s.versions.length ? "green" : "")}</div><p>${esc(s.description)}</p><small>${esc(s.key)}${s.ownerAbilityId ? " · 也可随所属能力整体发布" : " · 独立取数项"}</small></div><div class="p-actions">${btn("edit-item", "编辑 / 运行", "square-pen", "", `data-id="${s.id}"`)}</div></article>`).join("")}</div>`;
    refreshIcons();
  }
  function editorHTML() {
    const d = item.draft;
    return `<div class="c-editor"><div class="p-editor-toolbar"><span>${icon("code-2")}SQL · 本地 SQLite</span>${check("自动解析", "draft.autoParse", d.autoParse !== false)}</div><div class="p-code"><pre class="p-line-numbers" aria-hidden="true">${d.sql.split("\n").map((_, i) => i + 1).join("\n")}</pre><div class="p-code-body"><pre class="p-code-highlight" aria-hidden="true">${syntax(d.sql)}</pre><textarea id="sql-editor" aria-label="SQL 编辑器" spellcheck="false" data-model="draft.sql">${esc(d.sql)}</textarea></div></div></div><div id="sql-parse-tools">${parseToolsHTML()}</div>
      <details class="p-snapshot"><summary>${item.kind === "metric" ? "下钻模板与示例底表" : "维度 SQL 输出约定"}</summary><p>${item.kind === "metric" ? "默认模板用 metric_source 提供明细，用 {{dimension_select}}、{{dimension_join}}、{{dimension_group}} 接入所选维度。保留模板即可组合下钻；普通完整 SQL 也可独立按整体输出运行。" : "每个实体输出唯一一行 ID 与维度值；允许维度原值为 NULL，关联实体缺失另行阻断。"}</p><p>demo_orders：order_id、user_id、group_id、group_name、is_control、libra_id、order_date、coupon_meta_id、pay_amount、redeemed。demo_users：user_id、historical_spend、lifecycle、city_id。</p></details>`;
  }
  function parseToolsHTML() {
    const d = item.draft, pending = parsing.has(item.id);
    return `<div class="c-parse-actions">${btn("parse", d.parsedSql ? "重新解析 SQL" : "解析 SQL", "scan-text", "primary", busyAttr(busy || pending))}<span role="status">${pending ? "正在解析实际输出…" : d.parseError ? "解析失败，保留最近成功配置" : d.parsedSql === d.sql ? `解析成功 · ${d.fields.length} 个输出` : d.autoParse !== false ? "停止输入后自动解析" : "修改 SQL 后请重新解析"}</span></div>${d.parseError ? issuesHTML([d.parseError]) : ""}`;
  }
  const cellInput = (model, value, label, extra = "") => `<input class="c-cell-input" aria-label="${esc(label)}" data-model="${model}" value="${esc(value)}" ${extra}>`;
  const cellSelect = (model, value, label, options) => `<select class="c-cell-input" aria-label="${esc(label)}" data-model="${model}">${options.map(([k, name]) => `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${name}</option>`).join("")}</select>`;
  function dimensionFieldsHTML() {
    const d = item.draft, values = d.enumValues || [], sample = d.parseSample?.find((f) => f.alias === d.valueAlias);
    return `<div class="p-table-scroll"><table class="p-table c-dimension-fields"><thead><tr><th>维度名</th><th>维度 Key</th><th>维度枚举值</th><th>原生类型</th></tr></thead><tbody><tr><td>${cellInput("draft.dimensionName", d.dimensionName, "维度名")}</td><td>${cellInput("draft.dimensionKey", d.dimensionKey, "维度 Key")}<small>SQL 值列：${esc(d.valueAlias || "待选择")}</small></td><td><div class="c-enum-box">${values.map((v, i) => `<span class="c-enum-tag">${esc(v === null ? "NULL（原值）" : v)}<button type="button" data-action="remove-enum" data-index="${i}" aria-label="移除枚举 ${esc(v)}">×</button></span>`).join("")}<input aria-label="添加维度枚举" data-model="enum-input" placeholder="输入枚举，回车或逗号添加"></div><div class="c-enum-actions"><small>${d.enumEdited ? "人工候选值" : "来自解析样本"} · ${values.length} 个</small>${btn("reset-enums", "使用样本枚举", "", "link")}</div></td><td>${cellSelect("draft.valueType", d.valueType, "维度原生类型", [["string", "字符串"], ["number", "数字"], ["unknown", "待确认"]])}<small>样本：${esc(sample?.type || "unknown")}</small></td></tr></tbody></table></div>
      <p class="c-config-hint">枚举用于定义候选值；实际结果以 SQL 原值为准。支持中英文逗号批量添加${d.sampleTruncated ? "，解析样本已截断" : ""}。</p>
      ${!d.valueAlias ? issuesHTML(["检测到多个维度值候选或未找到值列，请在下方选择本取数项的一个维度值列。"]) : ""}
      <details class="c-mapping" ${!d.idAlias || !d.valueAlias ? "open" : ""}><summary>实体与列映射 <span>${esc(d.idAlias || "待选择")} → ${esc(d.valueAlias || "待选择")}</span></summary><div class="p-form-grid two">${select("统计实体", "draft.entity", [["user", "用户"], ["order", "订单"]], d.entity)}${select("实体 ID 输出列", "draft.idAlias", [["", "请选择实体 ID"], ...d.fields.map((f) => [f.alias, f.alias])], d.idAlias)}${select("维度值输出列", "draft.valueAlias", [["", "请选择维度值"], ...d.fields.filter((f) => f.alias !== d.idAlias).map((f) => [f.alias, f.alias])], d.valueAlias)}${input("取值时点 / 更新口径", "draft.timing", d.timing)}</div></details>`;
  }
  function fieldsHTML() {
    const d = item.draft;
    return `<div class="c-output-heading"><strong>解析结果</strong><span>自动填充后可直接修改</span></div>${d.fields.length ? `<div class="p-diff">${d.diff.map((f) => badge(`${f.alias} · ${f.status}`, f.status === "需复核" ? "amber" : "")).join("")}</div>${item.kind === "dimension" ? dimensionFieldsHTML() : `<div class="p-table-scroll"><table class="p-table p-fields c-inline-fields"><thead><tr><th>SQL 输出</th><th>名称 / Key</th><th>角色 / 类型</th><th>格式 / 精度</th><th>字段口径</th><th>操作</th></tr></thead><tbody>${d.fields.map((f, index) => `<tr><td><code>${esc(f.alias)}</code><small title="${esc(f.source)}">${esc(f.source || "预设定义")}</small>${f.review ? badge("需复核", "amber") : ""}</td><td>${cellInput(`output.${index}.name`, f.name, `${f.alias} 名称`)}${cellInput(`output.${index}.key`, f.key, `${f.alias} Key`)}</td><td>${cellSelect(`output.${index}.role`, f.role, `${f.alias} 角色`, [["metric", "指标"], ["identity", "身份"], ["auxiliary", "辅助"], ["pending", "待确认"]])}${cellSelect(`output.${index}.type`, f.type, `${f.alias} 类型`, [["number", "数字"], ["string", "字符串"], ["unknown", "待确认"]])}<small>样本：${esc(f.observed || f.type)}</small></td><td>${cellSelect(`output.${index}.format`, f.format, `${f.alias} 格式`, [["decimal", "小数"], ["currency", "金额"], ["integer", "整数"], ["percent", "百分比"]])}${cellInput(`output.${index}.precision`, f.precision, `${f.alias} 精度`, 'type="number" min="0" max="6"')}</td><td><textarea class="c-cell-input c-description" aria-label="${esc(f.alias)} 口径" data-model="output.${index}.description">${esc(f.description)}</textarea></td><td>${btn("edit-field", "更多", "settings-2", "link", `data-index="${index}"`)}</td></tr>`).join("")}</tbody></table></div>`}` : `<div class="p-empty">${icon("table-2")}<p>解析 SQL 后自动生成可编辑配置。</p></div>`}
      ${d.removed.length || d.fields.some((f) => f.review) ? `<div class="p-notice">${icon("info")}<span>重新解析已保留人工配置；请检查来源变化${d.removed.length ? `及已删除字段 ${d.removed.map((f) => esc(f.alias)).join("、")}` : ""}。${btn("accept-diff", "已核对字段变化", "check", "link")}</span></div>` : ""}`;
  }
  function parameterBindingsHTML() {
    const d = item.draft;
    return `<details id="parameter-bindings" class="p-section c-contract"><summary>上下文参数绑定 · ${d.parameters.length} 个实际参数</summary>${d.parameters.length ? d.parameters.map((p, i) => `<div class="p-binding-row"><code>\${${esc(p.name)}}</code>${select("参数类型", `param.${i}.expectedType`, [["number", "数字"], ["string", "字符串"], ["date", "日期"], ["number_list", "数字列表"]], p.expectedType)}${select("绑定上下文", `param.${i}.source`, [["", "请选择来源"], ...parameterCatalog.map((p) => [p.key, p.name])], p.source)}</div>`).join("") : `<p>解析后仅展示 SQL 实际使用的参数。</p>`}</details>`;
  }
  function renderItem() {
    const d = item.draft, owner = store.abilities.find((a) => a.id === item.ownerAbilityId);
    outlet.innerHTML = header(item.name, "编写 SQL，确认输出与参数，单独运行后发布版本。",
      btn("save", "保存 SQL", "save") + btn("validate", "校验配置", "list-checks") + btn("item-context", "独立试跑", "play", "", busyAttr(busy)) + (owner ? btn("back-owner", "保存并返回能力组", "arrow-right", "primary") : btn("attach", "关联取数能力组", "layers", "primary", `data-number="${item.versions.at(-1)?.number || 0}"`)),
      owner ? owner.name : "SQL 取数项", owner ? `#/ability/${owner.id}` : "#/items")
      + workflowSteps("sql") + statusBar() + issuesHTML(issues)
      + section("取数项信息", "发布后可被多个取数能力引用。", `<div class="p-form-grid two">${input("取数项名称", "item.name", item.name)}${input("稳定 Key", "item.key", item.key, busyAttr(item.keyLocked))}</div>${area("说明 / 指标口径", "item.description", item.description)}`)
      + section("SQL 编辑与解析", item.kind === "metric" ? "在 SQL 中直接定义最终指标；解析后在表内确认输出配置。" : "解析实际输出，自动填充维度名称、Key 与样本枚举。", editorHTML() + `<div id="parsed-fields">${fieldsHTML()}</div>`)
      + (item.kind === "dimension" ? "" : `<details class="p-section c-contract"><summary>指标明细关联配置</summary><div class="p-form-grid">${select("统计实体", "draft.entity", [["user", "用户"], ["order", "订单"]], d.entity)}${input("明细实体列", "draft.entityColumn", d.entityColumn)}${input("明细来源别名", "draft.sourceAlias", d.sourceAlias)}</div></details>`)
      + parameterBindingsHTML()
      + section("取数验证", "独立运行这个 SQL，核对后发布复用；也可以保存到能力组后整体试跑。", `<div class="c-validation-entry"><span>${item.runs.length ? `${statuses[item.runs[0].status]} · ${date(item.runs[0].startedAt)}` : "还没有独立试跑记录"}</span>${btn("item-context", item.runs.length ? "查看结果 / 重新试跑" : "进入取数验证", "arrow-up-right")}</div>`)
      + itemAssociations() + section("发布记录", "运行成功并核对后发布；关联会更新能力组草稿。", versionsHTML(item, "item"));
    const editor = outlet.querySelector("#sql-editor");
    editor.addEventListener("scroll", () => {
      outlet.querySelector(".p-code-highlight").scrollTop = editor.scrollTop; outlet.querySelector(".p-code-highlight").scrollLeft = editor.scrollLeft;
      outlet.querySelector(".p-line-numbers").scrollTop = editor.scrollTop;
    });
    editor.addEventListener("keydown", (e) => {
      if (e.key === "Tab") { e.preventDefault(); editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end"); editor.dispatchEvent(new Event("input", { bubbles: true })); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); outlet.querySelector('[data-action="parse"]').click(); }
    });
    refreshIcons();
    if (d.autoParse !== false && d.parsedSql !== d.sql && !d.parseError && !parsing.has(item.id)) scheduleParse(item);
  }
  function itemResults() {
    const run = item.runs.find((r) => r.id === selectedRun) || item.runs[0];
    const valid = run?.status === "success" && run.querySignature === itemCurrentRun(item, itemContext())?.querySignature && run.scenario === (item.scenario || "normal");
    const unmatched = valid && run.distinctValues ? run.distinctValues.filter((v) => !(item.draft.enumValues || []).includes(v)) : [];
    return section("独立运行结果", "指标核对聚合结果；维度核对实体唯一性与实际枚举值。",
      !run ? `<div class="p-empty">${icon("play")}<p>可直接运行这个 SQL 取数项。</p></div>` :
        `<div class="p-run-history">${item.runs.map((r) => btn("select-run", `${statuses[r.status]} · ${date(r.startedAt)}`, "", r === run ? "active" : "", `data-id="${r.id}"`)).join("")}</div><div class="p-result-summary"><div class="p-row">${badge(statuses[run.status], run.status === "success" ? "green" : "amber")}${badge(valid ? "当前配置" : "历史 / 待验证")}<span>${run.rawRows?.length || 0} 行 · ${esc(run.id)}</span></div></div>${issuesHTML(run.error ? [run.error] : [])}${run.status === "running" ? `<div class="p-progress"><span></span>正在执行 SQL…</div>` : table(run)}
        ${run.distinctValues ? `<div class="c-associations">${run.distinctValues.map((v) => badge(v === null ? "NULL（原值）" : v)).join("")}</div>` : ""}
        ${unmatched.length ? `<p class="c-config-hint">实际输出包含候选定义之外的值：${unmatched.map((v) => esc(v === null ? "NULL" : v)).join("、")}。可补充枚举定义后重新核对。</p>` : ""}
        <details class="p-snapshot"><summary>本次实际 SQL 与定义快照</summary><pre>${esc(run.renderedSql || "")}</pre><pre>${esc(JSON.stringify(run.snapshot, null, 2))}</pre></details>
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
    const number = attachDraft.number, existing = store.abilities.filter((a) => ![...a.metrics, ...a.dimensions].some((r) => r.itemId === item.id));
    const allowDraft = !number && (!item.ownerAbilityId || item.ownerAbilityId === attachDraft.target);
    openDialog("关联取数能力组", `<p>${esc(item.name)} · ${number ? `固定 SQL v${number}` : "能力内草稿，随能力组统一试跑和发布"}</p><div class="p-mode-tabs">${btn("attach-existing", "加入已有能力组", "layers", attachDraft.mode === "existing" ? "active" : "")}${btn("attach-new", "新建能力组并加入", "plus", attachDraft.mode === "new" ? "active" : "")}</div>
      ${attachDraft.mode === "existing" ? select("目标取数能力组", "attach-target", [["", "请选择能力组"], ...existing.map((a) => [a.id, a.name])], attachDraft.target) + (!number ? `<p class="c-config-hint">未发布 SQL 只归属一个能力组；跨组复用请先独立试跑并发布 SQL。</p>` : "") :
        `<div class="p-form-grid two">${input("能力组名称", "attach-form.name", attachDraft.name)}${input("能力组 Key", "attach-form.key", attachDraft.key)}${select("业务目标", "attach-form.goal", [["平台老客提频", "平台老客提频"], ["新客转化", "新客转化"], ["用户召回", "用户召回"]], attachDraft.goal)}${input("负责人", "attach-form.owner", attachDraft.owner)}</div>${area("能力组说明", "attach-form.description", attachDraft.description)}`}
      ${item.kind === "dimension" ? `<p class="c-config-hint">维度加入能力组后，还需要选择指标来源才能执行分析。</p>` : ""}${!number && !allowDraft && attachDraft.mode === "existing" ? issuesHTML(["这个 SQL 已归属其他能力组，请先独立发布后复用。"]) : ""}`,
      btn("close", "取消") + btn("confirm-attach", attachDraft.mode === "new" ? "新建并保存能力组" : "保存关联并查看能力组", "check", "primary"));
  }
  function renderTrial() {
    const obj = item || ability, context = item ? (item.context ||= clone(defaultContext)) : ability.context;
    const metrics = item ? (item.kind === "metric" ? item.draft.fields.filter((f) => f.role === "metric") : []) : ability.metrics.flatMap((r) => resolveItem(store, r).draft.fields.filter((f) => f.role === "metric" && r.metricKeys.includes(f.key)));
    const dimensions = item ? (item.kind === "dimension" ? [{ name: item.draft.dimensionName }] : []) : ability.dimensions.map((r) => ({ name: resolveItem(store, r).draft.dimensionName }));
    const tasks = item ? 1 : ability.metrics.filter((r) => r.metricKeys.length).length * (Number(ability.includeOverall) + ability.groups.length);
    const basicReady = Boolean(context.libra_id && context.start_date && context.end_date && context.start_date <= context.end_date);
    outlet.innerHTML = `<header class="c-trial-header"><a class="p-button link" href="#/${item ? "item" : "ability"}/${obj.id}" aria-label="返回配置">${icon("arrow-left")}</a><div><a href="#/capabilities">取数能力列表 · 取数验证</a><h1>试跑${item ? " SQL 取数项" : "取数能力"}“${esc(obj.name)}”</h1><div class="p-row">${badge(ability?.goal || "独立 SQL", "blue")}${badge(`${metrics.length} 个指标`, "blue")}${badge(`${dimensions.length} 个下钻维度`, "blue")}</div></div>${badge(item ? "仅执行当前 SQL 取数项" : "仅执行当前取数能力", "blue")}</header>
      <div class="c-trial-evidence"><span>已选证据</span><strong>${metrics.length} 个指标</strong><strong>${dimensions.length} 个下钻维度</strong><div>${metrics.map((f) => badge(`指标 · ${f.name}`)).join("")}${dimensions.map((d) => badge(`维度 · ${d.name}`)).join("")}</div></div>
      <section class="c-trial-context"><header>${icon("flask-conical")}<strong>输入实验 ID 和观测时间并获取数据</strong></header><div class="c-trial-inputs">${input("实验 ID", "context.libra_id", context.libra_id, 'placeholder="例如：4823214"')}<div><span class="c-trial-label">观测时间</span><div class="c-trial-dates">${input("开始", "context.start_date", context.start_date, 'type="date" aria-label="观测开始日期"')}<span>→</span>${input("结束", "context.end_date", context.end_date, 'type="date" aria-label="观测结束日期"')}</div></div></div><details class="c-trial-advanced"><summary>更多上下文参数与异常模拟</summary><div class="p-form-grid two">${parameterCatalog.filter((p) => !["libra_id", "start_date", "end_date"].includes(p.key)).map((p) => input(p.name, `context.${p.key}`, context[p.key])).join("")}${select("异常模拟场景", "scenario", Object.entries(scenarios), obj.scenario || "normal")}</div></details><footer><div>取数计划：<strong>${tasks} 个任务</strong><p>${item ? "仅获取当前 SQL 的实际输出" : "获取已配置的整体与独立 / 交叉下钻数据"}</p></div>${btn("trial-run", busy ? "正在获取数据…" : "获取数据", "database", "primary", busyAttr(busy || !basicReady || !tasks))}</footer></section>
      <p class="c-config-hint">本地示例实验 4823214，2026-10-01 至 2026-10-03；SQL 在生成的底表实际执行。</p>
      ${workflowSteps("trial")}<div id="trial-validation">${issuesHTML(issues)}</div>${item ? itemResults() : abilityResults()}
      <div class="c-trial-next">${btn(item ? "publish-item" : "publish-ability", item ? "发布 SQL 取数项" : "发布取数能力组", "upload", "primary", busyAttr(busy))}${item ? btn("attach", "关联 / 新建能力组", "layers", "", `data-number="${item.versions.at(-1)?.number || 0}"`) : btn("use-ability", "进入分析模块", "arrow-up-right", "", `data-id="${ability.id}" ${ability.versions.length ? "" : "disabled"}`)}</div>`;
    refreshIcons();
  }
  function contextHTML(context, scenario) {
    return `<p>固定示例：Libra 4823214，2026-10-01 至 2026-10-03，券模板 101 / 102。</p><div class="p-form-grid two">${parameterCatalog.map((p) => input(p.name, `context.${p.key}`, context[p.key], p.type === "date" ? 'type="date"' : "")).join("")}</div><details class="p-scenarios"><summary>异常模拟场景</summary>${select("场景", "scenario", Object.entries(scenarios), scenario)}<p>异常场景用于演示权限、失败和数据校验路径。</p></details>`;
  }
  function renderModules() {
    const m = store.analysis, versions = store.abilities.flatMap((a) => a.versions.map((v) => [`${a.id}:${v.number}`, `${v.name} · v${v.number}`]));
    const v = store.abilities.find((a) => a.id === m.capabilityId)?.versions.find((v) => v.number === m.version);
    outlet.innerHTML = header(m.name, "引用确定的取数能力版本，选择输入并配置分析思路。", btn("save", "保存草稿", "save") + btn("analysis-context", "试跑上下文", "settings-2") + btn("analyze", "分析试跑", "flask-conical", "primary", busyAttr(busy)))
      + workflowSteps("analysis") + issuesHTML(issues)
      + section("分析模块信息", "业务目标与分析要求。", `<div class="p-form-grid two">${input("模块名称", "analysis.name", m.name)}${input("业务目标", "analysis.goal", m.goal)}</div>${area("说明", "analysis.description", m.description)}`)
      + section("取数能力", "显式引用固定版本；源 SQL 或能力草稿修改不影响当前分析。",
        select("能力版本", "analysis-reference", [["", "请选择已发布能力"], ...versions], `${m.capabilityId}:${m.version}`)
        + (v ? `<div class="p-selection-modes">${v.modes.map((mode) => `<article class="p-selection-mode"><strong>${esc(mode.name)}</strong><p>${mode.kind === "cross" ? "交叉成员" : mode.kind === "single" ? "单维下钻" : "整体"} · ${esc(mode.members.join(" × "))}</p><div class="p-checks">${mode.fields.filter((f) => f.role === "metric").map((f) => check(esc(f.name), `analysis-select.${mode.id}.${f.key}`, m.selections[mode.id]?.includes(f.key))).join("")}</div></article>`).join("")}</div>` : `<div class="p-empty">先完成取数能力试跑、核对与发布。</div>`))
      + section("分析配置", "示例分析根据真实 SQL 输出生成组间数值证据。", area("分析思路", "analysis.reasoning", m.reasoning) + area("注意事项", "analysis.considerations", m.considerations))
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
        : section("本次输入数据", "沿用发布时的 SQL 与成员定义，按本次上下文重新执行。", `<div class="p-mode-tabs">${a.records.map((r) => btn("analysis-record", esc(r.modeName), "", r === record ? "active" : "", `data-id="${r.id}"`)).join("")}</div>${record ? table(record, highlight) + `<details class="p-snapshot"><summary>实际 SQL 与 Dataset</summary><pre>${esc(record.renderedSql || "")}</pre><pre>${esc(JSON.stringify({ dataset: record.dataset, adapter: record.adapter }, null, 2))}</pre></details>` : `<div class="p-empty">尚无可用输入。</div>`}`));
    refreshIcons();
    if (highlight >= 0) outlet.querySelector(`#evidence-${highlight}`)?.scrollIntoView({ block: "center" });
  }
  function render() {
    const [page, id, trialId] = location.hash.replace(/^#\/?/, "").split("/");
    trialKind = page === "trial" ? id : "";
    ability = page === "ability" || trialKind === "ability" ? store.abilities.find((a) => a.id === (trialKind ? trialId : id)) : undefined;
    item = page === "item" || trialKind === "item" ? store.items.find((s) => s.id === (trialKind ? trialId : id)) : undefined;
    catalog.hidden = ["ability", "item", "items", "modules", "analysis", "trial", "guide"].includes(page); outlet.hidden = !catalog.hidden;
    if (trialKind && (item || ability)) renderTrial(); else if (ability) renderAbility(); else if (item) renderItem(); else if (page === "items") renderLibrary();
    else if (page === "modules") renderModules(); else if (page === "analysis") renderAnalysis(id); else if (page === "guide") renderGuide(); else renderCatalog();
    document.querySelectorAll(".nav-item").forEach((a) => {
      const active = a.textContent.includes(["modules", "analysis"].includes(page) ? "实验分析模块" : "取数能力");
      a.classList.toggle("active", active); a.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  function updateValidity() {
    if (trialKind) {
      const result = outlet.querySelector(item ? "#item-results" : "#ability-results");
      if (result) result.replaceWith(document.createRange().createContextualFragment(item ? itemResults() : abilityResults()));
      const context = item ? itemContext() : ability.context, run = outlet.querySelector('[data-action="trial-run"]');
      if (run) run.disabled = busy || !context.libra_id || !context.start_date || !context.end_date || context.start_date > context.end_date;
      refreshIcons(); return;
    }
    const current = outlet.querySelector("#composer-status");
    if (current && (item || ability)) current.replaceWith(document.createRange().createContextualFragment(statusBar()));
    const result = outlet.querySelector(item ? "#item-results" : "#ability-results");
    if (result && (item || ability)) result.replaceWith(document.createRange().createContextualFragment(item ? itemResults() : abilityResults()));
    refreshIcons();
  }
  function refreshParseView() {
    if (!item) return;
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
      if (active) [...replacement.querySelectorAll("[data-model]")].find((el) => el.dataset.model === active)?.focus({ preventScroll: true });
    }
    updateValidity();
  }
  function syncMetricReferences(target, previousKey = "", nextKey = "") {
    for (const ability of store.abilities) {
      const ref = ability.metrics.find((r) => r.itemId === target.id && !r.version);
      if (!ref) continue;
      if (previousKey) ref.metricKeys = ref.metricKeys.map((key) => key === previousKey ? nextKey : key);
      const keys = target.draft.fields.filter((f) => f.role === "metric").map((f) => f.key);
      ref.metricKeys = ref.metricKeys.length ? ref.metricKeys.filter((key) => keys.includes(key)) : keys;
    }
  }
  function scheduleParse(target) {
    clearTimeout(parseTimers.get(target.id));
    if (target.draft.autoParse === false || !target.draft.sql.trim()) return;
    parseTimers.set(target.id, setTimeout(() => { parseTimers.delete(target.id); performParse(target); }, 800));
  }
  async function performParse(target, manual = false) {
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
    } catch (error) { if (manual && item === target) showToast(error.message); }
    finally {
      if (parsing.get(target.id) === sequence) parsing.delete(target.id);
      persist();
      if (item === target) refreshParseView();
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
  function closeDialog() { overlay.hidden = true; overlay.innerHTML = ""; document.body.classList.remove("p-modal-open"); previousFocus?.focus(); dialogKind = ""; }
  function openPicker(kind) {
    pickerKind = kind;
    const available = store.items.filter((s) => s.kind === kind && s.versions.length && !(kind === "metric" ? ability.metrics : ability.dimensions).some((r) => r.itemId === s.id));
    openDialog(kind === "metric" ? "选择已有指标" : "选择已有维度", `<p>已有库包含本地预设与独立发布的 SQL 取数项，按固定版本加入当前能力。</p><div class="c-picker">${available.map((s) => `<label><input type="checkbox" name="source-choice" value="${s.id}" ${s.unavailable ? "disabled" : ""}><span><strong>${esc(s.name)}</strong>${badge(s.preset ? "预设" : "SQL", s.preset ? "" : "blue")}<p>${esc(s.unavailable || s.description)}</p><small>v${s.versions.at(-1).number} · ${esc(s.key)}</small></span></label>`).join("") || "<p>暂无可添加的已发布取数项。</p>"}</div>`, btn("close", "取消") + btn("confirm-picker", "添加所选", "plus", "primary"));
  }
  function newSource(kind, owned) {
    const s = newItem(kind, owned ? ability.id : ""); s.context = clone(owned ? ability.context : defaultContext); s.scenario = "normal";
    store.items.push(s);
    if (owned) {
      (kind === "metric" ? ability.metrics : ability.dimensions).push({ itemId: s.id, version: 0, ...(kind === "metric" ? { metricKeys: [] } : {}) });
      if (kind === "dimension") ability.groups.push({ id: uid("drill"), name: s.draft.dimensionName, members: [s.id], cross: false });
    }
    persist(); location.hash = `/item/${s.id}`;
  }
  async function handleAction(e) {
    const trigger = e.target.closest("[data-action]"); if (!trigger) return;
    const a = trigger.dataset.action, id = trigger.dataset.id;
    if (trigger.disabled) return;
    try {
      if (a === "close") { closeDialog(); return; }
      if (a === "item-library" || a === "library-all") { location.hash = "/items"; return; }
      if (a === "catalog-goal") {
        openDialog("筛选业务目标", select("业务目标", "catalog-goal-choice", [["请选择业务目标", "全部业务目标"], ["平台老客提频", "平台老客提频"], ["新客转化", "新客转化"], ["用户召回", "用户召回"]], document.querySelector(".select-button span").textContent), btn("close", "取消") + btn("apply-goal", "确认筛选", "check", "primary")); return;
      }
      if (a === "apply-goal") {
        document.querySelector(".select-button span").textContent = overlay.querySelector('[data-model="catalog-goal-choice"]').value;
        closeDialog(); renderCatalog(); return;
      }
      if (a === "back-modules") { location.hash = "/modules"; return; }
      if (a === "workflow-guide") { location.hash = "/guide"; return; }
      if (a === "demo-fields") { location.hash = "/item/demo-sql-metric"; return; }
      if (a === "demo-results") { location.hash = "/trial/ability/demo-sql-ability"; return; }
      if (a === "demo-analysis") { location.hash = "/analysis/demo-sql-analysis"; return; }
      if (a === "back-owner") { item.savedAt = new Date().toISOString(); persist(); location.hash = `/ability/${item.ownerAbilityId}`; return; }
      if (a === "new-ability") { const ability = newAbility("未命名取数能力"); store.abilities.push(ability); persist(); location.hash = `/ability/${ability.id}`; return; }
      if (["edit-ability", "run-catalog"].includes(a)) { location.hash = a === "run-catalog" ? `/trial/ability/${id}` : `/ability/${id}`; return; }
      if (a === "edit-item") { location.hash = `/item/${id}`; return; }
      if (a.startsWith("new-owned-") || a.startsWith("new-item-")) { newSource(a.endsWith("dimension") ? "dimension" : "metric", a.startsWith("new-owned-")); return; }
      if (a === "save") { (item || ability || store.analysis).savedAt = new Date().toISOString(); persist(); showToast("草稿已保存至当前浏览器"); return; }
      if (a === "export") {
        const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "msense-composer-workspace.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
      }
      if (a === "validate") { issues = item ? itemIssues(item) : abilityIssues(store, ability); render(); if (!issues.length) showToast("当前配置校验通过"); return; }
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
        const source = store.items.find((s) => s.id === id).versions.find((v) => v.number === Number(trigger.dataset.version)).definition;
        const s = newItem(source.kind, ability.id); s.draft = clone(source.draft); s.name = `${source.name} · SQL`; s.description = source.description; s.context = clone(ability.context); s.scenario = "normal";
        if (s.kind === "dimension") { s.draft.dimensionKey = uid("dimension"); s.draft.dimensionName = s.name; }
        store.items.push(s); const collection = s.kind === "metric" ? ability.metrics : ability.dimensions;
        const ref = collection.find((r) => r.itemId === id); ref.itemId = s.id; ref.version = 0;
        ability.groups.forEach((g) => { g.members = g.members.map((member) => member === id ? s.id : member); });
        persist(); closeDialog(); location.hash = `/item/${s.id}`; return;
      }
      if (a === "remove-source") {
        const collection = trigger.dataset.kind === "metric" ? ability.metrics : ability.dimensions;
        collection.splice(collection.findIndex((r) => r.itemId === id), 1);
        if (trigger.dataset.kind === "dimension") {
          ability.groups.forEach((g) => { g.members = g.members.filter((member) => member !== id); });
          ability.groups = ability.groups.filter((g) => g.cross || g.members.length);
        }
        persist(); render(); return;
      }
      if (a === "add-single" || a === "add-cross") {
        const cross = a === "add-cross", members = ability.dimensions.slice(0, cross ? 2 : 1).map((r) => r.itemId);
        ability.groups.push({ id: uid("drill"), name: cross ? "交叉下钻" : "独立下钻", cross, members }); persist(); render(); return;
      }
      if (a === "remove-group") { ability.groups = ability.groups.filter((g) => g.id !== id); persist(); render(); return; }
      if (a === "parse") {
        if (busy) return; await performParse(item, true); return;
      }
      if (a === "remove-enum") { item.draft.enumValues.splice(Number(trigger.dataset.index), 1); item.draft.enumEdited = true; persist(); refreshParseView(); return; }
      if (a === "reset-enums") { item.draft.enumEdited = false; syncDimension(item); persist(); refreshParseView(); return; }
      if (a === "accept-diff") { item.draft.removed = []; item.draft.fields.forEach((f) => { f.review = false; }); persist(); render(); return; }
      if (a === "edit-field") {
        fieldDraft = clone(item.draft.fields[Number(trigger.dataset.index)]); fieldDraft.index = Number(trigger.dataset.index);
        openDialog("编辑输出定义", `<div class="p-field-source"><code>${esc(fieldDraft.alias)}</code><pre>${esc(fieldDraft.source || "")}</pre><p>SQL 原生类型：${esc(fieldDraft.observed || fieldDraft.type)}，显示配置不会转换 SQL 值。</p></div><div class="p-form-grid two">${input("显示名称", "field.name", fieldDraft.name)}${input("输出 Key", "field.key", fieldDraft.key)}${select("业务角色", "field.role", [["metric", "指标"], ["dimension", "维度"], ["identity", "身份"], ["auxiliary", "辅助"], ["pending", "待确认"]], fieldDraft.role)}${select("原生类型", "field.type", [["number", "数字"], ["string", "字符串"]], fieldDraft.type)}${select("显示格式", "field.format", [["decimal", "小数"], ["currency", "金额"], ["integer", "整数"], ["percent", "百分比"]], fieldDraft.format || "decimal")}${input("小数位数", "field.precision", fieldDraft.precision || 0, 'type="number" min="0" max="6"')}${input("单位", "field.unit", fieldDraft.unit || "")}${input("空值显示", "field.nullDisplay", fieldDraft.nullDisplay || "—")}</div>${area("字段口径", "field.description", fieldDraft.description)}${check("已复核来源与粒度", "field-reviewed", !fieldDraft.review)}`, btn("close", "取消") + btn("save-field", "保存定义", "check", "primary")); return;
      }
      if (a === "save-field") {
        const index = item.draft.fields.findIndex((f) => f.alias === fieldDraft.alias);
        if (index < 0) throw new Error("该输出已被 SQL 删除，请关闭弹层并重新检查解析结果。");
        const oldKey = item.draft.fields[index].key; delete fieldDraft.index;
        item.draft.fields[index] = fieldDraft; syncMetricReferences(item, oldKey, fieldDraft.key); persist(); closeDialog(); render(); return;
      }
      if (a === "item-context" || a === "ability-context") { location.hash = `/trial/${item ? "item" : "ability"}/${(item || ability).id}`; return; }
      if (a === "trial-run") {
        if (busy) return;
        const targetItem = item, targetAbility = ability; busy = true; issues = []; selectedRun = ""; selectedRecord = "";
        try {
          const update = () => { persist(); render(); };
          if (targetItem) await runItem(targetItem, targetItem.context || defaultContext, targetItem.scenario || "normal", update);
          else await runAbility(store, targetAbility, update);
        } finally { busy = false; persist(); render(); } return;
      }
      if (a === "analysis-context") {
        dialogKind = a;
        openDialog(a === "ability-context" ? "运行整个取数能力" : a === "item-context" ? "独立运行 SQL 取数项" : "分析试跑上下文", contextHTML(a === "item-context" ? itemContext() : a === "ability-context" ? ability.context : store.analysis.context, a === "item-context" ? item.scenario || "normal" : a === "ability-context" ? ability.scenario : store.analysis.scenario),
          btn("close", "取消") + btn(a === "analysis-context" ? "context-done" : "start-run", a === "analysis-context" ? "确认上下文" : "开始运行", "play", "primary")); return;
      }
      if (a === "context-done") { closeDialog(); persist(); render(); return; }
      if (a === "start-run") {
        if (busy) return; const kind = dialogKind, targetItem = item, targetAbility = ability; closeDialog(); busy = true; issues = []; selectedRun = ""; selectedRecord = "";
        try {
          const update = () => { persist(); render(); };
          if (kind === "item-context") await runItem(targetItem, targetItem.context || defaultContext, targetItem.scenario || "normal", update);
          else await runAbility(store, targetAbility, update);
        } finally { busy = false; persist(); render(); } return;
      }
      if (a === "select-run") { selectedRun = id; selectedRecord = ""; updateValidity(); return; }
      if (a === "select-record") { selectedRecord = id; updateValidity(); return; }
      if (a === "publish-item" || a === "publish-ability") {
        const list = a === "publish-item" ? itemPublishIssues(item, itemContext(), item.scenario || "normal") : abilityPublishIssues(store, ability);
        openDialog(a === "publish-item" ? "发布 SQL 取数项" : "发布取数能力",
          `<p>发布 v${(item || ability).versions.length + 1} · ${esc((item || ability).name)}</p>${issuesHTML(list)}<p>发布将生成本地不可变快照；${a === "publish-item" ? "随后可添加至已有取数能力。" : "包含所引用取数项和能力内草稿的完整定义，供分析模块引用。"}</p>${check("模拟发布注册失败", "publish-failure", false)}`,
          btn("close", "返回编辑") + btn(a === "publish-item" ? "confirm-publish-item" : "confirm-publish-ability", "确认发布 · 本地", "upload", "primary", list.length ? "disabled" : "")); return;
      }
      if (a === "confirm-publish-item" || a === "confirm-publish-ability") {
        if (overlay.querySelector('[data-model="publish-failure"]').checked) { showToast("模拟注册失败，未创建版本；可直接重试"); return; }
        const version = a === "confirm-publish-item" ? publishItem(item, itemContext(), item.scenario || "normal") : publishAbility(store, ability);
        persist(); closeDialog(); render(); showToast(`已发布 v${version.number} · 本地可用`); return;
      }
      if (a === "attach") {
        const fresh = newAbility(`${item.name}取数组`);
        attachDraft = { number: Number(trigger.dataset.number || 0), mode: "existing", target: "", name: fresh.name, key: fresh.key, goal: fresh.goal, owner: fresh.owner, description: item.description };
        renderAttach(); return;
      }
      if (a === "attach-existing" || a === "attach-new") { attachDraft.mode = a === "attach-new" ? "new" : "existing"; renderAttach(); return; }
      if (a === "confirm-attach") {
        let target = attachDraft.mode === "existing" ? store.abilities.find((a) => a.id === attachDraft.target) : newAbility(attachDraft.name);
        if (!target) throw new Error("请选择目标取数能力组。");
        if (attachDraft.mode === "new") {
          Object.assign(target, { key: attachDraft.key, goal: attachDraft.goal, owner: attachDraft.owner, description: attachDraft.description });
          if (!target.name.trim() || !target.owner.trim() || !target.description.trim() || !/^[a-zA-Z_]\w*$/.test(target.key) || store.abilities.some((a) => a.key === target.key)) throw new Error("请补齐能力组基础信息，Key 需要有效且唯一。");
        }
        attachItem(store, item, target, attachDraft.number);
        if (attachDraft.mode === "new") store.abilities.push(target);
        target.savedAt = new Date().toISOString(); persist(); closeDialog(); location.hash = `/ability/${target.id}`; showToast("能力组已保存，可以整体试跑"); return;
      }
      if (a === "use-ability" || a === "use-version") {
        const target = a === "use-ability" ? store.abilities.find((a) => a.id === id) : ability;
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
      if (a === "sample-info") {
        openDialog("本地示例与运行边界", `<p>demo_orders 有 72 行订单，demo_users 有 12 个用户。SQL 由浏览器隔离线程内的 SQLite 实际执行，最多预览 500 行，5 秒超时。</p><p>预设指标与维度采用同一示例明细，可与自定义 SQL 组合。原目录的展示用固定结果保留单独标识。</p><p>独立发布与能力发布生成当前浏览器的固定版本；生产底表、权限、任务服务、版本注册和部署接口尚未接入。</p>`, ""); return;
      }
    } catch (error) { issues = [error.message]; showToast(error.message); if (overlay.hidden) render(); }
  }
  function handleModel(e) {
    const el = e.target, model = el.dataset.model; if (!model) return;
    if (el.type === "checkbox" && e.type !== "change") return;
    if (el.tagName === "SELECT" && e.type !== "change") return;
    if (["INPUT", "TEXTAREA"].includes(el.tagName) && el.type !== "checkbox" && e.type === "change") return;
    const parts = model.split("."), value = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
    const [kind, key, detail] = parts;
    if (kind === "enum-input") { if (/[,，\n]/.test(value)) commitEnumInput(el); return; }
    if (kind === "field") { fieldDraft[key] = value; return; }
    if (kind === "field-reviewed") { fieldDraft.review = !value; return; }
    if (kind === "attach-target") { attachDraft.target = value; return; }
    if (kind === "attach-form") { attachDraft[key] = value; return; }
    if (["publish-failure", "catalog-goal-choice"].includes(kind)) return;
    if (kind === "context") {
      const obj = trialKind === "item" || dialogKind === "item-context" ? (item.context ||= clone(defaultContext)) : trialKind === "ability" || dialogKind === "ability-context" ? ability.context : store.analysis.context;
      obj[key] = value;
    } else if (kind === "scenario") (trialKind === "item" || dialogKind === "item-context" ? item : trialKind === "ability" || dialogKind === "ability-context" ? ability : store.analysis).scenario = value;
    else if (kind === "ability") ability[key] = value;
    else if (kind === "item") item[key] = value;
    else if (kind === "output") {
      const field = item.draft.fields[Number(key)], oldKey = field.key;
      field[detail] = value;
      syncMetricReferences(item, detail === "key" ? oldKey : "", field.key);
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
    } else if (kind === "param") item.draft.parameters[Number(key)][detail] = value;
    else if (kind === "ref") {
      const ref = (key === "metric" ? ability.metrics : ability.dimensions).find((r) => r.itemId === detail);
      ref.version = Number(value);
      if (ref.metricKeys) ref.metricKeys = resolveItem(store, ref).draft.fields.filter((f) => f.role === "metric").map((f) => f.key);
      persist(); render(); return;
    } else if (kind === "metric") {
      const ref = ability.metrics.find((r) => r.itemId === key);
      ref.metricKeys = value ? [...new Set([...ref.metricKeys, detail])] : ref.metricKeys.filter((k) => k !== detail);
    } else if (kind === "group") {
      const g = ability.groups.find((g) => g.id === key); g[detail] = value;
      if (detail === "cross") { persist(); render(); return; }
    } else if (kind === "member") {
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
    persist(); if (overlay.hidden) updateValidity();
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
    if (overlay.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeDialog(); }
    if (e.key === "Tab") {
      const focusable = [...overlay.querySelectorAll(".p-drawer button:not(:disabled), .p-drawer input:not(:disabled), .p-drawer textarea, .p-drawer select:not(:disabled), .p-drawer a[href]")];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  document.querySelector("#catalog-search").addEventListener("input", renderCatalog);
  document.querySelector(".select-button").dataset.action = "catalog-goal";
  new MutationObserver(renderCatalog).observe(document.querySelector(".select-button span"), { childList: true, characterData: true, subtree: true });
  document.querySelectorAll(".nav-item").forEach((a) => {
    if (a.textContent.includes("取数能力")) a.href = "#/capabilities";
    if (a.textContent.includes("实验分析模块")) a.href = "#/modules";
  });
  document.querySelectorAll(".command-body button").forEach((a) => { a.addEventListener("click", () => {
    location.hash = a.textContent.includes("分析") ? "/modules" : "/capabilities";
    const dialog = document.querySelector(".command-dialog"); dialog.classList.remove("open"); dialog.setAttribute("aria-hidden", "true");
  }); });
  window.addEventListener("hashchange", () => { closeDialog(); issues = []; selectedRun = ""; selectedRecord = ""; render(); window.scrollTo(0, 0); });
  render();
  return { openDialog, closeDialog };
}
