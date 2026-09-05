import {
  BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES,
  buildBondOriginatorOneOriginatorPilotReport,
} from '../modules/bond/integrations/packages/bondApplicationExportPackages.js'
import { requireClient } from './attorneyFirmServiceShared.js'

export const DOCUMENT_TRUST_PHASE5_BOND_PILOT_FLAG = 'VITE_DOCUMENT_TRUST_PHASE5_BOND_PILOT_ENABLED'
export const DOCUMENT_TRUST_PHASE5_BOND_PILOT_VERSION = 'document-trust-phase5-bond-pilot-v1'

function text(value = '') {
  return String(value || '').trim()
}

function enabled(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(text(value).toLowerCase())
}

export function isDocumentTrustPhase5BondPilotEnabled(value = import.meta.env?.[DOCUMENT_TRUST_PHASE5_BOND_PILOT_FLAG]) {
  return enabled(value)
}

function canonicalHandoffCheck(links = []) {
  const normalized = Array.isArray(links) ? links : []
  const invalid = normalized.filter((link) => !text(link?.documentId || link?.document_id) || !text(
    link?.canonicalRequirementInstanceId || link?.canonical_requirement_instance_id,
  ))
  return {
    key: 'canonical_document_handoff_complete',
    label: 'Every pilot handoff document has an exact canonical requirement link',
    status: normalized.length > 0 && invalid.length === 0 ? 'passed' : 'blocked',
    evidence: {
      documentCount: normalized.length,
      invalidLinkCount: invalid.length,
    },
    message: normalized.length === 0
      ? 'Add at least one explicitly canonically linked handoff document before starting the pilot.'
      : invalid.length
        ? 'Resolve every unlinked handoff document before starting the pilot.'
        : 'All handoff documents are explicitly linked to canonical requirements.',
  }
}

function buyerReadFenceCheck(phase4Enabled) {
  return {
    key: 'buyer_canonical_read_fence_enabled',
    label: 'Buyer document room uses the canonical read fence',
    status: phase4Enabled ? 'passed' : 'blocked',
    evidence: { phase4Enabled },
    message: phase4Enabled
      ? 'Buyer document reads are fenced to the canonical projection.'
      : 'Enable and verify the Phase 4 buyer canonical read fence before starting the bond pilot.',
  }
}

export function buildDocumentTrustBondPilotPreflight({
  readinessReport = null,
  originatorRecipient = {},
  packages = [],
  pilotControls = {},
  canonicalDocumentLinks = [],
  phase4Enabled = false,
  generatedBy = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const existing = buildBondOriginatorOneOriginatorPilotReport({
    readinessReport,
    originatorRecipient,
    packages,
    pilotControls,
    generatedBy,
    generatedAt,
  })
  const additionalChecks = [
    canonicalHandoffCheck(canonicalDocumentLinks),
    buyerReadFenceCheck(phase4Enabled),
  ]
  const checklist = [...(existing.checklist || []), ...additionalChecks]
  const issues = checklist.filter((check) => check.status !== 'passed')
  const status = issues.length
    ? BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.blocked
    : BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready

  return {
    ...existing,
    documentTrustPilotVersion: DOCUMENT_TRUST_PHASE5_BOND_PILOT_VERSION,
    status,
    checklist,
    issues,
    summary: {
      ...existing.summary,
      totalChecks: checklist.length,
      passed: checklist.filter((check) => check.status === 'passed').length,
      blocked: issues.length,
    },
    nextActions: issues.length
      ? issues.map((issue) => issue.message)
      : ['Start the one-originator pilot with manual package handling and daily monitoring.'],
    workflowBoundary: {
      ...existing.rolloutBoundary,
      canonicalDocumentLinksRequired: true,
      buyerCanonicalReadFenceRequired: true,
    },
  }
}

export async function startDocumentTrustBondPilot({
  preflight = null,
  readinessReportId = '',
  originatorProfileId = null,
  originatorName = '',
  originatorEmailReference = '',
  supportOwner = '',
  rollbackOwner = '',
  idempotencyKey = '',
  client: providedClient = null,
} = {}) {
  if (!isDocumentTrustPhase5BondPilotEnabled()) {
    throw new Error('The document-trust bond pilot is disabled.')
  }
  if (preflight?.documentTrustPilotVersion !== DOCUMENT_TRUST_PHASE5_BOND_PILOT_VERSION ||
      preflight?.status !== BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready) {
    throw new Error('A ready document-trust bond pilot preflight is required.')
  }
  if (!text(readinessReportId) || !text(idempotencyKey)) {
    throw new Error('Readiness report and idempotency key are required to start the bond pilot.')
  }
  const packageIds = Array.isArray(preflight?.scope?.packageIds) ? preflight.scope.packageIds.filter(Boolean) : []
  if (!packageIds.length) throw new Error('At least one ready originator package is required.')

  const client = providedClient || requireClient()
  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  const actorId = userResult?.user?.id
  if (!actorId) throw new Error('An authenticated internal user is required to start the bond pilot.')

  const result = await client.rpc('bridge_start_bond_originator_one_originator_pilot', {
    p_pilot_originator_profile_id: originatorProfileId || null,
    p_readiness_report_id: readinessReportId,
    p_export_package_ids: packageIds,
    p_started_by: actorId,
    p_pilot_originator_name: text(originatorName) || null,
    p_pilot_originator_email_reference: text(originatorEmailReference) || null,
    p_support_owner: text(supportOwner) || null,
    p_rollback_owner: text(rollbackOwner) || null,
    p_idempotency_key: text(idempotencyKey),
  })
  if (result.error) throw result.error
  return {
    pilotId: result.data || null,
    pilotVersion: DOCUMENT_TRUST_PHASE5_BOND_PILOT_VERSION,
    bankWorkflowUnchanged: true,
    liveDeliveryEnabled: false,
    automaticBankSubmission: false,
  }
}

export async function pauseDocumentTrustBondPilot({ pilotId = '', reason = '', client: providedClient = null } = {}) {
  if (!text(pilotId)) throw new Error('Pilot ID is required.')
  const client = providedClient || requireClient()
  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  const actorId = userResult?.user?.id
  if (!actorId) throw new Error('An authenticated internal user is required to pause the bond pilot.')
  const result = await client.rpc('bridge_pause_bond_originator_one_originator_pilot', {
    p_pilot_id: pilotId,
    p_paused_by: actorId,
    p_pause_reason: text(reason) || null,
  })
  if (result.error) throw result.error
  return result.data || null
}
