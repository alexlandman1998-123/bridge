// Canonical rules retain control of requirement levels and permissions. Adapter
// explanations are additive and must not disappear when signatures coincide.
export function mergeRequirementCandidates(candidates, signatureFor) {
  const merged = new Map()
  for (const candidate of candidates) {
    const signature = signatureFor(candidate.generated)
    const previous = merged.get(signature)
    if (!previous) { merged.set(signature, candidate); continue }
    const winner = candidate.source === 'canonical_rule' ? candidate : previous
    const trace = [...new Map([...(previous.trace || []), ...(candidate.trace || [])].map(item => [JSON.stringify(item), item])).values()]
    merged.set(signature, { ...winner, trace })
  }
  return [...merged.values()]
}
