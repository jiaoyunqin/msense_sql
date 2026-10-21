import {
  clone, uid, hash, slots, identifier, entities, itemDefinition, resolveItem,
  itemIssues, abilityIssues, itemQuerySignature, itemReviewSignature, itemCurrentRun,
  abilityDefinition, abilitySignature, abilityQuerySignature, abilityCurrentRun,
  directQuery, outputDimensions, syncQueryGroups, completeGroup, currentActor, sourceType
} from "./composer-data.js";
import { parameterCatalog } from "./prototype-data.js";
import { sqlQuery, parseMode, normalize, analyze } from "./prototype-engine.js";
import { saveDraft } from "./composer-management.js";

const bare = (sql) => sql.trim().replace(/;\s*$/, "");
const removeSlots = (sql) => slots.reduce((text, slot) => text.replaceAll(`{{${slot}}}`, ""), sql);
const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
const now = () => new Date().toISOString();
const failures = {
  permission: "底表权限不足：本地模拟身份未获底表授权。",
  access: "平台准入不足：本地模拟身份未获取数准入。",
  result_access: "结果查看权限不足：不能读取、核对或发布本次结果。",
  failure: "模拟取数服务失败，请重新运行。",
  timeout: "模拟取数超时，本次未产出可用数据。"
};
function failScenario(scenario) { if (failures[scenario]) throw new Error(failures[scenario]); }
function failureStatus(scenario) {
  return scenario === "timeout" ? "timeout" : ["permission", "access", "result_access"].includes(scenario) ? "permission" : "failed";
}
function upstreamSQL(sql) {
  let depth = 0, state = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1];
    if (state === "line") { if (c === "\n") state = ""; continue; }
    if (state === "block") { if (c === "*" && next === "/") { state = ""; i++; } continue; }
    if (state === "quote") { if (c === "'" && next === "'") i++; else if (c === "'") state = ""; continue; }
    if (c === "'") { state = "quote"; continue; }
    if (c === "-" && next === "-") { state = "line"; i++; continue; }
    if (c === "/" && next === "*") { state = "block"; i++; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (!depth && /^SELECT\b/i.test(sql.slice(i)) && (i === 0 || /\W/.test(sql[i - 1]))) return sql.slice(0, i).trim();
  }
  return "";
}
const parseRequests = new WeakMap();
const editableFieldKeys = ["key", "name", "role", "type", "format", "precision", "unit", "nullDisplay", "description", "entity", "timing", "controlDash"];
export function syncDimension(item) {
  const d = item.draft, sample = d.parseSample?.find((f) => f.alias === d.valueAlias);
  if (!d.valueTypeEdited && sample) d.valueType = sample.type;
  if (!d.enumEdited) d.enumValues = clone(sample?.values || []);
  d.fields = d.fields.map((f) => ({
    ...f, role: f.alias === d.idAlias ? "identity" : f.alias === d.valueAlias ? "dimension" : "auxiliary",
    ...(f.alias === d.idAlias ? { name: "实体 ID", key: f.alias, description: "维度关联的唯一实体标识。" } : {}),
    ...(f.alias === d.valueAlias ? {
      key: d.dimensionKey, name: d.dimensionName, type: d.valueType,
      description: item.description, entity: entities[d.entity]?.name, timing: d.timing, nullDisplay: "NULL（原值）"
    } : {})
  }));
}
export async function parseItem(item) {
  const d = item.draft, snapshot = clone(d);
  const request = (parseRequests.get(item) || 0) + 1;
  parseRequests.set(item, request);
  const stale = () => item.draft !== d || d.sql !== snapshot.sql || parseRequests.get(item) !== request;
  const upstreamChanged = snapshot.parsedSql && upstreamSQL(snapshot.parsedSql) !== upstreamSQL(snapshot.sql);
  const mode = { ...snapshot, sql: removeSlots(snapshot.sql), revision: 1 };
  try {
    const result = await parseMode(mode);
    if (stale()) return { stale: true };
    // Reconcile only editable attributes changed while SQLite was parsing.
    // New inference metadata and its review requirement always come from the new query.
    mode.fields.forEach((field) => {
      const initial = snapshot.fields.find((f) => f.alias === field.alias);
      const live = d.fields.find((f) => f.alias === field.alias);
      if (!initial || !live) return;
      for (const key of editableFieldKeys) if (JSON.stringify(live[key]) !== JSON.stringify(initial[key])) field[key] = live[key] === undefined ? undefined : clone(live[key]);
    });
    if (upstreamChanged) {
      mode.fields.forEach((f) => { f.review = true; });
      mode.diff.forEach((f) => { f.status = "需复核"; });
    }
    if (item.kind === "dimension") {
      const ids = result.columns.filter((alias) => ["entity_id", entities[d.entity]?.column].includes(alias));
      if (!result.columns.includes(d.idAlias)) d.idAlias = ids.length === 1 ? ids[0] : "";
      const values = result.columns.filter((alias) => alias !== d.idAlias && !["date", "app_id", "group_id", "group_name", "is_control", "user_id", "order_id", "entity_id"].includes(alias));
      if (!values.includes(d.valueAlias)) {
        d.valueAlias = values.length === 1 ? values[0] : "";
        if (snapshot.fields.length) { mode.fields.forEach((f) => { f.review = true; }); }
      }
      if (!snapshot.fields.length && !d.dimensionKeyEdited && d.valueAlias) d.dimensionKey = d.valueAlias;
      d.valueCandidates = values;
      d.parseSample = result.columns.map((alias, index) => ({
        alias, type: result.types[index], values: [...new Set(result.rows.map((row) => row[index]))]
      }));
      d.sampleTruncated = result.truncated;
    } else {
      mode.fields = mode.fields.map((f) => f.alias === "avg_order_value" && f.role === "pending" && !snapshot.fields.some((old) => old.alias === f.alias)
        ? { ...f, name: "平均订单金额", role: "metric", type: "number", format: "currency", unit: "元", description: "支付金额总和 / 支付订单记录数，由 SQL 按实际粒度计算。" } : f);
      // Types offer an editable starting point, never a fixed business role.
      mode.fields = mode.fields.map((f) => f.role === "pending" && !snapshot.fields.some((old) => old.alias === f.alias)
        ? { ...f, role: f.type === "string" ? "dimension" : "metric", description: f.description || `SQL 输出：${f.source}` } : f);
    }
    mode.parameters.forEach((parameter) => {
      const initial = snapshot.parameters.find((p) => p.name === parameter.name);
      const live = d.parameters.find((p) => p.name === parameter.name);
      for (const key of ["source", "expectedType"]) if (initial && live && live[key] !== initial[key]) parameter[key] = live[key];
    });
    Object.assign(d, {
      fields: mode.fields, parameters: mode.parameters, removed: mode.removed, diff: mode.diff,
      parsedSql: snapshot.sql, parseError: ""
    });
    if (item.kind === "dimension") syncDimension(item);
    return result;
  } catch (error) {
    if (stale()) return { stale: true };
    d.parseError = error.message; throw error;
  }
}
function mergedBindings(items) {
  const bindings = new Map();
  for (const item of items) {
    const params = [...item.draft.parameters];
    for (const match of item.draft.sql.matchAll(/\$\{(\w+)\}/g)) {
      if (params.some((p) => p.name === match[1])) continue;
      const p = parameterCatalog.find((p) => p.key === match[1]);
      const listUsage = /\bIN\s*\(\s*$/i.test(item.draft.sql.slice(0, match.index)) && /^\s*\)/.test(item.draft.sql.slice(match.index + match[0].length));
      params.push({ name: match[1], source: p?.key || "", expectedType: p?.type || "", listUsage });
    }
    for (const p of params) {
      const previous = bindings.get(p.name);
      if (previous && (previous.source !== p.source || previous.expectedType !== p.expectedType))
        throw new Error(`参数 \${${p.name}} 在多个取数项中绑定冲突，请统一来源或改用不同参数名。`);
      bindings.set(p.name, clone(p));
    }
  }
  return [...bindings.values()];
}
// Read only the explicitly named CTE in the supported template contract.
// Parenthesis scanning respects SQL strings/comments; arbitrary query rewriting is not attempted.
function sourceSQL(item) {
  const sql = item.draft.sql;
  const match = /\bWITH\s+metric_source\s+AS\s*\(/i.exec(sql);
  if (!match || !new RegExp(`\\bFROM\\s+metric_source\\s+${item.draft.sourceAlias}\\b`, "i").test(sql))
    throw new Error("可下钻模板需要 WITH metric_source AS (...) 与明确的明细来源别名。");
  let depth = 1, state = "", start = match.index + match[0].length;
  for (let i = start; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1];
    if (state === "line") { if (c === "\n") state = ""; continue; }
    if (state === "block") { if (c === "*" && next === "/") { state = ""; i++; } continue; }
    if (state === "quote") { if (c === "'" && next === "'") i++; else if (c === "'") state = ""; continue; }
    if (c === "'") { state = "quote"; continue; }
    if (c === "-" && next === "-") { state = "line"; i++; continue; }
    if (c === "/" && next === "*") { state = "block"; i++; continue; }
    if (c === "(") depth++;
    if (c === ")" && --depth === 0) return sql.slice(start, i);
  }
  throw new Error("metric_source 明细来源未闭合。");
}
export function compileMode(metric, dimensions = [], selectedKeys, group) {
  const d = metric.draft;
  if (directQuery(metric)) {
    if (dimensions.length) throw new Error("完整 SQL 按已声明的维度取数；其他下钻请提供对应 SQL。");
    const dims = outputDimensions(metric), members = dims.map((f) => f.key);
    const keys = selectedKeys || d.fields.filter((f) => f.role === "metric").map((f) => f.key);
    return {
      id: `${metric.id}__${group?.id || (members.length ? "query" : "overall")}`,
      name: `${group?.name || (dims.length ? dims.map((f) => f.name).join(" × ") : "整体")} · ${metric.name}`,
      key: group?.key || metric.key, description: group?.description || metric.description,
      sql: d.sql, parsedSql: d.sql, parseError: "", removed: [], diff: [], revision: 1, runs: [],
      kind: members.length > 1 ? "cross" : members.length ? "single" : "overall", members,
      fields: clone(d.fields.filter((f) => f.role !== "metric" || keys.includes(f.key))),
      parameters: mergedBindings([metric]), sourceDefinitions: clone([metric])
    };
  }
  if (dimensions.length) {
    for (const slot of slots) if (d.sql.split(`{{${slot}}}`).length !== 2)
      throw new Error(`下钻要求模板位置 {{${slot}}} 出现一次。`);
    sourceSQL(metric);
  }
  const select = [], joins = [], groups = [], fields = clone(d.fields);
  for (let i = 0; i < dimensions.length; i++) {
    const dimension = dimensions[i], dd = dimension.draft, alias = `__dimension_${i}`;
    if (![dd.dimensionKey, dd.idAlias, dd.valueAlias, d.sourceAlias, d.entityColumn].every(identifier))
      throw new Error("维度关联字段须使用有效标识。");
    if (fields.some((f) => f.key === dd.dimensionKey || f.alias === dd.dimensionKey))
      throw new Error(`维度 ${dd.dimensionKey} 与指标输出冲突。`);
    if (dd.entity !== d.entity) throw new Error("指标与维度的统计实体不同，不能自动关联。");
    select.push(`, ${alias}.${dd.valueAlias} AS ${dd.dimensionKey}`);
    joins.push(`LEFT JOIN (${bare(dd.sql)}) ${alias} ON ${d.sourceAlias}.${d.entityColumn} = ${alias}.${dd.idAlias}`);
    groups.push(`, ${alias}.${dd.valueAlias}`);
    fields.push({
      alias: dd.dimensionKey, key: dd.dimensionKey, name: dd.dimensionName, role: "dimension",
      type: dd.valueType, entity: entities[dd.entity].name, timing: dd.timing, description: dimension.description,
      nullDisplay: "NULL（原值）", review: false
    });
  }
  let sql = d.sql.replaceAll("{{dimension_select}}", select.join("\n  "))
    .replaceAll("{{dimension_join}}", joins.join("\n")).replaceAll("{{dimension_group}}", groups.join(""));
  if (/\{\{/.test(sql)) throw new Error("存在无法识别的 SQL 模板位置。");
  const keys = selectedKeys || fields.filter((f) => f.role === "metric").map((f) => f.key);
  const kind = dimensions.length > 1 ? "cross" : dimensions.length ? "single" : "overall";
  return {
    id: `${metric.id}__${group?.id || "overall"}`, name: `${group?.name || "整体"} · ${metric.name}`,
    sql, parsedSql: sql, parseError: "", removed: [], diff: [], revision: 1, runs: [],
    kind, key: group?.key || metric.key, description: group?.description || "",
    members: dimensions.map((dim) => dim.draft.dimensionKey),
    fields: fields.filter((f) => f.role !== "metric" || keys.includes(f.key)),
    parameters: mergedBindings([metric, ...dimensions]), sourceDefinitions: clone([metric, ...dimensions])
  };
}
export function abilityModes(store, ability) {
  const definition = ability.metrics.some((ref) => ref.definition) ? clone(ability) : abilityDefinition(store, ability), modes = [];
  const groups = [...(definition.includeOverall ? [{ id: "overall", name: "整体", members: [] }] : []), ...definition.groups.filter((g) => !g.queryItemId)];
  for (const ref of definition.metrics.filter((r) => r.metricKeys.length)) {
    if (directQuery(ref.definition)) {
      const dims = outputDimensions(ref.definition);
      const group = dims.length ? definition.groups.find((g) => g.queryItemId === ref.itemId) : undefined;
      if (dims.length && !group) throw new Error(`${ref.definition.name}：需要确认实际维度输出。`);
      if (group || definition.includeOverall) modes.push(compileMode(ref.definition, [], ref.metricKeys, group));
    } else {
      for (const group of groups) {
        const dimensions = group.members.map((id) => definition.dimensions.find((r) => r.itemId === id)?.definition);
        if (dimensions.some((d) => !d)) throw new Error(`${group.name}：维度来源缺失。`);
        modes.push(compileMode(ref.definition, dimensions, ref.metricKeys, group));
      }
    }
  }
  if (!modes.length) throw new Error("本次没有已配置的取数任务。");
  return modes;
}
export function validateDimension(result, item) {
  if (result.truncated) throw new Error("维度超过 500 行本地上限，不能用截断映射关联。");
  const d = item.draft, idIndex = result.columns.indexOf(d.idAlias), valueIndex = result.columns.indexOf(d.valueAlias);
  if (idIndex < 0 || valueIndex < 0) throw new Error("维度缺少声明的实体 ID 列或值列。");
  const seen = new Set(), idTypes = new Set();
  for (const row of result.rows) {
    const id = row[idIndex], value = row[valueIndex];
    if (id === null || id === "") throw new Error("维度实体 ID 不能为空。");
    if (seen.has(JSON.stringify(id))) throw new Error("维度实体 ID 重复，关联会放大指标；请修正 SQL 为一个实体一个取值。");
    seen.add(JSON.stringify(id)); idTypes.add(typeof id);
    if (value !== null && typeof value !== d.valueType) throw new Error("维度值的 SQL 原生类型与声明不符；声明不会转换 SQL 值。");
  }
  if (idTypes.size > 1) throw new Error("维度实体 ID 存在混合类型。");
  return {
    rawRows: result.rows.map((values) => Object.fromEntries(result.columns.map((key, i) => [key, values[i]]))),
    fields: [
      { alias: d.idAlias, key: d.idAlias, name: `${entities[d.entity].name} ID`, role: "identity", type: [...idTypes][0] || "unknown" },
      { alias: d.valueAlias, key: d.dimensionKey, name: d.dimensionName, role: "dimension", type: d.valueType, nullDisplay: "NULL（原值）" }
    ], renderedSql: result.rendered, distinctValues: [...new Set(result.rows.map((r) => r[valueIndex]))]
  };
}
async function verifyAssociations(metric, dimensions, context) {
  if (!dimensions.length) return [];
  const checks = [], source = sourceSQL(metric), md = metric.draft;
  for (const dimension of dimensions) {
    const dd = dimension.draft, bindings = mergedBindings([metric, dimension]);
    const result = await sqlQuery({ sql: dd.sql, bindings, context });
    validateDimension(result, dimension);
    const checkSQL = `WITH metric_source AS (${source})
SELECT COUNT(*) AS missing_count FROM metric_source ${md.sourceAlias}
LEFT JOIN (${bare(dd.sql)}) __check ON ${md.sourceAlias}.${md.entityColumn} = __check.${dd.idAlias}
WHERE __check.${dd.idAlias} IS NULL OR ${md.sourceAlias}.${md.entityColumn} IS NULL
  OR typeof(${md.sourceAlias}.${md.entityColumn}) <> typeof(__check.${dd.idAlias})`;
    const coverage = await sqlQuery({ sql: checkSQL, bindings, context });
    const missing = coverage.rows[0][0];
    if (missing) throw new Error(`${dimension.name}：${missing} 条明细的关联实体缺失或类型不符；未将缺失映射为合法 NULL。`);
    checks.push({ dimension: dimension.name, entities: result.rows.length, missing, sql: coverage.rendered });
  }
  return checks;
}
function alterResult(result, mode, scenario) {
  if (scenario === "missing") { result.columns.pop(); result.rows.forEach((r) => r.pop()); }
  if (scenario === "type" && result.rows.length) result.rows[0][result.columns.indexOf(mode.fields.find((f) => f.role === "metric").alias)] = "非法数值";
  if (scenario === "grain" && result.rows.length) result.rows.push([...result.rows[0]]);
  if (scenario === "no_control") result.rows = result.rows.filter((r) => r[result.columns.indexOf("is_control")] !== 1);
}
export async function runItem(item, context, scenario = "normal", changed = () => {}) {
  if (!item.key && sourceType(item) === "custom_sql" && !item.archived) saveDraft(item);
  const snapshot = itemDefinition(item);
  const record = { id: uid("itemrun"), status: "running", startedAt: now(), snapshot, context: clone(context), scenario,
    querySignature: itemQuerySignature(item, context), approvedFor: "", error: "" };
  item.runs.unshift(record); changed(); await pause();
  try {
    const issues = itemIssues(snapshot);
    if (issues.length) throw new Error(issues.join(" "));
    failScenario(scenario);
    const effectiveContext = scenario === "empty" ? { ...record.context, libra_id: "0" } : record.context;
    if (snapshot.kind === "dimension") {
      const result = await sqlQuery({ sql: scenario === "empty" ? `SELECT * FROM (${bare(snapshot.draft.sql)}) WHERE 0` : snapshot.draft.sql, bindings: snapshot.draft.parameters, context: effectiveContext });
      Object.assign(record, validateDimension(result, snapshot));
    } else {
      const mode = compileMode(snapshot);
      const result = await sqlQuery({ sql: mode.sql, bindings: mode.parameters, context: effectiveContext });
      alterResult(result, mode, scenario);
      Object.assign(record, normalize(result, mode, record.id, record.context), { renderedSql: result.rendered });
    }
    record.status = record.rawRows.length ? "success" : "empty";
  } catch (error) { record.status = failureStatus(scenario); record.error = error.message; }
  record.finishedAt = now(); changed(); return record;
}
export function itemPublishIssues(item, context, scenario = "normal") {
  const issues = itemIssues(item), run = itemCurrentRun(item, context);
  if (!item.key) issues.push("请先保存 SQL，系统将自动生成 Key。");
  if (scenario !== "normal" || run?.scenario !== "normal") issues.push("恢复正常场景并重新运行后发布。");
  if (!run) issues.push("当前 SQL 与配置需要有结构合格且非空的独立运行。");
  else if (run.approvedFor !== itemReviewSignature(item, context)) issues.push("请核对当前输出定义和运行结果。");
  return issues;
}
export function publishItem(item, context, scenario) {
  if (sourceType(item) !== "custom_sql" || item.archived) throw new Error("只有未归档的自定义 SQL 可以发布。");
  const issues = itemPublishIssues(item, context, scenario);
  if (issues.length) throw new Error(issues.join(" "));
  const version = { number: item.versions.length + 1, publishedAt: now(), operator: currentActor, operation: "发布 SQL", definition: itemDefinition(item), runId: itemCurrentRun(item, context).id };
  item.versions.push(version); item.keyLocked = true; return version;
}
export function attachItem(store, item, ability, number) {
  if (item.archived || ability.archived) throw new Error("已归档对象不能新增关联。");
  if (!number && item.ownerAbilityId && item.ownerAbilityId !== ability.id) throw new Error("能力内草稿需先独立发布，才能被其他能力组复用。");
  if (number && !item.versions.some((v) => v.number === number)) throw new Error("需要选择已发布的取数项版本。");
  const collection = item.kind === "metric" ? ability.metrics : ability.dimensions;
  if (collection.some((r) => r.itemId === item.id)) throw new Error("目标能力已包含该取数项；请在能力中显式切换引用版本。");
  const definition = number ? item.versions.find((v) => v.number === number).definition : itemDefinition(item);
  if (!number) item.ownerAbilityId = ability.id;
  collection.push({ itemId: item.id, version: number, ...(item.kind === "metric" ? {
    metricKeys: definition.draft.fields.filter((f) => f.role === "metric").map((f) => f.key)
  } : {}) });
  if (item.kind === "dimension") ability.groups.push(completeGroup({ id: uid("drill"), name: definition.draft.dimensionName, cross: false, members: [item.id] }));
  syncQueryGroups(store, ability);
  return ability;
}
export async function runAbility(store, ability, changed = () => {}) {
  if (!ability.archived && sourceType(ability) === "custom_sql" && (!ability.key || [...ability.metrics, ...ability.dimensions].some((ref) => !ref.version && !store.items.find((item) => item.id === ref.itemId)?.key))) saveDraft(ability, store);
  syncQueryGroups(store, ability);
  const record = { id: uid("abilityrun"), startedAt: now(), status: "running", signature: abilityQuerySignature(store, ability),
    context: clone(ability.context), scenario: ability.scenario, records: [], modes: [], approvedFor: "", error: "" };
  const validation = abilityIssues(store, ability);
  if (!validation.length) record.definition = abilityDefinition(store, ability);
  ability.runs.unshift(record); changed(); await pause();
  try {
    if (validation.length) throw new Error(validation.join(" "));
    const definition = record.definition;
    failScenario(record.scenario);
    const context = record.scenario === "empty" ? { ...record.context, libra_id: "0" } : record.context;
    for (const mode of abilityModes(store, definition)) {
        const entry = { id: uid("dataset"), modeId: mode.id, modeName: mode.name, snapshot: clone(mode), status: "running", context: clone(record.context), checks: [] };
        record.records.push(entry); record.modes.push(mode); changed();
        entry.checks = await verifyAssociations(mode.sourceDefinitions[0], mode.sourceDefinitions.slice(1), context);
        const result = await sqlQuery({ sql: mode.sql, bindings: mode.parameters, context });
        alterResult(result, mode, record.scenario);
        Object.assign(entry, normalize(result, mode, entry.id, record.context), { renderedSql: result.rendered });
        entry.status = entry.rawRows.length ? "success" : "empty"; changed();
    }
    record.status = record.records.every((r) => r.status === "success") ? "success" : "empty";
  } catch (error) {
    record.status = failureStatus(record.scenario); record.error = error.message;
    record.records.filter((r) => r.status === "running").forEach((r) => { r.status = record.status; r.error = record.error; });
  }
  record.finishedAt = now(); changed(); return record;
}
export function abilityPublishIssues(store, ability) {
  syncQueryGroups(store, ability);
  const issues = abilityIssues(store, ability), run = abilityCurrentRun(store, ability);
  if (!ability.key) issues.push("请先保存能力，系统将自动生成 Key。");
  if (ability.archived) issues.push("已归档能力不能发布新版本。");
  if (ability.scenario !== "normal") issues.push("恢复正常场景并重新整体试跑后发布。");
  if (!run) issues.push("当前能力的全部整体与下钻组合需要完成非空试跑。");
  else if (run.approvedFor !== abilitySignature(store, ability)) issues.push("请核对当前能力的全部取数结果。");
  return issues;
}
export function publishAbility(store, ability) {
  const issues = abilityPublishIssues(store, ability);
  if (issues.length) throw new Error(issues.join(" "));
  const run = abilityCurrentRun(store, ability);
  const definition = abilityDefinition(store, ability);
  const modes = abilityModes(store, ability);
  const version = {
    number: ability.versions.length + 1, abilityId: ability.id, name: ability.name,
    publishedAt: now(), operator: currentActor, operation: "发布取数能力", definition, modes, runId: run.id
  };
  ability.versions.push(version); ability.keyLocked = true; return version;
}
export function useVersion(store, ability, number) {
  const version = ability.versions.find((v) => v.number === number);
  if (!version) throw new Error("能力版本不存在。");
  const m = store.analysis;
  if (ability.archived && (m.capabilityId !== ability.id || m.version !== number)) throw new Error("已归档能力不能新增分析引用。");
  if (m.capabilityId !== ability.id || m.version !== number) {
    m.selections = Object.fromEntries(version.modes.map((mode) => [mode.id, mode.fields.filter((f) => f.role === "metric").map((f) => f.key)]));
  }
  m.capabilityId = ability.id; m.version = number;
}
export async function runAnalysis(store, changed = () => {}) {
  const module = clone(store.analysis), attempts = store.analysis.attempts;
  module.attempts = attempts;
  const version = store.abilities.find((a) => a.id === module.capabilityId)?.versions.find((v) => v.number === module.version);
  if (!version) throw new Error("先选择已发布的固定能力版本。");
  // Every association is rechecked for the new observation window before consuming compiled SQL.
  let checks;
  try {
    checks = await Promise.all(version.modes.filter((m) => module.selections[m.id]?.length).map((mode) =>
      verifyAssociations(mode.sourceDefinitions[0], mode.sourceDefinitions.slice(1), module.context)));
  } catch (error) {
    const snapshot = clone(module); delete snapshot.attempts;
    const attempt = { id: uid("analysis"), startedAt: now(), finishedAt: now(), status: "insufficient", snapshot,
      version: version.number, capabilityName: version.name, records: [], evidence: [], gaps: [error.message], error: error.message };
    attempts.unshift(attempt); changed(); return attempt;
  }
  const attempt = await analyze(module, version, changed);
  attempt.associationChecks = checks;
  changed(); return attempt;
}
