export function trialRuns(obj) {
  return Array.isArray(obj?.runs) ? obj.runs : [];
}

export function findTrialRun(obj, runId) {
  if (runId == null || runId === "") return null;
  return trialRuns(obj).find((run) => run?.id === runId) ?? null;
}

export function trialRecordStatus(run) {
  switch (run?.status) {
    case "running": return "运行中";
    case "success": return "已完成";
    case "empty": return "空结果";
    case "failed": return "失败";
    case "permission": return "权限不足";
    case "timeout": return "超时";
    case "insufficient": return "分析输入不足";
    default: return "状态未记录";
  }
}

export function trialRecordTime(run) {
  const value = run?.startedAt;
  if (value == null || value === "" ||
    (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date))) {
    return "时间未记录";
  }
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "时间未记录" : time.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
}

export function trialExperiment(run) {
  const experiment = run?.context?.libra_id;
  return experiment == null ? "" : String(experiment);
}
