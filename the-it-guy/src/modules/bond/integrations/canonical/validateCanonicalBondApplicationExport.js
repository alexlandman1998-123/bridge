import {
  buildCanonicalBondApplicationExport,
  getSnapshotFromSubmission,
  hashCanonicalBondApplicationExport,
} from './canonicalBondApplicationExport.js'
import { hashBondApplicationSnapshot } from '../../application/submission/bondApplicationSnapshotHash.js'

export const BOND_APPLICATION_EXPORT_VALIDATION_SEVERITIES = {
  blocker: 'blocker',
  warning: 'warning',
  info: 'info',
}

function issue(code, message, severity = BOND_APPLICATION_EXPORT_VALIDATION_SEVERITIES.blocker, path = '') {
  return { code, message, severity, path }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function hasSensitiveExportContent(value) {
  const text = JSON.stringify(value || {})
  return /(signingToken|signing_token|portalToken|portal_token|inviteToken|invite_token|signedUrl|signed_url|publicUrl|public_url|storagePath|storage_path|internalNote|internal_note)/i.test(text)
}

export function validateCanonicalBondApplicationExport(canonicalExport = {}) {
  const issues = []
  if (canonicalExport.canonicalSchemaVersion !== 'phase-8-canonical-v1') {
    issues.push(issue('canonical_schema_version_invalid', 'The canonical export schema version is missing or unsupported.', 'blocker', 'canonicalSchemaVersion'))
  }
  if (!normalizeText(canonicalExport.source?.submissionId)) {
    issues.push(issue('source_submission_missing', 'The canonical export must reference one immutable submitted application version.', 'blocker', 'source.submissionId'))
  }
  if (!normalizeText(canonicalExport.source?.snapshotHash)) {
    issues.push(issue('snapshot_hash_missing', 'The canonical export must preserve the source snapshot hash.', 'blocker', 'source.snapshotHash'))
  }
  if (!Array.isArray(canonicalExport.participants) || canonicalExport.participants.length === 0) {
    issues.push(issue('participants_missing', 'At least one participant is required in the canonical export.', 'blocker', 'participants'))
  }
  for (const [index, participant] of (canonicalExport.participants || []).entries()) {
    if (!normalizeText(participant.role)) {
      issues.push(issue('participant_role_missing', 'Every participant requires a stable participant role.', 'blocker', `participants.${index}.role`))
    }
    if (!normalizeText(participant.participantKey)) {
      issues.push(issue('participant_key_missing', 'Every participant requires a stable participant key.', 'blocker', `participants.${index}.participantKey`))
    }
    if (!isPlainObject(participant.answers)) {
      issues.push(issue('participant_answers_invalid', 'Participant answers must be represented as structured canonical JSON.', 'blocker', `participants.${index}.answers`))
    }
  }
  if (hasSensitiveExportContent(canonicalExport)) {
    issues.push(issue('sensitive_reference_present', 'The canonical export contains a token, public URL, storage path or internal note.', 'blocker'))
  }
  return {
    valid: !issues.some((item) => item.severity === BOND_APPLICATION_EXPORT_VALIDATION_SEVERITIES.blocker),
    issues,
  }
}

export async function validateBondApplicationExportEligibility({
  submission = {},
  normalizedApplication = null,
  destinationAdapter = null,
  expectedSnapshotHash = null,
} = {}) {
  const issues = []
  const status = normalizeText(submission.status).toLowerCase()
  if (status !== 'submitted') {
    issues.push(issue('submission_not_submitted', 'Only finalized submitted application versions may be exported.', 'blocker', 'submission.status'))
  }
  if (submission.superseded_at || submission.supersededAt || submission.superseded_by_submission_id || submission.supersededBySubmissionId) {
    issues.push(issue('submission_superseded', 'Superseded application versions cannot be used as the active export source.', 'blocker'))
  }
  const snapshot = getSnapshotFromSubmission(submission)
  if (!isPlainObject(snapshot)) {
    issues.push(issue('snapshot_missing', 'The submitted application snapshot is missing.', 'blocker', 'submission.snapshot_json'))
  }
  const recordedHash = normalizeText(submission.snapshot_hash || submission.snapshotHash)
  if (snapshot && recordedHash) {
    const calculatedHash = await hashBondApplicationSnapshot(snapshot)
    if (calculatedHash !== recordedHash) {
      issues.push(issue('snapshot_hash_mismatch', 'The stored snapshot hash does not match the immutable snapshot content.', 'blocker', 'submission.snapshot_hash'))
    }
  }
  if (expectedSnapshotHash && recordedHash && expectedSnapshotHash !== recordedHash) {
    issues.push(issue('expected_snapshot_hash_mismatch', 'The export request was made against a stale snapshot hash.', 'blocker'))
  }
  if (normalizedApplication?.activeSubmissionId && submission.id && normalizedApplication.activeSubmissionId !== submission.id) {
    issues.push(issue('inactive_submission', 'The requested submission is not the normalized application active submission.', 'blocker'))
  }
  if (normalizedApplication?.revisionStatus && !['none', 'revision_submitted'].includes(normalizeText(normalizedApplication.revisionStatus))) {
    issues.push(issue('active_revision_present', 'An active material revision blocks external export until a new submission is finalized.', 'blocker'))
  }
  if (destinationAdapter) {
    if (destinationAdapter.enabled !== true) {
      issues.push(issue('destination_adapter_disabled', `The ${destinationAdapter.destinationKey || 'destination'} adapter is disabled.`, 'blocker'))
    }
    if (destinationAdapter.officialSpecificationAvailable !== true) {
      issues.push(issue('official_destination_specification_missing', 'No approved destination specification is available for this adapter.', 'blocker'))
    }
  }
  const canonical = snapshot ? buildCanonicalBondApplicationExport({ submission, normalizedApplication }) : null
  if (canonical) {
    const canonicalValidation = validateCanonicalBondApplicationExport(canonical)
    issues.push(...canonicalValidation.issues)
  }
  return {
    eligible: !issues.some((item) => item.severity === BOND_APPLICATION_EXPORT_VALIDATION_SEVERITIES.blocker),
    issues,
  }
}

export async function buildCanonicalExportValidationResult(input = {}) {
  const canonicalExport = buildCanonicalBondApplicationExport(input)
  const validation = validateCanonicalBondApplicationExport(canonicalExport)
  return {
    canonicalExport,
    canonicalHash: await hashCanonicalBondApplicationExport(canonicalExport),
    validation,
  }
}

