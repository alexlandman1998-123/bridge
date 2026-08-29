import { canonicalizeBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'

export const BOND_APPLICATION_ORIGINATOR_PACK_VERSION = 'phase-5-v1'

function text(value) {
  return String(value || '').trim()
}

function issue(code, message, path = null) {
  return { category: 'originator_pack', code, message, path }
}

export function resolveBondApplicationOriginatorBrand({ originator = {}, transaction = {}, workspace = {} } = {}) {
  const name = text(
    originator.name || originator.companyName || originator.company_name || originator.organisationName || originator.organisation_name ||
    transaction.bond_originator_company || transaction.assigned_bond_originator_company || transaction.bond_originator ||
    workspace.name,
  )
  const logoUrl = text(
    originator.logoUrl || originator.logo_url || originator.organisationLogoUrl || originator.organisation_logo_url ||
    transaction.bond_originator_logo_url || transaction.assigned_bond_originator_logo_url ||
    transaction.bond_originator_company_logo_url || workspace.logoUrl || workspace.logo_url ||
    workspace.branding?.logoUrl || workspace.branding?.logo_url,
  )
  return { name, logoUrl, branded: Boolean(name && logoUrl) }
}

export function buildBondApplicationOriginatorPackManifest({
  applicationState = {},
  snapshot = {},
  brand = {},
  generatedAt = new Date().toISOString(),
  mode = 'draft',
} = {}) {
  const blockers = []
  const completenessIssues = applicationState?.participantEntityCompleteness?.blockingIssues || []
  if (!text(brand.name)) blockers.push(issue('originator_name_required', 'Assign the bond originator before producing an originator-ready pack.', 'brand.name'))
  if (!text(brand.logoUrl)) blockers.push(issue('originator_logo_required', 'Upload the originator logo before producing an originator-ready pack.', 'brand.logoUrl'))
  completenessIssues.forEach((item) => blockers.push(issue(item.code, item.message, item.path)))
  if (!text(snapshot?.transaction?.id || applicationState?.application?.transactionId)) {
    blockers.push(issue('transaction_identity_required', 'The application pack must be tied to a transaction.', 'snapshot.transaction.id'))
  }
  if (!Array.isArray(snapshot?.participants) || snapshot.participants.length === 0) {
    blockers.push(issue('participant_snapshot_required', 'The application pack must contain participant snapshots.', 'snapshot.participants'))
  }
  const requestedReady = mode === 'originator_ready'
  const payload = {
    version: BOND_APPLICATION_ORIGINATOR_PACK_VERSION,
    mode: requestedReady ? 'originator_ready' : 'draft',
    generatedAt,
    transactionId: snapshot?.transaction?.id || applicationState?.application?.transactionId || null,
    applicationSchemaVersion: snapshot?.versions?.applicationSchemaVersion || applicationState?.schemaVersion || null,
    originator: { name: text(brand.name) || null, logoUrl: text(brand.logoUrl) || null },
    participantCount: Array.isArray(snapshot?.participants) ? snapshot.participants.length : 0,
    purchaserEntityType: applicationState?.application?.buyerEntity?.entityType || 'individual',
    snapshotCreatedAt: snapshot?.createdAt || null,
  }
  return {
    ...payload,
    ready: blockers.length === 0,
    status: blockers.length === 0 ? 'ready' : requestedReady ? 'blocked' : 'draft_with_blockers',
    blockers,
    fingerprint: `${BOND_APPLICATION_ORIGINATOR_PACK_VERSION}:${canonicalizeBondApplicationSnapshot(payload)}`,
  }
}
