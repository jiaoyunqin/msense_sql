import { sourceType } from "./composer-data.js";
import { abilityProgress } from "./composer-progress.js";

// Derive directory entries from existing checks; never store a second workflow state.
export function abilityCatalogActions(store, ability) {
  if (!ability) throw new Error("当前取数能力已不存在。");
  const progress = abilityProgress(store, ability);
  const readOnly = progress.readOnly || Boolean(ability.readOnly || ability.readonly || ability.preset || ability.builtin);
  const running = ability.runs.find((run) => run.status === "running");
  const history = Boolean(running || ability.archived || !progress.canTrial);
  const trial = history
    ? progress.hasRuns ? { label: "查看验证", runId: running?.id || progress.summary?.runId || "", history: true } : null
    : { label: "试跑", runId: "", history: false };
  const version = ability.versions.at(-1);
  return {
    readOnly, label: readOnly ? "查看" : "编辑", trial,
    analysis: sourceType(ability) === "custom_sql" && !ability.archived && Boolean(version),
    versionNumber: version?.number || 0
  };
}
