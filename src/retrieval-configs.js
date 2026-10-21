import {
  clone, uid, newAbility, newItem, itemDefinition, abilityDefinition,
  defaultContext, sourceType, completeGroup, syncQueryGroups, resolveItem
} from "./composer-data.js";
import { metricFields } from "./composer-metrics.js";

export const configTypes = { ability: "取数能力", item: "SQL 取数项", preset: "预置能力" };

export function captureConfig(store, obj, preset) {
  if (preset) {
    return { kind: "preset", snapshot: clone(preset) };
  }
  if (!obj) throw new Error("请先打开一个取数能力。");
  return {
    kind: obj.draft ? "item" : "ability",
    snapshot: {
      definition: obj.draft ? itemDefinition(obj) : abilityDefinition(store, obj),
      context: clone(obj.context || defaultContext), scenario: obj.scenario || "normal"
    }
  };
}

export function configSummary(config) {
  const { snapshot: s, kind } = config;
  if (kind === "preset") return `${s.title} · ${s.metrics.length} 个指标 · ${s.dimensions.length} 个下钻维度`;
  if (kind === "item") {
    const d = s.definition;
    return `${d.name} · ${d.kind === "dimension" ? "SQL 维度" : `${metricFields(d).length} 个指标`}`;
  }
  const d = s.definition;
  return `${d.metrics.reduce((n, r) => n + r.metricKeys.length, 0)} 个指标 · ${d.dimensions.length} 个维度来源 · ${d.groups.length} 个下钻组`;
}

export function saveConfig(store, captured, name, description = "") {
  name = name.trim();
  if (!name) throw new Error("请填写配置名称。");
  if (name.length > 80) throw new Error("配置名称请控制在 80 字以内。");
  const config = { id: uid("config"), name, description: description.trim(), createdAt: new Date().toISOString(), ...clone(captured) };
  store.retrievalConfigs ||= [];
  store.retrievalConfigs.unshift(config);
  return config;
}

function copySQL(definition, context, scenario, ownerAbilityId = "") {
  const result = newItem(definition.kind, ownerAbilityId);
  result.name = definition.name;
  result.description = definition.description;
  result.draft = clone(definition.draft);
  result.context = clone(context);
  result.scenario = scenario;
  return result;
}

// Configuration snapshots carry definitions and inputs, never execution or
// publication state. Stage all copies first so a missing preset is atomic.
export function instantiateConfig(store, config) {
  const { kind, snapshot: s } = config;
  if (kind === "preset") return { kind, preset: clone(s) };
  if (kind === "item") {
    const obj = copySQL(s.definition, s.context, s.scenario);
    obj.name = config.name;
    if (sourceType(s.definition) === "builtin_rpc") {
      obj.preset = true; obj.sourceType = "builtin_rpc";
      obj.unavailable = s.definition.unavailable || "此内置 RPC 尚未接入执行器。";
    }
    store.items.push(obj);
    return { kind, obj };
  }
  if (kind !== "ability") throw new Error("暂不支持此配置类型。");
  const d = s.definition, obj = newAbility(config.name), copies = [], mapping = new Map();
  obj.description = d.description;
  obj.includeOverall = d.includeOverall;
  obj.showOverall = d.showOverall ?? true;
  obj.context = clone(s.context);
  obj.scenario = s.scenario;
  const copyReference = (ref) => {
    const definition = ref.definition;
    const source = sourceType(definition);
    let target;
    if (source !== "custom_sql") {
      try { target = resolveItem(store, ref); } catch { throw new Error(`内置来源“${definition.name}”的固定版本已不可用。`); }
      // Presets stay read-only and pinned; custom definitions below are
      // self-contained, even if their original object has since been archived.
      mapping.set(ref.itemId, target.id);
      return { itemId: target.id, version: ref.version, ...(ref.metricKeys ? { metricKeys: clone(ref.metricKeys) } : {}) };
    }
    const existing = copies.find((copy) => copy.sourceId === ref.itemId && copy.version === ref.version);
    if (existing) target = existing.item;
    else {
      target = copySQL(definition, s.context, s.scenario, obj.id);
      copies.push({ sourceId: ref.itemId, version: ref.version, item: target });
    }
    mapping.set(ref.itemId, target.id);
    return { itemId: target.id, version: 0, ...(ref.metricKeys ? { metricKeys: clone(ref.metricKeys) } : {}) };
  };
  obj.metrics = d.metrics.map(copyReference);
  obj.dimensions = d.dimensions.map(copyReference);
  obj.groups = d.groups.map((g) => completeGroup({
    ...clone(g), id: uid("drill"), key: "",
    members: g.queryItemId ? clone(g.members) : g.members.map((id) => mapping.get(id) || id),
    ...(g.queryItemId ? { queryItemId: mapping.get(g.queryItemId) } : {})
  }));
  const nextItems = copies.map(({ item }) => item);
  syncQueryGroups({ ...store, items: [...store.items, ...nextItems] }, obj);
  store.items.push(...nextItems);
  store.abilities.push(obj);
  return { kind, obj };
}
