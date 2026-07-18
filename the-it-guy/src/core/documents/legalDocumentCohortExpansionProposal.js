function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))]
}

export function assessLegalDocumentCohortExpansionProposal({ o2 = {}, record = null, pilot = {}, candidates = [], storeAvailable = true } = {}) {
  const blockers = []
  const add = (code, kind, solution, detail = null) => blockers.push({ code, kind, detail, solution })
  const currentIds = ids(record?.releaseTarget?.organisationIds).sort()
  const configuredIds = ids(pilot.organisationIds).sort()
  const maximum = Number(pilot.limits?.maxOrganisations)
  if (o2.status !== 'READY_FOR_O3' || o2.ready !== true) add('O3_O2_NOT_READY', 'upstream', 'Complete and accept the O2 controlled-cohort soak before proposing expansion.')
  if (!record || record.status !== 'continued') add('O3_CONTINUATION_RECORD_MISSING', 'upstream', 'Restore the exact O1 continuation record used by the accepted soak.')
  if (o2.status === 'READY_FOR_O3' && record?.status === 'continued') {
    if (!storeAvailable) add('O3_CANDIDATE_STORE_UNAVAILABLE', 'stop', 'Keep the current cohort unchanged until expansion-candidate readiness can be read safely.')
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',')) add('O3_CURRENT_COHORT_DRIFT', 'stop', 'Restore the O1/configured cohort match before proposing any expansion.')
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5) add('O3_EXPANSION_LIMIT_INVALID', 'stop', 'Set maxOrganisations to an explicit value between one and five.')
  }
  const readyCandidates = (Array.isArray(candidates) ? candidates : []).filter((row) => row.status === 'READY' && !currentIds.includes(normalize(row.organisationId)))
  const selected = readyCandidates[0] || null
  if (o2.status === 'READY_FOR_O3' && record?.status === 'continued' && storeAvailable) {
    if (currentIds.length >= maximum) add('O3_MAXIMUM_COHORT_REACHED', 'terminal', 'Keep the cohort at its configured maximum; a larger rollout requires a new policy decision.')
    else if (!selected) add('O3_NO_READY_EXPANSION_CANDIDATE', 'wait', 'Prepare one additional active agency with an agent, OTP and mandate templates, and a preferred transfer attorney.')
  }
  const proposedIds = selected ? [...currentIds, selected.organisationId].sort() : currentIds
  if (selected && proposedIds.length > maximum) add('O3_PROPOSED_COHORT_EXCEEDS_LIMIT', 'stop', 'Remove the candidate or increase the limit through a separate reviewed policy change.')
  const stop = blockers.some((row) => row.kind === 'stop')
  const upstream = blockers.some((row) => row.kind === 'upstream')
  const terminal = blockers.some((row) => row.kind === 'terminal')
  const ready = blockers.length === 0 && Boolean(selected)
  return {
    ready,
    status: ready ? 'READY_FOR_P1' : stop ? 'EXPANSION_BLOCKED' : upstream ? 'NO_GO' : terminal ? 'ROLLOUT_LIMIT_REACHED' : 'EXPANSION_WAITING',
    blockers,
    proposal: selected ? {
      currentOrganisationIds: currentIds,
      addedOrganisationId: selected.organisationId,
      addedOrganisationName: selected.organisationName || null,
      proposedOrganisationIds: proposedIds,
      maximumOrganisations: maximum,
      trancheSize: 1,
      requiresFreshAuthority: true,
      requiredNextPhases: ['A2 cohort approval', 'L1 consolidated certification', 'M1 release authority', 'M2 receipt', 'M3 claim'],
    } : null,
  }
}
