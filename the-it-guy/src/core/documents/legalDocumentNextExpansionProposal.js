function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))]
}

export function assessLegalDocumentNextExpansionProposal({ t2 = {}, record = null, activation = null, pilot = {}, candidates = [], storeAvailable = true } = {}) {
  const blockers = []
  const add = (code, kind, solution, detail = null) => blockers.push({ code, kind, detail, solution })
  const currentIds = ids(record?.releaseTarget?.organisationIds).sort()
  const configuredIds = ids(pilot.organisationIds).sort()
  const activatedIds = ids(activation?.activatedOrganisationIds).sort()
  const maximum = Number(pilot.limits?.maxOrganisations)
  if (t2.status !== 'READY_FOR_T3' || t2.ready !== true) add('T3_T2_NOT_READY', 'upstream', 'Complete and accept the T2 expanded-cohort soak before proposing another expansion.')
  if (!record || record.status !== 'continued') add('T3_CONTINUATION_RECORD_MISSING', 'upstream', 'Restore the exact T1 continuation record used by the accepted soak.')
  if (!activation || activation.status !== 'activated') add('T3_ACTIVATION_RECORD_MISSING', 'upstream', 'Restore the exact current Q2 activation record.')
  if (t2.status === 'READY_FOR_T3' && record?.status === 'continued' && activation?.status === 'activated') {
    if (!storeAvailable) add('T3_CANDIDATE_STORE_UNAVAILABLE', 'stop', 'Keep the current expanded cohort unchanged until candidate readiness can be read safely.')
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',') || currentIds.join(',') !== activatedIds.join(',')) add('T3_CURRENT_COHORT_DRIFT', 'stop', 'Restore the T1/configured/Q2-activated cohort match before proposing another expansion.')
    if (!record.sourceActivationDigest || record.sourceActivationDigest !== activation.activationDigest) add('T3_ACTIVATION_BINDING_INVALID', 'stop', 'Restore the Q2 activation digest bound by the accepted T1/T2 evidence.')
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5) add('T3_EXPANSION_LIMIT_INVALID', 'stop', 'Set maxOrganisations to an explicit value between one and five.')
  }
  const readyCandidates = (Array.isArray(candidates) ? candidates : []).filter((row) => row.status === 'READY' && !(row.blockers || []).length && !currentIds.includes(normalize(row.organisationId)))
  const selected = readyCandidates[0] || null
  if (t2.status === 'READY_FOR_T3' && record?.status === 'continued' && activation?.status === 'activated' && storeAvailable) {
    if (currentIds.length >= maximum) add('T3_MAXIMUM_COHORT_REACHED', 'terminal', 'Keep the cohort at its configured maximum; a larger rollout requires a new policy decision.')
    else if (!selected) add('T3_NO_READY_EXPANSION_CANDIDATE', 'wait', 'Prepare one additional active agency with an agent, OTP and mandate templates, and a preferred transfer attorney.')
  }
  const proposedIds = selected ? [...currentIds, selected.organisationId].sort() : currentIds
  if (selected && proposedIds.length > maximum) add('T3_PROPOSED_COHORT_EXCEEDS_LIMIT', 'stop', 'Remove the candidate or increase the limit through a separately reviewed policy change.')
  const stop = blockers.some((row) => row.kind === 'stop')
  const upstream = blockers.some((row) => row.kind === 'upstream')
  const terminal = blockers.some((row) => row.kind === 'terminal')
  const ready = blockers.length === 0 && Boolean(selected)
  return {
    ready,
    status: ready ? 'READY_FOR_T4' : stop ? 'EXPANSION_BLOCKED' : upstream ? 'NO_GO' : terminal ? 'ROLLOUT_LIMIT_REACHED' : 'EXPANSION_WAITING',
    blockers,
    proposal: selected ? {
      sourceContinuationDigest: record.recordDigest || null,
      sourceActivationDigest: activation.activationDigest || null,
      currentOrganisationIds: currentIds,
      addedOrganisationId: selected.organisationId,
      addedOrganisationName: selected.organisationName || null,
      proposedOrganisationIds: proposedIds,
      maximumOrganisations: maximum,
      trancheSize: 1,
      requiresFreshAuthority: true,
      requiredNextPhases: ['T4 proposal integrity handoff', 'U1 accountable expansion approval', 'fresh certification', 'guarded activation', 'fresh release authority'],
    } : null,
  }
}
