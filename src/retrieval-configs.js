import {
  clone, uid, newItem, newAbility, abilityDefinition, sourceType, completeGroup,
  syncQueryGroups, resolveItem, directQuery, outputDimensions
} from "./composer-data.js";
import { assertMutable } from "./composer-management.js";
import { metricFields } from "./composer-metrics.js";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string";
const strings = (value) => Array.isArray(value) && value.every(text);
const values = (value) => Array.isArray(value) && value.every((v) =>
  v === null || text(v) || (typeof v === "number" && Number.isFinite(v)));
const unreadable = () => { throw new Error("来源能力的完整取数定义无法读取，请重新选择。"); };

function checkArrays(definition) {
  if (!record(definition) || !Array.isArray(definition.metrics)
    || !Array.isArray(definition.dimensions) || !Array.isArray(definition.groups)) unreadable();
}

function checkSQL(definition, ref, kind) {
  if (!record(definition) || definition.id !== ref.itemId || definition.kind !== kind
    || !text(definition.name) || !text(definition.description)) unreadable();
  if (sourceType(definition) === "builtin_rpc" || definition.unavailable)
    throw new Error(`来源“${definition.name}”没有可载入的完整 SQL 定义。`);
  const d = definition.draft;
  if (!record(d) || !text(d.sql) || !text(d.parsedSql) || !text(d.parseError)
    || !Array.isArray(d.fields) || !Array.isArray(d.parameters)
    || !Array.isArray(d.removed) || !Array.isArray(d.diff)) unreadable();
  if (d.fields.some((f) => !record(f) || !["alias", "key", "name", "description", "role", "type"].every((key) => text(f[key])))
    || d.parameters.some((p) => !record(p) || !["name", "source", "expectedType"].every((key) => text(p[key])))
    || (d.metricDefinitions !== undefined && (!Array.isArray(d.metricDefinitions)
      || d.metricDefinitions.some((m) => !record(m) || !["alias", "key", "name", "calculation"].every((key) => text(m[key])))))
    || (d.enumValues !== undefined && !values(d.enumValues))) unreadable();
  if (kind === "dimension" && !["dimensionKey", "dimensionName", "entity", "idAlias", "valueAlias", "valueType", "timing"].every((key) => text(d[key]))) unreadable();
  if (kind === "metric") metricFields(definition);
}

function checkReference(ref, kind) {
  if (!record(ref) || !text(ref.itemId) || !ref.itemId
    || !Number.isInteger(ref.version) || ref.version < 0
    || (kind === "metric" && !strings(ref.metricKeys))) unreadable();
  checkSQL(ref.definition, ref, kind);
}

function groupFields(definition, group) {
  if (group.queryItemId) {
    const ref = definition.metrics.find((r) => r.itemId === group.queryItemId);
    if (!ref || !directQuery(ref.definition)) unreadable();
    const fields = outputDimensions(ref.definition);
    if (!fields.length) unreadable();
    return fields.map((f) => ({ key: f.key }));
  }
  return group.members.map((id) => {
    const ref = definition.dimensions.find((r) => r.itemId === id);
    if (!ref) unreadable();
    return { itemId: id, key: ref.definition.draft.dimensionKey };
  });
}

function checkDefinition(definition) {
  checkArrays(definition);
  for (const ref of definition.metrics) checkReference(ref, "metric");
  for (const ref of definition.dimensions) checkReference(ref, "dimension");
  const refs = [...definition.metrics, ...definition.dimensions];
  if (new Set(refs.map((r) => r.itemId)).size !== refs.length) unreadable();
  for (const group of definition.groups) {
    if (!record(group) || !text(group.id) || !group.id || !text(group.name)
      || !strings(group.members) || (group.queryItemId !== undefined && !text(group.queryItemId))
      || (group.valueFilters !== undefined && !record(group.valueFilters))) unreadable();
    const fields = groupFields(definition, group);
    if (group.queryItemId && group.members.some((key) => !fields.some((f) => f.key === key))) unreadable();
    const filterKeys = new Set();
    for (const [key, selected] of Object.entries(group.valueFilters || {})) {
      const field = fields.find((f) => f.key === key) || fields.find((f) => f.itemId === key);
      if (!field || filterKeys.has(field.key) || !values(selected)) unreadable();
      filterKeys.add(field.key);
    }
  }
}

function pinnedReference(store, ref) {
  const item = store.items.find((candidate) => candidate.id === ref.itemId);
  if (!item || item.archived || item.unavailable || sourceType(item) === "custom_sql"
    || !ref.version || !Array.isArray(item.versions))
    throw new Error(`内置来源“${ref.definition.name}”的固定版本已不可用。`);
  const definition = resolveItem(store, ref);
  checkSQL(definition, ref, ref.definition.kind);
  if (sourceType(definition) !== "builtin_sql") unreadable();
  return { itemId: ref.itemId, version: ref.version };
}

function readSource(store, target, sourceId) {
  const source = store.abilities.find((candidate) => candidate?.id === sourceId);
  if (!source || source.id === target?.id) throw new Error("来源能力已不存在或是当前能力，请重新选择。");
  if (source.archived) throw new Error("来源能力已归档，请重新选择。");
  if (source.unavailable || sourceType(source) === "builtin_rpc")
    throw new Error("该内置能力只有固定样例，没有可载入的完整取数定义。");
  if (!text(source.name) || !text(source.description) || !Array.isArray(source.versions)) unreadable();
  const hasVersions = source.versions.length > 0;
  const version = source.versions.at(-1);
  if (!hasVersions && (!text(source.savedAt) || !source.savedAt.trim()))
    throw new Error("来源能力尚未保存，请重新选择。");
  if (hasVersions && (!record(version) || !Number.isInteger(version.number) || version.number < 1)) unreadable();
  let definition;
  if (hasVersions) {
    // Published definitions are self-contained. Never resolve custom SQL against
    // an edited live draft when a fixed ability snapshot is available.
    checkDefinition(version.definition);
    if (version.definition.id !== source.id) unreadable();
    definition = clone(version.definition);
  } else {
    checkArrays(source);
    definition = abilityDefinition(store, source);
    checkDefinition(definition);
  }
  for (const ref of [...definition.metrics, ...definition.dimensions])
    if (sourceType(ref.definition) !== "custom_sql") pinnedReference(store, ref);
  return { source, definition, versionLabel: version ? `v${version.number}` : "已保存草稿" };
}

export function listAbilitySources(store, target) {
  const rows = [];
  for (const source of store.abilities) {
    try {
      const { versionLabel } = readSource(store, target, source.id);
      rows.push({ id: source.id, name: source.name, key: source.key || "", description: source.description || "", versionLabel });
    } catch { /* Unreadable definitions are not offered as load sources. */ }
  }
  return rows;
}

export function hasAbilityRetrievalContent(target) {
  return ["metrics", "dimensions", "groups"].some((key) => Array.isArray(target?.[key]) && target[key].length > 0);
}

function assertTarget(store, target) {
  if (!record(target) || target.draft || !text(target.id) || !target.id
    || !Array.isArray(store.items) || !Array.isArray(store.abilities))
    throw new Error("请先打开一个可编辑的取数能力。");
  assertMutable(target);
  if (target.readOnly || target.readonly || target.preset || target.builtin || Object.isFrozen(target) || Object.isFrozen(store.items))
    throw new Error("当前能力只读，不能载入取数内容。");
  const referencedIds = new Set([...(target.metrics || []), ...(target.dimensions || [])].map((r) => r.itemId));
  const running = (obj) => obj.running || obj.status === "running" || obj.runs?.some((run) => run.status === "running");
  if (running(target) || store.items.some((item) =>
    (item.ownerAbilityId === target.id || referencedIds.has(item.id)) && running(item)))
    throw new Error("当前能力或能力内 SQL 正在运行，请结束后再载入。");
}

export function loadAbilityIntoDraft(store, target, sourceId, { copyBuiltinSQL = false } = {}) {
  assertTarget(store, target);
  const { source, definition: d, versionLabel } = readSource(store, target, sourceId);
  if (copyBuiltinSQL && sourceType(source) !== "builtin_sql")
    throw new Error("只有内置 SQL 能力可以复制为自定义 SQL。");
  const copies = [], mapping = new Map();
  const copyReference = (ref) => {
    const definition = ref.definition;
    let reference;
    if (sourceType(definition) === "custom_sql" || copyBuiltinSQL) {
      const item = newItem(definition.kind, target.id);
      item.name = definition.name;
      item.description = definition.description;
      item.draft = clone(definition.draft);
      item.context = clone(target.context);
      item.scenario = target.scenario;
      copies.push(item);
      reference = { itemId: item.id, version: 0 };
    } else {
      reference = pinnedReference(store, ref);
    }
    mapping.set(ref.itemId, reference.itemId);
    return { ...reference, ...(ref.metricKeys !== undefined ? { metricKeys: clone(ref.metricKeys) } : {}) };
  };
  const staged = {
    metrics: d.metrics.map(copyReference), dimensions: d.dimensions.map(copyReference),
    includeOverall: d.includeOverall ?? true, showOverall: d.showOverall ?? true,
    groups: d.groups.map((group) => {
      const valueFilters = {};
      // Filters use dimension field Keys, not SQL object IDs. Normalize older
      // ID-keyed filters before remapping members; preserve native values.
      const fields = groupFields(d, group);
      for (const [key, selected] of Object.entries(group.valueFilters || {})) {
        const field = fields.find((f) => f.key === key) || fields.find((f) => f.itemId === key);
        if (Object.hasOwn(valueFilters, field.key)) unreadable();
        valueFilters[field.key] = clone(selected);
      }
      return completeGroup({
        id: uid("drill"), key: "", name: group.name, description: group.description ?? "",
        cross: group.cross, enabled: group.enabled,
        members: group.queryItemId ? clone(group.members) : group.members.map((id) => mapping.get(id)),
        ...(group.queryItemId ? { queryItemId: mapping.get(group.queryItemId) } : {}),
        ...(group.valueFilters !== undefined ? { valueFilters } : {})
      });
    })
  };
  const stagedStore = { ...store, items: [...store.items, ...copies] };
  syncQueryGroups(stagedStore, staged);
  checkDefinition(abilityDefinition(stagedStore, staged));
  const result = { sourceName: source.name, versionLabel, itemCount: copies.length };

  // Nothing above mutates either ability or existing SQL. Commit only retrieval
  // fields, keeping target versions, runs, audit, context and analysis references.
  const previous = Object.fromEntries(Object.keys(staged).map((key) => [key, Object.getOwnPropertyDescriptor(target, key)]));
  const itemCount = store.items.length;
  try {
    store.items.push(...copies);
    Object.assign(target, staged);
  } catch (error) {
    store.items.splice(itemCount);
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete target[key];
    }
    throw error;
  }
  return result;
}

export function builtinAbilityCopyIssue(store, source) {
  if (!source || sourceType(source) !== "builtin_sql") return "只有内置 SQL 能力可以复制为自定义 SQL。";
  try { readSource(store, null, source.id); return ""; }
  catch (error) { return error.message; }
}

export function copyBuiltinAbility(store, sourceId) {
  const source = store.abilities.find((ability) => ability.id === sourceId);
  const issue = builtinAbilityCopyIssue(store, source);
  if (issue) throw new Error(issue);
  const target = newAbility(`${source.name} · 副本`);
  const itemCount = store.items.length, abilityCount = store.abilities.length;
  try {
    const result = loadAbilityIntoDraft(store, target, sourceId, { copyBuiltinSQL: true });
    // Use the copied snapshot's description, including when the source has draft edits.
    target.description = readSource(store, target, sourceId).definition.description;
    store.abilities.push(target);
    return { target, ...result };
  } catch (error) {
    store.items.splice(itemCount);
    store.abilities.splice(abilityCount);
    throw error;
  }
}
