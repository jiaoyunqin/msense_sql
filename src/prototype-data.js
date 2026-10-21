export const clone = (value) => JSON.parse(JSON.stringify(value));
export const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
export const hash = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let result = 2166136261;
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  return (result >>> 0).toString(16);
};

export const parameterCatalog = [
  { key: "libra_id", name: "Libra 实验 ID", type: "number", value: "4823214", description: "本地示例实验编号；与钱效实验 ID 分开。" },
  { key: "pgdp_experiment_id", name: "钱效实验 ID", type: "string", value: "pgdp_demo_01", description: "示例与 Libra 一对一对应；不会自动替代 Libra ID。" },
  { key: "start_date", name: "观察开始日期", type: "date", value: "2026-10-01", description: "本次观察窗口起点，YYYY-MM-DD；不是实验开始日期。" },
  { key: "end_date", name: "观察结束日期", type: "date", value: "2026-10-03", description: "本次观察窗口终点，YYYY-MM-DD；包含当日。" },
  { key: "coupon_meta_ids", name: "券模板 ID 列表", type: "number_list", value: "101,102", description: "非空数字列表，在 SQL 中使用 IN (${coupon_meta_ids})。" },
  { key: "versionIds", name: "实验版本 ID 列表", type: "number_list", value: "1,2", description: "示例对照组与实验组版本编号，使用 IN (...)。" }
];
export const defaultContext = Object.fromEntries(parameterCatalog.map((p) => [p.key, p.value]));
export const scenarios = {
  normal: "正常数据",
  empty: "空数据",
  permission: "底表权限不足",
  failure: "执行失败",
  timeout: "执行超时",
  missing: "输出字段缺失",
  type: "返回类型不符",
  grain: "重复粒度",
  no_control: "缺少对照组",
  access: "平台准入不足",
  result_access: "结果查看权限不足"
};

export const definitions = {
  group_id: { name: "实验组 ID", role: "identity", type: "string", description: "示例中稳定的实验分组标识，供本地分析适配使用。" },
  group_name: { name: "实验分组", role: "identity", type: "string", description: "实验分组展示名称。" },
  is_control: { name: "是否对照组", role: "identity", type: "number", description: "SQL 原生值 1 表示对照组，0 表示实验组。" },
  spend_tier: { name: "消费力", role: "dimension", type: "string", description: "按用户历史消费金额分层，统计实体为用户。", entity: "用户", timing: "首次进入实验前的用户快照" },
  lifecycle: { name: "生命周期", role: "dimension", type: "string", description: "用户生命周期，取自示例用户快照。", entity: "用户", timing: "首次进入实验前的用户快照" },
  city_id: { name: "城市 ID", role: "dimension", type: "number", description: "数字编码维度；类型为数字，业务角色仍为维度。", entity: "用户", timing: "首次进入实验前的用户快照" },
  gmv: { name: "支付 GMV", role: "metric", type: "number", format: "currency", unit: "元", description: "观察窗口内已支付订单的实付金额总和，不包含退款调整。" },
  order_count: { name: "支付订单量", role: "metric", type: "number", format: "integer", description: "观察窗口内示例底表的支付订单记录数。" },
  redeemed_count: { name: "核销订单量", role: "metric", type: "number", format: "integer", description: "观察窗口内使用优惠券完成支付的订单数。" },
  redemption_rate: { name: "订单核销率", role: "metric", type: "number", format: "percent", precision: 2, description: "核销订单量 / 支付订单量，SQL 输出最终比率；不是用户核销率。" }
};

export function sampleSQL(members = []) {
  const dims = members.map((member) => member === "spend_tier"
    ? "CASE WHEN u.historical_spend >= 500 THEN '高消费力'\n       WHEN u.historical_spend >= 200 THEN '中消费力'\n       ELSE '低消费力' END AS spend_tier"
    : `u.${member} AS ${member}`);
  return `SELECT
  o.group_id AS group_id,
  o.group_name AS group_name,
  o.is_control AS is_control,
  ${dims.length ? dims.join(",\n  ") + ",\n  " : ""}SUM(o.pay_amount) AS gmv,
  COUNT(*) AS order_count,
  SUM(o.redeemed) AS redeemed_count,
  1.0 * SUM(o.redeemed) / NULLIF(COUNT(*), 0) AS redemption_rate
FROM demo_orders o
JOIN demo_users u ON o.user_id = u.user_id
WHERE o.libra_id = \${libra_id}
  AND o.order_date BETWEEN \${start_date} AND \${end_date}
  AND o.coupon_meta_id IN (\${coupon_meta_ids})
GROUP BY o.group_id, o.group_name, o.is_control${members.length ? ", " + members.join(", ") : ""}
ORDER BY o.is_control DESC${members.length ? ", " + members.join(", ") : ""}`;
}

export function makeMode(name, kind = "overall", members = [], sql = sampleSQL(members)) {
  return { id: uid("mode"), name, kind, members, sql, fields: [], parameters: [], parsedSql: "", parseError: "", diff: [], removed: [], runs: [], revision: 1 };
}
export function makeAbility() {
  return {
    id: uid("cap"), key: `coupon_effect_${Date.now().toString(36)}`, name: "优惠券核销效果",
    goal: "平台老客提频", owner: "DS / 分析师", description: "观察优惠券核销表现，分别查看消费力、生命周期及两者的联合分布。",
    keyLocked: false, revision: 1, savedAt: "", versions: [], context: clone(defaultContext), scenario: "normal",
    modes: [
      makeMode("整体"),
      makeMode("消费力", "single", ["spend_tier"]),
      makeMode("生命周期", "single", ["lifecycle"]),
      makeMode("消费力 × 生命周期", "cross", ["spend_tier", "lifecycle"])
    ]
  };
}
export const STORE_KEY = "msense-sql-prototype-v1";
export function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.schema === 1 && Array.isArray(saved.abilities)) return saved;
  } catch { /* Keep the application usable when browser storage is unavailable. */ }
  return {
    schema: 1, abilities: [makeAbility()],
    module: { name: "优惠券效果分析", description: "核对支付与核销表现，并观察用户分层差异。", goal: "平台老客提频", capabilityId: "", version: 0, selections: {}, reasoning: "比较实验组与对照组的支付 GMV 和订单核销率，查看所选分层的差异；只描述实际数据，不判断显著性或因果。", considerations: "核销率是订单口径。无显著性检验字段，不作显著性判断。", context: clone(defaultContext), scenario: "normal", attempts: [], savedAt: "" }
  };
}
export function querySignature(mode, context) {
  return hash({
    sql: mode.sql, bindings: mode.parameters, members: mode.members, kind: mode.kind, context,
    fields: mode.fields.map(({ alias, key, role, type, description, entity, timing }) => ({ alias, key, role, type, description, entity, timing }))
  });
}
export function reviewSignature(mode, context) {
  return hash({ query: querySignature(mode, context), fields: mode.fields, name: mode.name });
}
export function moduleSignature(module) {
  const { attempts, savedAt, ...configuration } = module;
  return hash(configuration);
}
export function currentRun(mode, context) {
  const latest = mode.runs.find((run) => run.querySignature === querySignature(mode, context));
  return latest?.status === "success" ? latest : undefined;
}
export function publishIssues(ability) {
  const issues = validateAbility(ability);
  if (ability.scenario !== "normal") issues.push("当前处于异常模拟场景，须恢复正常场景并重新验证后发布；旧成功记录不能替代当前权限或数据检查。");
  for (const mode of ability.modes) {
    const run = currentRun(mode, ability.context);
    if (!run) issues.push(`${mode.name}：当前配置尚无结构合格且有数据的试跑。`);
    else if (run.approvedFor !== reviewSignature(mode, ability.context)) issues.push(`${mode.name}：请核对当前字段定义和数据，并确认结果。`);
  }
  return issues;
}
export function validateMode(mode) {
  const issues = [];
  if (!mode.sql.trim()) issues.push("请编写 SQL。");
  if (mode.parsedSql !== mode.sql || mode.parseError) issues.push("当前 SQL 需要成功模拟解析。");
  if (!mode.fields.length) issues.push("尚无输出字段配置。");
  if (mode.removed.length) issues.push("有已删除或重命名字段需要确认影响。");
  const keys = mode.fields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) issues.push("输出 Key 重复。");
  for (const field of mode.fields) {
    if (!/^[a-zA-Z_]\w*$/.test(field.key)) issues.push(`${field.alias}：Key 须为英文、数字、下划线。`);
    if (!field.name || !field.description || field.role === "pending" || field.type === "unknown") issues.push(`${field.alias}：补齐名称、口径、角色和预期类型。`);
    if (field.review) issues.push(`${field.alias}：来源或粒度发生变化，需要人工复核。`);
    if (field.role === "dimension" && (!field.entity || !field.timing)) issues.push(`${field.alias}：维度需补齐统计实体与取值时点。`);
  }
  for (const alias of ["group_id", "group_name", "is_control"]) {
    if (!mode.fields.some((field) => field.alias === alias && field.key === alias && field.role === "identity")) issues.push(`缺少分组身份映射 ${alias}。本地适配要求该列，生产映射待核验。`);
  }
  if (!mode.fields.some((field) => field.role === "metric")) issues.push("至少定义一个 SQL 输出指标。");
  const dims = mode.fields.filter((field) => field.role === "dimension").map((field) => field.key);
  if (mode.kind === "overall" && (mode.members.length || dims.length)) issues.push("整体模式不能声明业务维度；请提供整体粒度的 SQL。");
  if (mode.kind === "single" && mode.members.length !== 1) issues.push("单维模式必须选择一个成员。");
  if (mode.kind === "cross" && (mode.members.length < 2 || new Set(mode.members).size !== mode.members.length)) issues.push("交叉模式至少包含两个不同成员。");
  if (dims.length !== mode.members.length || mode.members.some((key) => !dims.includes(key))) issues.push("模式成员与 SQL 中定义的维度输出不匹配，不能从独立汇总补出联合结果。");
  for (const param of mode.parameters) {
    const source = parameterCatalog.find((p) => p.key === param.source);
    if (!source) issues.push(`参数 \${${param.name}} 未绑定。`);
    else if (source.type !== param.expectedType) issues.push(`参数 ${param.name} 的声明类型与绑定来源不匹配。`);
    if (param.expectedType.endsWith("_list") && !param.listUsage) issues.push(`列表参数 ${param.name} 须用于 IN (...)，不要加引号。`);
  }
  return issues;
}
export function validateAbility(ability) {
  const issues = [];
  if (!ability.name.trim() || !ability.description.trim() || !ability.owner.trim()) issues.push("请补齐能力名称、负责人和说明。");
  if (!/^[a-zA-Z_]\w*$/.test(ability.key)) issues.push("稳定 Key 格式不合法。");
  if (!ability.modes.length) issues.push("至少保留一种取数模式。");
  ability.modes.forEach((mode) => validateMode(mode).forEach((issue) => issues.push(`${mode.name}：${issue}`)));
  return issues;
}

export function formatValue(value, field = {}, row = {}) {
  if (field.role === "metric" && field.controlDash && row.is_control === 1) return "—";
  if (value === null || value === undefined) return field.nullDisplay || "—";
  if (field.role !== "metric" || field.type !== "number" || typeof value !== "number") return String(value);
  const digits = Math.min(6, Math.max(0, Number(field.precision ?? 2)));
  if (field.format === "percent") return `${(value * 100).toFixed(digits)}%`;
  if (field.format === "integer") return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  if (field.format === "currency") return `${value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${field.unit || "元"}`;
  return value.toFixed(digits) + (field.unit || "");
}
