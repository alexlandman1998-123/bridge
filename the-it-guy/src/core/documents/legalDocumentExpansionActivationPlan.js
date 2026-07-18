import { canonicalLegalDocumentReleaseValue } from './legalDocumentReleaseReceipt.js'

const EXPANSION_ACTIVATION_PLAN_CONTRACT = 'legal-document-expansion-activation-plan-q1-v1'

function normalize(value) {
  return String(value || '').trim()
}

function ids(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalize).filter(Boolean))].sort()
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

export function buildLegalDocumentExpansionActivationPlan({ certification = {}, plannedBy, planningReference, plannedAt = new Date().toISOString(), evidenceAgeLimitMinutes = 15 } = {}) {
  const certifiedAt = timestamp(certification.certifiedAt)
  return canonicalLegalDocumentReleaseValue({
    contract: EXPANSION_ACTIVATION_PLAN_CONTRACT,
    status: 'planned',
    plannedAt: new Date(plannedAt).toISOString(),
    expiresAt: new Date((certifiedAt ?? Date.parse(plannedAt)) + Number(evidenceAgeLimitMinutes) * 60_000).toISOString(),
    plannedBy: normalize(plannedBy),
    planningReference: normalize(planningReference),
    sourceCertification: certification,
    sourceCertificationDigest: normalize(certification.certificationDigest),
    sourcePendingDigest: normalize(certification.sourcePendingDigest),
    activationTarget: {
      environment: normalize(certification.releaseTarget?.environment).toLowerCase(),
      projectRef: normalize(certification.releaseTarget?.projectRef),
      organisationIds: ids(certification.proposedOrganisationIds),
    },
    currentOrganisationIds: ids(certification.currentOrganisationIds),
    addedOrganisationId: normalize(certification.addedOrganisationId),
    proposedOrganisationIds: ids(certification.proposedOrganisationIds),
    requiredNextPhases: ['Q2 guarded expanded-cohort activation', 'Q3 activation verification', 'fresh M1 release authority', 'fresh M2 receipt', 'fresh M3 claim'],
  })
}

export function assessLegalDocumentExpansionActivationPlan({ plan = null, currentP3 = {}, pending = null, configuredOrganisationIds = [], now = Date.now(), digest } = {}) {
  const blockers = []
  const push = (code, solution) => blockers.push({ code, solution })
  if (!plan || plan.status !== 'planned') push('Q1_ACTIVATION_PLAN_MISSING', 'Run the guarded Q1 planner against a fresh READY_FOR_FRESH_AUTHORITY P3 certificate.')
  if (currentP3.status !== 'READY_FOR_FRESH_AUTHORITY' || currentP3.ready !== true || !currentP3.certification) push('Q1_P3_NOT_READY', 'Resolve P3 and rebuild the activation plan from fresh expanded-cohort certification.')
  if (plan) {
    if (plan.contract !== EXPANSION_ACTIVATION_PLAN_CONTRACT) push('Q1_PLAN_CONTRACT_INVALID', 'Recreate the activation plan using the current Q1 contract.')
    if (!normalize(plan.plannedBy) || !normalize(plan.planningReference)) push('Q1_PLAN_ACCOUNTABILITY_MISSING', 'Record the accountable planner and activation/change reference.')
    const source = plan.sourceCertification || {}
    if (!normalize(source.certificationDigest) || plan.sourceCertificationDigest !== source.certificationDigest) push('Q1_CERTIFICATION_BINDING_INVALID', 'Bind the plan to the exact P3 certification digest.')
    if (typeof digest === 'function' && source.certificationDigest) {
      const { certificationDigest, ...certificatePayload } = source
      if (source.certificationDigest !== digest(canonicalLegalDocumentReleaseValue(certificatePayload))) push('Q1_SOURCE_CERTIFICATION_DIGEST_INVALID', 'Restore the exact P3 certificate; do not hand-edit certification evidence.')
    }
    if (!normalize(pending?.pendingDigest) || plan.sourcePendingDigest !== pending.pendingDigest || source.sourcePendingDigest !== pending.pendingDigest) push('Q1_PENDING_CHANGESET_BINDING_INVALID', 'Plan activation only for the exact current P2 pending change set.')
    const currentIds = ids(plan.currentOrganisationIds)
    const proposedIds = ids(plan.proposedOrganisationIds)
    const configuredIds = ids(configuredOrganisationIds)
    const added = normalize(plan.addedOrganisationId)
    if (!currentIds.length || currentIds.join(',') !== configuredIds.join(',')) push('Q1_EFFECTIVE_ALLOWLIST_CHANGED', 'Restore the effective allowlist to the current cohort; Q1 must not activate the expansion.')
    if (!added || currentIds.includes(added) || proposedIds.length !== currentIds.length + 1 || !proposedIds.includes(added) || currentIds.some((id) => !proposedIds.includes(id))) push('Q1_ACTIVATION_TRANCHE_INVALID', 'Plan exactly the one-organisation tranche certified by P3.')
    if (proposedIds.join(',') !== ids(source.proposedOrganisationIds).join(',') || proposedIds.join(',') !== ids(pending?.proposedOrganisationIds).join(',') || added !== normalize(source.addedOrganisationId) || added !== normalize(pending?.addedOrganisationId)) push('Q1_CERTIFIED_TARGET_MISMATCH', 'Make the Q1 target identical to the P2/P3 current, added, and proposed cohorts.')
    const target = plan.activationTarget || {}
    if (ids(target.organisationIds).join(',') !== proposedIds.join(',') || normalize(target.environment).toLowerCase() !== normalize(source.releaseTarget?.environment).toLowerCase() || normalize(target.projectRef) !== normalize(source.releaseTarget?.projectRef)) push('Q1_ACTIVATION_TARGET_INVALID', 'Use the certified environment, project, and proposed organisation cohort as the exact activation target.')
    const currentCertificate = currentP3.certification || {}
    if (currentP3.ready === true && (currentCertificate.sourcePendingDigest !== plan.sourcePendingDigest || ids(currentCertificate.proposedOrganisationIds).join(',') !== proposedIds.join(','))) push('Q1_CURRENT_CERTIFICATION_DRIFT', 'Discard the stale plan and rebuild it from the current P3 certification target.')
    const plannedAt = timestamp(plan.plannedAt)
    const certifiedAt = timestamp(source.certifiedAt)
    const expiresAt = timestamp(plan.expiresAt)
    if (plannedAt === null || certifiedAt === null || expiresAt === null || plannedAt < certifiedAt || expiresAt <= plannedAt || now >= expiresAt || plannedAt > now + 60_000) push('Q1_PLAN_EXPIRED_OR_MISORDERED', 'Re-run P3 and create a new Q1 plan inside its certification evidence window.')
    if (typeof digest === 'function') {
      const { planDigest, ...payload } = plan
      if (!normalize(planDigest) || planDigest !== digest(canonicalLegalDocumentReleaseValue(payload))) push('Q1_PLAN_DIGEST_INVALID', 'Restore the committed activation plan or recreate it from fresh P3 evidence; do not hand-edit it.')
    }
  }
  return { ready: blockers.length === 0, blockers }
}

export { EXPANSION_ACTIVATION_PLAN_CONTRACT as LEGAL_DOCUMENT_Q1_ACTIVATION_PLAN_CONTRACT }
