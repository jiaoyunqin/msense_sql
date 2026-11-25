// Presentation identity stays separate from canonical module/evidence identity.
const clean = value => typeof value === "string" ? value.trim() : "";
const list = value => Array.isArray(value) ? value.filter(item => item && typeof item === "object") : [];
export const sectionIdentity = (section, index) => section.id || `section-${section.moduleId}-${index}`;
export const canEditReport = (report, actor) => Boolean(actor && report && !report.referenceReport
  && (report.createdBy === actor || report.editorIds?.includes(actor)));

export function directoryBlocks(directory, includeEmpty = false) {
  const seen = new Set(), blocks = [];
  for (const entry of directory.entries) {
    if (!entry.groupId) blocks.push({ ...entry, entries: [entry], group: false });
    else if (!seen.has(entry.groupId)) {
      seen.add(entry.groupId);
      const group = directory.groups.find(group => group.id === entry.groupId);
      if (group) blocks.push({ ...group, group: true, entries: directory.entries.filter(item => item.groupId === group.id) });
    }
  }
  directory.groups.filter(group => !seen.has(group.id))
    .forEach(group => blocks.push({ ...group, group: true, entries: [] }));
  const ordered = [];
  for (const item of list(directory.order)) {
    const block = blocks.find(block => block.id === item.id && block.group === item.group);
    if (block && !ordered.includes(block)) ordered.push(block);
  }
  blocks.forEach(block => { if (!ordered.includes(block)) ordered.push(block); });
  return includeEmpty ? ordered : ordered.filter(block => block.entries.length);
}

function storeDirectoryBlocks(directory, blocks) {
  directory.entries = blocks.flatMap(block => block.entries);
  directory.groups = blocks.filter(block => block.group).map(({ id, title }) => ({ id, title }));
  directory.order = blocks.map(({ id, group }) => ({ id, group }));
}

export function normalizeDirectory(value, items) {
  const groups = [], entries = [], known = new Map(items.map(item => [item.id, item]));
  const seenGroups = new Set(), seenEntries = new Set();
  for (const group of list(value?.groups)) {
    if (!clean(group.id) || seenGroups.has(group.id)) continue;
    seenGroups.add(group.id); groups.push({ id: group.id, title: clean(group.title) });
  }
  for (const entry of list(value?.entries)) {
    if (!known.has(entry.id) || seenEntries.has(entry.id)) continue;
    seenEntries.add(entry.id);
    entries.push({ id: entry.id, title: clean(entry.title), groupId: seenGroups.has(entry.groupId) ? entry.groupId : "" });
  }
  items.filter(item => !seenEntries.has(item.id)).forEach(item =>
    entries.push({ id: item.id, title: "", groupId: "" }));
  const directory = { version: 1, groups, entries };
  if (Array.isArray(value?.order)) {
    directory.order = list(value.order).map(({ id, group }) => ({ id, group }));
    directory.order = directoryBlocks(directory, true).map(({ id, group }) => ({ id, group }));
  }
  directory.entries = directoryBlocks(directory).flatMap(block => block.entries);
  return directory;
}

export function directoryIssues(directory, items) {
  const errors = [], itemIds = new Set(items.map(item => item.id)), seen = new Set();
  const groupIds = new Set();
  for (const group of list(directory?.groups)) {
    if (!clean(group.id) || groupIds.has(group.id)) errors.push("目录分组标识重复或缺失。");
    groupIds.add(group.id);
    if (!clean(group.title)) errors.push("请填写目录分组名称。");
    if (clean(group.title).length > 80) errors.push("目录分组名称不能超过 80 个字。");
    if (!list(directory?.entries).some(entry => entry.groupId === group.id))
      errors.push(`「${clean(group.title) || "未命名分组"}」尚未包含模块，请补入模块或删除分组。`);
  }
  for (const entry of list(directory?.entries)) {
    if (!itemIds.has(entry.id) || seen.has(entry.id)) errors.push("目录模块重复或已不存在。");
    seen.add(entry.id);
    if (entry.groupId && !groupIds.has(entry.groupId)) errors.push("目录模块所属分组不存在。");
    if (clean(entry.title).length > 120) errors.push("模块显示标题不能超过 120 个字。");
  }
  if (directory && items.some(item => !seen.has(item.id))) errors.push("目录必须包含全部已选模块。");
  return [...new Set(errors)];
}

export function moveDirectory(directory, id, direction, group = false) {
  if (group || !directory.entries.find(entry => entry.id === id)?.groupId) {
    const blocks = directoryBlocks(directory, true);
    const index = blocks.findIndex(block => block.id === id), to = index + direction;
    if (index < 0 || to < 0 || to >= blocks.length) return false;
    [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
    storeDirectoryBlocks(directory, blocks);
  } else {
    const entry = directory.entries.find(entry => entry.id === id);
    const siblings = directory.entries.filter(item => item.groupId === entry.groupId);
    const index = siblings.indexOf(entry), to = index + direction;
    if (to < 0 || to >= siblings.length) return false;
    const a = directory.entries.indexOf(entry), b = directory.entries.indexOf(siblings[to]);
    [directory.entries[a], directory.entries[b]] = [directory.entries[b], directory.entries[a]];
  }
  return true;
}

export function placeDirectory(directory, source, target) {
  if (source.id === target.id || !["before", "after", "inside"].includes(target.position)) return false;
  if (target.position === "inside" && (source.group || !target.group)) return false;
  const blocks = directoryBlocks(directory, true).map(block => ({
    ...block, entries: block.entries.map(entry => ({ ...entry }))
  }));
  const previousOrder = blocks.map(({ id, group }) => ({ id, group }));
  const sourceIndex = blocks.findIndex(block => source.group
    ? block.group && block.id === source.id : block.entries.some(entry => entry.id === source.id));
  const targetIndex = blocks.findIndex(block => target.group
    ? block.group && block.id === target.id : block.entries.some(entry => entry.id === target.id));
  if (sourceIndex < 0 || targetIndex < 0) return false;
  if (source.group && sourceIndex === targetIndex) return false;
  const targetBlockId = blocks[targetIndex].id;

  if (source.group) {
    const [block] = blocks.splice(sourceIndex, 1);
    const destination = blocks.findIndex(item => item.id === targetBlockId);
    blocks.splice(destination + (target.position === "after" ? 1 : 0), 0, block);
  } else {
    const origin = blocks[sourceIndex];
    const [entry] = origin.entries.splice(origin.entries.findIndex(item => item.id === source.id), 1);
    if (!origin.group) blocks.splice(sourceIndex, 1);
    const destination = blocks.findIndex(block => target.group
      ? block.group && block.id === target.id : block.entries.some(item => item.id === target.id));
    const block = blocks[destination];
    const intoGroup = block.group && (!target.group || target.position === "inside");
    entry.groupId = intoGroup ? block.id : "";
    if (intoGroup) {
      const index = target.group ? block.entries.length : block.entries.findIndex(item => item.id === target.id)
        + (target.position === "after" ? 1 : 0);
      block.entries.splice(index, 0, entry);
    } else blocks.splice(destination + (target.position === "after" ? 1 : 0), 0, { ...entry, group: false, entries: [entry] });
  }
  const entries = blocks.flatMap(block => block.entries);
  const groups = blocks.filter(block => block.group).map(({ id, title }) => ({ id, title }));
  const order = blocks.map(({ id, group }) => ({ id, group }));
  if (JSON.stringify(entries) === JSON.stringify(directory.entries) && JSON.stringify(groups) === JSON.stringify(directory.groups)
    && JSON.stringify(order) === JSON.stringify(previousOrder)) return false;
  storeDirectoryBlocks(directory, blocks);
  return true;
}

export function updateDirectory(directory, field, id, value) {
  if (field === "group-title") {
    const group = directory.groups.find(group => group.id === id);
    if (group) group.title = value;
  } else {
    const entry = directory.entries.find(entry => entry.id === id);
    if (!entry) return false;
    if (field === "entry-title") entry.title = value;
    else if (field === "entry-group") {
      const blocks = directoryBlocks(directory, true);
      entry.groupId = directory.groups.some(group => group.id === value) ? value : "";
      // Retain empty-group positions when reading older callers that still assign a group.
      directory.order = blocks.map(({ id, group }) => ({ id, group }));
      directory.entries = directoryBlocks(directory).flatMap(block => block.entries);
    } else return false;
  }
  return true;
}

export function removeDirectoryGroup(directory, id) {
  const blocks = directoryBlocks(directory, true).flatMap(block => block.group && block.id === id
    ? block.entries.map(entry => ({ ...entry, groupId: "", group: false, entries: [{ ...entry, groupId: "" }] }))
    : [block]);
  storeDirectoryBlocks(directory, blocks);
}

export function reportDirectoryItems(report) {
  if (report.canonicalDirectoryItems) return report.canonicalDirectoryItems;
  if (report.moduleContent) return report.moduleContent.map(module => ({ id: module.id, title: module.title }));
  return (report.sections || []).filter(section => !section.group && section.id !== report.summary?.id)
    .map(({ id, title }) => ({ id, title }));
}

export function snapshotDirectory(report) {
  const source = report.snapshot?.template;
  if (!source?.directory || !report.moduleContent) return undefined;
  const ids = new Map();
  const entries = source.directory.entries.flatMap(entry => {
    const index = source.sections.findIndex((section, i) => sectionIdentity(section, i) === entry.id);
    const module = report.moduleContent.find(module => module.index === index);
    if (module) ids.set(entry.id, module.id);
    return module ? [{ ...entry, id: module.id }] : [];
  });
  return { ...source.directory, entries, ...(Array.isArray(source.directory.order) ? {
    order: list(source.directory.order).flatMap(item => item.group ? [{ ...item }]
      : ids.has(item.id) ? [{ ...item, id: ids.get(item.id) }] : [])
  } : {}) };
}

export function applyReportDirectory(report, presentation) {
  if (!report || report.referenceReport) return report;
  if (report.presentationVersion && presentation?.presentationVersion !== report.presentationVersion) presentation = undefined;
  const items = reportDirectoryItems(report);
  if (!items.length) return report;
  const inherited = snapshotDirectory(report) || report.defaultDirectory;
  const directory = normalizeDirectory(presentation?.directory || inherited, items);
  const titles = new Map(items.map(item => [item.id, item.title]));
  const display = directory.entries.map(entry => ({ ...entry, title: entry.title || titles.get(entry.id) }));
  const result = { ...report, title: clean(presentation?.reportTitle) || report.title,
    canonicalDirectoryItems: items, presentationDirectory: directory, directory: { ...directory, entries: display } };
  if (report.moduleContent) {
    const modules = new Map(report.moduleContent.map(module => [module.id, module]));
    result.moduleContent = display.map(entry => ({ ...modules.get(entry.id), title: entry.title }));
    result.sections = report.sections.map(section => {
      const entry = display.find(entry => entry.id === section.children?.[0]?.id || entry.id === section.id);
      return entry ? { ...section, title: entry.title,
        ...(section.children ? { children: section.children.map(child => child.id === entry.id ? { ...child, title: entry.title } : child) } : {}) } : section;
    });
  } else result.sections = report.sections.map(section => {
    const entry = display.find(entry => entry.id === section.id);
    return entry ? { ...section, title: entry.title } : section;
  });
  if (presentation?.directory || inherited || report.showcaseReport || report.moduleReport) result.directoryToc = [
    ...(report.summary ? [{ id: report.summary.id, title: report.summary.title }] : []),
    ...directoryBlocks(result.directory).map(block => block.group
      ? { id: block.entries[0].id, groupId: block.id, title: block.title || "未命名分组", children: block.entries }
      : { id: block.id, title: block.title })
  ];
  return result;
}

export function directoryHeading(report, id, escape) {
  const block = report.directory && directoryBlocks(report.directory).find(block => block.group && block.entries[0]?.id === id);
  return block ? `<div class="rd-body-group" data-rd-body-group="${escape(block.id)}" role="heading" aria-level="2">${escape(block.title || "未命名分组")}</div>` : "";
}

export function directoryOrdinal(report, id) {
  if (!report.directory) return "";
  const blocks = directoryBlocks(report.directory);
  const index = blocks.findIndex(block => block.entries.some(entry => entry.id === id));
  if (index < 0) return "";
  const number = index + (report.summary ? 2 : 1), block = blocks[index];
  return block.group ? `${number}.${block.entries.findIndex(entry => entry.id === id) + 1}` : String(number).padStart(2, "0");
}

export function saveReportPresentation(store, report, draft, actor) {
  if (!canEditReport(report, actor)) throw new Error("当前用户没有编辑这份报告的权限。");
  const items = reportDirectoryItems(report), errors = directoryIssues(draft.directory, items);
  if (!clean(draft.reportTitle)) errors.unshift("请填写报告标题。");
  if (clean(draft.reportTitle).length > 160) errors.push("报告标题不能超过 160 个字。");
  if (errors.length) throw new Error(errors.join("\n"));
  store.reportPresentations ||= {};
  store.reportPresentations[report.id] = {
    reportTitle: clean(draft.reportTitle), directory: normalizeDirectory(draft.directory, items),
    ...(report.presentationVersion ? { presentationVersion: report.presentationVersion } : {}),
    updatedAt: new Date().toISOString(), updatedBy: actor
  };
  return store.reportPresentations[report.id];
}
