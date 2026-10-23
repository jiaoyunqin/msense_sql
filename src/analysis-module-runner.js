import { clone, uid, hash } from "./composer-data.js";
import { runAnalysis } from "./composer-engine.js";
import { sourceDefinition, moduleIssues, moduleConfiguration } from "./analysis-module-data.js";

function fixedRpcRecords(store, module, source) {
  const definition = sourceDefinition(store, source);
  const metrics = definition.metrics.filter((field) => source.metricKeys.includes(field.key));
  const dimensions = definition.dimensions.filter((field) => source.dimensionKeys.includes(field.key));
  const scopes = dimensions.length ? dimensions : [{ key: "overall", name: "整体" }];
  const sampleValue = (field, groupIndex) => {
    const factor = groupIndex ? 1.12 : 1;
    if (source.capabilityId === "experiment-config") {
      const values = [
        ["2026-10-01 至 2026-10-03", "2026-10-01 至 2026-10-03"], [.5, .5],
        ["无", "10 元券"], ["不适用", "领取后 3 天"], ["不适用", "示例商品"],
        [0, 1], ["不适用", "示例会场"]
      ];
      return values[Number(field.key.split("_").at(-1))][groupIndex];
    }
    if (field.name.includes("显著性")) return groupIndex ? .08 : .2;
    if (field.name.includes("率") || field.name.includes("增幅")) return .4 * factor;
    if (field.name.includes("ROI")) return 2.4 * factor;
    // A metric's fixed sample does not change when neighboring metrics are deselected.
    return (Number(field.key.split("_").at(-1)) + 1) * 100 * factor;
  };
  return scopes.map((dimension) => {
    const id = uid("rpcdata");
    const fields = [
      { alias: "group_name", key: "group_name", name: "分组", role: "identity", type: "string" },
      ...metrics.map((field) => ({ ...field, alias: field.key,
        type: typeof sampleValue(field, 0), format: "decimal", precision: 2 }))
    ];
    const rawRows = ["对照组", "实验组"].map((group, groupIndex) => Object.fromEntries([
      ["group_name", group], ["is_control", groupIndex ? 0 : 1],
      ...metrics.map((field) => [field.key, sampleValue(field, groupIndex)])
    ]));
    return { id, modeName: `${definition.name} · ${dimension.name}`, sourceId: source.id,
      status: "success", fields, rawRows, fixedSample: true, context: clone(module.context),
      snapshot: { members: [], sql: "", fields }, renderedSql: "",
      evidence: metrics.map((field) => ({
        executionId: id, rowIndex: 1, controlIndex: 0, metricKey: field.key,
        text: `${definition.name} · ${dimension.name}：实验组${field.name}为 ${rawRows[1][field.key]}，对照组为 ${rawRows[0][field.key]}。`
      })) };
  });
}
export async function runModule(store, module, changed, sourceId = "") {
  const snapshot = clone(module);
  delete snapshot.attempts;
  const sources = snapshot.sources.filter((source) => !sourceId || source.id === sourceId);
  const issues = moduleIssues(store, snapshot, sources);
  if (issues.length) throw new Error(issues.join(" "));
  if (!snapshot.reasoning.trim() && !sourceId) throw new Error("请填写分析思路。");
  const attempt = {
    id: uid("analysis"), moduleId: module.id, startedAt: new Date().toISOString(),
    status: "running", snapshot, version: module.versions.at(-1)?.number || 0,
    capabilityName: module.name, records: [], evidence: [], gaps: [], reused: false,
    configurationKey: hash(moduleConfiguration(module)), sourceTrial: Boolean(sourceId)
  };
  module.attempts.unshift(attempt); changed(attempt);
  try {
    for (const source of sources) {
      const definition = sourceDefinition(store, source);
      if (source.kind === "rpc") {
        if (snapshot.scenario !== "normal") throw new Error("内置 RPC 固定样例仅支持正常场景。");
        const records = fixedRpcRecords(store, snapshot, source);
        attempt.records.push(...records);
        if (source.showInReport) attempt.evidence.push(...records.flatMap((record) => record.evidence));
        attempt.gaps.push("内置 RPC 使用本地固定样例，结果不随实验或日期变化。");
      } else {
        const work = { ...snapshot, capabilityId: source.capabilityId, version: source.version, attempts: [],
          reasoning: sourceId ? "核对所选指标和维度的输入数据。" : snapshot.reasoning,
          selections: Object.fromEntries(definition.version.modes.map((mode) => [mode.id,
            source.dimensionKeys.includes(mode.id)
              ? mode.fields.filter((field) => field.role === "metric" && source.metricKeys.includes(field.key)).map((field) => field.key)
              : []])) };
        const result = await runAnalysis({ ...store, analysis: work });
        attempt.records.push(...result.records.map((record) => ({ ...record, sourceId: source.id })));
        if (result.status !== "success") throw new Error(result.error || result.gaps.join(" "));
        if (source.showInReport) attempt.evidence.push(...result.evidence);
        attempt.gaps.push(...result.gaps);
      }
      changed(attempt);
    }
    attempt.status = "success";
    attempt.gaps = [...new Set(attempt.gaps)];
    attempt.evidence.forEach((evidence, index) => { evidence.id = `evidence_${index + 1}`; });
  } catch (error) {
    attempt.status = "insufficient"; attempt.error = error.message;
    attempt.evidence = []; attempt.gaps = [error.message];
  }
  attempt.finishedAt = new Date().toISOString(); changed(attempt);
  return attempt;
}
