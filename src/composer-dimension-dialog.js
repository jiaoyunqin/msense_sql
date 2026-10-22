import { clone, newItem, uid, entities, identifier, itemIssues, resolveItem, completeGroup } from "./composer-data.js";
import { parseItem, syncDimension } from "./composer-engine.js";
import { assertMutable, saveDraft } from "./composer-management.js";
import { metricFields } from "./composer-metrics.js";
import { parameterCatalog } from "./prototype-data.js";

const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const button = (action, text, extra = "", cls = "") => `<button type="button" class="p-button ${cls}" data-dim-action="${action}" ${extra}>${text}</button>`;
const options = (rows, value) => rows.map(([key, name]) => `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(name)}</option>`).join("");
const input = (row, key, label) => `<input class="c-cell-input" data-dim-row="${esc(row.alias)}" data-dim-field="${key}" aria-label="${esc(row.alias)} ${label}" value="${esc(row[key])}">`;
const orderSQL = `SELECT order_id AS entity_id,
  CASE WHEN pay_amount >= 100 THEN '高金额订单'
       ELSE '普通订单' END AS order_tier
FROM demo_orders
WHERE libra_id = \${libra_id}
  AND order_date BETWEEN \${start_date} AND \${end_date}`;

export function createDimensionDialog({ shell, store, persist, onCommit, canEdit, showToast }) {
  const overlay = document.createElement("div");
  overlay.className = "p-overlay c-sql-dimension-overlay";
  overlay.hidden = true;
  shell.append(overlay);
  let session;

  function close(restoreFocus = true) {
    if (!session) return;
    const focus = session.focus;
    session = undefined;
    overlay.hidden = true;
    overlay.innerHTML = "";
    overlay.className = "p-overlay c-sql-dimension-overlay";
    shell.append(overlay);
    if (![...shell.querySelectorAll(".p-overlay")].some((el) => !el.hidden)) document.body.classList.remove("p-modal-open");
    if (restoreFocus && focus?.isConnected && !focus.disabled) focus.focus({ preventScroll: true });
  }
  function assertTarget(s) {
    if (s !== session || !store.abilities.includes(s.owner) || location.hash !== s.route) throw new Error("当前能力已变化，请重新打开维度配置。");
    assertMutable(s.owner);
    if (!canEdit(s.owner)) throw new Error("当前能力不可编辑，请等待任务完成后再配置。");
    if (s.existing) {
      assertMutable(s.existing);
      const ref = s.owner.dimensions.find((ref) => ref.itemId === s.existing.id && !ref.version);
      if (!ref || s.existing.ownerAbilityId !== s.owner.id) throw new Error("当前维度已不属于此能力草稿，请重新打开。");
    }
  }
  function errors(messages) {
    overlay.querySelector("#dimension-dialog-errors").innerHTML = messages.length
      ? `<div class="p-issues" role="alert"><ul>${[...new Set(messages)].map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : "";
  }
  function ready(s) { return !s.parsing && s.draft.draft.sql === s.draft.draft.parsedSql && !s.draft.draft.parseError && s.rows.some((row) => row.selected); }
  function refreshControls() {
    if (!session) return;
    const s = session, d = s.draft.draft;
    overlay.querySelector('[data-dim-action="confirm"]').disabled = !ready(s);
    overlay.querySelector('[data-dim-action="parse"]').disabled = s.parsing || !d.sql.trim();
    overlay.querySelector("#dimension-dialog-status").textContent = s.parsing ? "正在解析 SQL…" : d.parseError ? "解析失败，请修改 SQL" : d.parsedSql !== d.sql ? "修改 SQL 后请重新解析" : `解析完成 · ${s.rows.length} 个维度值列`;
  }
  function enumTagsHTML(row) {
    return row.enumValues.map((v, index) => `<span class="c-enum-tag">${esc(v === null ? "NULL" : v)}<button type="button" data-dim-action="remove-enum" data-dim-row="${esc(row.alias)}" data-index="${index}" aria-label="移除 ${esc(row.alias)} 枚举 ${esc(v)}">×</button></span>`).join("");
  }
  function refreshEnums(row) {
    const el = [...overlay.querySelectorAll('[data-dim-field="enum-input"]')].find((el) => el.dataset.dimRow === row.alias);
    if (!el) return;
    el.parentElement.querySelectorAll(".c-enum-tag").forEach((tag) => tag.remove());
    el.insertAdjacentHTML("beforebegin", enumTagsHTML(row));
  }
  function rowHTML(row) {
    return `<tr class="${row.selected ? "" : "c-dim-row-unselected"}"><td><input type="checkbox" data-dim-row="${esc(row.alias)}" data-dim-field="selected" aria-label="添加 ${esc(row.alias)} 维度" ${row.selected ? "checked" : ""}></td><td>${input(row, "name", "维度名")}<small>SQL 值列：${esc(row.alias)}</small></td><td>${input(row, "key", "维度 Key")}</td><td><div class="c-enum-box">${enumTagsHTML(row)}<input data-dim-row="${esc(row.alias)}" data-dim-field="enum-input" aria-label="${esc(row.alias)} 添加枚举" placeholder="输入枚举，回车添加"></div></td><td><select class="c-cell-input" data-dim-row="${esc(row.alias)}" data-dim-field="type" aria-label="${esc(row.alias)} 原生类型">${options([["string", "字符串"], ["number", "数字"], ["unknown", "待确认"]], row.type)}</select></td></tr>`;
  }
  function refreshRows() {
    overlay.querySelector("#dimension-dialog-rows").innerHTML = session.rows.length
      ? session.rows.map(rowHTML).join("")
      : '<tr><td colspan="5" class="c-metric-empty">解析 SQL 后展示维度配置</td></tr>';
  }
  function refreshMappings() {
    const d = session.draft.draft;
    overlay.querySelector('[data-dim-model="idAlias"]').innerHTML = options([["", "请选择实体 ID 列"], ...d.fields.map((f) => [f.alias, f.alias])], d.idAlias);
    overlay.querySelector("#dimension-dialog-parameters").innerHTML = d.parameters.length ? `<details class="c-parameter-bindings" ${d.parameters.some((p) => !p.source) ? "open" : ""}><summary>上下文入参绑定</summary>${d.parameters.map((p, index) => `<div class="p-binding-row"><code>\${${esc(p.name)}}</code><select class="c-cell-input" data-dim-param="${index}" data-dim-field="expectedType" aria-label="${esc(p.name)} 参数类型">${options([["number", "数字"], ["string", "字符串"], ["date", "日期"], ["number_list", "数字列表"]], p.expectedType)}</select><select class="c-cell-input" data-dim-param="${index}" data-dim-field="source" aria-label="${esc(p.name)} 参数来源">${options([["", "请选择来源"], ...parameterCatalog.map((p) => [p.key, p.name])], p.source)}</select></div>`).join("")}</details>` : "";
  }
  function rebuildRows(s, oldRows = s.rows) {
    const d = s.draft.draft, existing = s.existing?.draft;
    s.rows = d.fields.filter((f) => f.alias !== d.idAlias && !["user_id", "order_id", "entity_id", "app_id", "date", "group_id", "group_name", "is_control"].includes(f.alias)).map((f) => {
      const old = oldRows.find((row) => row.alias === f.alias), sample = d.parseSample?.find((v) => v.alias === f.alias);
      const current = existing?.valueAlias === f.alias;
      return {
        alias: f.alias, key: current ? existing.dimensionKey : f.alias,
        name: current ? existing.dimensionName : f.name === f.alias ? f.alias === "spend_tier" ? "自定义消费分层" : f.alias : f.name,
        type: current ? existing.valueType : sample?.type || f.type,
        enumValues: clone(current ? existing.enumValues || [] : sample?.values || []),
        selected: s.existing ? current : true, ...old
      };
    });
  }
  async function parse() {
    const s = session;
    if (!s || s.parsing) return;
    try {
      assertTarget(s); errors([]);
      s.parsing = true; refreshControls();
      const result = await parseItem(s.draft);
      if (s !== session) return;
      if (result.stale) return;
      rebuildRows(s);
      refreshRows(); refreshMappings();
      if (!s.rows.length) errors(["SQL 需要输出实体 ID 和至少一个维度值列。"]);
    } catch (error) { if (s === session) errors([error.message]); }
    finally { if (s === session) { s.parsing = false; refreshControls(); } }
  }
  function buildItems(s) {
    const selected = s.rows.filter((row) => row.selected), messages = [], results = [];
    if (!ready(s)) throw new Error("请解析当前 SQL，并选择需要添加的维度。");
    if (s.existing && selected.length !== 1) throw new Error("编辑维度时请选择一个实际值列。");
    const used = s.owner.dimensions.filter((ref) => ref.itemId !== s.existing?.id).map((ref) => resolveItem(store, ref).draft.dimensionKey);
    const metricKeys = s.owner.metrics.flatMap((ref) => {
      const source = resolveItem(store, ref);
      return [...source.draft.fields, ...metricFields(source)].flatMap((f) => [f.key, f.alias]);
    });
    for (const row of selected) {
      const item = s.existing ? clone(s.existing) : newItem("dimension", s.owner.id);
      item.name = row.name.trim();
      item.description = s.existing ? s.draft.description : `${item.name}，按${entities[s.draft.draft.entity]?.name || "实体"}关联；取值时点：${s.draft.draft.timing}。`;
      item.context = clone(s.owner.context); item.scenario = "normal";
      item.draft = clone(s.draft.draft);
      Object.assign(item.draft, {
        dimensionName: row.name.trim(), dimensionKey: row.key.trim(), valueAlias: row.alias,
        valueType: row.type, enumValues: clone(row.enumValues),
        dimensionKeyEdited: true, valueTypeEdited: true, enumEdited: true, removed: [],
        fields: item.draft.fields.map((f) => ({ ...f, review: false }))
      });
      syncDimension(item);
      messages.push(...itemIssues(item));
      if (!identifier(row.key.trim()) || used.includes(row.key.trim()) || metricKeys.includes(row.key.trim())) messages.push(`${row.name || row.alias}：维度 Key 与已有维度或指标输出冲突，请修改。`);
      if (s.owner.metrics.some((ref) => resolveItem(store, ref).draft.entity !== item.draft.entity)) messages.push(`${row.name || row.alias}：维度与当前指标的统计实体不同。`);
      used.push(row.key.trim()); results.push(item);
    }
    if (messages.length) { errors(messages); return []; }
    return results;
  }
  function confirm() {
    const s = session;
    try {
      assertTarget(s);
      const items = buildItems(s);
      if (!items.length) return;
      // Validate and prepare all definitions before changing references.
      items.forEach((item) => saveDraft(item, store));
      const oldItems = [...store.items], oldDimensions = clone(s.owner.dimensions), oldGroups = clone(s.owner.groups);
      const oldDefinition = s.existing && clone(s.existing);
      if (s.existing) {
        const previousKey = s.existing.draft.dimensionKey;
        Object.assign(s.existing, items[0]);
        s.owner.groups.forEach((g) => {
          if (!g.queryItemId && g.members.includes(s.existing.id) && g.valueFilters?.[previousKey]) {
            if (previousKey !== s.existing.draft.dimensionKey || oldDefinition.draft.valueAlias !== s.existing.draft.valueAlias || oldDefinition.draft.valueType !== s.existing.draft.valueType) delete g.valueFilters[previousKey];
          }
          if (!g.cross && g.members[0] === s.existing.id && g.name === oldDefinition.draft.dimensionName) g.name = s.existing.draft.dimensionName;
        });
      } else {
        store.items.push(...items);
        items.forEach((item) => {
          s.owner.dimensions.push({ itemId: item.id, version: 0 });
          s.owner.groups.push(completeGroup({ id: uid("drill"), name: item.draft.dimensionName, members: [item.id], cross: false }));
        });
      }
      if (!persist()) {
        store.items = oldItems; s.owner.dimensions = oldDimensions; s.owner.groups = oldGroups;
        if (s.existing) Object.assign(s.existing, oldDefinition);
        throw new Error("维度未保存，请释放本地存储后重试。");
      }
      close(); onCommit(s.owner);
      showToast(s.existing ? "维度已更新" : `已添加 ${items.length} 个自定义维度`);
    } catch (error) { if (session) errors([error.message]); }
  }
  function restore(mount, focus) {
    if (!session?.inline || !mount) return;
    if (session.route !== location.hash || !store.abilities.includes(session.owner)) { close(false); return; }
    mount.append(overlay);
    refreshControls();
    if (focus?.isConnected && overlay.contains(focus)) focus.focus({ preventScroll: true });
  }
  function open(owner, existing, mount) {
    close(false);
    const draft = existing ? clone(existing) : newItem("dimension", owner.id);
    if (!existing && owner.metrics.length) draft.draft.entity = resolveItem(store, owner.metrics[0]).draft.entity;
    if (!existing && draft.draft.entity === "order") {
      draft.draft.sql = orderSQL; draft.description = "按观测窗口内的订单支付金额定义分层。";
      draft.draft.timing = "观测窗口内的订单记录";
    }
    session = { owner, existing, draft, route: location.hash, focus: document.activeElement, rows: [], parsing: false, inline: Boolean(mount) };
    try { assertTarget(session); }
    catch (error) { close(false); throw error; }
    const d = draft.draft;
    overlay.hidden = false;
    if (mount) { overlay.className = "c-inline-dimension-editor"; mount.append(overlay); }
    else { overlay.className = "p-overlay c-sql-dimension-overlay"; document.body.classList.add("p-modal-open"); }
    overlay.innerHTML = `${mount ? "" : '<button type="button" class="p-overlay-backdrop" data-dim-action="cancel" aria-label="关闭自定义维度"></button>'}<section class="c-sql-dimension-dialog" role="${mount ? "region" : "dialog"}" ${mount ? "" : 'aria-modal="true"'} aria-label="SQL自定义维度"><header><h2>${mount ? "自定义维度 SQL 配置" : "SQL自定义维度"}</h2>${button("cancel", "×", 'aria-label="关闭自定义维度"', "link")}</header><div class="c-sql-dimension-body">
      <section class="c-dimension-dialog-sql"><h3>维度 SQL</h3><div class="c-sql-dimension-meta"><label class="p-field"><span>统计实体</span><select data-dim-model="entity" aria-label="维度统计实体">${options(Object.entries(entities).map(([key, e]) => [key, e.name]), d.entity)}</select></label><label class="p-field"><span>实体 ID 输出列</span><select data-dim-model="idAlias" aria-label="维度实体 ID 输出列"><option value="${esc(d.idAlias)}">${esc(d.idAlias)}</option></select></label><label class="p-field c-dim-timing"><span>取值时点</span><input data-dim-model="timing" aria-label="维度取值时点" value="${esc(d.timing)}"></label></div><p class="c-sql-dimension-help">SQL 每个实体输出一行 ID 和维度值；多个维度值列可分别添加。</p><div class="c-dim-sql-code"><pre class="p-line-numbers" aria-hidden="true">${d.sql.split("\n").map((_, i) => i + 1).join("\n")}</pre><textarea spellcheck="false" wrap="off" data-dim-model="sql" aria-label="维度 SQL 编辑器">${esc(d.sql)}</textarea></div><div id="dimension-dialog-parameters"></div></section>
      <section class="c-dimension-dialog-config"><header><h3>维度配置</h3>${button("parse", "一键解析配置维度", "", "primary")}</header><span id="dimension-dialog-status" role="status">解析 SQL 后确认维度</span><div id="dimension-dialog-errors" aria-live="polite"></div><div class="p-table-scroll"><table class="p-table c-dim-dialog-table"><thead><tr><th>添加</th><th>维度名</th><th>维度 Key</th><th>维度枚举值</th><th>原生类型</th></tr></thead><tbody id="dimension-dialog-rows"><tr><td colspan="5" class="c-metric-empty">解析 SQL 后展示维度配置</td></tr></tbody></table></div></section>
      </div><footer>${button("cancel", mount ? "取消编辑" : "取消")}${button("confirm", mount ? "保存维度" : "确认", "disabled", "primary")}</footer></section>`;
    overlay.querySelector('[data-dim-model="sql"]').addEventListener("scroll", (e) => {
      overlay.querySelector(".p-line-numbers").scrollTop = e.target.scrollTop;
    });
    overlay.querySelector('[data-dim-model="sql"]').focus({ preventScroll: true });
    if (existing) { rebuildRows(session); refreshRows(); refreshMappings(); refreshControls(); }
  }
  function commitEnum(el) {
    const row = session?.rows.find((r) => r.alias === el.dataset.dimRow);
    if (!row || !el.value.trim()) return;
    const values = el.value.split(/[,，\n]/).map((v) => v.trim()).filter(Boolean).map((v) => row.type === "number" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
    row.enumValues = [...new Set([...row.enumValues, ...values])];
    el.value = "";
    refreshEnums(row); refreshControls();
  }
  overlay.addEventListener("click", (e) => {
    e.stopPropagation();
    const el = e.target.closest("[data-dim-action]");
    if (!el || el.disabled) return;
    if (el.dataset.dimAction === "cancel") close();
    else if (el.dataset.dimAction === "parse") parse();
    else if (el.dataset.dimAction === "confirm") confirm();
    else if (el.dataset.dimAction === "remove-enum") {
      const row = session.rows.find((r) => r.alias === el.dataset.dimRow);
      row.enumValues.splice(Number(el.dataset.index), 1); refreshEnums(row);
    }
  });
  function change(e) {
    e.stopPropagation();
    if (!session) return;
    const el = e.target, field = el.dataset.dimField;
    if (["checkbox"].includes(el.type) || el.tagName === "SELECT") { if (e.type !== "change") return; }
    else if (e.type !== "input") return;
    const d = session.draft.draft;
    if (el.dataset.dimModel) {
      d[el.dataset.dimModel] = el.value;
      if (el.dataset.dimModel === "sql") {
        d.parseError = ""; errors([]);
        overlay.querySelector(".p-line-numbers").textContent = el.value.split("\n").map((_, i) => i + 1).join("\n");
      } else if (el.dataset.dimModel === "idAlias") { rebuildRows(session); refreshRows(); }
    } else if (el.dataset.dimParam !== undefined) d.parameters[Number(el.dataset.dimParam)][field] = el.value;
    else if (el.dataset.dimRow && field !== "enum-input") {
      const row = session.rows.find((r) => r.alias === el.dataset.dimRow);
      row[field] = field === "selected" ? el.checked : el.value;
      if (field === "selected") {
        if (session.existing && el.checked) session.rows.filter((r) => r !== row).forEach((r) => { r.selected = false; });
        refreshRows();
      }
    }
    refreshControls();
  }
  overlay.addEventListener("input", change);
  overlay.addEventListener("change", change);
  overlay.addEventListener("focusout", (e) => { if (e.target.dataset.dimField === "enum-input") commitEnum(e.target); });
  document.addEventListener("keydown", (e) => {
    if (!session || overlay.hidden) return;
    if (session.inline && !overlay.contains(document.activeElement)) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab" && !overlay.contains(document.activeElement)) {
      e.preventDefault(); e.stopPropagation();
      overlay.querySelector('[role="dialog"] button:not(:disabled)')?.focus({ preventScroll: true });
    }
  }, true);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Enter" && e.target.dataset.dimField === "enum-input") { e.preventDefault(); commitEnum(e.target); return; }
    if (e.target.dataset.dimModel === "sql" && (e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); parse(); return; }
    if (e.key !== "Tab") return;
    if (e.target.dataset.dimModel === "sql" && !e.shiftKey) {
      e.preventDefault(); e.target.setRangeText("  ", e.target.selectionStart, e.target.selectionEnd, "end");
      e.target.dispatchEvent(new Event("input", { bubbles: true })); return;
    }
    if (session.inline) return;
    const focusable = [...overlay.querySelectorAll('[role="dialog"] button:not(:disabled), [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea, [role="dialog"] summary')].filter((el) => el.getClientRects().length);
    if (e.shiftKey && document.activeElement === focusable[0]) { e.preventDefault(); focusable.at(-1)?.focus(); }
    else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0]?.focus(); }
  });
  return { open, close, restore };
}
