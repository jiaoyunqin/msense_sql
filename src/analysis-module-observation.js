export const observationOptions = [
  ["follow", "跟随实验分析"], ["start", "实验开始日后"], ["end", "实验结束日后"]
];

export function validObservationDays(days) {
  return Number.isInteger(days) && days >= 0 && days <= 2147483647;
}

export function moduleObservationInput(configuration, input, definition) {
  const { anchor, days } = configuration.observation || {};
  if (!anchor || anchor === "follow") return { input };
  if (!["start", "end"].includes(anchor) || !validObservationDays(days))
    return { error: "模块观测区间无效，请检查基准日和偏移天数。" };
  const stamp = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  };
  const base = stamp(definition?.period?.[anchor === "start" ? 0 : 1]);
  const start = stamp(input.start), end = stamp(input.end);
  if (![base, start, end].every(Number.isFinite)) return { error: "无法确定模块观测区间，请核对实验日期。" };
  const limit = Math.min(end, base + days * 86400000);
  if (limit < start) return { error: "模块观测截止日早于本次观测开始日，无可用数据。" };
  return { input: limit === end ? input : { ...input, end: new Date(limit).toISOString().slice(0, 10) } };
}

// A report reads the effective dates and results captured during execution.
export function moduleObservationResult(module, entry, result) {
  const anchor = module.configuration.observation?.anchor;
  if (!anchor || anchor === "follow" || result.status !== "success")
    return { entry, result };
  const saved = result.moduleObservations?.[module.id];
  if (!saved?.end || saved.error) return { entry, result: { ...result, status: "failed",
    error: saved?.error || "本次快照未保存模块观测区间的取数结果。", rows: [], breakdowns: [] } };
  if (saved.end === entry.input.end) return { entry, result };
  return { entry: { ...entry, input: { ...entry.input, end: saved.end } },
    result: { ...result, rows: saved.rows, breakdowns: saved.breakdowns, couponIntervals: undefined } };
}
