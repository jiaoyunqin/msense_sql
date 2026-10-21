import initSqlJs from "sql.js/dist/sql-asm.js";
import { parameterCatalog, defaultContext } from "./prototype-data.js";

// This database contains generated fixtures only. There is no network or production connection.
const database = initSqlJs().then((SQL) => {
  const db = new SQL.Database();
  db.run(`CREATE TABLE demo_users (user_id TEXT PRIMARY KEY, historical_spend REAL, lifecycle TEXT, city_id INTEGER);
    CREATE TABLE demo_orders (order_id TEXT, user_id TEXT, libra_id INTEGER, pgdp_experiment_id TEXT,
      group_id TEXT, group_name TEXT, is_control INTEGER, version_id INTEGER,
      order_date TEXT, coupon_meta_id INTEGER, pay_amount REAL, redeemed INTEGER);`);
  const userStmt = db.prepare("INSERT INTO demo_users VALUES (?, ?, ?, ?)");
  const orderStmt = db.prepare("INSERT INTO demo_orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let index = 0;
  const amounts = [[78, 96], [160, 186], [310, 365]];
  for (let group = 0; group < 2; group++) {
    for (let tier = 0; tier < 3; tier++) {
      for (let life = 0; life < 2; life++) {
        const user = `u_${group}_${tier}_${life}`;
        userStmt.run([user, [80, 300, 800][tier], ["新客", "成熟老客"][life], tier + 100]);
        for (let day = 1; day <= 3; day++) {
          for (let coupon = 0; coupon < 2; coupon++) {
            orderStmt.run([`order_${++index}`, user, 4823214, "pgdp_demo_01",
              group ? "experiment" : "control", group ? "实验组" : "对照组",
              group ? 0 : 1, group + 1, `2026-10-0${day}`, coupon + 101,
              amounts[tier][group] + life * 12 + day * 3 + coupon * 5,
              (tier + life + day + coupon + group) % 3 === 0 ? 0 : 1]);
          }
        }
      }
    }
  }
  userStmt.free();
  orderStmt.free();
  db.run("PRAGMA query_only = ON");
  return db;
});

// Lexical masking protects literal/comment boundaries. SQLite, not this scanner, checks SQL grammar.
function maskSQL(sql) {
  let masked = "", state = "code";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1];
    if (state === "line") {
      if (c === "\n") state = "code";
      masked += c === "\n" ? "\n" : " ";
    } else if (state === "block") {
      if (c === "*" && next === "/") { masked += "  "; i++; state = "code"; }
      else masked += c === "\n" ? "\n" : " ";
    } else if (state === "quote") {
      if (c === "'" && next === "'") { masked += "  "; i++; }
      else { masked += " "; if (c === "'") state = "code"; }
    } else if (c === "-" && next === "-") { state = "line"; masked += "  "; i++; }
    else if (c === "/" && next === "*") { state = "block"; masked += "  "; i++; }
    else if (c === "'") { state = "quote"; masked += " "; }
    else masked += c;
  }
  if (state === "quote" || state === "block") throw new Error("字符串或注释未闭合。无法精确定位，请检查引号和注释。");
  return masked;
}
function checkQuery(sql) {
  const masked = maskSQL(sql);
  if (!/^\s*(SELECT|WITH)\b/i.test(masked)) throw new Error("本地模拟只支持只读 SELECT / WITH 查询。");
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|RECURSIVE|VACUUM)\b/i.test(masked)) throw new Error("本地模拟不支持写入、DDL、PRAGMA 或递归查询。");
  if (masked.replace(/;\s*$/, "").includes(";")) throw new Error("只允许一个只读查询，不能提交多语句。");
  if (/\$\{[^}]*\}/.test(sql) && !/\$\{\w+\}/.test(sql)) throw new Error("参数占位符须为 ${英文Key}。");
  return masked;
}
function literal(value, type, key) {
  if (value === undefined || value === null || String(value).trim() === "") throw new Error(`必需参数 ${key} 缺失；不会替换成 NULL。`);
  const text = String(value).trim();
  if (type === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) throw new Error(`${key} 应为数字。`);
    return String(Number(text));
  }
  if (type === "number_list") {
    if (!/^\d+(\s*,\s*\d+)*$/.test(text)) throw new Error(`${key} 应为非空数字列表，以逗号分隔。`);
    return text.split(",").map((n) => String(Number(n))).join(",");
  }
  if (type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) throw new Error(`${key} 日期格式不合法。`);
  }
  return `'${text.replaceAll("'", "''")}'`;
}
function bindSQL(sql, bindings, context, parsing) {
  const masked = checkQuery(sql);
  const params = [];
  const seen = new Set();
  const rendered = sql.replace(/\$\{(\w+)\}/g, (match, name, offset) => {
    if (masked.slice(offset, offset + match.length) !== match) throw new Error(`参数 ${name} 在引号或注释内；参数字面量由本地引擎生成，请移除外层引号。`);
    const direct = parameterCatalog.find((p) => p.key === name);
    const binding = bindings.find((p) => p.name === name);
    const source = parameterCatalog.find((p) => p.key === (binding?.source || direct?.key));
    const listUsage = /\bIN\s*\(\s*$/i.test(masked.slice(0, offset)) && /^\s*\)/.test(masked.slice(offset + match.length));
    const type = binding?.expectedType || direct?.type || (listUsage ? "number_list" : "number");
    if (!seen.has(name)) {
      params.push({ name, source: binding?.source ?? direct?.key ?? "", expectedType: type, listUsage });
      seen.add(name);
    }
    if (!source && !parsing) throw new Error(`参数 ${name} 未绑定，不能试跑。`);
    if (source && source.type !== type) throw new Error(`参数 ${name} 声明类型 ${type} 与来源 ${source.type} 不兼容。`);
    if (type.endsWith("_list") && !listUsage) throw new Error(`列表参数 ${name} 需要用于 IN (...)。`);
    // Unknown aliases get a typed syntax-check sample, never a runtime fallback.
    const sample = { number: "1", number_list: "1,2", date: "2026-10-01", string: "demo" };
    return literal(source ? (parsing ? defaultContext[source.key] : context[source.key]) : sample[type], type, name);
  });
  if (!parsing) {
    const requiredDates = params.some((p) => ["start_date", "end_date"].includes(p.source));
    if (requiredDates && (!context.start_date || !context.end_date || context.start_date > context.end_date)) throw new Error("观察日期缺失或开始日期晚于结束日期。");
    if (context.pgdp_experiment_id && context.pgdp_experiment_id !== "pgdp_demo_01") throw new Error("该钱效实验不属于本地示例 Libra 实验，不能猜测实验映射。");
  }
  return { rendered, params };
}
function outputSources(sql, columns) {
  const masked = maskSQL(sql);
  let depth = 0, select = -1, from = -1;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "(") depth++;
    if (masked[i] === ")") depth--;
    if (depth === 0 && /\bSELECT\b/i.test(masked.slice(i, i + 6)) && (i === 0 || /\W/.test(masked[i - 1]))) select = i + 6;
    if (select >= 0 && depth === 0 && /^FROM\b/i.test(masked.slice(i)) && /\W/.test(masked[i - 1])) { from = i; break; }
  }
  const parts = [];
  let start = select, level = 0;
  const end = from < 0 ? sql.length : from;
  for (let i = select; i < end && select >= 0; i++) {
    if (masked[i] === "(") level++;
    if (masked[i] === ")") level--;
    if (masked[i] === "," && level === 0) { parts.push(sql.slice(start, i).trim()); start = i + 1; }
  }
  if (start >= 0) parts.push(sql.slice(start, end).trim());
  const expressions = Object.fromEntries(parts.map((part) => {
    const alias = part.match(/\bAS\s+([a-zA-Z_]\w*)\s*$/i);
    return alias ? [alias[1], part] : ["", ""];
  }));
  return {
    // Complex projections without explicit AS are visible, but matching is deliberately conservative.
    sources: columns.map((name) => expressions[name] || "来源无法可靠识别：请在 SQL 中显式使用 AS 别名"),
    grain: from < 0 ? "" : sql.slice(from).replace(/\s+/g, " ").trim()
  };
}

self.onmessage = async ({ data: { id, sql, bindings = [], context = {}, parsing = false } }) => {
  try {
    const db = await database;
    const { rendered, params } = bindSQL(sql, bindings, context, parsing);
    const stmt = db.prepare(rendered);
    try {
      const columns = stmt.getColumnNames();
      if (!columns.length) throw new Error("查询未输出字段。");
      if (new Set(columns).size !== columns.length) throw new Error("SQL 输出别名重复；请明确每个字段的唯一 AS 别名。");
      if (columns.some((c) => !/^[a-zA-Z_]\w*$/.test(c))) throw new Error("请为计算表达式添加英文 AS 别名。");
      const rows = [];
      while (stmt.step() && rows.length <= 500) rows.push(stmt.get());
      const truncated = rows.length > 500;
      const types = columns.map((_, i) => {
        const values = rows.map((r) => r[i]).filter((v) => v !== null);
        const observed = [...new Set(values.map((v) => typeof v))];
        return observed.length === 1 && ["number", "string"].includes(observed[0]) ? observed[0] : "unknown";
      });
      self.postMessage({ id, ok: true, columns, rows: rows.slice(0, 500), truncated, types, params, rendered, ...outputSources(sql, columns) });
    } finally { stmt.free(); }
  } catch (error) {
    self.postMessage({ id, ok: false, error: `${error.message}（本地 SQLite；无法精确定位行列）` });
  }
};
