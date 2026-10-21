import { clone, uid, hash, definitions, defaultContext } from "./prototype-data.js";
import demoFixture from "./composer-demo.json";

export { clone, uid, hash, defaultContext };
export const COMPOSER_KEY = "msense-composer-v2";
export const identifier = (value) => /^[a-zA-Z_]\w*$/.test(value || "");
export const slots = ["dimension_select", "dimension_join", "dimension_group"];
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
    id: uid("item"), key: uid(isDimension ? "dimension" : "query"), name: isDimension ? "自定义消费分层" : "自定义订单表现",
    description: isDimension ? "按用户历史消费金额定义分层，取自实验前示例用户快照。" : "观察支付表现；指标由 SQL 直接计算。",
    kind, ownerAbilityId, preset: false, keyLocked: false, savedAt: "", versions: [], runs: [],
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
    kind: item.kind, preset: item.preset, unavailable: item.unavailable || "",
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
  Object.assign(item, { id, key: id.replaceAll("-", "_"), name, description: options.description || name, preset: true, keyLocked: true });
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
    { ...preset("metric", "preset-summary-only", "仅汇总 RPC 指标", "SELECT 1 AS unavailable", { metrics: [] }),
      unavailable: "仅有组别汇总，没有明细来源或可下钻执行器；不能附加 SQL 维度后生成下钻。" }
  ];
}
export function newAbility(name = "未命名取数能力") {
  return {
    id: uid("ability"), key: uid("capability"), keyLocked: false, name,
    goal: "平台老客提频", owner: "DS / 分析师", description: "",
    metrics: [], dimensions: [], groups: [], includeOverall: true,
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
      return addPublishedDemo(saved);
    }
  } catch { /* Storage failure must not make the page unusable. */ }
  return addPublishedDemo(initialStore());
}
export function hasDrillSlots(item) {
  return slots.every((slot) => item.draft.sql.includes(`{{${slot}}}`));
}
export function itemQuerySignature(item, context) {
  const d = item.draft;
  return hash({
    sql: d.sql, parameters: d.parameters, entity: d.entity, entityColumn: d.entityColumn, sourceAlias: d.sourceAlias,
    dimensionKey: d.dimensionKey, idAlias: d.idAlias, valueAlias: d.valueAlias, valueType: d.valueType, timing: d.timing,
    fields: d.fields.map(({ alias, key, role, type, description }) => ({ alias, key, role, type, description })), context
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
    goal: ability.goal, owner: ability.owner, includeOverall: ability.includeOverall,
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
      groups: ability.groups.map(({ id, cross, members }) => ({ id, cross, members })),
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
  if (!identifier(item.key)) errors.push("稳定 Key 须为英文、数字与下划线。");
  if (item.unavailable) errors.push(item.unavailable);
  if (!d.sql.trim() || d.parsedSql !== d.sql || d.parseError) errors.push("当前 SQL 需要成功解析。");
  if (d.removed.length) errors.push("有删除或重命名输出需要确认。");
  if (d.fields.some((f) => f.review)) errors.push("来源或粒度变化，需要复核相关输出。");
  for (const p of d.parameters) if (!p.source) errors.push(`参数 \${${p.name}} 未绑定。`);
  if (item.kind === "dimension") {
    if (!identifier(d.dimensionKey) || ["group_id", "group_name", "is_control"].includes(d.dimensionKey)) errors.push("维度 Key 不合法或与分组字段冲突。");
    if (!d.dimensionName.trim() || !d.timing.trim()) errors.push("补齐维度名称与取值时点。");
    if (!entities[d.entity]) errors.push("明确维度统计实体。");
    if (d.idAlias === d.valueAlias) errors.push("实体 ID 与维度值须映射到不同列。");
    if (!["string", "number"].includes(d.valueType)) errors.push("维度值须声明字符串或数字原生类型。");
    if (!d.fields.some((f) => f.alias === d.idAlias) || !d.fields.some((f) => f.alias === d.valueAlias)) errors.push("选择实际输出的实体 ID 列和维度值列。");
    if ((d.enumValues || []).some((value) => value !== null && typeof value !== d.valueType)) errors.push("枚举候选值须符合维度原生类型，数字枚举请填写数字。");
  } else {
    const metrics = d.fields.filter((f) => f.role === "metric");
    if (d.fields.some((f) => f.role === "dimension")) errors.push("指标取数项提供整体最终指标；新增业务维度请定义为维度取数项后组合。");
    if (!metrics.length) errors.push("至少定义一个 SQL 最终指标。");
    if (new Set(d.fields.map((f) => f.key)).size !== d.fields.length) errors.push("输出 Key 重复。");
    for (const f of d.fields) {
      if (!identifier(f.key) || !f.name.trim() || !f.description.trim() || f.role === "pending" || f.type === "unknown") errors.push(`${f.alias}：补齐 Key、名称、口径、角色与类型。`);
    }
    for (const alias of ["group_id", "group_name", "is_control"]) if (!d.fields.some((f) => f.alias === alias && f.key === alias && f.role === "identity")) errors.push(`缺少分组身份映射 ${alias}。`);
    if (!identifier(d.sourceAlias) || !identifier(d.entityColumn)) errors.push("明细来源别名和关联字段须为有效标识。");
  }
  return errors;
}
export function abilityIssues(store, ability) {
  const errors = [];
  if (!ability.name.trim() || !ability.description.trim() || !ability.owner.trim()) errors.push("补齐能力名称、负责人和说明。");
  if (!identifier(ability.key) || store.abilities.some((a) => a.id !== ability.id && a.key === ability.key)) errors.push("能力 Key 格式不合法或重复。");
  if (!ability.metrics.length || !ability.metrics.some((r) => r.metricKeys.length)) errors.push("至少选择一个实际指标。");
  if (!ability.includeOverall && !ability.groups.length) errors.push("至少保留整体或一个下钻组。");
  const dimKeys = [];
  for (const ref of [...ability.metrics, ...ability.dimensions]) {
    try {
      const item = resolveItem(store, ref);
      errors.push(...itemIssues(item).map((message) => `${item.name}：${message}`));
      if (ref.metricKeys) {
        if (ref.metricKeys.some((key) => !item.draft.fields.some((f) => f.key === key && f.role === "metric"))) errors.push(`${item.name}：所选指标不在当前引用输出中。`);
      } else dimKeys.push(item.draft.dimensionKey);
    } catch (error) { errors.push(error.message); }
  }
  if (new Set(dimKeys).size !== dimKeys.length) errors.push("维度 Key 重复，不能区分成员来源。");
  for (const group of ability.groups) {
    if (!group.name.trim() || group.members.length !== new Set(group.members).size || group.members.some((id) => !ability.dimensions.some((d) => d.itemId === id))) errors.push(`${group.name || "下钻组"}：成员缺失、重复或尚未加入维度配置。`);
    if (group.cross ? group.members.length < 2 : group.members.length !== 1) errors.push(`${group.name}：单维选择一个成员，交叉至少选择两个不同成员。`);
    for (const ref of ability.metrics.filter((r) => r.metricKeys.length)) {
      try {
        const item = resolveItem(store, ref);
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
