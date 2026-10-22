import { canViewHistory, clone, resolveItem, outputDimensions, crossDimensionKeys } from "./composer-data.js";
import { abilityProgress } from "./composer-progress.js";
import { abilityModes } from "./composer-engine.js";
import { metricFields } from "./composer-metrics.js";

// Directory checkboxes select evidence for a run, never edit the definition.
export function abilityCatalogContent(store, ability) {
  const sources = new Map();
  const metrics = ability.metrics.flatMap((ref) => {
    let source;
    try { source = resolveItem(store, ref); sources.set(ref.itemId, source); }
    catch { /* A broken reference must not prevent expanding the card. */ }
    return ref.metricKeys.map((key) => {
      const field = source && metricFields(source).find((field) => field.key === key);
      return { ...field, key, name: field?.name || key, available: Boolean(field),
        id: JSON.stringify([ref.itemId, key]), itemId: ref.itemId };
    });
  });
  let modes = [];
  try { modes = abilityModes(store, clone(ability)); }
  catch { /* Keep readable configuration even before it can be run. */ }
  const dimensions = new Map();
  const addDimension = (members, name, description = "") => {
    const id = JSON.stringify([...members].sort());
    if (!dimensions.has(id)) dimensions.set(id, { id, name, description, modeIds: [] });
    return dimensions.get(id);
  };
  if (ability.singleSqlFlow) {
    const source = sources.get(ability.sqlItemId) || sources.values().next().value;
    const fields = source ? outputDimensions(source) : [];
    fields.forEach((field) => addDimension([field.key], field.name, field.description));
    for (const cross of ability.crossDimensions || []) {
      const members = crossDimensionKeys(cross);
      addDimension(members, cross.name || members.map((key) => fields.find((field) => field.key === key)?.name || key).join(" × "));
    }
  } else {
    for (const group of ability.groups) {
      const members = group.queryItemId
        ? (sources.get(group.queryItemId) ? outputDimensions(sources.get(group.queryItemId)).map((field) => field.key) : group.members)
        : group.members.map((id) => {
          try { return resolveItem(store, ability.dimensions.find((ref) => ref.itemId === id)).draft.dimensionKey; }
          catch { return id; }
        });
      if (members.length) addDimension(members, group.name, group.description);
    }
  }
  for (const mode of modes.filter((mode) => mode.kind !== "overall")) {
    const names = mode.members.map((key) => mode.fields.find((field) => field.key === key)?.name || key);
    addDimension(mode.members, names.join(" × "), mode.description).modeIds.push(mode.id);
  }
  return { metrics, dimensions: [...dimensions.values()], modes };
}

// Derive directory entries from existing checks; never store a second workflow state.
export function abilityCatalogActions(store, ability) {
  if (!ability) throw new Error("当前取数能力已不存在。");
  const progress = abilityProgress(store, ability);
  const readOnly = progress.readOnly;
  const running = ability.runs.find((run) => run.status === "running");
  const history = Boolean(running || !progress.canTrial);
  const trial = history
    ? progress.hasRuns && canViewHistory(ability) ? { label: "查看验证", runId: running?.id || progress.summary?.runId || "", history: true } : null
    : { label: "试跑", runId: "", history: false };
  const version = ability.versions.at(-1);
  return {
    readOnly, label: "展开", trial,
    view: true,
    edit: !readOnly, history: canViewHistory(ability),
    analysis: Boolean(version),
    versionNumber: version?.number || 0
  };
}
