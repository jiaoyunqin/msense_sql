// Older local fixtures omitted the candidate ID and refer to the primary mapping.
export const selectedCandidateId = (input, definition) =>
  input.qxExperimentId ?? definition?.qxExperimentId ?? `${input.id}-QX-01`;

export function experimentPairKey(input, definition) {
  const candidateId = selectedCandidateId(input, definition);
  return candidateId ? JSON.stringify([input.id, candidateId]) : null;
}

export function findExperimentResult(results, entry, snapshot) {
  const key = experimentPairKey(entry.input, entry.definition);
  if (!key) return undefined;
  const matches = results.filter(result => {
    if (result.id !== entry.input.id) return false;
    if (result.analysisKey) return result.analysisKey === key
      && experimentPairKey(result) === key;
    if (result.qxExperimentId !== undefined) return experimentPairKey(result) === key;
    // An old ID-only result can be read only when its snapshot has one such ID.
    return snapshot ? !repeatedLibraId(snapshot, result.id) : experimentPairKey(result) === key;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export const repeatedLibraId = (snapshot, id) =>
  snapshot.experiments.filter(entry => entry.input.id === id).length > 1;

const identityToken = value => btoa(Array.from(new TextEncoder().encode(value),
  byte => String.fromCharCode(byte)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

// Retain existing anchors for reports that contain each Libra ID only once.
export function reportExperimentKey(snapshot, entry) {
  return repeatedLibraId(snapshot, entry.input.id)
    ? `pair-${identityToken(experimentPairKey(entry.input, entry.definition))}` : entry.input.id;
}

export function reportExperimentLabel(snapshot, entry) {
  return repeatedLibraId(snapshot, entry.input.id)
    ? `${entry.input.id} · 钱效 ID ${selectedCandidateId(entry.input, entry.definition)}` : entry.input.id;
}

export const experimentLabel = experiment => experiment.label || experiment.id;
