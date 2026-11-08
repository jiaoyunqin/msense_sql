import { clone, definitions, customAbilityExampleSQL, defaultContext } from "./prototype-data.js";

export const siteDemoRevision = 1;
export const catalogPeople = {
  "sheriqin.01": "秦娇芸",
  "msense.system": "孙一凡",
  "jindan": "金丹"
};
export const catalogPerson = (obj) => obj.createdByName || catalogPeople[obj.createdBy] || obj.createdBy || "系统";

// Small, executable examples of the live product's source and publication states.
// These fixtures contain local demonstration SQL, never production query text.
export function seedSiteCapabilities(store, { newAbility, newItem, abilityDefinition, itemDefinition }) {
  if (store.siteDemoRevision === siteDemoRevision) return;
  const fields = ["group_id", "group_name", "is_control", "date", "experiment_id", "gmv", "order_count",
    "avg_order_value", "consumption_level", "lifecycle_stage", "user_segment"].map((alias) => ({
    alias, key: alias, type: "number", role: "metric", format: "decimal", precision: 2,
    unit: "", nullDisplay: "—", review: false, ...clone(definitions[alias])
  }));
  const splitSQL = (dimensions = []) => {
    const keys = ["group_id", "group_name", "is_control", ...dimensions].map((key) => `"${key}"`);
    return `SELECT ${keys.join(", ")},
  SUM("gmv") AS "gmv",
  SUM("order_count") AS "order_count",
  1.0 * SUM("gmv") / NULLIF(SUM("order_count"), 0) AS "avg_order_value"
FROM (
${customAbilityExampleSQL.replace(/;\s*$/, "")}
) AS complete_sql_input
GROUP BY ${keys.join(", ")}
ORDER BY "is_control" DESC`;
  };
  for (const spec of [
    { id: "site-sql-payment", name: "优惠券支付分析", creator: "sheriqin.01", published: true },
    { id: "site-sql-draft", name: "优惠券支付分析（研发）", creator: "sheriqin.01", published: false },
    { id: "site-sql-readonly", name: "支付表现与用户分层", creator: "jindan", published: true }
  ]) {
    if (store.abilities.some((ability) => ability.id === spec.id)) continue;
    const ability = newAbility(spec.name);
    Object.assign(ability, {
      id: spec.id, key: spec.id.replaceAll("-", "_"), keyLocked: true,
      createdBy: spec.creator, siteDemo: true, singleSqlFlow: true,
      description: "按实验分组查看支付 GMV、支付订单量和平均订单金额，支持消费力、生命周期及交叉维度取数。",
      savedAt: "2026-11-05T01:00:00.000Z", updatedAt: "2026-11-05T01:00:00.000Z",
      parseStatus: "success", context: clone(defaultContext)
    });
    const item = newItem("metric", ability.id);
    Object.assign(item, {
      id: `${spec.id}-query`, key: `${ability.key}_query`, keyLocked: true,
      name: `${ability.name} · 完整 SQL`, description: ability.description,
      createdBy: spec.creator, savedAt: ability.savedAt
    });
    Object.assign(item.draft, {
      sql: customAbilityExampleSQL, parsedSql: customAbilityExampleSQL, fields: clone(fields),
      autoParse: false, parameters: ["libra_id", "start_date", "end_date"].map((name) => ({
        name, source: name, expectedType: name === "libra_id" ? "number" : "date", listUsage: false
      }))
    });
    item.draft.fields.filter((field) => field.role === "dimension")
      .forEach((field) => { field.splitSql = splitSQL([field.key]); });
    ability.sqlItemId = item.id;
    ability.metrics = [{ itemId: item.id, version: 0, metricKeys: ["gmv", "order_count", "avg_order_value"] }];
    ability.crossDimensions = [{
      id: `${spec.id}-cross`, name: "消费力分层 × 生命周期",
      dimensionKeys: ["consumption_level", "lifecycle_stage"],
      status: "generated", splitSql: splitSQL(["consumption_level", "lifecycle_stage"])
    }];
    store.items.push(item);
    store.abilities.push(ability);
    if (spec.published) {
      item.versions.push({ number: 1, publishedAt: ability.savedAt, definition: itemDefinition(item), fixture: true });
      ability.versions.push({ number: 1, publishedAt: ability.savedAt,
        definition: abilityDefinition(store, ability), operator: spec.creator, fixture: true });
    }
  }
  store.siteDemoRevision = siteDemoRevision;
}
