import { computeModuleCalculations, comparisonCalculationRecords } from "./analysis-module-calculation-runtime.js";
import { validateCalculatedMetrics } from "./analysis-module-calculations.js";
import { createPreAAEvidence } from "./pre-aa-demo.js";
// Local, fictional fixtures. All report surfaces derive from the same task snapshot.
export const copy = value => structuredClone(value);
export const multiId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const analysisTypes = { single: "单实验分析", multi: "多实验分析" };
export const demoGoal = "平台老客提频";
export const comparisonMetrics = [
  { key: "dac", name: "支付天 (DAC)", unit: "天", digits: 3, uplift: true },
  { key: "incrementalDac", name: "增量累计 DAC", unit: "天", digits: 0 },
  { key: "dailyDac", name: "增量日均 DAC", unit: "天/日", digits: 0 },
  { key: "redeemCost", name: "单增量 DAC 核销成本", unit: "元", digits: 2 },
  { key: "cost", name: "单增量 DAC 用增成本（结算）", unit: "元", digits: 2 },
  { key: "roi", name: "GMV-ROI", unit: "", digits: 2 },
  { key: "gmv", name: "人均支付 GMV", unit: "元", digits: 2, uplift: true },
  { key: "incrementalGmv", name: "增量支付 GMV", unit: "元", digits: 0 }
];
export const strategyFields = [
  ["app", "适用端"], ["audience", "实验人群"], ["category", "商品 / 类目"],
  ["coupon", "券面额 / 门槛"], ["validity", "发券时效"], ["range", "券可用范围"],
  ["count", "领取次数"], ["placement", "投放入口"], ["traffic", "实验流量"]
];
export const demoExperiments = [
  { id: "DEMO-001", name: "周期购券 · 低门槛", goal: demoGoal,
    period: ["2026-10-01", "2026-10-14"], available: ["2026-10-01", "2026-10-28"],
    strategy: { app: "抖音", audience: "成熟老客 · 周期购人群", category: "食品饮料", coupon: "满 39 减 5",
      validity: "领券后 3 天", range: "指定类目商品", count: "每周 1 次", placement: "商城首页", traffic: "各组 10%" },
    control: { id: "001-C", name: "对照组 · 无券", users: 120000, dacDaily: .019, gmvDaily: 2.4 },
    groups: [
      { id: "001-A", name: "策略 A · 低门槛券", users: 118000, dacDaily: .0208, gmvDaily: 2.65,
        subsidyDaily: 17200, redemptionDaily: 15000, sig: { dac: "正向显著", gmv: "正向显著" } },
      { id: "001-B", name: "策略 B · 增加领取次数", users: 116000, dacDaily: .0212, gmvDaily: 2.70,
        subsidyDaily: 25000, redemptionDaily: 21800, sig: { dac: "正向显著", gmv: "正向显著" },
        strategy: { count: "每周 2 次" } }
    ] },
  { id: "DEMO-002", name: "关联购券 · 高面额", goal: demoGoal,
    period: ["2026-10-03", "2026-10-16"], available: ["2026-10-03", "2026-10-30"],
    strategy: { app: "抖音", audience: "成熟老客 · 关联购人群", category: "日用百货", coupon: "满 69 减 10",
      validity: "领券后 7 天", range: "指定类目商品", count: "每周 1 次", placement: "支付完成页", traffic: "各组 8%" },
    control: { id: "002-C", name: "对照组 · 无券", users: 90000, dacDaily: .017, gmvDaily: 2.2 },
    groups: [
      { id: "002-A", name: "策略 A · 高面额券", users: 88000, dacDaily: .01955, gmvDaily: 2.58,
        subsidyDaily: 23800, redemptionDaily: 20600, sig: { dac: "正向显著", gmv: "正向显著" } }
    ] },
  { id: "DEMO-003", name: "唤回券包 · 短时效", goal: demoGoal,
    period: ["2026-10-05", "2026-10-11"], available: ["2026-10-05", "2026-10-25"],
    strategy: { app: "极速版", audience: "沉默老客 · 30 天未购", category: "多类目", coupon: "满 29 减 3 / 满 59 减 6",
      validity: "领券后 24 小时", range: "商城可用", count: "实验期 1 次", placement: "消息中心", traffic: "各组 5%" },
    control: { id: "003-C", name: "对照组 · 无券", users: 65000, dacDaily: .012, gmvDaily: 1.5 },
    groups: [
      { id: "003-A", name: "策略 A · 短时效券包", users: 64000, dacDaily: .0125, gmvDaily: 1.58,
        subsidyDaily: 6500, redemptionDaily: null, sig: { dac: "不显著", gmv: "不显著" } }
    ] }
];
export const findExperiment = id => demoExperiments.find(experiment => experiment.id === id);
export function experimentCandidates(id) {
  const experiment = findExperiment(id);
  if (!experiment) return [];
  const primary = { ...experiment, qxExperimentId: `${id}-QX-01` };
  // Fictional mappings exercise the same candidate-selection flow as the live site.
  return id === "DEMO-001" ? [primary,
    { ...experiment, qxExperimentId: `${id}-QX-02`, period: ["2026-10-01", "2026-10-07"] }] : [primary];
}
export function resolveExperiment(input) {
  const candidates = experimentCandidates(input.id);
  // Existing saved inputs did not store a money-efficiency experiment ID.
  return input.qxExperimentId === undefined ? candidates[0]
    : candidates.find(experiment => experiment.qxExperimentId === input.qxExperimentId);
}
export function parseExperimentIds(text) {
  const tokens = String(text).trim().split(/[\s,，;；]+/).filter(Boolean).map(id => id.toUpperCase());
  const ids = [...new Set(tokens)];
  return { ids, duplicates: tokens.length - ids.length };
}
export function experimentInput(id, { requireSelection = false, qxExperimentId } = {}) {
  const candidates = experimentCandidates(id);
  const selectedId = qxExperimentId ?? (requireSelection && candidates.length > 1 ? "" : candidates[0]?.qxExperimentId);
  const experiment = candidates.find(candidate => candidate.qxExperimentId === selectedId);
  return { id, qxExperimentId: selectedId || "", start: experiment?.period[0] || "", end: experiment?.period[1] || "",
    groupIds: experiment?.groups.map(group => group.id) || [] };
}
export function dateStamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
export function observedDays(start, end) {
  const a = dateStamp(start), b = dateStamp(end);
  return a === null || b === null || a > b ? null : (b - a) / 86400000 + 1;
}
export function experimentIssues(input, goal = demoGoal) {
  const candidates = experimentCandidates(input.id), experiment = resolveExperiment(input), errors = [];
  if (!candidates.length) return ["未找到实验。Demo 支持 DEMO-001、DEMO-002、DEMO-003。"];
  if (!experiment) return [input.qxExperimentId ? "钱效实验候选项无效，请重新选择。" : "该实验 ID 匹配多个钱效实验，请先选择。"];
  if (experiment.goal !== goal) errors.push("实验业务目标与当前分析不一致。");
  if (!observedDays(input.start, input.end)) errors.push("请填写有效观察日期，开始日期不能晚于结束日期。");
  else if (input.start < experiment.available[0] || input.end > experiment.available[1])
    errors.push(`模拟数据仅覆盖 ${experiment.available.join(" 至 ")}，请调整观察窗口。`);
  if (!input.groupIds?.length) errors.push("实验策略组配置缺失，请重新解析该实验。");
  if (input.groupIds?.some(id => !experiment.groups.some(group => group.id === id)))
    errors.push("所选策略组不属于该实验。");
  return errors;
}
export function newTemplate(type = "single") {
  return { id: multiId("template"), name: "", description: "", analysisType: type, goal: demoGoal,
    apps: [], reasoning: "", considerations: "", savedAt: "",
    sections: [], versions: [], enabled: true, updatedAt: "", createdBy: "sheriqin.01" };
}
export function templateConfiguration(template) {
  return copy({ name: template.name, description: template.description, analysisType: template.analysisType,
    goal: template.goal, apps: template.apps || [], reasoning: template.reasoning || "",
    considerations: template.considerations || "", sections: template.sections });
}
export const templateChanged = template => !template.versions.length || JSON.stringify(templateConfiguration(template))
  !== JSON.stringify(templateConfiguration(template.versions.at(-1).configuration));
export const templateStatus = template => template.archived ? "archived"
  : !template.versions.length ? "draft" : template.enabled ? "online" : "offline";
export const templateModuleCompatible = (templateType, moduleType = "single") =>
  templateType === "multi" ? ["single", "multi"].includes(moduleType) : templateType === "single" && moduleType === "single";
export function templateModuleCandidates(store, template) {
  if (!template.goal || !analysisTypes[template.analysisType]) return [];
  return workbenchModuleOptions(store, "all", template.goal)
    .filter(({ configuration }) => templateModuleCompatible(template.analysisType, configuration.analysisType || "single"));
}
export function templateIssues(store, template) {
  const errors = [];
  let hasMultiModule = false;
  if (!template.name.trim()) errors.push("请填写模板名称。");
  if (!template.description.trim()) errors.push("请填写模板说明。");
  if (template.goal !== demoGoal) errors.push("请选择业务目标。");
  if (!analysisTypes[template.analysisType]) errors.push("请选择有效分析类型。");
  if (!template.sections.length) errors.push("请选择至少一个已发布的分析模块。");
  for (const section of template.sections) {
    const module = store.modules.find(module => module.id === section.moduleId);
    const version = module?.versions.find(version => version.number === section.version);
    if (!section.title.trim()) errors.push("请填写报告章节名称。");
    if (!["overall", "strategy", "detail"].includes(section.kind)) errors.push("请选择章节内容。");
    if (!module || module.archived || module.enabled === false || !version)
      errors.push(`${section.title || "章节"}：模块未发布、已下线或固定版本不可用。`);
    else if (!templateModuleCompatible(template.analysisType, version.configuration.analysisType || "single"))
      errors.push(`${section.title || "章节"}：模块版本与模板分析类型不一致。`);
    else if (version.configuration.goal && version.configuration.goal !== template.goal)
      errors.push(`${section.title || "章节"}：模块版本与模板业务目标不一致。`);
    else if (version.configuration.analysisType === "multi") hasMultiModule = true;
  }
  if (template.analysisType === "multi" && !hasMultiModule)
    errors.push("多实验报告至少包含一个负责跨实验结论的多实验分析模块。");
  return [...new Set(errors)];
}
export function publishTemplate(store, template) {
  const errors = templateIssues(store, template);
  if (errors.length) throw new Error(errors.join("\n"));
  if (!templateChanged(template)) return template.versions.at(-1);
  template.key ||= multiId("report_template");
  const version = { number: template.versions.length + 1, publishedAt: new Date().toISOString(),
    configuration: templateConfiguration(template), operator: "sheriqin.01" };
  template.versions.push(version); template.enabled = true; template.updatedAt = version.publishedAt;
  return version;
}
export function setTemplateEnabled(store, template, enabled) {
  if (template.archived) throw new Error("归档模板不能上线。");
  if (enabled) {
    // Re-enable the published snapshot; unpublished edits remain a draft.
    const version = template.versions.at(-1);
    if (version) {
      const errors = templateIssues(store, version.configuration);
      if (errors.length) throw new Error(errors.join(" "));
    } else publishTemplate(store, template);
  }
  template.enabled = enabled;
  template.updatedAt = new Date().toISOString();
}
export function publishedTemplates(store, type) {
  return store.reportTemplates.flatMap(template => {
    const version = template.versions.at(-1);
    return !template.archived && template.enabled && version && (type === "all" || version.configuration.analysisType === type)
      && !templateIssues(store, version.configuration).length ? [{ ...template, selectedVersion: version }] : [];
  });
}
export function initializeMultiAnalysis(store) {
  store.reportTemplates ||= [];
  store.multiAnalysis ||= { tasks: [], reports: [], draft: null };
  store.multiAnalysis.tasks ||= []; store.multiAnalysis.reports ||= [];
  if (!store.multiAnalysis.seeded) {
    for (const [type, name, modules] of [
      ["multi", "老客提频 · 多实验策略对比", ["multi-core", "multi-strategy", "multi-detail"]],
      ["single", "老客提频 · 单实验分析", ["single-demo-core"]]
    ]) {
      const template = newTemplate(type);
      Object.assign(template, { id: `demo-template-${type}`, name,
        description: type === "multi" ? "对比独立实验的核心表现、策略配置与实验内证据。" : "查看一个实验的策略组相对对照组的表现。",
        sections: modules.map((moduleId, index) => ({ moduleId, version: 1,
          title: ["总体对比", "策略差异", "实验明细"][index], kind: ["overall", "strategy", "detail"][index] })) });
      publishTemplate(store, template); store.reportTemplates.push(template);
    }
    store.multiAnalysis.seeded = true;
  }
  if (!store.multiAnalysis.mixedTemplateSeeded) {
    const modules = ["preaa", "multi-core"].map(id => store.modules.find(module => module.id === id));
    if (modules.every(module => module?.versions.length && !module.archived && module.enabled !== false)) {
      const template = newTemplate("multi");
      Object.assign(template, { id: "demo-template-mixed", name: "多实验分析 · PreAA 与核心表现",
        description: "逐实验展示 PreAA 证据，再比较多个实验的核心表现。",
        sections: modules.map(module => ({ moduleId: module.id, version: module.versions.at(-1).number,
          title: module.versions.at(-1).configuration.name, kind: "overall" })) });
      if (!store.reportTemplates.some(entry => entry.id === template.id)) {
        publishTemplate(store, template); store.reportTemplates.push(template);
      }
      store.multiAnalysis.mixedTemplateSeeded = true;
    }
  }
  for (const task of store.multiAnalysis.tasks) {
    delete task.executing;
    if (task.status !== "running") continue;
    task.results.forEach(result => {
      if (result.status !== "success") { result.status = "failed"; result.error = "页面重载中断了本地任务，请重试该项。"; }
    });
    task.status = "interrupted";
  }
}
export function workbenchModuleOptions(store, type, goal = demoGoal) {
  return store.modules.flatMap(module => {
    const version = module.versions.at(-1), configuration = version?.configuration;
    return !module.archived && module.enabled !== false && configuration
      && (type === "all" || (configuration.analysisType || "single") === type)
      && (!configuration.goal || configuration.goal === goal) ? [{ module, version, configuration }] : [];
  });
}
export function workbenchIssues(store, draft, { trialModule = null } = {}) {
  const errors = [], min = draft.analysisType === "multi" ? 2 : 1;
  if (!analysisTypes[draft.analysisType]) errors.push("请选择有效分析类型。");
  if (draft.goal !== demoGoal) errors.push("请选择业务目标。");
  if (draft.experiments.length < min) errors.push(`请添加至少 ${min} 个不同的实验。`);
  if (draft.analysisType === "single" && draft.experiments.length !== 1) errors.push("单实验分析只能选择 1 个独立实验。");
  if (new Set(draft.experiments.map(input => input.id)).size !== draft.experiments.length) errors.push("实验 ID 不能重复。");
  if (trialModule) {
    if ((trialModule.analysisType || "single") !== draft.analysisType) errors.push("模块试跑类型与实验输入不一致。");
  } else if (draft.moduleIds?.length) {
    const available = new Set(workbenchModuleOptions(store, draft.analysisType, draft.goal).map(option => option.module.id));
    if (new Set(draft.moduleIds).size !== draft.moduleIds.length) errors.push("分析模块不能重复。");
    if (draft.templateId) errors.push("请选择报告模板或单独分析模块。");
    for (const id of draft.moduleIds) if (!available.has(id)) errors.push("所选分析模块未上线、类型不一致或业务目标不一致。");
  } else if (!publishedTemplates(store, draft.analysisType).some(template => template.id === draft.templateId))
    errors.push("请选择同类型且模块版本有效的已发布模板。");
  for (const input of draft.experiments) experimentIssues(input, draft.goal).forEach(error => errors.push(`${input.id}：${error}`));
  return [...new Set(errors)];
}
const finite = value => typeof value === "number" && Number.isFinite(value);
const divided = (a, b, reason) => finite(a) && finite(b) && b !== 0
  ? { value: a / b, reason: "" } : { value: null, reason: reason || "原始数据缺失或分母为零" };
export function deriveGroup(experiment, input, group) {
  const days = observedDays(input.start, input.end), control = experiment.control;
  const scale = value => finite(value) && days ? value * days : null;
  const dac = scale(group.dacDaily), controlDac = scale(control.dacDaily);
  const gmv = scale(group.gmvDaily), controlGmv = scale(control.gmvDaily);
  const difference = (a, b) => finite(a) && finite(b) ? (a - b) * group.users : null;
  const incrementalDac = difference(dac, controlDac), incrementalGmv = difference(gmv, controlGmv);
  const subsidy = scale(group.subsidyDaily), redemption = scale(group.redemptionDaily);
  const costDenominator = incrementalDac > 0 ? incrementalDac : null;
  const values = {
    dac: { value: dac }, gmv: { value: gmv }, incrementalDac: { value: incrementalDac },
    incrementalGmv: { value: incrementalGmv },
    dailyDac: divided(incrementalDac, days),
    redeemCost: divided(redemption, costDenominator, redemption === null ? "未提供核销补贴" : "增量 DAC 不为正，成本不可计算"),
    cost: divided(subsidy, costDenominator, "增量 DAC 不为正，成本不可计算"),
    roi: divided(incrementalGmv, subsidy, "未提供结算补贴或结算补贴为零")
  };
  for (const key of ["dac", "gmv"]) {
    const uplift = divided(values[key].value, key === "dac" ? controlDac : controlGmv, "对照组数据缺失或为零");
    values[key].uplift = uplift.value === null ? null : (uplift.value - 1) * 100;
    values[key].sig = group.sig?.[key] || "未提供显著性";
  }
  for (const value of Object.values(values)) if (!finite(value.value)) {
    value.value = null; value.reason ||= "未提供数据";
  }
  return { experimentId: experiment.id, experimentName: experiment.name, groupId: group.id,
    groupName: group.name, controlId: control.id, controlName: control.name, users: group.users,
    days, start: input.start, end: input.end, values,
    raw: { dac, controlDac, gmv, controlGmv, subsidy, redemption },
    strategy: { ...experiment.strategy, ...group.strategy } };
}
export function deriveBreakdowns(experiment, input) {
  return [["较高消费力", "high", .4, 1.3], ["一般消费力", "standard", .6, .8]].flatMap(([label, dimensionValue, share, scale]) =>
    experiment.groups.filter(group => input.groupIds.includes(group.id)).map(group => {
      const control = { ...experiment.control, users: experiment.control.users * share,
        dacDaily: experiment.control.dacDaily * scale, gmvDaily: experiment.control.gmvDaily * scale };
      const subgroup = { ...group, users: group.users * share, dacDaily: group.dacDaily * scale,
        gmvDaily: group.gmvDaily * scale, subsidyDaily: group.subsidyDaily * share,
        redemptionDaily: group.redemptionDaily === null ? null : group.redemptionDaily * share,
        sig: { dac: "未提供分层显著性", gmv: "未提供分层显著性" } };
      return { ...deriveGroup({ ...experiment, control }, input, subgroup), dimension: label, dimensionValue,
        controlUsers: control.users };
    }));
}
export function createAnalysisTask(store, draft, { trialModule = null } = {}) {
  const errors = workbenchIssues(store, draft, { trialModule });
  if (errors.length) throw new Error(errors.join("\n"));
  const template = store.reportTemplates.find(template => template.id === draft.templateId);
  const version = template?.versions.at(-1);
  const selectedModules = draft.moduleIds?.length
    ? draft.moduleIds.map(id => workbenchModuleOptions(store, draft.analysisType, draft.goal).find(option => option.module.id === id)) : [];
  const configuration = trialModule ? {
    name: `${trialModule.name} · 模块试跑`, description: trialModule.description, analysisType: trialModule.analysisType,
    goal: draft.goal, sections: [{ title: trialModule.name, kind: "overall", moduleId: trialModule.id, version: 0 }]
  } : selectedModules.length ? {
    name: selectedModules.length === 1 ? selectedModules[0].configuration.name : `${analysisTypes[draft.analysisType]} · ${selectedModules.length} 个模块`,
    description: "", analysisType: draft.analysisType, goal: draft.goal,
    sections: selectedModules.map(({ module, version, configuration }) =>
      ({ title: configuration.name, kind: "overall", moduleId: module.id, version: version.number }))
  } : version.configuration;
  const moduleVersions = configuration.sections.map(section => {
    const module = store.modules.find(module => module.id === section.moduleId);
    const fixed = copy(trialModule || module.versions.find(v => v.number === section.version).configuration);
    if (fixed.calculatedMetrics?.length) {
      for (const source of fixed.sources.filter(source => source.kind === "sql")) {
        const version = store.abilities?.find(ability => ability.id === source.capabilityId)?.versions.find(version => version.number === source.version);
        if (version) source.calculationDefinition = {
          name: version.name, version: copy(version),
          metrics: [...new Map(version.modes.flatMap(mode => mode.fields.filter(field => field.role === "metric")).map(field => [field.key, field])).values()]
        };
      }
      const issues = validateCalculatedMetrics(fixed, source => source.definition || source.calculationDefinition);
      if (issues.length) throw new Error(issues.map(issue => issue.message).join("\n"));
    }
    return { id: module.id, version: section.version, configuration: fixed };
  });
  const task = { id: multiId("ma-task"), status: "running", startedAt: new Date().toISOString(),
    private: Boolean(trialModule), moduleId: trialModule?.id || "", scenario: draft.scenario || "normal",
    snapshot: copy({ analysisType: draft.analysisType, goal: draft.goal, supplement: draft.supplement,
      origin: trialModule ? "trial" : selectedModules.length ? "modules" : "template",
      templateId: trialModule || selectedModules.length ? "" : template.id,
      templateVersion: trialModule || selectedModules.length ? 0 : version.number, template: configuration,
      modules: moduleVersions, experiments: draft.experiments.map(input => {
        const definition = copy(resolveExperiment(input));
        if (moduleVersions.some(module => module.configuration.sources.some(source => source.capabilityId === "pre-aa")))
          definition.preAA = createPreAAEvidence(definition, input);
        return { input, definition };
      }) }),
    results: draft.experiments.map(input => ({ id: input.id, status: "pending", attempts: 0, rows: [], error: "" })) };
  store.multiAnalysis.tasks.unshift(task);
  if (task.private) {
    const module = store.modules.find(module => module.id === task.moduleId);
    module.multiAttempts ||= [];
    module.multiAttempts.unshift({ taskId: task.id, reportId: "", startedAt: task.startedAt, status: "running" });
  }
  return task;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function executeAnalysisTask(task, onUpdate = () => {}, delay = 240) {
  if (task.executing) return;
  task.executing = true; task.status = "running"; onUpdate(task);
  try {
    for (const result of task.results.filter(result => result.status !== "success")) {
      result.attempts++; result.error = ""; result.status = "fetching"; onUpdate(task); await pause(delay);
      if (task.scenario === "fail-last" && result.id === task.results.at(-1).id && result.attempts === 1) {
        result.status = "failed"; result.error = "模拟取数超时。可使用「重试失败项」恢复。"; onUpdate(task); continue;
      }
      result.status = "analyzing"; onUpdate(task); await pause(delay);
      const { input, definition } = task.snapshot.experiments.find(entry => entry.input.id === result.id);
      result.rows = definition.groups.filter(group => input.groupIds.includes(group.id))
        .map(group => deriveGroup(definition, input, group));
      result.breakdowns = deriveBreakdowns(definition, input);
      if (definition.preAA) result.preAA = copy(definition.preAA);
      result.moduleCalculations = {};
      for (const module of task.snapshot.modules.filter(module => module.configuration.calculatedMetrics?.length)) {
        const raw = comparisonCalculationRecords(module.configuration, result, { input, definition });
        result.moduleCalculations[module.id] = computeModuleCalculations(module.configuration, raw);
      }
      const calculationIssues = Object.values(result.moduleCalculations).flatMap(calculation => calculation.issues);
      if (calculationIssues.length) {
        result.status = "failed"; result.error = [...new Set(calculationIssues.map(issue => issue.message))].join(" ");
        onUpdate(task); continue;
      }
      result.status = "success"; result.completedAt = new Date().toISOString(); onUpdate(task);
    }
    task.status = task.results.every(result => result.status === "success") ? "success"
      : task.results.some(result => result.status === "success") ? "partial" : "failed";
    task.completedAt = new Date().toISOString();
  } finally { delete task.executing; onUpdate(task); }
}
export const taskRows = task => task.results.filter(result => result.status === "success").flatMap(result => result.rows);
export function reportMetrics(snapshot) {
  const keys = new Set(snapshot.modules.flatMap(module => module.configuration.sources
    .filter(source => source.showInReport).flatMap(source => source.metricKeys)));
  return comparisonMetrics.filter(metric => keys.has(metric.key));
}
export function comparisonBoundaries(snapshot, results) {
  const successful = results.filter(result => result.status === "success");
  const entries = snapshot.experiments.filter(entry => successful.some(result => result.id === entry.input.id));
  const rows = successful.flatMap(result => result.rows), boundaries = [];
  if (new Set(rows.map(row => row.days)).size > 1) boundaries.push("观察天数不同，累计值受窗口长度影响；可同时查看日均指标。");
  if (new Set(entries.map(entry => entry.definition.period.join("/"))).size > 1) boundaries.push("实验期不同，季节、活动和外部环境可能影响结果。");
  for (const [key, title] of [["app", "适用端"], ["audience", "人群"], ["category", "商品 / 类目"]]) {
    if (new Set(rows.map(row => row.strategy[key])).size > 1) boundaries.push(`${title}不同，当前横向比较仅为描述性参考。`);
  }
  if (snapshot.analysisType === "multi") boundaries.push("显著性仅适用于实验内策略组与自身对照组；不能据此判断跨实验差异显著或确定策略因果。");
  if (entries.some(entry => entry.input.end > entry.definition.period[1])) boundaries.push("部分观察窗口含实验后追踪期，需区分策略执行期和后续表现。");
  const visibleKeys = reportMetrics(snapshot).map(metric => metric.key);
  if (rows.some(row => visibleKeys.some(key => row.values[key].value === null))) boundaries.push("部分指标原始数据缺失或分母无效，显示「—」并保留原因。");
  return boundaries;
}
export function createTaskReport(store, task) {
  const successCount = task.results.filter(result => result.status === "success").length;
  if (successCount < (task.snapshot.analysisType === "multi" ? 2 : 1)) return null;
  // A retry produces a new report snapshot; earlier partial reports remain immutable.
  const report = { id: multiId("ma-report"), taskId: task.id, createdAt: new Date().toISOString(),
    private: task.private, snapshot: copy(task.snapshot), results: copy(task.results), status: task.status };
  store.multiAnalysis.reports.unshift(report); task.reportId = report.id;
  if (task.private) {
    const module = store.modules.find(module => module.id === task.moduleId);
    const attempt = module.multiAttempts?.find(attempt => attempt.taskId === task.id);
    if (attempt) { attempt.reportId = report.id; attempt.status = task.status; }
  }
  return report;
}
export const formatMetric = (value, metric) => value === null || value === undefined ? "—"
  : value.toLocaleString("zh-CN", { minimumFractionDigits: metric.digits, maximumFractionDigits: metric.digits });
