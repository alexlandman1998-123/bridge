import { canonicalizeBondApplicationSnapshot } from '../../application/submission/bondApplicationSnapshotHash.js'
import {
  BOND_APPLICATION_EXPORT_PACKAGE_STATUSES,
  prepareBondOriginatorIntakePackage,
} from '../packages/bondApplicationExportPackages.js'

export const CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION = 'phase-6-v1'

const ACTIVE_PACKAGE_STATUSES = new Set([
  BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
  BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
  BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
])

function text(value) {
  return String(value || '').trim()
}

function blocker(code, message, path = null) {
  return { category: 'controlled_originator_handoff', code, severity: 'blocker', message, path }
}

export function buildControlledBondOriginatorHandoffIdentity({
  packManifest = {},
  submission = {},
  originatorRecipient = {},
  normalizedApplication = null,
} = {}) {
  const snapshotHash = text(submission.snapshot_hash || submission.snapshotHash)
  const recipientId = text(originatorRecipient.id || originatorRecipient.profileId || originatorRecipient.userId)
  const identity = {
    version: CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION,
    transactionId: submission.transaction_id || submission.transactionId || packManifest.transactionId || null,
    bondApplicationId: normalizedApplication?.id || submission.bond_application_id || submission.bondApplicationId || null,
    applicationRevision: Number(normalizedApplication?.revision || submission.application_revision || submission.applicationRevision || 1),
    submissionId: submission.id || null,
    snapshotHash: snapshotHash || null,
    packFingerprint: text(packManifest.fingerprint) || null,
    recipientId: recipientId || null,
  }
  return {
    ...identity,
    idempotencyKey: `${CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION}:${canonicalizeBondApplicationSnapshot(identity)}`,
  }
}

export async function prepareControlledBondOriginatorHandoff({
  applicationState = {},
  packManifest = {},
  submission = {},
  normalizedApplication = null,
  originatorRecipient = {},
  supplementalDocuments = [],
  packageDocuments = [],
  requestedBy = null,
  existingPackage = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const issues = []
  if (packManifest.ready !== true || packManifest.status !== 'ready') {
    issues.push(blocker('originator_pack_not_ready', 'Only a Phase 5 originator-ready application pack may be handed off.', 'packManifest.status'))
  }
  if (!text(packManifest.fingerprint)) issues.push(blocker('pack_fingerprint_required', 'The application pack fingerprint is required.', 'packManifest.fingerprint'))
  if (!text(originatorRecipient.id || originatorRecipient.profileId || originatorRecipient.userId)) {
    issues.push(blocker('originator_recipient_id_required', 'Select the exact originator recipient before handoff.', 'originatorRecipient.id'))
  }
  if (!text(originatorRecipient.name || originatorRecipient.displayName || originatorRecipient.organisationName)) {
    issues.push(blocker('originator_recipient_name_required', 'The originator recipient name is required.', 'originatorRecipient.name'))
  }
  const snapshotHash = text(submission.snapshot_hash || submission.snapshotHash)
  if (!snapshotHash) issues.push(blocker('submitted_snapshot_hash_required', 'A finalized snapshot hash is required for handoff.', 'submission.snapshot_hash'))
  const completenessIssues = applicationState?.participantEntityCompleteness?.blockingIssues || []
  completenessIssues.forEach((item) => issues.push(blocker(item.code, item.message, item.path)))

  const identity = buildControlledBondOriginatorHandoffIdentity({ packManifest, submission, originatorRecipient, normalizedApplication })
  const existingSourceHash = text(existingPackage?.sourceSnapshotHash)
  if (existingPackage && ACTIVE_PACKAGE_STATUSES.has(existingPackage.status) && existingPackage.idempotencyKey !== identity.idempotencyKey) {
    issues.push(blocker(
      existingSourceHash && existingSourceHash !== snapshotHash ? 'stale_active_handoff_requires_supersession' : 'different_active_handoff_requires_supersession',
      'An active handoff package already exists. Supersede it explicitly before preparing another package.',
      'existingPackage.idempotencyKey',
    ))
  }
  if (issues.length) return { ok: false, issues, identity, package: null, idempotent: false }

  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    normalizedApplication,
    originatorRecipient,
    supplementalDocuments,
    packageDocuments,
    requestedBy,
    idempotencyKey: identity.idempotencyKey,
    existingPackage,
    generatedAt,
  })
  const combinedIssues = [...issues, ...(prepared.package?.validationIssues || [])]
  return {
    ...prepared,
    issues: combinedIssues,
    identity,
    package: prepared.package ? {
      ...prepared.package,
      controlledHandoff: {
        version: CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION,
        packFingerprint: identity.packFingerprint,
        applicationRevision: identity.applicationRevision,
        automaticBankSubmission: false,
        networkDeliveryPerformed: false,
      },
    } : null,
  }
}

export function recordControlledBondOriginatorHandoffReceipt({
  exportPackage = {},
  packManifest = {},
  acceptedBy = null,
  acceptedAt = new Date().toISOString(),
  existingReceipt = null,
} = {}) {
  const receiptIdentity = {
    version: CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION,
    exportPackageId: exportPackage.id || null,
    idempotencyKey: exportPackage.idempotencyKey || null,
    sourceSnapshotHash: exportPackage.sourceSnapshotHash || null,
    packFingerprint: packManifest.fingerprint || null,
    recipientId: exportPackage.originatorRecipient?.id || null,
  }
  const receiptKey = `${CONTROLLED_BOND_ORIGINATOR_HANDOFF_VERSION}:receipt:${canonicalizeBondApplicationSnapshot(receiptIdentity)}`
  if (existingReceipt?.receiptKey === receiptKey) return { ok: true, receipt: existingReceipt, idempotent: true }
  const issues = []
  if (!ACTIVE_PACKAGE_STATUSES.has(exportPackage.status)) issues.push(blocker('handoff_package_not_active', 'The handoff package is not ready for receipt acceptance.'))
  if (!text(exportPackage.idempotencyKey)) issues.push(blocker('handoff_idempotency_key_required', 'The controlled handoff idempotency key is missing.'))
  if (exportPackage.controlledHandoff?.packFingerprint !== packManifest.fingerprint) issues.push(blocker('pack_fingerprint_mismatch', 'The accepted pack does not match the prepared handoff.'))
  if (issues.length) return { ok: false, issues, receipt: null, idempotent: false }
  return {
    ok: true,
    idempotent: false,
    issues: [],
    receipt: {
      ...receiptIdentity,
      receiptKey,
      status: 'accepted_for_manual_originator_handoff',
      acceptedBy,
      acceptedAt,
      automaticBankSubmission: false,
      networkDeliveryPerformed: false,
      sensitivePayloadIncluded: false,
    },
  }
}
