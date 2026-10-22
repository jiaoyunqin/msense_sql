import { clone, uid, hash, definitions, defaultContext, parameterCatalog } from "./prototype-data.js";
import { metricFields, metricIssues, metricQueryConfig } from "./composer-metrics.js";
import demoFixture from "./composer-demo.json";

export { clone, uid, hash, defaultContext };
export const COMPOSER_KEY = "msense-composer-v2";
export const identifier = (value) => /^[a-zA-Z_]\w*$/.test(value || "");
export const slots = ["dimension_select", "dimension_join", "dimension_group"];
export const currentActor = "sheriqin.01";
export const businessGoal = "平台老客提频";
export const businessGoalOptions = [[businessGoal, "老客提频"]];
export const businessGoals = businessGoalOptions.map(([value]) => value);
// Older fixture snapshots predate source metadata; keep their known RPC origin.
export const sourceType = (obj) => obj.id === "preset-summary-only" ? "builtin_rpc" : obj.sourceType || (obj.unavailable ? "builtin_rpc" : obj.preset ? "builtin_sql" : "custom_sql");
export const isCreator = (obj, actor = currentActor) => Boolean(obj?.createdBy && obj.createdBy === actor);
export const canEditDefinition = (obj, actor = currentActor) => Boolean(obj && sourceType(obj) !== "builtin_rpc"
  && isCreator(obj, actor) && !obj.readOnly && !obj.readonly && !Object.isFrozen(obj));
export const canViewHistory = (obj, actor = currentActor) => Boolean(obj && sourceType(obj) !== "builtin_rpc" && isCreator(obj, actor));
export const outputDimensions = (item) => item.draft.fields.filter((f) => f.role === "dimension");
export const MAX_CROSS_DIMENSIONS = 3;
export const crossDimensionKeys = (cross) => [...(cross.dimensionKeys || [cross.leftDimensionKey, cross.rightDimensionKey].filter(Boolean))];
export const directQuery = (item) => item.kind === "metric" && !hasDrillSlots(item);
export const activeGroups = (ability) => ability.groups.filter((g) => g.enabled !== false && (!g.queryItemId || ability.metrics.some((r) => r.itemId === g.queryItemId && r.metricKeys.length)));
export const showsOverall = (ability) => ability.showOverall ?? true;
export const builtinDimensionOwners = { "preset-spend": ["preset-payment", "preset-redemption"] };
export const dimensionCategory = (item) => builtinDimensionOwners[item.id] ? "builtin" : sourceType(item) === "custom_sql" ? "custom" : "public";
export const dimensionCategoryLabels = { builtin: "指标内置", public: "公共维度", custom: "自定义 SQL" };
export const knownDimensionValues = {
  "preset-spend": ["高消费力", "中消费力", "低消费力"],
  "preset-lifecycle": ["新客", "成熟老客"],
  "preset-city": [100, 101, 102]
};
export const entities = { user: { name: "用户", column: "user_id" }, order: { name: "订单", column: "order_id" } };
export const dimensionSQL = {
  spend_tier: `SELECT user_id AS entity_id,
  CASE WHEN historical_spend >= 500 THEN '高消费力'
       WHEN historical_spend >= 200 THEN '中消费力'
       ELSE '低消费力' END AS dimension_value
FROM demo_users`,
  lifecycle: "SELECT user_id AS entity_id, lifecycle AS dimension_value\nFROM demo_users",
  city_id: "SELECT user_id AS entity_id, city_id AS dimension_value\nFROM demo_users"
};

export function metricSQL(projection = "SUM(s.pay_amount) AS gmv,\n  COUNT(*) AS order_count,\n  SUM(s.pay_amount) / NULLIF(COUNT(*), 0) AS avg_order_value") {
  return `WITH metric_source AS (
  SELECT * FROM demo_orders
  WHERE libra_id = \${libra_id}
    AND order_date BETWEEN \${start_date} AND \${end_date}
    AND coupon_meta_id IN (\${coupon_meta_ids})
)
SELECT s.group_id AS group_id,
  s.group_name AS group_name,
  s.is_control AS is_control,
  ${projection}
  {{dimension_select}}
FROM metric_source s
{{dimension_join}}
GROUP BY s.group_id, s.group_name, s.is_control
{{dimension_group}}
ORDER BY s.is_control DESC`;
}

function field(alias, extra = {}) {
  return {
    alias, key: alias, name: alias, type: "number", role: "metric", description: "",
    format: "decimal", precision: 2, unit: "", nullDisplay: "—", review: false,
    ...(definitions[alias] || {}), ...extra
  };
}
export function newItem(kind = "metric", ownerAbilityId = "") {
  const isDimension = kind === "dimension";
  return {
    id: uid("item"), key: "", name: isDimension ? "自定义消费分层" : "自定义订单表现",
    description: isDimension ? "按用户历史消费金额定义分层，取自实验前示例用户快照。" : "观察支付表现；指标由 SQL 直接计算。",
    kind, ownerAbilityId, preset: false, sourceType: "custom_sql", createdBy: currentActor,
    keyLocked: false, savedAt: "", versions: [], runs: [],
    draft: {
      sql: isDimension ? dimensionSQL.spend_tier.replace("AS dimension_value", "AS spend_tier") : metricSQL(),
      entity: "user", entityColumn: "user_id", sourceAlias: "s",
      dimensionKey: uid("user_segment"), dimensionName: "自定义消费分层",
      idAlias: "entity_id", valueAlias: "dimension_value", valueType: "string",
      timing: "首次进入实验前的用户快照", fields: [], parameters: [],
      parsedSql: "", parseError: "", removed: [], diff: [], autoParse: true,
      dimensionKeyEdited: false, valueTypeEdited: false, enumEdited: false, enumValues: []
    }
  };
}

export function itemDefinition(item) {
  return clone({
    id: item.id, key: item.key, name: item.name, description: item.description,
    kind: item.kind, preset: item.preset, sourceType: sourceType(item), unavailable: item.unavailable || "",
    draft: item.draft
  });
}
export function resolveItem(store, reference) {
  const item = store.items.find((candidate) => candidate.id === reference?.itemId);
  if (!item) throw new Error("取数项引用已不存在。");
  if (!reference.version) return itemDefinition(item);
  const version = item.versions.find((candidate) => candidate.number === reference.version);
  if (!version) throw new Error(`${item.name} 的 v${reference.version} 不存在。`);
  return clone(version.definition);
}
export function referenceLabel(store, reference) {
  try {
    const item = resolveItem(store, reference);
    return `${item.name} · ${reference.version ? `v${reference.version}` : "能力内草稿"}`;
  } catch (error) { return error.message; }
}
export function makeReference(item, version = item.versions.at(-1)?.number || 0) {
  return { itemId: item.id, version };
}

function preset(kind, id, name, sql, options = {}) {
  const item = newItem(kind);
  Object.assign(item, { id, key: id.replaceAll("-", "_"), name, description: options.description || name, preset: true, sourceType: "builtin_sql", createdBy: "msense.system", keyLocked: true });
  Object.assign(item.draft, { sql, parsedSql: sql, ...options });
  if (kind === "metric") {
    item.draft.fields = ["group_id", "group_name", "is_control", ...options.metrics].map((alias) => field(alias,
      alias === "user_count" ? { name: "支付用户数", format: "integer", description: "观察窗口内去重支付用户数，SQL 在实际粒度计算。" } : {}));
  } else {
    item.draft.fields = [
      field("entity_id", { name: "用户标识", role: "identity", type: "string", description: "维度关联的唯一用户标识。" }),
      field("dimension_value", { key: item.draft.dimensionKey, name: item.draft.dimensionName, role: "dimension", type: item.draft.valueType, description: item.description })
    ];
  }
  item.versions = [{ number: 1, publishedAt: "2026-10-21T00:00:00.000Z", definition: itemDefinition(item), fixture: true }];
  return item;
}
export function presetItems() {
  return [
    preset("metric", "preset-payment", "支付核心指标", metricSQL("SUM(s.pay_amount) AS gmv,\n  COUNT(*) AS order_count,\n  COUNT(DISTINCT s.user_id) AS user_count"),
      { metrics: ["gmv", "order_count", "user_count"], description: "本地预设 SQL；使用生成的订单底表，支持按用户或订单实体下钻。" }),
    preset("metric", "preset-redemption", "订单核销指标", metricSQL("SUM(s.redeemed) AS redeemed_count,\n  1.0 * SUM(s.redeemed) / NULLIF(COUNT(*), 0) AS redemption_rate"),
      { metrics: ["redeemed_count", "redemption_rate"], description: "本地示例订单核销口径，不等于原静态目录的券张数核销率。" }),
    preset("dimension", "preset-spend", "消费力", dimensionSQL.spend_tier,
      { dimensionKey: "spend_tier", dimensionName: "消费力", description: definitions.spend_tier.description }),
    preset("dimension", "preset-lifecycle", "用户生命周期", dimensionSQL.lifecycle,
      { dimensionKey: "lifecycle", dimensionName: "生命周期", description: definitions.lifecycle.description }),
    preset("dimension", "preset-city", "城市 ID", dimensionSQL.city_id,
      { dimensionKey: "city_id", dimensionName: "城市 ID", valueType: "number", description: definitions.city_id.description }),
    { ...preset("metric", "preset-summary-only", "仅汇总 RPC 指标", "SELECT 1 AS unavailable", { metrics: [] }), sourceType: "builtin_rpc",
      unavailable: "仅有组别汇总，没有明细来源或可下钻执行器；不能附加 SQL 维度后生成下钻。" }
  ];
}
export function newAbility(name = "未命名取数能力") {
  return {
    id: uid("ability"), key: "", keyLocked: false, name,
    goal: businessGoal, description: "", sourceType: "custom_sql", createdBy: currentActor,
    metrics: [], dimensions: [], groups: [], includeOverall: true, showOverall: true,
    singleSqlFlow: false, sqlItemId: "", crossDimensions: [], parseStatus: "idle",
    context: clone(defaultContext), scenario: "normal", savedAt: "", runs: [], versions: []
  };
}
function initialStore() {
  const items = presetItems();
  return {
    schema: 2, items, abilities: [],
    analysis: {
      name: "优惠券效果分析", description: "核对支付与订单核销表现。", goal: "平台老客提频",
      capabilityId: "", version: 0, selections: {}, reasoning: "比较所选指标和实际分层数据，不判断显著性或因果。",
      considerations: "只消费本次 SQL 的实际输出；保留订单口径与维度取值时点。",
      context: clone(defaultContext), scenario: "normal", savedAt: "", attempts: []
    }
  };
}
function addPublishedDemo(store) {
  if (store.demoSeedRevision === demoFixture.revision) return store;
  for (const item of demoFixture.items) if (!store.items.some((existing) => existing.id === item.id)) store.items.push(clone(item));
  if (!store.abilities.some((existing) => existing.id === demoFixture.ability.id)) store.abilities.push(clone(demoFixture.ability));
  if (!store.analysis.capabilityId) {
    const oldAttempts = store.analysis.attempts;
    store.analysis = clone(demoFixture.analysis);
    store.analysis.attempts.push(...oldAttempts.filter((a) => !store.analysis.attempts.some((existing) => existing.id === a.id)));
  } else if (!store.analysis.attempts.some((a) => a.id === "demo-sql-analysis")) {
    store.analysis.attempts.push(clone(demoFixture.analysis.attempts[0]));
  }
  store.demoSeedRevision = demoFixture.revision;
  return store;
}
export function loadComposer() {
  let store;
  try {
    const saved = JSON.parse(localStorage.getItem(COMPOSER_KEY));
    if (saved?.schema === 2 && Array.isArray(saved.items) && Array.isArray(saved.abilities)) {
      for (const item of saved.items) {
        const d = item.draft;
        d.autoParse ??= true;
        d.dimensionKeyEdited ??= Boolean(d.fields.length);
        d.valueTypeEdited ??= Boolean(d.fields.length);
        d.enumEdited ??= false;
        d.enumValues ??= [];
      }
      store = saved;
    }
  } catch { /* Storage failure must not make the page unusable. */ }
  store = addPublishedDemo(store || initialStore());
  for (const obj of [...store.items, ...store.abilities]) {
    obj.sourceType ||= obj.unavailable ? "builtin_rpc" : obj.preset ? "builtin_sql" : "custom_sql";
    delete obj.archived;
    // Existing browser-owned drafts belong to the current author. Built-in
    // definitions without creator metadata never grant editing by default.
    obj.createdBy ||= obj.versions[0]?.definition?.createdBy || obj.versions[0]?.operator
      || (sourceType(obj) === "custom_sql" ? currentActor : "msense.system");
    obj.keyLocked ||= Boolean(obj.savedAt || obj.versions.length);
    // Earlier builds allocated editable keys on creation. Unsaved drafts have
    // no public system key; saved keys and immutable published snapshots stay.
    if (!obj.savedAt && !obj.versions.length) { obj.key = ""; obj.keyLocked = false; }
    obj.updatedAt ||= obj.savedAt || obj.versions.at(-1)?.publishedAt || "";
  }
  for (const ability of store.abilities) {
    delete ability.owner;
    if (ability.goal == null) ability.goal = businessGoal;
    ability.crossDimensions ||= [];
    ability.parseStatus ||= "idle";
    for (const group of ability.groups) completeGroup(group);
    syncQueryGroups(store, ability);
  }
  store.analysis.goal = businessGoal;
  store.retrievalConfigs ||= [];
  store.presetDrafts ||= {};
  return store;
}
export function hasDrillSlots(item) {
  return slots.every((slot) => item.draft.sql.includes(`{{${slot}}}`));
}
export function completeGroup(group) {
  group.key ||= `drill_${group.id.replace(/\W/g, "_")}`;
  group.description ??= "";
  return group;
}
// A full query owns its actual output grain. Register that grain once rather
// than applying the same aggregate query to unrelated mapping-based groups.
export function syncQueryGroups(store, ability) {
  if (ability.singleSqlFlow) {
    ability.dimensions = [];
    ability.groups = [];
    return;
  }
  const live = new Set();
  for (const ref of ability.metrics) {
    let query;
    try { query = resolveItem(store, ref); } catch { continue; }
    if (!directQuery(query)) continue;
    const dims = outputDimensions(query);
    if (!dims.length) continue;
    live.add(query.id);
    let group = ability.groups.find((g) => g.queryItemId === query.id);
    if (!group) {
      group = completeGroup({ id: uid("drill"), queryItemId: query.id, name: dims.map((f) => f.name).join(" × "), members: [], cross: false });
      ability.groups.push(group);
    }
    group.members = dims.map((f) => f.key);
    group.cross = dims.length > 1;
  }
  ability.groups = ability.groups.filter((g) => !g.queryItemId || live.has(g.queryItemId));
}
export function itemQuerySignature(item, context) {
  const d = item.draft;
  return hash({
    sql: d.sql, parameters: d.parameters, entity: d.entity, entityColumn: d.entityColumn, sourceAlias: d.sourceAlias,
    dimensionKey: d.dimensionKey, idAlias: d.idAlias, valueAlias: d.valueAlias, valueType: d.valueType, timing: d.timing,
    fields: d.fields.map(({ alias, key, role, type, description }) => ({ alias, key, role, type, description })),
    ...(item.kind === "metric" && metricQueryConfig(item) ? { metrics: metricQueryConfig(item) } : {}), context
  });
}
export function itemReviewSignature(item, context) {
  return hash({ query: itemQuerySignature(item, context), definition: itemDefinition(item) });
}
export function itemCurrentRun(item, context) {
  const latest = item.runs.find((run) => run.querySignature === itemQuerySignature(item, context));
  return latest?.status === "success" ? latest : undefined;
}
export function abilityDefinition(store, ability) {
  return clone({
    id: ability.id, key: ability.key, name: ability.name, description: ability.description,
    goal: ability.goal, includeOverall: ability.includeOverall, showOverall: showsOverall(ability),
    singleSqlFlow: Boolean(ability.singleSqlFlow), sqlItemId: ability.sqlItemId || "",
    crossDimensions: ability.crossDimensions || [],
    metrics: ability.metrics.map((ref) => ({ ...ref, definition: resolveItem(store, ref) })),
    dimensions: ability.dimensions.map((ref) => ({ ...ref, definition: resolveItem(store, ref) })),
    groups: ability.groups
  });
}
export function abilitySignature(store, ability) {
  try { return hash({ definition: abilityDefinition(store, ability), context: ability.context, scenario: ability.scenario }); }
  catch { return "invalid-reference"; }
}
export function abilityQuerySignature(store, ability) {
  try {
    return hash({
      metrics: ability.metrics.map((ref) => ({ itemId: ref.itemId, version: ref.version, metricKeys: ref.metricKeys, query: itemQuerySignature(resolveItem(store, ref), ability.context) })),
      dimensions: ability.dimensions.map((ref) => ({ itemId: ref.itemId, version: ref.version, query: itemQuerySignature(resolveItem(store, ref), ability.context) })),
      includeOverall: ability.includeOverall,
      groups: activeGroups(ability).map(({ id, cross, members, queryItemId, valueFilters }) => ({ id, cross, members, ...(queryItemId ? { queryItemId } : {}), ...(valueFilters && Object.keys(valueFilters).length ? { valueFilters } : {}) })),
      crossDimensions: ability.crossDimensions || [],
      context: ability.context, scenario: ability.scenario
    });
  } catch { return "invalid-reference"; }
}
export function abilityCurrentRun(store, ability) {
  const latest = ability.runs.find((run) => run.signature === abilityQuerySignature(store, ability));
  return latest?.status === "success" ? latest : undefined;
}
export function itemIssues(item) {
  const d = item.draft, errors = [];
  if (!item.name.trim() || !item.description.trim()) errors.push("补齐取数项名称和说明。");
  if ((item.key || item.savedAt) && !identifier(item.key)) errors.push("系统 Key 异常，请重新保存取数项。");
  if (item.unavailable) errors.push(item.unavailable);
  if (!d.sql.trim() || d.parsedSql !== d.sql || d.parseError) errors.push("当前 SQL 需要成功解析。");
  if (d.removed.length) errors.push("有删除或重命名输出需要确认。");
  if (d.fields.some((f) => f.review)) errors.push("来源或粒度变化，需要复核相关输出。");
  for (const p of d.parameters) {
    const source = parameterCatalog.find((candidate) => candidate.key === p.source);
    if (!source) errors.push(`参数 \${${p.name}} 未绑定。`);
    else if (source.type !== p.expectedType) errors.push(`参数 \${${p.name}} 类型与来源不匹配。`);
    if (p.expectedType?.endsWith("_list") && !p.listUsage) errors.push(`列表参数 \${${p.name}} 须用于 IN (...)。`);
  }
  if (item.kind === "dimension") {
    if (!identifier(d.dimensionKey) || ["group_id", "group_name", "is_control"].includes(d.dimensionKey)) errors.push("维度 Key 不合法或与分组字段冲突。");
    if (!d.dimensionName.trim() || !d.timing.trim()) errors.push("补齐维度名称与取值时点。");
    if (!entities[d.entity]) errors.push("明确维度统计实体。");
    if (d.idAlias === d.valueAlias) errors.push("实体 ID 与维度值须映射到不同列。");
    if (!["string", "number"].includes(d.valueType)) errors.push("维度值须声明字符串或数字原生类型。");
    if (!d.fields.some((f) => f.alias === d.idAlias) || !d.fields.some((f) => f.alias === d.valueAlias)) errors.push("选择实际输出的实体 ID 列和维度值列。");
    if ((d.enumValues || []).some((value) => value !== null && typeof value !== d.valueType)) errors.push("枚举候选值须符合维度原生类型，数字枚举请填写数字。");
  } else {
    if (hasDrillSlots(item) && outputDimensions(item).length) errors.push("含维度输出的完整 SQL 请移除模板位置；维度按实际输出声明。");
    errors.push(...metricIssues(item));
    if (new Set(d.fields.map((f) => f.key)).size !== d.fields.length) errors.push("输出 Key 重复。");
    for (const f of d.fields) {
      if (!identifier(f.key) || !f.name.trim() || !f.description.trim() || f.role === "pending" || f.type === "unknown") errors.push(`${f.alias}：补齐 Key、名称、口径、角色与类型。`);
      if (f.role === "metric" && (!["decimal", "currency", "integer", "percent"].includes(f.format) || !Number.isInteger(Number(f.precision)) || Number(f.precision) < 0 || Number(f.precision) > 6)) errors.push(`${f.alias}：选择有效展示格式与 0–6 位精度。`);
    }
    for (const alias of ["group_id", "group_name", "is_control"]) if (!d.fields.some((f) => f.alias === alias && f.key === alias && f.role === "identity")) errors.push(`缺少分组身份映射 ${alias}。`);
    if (hasDrillSlots(item) && (!identifier(d.sourceAlias) || !identifier(d.entityColumn))) errors.push("明细来源别名和关联字段须为有效标识。");
  }
  return errors;
}
export function abilityIssues(store, ability) {
  if (ability.singleSqlFlow) {
    const errors = [];
    if (!ability.name.trim()) errors.push("请填写能力名称。");
    if (!ability.description.trim()) errors.push("请填写能力说明。");
    if (!businessGoals.includes(ability.goal)) errors.push("请选择平台已有业务目标。");
    if (ability.name.trim().length > 50) errors.push("能力名称不能超过 50 个字。");
    if (ability.description.trim().length > 200) errors.push("能力说明不能超过 200 个字。");
    const reference = ability.metrics.find((candidate) => candidate.itemId === ability.sqlItemId) || ability.metrics[0];
    let source;
    try { source = resolveItem(store, reference); }
    catch (error) { errors.push(error.message); }
    if (source) {
      const draft = source.draft;
      if (!draft.sql.trim()) errors.push("请先输入完整 SQL 后再解析。");
      else if (draft.parseError) errors.push("SQL 语法校验未通过，请根据编辑器提示修改后重试。");
      else if (draft.parsedSql !== draft.sql) errors.push("当前 SQL 尚未完成解析，请先校验并解析 SQL。");
      if (!metricFields(source).length) errors.push("未识别到可用指标，请检查 SQL 输出字段。");
      if (outputDimensions(source).some((dimension) => !dimension.splitSql?.trim()))
        errors.push("存在尚未生成完成的维度拆分 SQL。");
      if ((ability.crossDimensions || []).some((cross) => cross.status !== "generated" || !cross.splitSql?.trim()))
        errors.push("存在尚未生成完成的交叉维度 SQL。");
      const dimensionKeys = new Set(outputDimensions(source).map((field) => field.key));
      const combinations = new Set();
      for (const cross of ability.crossDimensions || []) {
        const members = crossDimensionKeys(cross);
        if (members.length < 2 || members.length > MAX_CROSS_DIMENSIONS || new Set(members).size !== members.length || members.some((key) => !dimensionKeys.has(key)))
          errors.push("交叉维度请选择 2–3 个不同且有效的维度。");
        const combination = [...members].sort().join("|");
        if (combinations.has(combination)) errors.push("相同交叉维度组合已存在。");
        combinations.add(combination);
      }
    }
    return [...new Set(errors)];
  }
  const errors = [];
  if (!ability.name.trim() || !ability.description.trim()) errors.push("补齐能力名称和说明。");
  if (!businessGoals.includes(ability.goal)) errors.push("请选择平台已有业务目标。");
  if (ability.key && (!identifier(ability.key) || store.abilities.some((a) => a.id !== ability.id && a.key === ability.key))) errors.push("系统 Key 异常，请重新保存能力。");
  if (!ability.metrics.length || !ability.metrics.some((r) => r.metricKeys.length)) errors.push("至少选择一个实际指标。");
  const groups = activeGroups(ability);
  if ((!ability.includeOverall || !showsOverall(ability)) && !groups.length) errors.push("至少展示整体数据或一种维度拆分。");
  const dimKeys = [];
  for (const ref of [...ability.metrics, ...ability.dimensions]) {
    try {
      const item = resolveItem(store, ref);
      errors.push(...itemIssues(item).map((message) => `${item.name}：${message}`));
      if (ref.metricKeys) {
        if (ref.metricKeys.some((key) => !metricFields(item).some((f) => f.key === key))) errors.push(`${item.name}：所选指标不在当前引用输出中。`);
      } else dimKeys.push(item.draft.dimensionKey);
    } catch (error) { errors.push(error.message); }
  }
  if (new Set(dimKeys).size !== dimKeys.length) errors.push("维度 Key 重复，不能区分成员来源。");
  if (new Set(ability.groups.map((g) => completeGroup(g).key)).size !== ability.groups.length) errors.push("下钻组 Key 重复。");
  const grains = new Set();
  for (const group of groups) {
    const grain = group.queryItemId ? `query:${group.queryItemId}` : [...group.members].sort().join("|");
    if (grains.has(grain)) errors.push(`${group.name}：已存在相同的维度拆分。`);
    grains.add(grain);
    if (!identifier(completeGroup(group).key)) errors.push(`${group.name}：下钻 Key 不合法。`);
    let fields = [];
    try {
      fields = group.queryItemId
        ? outputDimensions(resolveItem(store, ability.metrics.find((r) => r.itemId === group.queryItemId)))
        : group.members.flatMap((id) => {
          const ref = ability.dimensions.find((r) => r.itemId === id);
          if (!ref) return [];
          const d = resolveItem(store, ref).draft;
          return [{ key: d.dimensionKey, type: d.valueType }];
        });
    } catch { /* Missing references are reported above. */ }
    for (const [key, values] of Object.entries(group.valueFilters || {})) {
      const f = fields.find((f) => f.key === key);
      if (!f || !Array.isArray(values) || !values.length || values.some((v) => v !== null && (typeof v !== f.type || (typeof v === "number" && !Number.isFinite(v))))) errors.push(`${group.name}：拆解取值为空或与维度类型不符，请重新选择。`);
    }
    if (group.queryItemId) {
      const ref = ability.metrics.find((r) => r.itemId === group.queryItemId && r.metricKeys.length);
      if (!ref) continue;
      try {
        const query = resolveItem(store, ref), dims = outputDimensions(query);
        if (!directQuery(query) || !group.name.trim() || group.members.length !== dims.length || group.members.some((key) => !dims.some((f) => f.key === key)) || new Set(group.members).size !== group.members.length || group.cross !== (dims.length > 1)) errors.push(`${group.name}：成员与绑定 SQL 的实际维度输出不匹配。`);
      } catch (error) { errors.push(error.message); }
      continue;
    }
    for (const id of group.members) {
      const owners = builtinDimensionOwners[id];
      if (owners && !ability.metrics.some((r) => r.metricKeys.length && owners.includes(r.itemId))) errors.push(`${group.name}：请保留该维度所属的内置指标组，或复制为自定义 SQL 维度。`);
    }
    if (!group.name.trim() || group.members.length !== new Set(group.members).size || group.members.some((id) => !ability.dimensions.some((d) => d.itemId === id))) errors.push(`${group.name || "下钻组"}：成员缺失、重复或尚未加入维度配置。`);
    if (group.cross ? group.members.length < 2 || group.members.length > MAX_CROSS_DIMENSIONS : group.members.length !== 1) errors.push(`${group.name}：单维选择一个成员，交叉支持 2–3 个不同维度。`);
    for (const ref of ability.metrics.filter((r) => r.metricKeys.length)) {
      try {
        const item = resolveItem(store, ref);
        if (directQuery(item)) {
          errors.push(`${group.name}：${item.name} 缺少此粒度的 SQL 变体，请补充可下钻 SQL 模板。`);
          continue;
        }
        if (!hasDrillSlots(item)) errors.push(`${item.name}：没有可下钻的 SQL 模板位置，只支持实际整体输出。`);
        for (const id of group.members) {
          const dimRef = ability.dimensions.find((d) => d.itemId === id);
          if (dimRef && resolveItem(store, dimRef).draft.entity !== item.draft.entity) errors.push(`${group.name}：维度与 ${item.name} 的关联实体不同。`);
        }
      } catch { /* Reference error already reported above. */ }
    }
  }
  return [...new Set(errors)];
}
