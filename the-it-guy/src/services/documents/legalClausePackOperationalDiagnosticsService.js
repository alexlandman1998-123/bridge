import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { resolveLegalClausePackSignatureRelease } from '../../core/documents/legalClausePackSignatureRelease.js'

export const LEGAL_CLAUSE_PACK_OPERATIONAL_DIAGNOSTICS_VERSION = 'sa_legal_clause_pack_operational_diagnostics_v1'

const RELEASED_PACKET_STATUSES = new Set(['sent', 'partially_signed', 'completed'])
const CRITICAL_STATES = new Set([
  'released_without_valid_approval',
  'invalid_approval_role',
  'generated_with_readiness_blockers',
  'canonical_version_evidence_invalid',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function isMissingSchemaError(error) {
  const code = normalizeKey(error?.code)
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return ['42p01', '42703', 'pgrst204', 'pgrst205'].includes(code) || message.includes('does not exist')
}

function latestUsableVersion(versions = []) {
  return [...asArray(versions)]
    .sort((left, right) => Number(right?.version_number || 0) - Number(left?.version_number || 0))
    .find((version) => ['generated', 'draft', ''].includes(normalizeKey(version?.render_status))) || null
}

function resolveCanonicalVersionEvidence(packet, version, templateVersionById = new Map()) {
  const summary = asRecord(version?.validation_summary_json || version?.validationSummaryJson)
  const provenance = asRecord(summary.render_provenance || summary.renderProvenance)
  const templateVersionId = normalizeText(provenance.templateVersionId || provenance.template_version_id)
  if (!templateVersionId) {
    return { canonical: false, valid: null, templateVersionId: null, contentHash: null, issues: [] }
  }
  const registryVersion = templateVersionById.get(templateVersionId) || null
  const contentHash = normalizeText(provenance.templateContentHash || provenance.template_content_hash)
  const templateId = normalizeText(provenance.templateId || provenance.template_id || packet?.template_id || packet?.templateId)
  const issues = []
  if (!registryVersion) issues.push('The generated OTP references a canonical template version that is not in the version registry.')
  if (registryVersion && templateId && normalizeText(registryVersion.template_id || registryVersion.templateId) !== templateId) {
    issues.push('The generated OTP version belongs to a different canonical template.')
  }
  if (registryVersion && normalizeText(packet?.organisation_id || packet?.organisationId) &&
    normalizeText(registryVersion.organisation_id || registryVersion.organisationId) !== normalizeText(packet?.organisation_id || packet?.organisationId)) {
    issues.push('The generated OTP version belongs to a different organisation.')
  }
  if (registryVersion && !['published', 'superseded'].includes(normalizeKey(registryVersion.status))) {
    issues.push('The generated OTP references a canonical version that was never released.')
  }
  if (!contentHash) issues.push('The generated OTP did not retain the canonical template content hash.')
  if (registryVersion && contentHash && normalizeText(registryVersion.content_hash || registryVersion.contentHash) !== contentHash) {
    issues.push('The generated OTP content hash does not match its canonical template version.')
  }
  return {
    canonical: true,
    valid: issues.length === 0,
    templateVersionId,
    contentHash: contentHash || null,
    registryStatus: normalizeKey(registryVersion?.status) || null,
    issues,
  }
}

function resolveOperationalState(packet, version, release, canonicalEvidence) {
  const packetStatus = normalizeKey(packet?.status)
  if (!version?.id) return 'missing_generated_version'
  if (canonicalEvidence.canonical && !canonicalEvidence.valid) return 'canonical_version_evidence_invalid'
  if (!release.governed) return 'legacy_not_governed'
  if (release.readiness?.canGenerate !== true) return 'generated_with_readiness_blockers'
  if (RELEASED_PACKET_STATUSES.has(packetStatus) && !release.approved) return 'released_without_valid_approval'
  if (release.invalidApprovalRole) return 'invalid_approval_role'
  if (release.staleApproval) return 'stale_approval'
  if (!release.approved && release.requiresLegalSpecialist) return 'awaiting_attorney_approval'
  if (!release.approved) return 'awaiting_operational_approval'
  if (packetStatus === 'signing_prep' || normalizeKey(packet?.source_context_json?.lifecycle_state) === 'locked') return 'approved_ready_to_send'
  if (RELEASED_PACKET_STATUSES.has(packetStatus)) return 'released_with_valid_approval'
  return 'approved_pending_lock'
}

function stateAction(state) {
  const actions = {
    missing_generated_version: 'Generate the OTP again and inspect the failed generation event.',
    canonical_version_evidence_invalid: 'Stop signature progression and verify the immutable canonical template-version evidence.',
    legacy_not_governed: 'No Phase 8 action. Migrate only if this OTP is still active and unsigned.',
    generated_with_readiness_blockers: 'Regenerate after resolving the transaction-readiness blockers.',
    released_without_valid_approval: 'Stop signature progression and escalate this packet for legal review immediately.',
    invalid_approval_role: 'Replace the invalid decision with approval from an authorised reviewer.',
    stale_approval: 'Review and approve the current generated version.',
    awaiting_attorney_approval: 'Assign the packet to an attorney and clear the listed specialist items.',
    awaiting_operational_approval: 'Review and approve the generated OTP version.',
    approved_ready_to_send: 'Signature release is ready.',
    released_with_valid_approval: 'No action required.',
    approved_pending_lock: 'Lock the approved version before creating signing links.',
  }
  return actions[state] || 'Review the packet lifecycle and approval evidence.'
}

function stateSeverity(state) {
  if (CRITICAL_STATES.has(state) || state === 'missing_generated_version') return 'critical'
  if (['stale_approval', 'awaiting_attorney_approval', 'awaiting_operational_approval'].includes(state)) return 'warning'
  if (state === 'legacy_not_governed') return 'info'
  return 'healthy'
}

export function buildLegalClausePackOperationalDiagnostics({
  packets = [],
  versions = [],
  templateVersions = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const versionsByPacketId = asArray(versions).reduce((groups, version) => {
    const packetId = normalizeText(version?.packet_id || version?.packetId)
    if (!packetId) return groups
    if (!groups[packetId]) groups[packetId] = []
    groups[packetId].push(version)
    return groups
  }, {})
  const templateVersionById = new Map(asArray(templateVersions)
    .filter((version) => normalizeText(version?.id))
    .map((version) => [normalizeText(version.id), version]))

  const records = asArray(packets)
    .filter((packet) => normalizeKey(packet?.packet_type || packet?.packetType) === 'otp')
    .map((packet) => {
      const version = latestUsableVersion(versionsByPacketId[normalizeText(packet?.id)] || packet?.versions)
      const release = resolveLegalClausePackSignatureRelease({ packet, version })
      const canonicalEvidence = resolveCanonicalVersionEvidence(packet, version, templateVersionById)
      const governed = release.governed || canonicalEvidence.canonical
      const state = resolveOperationalState(packet, version, { ...release, governed }, canonicalEvidence)
      return {
        packetId: normalizeText(packet?.id),
        transactionId: normalizeText(packet?.transaction_id || packet?.transactionId) || null,
        title: normalizeText(packet?.title) || 'Untitled OTP',
        packetStatus: normalizeKey(packet?.status) || 'unknown',
        versionId: normalizeText(version?.id) || null,
        versionNumber: Number(version?.version_number || 0) || null,
        governed,
        canonical: canonicalEvidence.canonical,
        canonicalTemplateVersionId: canonicalEvidence.templateVersionId,
        canonicalVersionEvidenceValid: canonicalEvidence.valid,
        canonicalVersionEvidenceIssues: canonicalEvidence.issues,
        operationalState: state,
        severity: stateSeverity(state),
        action: stateAction(state),
        requiresLegalSpecialist: release.requiresLegalSpecialist,
        attorneyReviewCodes: release.attorneyReviewCodes,
        approved: release.approved,
        staleApproval: release.staleApproval,
        invalidApprovalRole: release.invalidApprovalRole,
        approvedByRole: normalizeKey(release.approval?.reviewedByRole || release.approval?.reviewed_by_role) || null,
        approvedAt: normalizeText(release.approval?.reviewedAt || release.approval?.reviewed_at) || null,
        updatedAt: normalizeText(packet?.updated_at || packet?.updatedAt) || null,
      }
    })

  const governedRecords = records.filter((record) => record.governed)
  const byState = records.reduce((summary, record) => {
    summary[record.operationalState] = Number(summary[record.operationalState] || 0) + 1
    return summary
  }, {})
  const criticalRecords = governedRecords.filter((record) => record.severity === 'critical')
  const warningRecords = governedRecords.filter((record) => record.severity === 'warning')
  const approvedRecords = governedRecords.filter((record) => record.approved)
  const releasedRecords = governedRecords.filter((record) => record.operationalState === 'released_with_valid_approval')
  const canonicalRecords = governedRecords.filter((record) => record.canonical)
  const invalidCanonicalRecords = canonicalRecords.filter((record) => record.canonicalVersionEvidenceValid !== true)
  const attorneyQueue = governedRecords.filter((record) => record.operationalState === 'awaiting_attorney_approval')
  const approvalQueue = governedRecords.filter((record) => ['awaiting_operational_approval', 'stale_approval', 'invalid_approval_role'].includes(record.operationalState))
  const score = governedRecords.length
    ? Math.max(0, Math.round(((governedRecords.length - criticalRecords.length - warningRecords.length * 0.5) / governedRecords.length) * 100))
    : 100
  const gate = criticalRecords.length
    ? { status: 'fail', reason: `${criticalRecords.length} governed OTP packet${criticalRecords.length === 1 ? '' : 's'} have unsafe release evidence.` }
    : warningRecords.length
      ? { status: 'warning', reason: `${warningRecords.length} governed OTP packet${warningRecords.length === 1 ? '' : 's'} require review before release.` }
      : { status: 'pass', reason: 'No unsafe or outstanding governed OTP release states were found.' }

  return {
    schemaVersion: LEGAL_CLAUSE_PACK_OPERATIONAL_DIAGNOSTICS_VERSION,
    generatedAt,
    summary: {
      totalOtpPackets: records.length,
      governedPackets: governedRecords.length,
      legacyPackets: records.length - governedRecords.length,
      approvedPackets: approvedRecords.length,
      releasedPackets: releasedRecords.length,
      canonicalPackets: canonicalRecords.length,
      canonicalVersionEvidenceValid: canonicalRecords.length - invalidCanonicalRecords.length,
      canonicalVersionEvidenceInvalid: invalidCanonicalRecords.length,
      awaitingAttorney: attorneyQueue.length,
      awaitingApproval: approvalQueue.length,
      warningPackets: warningRecords.length,
      criticalPackets: criticalRecords.length,
      score,
      byState,
    },
    gate,
    actionQueues: {
      critical: criticalRecords,
      attorneyReview: attorneyQueue,
      approval: approvalQueue,
      readyToSend: governedRecords.filter((record) => record.operationalState === 'approved_ready_to_send'),
    },
    records,
  }
}

export async function getLegalClausePackOperationalDiagnosticsSnapshot({
  client = supabase,
  organisationId = '',
  limit = 100,
} = {}) {
  if (!isSupabaseConfigured || !client) throw new Error('Supabase is not configured for legal OTP diagnostics.')
  const resolvedOrganisationId = normalizeText(organisationId)
  if (!resolvedOrganisationId) throw new Error('organisationId is required for legal OTP diagnostics.')
  const resolvedLimit = Math.min(250, Math.max(1, Number(limit) || 100))
  const queryWarnings = []
  const packetResult = await client
    .from('document_packets')
    .select('id, organisation_id, packet_type, template_id, title, status, transaction_id, current_version_number, source_context_json, created_at, updated_at', { count: 'exact' })
    .eq('organisation_id', resolvedOrganisationId)
    .eq('packet_type', 'otp')
    .order('updated_at', { ascending: false })
    .limit(resolvedLimit)
  if (packetResult.error) {
    if (isMissingSchemaError(packetResult.error)) {
      queryWarnings.push({ source: 'document_packets', message: packetResult.error.message })
      return { ...buildLegalClausePackOperationalDiagnostics(), queryWarnings, organisationId: resolvedOrganisationId }
    }
    throw packetResult.error
  }
  const packets = packetResult.data || []
  if (Number(packetResult.count || 0) > packets.length) {
    queryWarnings.push({
      source: 'document_packets',
      message: `The audit inspected the newest ${packets.length} of ${packetResult.count} OTP packets. Increase the limit or use the platform diagnostics export for a complete result.`,
    })
  }
  const packetIds = packets.map((packet) => packet.id).filter(Boolean)
  let versions = []
  if (packetIds.length) {
    const versionResult = await client
      .from('document_packet_versions')
      .select('id, packet_id, version_number, render_status, validation_summary_json, created_at, updated_at')
      .in('packet_id', packetIds)
      .order('version_number', { ascending: false })
    if (versionResult.error) {
      if (isMissingSchemaError(versionResult.error)) {
        queryWarnings.push({ source: 'document_packet_versions', message: versionResult.error.message })
      } else {
        throw versionResult.error
      }
    } else {
      versions = versionResult.data || []
    }
  }
  const canonicalTemplateVersionIds = [...new Set(versions.flatMap((version) => {
    const summary = asRecord(version?.validation_summary_json)
    const provenance = asRecord(summary.render_provenance || summary.renderProvenance)
    const id = normalizeText(provenance.templateVersionId || provenance.template_version_id)
    return id ? [id] : []
  }))]
  let templateVersions = []
  if (canonicalTemplateVersionIds.length) {
    const templateVersionResult = await client
      .from('document_packet_template_versions')
      .select('id, template_id, organisation_id, status, content_hash, version_tag, published_at')
      .in('id', canonicalTemplateVersionIds)
    if (templateVersionResult.error) {
      if (isMissingSchemaError(templateVersionResult.error)) {
        queryWarnings.push({ source: 'document_packet_template_versions', message: templateVersionResult.error.message })
      } else {
        throw templateVersionResult.error
      }
    } else {
      templateVersions = templateVersionResult.data || []
    }
  }
  return {
    ...buildLegalClausePackOperationalDiagnostics({ packets, versions, templateVersions }),
    queryWarnings,
    organisationId: resolvedOrganisationId,
  }
}

export function renderLegalClausePackOperationalDiagnosticsMarkdown(report = {}) {
  const summary = report.summary || {}
  const lines = [
    '# Governed OTP Signature Release Report',
    '',
    `Generated: ${report.generatedAt || 'Not recorded'}`,
    `Gate: ${report.gate?.status || 'unknown'} — ${report.gate?.reason || 'No reason recorded.'}`,
    '',
    `- Governed OTP packets: ${Number(summary.governedPackets || 0)}`,
    `- Approved: ${Number(summary.approvedPackets || 0)}`,
    `- Awaiting attorney: ${Number(summary.awaitingAttorney || 0)}`,
    `- Awaiting approval: ${Number(summary.awaitingApproval || 0)}`,
    `- Critical: ${Number(summary.criticalPackets || 0)}`,
    '',
    '| State | OTP | Version | Reviewer | Action |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const record of asArray(report.records)) {
    lines.push(`| ${record.operationalState} | ${record.title || record.packetId} | ${record.versionNumber || '-'} | ${record.approvedByRole || '-'} | ${record.action} |`)
  }
  lines.push('')
  return lines.join('\n')
}
