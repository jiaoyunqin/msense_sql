import { clone, uid, hash, defaultContext, currentActor, businessGoal } from "./composer-data.js";
import { comparisonMetrics } from "./multi-experiment-data.js";
import { templateReferenceModules } from "./report-template-reference-data.js";
import {
  calculationCandidatesFor, resolveCalculationMetricFor, validateCalculatedMetrics,
  newCalculatedMetric, calculationMetricRef
} from "./analysis-module-calculations.js";
export { newCalculatedMetric, calculationMetricRef, metricReferenceKey } from "./analysis-module-calculations.js";

const fields = (rows, prefix) => rows.map(([name, description, semanticType = "number"], index) => ({
  key: `${prefix}_${index}`, name, description: description || "",
  type: semanticType === "text" ? "string" : "number", role: "metric",
  ...(semanticType !== "number" ? { semanticType, calculable: false } : {})
}));
const coreMetrics = fields([
  ["进组用户数", "进组去重用户数"],
  ["支付转化率", "实验期间，大盘累计支付用户数 / 进组用户数"],
  ["支付转化率增幅", "实验组支付转化率 / 对照组支付转化率 − 1"],
  ["支付转化率显著性", "显著性水平 5%", "significance"],
  ["增量支付用户数", "（实验组支付转化率 − 对照组支付转化率）× 实验组进组用户数"],
  ["人均支付订单数", "实验期间，累计支付订单数 / 进组用户数"],
  ["人均支付 GMV", "实验期间，累计支付 GMV / 进组用户数"],
  ["累计支付 GMV", "实验观察窗口内的累计支付金额"],
  ["累计支付订单数", "实验观察窗口内的累计支付订单数"],
  ["补贴金额", "实验观察窗口内的累计补贴金额"],
  ["GMV-ROI", "增量支付 GMV / 补贴金额"]
], "core");
const dimensionNames = [
  "整体", "常驻城市等级", "年龄", "性别", "消费力分层", "电商人群八分层",
  "商城生命周期", "商城新入口生命周期", "搜索生命周期", "搜索分场景生命周期",
  "上次购买距入组日期的天数", "历史购买单量", "近30天购买单量", "近30天购买天数",
  "历史购买总天数", "商城用户分层", "金币敏感度", "Libra实验的分组ID",
  "电商大盘生命周期", "抖音科技双端活跃度", "电商价格敏感度", "顶底tab",
  "老客转化前身份", "30天非精品支付战略二级管理类目数分层", "售后反馈分层",
  "活跃天数分层（抖音端）", "活跃天数分层（抖极端）", "抖极商城外搜索活跃度",
  "抖音商城新入口搜索活跃度", "抖音搜索活跃度", "抖极商城新入口搜索活跃度",
  "抖极搜索活跃度", "抖音商城外搜索活跃度", "老客价值分层",
  "用户360常驻省份（过滤海外省份）", "用户信用等级", "用户冲动消费概率分层",
  "用户gmv价值分层", "基于LLM的用户价值标签", "用户一级爱类标签",
  "一级类目", "二级类目", "商家", "品牌", "商品", "综合品牌S等级",
  "商品sku最低价分层", "店铺类型", "综合品牌P等级", "行业大类", "体裁",
  "订单实付价格带", "一级子赛道", "二级子赛道", "三级子赛道", "行业子赛道（用户分类）",
  "战略一级行业分类", "战略二级行业分类", "战略二级管理类目名称",
  "购买场景分类", "商城入口分类", "搜索入口分类", "购买场域（坑位口径）", "APP渠道"
];
const coreDimensions = dimensionNames.map((name, index) => ({ key: `drill_${index}`, name }));
const couponMetrics = fields([
  ["领券用户数", "成功领取优惠券的去重用户数"],
  ["领券张数", "实验期间累计领取的优惠券张数"],
  ["核销用户数", "使用优惠券完成支付的去重用户数"],
  ["核销张数", "实验期间累计核销的优惠券张数"],
  ["券核销率", "核销券张数 / 领券张数"],
  ["券核销 GMV", "使用优惠券支付的订单实付金额"],
  ["券补贴金额", "已核销优惠券对应的补贴金额"]
], "coupon");
export const moduleBuiltins = [
  { id: "demo-comparison", name: "独立实验核心指标（模拟）", description: "逐实验获取自身对照组和策略组，不合并不同实验的数据。",
    metrics: comparisonMetrics.map(metric => ({ ...metric, role: "metric", type: "number",
      description: "本地模拟口径；以当前实验自身对照组计算。" })),
    dimensions: [{ key: "overall", name: "整体" }, { key: "demo-spend", name: "消费力分层（模拟）" }] },
  { id: "experiment-config", name: "实验背景与配置", description: "查询实验基本信息与营销配置。",
    metrics: fields([
      ["实验时间", "实验的开始日期和结束日期", "text"], ["实验流量", "当前实验组分配的流量比例"],
      ["发券面额", "实验组配置的券面额或券包内容", "text"], ["发券时效", "优惠券领取后的有效期规则", "text"],
      ["券可用范围", "优惠券允许使用的范围", "text"], ["领取次数", "同一用户允许领取的次数"],
      ["发券点位", "优惠券的投放入口", "text"]
    ], "experiment"), dimensions: [] },
  { id: "pre-aa", name: "PreAA指标", description: "查看实验启动前的指标，核对实验组与对照组的均衡情况。",
    metrics: fields([["PreAA GMV", "实验启动前的累计支付金额"], ["PreAA 订单量", "实验启动前的支付订单数"],
      ["PreAA 支付用户数", "实验启动前的去重支付用户数"]], "preaa"), dimensions: [] },
  { id: "core-summary", name: "核心指标汇总", description: "查询各实验组与对照组的短期累计及 GMV-ROI 指标。",
    metrics: coreMetrics, dimensions: [{ key: "overall", name: "整体" }] },
  { id: "core-drilldown", name: "核心指标单维度下钻",
    description: "查询各实验组和对照组的短期累计及 GMV-ROI 指标在一个指定维度下的分布。",
    metrics: coreMetrics, dimensions: coreDimensions },
  { id: "coupon-overall", name: "领券核销整体情况", description: "查询各实验组的领券核销漏斗。",
    metrics: couponMetrics, dimensions: [{ key: "overall", name: "整体" }] },
  { id: "coupon-drilldown", name: "领券核销单维度下钻", description: "查询领券核销漏斗在一个指定维度下的分布。",
    metrics: couponMetrics, dimensions: coreDimensions },
  { id: "coupon-batch", name: "按券批次看领券核销指标", description: "覆盖平台老客提频领券核销的全部券批次。",
    metrics: couponMetrics, dimensions: [{ key: "batch", name: "券批次" }, { key: "overall", name: "整体" }] }
];
export function builtinSource(id, selected = false, dimensionName = "") {
  const definition = moduleBuiltins.find((source) => source.id === id);
  return { id: uid("source"), kind: "rpc", capabilityId: id, version: 1,
    // Freeze the local catalog definition as well as SQL versions.
    definition: clone(definition), metricKeys: selected ? definition.metrics.map((f) => f.key) : [],
    dimensionKeys: dimensionName ? definition.dimensions.filter((d) => d.name === dimensionName).map((d) => d.key)
      : definition.dimensions.map((d) => d.key), showInReport: true, expanded: false };
}
export function sqlSource(ability, version, selections = null) {
  return { id: uid("source"), kind: "sql", capabilityId: ability.id, version: version.number,
    metricKeys: [...new Set(version.modes.flatMap((mode) =>
      mode.fields.filter((f) => f.role === "metric" && (!selections || selections[mode.id]?.includes(f.key))).map((f) => f.key)))],
    dimensionKeys: version.modes.filter((mode) => !selections || selections[mode.id]?.length).map((mode) => mode.id),
    showInReport: true, expanded: false };
}
export function sourceDefinition(store, source) {
  if (source.kind === "rpc") {
    const definition = source.definition || (source.version === 1 && moduleBuiltins.find((entry) => entry.id === source.capabilityId));
    return definition?.id === source.capabilityId && (definition.version ?? 1) === source.version ? definition : null;
  }
  if (source.kind !== "sql") return null;
  const version = store.abilities.find((ability) => ability.id === source.capabilityId)?.versions.find((v) => v.number === source.version);
  if (!version) return null;
  const metrics = [...new Map(version.modes.flatMap((mode) => mode.fields.filter((f) => f.role === "metric")).map((f) => [f.key, f])).values()];
  return { name: version.name, description: version.definition.description || "", metrics,
    dimensions: version.modes.map((mode) => ({
      key: mode.id, name: mode.members.length
        ? mode.fields.filter((f) => f.role === "dimension").map((f) => f.name).join(" × ") || mode.name
        : version.modes.filter((candidate) => candidate.kind === "overall").length > 1 ? mode.name : "整体",
      description: mode.kind === "cross" ? "交叉维度" : mode.kind === "single" ? "单维下钻" : ""
    })), version };
}
export function newAnalysisModule() {
  return { id: uid("module"), name: "", description: "", goal: businessGoal, apps: [],
    analysisType: "single",
    createdBy: currentActor, capabilityId: "", version: 0, selections: {}, sources: [], calculatedMetrics: [],
    reasoning: "", considerations: "", context: clone(defaultContext), scenario: "normal",
    savedAt: "", updatedAt: "", attempts: [], versions: [], enabled: true, archived: false };
}
export function moduleConfiguration(module) {
  return clone({
    name: module.name, description: module.description, goal: businessGoal, apps: module.apps,
    analysisType: module.analysisType || "single",
    sources: module.sources.map(({ expanded, ...source }) => source),
    reasoning: module.reasoning, considerations: module.considerations,
    // Omit empty definitions to preserve legacy configuration/trial hashes exactly.
    ...(module.calculatedMetrics != null && (!Array.isArray(module.calculatedMetrics) || module.calculatedMetrics.length)
      ? { calculatedMetrics: module.calculatedMetrics } : {})
  });
}
export const moduleHash = (module) => {
  const configuration = moduleConfiguration(module);
  // Keep unchanged legacy single-experiment signatures valid.
  if (configuration.analysisType === "single") delete configuration.analysisType;
  return hash(configuration);
};
export function moduleState(module) {
  if (!module.versions.length) return "draft";
  return module.enabled === false ? "offline" : "online";
}
export function initializeModules(store) {
  if (!store.modules) {
    const legacy = store.analysis;
    Object.assign(legacy, { id: "sql-effect", apps: [], createdBy: currentActor, sources: [],
      versions: [], enabled: true, archived: false });
    const ability = store.abilities.find((entry) => entry.id === legacy.capabilityId);
    const version = ability?.versions.find((entry) => entry.number === legacy.version);
    if (version) legacy.sources.push(sqlSource(ability, version, legacy.selections));
    store.modules = [legacy];
  }
  if (!store.analysisModuleSeeded) {
    const seeds = [
      ["coupon-batch", "按券批次看领券核销", "覆盖平台老客提频领券核销的全部", "按券批次看领券核销指标", "", false, []],
      ["core-eight", "核心指标表现-电商人群八分层", "", "核心指标单维度下钻", "电商人群八分层", true, ["抖音", "极速版"]],
      ["core-overall", "核心指标表现-整体", "", "核心指标汇总", "整体", true, ["抖音", "极速版"]],
      ["coupon-overall", "领券核销情况-整体", "分析领券核销漏斗", "领券核销整体情况", "整体", true, ["抖音", "极速版"]],
      ["coupon-eight", "领券核销情况-电商人群八分层", "分析领券核销漏斗", "领券核销单维度下钻", "电商人群八分层", true, ["抖音", "极速版"]],
      ["preaa", "preAA", "实验 preAA 分析", "PreAA指标", "", true, ["抖音"]]
    ];
    for (const [id, name, description, sourceName, dimension, published, apps] of seeds) {
      if (store.modules.some((module) => module.id === id)) continue;
      const module = newAnalysisModule();
      const definition = moduleBuiltins.find((source) => source.name === sourceName);
      Object.assign(module, { id, name, description, apps,
        reasoning: "比较实验组与对照组的指标表现，结合所选维度分析差异。",
        sources: [builtinSource(definition.id, true, dimension)],
        savedAt: "2026-09-23T12:27:00.000Z", updatedAt: "2026-09-23T12:27:00.000Z" });
      if (published) module.versions.push({ number: 1, publishedAt: module.savedAt,
        operator: currentActor, signature: moduleHash(module), configuration: moduleConfiguration(module) });
      store.modules.push(module);
    }
    store.analysisModuleSeeded = true;
  }
  if (!store.multiModuleSeeded) {
    for (const [id, name, type, source] of [
      ["multi-core", "跨实验 · 核心表现对比", "multi", "demo-comparison"],
      ["multi-strategy", "跨实验 · 策略配置差异", "multi", "experiment-config"],
      ["multi-detail", "跨实验 · 单实验证据核对", "multi", "demo-comparison"],
      ["single-demo-core", "单实验 · 核心指标（模拟）", "single", "demo-comparison"]
    ]) {
      const module = newAnalysisModule();
      Object.assign(module, { id, name, analysisType: type, description: "多实验分析 Demo 配套模块，使用虚拟实验数据。",
        sources: [builtinSource(source, true, id === "multi-detail" ? "" : source === "demo-comparison" ? "整体" : "")], savedAt: "2026-11-05T02:00:00Z", updatedAt: "2026-11-05T02:00:00Z",
        reasoning: type === "multi" ? "逐实验核对自身对照组，比较策略的指标表现与配置差异，再说明观察窗口和人群差异。"
          : "比较本实验策略组相对自身对照组的表现。",
        considerations: "不直接合计跨实验指标，不推断跨实验统计显著性，不将配置差异作为确定因果。" });
      module.versions.push({ number: 1, publishedAt: module.savedAt, operator: currentActor,
        signature: moduleHash(module), configuration: moduleConfiguration(module) });
      if (!store.modules.some(entry => entry.id === id)) store.modules.push(module);
    }
    store.multiModuleSeeded = true;
  }
  if (!store.calculatedModuleDemoSeeded) {
    for (const [id, name, type, capabilityId, left, right, format] of [
      ["calculated-metrics-demo", "计算指标 · 领券核销", "single", "coupon-overall", "coupon_2", "coupon_0", "percent"],
      ["multi-calculated-demo", "计算指标 · 多实验", "multi", "demo-comparison", "gmv", "dac", "number"]
    ]) {
      if (store.modules.some(module => module.id === id)) continue;
      const module = newAnalysisModule(), source = builtinSource(capabilityId);
      source.metricKeys = [left, right];
      const calculation = newCalculatedMetric();
      Object.assign(calculation, { name: type === "single" ? "用户核销率" : "每支付天 GMV", format });
      calculation.formula.left = calculationMetricRef(source, left);
      calculation.formula.right = calculationMetricRef(source, right);
      Object.assign(module, { id, name, analysisType: type, sources: [source], calculatedMetrics: [calculation],
        description: type === "single" ? "使用领券核销指标计算用户核销率。" : "分别计算各实验整体与消费力分层的每支付天 GMV。",
        reasoning: "分别核对各分组原始指标和计算结果，保留缺失原因。",
        considerations: "本地模拟数据；计算结果不附加显著性，也不跨实验混算。",
        savedAt: "2026-11-08T12:00:00Z", updatedAt: "2026-11-08T12:00:00Z" });
      if (type === "multi") module.versions.push({ number: 1, publishedAt: module.savedAt, operator: currentActor,
        signature: moduleHash(module), configuration: moduleConfiguration(module) });
      store.modules.push(module);
    }
    store.calculatedModuleDemoSeeded = true;
  }
  if (!store.templateReferenceModulesSeeded) {
    const additions = [];
    for (const fixture of templateReferenceModules) {
      if (store.modules.some(module => module.id === fixture.id)) continue;
      const module = newAnalysisModule();
      const metrics = fixture.metrics.map(([key, name, semanticType]) => ({
        key, name, description: "", role: "metric", type: semanticType ? "string" : "number",
        ...(semanticType ? { semanticType, calculable: false } : {})
      }));
      const dimensions = [{ key: "overall", name: "整体（不拆分）" },
        ...fixture.dimensions.map((name, index) => ({ key: `reference_dimension_${index}`, name }))];
      const source = { id: uid("source"), kind: "rpc", capabilityId: fixture.source, version: 1,
        definition: { id: fixture.source, name: fixture.name, description: fixture.description || "", metrics, dimensions },
        metricKeys: metrics.map(metric => metric.key), dimensionKeys: dimensions.map(dimension => dimension.key),
        showInReport: true, expanded: false };
      Object.assign(module, { id: fixture.id, name: fixture.name, description: fixture.description || "",
        apps: ["抖音", "极速版"], sources: [source], reasoning: "比较实验组与自身对照组的指标表现，结合所选维度分析差异。",
        savedAt: "2026-11-08T12:00:00Z", updatedAt: "2026-11-08T12:00:00Z" });
      for (let number = 1; number <= (fixture.version || 1); number++) {
        module.versions.push({ number, publishedAt: module.savedAt, operator: currentActor,
          signature: moduleHash(module), configuration: moduleConfiguration(module) });
      }
      additions.push(module);
    }
    store.modules.unshift(...additions);
    store.templateReferenceModulesSeeded = true;
  }
  for (const module of store.modules) {
    module.analysisType ||= "single";
    module.sources ||= []; module.versions ||= []; module.attempts ||= []; module.apps ||= [];
    module.calculatedMetrics ??= [];
    module.context ||= clone(defaultContext); module.goal = businessGoal;
    for (const attempt of module.attempts) if (attempt.status === "running") {
      attempt.status = "insufficient"; attempt.error = "页面重载中断了试跑，请重新运行。";
      attempt.gaps ||= []; attempt.gaps.push(attempt.error);
    }
  }
  store.analysis = store.modules.find((module) => module.id === store.analysis.id) || store.modules[0];
}
export function attachAnalysisVersion(store, ability, number) {
  const module = store.analysis;
  const version = ability.versions.find((candidate) => candidate.number === number);
  if (!version) throw new Error("取数能力版本不存在。");
  // SQL references remain pinned; swapping one reference cannot change others.
  const previous = module.sources.find((source) => source.kind === "sql" && source.capabilityId === ability.id);
  if (previous?.version === number) return;
  const source = sqlSource(ability, version);
  if (previous) module.sources.splice(module.sources.indexOf(previous), 1, source);
  else module.sources.push(source);
  module.capabilityId = ability.id; module.version = number;
  module.selections = Object.fromEntries(version.modes.map((mode) => [mode.id,
    mode.fields.filter((field) => field.role === "metric").map((field) => field.key)]));
  source.expanded = true;
}
export function calculationCandidates(store, module) {
  return calculationCandidatesFor(module, source => sourceDefinition(store, source));
}
export function resolveCalculationMetric(store, module, ref, options) {
  return resolveCalculationMetricFor(module, ref, source => sourceDefinition(store, source), options);
}
export function calculatedMetricIssues(store, module, key) {
  return validateCalculatedMetrics(module, source => sourceDefinition(store, source), key);
}
export function includeCalculationDependency(store, module, ref) {
  const { candidate, issues } = resolveCalculationMetric(store, module, ref, { requireSelected: false });
  if (issues.length) throw new Error(issues.map(issue => issue.message).join(" "));
  const source = module.sources.find(source => source.id === ref.sourceId);
  const added = !candidate.selected;
  if (added) (source.metricKeys ||= []).push(ref.key);
  return { added, sourceId: source.id, key: ref.key };
}
// Use the returned fields when copying a module; histories stay with the original.
export function copyModuleSources(module) {
  const sources = structuredClone(module.sources || []), sourceIdMap = new Map();
  for (const source of sources) {
    if (sourceIdMap.has(source.id)) throw new Error("取数来源身份重复，无法复制。");
    sourceIdMap.set(source.id, uid("source")); source.id = sourceIdMap.get(source.id);
  }
  const calculatedMetrics = structuredClone(module.calculatedMetrics ?? []);
  if (Array.isArray(calculatedMetrics)) for (const metric of calculatedMetrics) {
    for (const operand of [metric?.formula?.left, metric?.formula?.right]) {
      if (operand?.type === "metric" && sourceIdMap.has(operand.sourceId))
        operand.sourceId = sourceIdMap.get(operand.sourceId);
    }
  }
  return { sources, calculatedMetrics, sourceIdMap };
}
export function moduleIssues(store, module, sources = module.sources, { sourceTrial = false } = {}) {
  const issues = [];
  if (!["single", "multi"].includes(module.analysisType || "single")) issues.push("请选择分析类型。");
  if (module.analysisType === "multi" && !module.reasoning.trim()) issues.push("请说明跨实验分析思路。");
  if (!module.name.trim()) issues.push("请填写模块名称。");
  if (!sources.length) issues.push("请选择取数模块。");
  for (const source of sources) {
    const definition = sourceDefinition(store, source);
    if (!definition) { issues.push("固定版本已不可用，请重新选择取数模块。"); continue; }
    if (!source.metricKeys.length) issues.push(`${definition.name}：请选择至少一个指标。`);
    if (source.metricKeys.some((key) => !definition.metrics.some((field) => field.key === key)))
      issues.push(`${definition.name}：所选指标已失效。`);
    if (definition.dimensions.length && !source.dimensionKeys.length)
      issues.push(`${definition.name}：请选择至少一种下钻维度。`);
    if (source.dimensionKeys.some((key) => !definition.dimensions.some((field) => field.key === key)))
      issues.push(`${definition.name}：所选维度已失效。`);
    if (source.kind === "sql" && definition.version) {
      const modes = definition.version.modes.filter((mode) => source.dimensionKeys.includes(mode.id));
      if (modes.some((mode) => !mode.fields.some((field) => field.role === "metric" && source.metricKeys.includes(field.key))))
        issues.push(`${definition.name}：部分所选维度没有对应指标，无法执行。`);
      if (source.metricKeys.some((key) => !modes.some((mode) => mode.fields.some((field) => field.role === "metric" && field.key === key))))
        issues.push(`${definition.name}：部分指标没有对应的取数模式。`);
    }
  }
  if (!sourceTrial) issues.push(...calculatedMetricIssues(store, module).map(issue => issue.message));
  return [...new Set(issues)];
}
