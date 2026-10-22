import { hash, uid, itemDefinition, abilityDefinition, sourceType, canEditDefinition, currentActor, businessGoal, resolveItem, activeGroups, outputDimensions } from "./composer-data.js";
import { metricFields } from "./composer-metrics.js";

export const sourceLabels = {
  builtin_rpc: ["内置 RPC", "blue"],
  builtin_sql: ["内置 SQL", "green"],
  custom_sql: ["自定义 SQL", "purple"]
};
export const stateLabels = {
  all: "全部状态", published: "已发布", changed: "有未发布修改",
  draft: "仅草稿"
};
function content(definition) {
  if (definition.draft) {
    const d = definition.draft;
    return {
      key: definition.key, name: definition.name, description: definition.description,
      kind: definition.kind, source: sourceType(definition),
      sql: d.sql, entity: d.entity, entityColumn: d.entityColumn, sourceAlias: d.sourceAlias,
      dimensionKey: d.dimensionKey, dimensionName: d.dimensionName, idAlias: d.idAlias,
      valueAlias: d.valueAlias, valueType: d.valueType, timing: d.timing, enumValues: d.enumValues || [],
      fields: d.fields.map((f) => ({
        alias: f.alias, key: f.key, name: f.name, role: f.role, type: f.type,
        description: f.description, format: f.format || "decimal", precision: Number(f.precision ?? 2),
        unit: f.unit || "", nullDisplay: f.nullDisplay || "—", controlDash: Boolean(f.controlDash),
        entity: f.entity || "", timing: f.timing || "", splitSql: f.splitSql || ""
      })),
      ...(definition.kind === "metric" ? { metrics: metricFields(definition).map((m) => ({
        alias: m.alias, key: m.key, name: m.name, calculation: m.calculation, valueAlias: m.valueAlias,
        aggregation: m.aggregation, denominatorAlias: m.denominatorAlias, denominatorAggregation: m.denominatorAggregation,
        description: m.description, format: m.format, precision: Number(m.precision ?? 2),
        unit: m.unit || "", nullDisplay: m.nullDisplay || "—", controlDash: Boolean(m.controlDash)
      })) } : {}),
      parameters: d.parameters.map((p) => ({ name: p.name, source: p.source, expectedType: p.expectedType, listUsage: Boolean(p.listUsage) }))
    };
  }
  return {
    key: definition.key, name: definition.name, description: definition.description,
    goal: definition.goal, includeOverall: definition.includeOverall, showOverall: definition.showOverall ?? true,
    singleSqlFlow: Boolean(definition.singleSqlFlow), sqlItemId: definition.sqlItemId || "",
    crossDimensions: (definition.crossDimensions || []).map((cross) => ({
      id: cross.id, name: cross.name, leftDimensionKey: cross.leftDimensionKey,
      rightDimensionKey: cross.rightDimensionKey, splitSql: cross.splitSql, status: cross.status
    })),
    metrics: definition.metrics.map((r) => ({ itemId: r.itemId, version: r.version, metricKeys: r.metricKeys, definition: content(r.definition) })),
    dimensions: definition.dimensions.map((r) => ({ itemId: r.itemId, version: r.version, definition: content(r.definition) })),
    groups: definition.groups.map((g) => ({
      id: g.id, key: g.key || `drill_${g.id.replace(/\W/g, "_")}`, name: g.name, description: g.description || "",
      cross: g.cross, members: g.members, enabled: g.enabled !== false, valueFilters: g.valueFilters || {}, ...(g.queryItemId ? { queryItemId: g.queryItemId } : {})
    }))
  };
}
export function definitionHash(store, obj) {
  try { return hash(content(obj.draft ? itemDefinition(obj) : abilityDefinition(store, obj))); }
  catch { return hash({ name: obj.name, key: obj.key, description: obj.description, metrics: obj.metrics, dimensions: obj.dimensions, groups: obj.groups }); }
}
export function publicationState(store, obj) {
  const latest = obj.versions.at(-1);
  if (!latest) return "draft";
  return definitionHash(store, obj) === hash(content(latest.definition)) ? "published" : "changed";
}
export function matchesState(store, obj, filter) {
  const state = publicationState(store, obj);
  if (filter === "all") return true;
  if (filter === "published") return obj.versions.length > 0;
  return state === filter;
}
export function catalogPublicationState(store, obj) {
  if (!obj.title) return publicationState(store, obj);
  return obj.versions?.length ? "published" : "unknown";
}
export function catalogSearchText(store, obj) {
  const terms = [obj.name || obj.title, obj.key || (obj.title ? obj.id : ""), obj.description];
  if (obj.title) {
    terms.push(...obj.metrics.flat(), ...obj.dimensions);
  } else {
    const groups = activeGroups(obj);
    for (const ref of obj.metrics) {
      try {
        const definition = resolveItem(store, ref);
        for (const field of metricFields(definition).filter((f) => ref.metricKeys.includes(f.key)))
          terms.push(field.name, field.key, field.description);
        if (groups.some((g) => g.queryItemId === ref.itemId))
          for (const field of outputDimensions(definition)) terms.push(field.name, field.key);
      } catch { /* Missing references remain discoverable by module name or Key. */ }
    }
    for (const ref of obj.dimensions.filter((r) => groups.some((g) => !g.queryItemId && g.members.includes(r.itemId)))) {
      try {
        const { draft } = resolveItem(store, ref);
        terms.push(draft.dimensionName, draft.dimensionKey);
      } catch { /* The existing configuration validator reports invalid references. */ }
    }
  }
  return terms.join(" ").toLocaleLowerCase("zh-CN");
}
export function matchesCatalog(store, obj, { search = "", source = "all", goal = "all", state = "all" } = {}) {
  if (source !== "all" && sourceType(obj) !== source) return false;
  if (goal !== "all" && obj.goal !== goal) return false;
  const publication = catalogPublicationState(store, obj);
  if (state === "all" ? false
    : state === "published" ? !obj.versions?.length
    : publication !== state) return false;
  return catalogSearchText(store, obj).includes(search.trim().toLocaleLowerCase("zh-CN"));
}
export function trackChanges(store) {
  for (const obj of [...store.items, ...store.abilities]) {
    const signature = definitionHash(store, obj);
    if (obj.lastContentHash && signature !== obj.lastContentHash) obj.updatedAt = new Date().toISOString();
    obj.lastContentHash = signature;
  }
}
export function assertMutable(obj) {
  if (!canEditDefinition(obj)) throw new Error("仅创建人可以编辑 SQL 定义。");
}
export function saveDraft(obj, store) {
  if (obj.draft || obj.metrics) assertMutable(obj);
  if (obj.draft || obj.metrics) {
    if (!obj.key) {
      const prefix = obj.metrics ? "capability" : obj.kind === "dimension" ? "dimension" : "query";
      const collection = store ? [...store.items, ...store.abilities] : [];
      do { obj.key = uid(prefix); } while (collection.some((other) => other.id !== obj.id && other.key === obj.key));
    }
    obj.keyLocked = true;
  }
  if (obj.metrics) {
    delete obj.owner;
    if (!obj.singleSqlFlow) obj.goal = businessGoal;
    // Saving an ability also saves its new inline SQL definitions.
    for (const ref of [...obj.metrics, ...obj.dimensions]) {
      const item = store?.items.find((candidate) => candidate.id === ref.itemId);
      if (!ref.version && item && !item.key) saveDraft(item, store);
    }
  } else if (!obj.draft) obj.goal = businessGoal;
  obj.savedAt = new Date().toISOString();
  obj.updatedAt = obj.savedAt;
  obj.audit ||= [];
  obj.audit.unshift({ operation: "保存草稿", operator: currentActor, at: obj.savedAt });
}
export function keyImpact(store, obj) {
  const result = [];
  if (obj.draft) {
    for (const ability of store.abilities) {
      if ([...ability.metrics, ...ability.dimensions].some((r) => r.itemId === obj.id))
        result.push(`${ability.name} · 当前能力引用`);
      const versions = ability.versions.filter((v) => [...v.definition.metrics, ...v.definition.dimensions].some((r) => r.itemId === obj.id));
      if (versions.length) result.push(`${ability.name} · 固定版本 ${versions.map((v) => `v${v.number}`).join("、")}`);
    }
  } else if (store.analysis.capabilityId === obj.id) result.push(`${store.analysis.name} · 固定 v${store.analysis.version}`);
  if (obj.versions.length) result.push(`本对象 ${obj.versions.length} 个已发布版本保持原定义`);
  return result;
}
