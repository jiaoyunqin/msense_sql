// Display order is separate from retrieval and calculation identity.
export const calculationBlockId = "module-calculations";
export function orderedItems(items, keys, keyOf = item => item.key) {
  if (!Array.isArray(keys) || !keys.length) return [...items];
  const ranks = new Map([...new Set(keys)].map((key, index) => [key, index]));
  return items.map((item, index) => ({ item, index })).sort((a, b) =>
    (ranks.get(keyOf(a.item)) ?? keys.length) - (ranks.get(keyOf(b.item)) ?? keys.length)
    || a.index - b.index).map(entry => entry.item);
}
export function reportBlockIds(module) {
  return orderedItems([
    ...(module.sources || []).map(source => source.id),
    ...(module.calculatedMetrics?.length ? [calculationBlockId] : [])
  ], module.reportOrder?.blocks, id => id);
}
export function orderReportMetrics(module, blockId, fields) {
  const keys = blockId === calculationBlockId
    ? (module.calculatedMetrics || []).map(metric => metric.key)
    : module.reportOrder?.metrics?.[blockId];
  return orderedItems(fields, keys);
}
export function orderReportDimensions(module, blockId, dimensions, keyOf) {
  return orderedItems(dimensions, module.reportOrder?.dimensions?.[blockId], keyOf);
}
export function moveOrderedKey(keys, key, target) {
  const from = keys.indexOf(key), to = keys.indexOf(target);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...keys];
  next.splice(from, 1); next.splice(to, 0, key);
  return next;
}
export function pruneModuleReportOrder(module) {
  const order = module.reportOrder;
  if (!order) return;
  const sources = new Map((module.sources || []).map(source => [source.id, source]));
  const calculations = (module.calculatedMetrics || []).map(metric => metric.key);
  if (order.blocks) order.blocks = order.blocks.filter(id => sources.has(id) || id === calculationBlockId && calculations.length);
  for (const kind of ["metrics", "dimensions"]) if (order[kind]) {
    order[kind] = Object.fromEntries(Object.entries(order[kind]).flatMap(([id, keys]) => {
      const available = id === calculationBlockId && kind === "metrics" ? calculations
        : sources.get(id)?.[kind === "metrics" ? "metricKeys" : "dimensionKeys"];
      return available ? [[id, keys.filter(key => available.includes(key))]] : [];
    }));
  }
}
function orderDataBlocks(module, records, modeOf) {
  const blocks = reportBlockIds(module);
  return blocks.flatMap(blockId => orderReportDimensions(module, blockId,
    records.filter(record => record.sourceId === blockId), modeOf))
    .concat(records.filter(record => !blocks.includes(record.sourceId)));
}
export function applyModuleRecordOrder(module, records) {
  const ordered = records.map(record => {
    const metrics = orderReportMetrics(module, record.sourceId, record.fields.filter(field => field.role === "metric"));
    let index = 0;
    const fields = record.fields.map(field => field.role === "metric" ? metrics[index++] : field);
    if (fields.every((field, index) => field === record.fields[index])) return record;
    return { ...record, fields, ...(record.snapshot ? { snapshot: { ...record.snapshot, fields } } : {}) };
  });
  return module.reportOrder
    ? orderDataBlocks(module, ordered, record => record.calculationContext?.modeId || record.modeId)
    : ordered;
}
export function applyModuleDatasetOrder(module, datasets) {
  const ordered = datasets.map(dataset => {
    const fields = orderReportMetrics(module, dataset.sourceId, dataset.fields);
    const indices = fields.map(field => dataset.fields.indexOf(field));
    return { ...dataset, fields, ...(dataset.records ? {
      records: dataset.records.map(record => ({ ...record, cells: indices.map(index => record.cells[index]) }))
    } : {}) };
  });
  return module.reportOrder ? orderDataBlocks(module, ordered, dataset => dataset.mode) : ordered;
}
