import { findTrialRun } from "./composer-trial-records.js";

const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const name = (value, missing) => typeof value === "string" && value.trim() ? value : missing;

function snapshotFields(record, mode) {
  const rows = list(record.rawRows);
  const stored = list(record.fields).length ? list(record.fields) : list(mode?.fields);
  if (!stored.length) {
    return [...new Set(rows.flatMap((row) => Object.keys(row)))].map((alias) => ({
      alias, key: alias, name: "字段名称未记录", rawDisplay: true
    }));
  }
  return stored.map((field) => ({
    ...field, name: name(field.name, "字段名称未记录"), key: field.key || field.alias || "",
    rawDisplay: field.role === "metric" && field.type === "number"
      && (!field.format || (field.format !== "integer" && field.precision == null))
  }));
}

// Only this run's saved data is used, including when a legacy definition is partial.
export function trialSnapshot(obj, runId, kind = "ability") {
  const run = findTrialRun(obj, runId);
  if (!run) return null;
  const definition = object(run.definition) || (kind === "item" ? object(run.snapshot) : null);
  const modes = list(run.modes).map((mode) => ({ ...mode, name: name(mode.name, "任务名称未记录") }));
  const entries = kind === "item" ? [run] : list(run.records);
  const records = entries.map((entry) => {
    const storedMode = modes.find((candidate) => candidate.id === entry.modeId);
    const mode = { ...storedMode, ...object(entry.snapshot),
      fields: list(entry.snapshot?.fields).length ? entry.snapshot.fields : storedMode?.fields };
    return {
      ...entry, modeName: name(entry.modeName || mode?.name, "任务名称未记录"),
      fields: snapshotFields(entry, mode), rawRows: list(entry.rawRows)
    };
  });
  for (const [index, entry] of entries.entries()) {
    if (!modes.some((mode) => mode.id != null && mode.id === entry.modeId)) {
      modes.push({
        ...(object(entry.snapshot) || {}), id: entry.modeId,
        name: records[index].modeName, fields: records[index].fields, recordId: entry.id
      });
    }
  }
  const recordedFields = [...records.flatMap((entry) => entry.fields), ...modes.flatMap((mode) => list(mode.fields))];
  const metrics = recordedFields.filter((field) => field.role === "metric");
  const dimensions = recordedFields.filter((field) => field.role === "dimension");
  for (const ref of list(definition?.metrics)) {
    const fields = list(ref.definition?.draft?.metricDefinitions ?? ref.definition?.draft?.fields);
    metrics.push(...fields.filter((field) => field.role === "metric"
      && (!Array.isArray(ref.metricKeys) || ref.metricKeys.includes(field.key))));
  }
  for (const ref of list(definition?.dimensions)) {
    const draft = ref.definition?.draft;
    if (draft) dimensions.push({ key: draft.dimensionKey, name: draft.dimensionName });
  }
  if (kind === "item" && definition?.draft) {
    if (definition.kind === "metric") metrics.push(...list(definition.draft.metricDefinitions ?? definition.draft.fields).filter((field) => field.role === "metric"));
    if (definition.kind === "dimension") dimensions.push({ key: definition.draft.dimensionKey, name: definition.draft.dimensionName });
  }
  const unique = (fields) => [...new Map([...fields].reverse().map((field) => [
    field.key || field.alias || field.name, { ...field, name: name(field.name, "名称未记录") }
  ])).values()];
  const incomplete = !definition || !definition.name || (kind === "ability" && (
    !Array.isArray(definition.metrics) || !Array.isArray(definition.dimensions) || !Array.isArray(definition.groups)
    || list(definition.metrics).some((ref) => !ref.definition?.draft)
    || list(definition.dimensions).some((ref) => !ref.definition?.draft)
  ));
  return {
    run, definition, context: object(run.context) || {}, modes, records,
    metrics: unique(metrics), dimensions: unique(dimensions),
    name: name(definition?.name, "名称未记录"), incomplete,
    fieldsIncomplete: records.some((record, index) => !list(entries[index].fields).length
      && !list(entries[index].snapshot?.fields).length
      && !list(list(run.modes).find((mode) => mode.id === entries[index].modeId)?.fields).length),
    kind
  };
}
