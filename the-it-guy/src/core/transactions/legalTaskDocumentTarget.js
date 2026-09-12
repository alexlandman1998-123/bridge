// Only infer a target when it is unambiguous. Never choose an arbitrary existing
// attachment when an attorney is trying to supply outstanding evidence.
export function resolveLegalTaskUploadRequirement(documents = [], explicitRequirement = null) {
  if (explicitRequirement) return explicitRequirement
  const candidates = documents.filter(Boolean).map(row => ({
    row, requirement: row.requirement || row.requiredDocument || null,
  })).filter(item => item.requirement)
  const pending = candidates.filter(({ row }) => row.missing === true || row.ready === false)
  if (pending.length === 1) return pending[0].requirement
  if (pending.length > 1) return null
  return candidates.length === 1 ? candidates[0].requirement : null
}
