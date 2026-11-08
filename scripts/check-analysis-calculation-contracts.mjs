import assert from "node:assert/strict";
import { build } from "esbuild";
import { hash } from "../src/prototype-data.js";
import {
  newCalculatedMetric, calculationMetricRef, metricReferenceKey, isCalculationMetric,
  commonGrains, sharedGrainKey, indexCalculationRecord
} from "../src/analysis-module-calculations.js";

// Bundle the data entry in memory: its existing JSON imports use Vite's import syntax.
const bundle = await build({ entryPoints: ["src/analysis-module-data.js"], bundle: true,
  write: false, platform: "node", format: "esm" });
const data = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const {
  newAnalysisModule, builtinSource, sqlSource, sourceDefinition, calculationCandidates,
  resolveCalculationMetric, calculatedMetricIssues, includeCalculationDependency,
  copyModuleSources, moduleConfiguration, moduleHash, moduleIssues, initializeModules
} = data;
const copy = value => structuredClone(value);
const store = { abilities: [] };
const moduleWith = (...sources) => ({ ...newAnalysisModule(), name: "Contract test", reasoning: "Compare inputs.", sources });
const calculation = (left, right = { type: "constant", value: 2 }) => ({
  ...newCalculatedMetric(), name: "Result", formula: { operator: "/", left, right }
});
const ref = (source, key = "coupon_0") => calculationMetricRef(source, key);
const codes = module => calculatedMetricIssues(store, module).map(issue => issue.code);
let checks = 0;
function check(label, run) {
  run(); checks++; console.log(`PASS ${label}`);
}
const shared = {
  schemaVersion: 1, population: "all-experiment-users", entity: "user",
  experimentNamespace: "libra", groupNamespace: "libra-version", windowSemantics: "observation-inclusive-date",
  dimensions: []
};
function sqlVersion(number = 1, modes) {
  return { number, name: `SQL v${number}`, definition: { description: "" }, modes: modes || [{
    id: "overall", name: "Overall", kind: "overall", members: [],
    fields: [{ key: "a", alias: "a", name: "Same name", role: "metric", type: "number" },
      { key: "b", alias: "b", name: "Same name", role: "metric", type: "number" },
      { key: "label", alias: "label", name: "Label", role: "metric", type: "string" }]
  }] };
}
const ability = { id: "sql-fixed", versions: [sqlVersion(), sqlVersion(2)] };
ability.versions[1].modes[0].fields.push({ key: "new", alias: "new", name: "New", type: "number", role: "metric" });
store.abilities.push(ability);

check("Defaults are independently generated, binary and incomplete", () => {
  const a = newCalculatedMetric(), b = newCalculatedMetric();
  assert.notEqual(a.key, b.key);
  assert.deepEqual(a, { schemaVersion: 1, key: a.key, name: "", formula: { operator: "/", left: null, right: null },
    format: "number", precision: 2, showInReport: true });
  assert.deepEqual(newAnalysisModule().calculatedMetrics, []);
});
check("Legacy configuration and module hashes remain byte-for-byte equivalent", () => {
  const module = moduleWith(builtinSource("coupon-overall", true));
  const legacy = { name: module.name, description: module.description, goal: module.goal, apps: module.apps,
    sources: module.sources.map(({ expanded, ...source }) => source), reasoning: module.reasoning, considerations: module.considerations };
  assert.equal(moduleHash(module), hash(legacy));
});
check("Empty calculation defaults do not change existing trial configuration signatures", () => {
  const module = moduleWith(builtinSource("coupon-overall", true));
  const legacy = { name: module.name, description: module.description, goal: module.goal, apps: module.apps,
    analysisType: "single", sources: module.sources.map(({ expanded, ...source }) => source),
    reasoning: module.reasoning, considerations: module.considerations };
  assert.equal(hash(moduleConfiguration(module)), hash(legacy));
  delete module.calculatedMetrics;
  assert.equal(hash(moduleConfiguration(module)), hash(legacy));
  module.analysisType = "multi";
  assert.equal(moduleHash(module), hash({ ...legacy, analysisType: "multi" }));
});
check("Candidates include unchecked metrics, never unselected sources or nonnumeric outputs", () => {
  const source = builtinSource("coupon-overall"), module = moduleWith(source);
  source.metricKeys = ["coupon_0"]; source.showInReport = false;
  assert.equal(calculationCandidates(store, module).length, 7);
  assert.equal(calculationCandidates(store, module).filter(candidate => candidate.selected).length, 1);
  assert(calculationCandidates(store, module).every(candidate => candidate.ref.sourceId === source.id));
  assert.deepEqual(calculationCandidates(store, moduleWith()), []);
  assert(!isCalculationMetric({ key: "age", role: "dimension", type: "number" }));
  assert(!isCalculationMetric({ key: "p_value", role: "metric", type: "number" }));
});
check("Known legacy text and significance remain excluded without rewriting snapshots", () => {
  const config = builtinSource("experiment-config", true), core = builtinSource("core-summary", true);
  for (const source of [config, core]) for (const field of source.definition.metrics) {
    field.type = "number"; delete field.calculable; delete field.semanticType;
  }
  const before = JSON.stringify([config, core]);
  assert.deepEqual(calculationCandidates(store, moduleWith(config)).map(candidate => candidate.ref.key), ["experiment_1", "experiment_5"]);
  assert(!calculationCandidates(store, moduleWith(core)).some(candidate => candidate.ref.key === "core_3"));
  assert.equal(JSON.stringify([config, core]), before);
});
check("Reference identity distinguishes equal names, source instances and fixed versions", () => {
  const a = sqlSource(ability, ability.versions[0]), b = sqlSource(ability, ability.versions[0]), module = moduleWith(a, b);
  const candidates = calculationCandidates(store, module);
  assert.equal(candidates.length, 4);
  assert.equal(new Set(candidates.map(candidate => metricReferenceKey(candidate.ref))).size, 4);
  assert(!candidates.some(candidate => candidate.ref.key === "new"));
  const bad = { ...ref(a, "a"), version: 2 };
  assert.equal(resolveCalculationMetric(store, module, bad).issues[0].code, "version-mismatch");
  assert.equal(resolveCalculationMetric(store, module, ref({ ...a, id: "unselected" }, "a")).issues[0].code, "missing-source");
});
check("Dependency inclusion is explicit, idempotent and cannot add another source", () => {
  const source = builtinSource("coupon-overall"), module = moduleWith(source), input = ref(source);
  assert.equal(resolveCalculationMetric(store, module, input).issues[0].code, "unselected-metric");
  assert.deepEqual(includeCalculationDependency(store, module, input), { added: true, sourceId: source.id, key: "coupon_0" });
  assert.equal(includeCalculationDependency(store, module, input).added, false);
  assert.deepEqual(source.metricKeys, ["coupon_0"]);
  assert.throws(() => includeCalculationDependency(store, module, { ...input, sourceId: "other" }));
  module.calculatedMetrics.push(calculation(input)); module.calculatedMetrics = [];
  assert.deepEqual(source.metricKeys, ["coupon_0"]);
  assert.equal(module.sources.length, 1);
});
check("Invalid dependencies persist in drafts and block whole-trial/publish validation", () => {
  const source = builtinSource("coupon-overall", true), module = moduleWith(source);
  module.calculatedMetrics.push(calculation(ref(source)));
  assert.deepEqual(moduleIssues(store, module), []);
  source.metricKeys = ["coupon_1"];
  const before = JSON.stringify(module.calculatedMetrics);
  assert(codes(module).includes("unselected-metric"));
  assert(moduleIssues(store, module, module.sources).length);
  assert.deepEqual(moduleIssues(store, module, [source], { sourceTrial: true }), []);
  assert.equal(JSON.stringify(moduleConfiguration(module).calculatedMetrics), before);
  source.metricKeys = ["coupon_0"]; assert.deepEqual(codes(module), []);
  source.version = 2; assert(codes(module).includes("version-mismatch"));
  source.version = 1; module.sources = []; assert(codes(module).includes("missing-source"));
  assert.equal(JSON.stringify(module.calculatedMetrics), before);
});
check("RPC snapshots cannot silently resolve another capability/version or the latest catalog", () => {
  const source = builtinSource("coupon-overall", true), saved = copy(source);
  source.version = 2; assert.equal(sourceDefinition(store, source), null);
  source.version = 1; source.capabilityId = "core-summary"; assert.equal(sourceDefinition(store, source), null);
  const legacy = { ...saved }; delete legacy.definition;
  assert(sourceDefinition(store, legacy));
  legacy.version = 99; assert.equal(sourceDefinition(store, legacy), null);
  const module = moduleWith(saved);
  saved.definition.metrics = saved.definition.metrics.filter(field => field.key !== "coupon_0");
  assert(!calculationCandidates(store, module).some(candidate => candidate.ref.key === "coupon_0"));
});
check("Formula validation covers names, format, precision, operators and finite constants", () => {
  const source = builtinSource("coupon-overall", true), module = moduleWith(source), metric = calculation(ref(source));
  module.calculatedMetrics = [metric];
  for (const operator of ["+", "-", "*", "/"]) {
    metric.formula.operator = operator;
    for (const value of [0, -2, .2]) { metric.formula.right.value = value; assert.deepEqual(codes(module), []); }
  }
  for (const value of ["2", "", null, Infinity, NaN]) {
    metric.formula.right.value = value; assert(codes(module).includes("invalid-constant"));
  }
  metric.formula.right.value = 2;
  for (const precision of [-1, 7, 1.5, "2"]) { metric.precision = precision; assert(codes(module).includes("invalid-precision")); }
  metric.precision = 6; metric.format = "percent"; assert.deepEqual(codes(module), []);
  metric.formula.operator = "eval"; assert(codes(module).includes("invalid-operator"));
  metric.formula.operator = "/"; metric.formula.left = { type: "constant", value: 2 };
  assert(codes(module).includes("invalid-reference"));
  metric.formula.left = { type: "calculation", key: metric.key }; assert(codes(module).includes("invalid-reference"));
  metric.formula.left = ref(source);
  module.calculatedMetrics.push({ ...copy(metric), key: "calc_other", name: ` ${metric.name} ` });
  assert(codes(module).includes("duplicate-name"));
  assert(calculatedMetricIssues(store, module, "calc_other").every(issue => issue.key === "calc_other"));
  module.calculatedMetrics.push(null); assert(codes(module).includes("invalid-schema"));
});
check("Only selected metric-supporting modes form same-record grains", () => {
  const version = sqlVersion(1, [
    { id: "a-mode", kind: "overall", members: [], fields: [{ key: "a", name: "A", role: "metric", type: "number" }] },
    { id: "b-mode", kind: "overall", members: [], fields: [{ key: "b", name: "B", role: "metric", type: "number" }] }
  ]);
  const separate = { id: "separate", versions: [version] }; store.abilities.push(separate);
  const source = sqlSource(separate, version), module = moduleWith(source);
  module.calculatedMetrics = [calculation(ref(source, "a"), ref(source, "b"))];
  assert(codes(module).includes("incompatible-grain"));
  module.calculatedMetrics[0].formula.right = { type: "constant", value: 2 };
  assert.deepEqual(codes(module), []);
  source.dimensionKeys = ["b-mode"]; assert(codes(module).includes("incompatible-grain"));
});
check("Cross-source formulas require matching structured contracts, not names or overall labels", () => {
  const a = builtinSource("coupon-overall", true), b = builtinSource("coupon-overall", true), module = moduleWith(a, b);
  module.calculatedMetrics = [calculation(ref(a), ref(b))];
  assert(codes(module).includes("incompatible-grain"));
  a.definition.dimensions[0].calculationGrain = copy(shared);
  b.definition.dimensions[0].calculationGrain = copy(shared);
  assert.deepEqual(codes(module), []);
  for (const field of ["population", "entity", "experimentNamespace", "groupNamespace", "windowSemantics"]) {
    b.definition.dimensions[0].calculationGrain[field] += "-different";
    assert(codes(module).includes("incompatible-grain"));
    b.definition.dimensions[0].calculationGrain[field] = shared[field];
  }
  b.definition.dimensions[0].calculationGrain.dimensions = [{ id: "spend", version: 1, type: "string" }];
  assert(codes(module).includes("incompatible-grain"));
});
check("Shared dimensions use immutable identities and types, independently of ordering", () => {
  const grain = { ...shared, dimensions: [{ id: "spend", version: 1, type: "string" }, { id: "age", version: 2, type: "number" }] };
  assert.equal(sharedGrainKey(grain), sharedGrainKey({ ...grain, dimensions: [...grain.dimensions].reverse() }));
  const changed = copy(grain); changed.dimensions[0].version++;
  assert.notEqual(sharedGrainKey(grain), sharedGrainKey(changed));
  assert.equal(sharedGrainKey({ ...grain, dimensions: [grain.dimensions[0], grain.dimensions[0]] }), null);
  assert.equal(sharedGrainKey({ dimensions: [] }), null);
});
check("Legacy builtin overall grain is identified by fixed key, never its display name", () => {
  const source = builtinSource("coupon-drilldown", true);
  source.dimensionKeys = ["drill_0", "drill_1"];
  source.definition.dimensions[0].name = "Renamed";
  source.definition.dimensions[1].name = "Overall";
  assert.deepEqual(calculationCandidates(store, moduleWith(source))[0].grains.map(grain => grain.kind), ["overall", "single"]);
});
check("A fixed SQL key with mixed numeric and text definitions cannot be calculated", () => {
  const version = sqlVersion();
  version.modes.push({ id: "text-mode", kind: "overall", members: [], fields: [
    { key: "a", alias: "a", name: "A", type: "string", role: "metric" }
  ] });
  const mixed = { id: "mixed", versions: [version] }; store.abilities.push(mixed);
  const source = sqlSource(mixed, version);
  assert.deepEqual(calculationCandidates(store, moduleWith(source)).map(candidate => candidate.ref.key), ["b"]);
});
check("Copy remaps both operands, retains constants and isolates definitions/history", () => {
  const source = builtinSource("coupon-overall", true), module = moduleWith(source);
  module.calculatedMetrics = [calculation(ref(source), ref(source, "coupon_2"))];
  module.versions = [{ configuration: moduleConfiguration(module) }];
  const before = JSON.stringify(module), copied = copyModuleSources(module);
  assert.equal(copied.sourceIdMap.get(source.id), copied.sources[0].id);
  for (const operand of ["left", "right"])
    assert.equal(copied.calculatedMetrics[0].formula[operand].sourceId, copied.sources[0].id);
  assert.deepEqual(calculatedMetricIssues(store, { ...module, ...copied }), []);
  copied.sources[0].definition.metrics[0].name = "Changed";
  copied.calculatedMetrics[0].name = "Changed";
  assert.equal(JSON.stringify(module), before);
  module.calculatedMetrics[0].formula.right = { type: "constant", value: -2 };
  assert.deepEqual(copyModuleSources(module).calculatedMetrics[0].formula.right, { type: "constant", value: -2 });
});
check("Formula edits change hashes while published configurations remain isolated", () => {
  const source = builtinSource("coupon-overall", true), module = moduleWith(source);
  const legacyHash = moduleHash(module); module.calculatedMetrics.push(calculation(ref(source)));
  const baselineHash = moduleHash(module), frozen = moduleConfiguration(module), before = JSON.stringify(frozen);
  assert.notEqual(baselineHash, legacyHash);
  for (const [field, value] of [["name", "Different"], ["format", "percent"], ["precision", 5], ["showInReport", false]]) {
    const old = module.calculatedMetrics[0][field]; module.calculatedMetrics[0][field] = value;
    assert.notEqual(moduleHash(module), baselineHash); module.calculatedMetrics[0][field] = old;
  }
  module.calculatedMetrics[0].formula.right.value = 7; assert.notEqual(moduleHash(module), baselineHash);
  assert.equal(JSON.stringify(frozen), before);
});
check("Migration adds draft defaults only and leaves historical snapshots untouched", () => {
  const module = moduleWith(builtinSource("coupon-overall", true));
  delete module.calculatedMetrics;
  const configuration = moduleConfiguration(module);
  module.versions = [{ signature: moduleHash(module), configuration }];
  module.attempts = [{ status: "success", snapshot: copy(module), configurationKey: hash(configuration) }];
  const state = { modules: [module], abilities: [], analysis: module, analysisModuleSeeded: true, multiModuleSeeded: true,
    reports: [{ snapshot: copy(configuration) }] };
  const histories = JSON.stringify([module.versions, module.attempts, state.reports]);
  initializeModules(state);
  assert.deepEqual(module.calculatedMetrics, []);
  assert.equal(JSON.stringify([module.versions, module.attempts, state.reports]), histories);
  assert.equal(module.versions[0].signature, moduleHash(module));
});

const expected = { sourceId: "source-a", capabilityId: "ability", version: 1, modeId: "overall", kind: "overall", contract: shared };
const record = () => ({
  sourceId: "source-a", rawRows: [{ group_id: "group-1", a: 0, b: -2 }, { group_id: "group-2", a: 5, b: 10 }],
  calculationContext: { schemaVersion: 1, capabilityId: "ability", version: 1, modeId: "overall",
    grain: copy(shared), experimentId: "experiment-1", window: { start: "2026-10-01", end: "2026-10-03" },
    groupKey: "group_id", dimensionKeys: {} }
});
check("Record index verifies provenance and keeps unformatted raw rows unchanged", () => {
  const input = record(), before = JSON.stringify(input), index = indexCalculationRecord(input, expected);
  assert.deepEqual(index.issues, []); assert.equal(index.rows.size, 2);
  assert.strictEqual([...index.rows.values()][0], input.rawRows[0]);
  assert.equal(JSON.stringify(input), before);
  for (const patch of [{ capabilityId: "other" }, { version: 2 }, { modeId: "other" }]) {
    const changed = record(); Object.assign(changed.calculationContext, patch);
    assert.equal(indexCalculationRecord(changed, expected).issues[0].code, "record-identity");
  }
  assert.equal(indexCalculationRecord({ ...input, sourceId: "other" }, expected).issues[0].code, "record-identity");
  assert.equal(indexCalculationRecord({ sourceId: "source-a", rawRows: input.rawRows }, expected).rows.size, 0);
});
check("Join keys isolate experiment, group, observation window and native ID type", () => {
  const original = [...indexCalculationRecord(record(), expected).rows.keys()][0];
  const variants = [record(), record(), record(), record()];
  variants[0].calculationContext.experimentId = "experiment-2";
  variants[1].rawRows[0].group_id = "group-3";
  variants[2].calculationContext.window.end = "2026-10-04";
  variants[3].rawRows[0].group_id = 1;
  for (const variant of variants) assert.notEqual([...indexCalculationRecord(variant, expected).rows.keys()][0], original);
  const a = record(), b = record(); a.rawRows[0].group_id = 1; b.rawRows[0].group_id = "1";
  assert.notEqual([...indexCalculationRecord(a, expected).rows.keys()][0], [...indexCalculationRecord(b, expected).rows.keys()][0]);
});
check("Duplicate keys are removed, not summed or retained by row order", () => {
  const input = record(); input.rawRows.push({ ...input.rawRows[0], a: 99 }, { ...input.rawRows[0], a: 100 });
  const index = indexCalculationRecord(input, expected);
  assert.equal(index.rows.size, 1); assert.equal(index.issues.length, 2);
  assert(index.issues.every(issue => issue.code === "duplicate-key"));
  assert.equal([...index.rows.values()][0].group_id, "group-2");
});
check("Structured dimension values need explicit aliases and cannot mix with overall", () => {
  const input = record(), grain = { ...shared, dimensions: [{ id: "spend-definition", version: 2, type: "string" }] };
  input.calculationContext.grain = grain; input.calculationContext.dimensionKeys = { "spend-definition": "tier" };
  input.rawRows = [{ group_id: "g", tier: "high", a: 1 }, { group_id: "g", tier: "low", a: 2 }, { group_id: "g", tier: null, a: 3 }];
  const descriptor = { ...expected, kind: "single", contract: grain };
  assert.equal(indexCalculationRecord(input, descriptor).rows.size, 3);
  assert.equal(indexCalculationRecord(input, expected).rows.size, 0);
  input.calculationContext.dimensionKeys = {}; assert.equal(indexCalculationRecord(input, descriptor).rows.size, 0);
  input.calculationContext.dimensionKeys = { "spend-definition": "tier" }; input.rawRows[0].tier = 4;
  assert.equal(indexCalculationRecord(input, descriptor).issues[0].code, "row-identity");
});
check("Names, missing identities and invalid windows are never used as join fallbacks", () => {
  for (const patch of [{ groupKey: "group_name" }, { experimentId: "" },
    { window: { start: "2026-02-30", end: "2026-03-01" } }, { window: { start: "2026-10-03", end: "2026-10-01" } }]) {
    const input = record(); Object.assign(input.calculationContext, patch);
    assert.equal(indexCalculationRecord(input, expected).rows.size, 0);
  }
  const input = record(); input.rawRows = [{ group_name: "Control", a: 1 }];
  assert.equal(indexCalculationRecord(input, expected).issues[0].code, "row-identity");
});
check("Runtime declarations cannot upgrade unshared frozen grains to cross-source joins", () => {
  const a = record(), b = record(); b.sourceId = "source-b";
  const left = { ...expected, contract: null }, right = { ...left, sourceId: "source-b" };
  assert.deepEqual(commonGrains([left], [right]), []);
  assert.equal(commonGrains([left], [left]).length, 1);
  assert.notEqual([...indexCalculationRecord(a, left).rows.keys()][0], [...indexCalculationRecord(b, right).rows.keys()][0]);
});
console.log(`\n${checks} calculation contract checks passed.`);
