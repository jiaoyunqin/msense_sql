import { createIcons, icons } from "lucide";
import { clone, uid, hash, STORE_KEY, loadStore, makeAbility, makeMode, sampleSQL, parameterCatalog, scenarios, currentRun, querySignature, reviewSignature, moduleSignature, validateMode, validateAbility, publishIssues, formatValue } from "./prototype-data.js";
import { parseMode, executeMode, analyze } from "./prototype-engine.js";
import "./prototype.css";

const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const icon = (name) => `<i data-lucide="${name}"></i>`;
const button = (action, text, name = "", cls = "", extra = "") => `<button type="button" class="p-button ${cls}" data-action="${action}" ${extra}>${name ? icon(name) : ""}${text}</button>`;
const badge = (text, tone = "") => `<span class="p-badge ${tone}">${esc(text)}</span>`;
const date = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未保存";
const statusName = { queued: "排队中", running: "运行中", success: "成功 · 有数据", empty: "成功 · 0 行", failed: "执行失败", timeout: "执行超时", permission: "权限不足", insufficient: "分析输入不足" };
const roleNames = { metric: "指标", dimension: "维度", identity: "分组身份", auxiliary: "辅助字段", pending: "待确认" };
const select = (label, model, options, value, extra = "") => `<label class="p-field"><span>${label}</span><select data-model="${model}" ${extra}>${options.map(([key, text]) => `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
const input = (label, model, value, extra = "") => `<label class="p-field"><span>${label}</span><input data-model="${model}" value="${esc(value)}" ${extra}></label>`;
const textarea = (label, model, value, extra = "") => `<label class="p-field"><span>${label}</span><textarea data-model="${model}" ${extra}>${esc(value)}</textarea></label>`;
const table = (record, highlight, displayFields) => {
  if (!record.rawRows?.length) return `<div class="p-empty">${icon("table-2")}<p>${record.status === "empty" ? "执行成功，返回 0 行。请核对筛选条件或更换示例窗口。" : "本次运行未产出可用数据。"}</p></div>`;
  const fields = displayFields || record.fields;
  return `<div class="p-table-scroll"><table class="p-table"><thead><tr><th>行</th>${fields.map((f) => `<th>${esc(f.name)}<small>${esc(f.key)}</small></th>`).join("")}</tr></thead><tbody>${record.rawRows.map((row, i) => `<tr ${highlight === i ? 'class="evidence-row"' : ""} id="input-${record.id}-${i}"><td>${i + 1}</td>${fields.map((f) => `<td title="原值：${esc(row[f.alias] === null ? "NULL" : row[f.alias])}">${esc(formatValue(row[f.alias], f))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
};
function syntax(sql) {
  const pattern = /(--[^\n]*|'(?:''|[^'])*'|\$\{\w+\}|\b(?:SELECT|FROM|WHERE|JOIN|ON|GROUP|BY|ORDER|AS|AND|IN|BETWEEN|CASE|WHEN|THEN|ELSE|END|DESC|SUM|COUNT|NULLIF|WITH|LIMIT|DISTINCT)\b)/gi;
  let html = "", cursor = 0;
  for (const match of sql.matchAll(pattern)) {
    html += esc(sql.slice(cursor, match.index));
    const token = match[0], cls = token.startsWith("--") ? "comment" : token.startsWith("'") ? "literal" : token.startsWith("$") ? "param" : "keyword";
    html += `<span class="sql-${cls}">${esc(token)}</span>`;
    cursor = match.index + token.length;
  }
  return html + esc(sql.slice(cursor)) + "\n";
}

export function mountPrototype({ capabilities, showToast }) {
  const store = loadStore();
  const main = document.querySelector(".main-content");
  const catalog = document.querySelector(".capability-page");
  const outlet = document.createElement("section");
  outlet.className = "prototype-outlet";
  main.append(outlet);
  const overlay = document.createElement("div");
  overlay.className = "p-overlay";
  overlay.hidden = true;
  document.querySelector(".app-shell").append(overlay);
  let selectedMode = "", selectedRecord = "", analysisTab = "output", highlightedRow = null, issues = [], busy = false, fieldDraft = null, dialogKind = "", previousFocus;
  let activeAbility;
  const persist = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
    catch { showToast("浏览器存储不可用或已满，当前编辑仍保留在页面，请导出草稿。"); }
  };
  // A browser reload cannot resume a terminated execution.
  store.abilities.forEach((a) => a.modes.forEach((m) => m.runs.forEach((r) => {
    if (["queued", "running"].includes(r.status)) { r.status = "failed"; r.error = "页面重载中断了本地模拟任务，请重新运行。"; }
  })));
  store.module.attempts.forEach((a) => { if (a.status === "running") { a.status = "insufficient"; a.error = "页面重载中断了本地分析，请重新运行。"; } });
  persist();

  const catalogActions = document.createElement("div");
  catalogActions.className = "p-catalog-actions";
  catalogActions.innerHTML = button("new-capability", "新建自定义 SQL", "plus", "primary");
  catalog.querySelector(".page-header .capability-count").before(catalogActions);
  const localNotice = document.createElement("div");
  localNotice.className = "p-notice";
  localNotice.innerHTML = `${icon("info")}<span>交互原型 · 模拟解析 / 取数 / 发布，使用本地示例底表。${button("sample-info", "查看示例口径", "", "link")}</span>`;
  catalog.querySelector(".catalog-toolbar").after(localNotice);
  const customList = document.createElement("div");
  customList.className = "p-custom-list";
  localNotice.after(customList);

  function renderCatalog() {
    const search = (document.querySelector("#catalog-search").value || "").toLowerCase();
    customList.innerHTML = store.abilities.filter((a) => [a.name, a.key, a.description, ...a.modes.flatMap((m) => m.fields.map((f) => f.name))].join(" ").toLowerCase().includes(search)).map((a) => {
      const published = a.versions.at(-1);
      return `<article class="p-custom-card"><div class="p-custom-icon">${icon("code-2")}</div><div class="p-custom-copy"><div class="p-row"><strong>${esc(a.name)}</strong>${badge("自定义 SQL", "blue")}${badge(published ? `已发布 v${published.number} · 本地` : "草稿", published ? "green" : "")}</div><p>${esc(a.description)}</p><small>${esc(a.key)} · ${a.modes.length} 种取数模式 · ${published ? "编辑不影响已发布版本" : "尚未对分析模块开放"}</small></div><div class="p-row">${button("edit-capability", "编辑配置", "square-pen", "", `data-id="${a.id}"`)}${button("use-capability", "用于分析", "arrow-up-right", "", `data-id="${a.id}" ${published ? "" : 'disabled title="须先模拟发布"'}`)}</div></article>`;
    }).join("");
    document.querySelector(".capability-count").innerHTML = `${icon("database")}${capabilities.length + store.abilities.length} 项能力`;
    createIcons({ icons });
  }
  function modeNow() { return activeAbility?.modes.find((m) => m.id === selectedMode) || activeAbility?.modes[0]; }
  function abilityIssues(ability, publishing = false) {
    const items = publishing ? publishIssues(ability) : validateAbility(ability);
    if (store.abilities.some((other) => other.id !== ability.id && other.key === ability.key)) items.push("稳定 Key 与另一个能力重复，请使用唯一 Key。");
    return items;
  }
  function route() {
    issues = [];
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const isSql = parts[0] === "sql";
    const isModule = parts[0] === "modules";
    const isAnalysis = parts[0] === "analysis";
    catalog.hidden = isSql || isModule || isAnalysis;
    outlet.hidden = !catalog.hidden;
    document.querySelectorAll(".nav-item").forEach((a) => {
      const matches = (a.textContent.includes("取数能力") && !isModule && !isAnalysis) || (a.textContent.includes("实验分析模块") && (isModule || isAnalysis));
      a.classList.toggle("active", matches);
      a.setAttribute("aria-current", matches ? "page" : "false");
    });
    if (isSql) {
      activeAbility = store.abilities.find((a) => a.id === parts[1]);
      if (!activeAbility) { location.hash = "/capabilities"; return; }
      if (!activeAbility.modes.some((m) => m.id === selectedMode)) selectedMode = activeAbility.modes[0]?.id || "";
      renderSql();
    } else if (isModule) renderModule();
    else if (isAnalysis) renderAnalysis(parts[1]);
    else renderCatalog();
    document.querySelector(".app-shell").classList.remove("sidebar-collapsed");
    window.scrollTo(0, 0);
  }
  function issueHTML(items) {
    return items.length ? `<div class="p-issues" role="alert">${icon("circle-alert")}<div><strong>请处理以下问题</strong><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div></div>` : "";
  }
  function statusHTML() {
    const mode = modeNow(), a = activeAbility;
    if (!mode) return "";
    const parsed = mode.parsedSql === mode.sql && !mode.parseError;
    const valid = validateMode(mode).length === 0;
    const run = currentRun(mode, a.context);
    const published = a.versions.at(-1);
    return `<div class="p-statusbar" id="sql-status">${badge(parsed ? "模拟解析成功" : "解析待更新", parsed ? "green" : "")}${icon("chevron-right")}${badge(valid ? "配置校验通过" : "配置待校验", valid ? "green" : "")}${icon("chevron-right")}${badge(run ? "当前取数已验证" : "当前取数待验证", run ? "green" : "")}${icon("chevron-right")}${badge(published ? `已发布 v${published.number} · 本地` : "尚未发布", published ? "blue" : "")}<span class="p-status-note">四个状态独立；修改后检查当前配置证据</span></div>`;
  }
  function updateStatus() {
    document.querySelector("#sql-status")?.replaceWith(document.createRange().createContextualFragment(statusHTML()));
    createIcons({ icons });
  }
  function renderSql() {
    const a = activeAbility, mode = modeNow();
    if (!mode) { outlet.innerHTML = `<h1>${esc(a.name)}</h1>${button("add-mode", "添加取数模式", "plus")}`; return; }
    outlet.innerHTML = `
      <div class="p-breadcrumb"><a href="#/capabilities">取数能力</a>${icon("chevron-right")}<span>自定义 SQL</span>${badge("本地模拟", "blue")}</div>
      <header class="p-page-header"><div><h1>${esc(a.name)}</h1><p>定义取数输入与输出，核对每一种实际提供的数据粒度。</p></div><div class="p-actions">${button("save", "保存草稿", "save")}${button("validate", "校验配置", "list-checks")}${button("open-run", "模拟取数试跑", "flask-conical")}${button("open-publish", "模拟发布", "upload", "primary")}</div></header>
      ${statusHTML()}${issueHTML(issues)}
      <section class="p-section"><header><div><h2>基本信息</h2><p>稳定 Key 首次保存后固定；发布版本保持不可变。</p></div><small id="save-status">${date(a.savedAt)}</small></header>
        <div class="p-form-grid">${input("能力名称", "ability.name", a.name)}${input("稳定 Key", "ability.key", a.key, a.keyLocked ? "disabled" : "")}${select("业务目标", "ability.goal", [["平台老客提频", "平台老客提频"], ["新客转化", "新客转化"], ["营销效率", "营销效率"]], a.goal)}${input("负责人", "ability.owner", a.owner)}</div>${textarea("能力说明", "ability.description", a.description, 'rows="2"')}
      </section>
      <section class="p-section sql-section" id="sql-section"><header><div><h2>SQL 与上下文参数</h2><p>独立 SQL 变体对应独立 Dataset；分别拆解与交叉拆解有不同数据来源。</p></div>${button("output-reference", "查看已有输出", "book-open")}</header>
        <div class="p-mode-tabs" role="tablist">${a.modes.map((m) => `<button role="tab" type="button" aria-selected="${m.id === mode.id}" class="${m.id === mode.id ? "active" : ""}" data-action="switch-mode" data-id="${m.id}">${icon(m.kind === "cross" ? "grid-2x2" : m.kind === "single" ? "split" : "layers")}${esc(m.name)}${currentRun(m, a.context) ? icon("circle-check") : ""}</button>`).join("")}${button("add-mode", "添加模式", "plus", "link")}</div>
        <div class="p-mode-config">${select("当前模式", "mode.kind", [["overall", "整体"], ["single", "单维拆解"], ["cross", "交叉拆解"]], mode.kind)}${input("模式名称", "mode.name", mode.name)}${input("成员 Key（逗号分隔）", "mode.members", mode.members.join(","), 'placeholder="spend_tier,lifecycle"')}${button("delete-mode", "移除模式", "trash-2", "quiet-danger")}</div>
        <div class="p-editor-layout"><div class="p-editor-wrap"><div class="p-editor-toolbar"><span>${icon("code-2")}本地 SQLite · 只读查询</span><div>${button("load-sample", "载入匹配示例", "file-code", "link")}${button("parse", busy ? "处理中…" : "模拟解析 SQL", "scan-text", "small-primary", busy ? "disabled" : "")}</div></div>
          <div class="p-code"><pre class="p-line-numbers" aria-hidden="true">${mode.sql.split("\n").map((_, i) => i + 1).join("\n")}</pre><div class="p-code-body"><pre class="p-code-highlight" aria-hidden="true">${syntax(mode.sql)}</pre><textarea id="sql-editor" data-model="mode.sql" aria-label="SQL 编辑器" spellcheck="false" wrap="off">${esc(mode.sql)}</textarea></div></div>
          <div class="p-editor-foot">SQLite 实际语法检查与示例执行 · 原生类型来自样本，空结果不推断类型 · 不代表生产方言兼容</div></div>
          <aside class="p-parameters"><h3>可用上下文参数</h3><p>这是 SQL 输入，不是指标或维度。</p>${parameterCatalog.map((p) => `<div class="p-param"><div><code>\${${p.key}}</code>${button("insert-param", "插入", "plus", "link", `data-id="${p.key}"`)}</div><strong>${p.name}</strong><small>${p.type}</small><p>${esc(p.description)}</p></div>`).join("")}<details><summary>示例底表结构</summary><p><code>demo_orders</code>：实验、分组、日期、券 ID、pay_amount、redeemed、user_id。</p><p><code>demo_users</code>：user_id、historical_spend、lifecycle、city_id。JOIN 由 SQL 明确编写。</p></details></aside>
        </div>
        ${mode.parseError ? issueHTML([mode.parseError]) : ""}
        ${mode.parameters.length ? `<div class="p-binding"><h3>当前 SQL 的参数绑定</h3>${mode.parameters.map((p) => `<div class="p-binding-row"><code>\${${esc(p.name)}}</code>${select("声明类型", `param-type.${p.name}`, [["number", "number"], ["string", "string"], ["date", "date"], ["number_list", "number_list"]], p.expectedType)}${select("上下文来源", `param-source.${p.name}`, [["", "未绑定"], ...parameterCatalog.filter((c) => c.type === p.expectedType).map((c) => [c.key, `${c.name} · ${c.key}`])], p.source)}<small>本次值：${esc(a.context[p.source] || "缺失")} · ${p.listUsage ? "IN 列表用法" : "单值用法"}</small></div>`).join("")}</div>` : ""}
      </section>
      <section class="p-section" id="output-section"><header><div><h2>输出配置</h2><p>SQL 输出最终指标。角色、维度实体和口径由 DS 确认；展示格式不计算新指标。</p></div>${button("add-field-help", "自定义指标 / 维度", "plus")}</header>
        ${mode.diff.length ? `<div class="p-diff">${mode.diff.map((d) => badge(`${d.alias} · ${d.status}`, d.status === "需复核" ? "amber" : d.status === "已保留" ? "green" : "blue")).join("")}</div>` : ""}
        ${mode.removed.length ? `<div class="p-issues"><div><strong>删除 / 重命名影响</strong><p>${mode.removed.map((f) => `${esc(f.name)} (${esc(f.key)})`).join("、")} 已不在当前 SQL 输出中。相关模式或下游引用需核对，不会按列位置迁移。</p>${button("accept-removed", "确认移除旧字段配置", "check")}</div></div>` : ""}
        ${mode.fields.length ? `<div class="p-table-scroll"><table class="p-table p-fields"><thead><tr><th>来源 / SQL 别名</th><th>稳定 Key / 名称</th><th>角色</th><th>预期类型</th><th>状态</th><th>配置</th></tr></thead><tbody>${mode.fields.map((f) => `<tr><td><code>${esc(f.alias)}</code><small title="${esc(f.source)}">${esc(f.source)}</small></td><td><strong>${esc(f.name)}</strong><small>${esc(f.key)}</small></td><td>${badge(roleNames[f.role], f.role === "metric" ? "blue" : "")}</td><td>${esc(f.type)}<small>样本：${esc(f.observed)}</small></td><td>${badge(f.review ? "需复核" : !f.description || f.role === "pending" ? "待配置" : "已配置", f.review ? "amber" : "green")}</td><td>${button("edit-field", "编辑", "sliders-horizontal", "link", `data-id="${f.alias}"`)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="p-empty">${icon("scan-text")}<p>先模拟解析当前 SQL，再编辑指标、维度与分组映射。</p>${button("parse", "模拟解析 SQL", "", "primary")}</div>`}
        <div class="p-inline-note">${icon("git-branch")}当前支持：${esc(mode.kind === "overall" ? "整体" : mode.members.join(" × ") || "尚未声明成员")}。每个模式只开放本 SQL 实际提供的指标。</div>
      </section>
      <section class="p-section" id="run-section"><header><div><h2>取数试跑结果</h2><p>核对数据结构与业务口径。取数试跑不生成分析结论。</p></div>${button("open-run", "新试跑", "play")}</header>${renderRuns(mode)}</section>
      <section class="p-section"><header><div><h2>发布记录</h2><p>不可变本地快照；下游固定版本，升级需显式确认。</p></div>${button("export", "导出当前草稿", "download")}</header>${a.versions.length ? a.versions.slice().reverse().map((v) => `<div class="p-version"><div><strong>v${v.number}</strong><span>${date(v.publishedAt)} · ${v.modes.length} 种模式</span><small>${esc(v.key)}</small></div>${button("use-version", "去分析模块使用", "arrow-up-right", "", `data-version="${v.number}"`)}</div>`).join("") : `<p class="p-muted">尚未模拟发布。保存草稿不会使能力进入分析模块。</p>`}</section>`;
    createIcons({ icons });
  }
  function renderRuns(mode) {
    const a = activeAbility;
    if (!mode.runs.length) return `<div class="p-empty">${icon("flask-conical")}<p>当前模式尚无取数记录。</p><small>实验 4823214 · 观察日期 2026-10-01 至 2026-10-03 为本地示例。</small></div>`;
    const record = mode.runs.find((r) => r.id === selectedRecord) || mode.runs[0];
    const matches = record.querySignature === querySignature(mode, a.context);
    const approved = record.approvedFor === reviewSignature(mode, a.context);
    const running = ["queued", "running"].includes(record.status);
    return `<div class="p-run-history">${mode.runs.slice(0, 12).map((r) => `<button type="button" class="${record.id === r.id ? "active" : ""}" data-action="select-run" data-id="${r.id}">${badge(statusName[r.status] || r.status, r.status === "success" ? "green" : "")}<small>${date(r.startedAt)}</small></button>`).join("")}</div>
      <div class="p-result-summary"><div class="p-row">${badge(statusName[record.status] || record.status, record.status === "success" ? "green" : running ? "blue" : "amber")}${badge(matches ? "当前取数配置" : "旧配置 · 不用于当前验证", matches ? "" : "amber")}<span>${record.rawRows?.length ?? 0} 行 · ${esc(record.modeName)}</span></div><small>${esc(record.id)} · 修订 ${record.revision} · Libra ${esc(record.context.libra_id)}</small></div>
      ${record.error ? issueHTML([record.error]) : ""}${running ? `<div class="p-progress"><span></span><p>模拟${record.status === "queued" ? "排队" : "执行"}中，当前快照已固定，可继续编辑。</p></div>` : table(record, null, matches ? mode.fields : undefined)}
      ${record.status === "success" && matches ? `<div class="p-confirm-result"><label><input type="checkbox" data-action="approve-run" data-id="${record.id}" ${approved ? "checked" : ""}>我已核对当前字段定义、数据与粒度，确认本模式结果可用于模拟发布。</label></div>` : ""}
      <details class="p-snapshot"><summary>查看 SQL、参数与标准化快照</summary><p>${record.effectiveContext ? "空数据场景将有效 Libra ID 设为 0；下方保留实际执行参数。" : "值对应本次执行；旧记录不会改写。"}</p><pre>${esc(JSON.stringify(record.effectiveContext || record.context, null, 2))}</pre><pre>${esc(record.renderedSql || record.snapshot.sql)}</pre>${record.dataset ? `<h3>StandardDataset 与本地适配伴随结构</h3><p>联合成员、group_id、类型和空值在本地 adapter 中保留；这不是生产契约。</p><pre>${esc(JSON.stringify({ dataset: record.dataset, adapter: record.adapter }, null, 2))}</pre>` : ""}</details>`;
  }
  function versionNow() {
    const m = store.module;
    return store.abilities.find((a) => a.id === m.capabilityId)?.versions.find((v) => v.number === m.version);
  }
  function renderModule() {
    const m = store.module, version = versionNow();
    const versions = store.abilities.flatMap((a) => a.versions.map((v) => [`${a.id}:${v.number}`, `${v.name} · v${v.number}`]));
    const ref = `${m.capabilityId}:${m.version}`;
    outlet.innerHTML = `<div class="p-breadcrumb"><span>管理端</span>${icon("chevron-right")}<span>实验分析模块</span>${badge("本地模拟", "blue")}</div>
      <header class="p-page-header"><div><h1>${esc(m.name)}</h1><p>引用发布的取数能力，配置分析思路，分别核对输入与输出。</p></div><div class="p-actions">${button("save-module", "保存草稿", "save")}${button("analysis-context", "试跑上下文", "settings-2")}${button("analyze", "模拟分析试跑", "flask-conical", "primary", m.attempts.some((a) => a.status === "running") ? "disabled" : "")}</div></header>${issueHTML(issues)}
      <section class="p-section"><header><div><h2>基本信息</h2><p>沿用模块名称、说明、分析思路和注意事项的配置方式。</p></div><small>${date(m.savedAt)}</small></header><div class="p-form-grid two">${input("模块名称", "module.name", m.name)}${input("业务目标", "module.goal", m.goal)}</div>${textarea("模块说明", "module.description", m.description, 'rows="2"')}</section>
      <section class="p-section"><header><div><h2>取数模块</h2><p>只引用模拟发布版本。每个所选模式分别执行，不把两份边际分布变成联合分布。</p></div><a class="p-button" href="#/capabilities">${icon("database")}查看能力目录</a></header>
      ${select("能力与固定版本", "module.ref", [["", "请选择已发布能力"], ...versions], version ? ref : "")}
      ${version ? `<div class="p-inline-note">${icon("lock-keyhole")}固定 ${esc(version.name)} v${version.number} · ${esc(version.key)}。新版本不会自动替换当前引用。</div>
        <div class="p-selection-modes">${version.modes.map((mode) => `<div class="p-selection-mode"><div class="p-row"><strong>${esc(mode.name)}</strong>${badge(mode.kind === "cross" ? "联合数据 · 一份 Dataset" : mode.kind === "single" ? "单维 · 独立 Dataset" : "整体")}</div><p>${mode.members.length ? esc(mode.members.join(" × ")) : "实验组整体粒度"} · 仅以下指标可用于此模式</p><div class="p-checks">${mode.fields.filter((f) => f.role === "metric").map((f) => `<label><input type="checkbox" data-selection-mode="${mode.id}" value="${esc(f.key)}" ${(m.selections[mode.id] || []).includes(f.key) ? "checked" : ""}>${esc(f.name)}</label>`).join("")}</div></div>`).join("")}</div>
        <div class="p-inline-note">${icon("info")}${Object.values(m.selections).filter((v) => v.length).length} 种模式已选择，将分别取数。只选择两个单维模式不会得到交叉结果。</div>` : `<div class="p-empty">${icon("lock-keyhole")}<p>先在取数能力中完成解析、校验、试跑核对和模拟发布。</p><a class="p-button primary" href="#/capabilities">去配置取数能力</a></div>`}
      </section>
      <section class="p-section"><header><div><h2>分析思路</h2><p>分析只消费所选数据；本地示例分析不调用模型，不补造指标。</p></div></header>${textarea("分析思路", "module.reasoning", m.reasoning, 'rows="5"')}${textarea("注意事项", "module.considerations", m.considerations, 'rows="3"')}</section>
      <section class="p-section"><header><div><h2>分析试跑记录</h2><p>只修改思路可复用相同数据快照；版本、选择、实验或日期变化后重新取数。</p></div></header>${m.attempts.length ? m.attempts.map((a) => `<div class="p-version"><div><strong>${a.status === "success" ? "示例分析成功" : statusName[a.status] || "分析中"}</strong><span>${date(a.startedAt)} · v${a.version} · ${a.reused ? "复用数据快照" : "新取数"}</span><small>${esc(a.id)}</small></div><a class="p-button" href="#/analysis/${a.id}">查看工作区 ${icon("arrow-up-right")}</a></div>`).join("") : `<p class="p-muted">尚无分析试跑。取数成功不代表分析成功。</p>`}</section>`;
    createIcons({ icons });
  }
  function renderAnalysis(id) {
    const attempt = store.module.attempts.find((a) => a.id === id);
    if (!attempt) { location.hash = "/modules"; return; }
    const stale = moduleSignature(store.module) !== moduleSignature(attempt.snapshot);
    const record = attempt.records.find((r) => r.id === selectedRecord) || attempt.records[0];
    outlet.innerHTML = `<div class="p-breadcrumb"><a href="#/modules">实验分析模块</a>${icon("chevron-right")}<span>试跑工作区</span>${badge("示例分析", "blue")}</div><header class="p-page-header"><div><h1>${esc(attempt.snapshot.name)} · 试跑工作区</h1><p>${date(attempt.startedAt)} · 固定取数能力 v${attempt.version} · ${esc(attempt.id)}</p></div><div class="p-actions"><a class="p-button" href="#/modules">${icon("square-pen")}调整思路</a>${button("analyze", "新试跑", "flask-conical", "primary", attempt.status === "running" ? "disabled" : "")}</div></header>
      <div class="p-statusbar">${badge(attempt.status === "success" ? "示例分析成功" : attempt.status === "running" ? "分析运行中" : "分析输入不足", attempt.status === "success" ? "green" : "amber")}${badge(stale ? "旧模块配置 · 仅供追溯" : "当前模块配置", stale ? "amber" : "")}<span>${attempt.reused ? "复用同一数据基线；新分析尝试" : "本次重新取数"} · ${attempt.records.length} 份 Dataset</span></div>
      <div class="p-analysis-meta">${badge(`Libra ${attempt.snapshot.context.libra_id}`)}${badge(`${attempt.snapshot.context.start_date} 至 ${attempt.snapshot.context.end_date}`)}${badge(`${attempt.capabilityName} v${attempt.version}`)}</div>
      <div class="p-mode-tabs"><button class="${analysisTab === "output" ? "active" : ""}" data-action="analysis-tab" data-id="output">${icon("file-text")}分析输出</button><button class="${analysisTab === "input" ? "active" : ""}" data-action="analysis-tab" data-id="input">${icon("table-2")}输入数据与证据</button></div>
      ${analysisTab === "output" ? `<section class="p-section"><header><div><h2>示例分析输出</h2><p>仅描述实际输入中的组间数值；证据可跳转对应数据行。</p></div></header>
        ${attempt.status === "running" ? `<div class="p-progress"><span></span><p>按固定版本获取数据，并检查分析输入…</p></div>` : attempt.status !== "success" ? `${issueHTML([attempt.error || "输入数据不足"])}<div class="p-empty"><p>本次没有生成正常分析结论。</p></div>` : `<div class="p-conclusions">${attempt.evidence.map((e) => `<article><div>${icon("chart-no-axes-combined")}<p>${esc(e.text)}</p></div>${button("evidence", `${esc(e.id)} · 查看输入`, "arrow-right", "link", `data-execution="${e.executionId}" data-row="${e.rowIndex}"`)}</article>`).join("")}</div>`}
        <div class="p-analysis-gaps"><h3>数据缺口与判断边界</h3>${(attempt.gaps.length ? attempt.gaps : ["运行中，尚未完成输入检查。"]).map((g) => `<p>${icon("info")}${esc(g)}</p>`).join("")}</div><details class="p-snapshot"><summary>本次分析配置快照</summary><p>${esc(attempt.snapshot.reasoning)}</p><p>${esc(attempt.snapshot.considerations)}</p></details></section>`
        : `<section class="p-section"><header><div><h2>本次输入数据</h2><p>数据来源、分组标识、联合成员原值、空值和观察窗口均随本次快照保存。</p></div></header><div class="p-mode-tabs">${attempt.records.map((r) => `<button data-action="analysis-record" data-id="${r.id}" class="${record?.id === r.id ? "active" : ""}">${esc(r.modeName)} · ${r.rawRows?.length || 0} 行</button>`).join("")}</div>${record ? `<div class="p-inline-note">Dataset / ${esc(record.id)} · 能力 v${attempt.version}</div>${record.error ? issueHTML([record.error]) : ""}${table(record, highlightedRow)}<details class="p-snapshot"><summary>本地分析适配与标准 Dataset</summary><p>metrics → fields、execution_id → dataset_id、group_id、观察窗口和交叉成员仅作本地适配演示，未验证生产契约。</p><pre>${esc(JSON.stringify({ dataset_id: record.id, fields: record.fields, standard_dataset: record.dataset, prototype_adapter: record.adapter }, null, 2))}</pre></details>` : `<div class="p-empty">尚无输入数据。</div>`}</section>`}`;
    createIcons({ icons });
  }
  function openDialog(title, body, footer = "", wide = false) {
    previousFocus = document.activeElement;
    overlay.hidden = false;
    overlay.innerHTML = `<button class="p-overlay-backdrop" data-action="close" aria-label="关闭弹层"></button><section class="p-drawer ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="p-dialog-title"><header><div><h2 id="p-dialog-title">${title}</h2>${badge("本地原型")}</div>${button("close", "", "x", "", 'aria-label="关闭"')}</header><div class="p-drawer-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ""}</section>`;
    createIcons({ icons });
    overlay.querySelector("input, select, textarea, .p-drawer button")?.focus();
    document.body.classList.add("p-modal-open");
  }
  function closeDialog() {
    overlay.hidden = true;
    overlay.innerHTML = "";
    dialogKind = "";
    fieldDraft = null;
    document.body.classList.remove("p-modal-open");
    previousFocus?.focus();
  }
  function contextBody(context, scenario, modes) {
    return `<div class="p-notice">${icon("shield-check")}服务身份与准入、底表、结果权限仅做场景模拟，没有真实授权检查。</div><div class="p-form-grid two">${parameterCatalog.map((p) => input(`${p.name} · ${p.type}`, `context.${p.key}`, context[p.key])).join("")}</div>
      ${modes ? `<h3>本次取数模式</h3><p class="p-muted">每个勾选模式独立执行；发布前需验证全部对外模式。</p><div class="p-checks vertical">${modes.map((m) => `<label><input type="checkbox" data-run-mode="${m.id}" ${m.id === selectedMode ? "checked" : ""}>${esc(m.name)} · ${m.kind === "cross" ? "联合数据" : "独立 Dataset"}</label>`).join("")}</div>` : ""}
      <details class="p-scenarios" open><summary>模拟场景（用于验证异常）</summary>${select("本次场景", "scenario", Object.entries(scenarios), scenario)}<p>空数据场景以 Libra ID=0 实际查询；其他异常显式注入。正常场景按编辑后的 SQL 执行。</p></details>`;
  }
  function openField(alias) {
    const field = modeNow().fields.find((f) => f.alias === alias);
    if (!field) return;
    dialogKind = "field";
    fieldDraft = clone(field);
    openDialog("编辑输出字段", `<div class="p-field-source"><code>${esc(field.alias)}</code><pre>${esc(field.source)}</pre><p>样本类型：${esc(field.observed)}。配置类型不会自动转换 SQL 值。</p></div>
      <div class="p-form-grid two">${input("稳定 Key", "field.key", field.key, field.role === "identity" ? "disabled" : "")}${input("展示名称", "field.name", field.name)}${select("字段角色", "field.role", Object.entries(roleNames), field.role)}${select("预期原生类型", "field.type", [["unknown", "待确认"], ["number", "number"], ["string", "string"]], field.type)}</div>
      ${textarea("业务说明 / 统计口径", "field.description", field.description, 'rows="4"')}
      <div class="p-form-grid two">${input("维度统计实体", "field.entity", field.entity, 'placeholder="维度必填，如用户 / 订单"')}${input("维度取值时点", "field.timing", field.timing, 'placeholder="维度必填，如首次进组前"')}${select("展示格式（只影响显示）", "field.format", [["decimal", "小数"], ["integer", "整数"], ["currency", "金额"], ["percent", "百分比"]], field.format)}${input("精度（0–6）", "field.precision", field.precision, 'type="number" min="0" max="6"')}${input("单位", "field.unit", field.unit)}${input("空值展示", "field.nullDisplay", field.nullDisplay)}</div>
      ${field.review ? `<div class="p-issues"><p>来源表达式、类型或粒度已变。保存即明确确认新口径，并要求当前结果重新验证；字段身份不会按位置迁移。</p></div>` : ""}`,
      button("close", "取消") + button("save-field", "保存并确认字段定义", "check", "primary"));
  }
  function assign(model, value) {
    const [scope, key] = model.split(".");
    const a = activeAbility, mode = modeNow();
    if (scope === "ability") {
      if (key === "key" && a.keyLocked) return;
      a[key] = value; a.revision++;
    } else if (scope === "mode") {
      mode[key] = key === "members" ? value.split(",").map((v) => v.trim()).filter(Boolean) : value;
      mode.revision++; a.revision++;
    } else if (scope === "param-type" || scope === "param-source") {
      const param = mode.parameters.find((p) => p.name === key);
      if (scope === "param-type") { param.expectedType = value; if (parameterCatalog.find((p) => p.key === param.source)?.type !== value) param.source = ""; }
      else param.source = value;
      mode.revision++;
    } else if (scope === "field") fieldDraft[key] = key === "precision" ? Number(value) : value;
    else if (scope === "module" && key !== "ref") store.module[key] = value;
    else if (scope === "context") {
      const target = dialogKind === "analysis-context" ? store.module.context : a.context;
      target[key] = value;
    } else if (model === "scenario") {
      if (dialogKind === "analysis-context") store.module.scenario = value;
      else a.scenario = value;
    }
    if (scope !== "field") persist();
  }
  async function onAction(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.action, a = activeAbility, mode = modeNow();
    if (action === "close") {
      closeDialog();
      if (location.hash.startsWith("#/sql")) renderSql();
      else if (location.hash.startsWith("#/modules")) renderModule();
      return;
    }
    if (action === "new-capability") {
      const fresh = makeAbility();
      fresh.name = "未命名自定义取数";
      store.abilities.push(fresh); persist(); location.hash = `/sql/${fresh.id}`; return;
    }
    if (action === "edit-capability") { location.hash = `/sql/${trigger.dataset.id}`; return; }
    if (action === "use-capability") {
      const ability = store.abilities.find((c) => c.id === trigger.dataset.id);
      requestReference(`${ability.id}:${ability.versions.at(-1).number}`); return;
    }
    if (action === "switch-mode") { selectedMode = trigger.dataset.id; selectedRecord = ""; issues = []; renderSql(); return; }
    if (action === "save") {
      if (!/^[a-zA-Z_]\w*$/.test(a.key) || store.abilities.some((c) => c.id !== a.id && c.key === a.key)) {
        issues = ["稳定 Key 格式不合法或与另一个能力重复。"]; renderSql(); return;
      }
      a.keyLocked = true; a.savedAt = new Date().toISOString(); persist(); renderSql(); showToast("草稿已保存在当前浏览器"); return;
    }
    if (action === "validate") { issues = abilityIssues(a); renderSql(); if (!issues.length) showToast("配置校验通过；权限与数据仍需模拟试跑核验"); return; }
    if (action === "parse") {
      if (busy) return;
      busy = true;
      const targetSQL = mode.sql;
      const targetRevision = mode.revision;
      const copy = clone(mode);
      showToast("正在使用本地 SQLite 模拟解析");
      try {
        await parseMode(copy);
        if (mode.sql !== targetSQL || mode.revision !== targetRevision) showToast("解析期间配置已变更，保留编辑，请重新解析");
        else {
          const runs = mode.runs;
          Object.assign(mode, copy, { runs });
        }
        issues = [];
      } catch (error) { if (mode.sql === targetSQL) mode.parseError = error.message; }
      busy = false; persist(); renderSql(); return;
    }
    if (action === "load-sample") {
      openDialog("载入当前模式的示例 SQL", `<p>将替换当前 SQL；原人工配置保留，重新解析时检查字段差异。不会删除历史试跑或发布版本。</p>`, button("close", "取消") + button("confirm-sample", "载入示例 SQL", "check", "primary")); return;
    }
    if (action === "confirm-sample") { mode.sql = sampleSQL(mode.members); mode.revision++; closeDialog(); persist(); renderSql(); return; }
    if (action === "insert-param") {
      const editor = document.querySelector("#sql-editor"), text = `\${${trigger.dataset.id}}`;
      const pos = editor.selectionStart;
      editor.setRangeText(text, pos, editor.selectionEnd, "end");
      mode.sql = editor.value; mode.revision++; persist(); updateCode(editor); updateStatus(); editor.focus(); return;
    }
    if (action === "edit-field") { openField(trigger.dataset.id); return; }
    if (action === "save-field") {
      if (!fieldDraft.name.trim() || !fieldDraft.description.trim() || fieldDraft.role === "pending" || fieldDraft.type === "unknown" || !/^[a-zA-Z_]\w*$/.test(fieldDraft.key)) { showToast("请补齐 Key、名称、口径、角色和类型"); return; }
      if (fieldDraft.role === "dimension" && (!fieldDraft.entity || !fieldDraft.timing)) { showToast("维度必须补齐统计实体和取值时点"); return; }
      fieldDraft.review = false;
      mode.fields[mode.fields.findIndex((f) => f.alias === fieldDraft.alias)] = clone(fieldDraft);
      mode.revision++; closeDialog(); persist(); renderSql(); return;
    }
    if (action === "accept-removed") { mode.removed = []; mode.revision++; persist(); renderSql(); return; }
    if (action === "add-field-help") {
      openDialog("自定义指标与维度", `<p>在 SQL 的 SELECT 中新增最终输出，并使用唯一的 AS 别名，再模拟解析并编辑字段角色与口径。</p><pre>SUM(o.pay_amount) / NULLIF(COUNT(*), 0) AS avg_order_value\nu.city_id AS city_id</pre><p>新指标需要真实 SQL 来源。数字型 city_id 可以配置为维度。维度需写明实体、取值时点，并配置匹配的单维或交叉 SQL。</p><p>百分比格式只改变显示，不计算分子与分母。</p>`, button("close", "返回 SQL 编辑")); return;
    }
    if (action === "add-mode") {
      dialogKind = "add-mode";
      openDialog("添加独立取数模式", `<p>请选择实际需要的粒度。新模式需要自己的 SQL，不会由两份单维结果生成交叉。</p>${input("名称", "newmode.name", "")}${select("模式", "newmode.kind", [["single", "单维拆解"], ["cross", "交叉拆解"], ["overall", "整体"]], "single")}${input("成员 Key（逗号分隔）", "newmode.members", "", 'placeholder="spend_tier,lifecycle"')}`, button("close", "取消") + button("create-mode", "添加模式", "plus", "primary")); return;
    }
    if (action === "create-mode") {
      const name = overlay.querySelector('[data-model="newmode.name"]').value.trim(), kind = overlay.querySelector('[data-model="newmode.kind"]').value;
      const members = overlay.querySelector('[data-model="newmode.members"]').value.split(",").map((v) => v.trim()).filter(Boolean);
      if (!name || (kind === "single" && members.length !== 1) || (kind === "cross" && (members.length < 2 || new Set(members).size !== members.length)) || (kind === "overall" && members.length)) { showToast("请填写名称和与模式匹配的成员"); return; }
      const newMode = makeMode(name, kind, members, "");
      a.modes.push(newMode); a.revision++; selectedMode = newMode.id; closeDialog(); persist(); renderSql(); return;
    }
    if (action === "delete-mode") {
      if (a.modes.length === 1) { showToast("至少保留一种取数模式"); return; }
      openDialog("移除当前草稿模式", `<p>将从当前草稿移除“${esc(mode.name)}”。已发布版本和分析历史仍保留该快照。发布新版后，下游升级需要重新选择模式。</p>`, button("close", "取消") + button("confirm-delete-mode", "从草稿移除", "trash-2", "danger")); return;
    }
    if (action === "confirm-delete-mode") { a.modes = a.modes.filter((m) => m.id !== mode.id); selectedMode = a.modes[0].id; a.revision++; closeDialog(); persist(); renderSql(); return; }
    if (action === "open-run") {
      dialogKind = "run";
      openDialog("模拟取数试跑", contextBody(a.context, a.scenario, a.modes), button("close", "取消") + button("start-run", "启动模拟取数", "play", "primary")); return;
    }
    if (action === "start-run") {
      const ids = [...overlay.querySelectorAll("[data-run-mode]:checked")].map((el) => el.dataset.runMode);
      if (!ids.length) { showToast("请选择至少一种取数模式"); return; }
      const modes = a.modes.filter((m) => ids.includes(m.id));
      const errors = modes.flatMap((m) => validateMode(m).map((i) => `${m.name}：${i}`));
      if (errors.length) { closeDialog(); issues = errors; renderSql(); return; }
      if (modes.some((m) => m.runs.some((r) => ["queued", "running"].includes(r.status)))) { showToast("所选模式已有运行中的记录"); return; }
      const context = clone(a.context), scenario = a.scenario;
      closeDialog(); issues = []; selectedMode = modes[0].id; selectedRecord = "";
      renderSql();
      for (const target of modes) {
        await executeMode(target, context, scenario, () => {
          persist();
          if (location.hash.includes(`/sql/${a.id}`)) refreshRunArea();
        });
      }
      showToast("本次模拟取数已结束，请逐个模式核对结果"); return;
    }
    if (action === "select-run") { selectedRecord = trigger.dataset.id; refreshRunArea(); return; }
    if (action === "approve-run") {
      const record = mode.runs.find((r) => r.id === trigger.dataset.id);
      if (record?.status === "success" && record.querySignature === querySignature(mode, a.context)) {
        record.approvedFor = trigger.checked ? reviewSignature(mode, a.context) : ""; persist(); updateStatus();
      } else { trigger.checked = false; showToast("旧配置记录不能核对为当前发布证据"); }
      return;
    }
    if (action === "open-publish") {
      const blockers = abilityIssues(a, true);
      dialogKind = "publish";
      openDialog("模拟发布确认", `<p>发布 v${a.versions.length + 1} · ${esc(a.name)}。本次包含 ${a.modes.length} 种取数模式，均需当前配置有数据且已核对。</p>${issueHTML(blockers)}${a.modes.map((m) => `<div class="p-version"><strong>${esc(m.name)}</strong>${badge(currentRun(m, a.context) ? "有有效取数" : "待取数", currentRun(m, a.context) ? "green" : "amber")}</div>`).join("")}<div class="p-inline-note">发布仅写入本地浏览器的不可变快照；未注册任何生产 SQL。</div><label class="p-checks"><input id="publish-failure" type="checkbox">模拟发布注册失败（验证恢复）</label>`, button("close", "返回编辑") + button("publish", "确认模拟发布", "upload", "primary", blockers.length ? "disabled" : "")); return;
    }
    if (action === "publish") {
      const blockers = abilityIssues(a, true);
      if (blockers.length) { closeDialog(); issues = blockers; renderSql(); return; }
      if (overlay.querySelector("#publish-failure").checked) { closeDialog(); issues = ["模拟发布失败：注册服务不可用。旧发布版本和当前草稿完整保留，可再次发布。"]; renderSql(); return; }
      const signature = hash({ name: a.name, key: a.key, description: a.description, modes: a.modes.map((m) => ({ ...m, runs: undefined })) });
      if (a.versions.at(-1)?.signature === signature) { showToast("当前配置已经发布，无需创建重复版本"); closeDialog(); return; }
      const version = { number: a.versions.length + 1, abilityId: a.id, key: a.key, name: a.name, description: a.description, signature, publishedAt: new Date().toISOString(), modes: a.modes.map((m) => ({ ...clone(m), runs: [] })) };
      a.versions.push(version); a.keyLocked = true; a.savedAt = version.publishedAt; persist(); closeDialog(); renderSql();
      openDialog(`模拟发布 v${version.number} 成功`, `<p>已在当前浏览器生成不可变版本快照。分析模块可以显式引用此版本，后续草稿修改不影响该版本。</p>`, button("close", "继续编辑") + button("use-version", "去分析模块使用", "arrow-up-right", "primary", `data-version="${version.number}"`)); return;
    }
    if (action === "use-version") { requestReference(`${a.id}:${trigger.dataset.version}`); return; }
    if (action === "confirm-reference") { applyReference(trigger.dataset.ref); return; }
    if (action === "save-module") { store.module.savedAt = new Date().toISOString(); persist(); renderModule(); showToast("分析模块草稿已保存"); return; }
    if (action === "analysis-context") {
      dialogKind = "analysis-context";
      openDialog("分析试跑上下文", contextBody(store.module.context, store.module.scenario), button("context-done", "确认上下文", "check", "primary")); return;
    }
    if (action === "context-done") { closeDialog(); persist(); renderModule(); return; }
    if (action === "analyze") {
      const version = versionNow();
      if (!version) { issues = ["请先显式引用已发布的取数能力版本。"]; location.hash = "/modules"; renderModule(); return; }
      if (store.module.attempts.some((attempt) => attempt.status === "running")) { showToast("分析试跑正在运行"); return; }
      const promise = analyze(store.module, version, () => {
        persist();
        const runningId = store.module.attempts[0].id;
        if (location.hash.includes(`/analysis/${runningId}`)) renderAnalysis(runningId);
      });
      const id = store.module.attempts[0].id;
      analysisTab = "output"; selectedRecord = ""; location.hash = `/analysis/${id}`;
      await promise; persist(); renderAnalysis(id); return;
    }
    if (action === "analysis-tab") { analysisTab = trigger.dataset.id; highlightedRow = null; renderAnalysis(location.hash.split("/").at(-1)); return; }
    if (action === "analysis-record") { selectedRecord = trigger.dataset.id; highlightedRow = null; renderAnalysis(location.hash.split("/").at(-1)); return; }
    if (action === "evidence") {
      selectedRecord = trigger.dataset.execution; highlightedRow = Number(trigger.dataset.row); analysisTab = "input";
      renderAnalysis(location.hash.split("/").at(-1));
      document.querySelector(".evidence-row")?.scrollIntoView({ block: "center", behavior: "smooth" }); return;
    }
    if (action === "output-reference") {
      openDialog("已有能力的输出参考", `<p class="p-muted">此目录为原复刻页演示定义，供理解输出；不属于 SQL 上下文参数。</p>${capabilities.map((c) => `<details class="p-reference"><summary>${esc(c.title)}</summary><h3>指标输出</h3>${c.metrics.map(([name, description]) => `<p><strong>${esc(name)}</strong> · ${esc(description)}</p>`).join("")}<h3>维度输出</h3><p>${esc(c.dimensions.join("、") || "暂无")}</p></details>`).join("")}`, button("close", "返回 SQL"), true); return;
    }
    if (action === "sample-info") {
      openDialog("本地示例与模拟边界", `<p>使用浏览器内 SQLite 实际检查语法与执行 SQL，无服务器、数据库连接或模型调用。</p><p>demo_orders 共 72 行：2 个实验组 × 3 个消费力层级 × 2 个生命周期 × 3 天 × 2 个券模板。demo_users 共 12 行。数据为固定生成值，未来自生产。</p><p>时间为 2026-10-01 至 2026-10-03；Libra 4823214、钱效 pgdp_demo_01、券模板 101/102。SQL 可以自定义聚合、CASE 和 JOIN，支持本地 SQLite 方言。</p><p>原生类型来自查询样本，角色由字段定义与 DS 确认。复杂 SQL 输出来源无法可靠匹配时要求人工复核。查询在隔离线程内，超过 5 秒终止，最多预览 500 行。</p><p>权限、失败、超时、缺列、错类型与重复粒度为显式模拟场景。生产参数目录、权限、版本注册、联合 Dataset 和分析字段映射仍需后端适配。</p>`, button("close", "知道了")); return;
    }
    if (action === "export") {
      const url = URL.createObjectURL(new Blob([JSON.stringify(a, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${a.key}-draft.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
  }
  function requestReference(ref) {
    const m = store.module;
    if (m.capabilityId && `${m.capabilityId}:${m.version}` !== ref) {
      const [id, number] = ref.split(":");
      const version = store.abilities.find((a) => a.id === id)?.versions.find((v) => v.number === Number(number));
      openDialog("确认切换固定取数版本", `<p>当前模块引用 v${m.version}，将切换至“${esc(version.name)}” v${version.number}。请重新选择该版本支持的指标与模式。旧分析输入与结论会保留，新配置需要重新取数。</p>`, button("close", "保留当前版本") + button("confirm-reference", "确认切换并重新选择", "check", "primary", `data-ref="${ref}"`));
    } else applyReference(ref);
  }
  function applyReference(ref) {
    const [id, number] = ref.split(":");
    if (`${store.module.capabilityId}:${store.module.version}` !== ref) store.module.selections = {};
    store.module.capabilityId = id; store.module.version = Number(number); persist(); closeDialog(); location.hash = "/modules"; renderModule();
  }
  function refreshRunArea() {
    const section = outlet.querySelector("#run-section");
    if (!section) return;
    section.innerHTML = `<header><div><h2>取数试跑结果</h2><p>核对本次固定快照与当前配置。</p></div>${button("open-run", "新试跑", "play")}</header>${renderRuns(modeNow())}`;
    updateStatus(); createIcons({ icons });
  }
  function updateCode(editor) {
    outlet.querySelector(".p-code-highlight").innerHTML = syntax(editor.value);
    outlet.querySelector(".p-line-numbers").textContent = editor.value.split("\n").map((_, i) => i + 1).join("\n");
    syncCode(editor);
  }
  function syncCode(editor) {
    const pre = outlet.querySelector(".p-code-highlight");
    if (!pre) return;
    pre.scrollTop = editor.scrollTop; pre.scrollLeft = editor.scrollLeft;
    outlet.querySelector(".p-line-numbers").scrollTop = editor.scrollTop;
  }
  main.addEventListener("click", onAction);
  overlay.addEventListener("click", onAction);
  for (const root of [main, overlay]) {
    root.addEventListener("input", (event) => {
      if (event.target.id === "catalog-search") { renderCatalog(); return; }
      const model = event.target.dataset.model;
      if (!model || event.target.tagName === "SELECT") return;
      assign(model, event.target.value);
      if (model === "mode.sql") { updateCode(event.target); updateStatus(); refreshRunArea(); }
      else if (!overlay.hidden) return;
      else if (location.hash.startsWith("#/sql")) updateStatus();
    });
    root.addEventListener("change", (event) => {
      if (event.target.dataset.selectionMode) {
        const modeId = event.target.dataset.selectionMode, selections = store.module.selections;
        const values = new Set(selections[modeId] || []);
        event.target.checked ? values.add(event.target.value) : values.delete(event.target.value);
        selections[modeId] = [...values]; persist(); renderModule(); return;
      }
      const model = event.target.dataset.model;
      if (model === "module.ref") {
        if (event.target.value) requestReference(event.target.value);
        else { store.module.capabilityId = ""; store.module.version = 0; store.module.selections = {}; persist(); renderModule(); }
        return;
      }
      if (model && event.target.tagName === "SELECT") {
        assign(model, event.target.value);
        if (model.startsWith("param-") || model === "mode.kind") renderSql();
      }
      if (model?.startsWith("mode.") && model !== "mode.sql") { renderSql(); }
    });
  }
  main.addEventListener("scroll", (event) => { if (event.target.id === "sql-editor") syncCode(event.target); }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeDialog();
    if (!overlay.hidden && event.key === "Tab") {
      const targets = [...overlay.querySelectorAll(".p-drawer button:not(:disabled), input:not(:disabled), select, textarea, a[href], summary")].filter((el) => el.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === "Tab" && event.target.id === "sql-editor") {
      event.preventDefault(); event.target.setRangeText("  ", event.target.selectionStart, event.target.selectionEnd, "end");
      assign("mode.sql", event.target.value); updateCode(event.target); updateStatus();
    }
  });
  document.querySelectorAll(".nav-item").forEach((link) => {
    if (link.textContent.includes("取数能力")) link.href = "#/capabilities";
    else if (link.textContent.includes("实验分析模块")) link.href = "#/modules";
    else link.addEventListener("click", (e) => { e.preventDefault(); showToast("本轮实现取数能力与实验分析模块"); });
  });
  document.querySelectorAll(".command-body button").forEach((b) => b.addEventListener("click", () => {
    document.querySelector(".command-dialog").classList.remove("open");
    document.querySelector(".command-dialog").setAttribute("aria-hidden", "true");
    location.hash = b.textContent.includes("实验分析模块") ? "/modules" : "/capabilities";
  }));
  window.addEventListener("hashchange", route);
  route();
  return { openDialog, closeDialog };
}
