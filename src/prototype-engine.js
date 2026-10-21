import { clone, uid, hash, definitions, querySignature, moduleSignature, validateMode, formatValue } from "./prototype-data.js";

let worker, nextId = 0;
const pending = new Map();
export function sqlQuery(payload) {
  if (!worker) {
    worker = new Worker(new URL("./sql-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(data.id);
      data.ok ? request.resolve(data) : request.reject(new Error(data.error));
    };
    worker.onerror = () => stopWorker("本地 SQL 引擎启动失败，请重新运行。");
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => stopWorker("本地 SQL 执行超过 5 秒，已终止隔离执行线程。请简化 SQL 后重试。"), 5000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ ...payload, id });
  });
}
function stopWorker(message) {
  worker?.terminate();
  worker = null;
  pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(new Error(message)); });
  pending.clear();
}
export async function parseMode(mode) {
  try {
    const result = await sqlQuery({ sql: mode.sql, bindings: mode.parameters, parsing: true });
    const oldFields = mode.fields;
    const diff = [];
    const grain = hash(result.grain);
    const fields = result.columns.map((alias, index) => {
      const old = oldFields.find((f) => f.alias === alias);
      const source = result.sources[index];
      const sourceKey = hash(source.replace(/\s+/g, " ").trim());
      const observed = result.types[index];
      const known = definitions[alias];
      const base = { alias, key: alias, name: alias, role: "pending", type: observed, format: "decimal", precision: 2, unit: "", nullDisplay: "—", description: "", entity: "", timing: "", ...known };
      const changed = old && (old.sourceKey !== sourceKey || old.grain !== grain || (observed !== "unknown" && old.observed !== "unknown" && old.observed !== observed));
      const review = changed || source.startsWith("来源无法");
      diff.push({ alias, status: old ? (review ? "需复核" : "已保留") : "新增" });
      return { ...(old || base), alias, source, sourceKey, grain, observed, review: review || (old?.review ?? false) };
    });
    const removed = oldFields.filter((field) => !result.columns.includes(field.alias));
    const earlierRemoved = mode.removed.filter((field) => !result.columns.includes(field.alias) && !removed.some((f) => f.alias === field.alias));
    mode.fields = fields;
    mode.removed = [...earlierRemoved, ...removed];
    mode.parameters = result.params;
    mode.parsedSql = mode.sql;
    mode.parseError = "";
    mode.diff = diff;
    mode.revision++;
    return result;
  } catch (error) {
    mode.parseError = error.message;
    // Last successful fields and manual definitions intentionally remain intact.
    throw error;
  }
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function normalize(result, mode, executionId, context, selection) {
  if (result.truncated) throw new Error("结果超过本地 500 行预览上限，数据不完整，不能用于发布或分析。请收窄查询。");
  const selected = selection || mode.fields.filter((f) => f.role === "metric").map((f) => f.key);
  const fields = mode.fields.filter((f) => f.role !== "metric" || selected.includes(f.key));
  const rawRows = result.rows.map((values) => Object.fromEntries(result.columns.map((key, i) => [key, values[i]])));
  for (const field of fields) {
    if (!result.columns.includes(field.alias)) throw new Error(`标准化失败：缺少输出列 ${field.alias}。`);
    if (rawRows.some((row) => row[field.alias] !== null && typeof row[field.alias] !== field.type)) throw new Error(`标准化失败：${field.alias} 预期 ${field.type}，实际值类型不匹配；修改声明不会转换 SQL 值。`);
  }
  const grains = new Set();
  for (const row of rawRows) {
    if (!row.group_id || !row.group_name || ![0, 1].includes(row.is_control)) throw new Error("分组身份缺失或 is_control 不是 0/1。");
    const key = JSON.stringify([row.group_id, ...mode.members.map((member) => row[fields.find((f) => f.key === member)?.alias])]);
    if (grains.has(key)) throw new Error("标准化失败：同一实验组与维度成员组合出现重复行；平台不会静默求和。");
    grains.add(key);
  }
  if (rawRows.length && (!rawRows.some((r) => r.is_control === 1) || !rawRows.some((r) => r.is_control === 0))) throw new Error("标准化失败：缺少对照组或实验组，不能发布为可分析的完整结果。");
  if (rawRows.length && selected.some((key) => rawRows.every((row) => row[fields.find((f) => f.key === key)?.alias] === null))) throw new Error("标准化失败：必需指标整列为空，不能用有行数代替有效数据。");
  const rows = rawRows.map((raw) => {
    const row = { group_name: String(raw.group_name), is_control: String(raw.is_control) };
    fields.filter((f) => f.role === "metric").forEach((f) => { row[f.key] = raw[f.alias] === null ? "" : String(raw[f.alias]); });
    if (mode.members.length === 1) row.dimension_value = raw[fields.find((f) => f.key === mode.members[0]).alias] === null ? "" : String(raw[fields.find((f) => f.key === mode.members[0]).alias]);
    return row;
  });
  return {
    rawRows, fields: clone(fields),
    dataset: {
      execution_id: executionId, query_key: mode.id, name: mode.name, description: "本地示例 Dataset，非生产执行结果",
      ...(mode.members.length === 1 ? { dimension: { dimension_key: mode.members[0], dimension_name: fields.find((f) => f.key === mode.members[0]).name } } : {}),
      metrics: fields.filter((f) => f.role === "metric").map((f) => ({ metric_key: f.key, metric_name: f.name, description: f.description })), rows
    },
    // Explicit prototype companion, not an invented production StandardDataset property.
    adapter: {
      contract: "仅本地演示；交叉成员、group_id、原生类型、空值与观察窗口的生产映射待研发核验",
      group_ids: rawRows.map((r) => r.group_id),
      dimension_members: mode.members.map((key) => ({ key, alias: fields.find((f) => f.key === key).alias })),
      member_tuples: rawRows.map((row) => mode.members.map((key) => ({ key, value: row[fields.find((f) => f.key === key).alias] }))),
      nulls: rawRows.map((row) => fields.filter((f) => row[f.alias] === null).map((f) => f.key)),
      observation_window: { start_date: context.start_date, end_date: context.end_date }
    }
  };
}
export async function executeMode(mode, context, scenario, onChange = () => {}, selection) {
  const snapshot = clone({ ...mode, runs: [] });
  const record = {
    id: uid("exec"), status: "queued", startedAt: new Date().toISOString(), modeId: mode.id, modeName: mode.name,
    revision: mode.revision, snapshot, context: clone(context), scenario, querySignature: querySignature(mode, context), approvedFor: "", error: ""
  };
  mode.runs.unshift(record);
  onChange(record);
  await pause(400);
  record.status = "running";
  onChange(record);
  await pause(650);
  try {
    const issues = validateMode(snapshot);
    if (issues.length) throw new Error(issues.join(" "));
    const errors = {
      permission: "底表权限不足：模拟服务身份未获 demo_orders 读取授权；请核对底表授权后重试。",
      access: "平台准入不足：本地模拟发起人未获取数准入；未切换执行身份。",
      failure: "模拟执行失败：取数服务不可用，未产出 Dataset；请重试。",
      timeout: "模拟执行超时：任务已结束，未用旧成功数据替代本次结果。",
      result_access: "结果查看权限不足：模拟检查拒绝读取结果，不能确认或发布。"
    };
    if (errors[scenario]) throw new Error(errors[scenario]);
    const runContext = scenario === "empty" ? { ...context, libra_id: "0" } : context;
    const result = await sqlQuery({ sql: snapshot.sql, bindings: snapshot.parameters, context: runContext });
    record.renderedSql = result.rendered;
    if (scenario === "missing") { result.columns = result.columns.slice(0, -1); result.rows = result.rows.map((r) => r.slice(0, -1)); }
    if (scenario === "type" && result.rows.length) {
      const i = result.columns.indexOf(snapshot.fields.find((f) => f.role === "metric").alias);
      result.rows[0][i] = "非法数值";
    }
    if (scenario === "grain" && result.rows.length) result.rows.push([...result.rows[0]]);
    if (scenario === "no_control") result.rows = result.rows.filter((r) => r[result.columns.indexOf("is_control")] !== 1);
    Object.assign(record, normalize(result, snapshot, record.id, context, selection));
    record.status = record.rawRows.length ? "success" : "empty";
    if (scenario === "empty") record.effectiveContext = runContext;
  } catch (error) {
    record.status = scenario === "timeout" ? "timeout" : ["permission", "access", "result_access"].includes(scenario) ? "permission" : "failed";
    record.error = error.message;
  }
  record.finishedAt = new Date().toISOString();
  onChange(record);
  return record;
}

export async function analyze(module, version, onChange = () => {}) {
  const snapshot = clone(module);
  delete snapshot.attempts;
  const dataKey = hash({ ability: version.abilityId, version: version.number, selections: snapshot.selections, context: snapshot.context, scenario: snapshot.scenario });
  const attempt = { id: uid("analysis"), startedAt: new Date().toISOString(), status: "running", snapshot, version: version.number, capabilityName: version.name, dataKey, configurationKey: moduleSignature(snapshot), records: [], evidence: [], gaps: [], reused: false };
  const previous = module.attempts.find((a) => a.dataKey === dataKey && a.status === "success");
  module.attempts.unshift(attempt);
  onChange();
  try {
    if (!snapshot.reasoning.trim()) throw new Error("请填写分析思路。");
    const entries = Object.entries(snapshot.selections).filter(([, metrics]) => metrics.length);
    if (!entries.length) throw new Error("请至少选择一个模式和该模式实际提供的指标。");
    if (/\bROI\b|显著性检验|退款率/.test(snapshot.reasoning)) throw new Error("分析思路要求了当前未提供的 ROI、显著性检验或退款率数据，请调整思路或补齐真实输出。");
    if (previous) {
      attempt.records = clone(previous.records);
      attempt.reused = true;
      await pause(700);
    } else {
      for (const [modeId, metrics] of entries) {
        const mode = clone(version.modes.find((m) => m.id === modeId));
        if (!mode) throw new Error("所选取数模式不属于当前固定版本。");
        if (metrics.some((key) => !mode.fields.some((f) => f.key === key && f.role === "metric"))) throw new Error("所选指标不在该模式真实 SQL 输出中。");
        mode.runs = [];
        const record = await executeMode(mode, snapshot.context, snapshot.scenario, () => {}, metrics);
        attempt.records.push(record);
        onChange();
        if (record.status !== "success") throw new Error(record.error || "执行成功但返回空数据，分析输入不足。");
      }
    }
    for (const record of attempt.records) {
      const rows = record.rawRows;
      if (!rows.some((r) => r.is_control === 1) || !rows.some((r) => r.is_control === 0)) throw new Error("输入缺少对照组或实验组，无法完成组间分析。");
      const members = record.snapshot.members;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.is_control !== 0) continue;
        const controlIndex = rows.findIndex((r) => r.is_control === 1 && members.every((key) => {
          const alias = record.fields.find((f) => f.key === key)?.alias;
          return r[alias] === row[alias];
        }));
        if (controlIndex < 0) throw new Error("某个分层缺少对应对照组；证据不完整，未生成正常结论。");
        const control = rows[controlIndex];
        const scope = members.length ? members.map((key) => {
          const f = record.fields.find((field) => field.key === key);
          return `${f.name}=${row[f.alias] ?? "空值"}`;
        }).join("，") : "整体";
        for (const field of record.fields.filter((f) => f.role === "metric")) {
          if (row[field.alias] === null || control[field.alias] === null) throw new Error(`${field.name} 存在空值，不能当作 0 参与分析。`);
          attempt.evidence.push({
            id: `evidence_${attempt.evidence.length + 1}`, executionId: record.id, rowIndex: i, controlIndex,
            metricKey: field.key, scope, fieldName: field.name,
            text: `${record.modeName} · ${scope}：实验组${field.name}为 ${formatValue(row[field.alias], field)}，对照组为 ${formatValue(control[field.alias], field)}。`,
            experimentValue: row[field.alias], controlValue: control[field.alias]
          });
        }
      }
    }
    attempt.status = "success";
    attempt.gaps = ["未提供显著性检验，不作统计显著性判断。", "这是固定示例数据的描述性分析，不能据此推断业务因果。"];
  } catch (error) {
    attempt.status = "insufficient";
    attempt.error = error.message;
    attempt.evidence = [];
    attempt.gaps = [error.message];
  }
  attempt.finishedAt = new Date().toISOString();
  onChange();
  return attempt;
}
