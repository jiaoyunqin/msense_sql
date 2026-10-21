import { clone, uid } from "./prototype-data.js";

export const calculationTypes = [
  ["value", "SQL 原值"], ["sum", "SUM"], ["avg", "AVG"], ["uv", "UV"],
  ["per_user", "A / 进组用户数"], ["ratio", "A / B"], ["users", "进组用户数"]
];
export const aggregations = [["sum", "SUM"], ["avg", "AVG"], ["uv", "UV"]];
const validKey = (value) => /^[a-zA-Z_]\w*$/.test(value || "");
const identityAliases = ["group_id", "group_name", "is_control"];
const quote = (value) => {
  if (!validKey(value)) throw new Error("指标引用的字段或 Key 不合法。");
  return `"${value}"`;
};

// Legacy SQL outputs remain the default metric definitions. Published snapshots
// are read through this adapter without rewriting their stored definitions.
export function metricRows(item) {
  return item.draft.metricDefinitions ?? item.draft.fields.filter((f) => f.role === "metric").map((f) => ({
    ...clone(f), calculation: "value", valueAlias: f.alias, aggregation: "sum",
    denominatorAlias: "", denominatorAggregation: "sum", fromOutput: true
  }));
}
export function entityAlias(item) {
  const aliases = item.draft.fields.map((f) => f.alias);
  return [item.draft.entity === "order" ? "order_id" : "user_id", "entity_id"].find((a) => aliases.includes(a));
}
export function newMetric(item, source, calculation = "sum") {
  const key = uid("metric");
  return {
    alias: key, key, name: source?.name || "新指标", type: "number", role: "metric",
    calculation, valueAlias: source?.alias || "", aggregation: "sum",
    denominatorAlias: "", denominatorAggregation: "sum", description: "",
    format: "decimal", precision: 2, unit: "", nullDisplay: "—", review: false
  };
}
export function syncMetrics(item) {
  if (item.kind !== "metric") return;
  const d = item.draft;
  d.metricDefinitions ??= metricRows(item).map((m) => ({ ...m, calculation: d.metricTemplate === "users" ? "sum" : m.calculation }));
  d.metricKnownAliases ??= d.fields.filter((f) => f.role === "metric").map((f) => f.alias);
  d.excludedMetricAliases ??= [];
  // Role changes remove only the automatically mapped SQL-original row.
  d.metricDefinitions = d.metricDefinitions.filter((m) => !m.fromOutput || !d.fields.some((f) => f.alias === m.valueAlias && f.role !== "metric"));
  for (const f of d.fields.filter((f) => f.role === "metric")) {
    const mapped = d.metricDefinitions.find((m) => m.fromOutput && m.valueAlias === f.alias);
    if (mapped) Object.assign(mapped, { key: f.key, name: f.name, type: f.type, description: f.description,
      format: f.format, precision: f.precision, unit: f.unit, nullDisplay: f.nullDisplay, controlDash: f.controlDash });
    if (d.excludedMetricAliases.includes(f.alias) || d.metricKnownAliases.includes(f.alias) || d.metricDefinitions.some((m) => m.valueAlias === f.alias)) continue;
    d.metricDefinitions.push({ ...clone(f), calculation: d.metricTemplate === "users" ? "sum" : "value",
      valueAlias: f.alias, aggregation: "sum", denominatorAlias: "", denominatorAggregation: "sum", fromOutput: true });
  }
  d.metricKnownAliases = [...new Set([...d.metricKnownAliases, ...d.fields.filter((f) => f.role === "metric").map((f) => f.alias)])];
}
export function metricDescription(row) {
  if (row.description?.trim()) return row.description;
  const a = `${row.aggregation?.toUpperCase() || "SUM"}(${row.valueAlias})`;
  if (row.calculation === "users") return "去重进组用户数；SQL 需覆盖全量进组用户，包含零订单用户。";
  if (row.calculation === "per_user") return `${a} / 进组用户数`;
  if (row.calculation === "ratio") return `${a} / ${row.denominatorAggregation?.toUpperCase() || "SUM"}(${row.denominatorAlias})`;
  return row.calculation === "value" ? `SQL 输出：${row.valueAlias}` : `${row.calculation.toUpperCase()}(${row.valueAlias})`;
}
export function metricFields(item) {
  return metricRows(item).map((row) => ({ ...clone(row), description: metricDescription(row) }));
}
export function metricQueryConfig(item) {
  const rows = metricRows(item);
  const original = item.draft.fields.filter((f) => f.role === "metric");
  if (rows.length === original.length && rows.every((m, i) => m.calculation === "value" && m.valueAlias === original[i].alias && m.alias === original[i].alias && m.key === original[i].key)) return null;
  return rows.map(({ alias, key, calculation, valueAlias, aggregation, denominatorAlias, denominatorAggregation }) =>
    ({ alias, key, calculation, valueAlias, aggregation, denominatorAlias, denominatorAggregation }));
}
export function metricIssues(item) {
  const rows = metricRows(item), fields = item.draft.fields, errors = [];
  const entity = entityAlias(item);
  const keys = [...fields.filter((f) => f.role !== "metric").map((f) => f.key), ...rows.map((r) => r.key)];
  const aliases = [...fields.filter((f) => f.role !== "metric").map((f) => f.alias), ...rows.map((r) => r.alias)];
  if (!rows.length) errors.push("至少配置一个指标。");
  if (new Set(keys).size !== keys.length || new Set(aliases).size !== aliases.length) errors.push("指标 Key 或输出别名重复。");
  for (const row of rows) {
    const prefix = row.name || "新指标", calc = row.calculation;
    if (!validKey(row.key) || !validKey(row.alias) || !row.name.trim()) errors.push(`${prefix}：请填写指标名称，Key 须为有效标识。`);
    if (!calculationTypes.some(([key]) => key === calc)) errors.push(`${prefix}：请选择计算类型。`);
    if (calc !== "users" && !fields.some((f) => f.alias === row.valueAlias && f.type === "number")) errors.push(`${prefix}：请选择 SQL 实际输出的数字字段。`);
    if (calc === "ratio" && !fields.some((f) => f.alias === row.denominatorAlias && f.type === "number")) errors.push(`${prefix}：请选择分母字段。`);
    if (["per_user", "ratio"].includes(calc) && (!aggregations.some(([a]) => a === row.aggregation) || (calc === "ratio" && !aggregations.some(([a]) => a === row.denominatorAggregation)))) errors.push(`${prefix}：请选择聚合方式。`);
    if ((["uv", "users", "per_user"].includes(calc) || (["per_user", "ratio"].includes(calc) && (row.aggregation === "uv" || row.denominatorAggregation === "uv"))) && !entity) errors.push(`${prefix}：SQL 需输出 ${item.draft.entity === "order" ? "order_id" : "user_id"} 或 entity_id，才能计算去重人数。`);
    if (!["decimal", "currency", "integer", "percent"].includes(row.format) || !Number.isInteger(Number(row.precision)) || row.precision < 0 || row.precision > 6) errors.push(`${prefix}：请选择有效格式与 0–6 位精度。`);
  }
  return errors;
}

export function compileMetrics(mode, item, selectedKeys) {
  const configured = metricFields(item), keys = selectedKeys ?? configured.map((f) => f.key);
  const metrics = configured.filter((f) => keys.includes(f.key));
  const issues = metricIssues(item);
  if (issues.length) throw new Error(issues.join(" "));
  const aggregate = metrics.some((m) => m.calculation !== "value");
  const structural = mode.fields.filter((f) => f.role !== "metric"
    && (!aggregate || f.role === "dimension" || identityAliases.includes(f.alias)));
  const entity = entityAlias(item), users = () => `COUNT(DISTINCT ${quote(entity)})`;
  const expression = (alias, aggregation) => {
    const value = quote(alias);
    if (aggregation === "uv") return `COUNT(DISTINCT CASE WHEN ${value} > 0 THEN ${quote(entity)} END)`;
    return `${aggregation === "avg" ? "AVG" : "SUM"}(${value})`;
  };
  const project = (m) => {
    if (m.calculation === "users") return users();
    if (m.calculation === "per_user") return `1.0 * ${expression(m.valueAlias, m.aggregation)} / NULLIF(${users()}, 0)`;
    if (m.calculation === "ratio") return `1.0 * ${expression(m.valueAlias, m.aggregation)} / NULLIF(${expression(m.denominatorAlias, m.denominatorAggregation)}, 0)`;
    // SQL-original values cannot silently become totals when other rows aggregate.
    if (m.calculation === "value") return aggregate ? `CASE WHEN COUNT(*) = 1 THEN MAX(${quote(m.valueAlias)}) ELSE NULL END` : quote(m.valueAlias);
    return expression(m.valueAlias, m.calculation);
  };
  const needsProjection = aggregate || metrics.some((m) => m.alias !== m.valueAlias);
  if (needsProjection) {
    const columns = [...structural.map((f) => quote(f.alias)), ...metrics.map((m) => `${project(m)} AS ${quote(m.alias)}`)];
    mode.sql = `SELECT ${columns.join(",\n  ")}\nFROM (${mode.sql.trim().replace(/;\s*$/, "")}) AS __metric_source${aggregate ? `\nGROUP BY ${structural.map((f) => quote(f.alias)).join(", ")}` : ""}`;
    mode.parsedSql = mode.sql;
  }
  mode.fields = [...structural, ...metrics];
  return mode;
}

// The demo cohort comes from all users assigned to the selected experiment.
// A left join retains users with no matching orders in the observation window.
export const userMetricSQL = `WITH entered_users AS (
  SELECT DISTINCT group_id, group_name, is_control, user_id
  FROM demo_orders
  WHERE libra_id = \${libra_id}
), observed_orders AS (
  SELECT user_id, COUNT(*) AS order_cnt, SUM(pay_amount) AS pay_amount
  FROM demo_orders
  WHERE libra_id = \${libra_id}
    AND order_date BETWEEN \${start_date} AND \${end_date}
    AND coupon_meta_id IN (\${coupon_meta_ids})
  GROUP BY user_id
)
SELECT e.group_id AS group_id,
  e.group_name AS group_name,
  e.is_control AS is_control,
  e.user_id AS user_id,
  CAST(COALESCE(o.order_cnt, 0) AS INTEGER) AS order_cnt,
  CAST(COALESCE(o.pay_amount, 0) AS REAL) AS pay_amount
FROM entered_users e
LEFT JOIN observed_orders o ON e.user_id = o.user_id`;
