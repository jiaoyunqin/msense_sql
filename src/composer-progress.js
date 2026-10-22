import {
  clone, defaultContext, canEditDefinition, itemIssues, abilityIssues,
  itemCurrentRun, itemQuerySignature, itemReviewSignature,
  abilityCurrentRun, abilityQuerySignature, abilitySignature
} from "./composer-data.js";
import { itemPublishIssues, abilityPublishIssues } from "./composer-engine.js";

const summaryLabels = {
  running: "运行中", pending_review: "成功待核对", reviewed: "已核对",
  needs_review: "需重新核对", needs_run: "需重新试跑",
  empty: "空结果", failed: "失败", permission: "权限不足", timeout: "超时"
};

function runSummary(runs, currentRun, querySignature, reviewSignature, reviewed, signatureKey) {
  const latest = runs[0];
  // An in-flight retry must not be hidden by an earlier valid result.
  const run = latest?.status === "running" ? latest : currentRun || latest;
  if (!run) return null;
  const queryMatches = querySignature !== "invalid-reference" && run[signatureKey] === querySignature;
  let status = run.status;
  if (status !== "running" && !queryMatches) status = "needs_run";
  else if (status === "success") {
    status = reviewed && run === currentRun ? "reviewed"
      : run.approvedFor && run.approvedFor !== reviewSignature ? "needs_review" : "pending_review";
  }
  return {
    run, runId: run.id, runStatus: run.status, status,
    label: summaryLabels[status] || status,
    at: run.startedAt || run.finishedAt || "",
    queryMatches, isCurrent: run === currentRun, error: run.error || ""
  };
}

export function publicationProgress(obj) {
  const versions = obj.versions || [], latestVersion = versions.at(-1) || null;
  return {
    hasVersions: versions.length > 0, versionCount: versions.length, latestVersion,
    latestNumber: latestVersion?.number ?? null, publishedAt: latestVersion?.publishedAt || ""
  };
}

function progress(obj, configIssues, publishIssues, currentRun, summary, reviewed, standalone = true) {
  const readOnly = !canEditDefinition(obj);
  if (readOnly) publishIssues.push("仅创建人可以发布新版本。");
  const canTrial = configIssues.length === 0, hasRuns = Boolean(obj.runs?.length);
  return {
    canTrial, canPublish: standalone && !readOnly && publishIssues.length === 0,
    readOnly, hasRuns, configIssues, publishIssues, nextIssue: configIssues[0] || "",
    trialEntry: standalone ? canTrial ? "trial" : hasRuns ? "history" : null : null,
    currentRun: currentRun || null, reviewed, summary,
    showValidationSummary: !obj.draft && hasRuns,
    ...publicationProgress(obj)
  };
}

// Definition checks omit trial input values; inline SQL keeps the owner flow.
export function itemProgress(item, context = item.context || defaultContext, scenario = item.scenario || "normal") {
  const configIssues = itemIssues(item), currentRun = itemCurrentRun(item, context);
  const reviewSignature = itemReviewSignature(item, context);
  const reviewed = Boolean(currentRun && scenario === "normal" && currentRun.scenario === "normal"
    && currentRun.approvedFor === reviewSignature);
  const summary = runSummary(item.runs, currentRun, itemQuerySignature(item, context), reviewSignature, reviewed, "querySignature");
  return progress(item, configIssues, itemPublishIssues(item, context, scenario),
    currentRun, summary, reviewed, !item.ownerAbilityId);
}

export function abilityProgress(store, ability) {
  // Existing checks complete group metadata and publication also syncs SQL grains.
  // Use copies for those checks; run/review identity always uses the live definition.
  const configIssues = abilityIssues(store, clone(ability));
  const currentRun = abilityCurrentRun(store, ability), reviewSignature = abilitySignature(store, ability);
  const reviewed = Boolean(currentRun && ability.scenario === "normal" && currentRun.approvedFor === reviewSignature);
  const summary = runSummary(ability.runs, currentRun, abilityQuerySignature(store, ability), reviewSignature, reviewed, "signature");
  return progress(ability, configIssues, abilityPublishIssues(store, clone(ability)), currentRun, summary, reviewed);
}
