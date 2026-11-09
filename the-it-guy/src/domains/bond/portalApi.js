// bond owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket } from '../../lib/api/shared/storage.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { isDocumentUploaded as isBondPackDocumentUploaded } from '../../modules/bond/application/documents/bondApplicationDocumentStatus.js'
import { sealBondReviewedVersion } from '../../modules/bond/application/submission/bondApplicationReviewedVersion.js'
import { assertBondApplicationSigningAvailable } from '../../modules/bond/application/submission/bondApplicationSigningAvailability.js'
import { isBondCorrectionResubmission } from '../../modules/bond/application/submission/bondApplicationCorrection.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { BOND_APPLICATION_SUBMISSION_FLOW_VERSION, BOND_APPLICATION_SUBMISSION_STATUSES, BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION, BOND_APPLICATION_NORMALIZED_STORAGE_MODE, BOND_APPLICATION_PARTICIPANT_ROLES, BOND_APPLICATION_PARTICIPANT_STATUSES, BOND_APPLICATION_STATUSES, buildApplicationStateFromNormalizedApplication, buildBondApplicationDeclarationEvidence, buildBondApplicationDocumentChecklist, buildJointBondApplicationSubmissionSnapshot, buildJointSignerManifest, buildNormalizedBondApplicationFromState, buildBondApplicationSubmissionSnapshot, calculateBondApplicationReviewContextHash, canonicalizeBondApplicationSnapshot, createSuretyParticipant, hashLegacyBondApplicationSource, hashBondApplicationSnapshot, loadNormalizedBondApplicationState, markBondApplicationParticipantReady, projectNormalizedBondApplicationToLegacy, resolveBondApplicationDeclarations, resolveBondApplicationDocumentRequirements, resolveBondApplicationSignerIdentity, resolveBondApplicationSignerIdentities, saveNormalizedBondApplicationSection, toLegacyBondApplication, validateBondApplicationSubmissionReadiness } from '../../modules/bond/application/index.js'
import { buildBondApplicationState } from '../../modules/bond/application/legacy/bondApplicationLegacyAdapter.js'
import { requireScopedClient } from '../transactions/contactSupport.js'
import { requireClientPortalTokenClient, persistNormalizedCompatibilityProjection } from '../clientPortal/appointmentRead.js'
import { generateClientPortalToken } from '../clientPortal/tokenHelpers.js'
import { resolveClientPortalLinkByToken } from '../clientPortal/originatorFinanceRead.js'
import { mapNormalizedBondApplicationRows, fetchNormalizedBondApplicationBundle } from './financeRead.js'

export function requireBondApplicationPortalTokenClient(token) {
  return requireScopedClient({
    'x-bridge-bond-application-token': String(token || '').trim(),
  })
}

function generateBondApplicationSigningToken() {
  const bytes = new Uint8Array(32)
  if (typeof crypto?.getRandomValues !== 'function') {
    return `bondsign${crypto.randomUUID?.().replaceAll('-', '') || Date.now().toString(36)}`
  }
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashBondApplicationParticipantToken(token) {
  const value = String(token || '').trim()
  if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const encoded = new TextEncoder().encode(value)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return hashBondApplicationSnapshot(value)
}

function buildBondApplicationSubmissionHtml(snapshot = {}, snapshotHash = '') {
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  const rows = [
    ['Submission version', snapshot.submissionVersion],
    ['Snapshot hash', snapshotHash],
    ['Property', snapshot.property?.developmentName || snapshot.property?.propertyReference || snapshot.property?.unitReference],
    ['Purchase price', snapshot.finance?.purchasePrice],
    ['Deposit', snapshot.finance?.depositAmount],
    ['Bond required', snapshot.finance?.requestedBondAmount],
    ['Applicant', [snapshot.applicant?.personal?.first_name, snapshot.applicant?.personal?.surname].filter(Boolean).join(' ')],
    ['Email', snapshot.applicant?.contact?.email],
    ['Income type', snapshot.employmentAndIncome?.employment?.occupation_status],
    ['Selected banks', (snapshot.selectedBanks || []).join(', ')],
  ]
  const declarations = (snapshot.declarations || []).map((item) => `
    <section>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>
      <p><strong>Accepted:</strong> ${item.accepted ? 'Yes' : 'No'} ${item.acceptedAt ? `at ${escapeHtml(item.acceptedAt)}` : ''}</p>
    </section>
  `).join('')
  const participants = (snapshot.participants || []).map((participant) => {
    const answers = participant.answers || {}
    const personal = answers.personal || answers.personal_contact?.personal || {}
    const employment = answers.employment || answers.employment_income?.employment || {}
    const roleLabel = participant.role === 'co_applicant' || participant.participantRole === 'co_applicant'
      ? 'Co-applicant'
      : 'Primary applicant'
    return `<tr><td>${escapeHtml(roleLabel)}</td><td>${escapeHtml([personal.first_name, personal.surname].filter(Boolean).join(' ') || 'Recorded')}<br/>${escapeHtml(employment.occupation_status || '')}</td></tr>`
  }).join('')
  const documents = (snapshot.documentManifest || []).map((item) => `
    <li>${escapeHtml(item.requirementKey)}: ${escapeHtml(item.status || 'recorded')}</li>
  `).join('')
  const signatureAreas = (snapshot.signerManifest || [{ participantRole: 'primary_applicant', fullName: '' }]).map((signer) => `
    <div class="signature">${escapeHtml(signer.participantRole === 'co_applicant' ? 'Co-applicant' : 'Primary applicant')} signature - ${escapeHtml(signer.fullName || '')}</div>
  `).join('')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bond application submission</title>
    <style>
      body { font-family: Arial, sans-serif; color: #142132; margin: 36px; line-height: 1.45; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #dbe5ef; padding-bottom: 6px; }
      h3 { font-size: 15px; margin-bottom: 4px; }
      table { border-collapse: collapse; width: 100%; margin-top: 16px; }
      td { border: 1px solid #dbe5ef; padding: 8px; vertical-align: top; }
      td:first-child { width: 34%; font-weight: 700; background: #f8fbff; }
      .signature { margin-top: 48px; border-top: 1px solid #142132; padding-top: 10px; }
    </style>
  </head>
  <body>
    <h1>Bond application submission</h1>
    <p>This document was generated from the immutable application snapshot prepared for signing.</p>
    <table>
      <tbody>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value || 'Not provided')}</td></tr>`).join('')}</tbody>
    </table>
    ${participants ? `<h2>Participants</h2><table><tbody>${participants}</tbody></table>` : ''}
    <h2>Declarations</h2>
    ${declarations}
    <h2>Document manifest</h2>
    <ul>${documents}</ul>
    ${signatureAreas}
  </body>
</html>`
}

export async function fetchBondApplicationPortalSubmissionContext(client, token) {
  const link = await resolveClientPortalLinkByToken(client, token)
  const [buyerResult, transactionResult, onboardingResult, requiredDocumentsResult, documentsResult, developmentResult] = await Promise.all([
    link.buyer_id
      ? client.from('buyers').select('id, name, email').eq('id', link.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from('transactions')
      .select('id, development_id, unit_id, buyer_id, organisation_id, assigned_organisation_id, bond_workspace_id, reference, transaction_reference, updated_at')
      .eq('id', link.transaction_id)
      .maybeSingle(),
    client
      .from('onboarding_form_data')
      .select('id, transaction_id, purchaser_type, form_data, created_at, updated_at')
      .eq('transaction_id', link.transaction_id)
      .maybeSingle(),
    client
      .from('transaction_required_documents')
      .select('*')
      .eq('transaction_id', link.transaction_id),
    client
      .from('documents')
      .select('*')
      .eq('transaction_id', link.transaction_id),
    link.development_id
      ? client.from('developments').select('id, organisation_id, name').eq('id', link.development_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  for (const result of [buyerResult, transactionResult, onboardingResult, requiredDocumentsResult, documentsResult, developmentResult]) {
    if (result.error && !isMissingSchemaError(result.error) && !isPermissionDeniedError(result.error)) throw result.error
  }
  const transaction = transactionResult.data || { id: link.transaction_id, development_id: link.development_id, unit_id: link.unit_id, buyer_id: link.buyer_id }
  const onboardingFormData = onboardingResult.data || { id: null, transaction_id: link.transaction_id, form_data: {} }
  const portal = {
    buyer: buyerResult.data || null,
    transaction,
    development: developmentResult.data || null,
    unit: { id: link.unit_id, development: developmentResult.data || null },
    onboardingFormData: {
      id: onboardingFormData.id || null,
      formData: onboardingFormData.form_data || {},
      updatedAt: onboardingFormData.updated_at || null,
    },
  }
  return {
    link,
    buyer: buyerResult.data || null,
    transaction,
    development: developmentResult.data || null,
    onboardingFormData,
    applicationState: buildBondApplicationState(portal),
    requiredDocuments: requiredDocumentsResult.data || [],
    documents: documentsResult.data || [],
  }
}

async function fetchLatestClientPortalBondApplicationSubmissionRow(client, transactionId) {
  const query = await client
    .from('transaction_bond_application_submissions')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('submission_version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_bond_application_submissions') || isMissingSchemaError(query.error) || isPermissionDeniedError(query.error)) return null
    throw query.error
  }
  return query.data || null
}

async function insertNormalizedBondApplicationBundle(client, normalizedApplication) {
  const appInsert = await client
    .from('bond_applications')
    .insert({
      transaction_id: normalizedApplication.transactionId,
      onboarding_form_data_id: normalizedApplication.onboardingFormDataId || null,
      schema_version: normalizedApplication.schemaVersion || BOND_APPLICATION_NORMALIZED_SCHEMA_VERSION,
      flow_version: normalizedApplication.flowVersion || 'phase-6-v1',
      storage_mode: BOND_APPLICATION_NORMALIZED_STORAGE_MODE,
      status: normalizedApplication.status || BOND_APPLICATION_STATUSES.draft,
      revision: normalizedApplication.revision || 1,
      source_legacy_hash: normalizedApplication.sourceLegacyHash || null,
      source_legacy_updated_at: normalizedApplication.sourceLegacyUpdatedAt || null,
      metadata: normalizedApplication.metadata || {},
    })
    .select('*')
    .single()
  if (appInsert.error) {
    if (appInsert.error.code === '23505') return fetchNormalizedBondApplicationBundle(client, normalizedApplication.transactionId)
    throw appInsert.error
  }
  const applicationId = appInsert.data.id
  const participantRows = []
  for (const participant of normalizedApplication.participants || []) {
    const insert = await client
      .from('bond_application_participants')
      .insert({
        bond_application_id: applicationId,
        participant_key: participant.participantKey,
        role: participant.role,
        ordinal: participant.ordinal || 1,
        status: participant.status,
        invitation_status: participant.invitationStatus || null,
        person_id: normalizeNullableUuid(participant.personId),
        contact_id: normalizeNullableUuid(participant.contactId),
        metadata: {
          ...(participant.metadata || {}),
          displayName: participant.displayName || '',
          email: participant.email || '',
          phone: participant.phone || '',
        },
      })
      .select('*')
      .single()
    if (insert.error && insert.error.code !== '23505') throw insert.error
    if (insert.data) participantRows.push(insert.data)
  }
  const participantByKey = new Map(participantRows.map((row) => [row.participant_key, row]))
  const sectionRows = []
  for (const [sectionKey, answers] of Object.entries(normalizedApplication.sharedSections || {})) {
    const insert = await client
      .from('bond_application_sections')
      .insert({
        bond_application_id: applicationId,
        scope: 'application',
        section_key: sectionKey,
        answers_json: answers || {},
        status: 'in_progress',
      })
      .select('*')
      .single()
    if (insert.error && insert.error.code !== '23505') throw insert.error
    if (insert.data) sectionRows.push(insert.data)
  }
  for (const [participantKey, sections] of Object.entries(normalizedApplication.participantSections || {})) {
    const participant = participantByKey.get(participantKey)
    if (!participant?.id) continue
    for (const [sectionKey, answers] of Object.entries(sections || {})) {
      const insert = await client
        .from('bond_application_sections')
        .insert({
          bond_application_id: applicationId,
          participant_id: participant.id,
          scope: 'participant',
          section_key: sectionKey,
          answers_json: answers || {},
          status: 'in_progress',
        })
        .select('*')
        .single()
      if (insert.error && insert.error.code !== '23505') throw insert.error
      if (insert.data) sectionRows.push(insert.data)
    }
  }
  return mapNormalizedBondApplicationRows(appInsert.data, participantRows, sectionRows, [])
}

export async function ensureClientPortalNormalizedBondApplication({
  token,
  includeCoApplicant = false,
  expectedLegacyHash = '',
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const context = await fetchBondApplicationPortalSubmissionContext(client, token)
  const existing = await fetchNormalizedBondApplicationBundle(client, context.transaction.id)
  if (existing?.id) return { normalizedApplication: existing, created: false }
  const legacy = context.onboardingFormData?.form_data?.bond_application || {}
  const legacyHash = await hashLegacyBondApplicationSource(legacy)
  if (expectedLegacyHash && expectedLegacyHash !== legacyHash) {
    const error = new Error('The bond application changed before normalization. Refresh and try again.')
    error.code = 'STALE_LEGACY_BOND_APPLICATION'
    throw error
  }
  const normalized = buildNormalizedBondApplicationFromState({
    applicationState: context.applicationState,
    transactionId: context.transaction.id,
    onboardingFormDataId: context.onboardingFormData?.id || null,
    includeCoApplicant,
    legacyHash,
    legacyUpdatedAt: context.onboardingFormData?.updated_at || null,
  })
  const inserted = await insertNormalizedBondApplicationBundle(client, normalized)
  await persistNormalizedCompatibilityProjection(client, inserted, context.onboardingFormData?.form_data || {})
  return { normalizedApplication: inserted, created: true }
}

export async function fetchClientPortalNormalizedBondApplication({ token } = {}) {
  const client = requireClientPortalTokenClient(token)
  let context = null
  try {
    context = await fetchBondApplicationPortalSubmissionContext(client, token)
  } catch (error) {
    const inviteContext = await resolveBondApplicationParticipantInviteContext(client, token)
    if (!inviteContext?.normalizedApplication) throw error
    return {
      normalizedApplication: inviteContext.normalizedApplication,
      participantContext: loadNormalizedBondApplicationState({
        normalizedApplication: inviteContext.normalizedApplication,
        viewerParticipantKey: inviteContext.participant.participantKey,
        viewerRole: inviteContext.participant.role,
      }),
      invitation: inviteContext.invite,
    }
  }
  const normalizedApplication = await fetchNormalizedBondApplicationBundle(client, context.transaction.id)
  if (!normalizedApplication?.id) return { normalizedApplication: null }
  return {
    normalizedApplication,
    participantContext: loadNormalizedBondApplicationState({
      normalizedApplication,
      viewerRole: BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
    }),
  }
}

export async function fetchBondApplicationPortalProjection({ accessToken } = {}) {
  const token = String(accessToken || '').trim()
  if (!token) throw new Error('Bond application access token is required.')
  const client = requireBondApplicationPortalTokenClient(token)
  const result = await client.rpc('bridge_bond_application_portal_projection')
  if (result.error) throw result.error
  return result.data || null
}

export async function fetchBondApplicationPortalDraft({ accessToken } = {}) {
  const client = requireBondApplicationPortalTokenClient(accessToken)
  const result = await client.rpc('bridge_bond_application_portal_draft')
  if (result.error) throw result.error
  return result.data || null
}

export async function saveBondApplicationPortalDraft({ accessToken, draft, expectedRevision } = {}) {
  const client = requireBondApplicationPortalTokenClient(accessToken)
  const result = await client.rpc('bridge_save_bond_application_portal_draft', {
    p_draft: draft || {},
    p_expected_revision: expectedRevision,
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function fetchBondApplicationBuyerNotices({ accessToken, token } = {}) {
  const client = accessToken ? requireBondApplicationPortalTokenClient(accessToken) : requireClientPortalTokenClient(token)
  const result = await client.rpc('bridge_bond_handoff_buyer_notices')
  if (result.error) throw result.error
  return result.data || { corrections: [], documents: [] }
}

export async function fetchBondApplicationPortalDocumentContinuity({ accessToken } = {}) {
  const client = requireBondApplicationPortalTokenClient(accessToken)
  const result = await client.rpc('bridge_bond_application_portal_document_continuity')
  if (result.error) throw result.error
  return result.data || { version: 'bond_application_portal_phase6', summary: {}, requirements: [] }
}

export async function fetchBondApplicationOriginatorActionCentre() {
  const client = requireClient()
  const result = await client.rpc('bridge_bond_application_portal_originator_action_centre_view')
  if (result.error) throw result.error
  return result.data || { version: 'bond_application_portal_phase4', items: [] }
}

export async function issueBondApplicationPortalAccessLinkForOriginator({ exportPackageId, expiresAt } = {}) {
  const packageId = String(exportPackageId || '').trim()
  if (!packageId) throw new Error('An originator intake package is required.')
  const client = requireClient()
  const result = await client.rpc('bridge_issue_bond_application_portal_access_link_for_originator', {
    p_export_package_id: packageId,
    p_expires_at: expiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function revokeBondApplicationPortalAccessLinkForOriginator({ accessLinkId } = {}) {
  const linkId = String(accessLinkId || '').trim()
  if (!linkId) throw new Error('An application access link is required.')
  const client = requireClient()
  const result = await client.rpc('bridge_revoke_bond_originator_portal_link', {
    p_access_link_id: linkId,
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function createBondOriginatorWorkspaceDocumentRequest({
  exportPackageId,
  title,
  buyerInstruction,
  canonicalDocumentType,
  dueAt = null,
  priority = 'normal',
} = {}) {
  const packageId = String(exportPackageId || '').trim()
  if (!packageId || !String(title || '').trim() || !String(buyerInstruction || '').trim()) {
    throw new Error('A package, document title, and buyer instruction are required.')
  }
  const client = requireClient()
  const result = await client.rpc('bridge_create_bond_originator_workspace_document_request', {
    p_export_package_id: packageId,
    p_request_type: 'supplemental_document',
    p_target_scope: 'application_documents',
    p_title: String(title).trim(),
    p_buyer_instruction: String(buyerInstruction).trim(),
    p_canonical_document_type: String(canonicalDocumentType || '').trim() || null,
    p_due_at: dueAt || null,
    p_request_priority: priority === 'urgent' ? 'urgent' : 'normal',
  })
  if (result.error) throw result.error
  return result.data || null
}

export async function fetchBondApplicationPortalDeliveryActionCentre() {
  const client = requireClient()
  const result = await client.rpc('bridge_bond_application_portal_delivery_action_centre_view')
  if (result.error) throw result.error
  return result.data || { version: 'bond_application_portal_phase5', items: [] }
}

export async function fetchBondApplicationPortalOriginatorDocumentContinuity() {
  const client = requireClient()
  const result = await client.rpc('bridge_bond_originator_document_continuity')
  if (result.error) throw result.error
  return result.data || { version: 'bond_application_portal_phase6', items: [] }
}

export async function fetchBondApplicationDownloadContext({ transactionId, externalReceipts = [] } = {}) {
  const client = requireClient()
  const transaction = await client.from('transactions').select('id, reference, transaction_reference').eq('id', transactionId).maybeSingle()
  if (transaction.error) throw transaction.error
  if (!transaction.data) throw new Error('This application is not accessible.')
  const [bundle, documents, required, onboarding] = await Promise.all([
    fetchNormalizedBondApplicationBundle(client, transactionId),
    client.from('documents').select('*').eq('transaction_id', transactionId),
    client.from('transaction_required_documents').select('*').eq('transaction_id', transactionId),
    client.from('onboarding_form_data').select('*').eq('transaction_id', transactionId).maybeSingle(),
  ])
  for (const result of [documents, required, onboarding]) if (result.error) throw result.error
  // Older signing flows link the final evidence through the exact packet version.
  // Resolve that existing link read-only; never substitute a later packet revision.
  const activeSubmission = bundle?.activeSubmission
  if (activeSubmission && !activeSubmission.signed_document_id && activeSubmission.generated_document_id && activeSubmission.signing_request_id) {
    const version = await client.from('document_packet_versions').select('id, packet_id, final_signed_document_id, finalised_at')
      .eq('id', activeSubmission.generated_document_id).eq('packet_id', activeSubmission.signing_request_id).maybeSingle()
    if (!version.error) {
      const { resolveBondSignedDocumentId } = await import("../../modules/bond/application/exports/bondApplicationDownloadPack.js")
      bundle.activeSubmission = { ...activeSubmission, signed_document_id: resolveBondSignedDocumentId(activeSubmission, version.data) }
    }
  }
  const applicationState = bundle ? buildApplicationStateFromNormalizedApplication(bundle) : buildBondApplicationState({ transaction: transaction.data, onboardingFormData: onboarding.data || {} })
  const resolved = resolveBondApplicationDocumentRequirements({ applicationState, includeAllParticipants: true })
  const documentChecklist = buildBondApplicationDocumentChecklist({ activeRequirements: resolved.activeRequirements, existingDocuments: documents.data || [], existingRequiredDocuments: required.data || [], externalReceipts, submissionId: bundle?.activeSubmission?.id })
  const draftSnapshot = buildBondApplicationSubmissionSnapshot({ applicationState, documentChecklist, signerIdentity: resolveBondApplicationSignerIdentities(applicationState), transaction: transaction.data })
  draftSnapshot.draftDeclarations = [
    { participantRole: 'primary_applicant', answers: applicationState.participants?.primaryApplicant?.declarations || {} },
    ...(applicationState.participants?.coApplicant ? [{ participantRole: 'co_applicant', answers: applicationState.participants.coApplicant.declarations || {} }] : []),
    ...(applicationState.participants?.sureties || []).map((participant) => ({ participantRole: 'surety', answers: participant.declarations || {} })),
  ]
  return {
    transactionId,
    draftSnapshot,
    submission: bundle?.activeSubmission || null,
    documents: documents.data || [],
    documentChecklist,
    readiness: validateBondApplicationSubmissionReadiness({ applicationState, documentChecklist, submission: bundle?.activeSubmission || null, stage: 'bank_submission' }),
  }
}

export async function fetchBondApplicationPackDocumentUrl({ transactionId, documentId, expectedPath, expectedBucket } = {}) {
  const client = requireClient()
  const result = await client.from('documents').select('*').eq('id', documentId).eq('transaction_id', transactionId).maybeSingle()
  if (result.error) throw result.error
  const document = result.data
  if (!document || !isBondPackDocumentUploaded(document)) throw new Error('A pack document is no longer available. Refresh the application.')
  const path = document.file_path || document.storage_path
  if (!path || (expectedPath && path !== expectedPath)) throw new Error('A supporting file changed. Refresh the application before downloading.')
  const bucket = document.file_bucket || document.bucket || DOCUMENTS_BUCKET_CANDIDATES[0]
  if (expectedBucket && bucket !== expectedBucket) throw new Error('A supporting file location changed. Refresh and retry.')
  const signed = await client.storage.from(bucket).createSignedUrl(path, 120)
  if (signed.error || !signed.data?.signedUrl) throw new Error('A supporting document could not be accessed. No partial pack was downloaded.')
  return signed.data.signedUrl
}

async function readBondPackageReadiness(exportPackageId) {
  const client = requireClient()
  const packageResult = await client.from('transaction_bond_application_export_packages')
    .select('transaction_id').eq('id', exportPackageId).maybeSingle()
  if (packageResult.error) throw packageResult.error
  if (!packageResult.data?.transaction_id) throw new Error('Application package is not accessible.')
  const transactionId = packageResult.data.transaction_id
  const tracker = await fetchBondTrackerContext({ transactionId })
  return { mode: 'originator_tracker', ready: tracker.canEdit === true, label: tracker.canEdit ? 'Tracking available' : 'This deal is closed or no longer uses bond finance.', issues: tracker.canEdit ? [] : [{ code: 'open_bond_deal_required', message: 'An open deal with bond finance is required.' }] }

}

function mergeBondSubmissionAssessment(assessment, readiness) {
  const blockers = readiness.issues.map(item => ({ ...item, key: item.code }))
  return { ...assessment, mode: 'originator_tracker', status: readiness.ready ? 'ready' : 'blocked', label: readiness.label, blockers }
}

export async function fetchBondApplicationSubmissionReadiness() {
  const result = await requireClient().rpc('bridge_bond_application_submission_readiness_view_phase7')
  if (result.error) throw result.error
  const data = result.data || { version: 'bond_application_portal_phase7', items: [] }
  return { ...data, items: await Promise.all((data.items || []).map(async (item) => ({
    ...item, assessment: mergeBondSubmissionAssessment(item.assessment, await readBondPackageReadiness(item.exportPackageId)),
  }))) }
}

export async function assessBondApplicationSubmissionReadiness({ exportPackageId } = {}) {
  const readiness = await readBondPackageReadiness(exportPackageId)
  const result = await requireClient().rpc('bridge_assess_bond_application_submission_readiness_phase7', { p_export_package_id: String(exportPackageId || '').trim() })
  if (result.error) throw result.error
  return mergeBondSubmissionAssessment(result.data, readiness)
}

export async function recordBondApplicationExternalSubmission({ exportPackageId, expectedSubmissionId, submittedAt, lenderNames = [], externalReference = '', notes = '' } = {}) {
  // The server checks tracker access and the open deal. No application or
  // signing preflight is needed; retain the retired RPC argument as null.
  const result = await requireClient().rpc('bridge_record_bond_handoff_submission', { p_export_package_id: String(exportPackageId || '').trim(), p_expected_submission_id: expectedSubmissionId || null, p_submitted_at: submittedAt, p_lender_names: lenderNames, p_external_reference: externalReference || null, p_notes: notes || null })
  if (result.error) throw result.error
  return result.data || null
}

export async function fetchBondApplicationHandoff({ exportPackageId } = {}) {
  const result = await requireClient().rpc('bridge_bond_handoff_view', { p_export_package_id: exportPackageId })
  if (result.error) throw result.error
  return result.data || { requests: [], corrections: [] }
}

export async function reviewBondApplicationHandoffDocument({ requestId, documentId, action, feedback = '' } = {}) {
  const result = await requireClient().rpc('bridge_review_bond_handoff_document', {
    p_request_id: requestId, p_expected_document_id: documentId || null, p_action: action, p_feedback: feedback.trim() || null,
  })
  if (result.error) throw result.error
  return result.data
}

export async function updateBondApplicationCorrection({ exportPackageId, action, instruction = '', requestId = null } = {}) {
  const result = await requireClient().rpc('bridge_bond_handoff_correction', {
    p_export_package_id: exportPackageId, p_action: action, p_instruction: instruction.trim() || null, p_request_id: requestId,
  })
  if (result.error) throw result.error
  return result.data
}

export async function fetchBondApplicationExternalSubmissions() {
  const result = await requireClient().rpc('bridge_bond_application_external_submission_view_phase8')
  if (result.error) throw result.error
  return result.data || { version: 'bond_application_portal_phase8', items: [] }
}

export async function sendBondApplicationPortalDeliveryForOriginator({ exportPackageId } = {}) {
  const packageId = String(exportPackageId || '').trim()
  if (!packageId) throw new Error('An originator intake package is required.')
  const client = requireClient()
  const result = await client.rpc('bridge_send_bond_application_portal_delivery_for_originator', {
    p_export_package_id: packageId,
  })
  if (result.error) throw result.error
  return result.data || null
}

async function resolveBondApplicationParticipantInviteContext(client, token) {
  const tokenHash = await hashBondApplicationParticipantToken(token)
  const inviteQuery = await client
    .from('bond_application_participant_invites')
    .select('*, participant:bond_application_participants(*, application:bond_applications(*))')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (inviteQuery.error) throw inviteQuery.error
  const invite = inviteQuery.data || null
  if (!invite?.id) throw new Error('Invitation link is invalid.')
  if (['revoked', 'expired', 'declined', 'superseded'].includes(invite.status)) throw new Error('Invitation link is no longer active.')
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) throw new Error('Invitation link has expired.')
  const applicationId = invite.participant?.bond_application_id
  const normalizedApplication = await fetchNormalizedBondApplicationBundle(client, invite.participant?.application?.transaction_id)
  return {
    invite,
    participant: {
      ...(invite.participant || {}),
      participantKey: invite.participant?.participant_key,
    },
    applicationId,
    normalizedApplication,
  }
}

export async function inviteClientPortalBondApplicationCoApplicant({
  token,
  fullName = '',
  email = '',
  phone = '',
  idempotencyKey = '',
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const { normalizedApplication } = await ensureClientPortalNormalizedBondApplication({ token, includeCoApplicant: true })
  const coParticipant = (normalizedApplication.participants || []).find((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant)
  if (!coParticipant?.id) throw new Error('Co-applicant participant could not be created.')
  const rawToken = generateClientPortalToken()
  const tokenHash = await hashBondApplicationParticipantToken(rawToken)
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const existingInvite = await client
    .from('bond_application_participant_invites')
    .select('*')
    .eq('participant_id', coParticipant.id)
    .in('status', ['pending', 'sent'])
    .maybeSingle()
  if (existingInvite.error && !isMissingSchemaError(existingInvite.error)) throw existingInvite.error
  if (existingInvite.data?.id && idempotencyKey && existingInvite.data.metadata?.idempotencyKey === idempotencyKey) {
    return { invite: existingInvite.data, reused: true }
  }
  if (existingInvite.data?.id) {
    const revoke = await client
      .from('bond_application_participant_invites')
      .update({ status: 'superseded', revoked_at: new Date().toISOString() })
      .eq('id', existingInvite.data.id)
    if (revoke.error) throw revoke.error
  }
  const inviteInsert = await client
    .from('bond_application_participant_invites')
    .insert({
      participant_id: coParticipant.id,
      purpose: 'co_applicant_access',
      token_hash: tokenHash,
      status: 'sent',
      delivery_channel: 'email',
      delivery_destination_reference: normalizeEmailAddress(email) || normalizeNullableText(phone),
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
      metadata: {
        idempotencyKey: idempotencyKey || null,
        displayName: fullName || coParticipant.displayName || '',
        email: normalizeEmailAddress(email),
        phone: normalizeNullableText(phone),
      },
    })
    .select('*')
    .single()
  if (inviteInsert.error) throw inviteInsert.error
  await client
    .from('bond_application_participants')
    .update({
      status: BOND_APPLICATION_PARTICIPANT_STATUSES.invited,
      invitation_status: 'sent',
      metadata: {
        ...(coParticipant.metadata || {}),
        displayName: fullName || coParticipant.displayName || '',
        email: normalizeEmailAddress(email),
        phone: normalizeNullableText(phone),
      },
    })
    .eq('id', coParticipant.id)
  const { token_hash: _tokenHash, ...safeInvite } = inviteInsert.data || {}
  return {
    invite: safeInvite,
    deliveryChannel: 'email',
    deliveryDestination: normalizeEmailAddress(email) || normalizeNullableText(phone),
  }
}

export async function inviteClientPortalBondApplicationSurety({
  token,
  fullName = '',
  email = '',
  phone = '',
  relationshipToApplicant = '',
  idempotencyKey = '',
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const { normalizedApplication } = await ensureClientPortalNormalizedBondApplication({ token })
  const created = createSuretyParticipant({
    normalizedApplication,
    displayName: fullName,
    email: normalizeEmailAddress(email),
    phone: normalizeNullableText(phone),
    relationshipToApplicant,
  })
  if (!created.ok) {
    const error = new Error(created.reason === 'maximum_active_sureties_exceeded'
      ? 'The current surety rollout allows one active surety.'
      : 'Surety invitations are not available for this application.')
    error.code = created.reason
    throw error
  }
  const insertParticipant = await client
    .from('bond_application_participants')
    .insert({
      bond_application_id: normalizedApplication.id,
      participant_key: created.participant.participantKey,
      role: created.participant.role,
      ordinal: created.participant.ordinal || 1,
      status: BOND_APPLICATION_PARTICIPANT_STATUSES.invited,
      invitation_status: 'sent',
      metadata: {
        ...(created.participant.metadata || {}),
        displayName: fullName || '',
        email: normalizeEmailAddress(email),
        phone: normalizeNullableText(phone),
      },
    })
    .select('*')
    .single()
  if (insertParticipant.error) {
    if (insertParticipant.error.code === '23505' && idempotencyKey) {
      const existing = await fetchNormalizedBondApplicationBundle(client, normalizedApplication.transactionId)
      return { normalizedApplication: existing, reused: true }
    }
    throw insertParticipant.error
  }
  const sections = created.normalizedApplication.participantSections?.[created.participant.participantKey] || {}
  for (const [sectionKey, answers] of Object.entries(sections)) {
    const sectionInsert = await client
      .from('bond_application_sections')
      .insert({
        bond_application_id: normalizedApplication.id,
        participant_id: insertParticipant.data.id,
        scope: 'participant',
        section_key: sectionKey,
        answers_json: answers || {},
        status: 'in_progress',
      })
    if (sectionInsert.error && sectionInsert.error.code !== '23505') throw sectionInsert.error
  }
  const rawToken = generateClientPortalToken()
  const tokenHash = await hashBondApplicationParticipantToken(rawToken)
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const inviteInsert = await client
    .from('bond_application_participant_invites')
    .insert({
      participant_id: insertParticipant.data.id,
      purpose: 'surety_access',
      token_hash: tokenHash,
      status: 'sent',
      delivery_channel: 'email',
      delivery_destination_reference: normalizeEmailAddress(email) || normalizeNullableText(phone),
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
      metadata: {
        idempotencyKey: idempotencyKey || null,
        displayName: fullName || '',
        email: normalizeEmailAddress(email),
        phone: normalizeNullableText(phone),
        relationshipToApplicant: relationshipToApplicant || null,
      },
    })
    .select('*')
    .single()
  if (inviteInsert.error) throw inviteInsert.error
  const appUpdate = await client
    .from('bond_applications')
    .update({
      revision: created.normalizedApplication.revision,
      status: created.normalizedApplication.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedApplication.id)
  if (appUpdate.error) throw appUpdate.error
  await persistNormalizedCompatibilityProjection(client, {
    ...created.normalizedApplication,
    participants: created.normalizedApplication.participants.map((participant) => (
      participant.participantKey === created.participant.participantKey
        ? { ...participant, id: insertParticipant.data.id, status: BOND_APPLICATION_PARTICIPANT_STATUSES.invited, invitationStatus: 'sent' }
        : participant
    )),
  }, {})
  return {
    invite: inviteInsert.data,
    participant: insertParticipant.data,
    deliveryChannel: 'email',
    deliveryDestination: normalizeEmailAddress(email) || normalizeNullableText(phone),
  }
}

export async function acceptBondApplicationParticipantInvitation({ token } = {}) {
  const client = requireClientPortalTokenClient(token)
  const context = await resolveBondApplicationParticipantInviteContext(client, token)
  const now = new Date().toISOString()
  const updateInvite = await client
    .from('bond_application_participant_invites')
    .update({ status: 'accepted', accepted_at: now })
    .eq('id', context.invite.id)
    .select('*')
    .single()
  if (updateInvite.error) throw updateInvite.error
  const updateParticipant = await client
    .from('bond_application_participants')
    .update({
      status: BOND_APPLICATION_PARTICIPANT_STATUSES.inProgress,
      invitation_status: 'accepted',
      updated_at: now,
    })
    .eq('id', context.participant.id)
    .select('*')
    .single()
  if (updateParticipant.error) throw updateParticipant.error
  return {
    invite: updateInvite.data,
    participant: updateParticipant.data,
    normalizedApplication: await fetchNormalizedBondApplicationBundle(client, context.normalizedApplication.transactionId),
  }
}

export async function saveClientPortalBondApplicationSection({
  token,
  sectionKey,
  scope = 'participant',
  participantKey = null,
  answers = {},
  expectedSectionVersion = null,
  idempotencyKey = '',
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const context = await fetchClientPortalNormalizedBondApplication({ token })
  const normalizedApplication = context.normalizedApplication
  if (!normalizedApplication?.id) throw new Error('Normalized bond application is not available.')
  const viewer = context.participantContext?.participant || (normalizedApplication.participants || []).find((item) => item.role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant)
  const targetParticipantKey = scope === 'participant' ? (participantKey || viewer?.participantKey || viewer?.participant_key) : null
  if (scope === 'participant' && targetParticipantKey !== (viewer?.participantKey || viewer?.participant_key)) {
    throw new Error('You can only update your own application section.')
  }
  if (scope === 'application' && viewer?.role !== BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant) {
    throw new Error('Only the primary applicant can update shared application details.')
  }
  const saved = saveNormalizedBondApplicationSection({
    normalizedApplication,
    participantKey: targetParticipantKey,
    sectionKey,
    scope,
    answers,
    expectedSectionVersion,
    idempotencyKey,
  })
  if (!saved.ok) {
    const error = new Error(saved.message || 'This section was updated elsewhere. Refresh before continuing.')
    error.code = saved.reason
    throw error
  }
  const sectionWhere = scope === 'application'
    ? { bond_application_id: normalizedApplication.id, section_key: sectionKey, participant_id: null }
    : { bond_application_id: normalizedApplication.id, section_key: sectionKey }
  const participant = (normalizedApplication.participants || []).find((item) => item.participantKey === targetParticipantKey)
  let query = client
    .from('bond_application_sections')
    .update({
      answers_json: answers || {},
      version: saved.sectionVersion,
      updated_at: new Date().toISOString(),
      status: 'in_progress',
    })
    .eq('bond_application_id', sectionWhere.bond_application_id)
    .eq('section_key', sectionKey)
  if (scope === 'participant') query = query.eq('participant_id', participant?.id)
  else query = query.is('participant_id', null)
  const update = await query
  if (update.error) throw update.error
  const appUpdate = await client
    .from('bond_applications')
    .update({
      revision: saved.normalizedApplication.revision,
      status: saved.normalizedApplication.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedApplication.id)
  if (appUpdate.error) throw appUpdate.error
  await persistNormalizedCompatibilityProjection(client, saved.normalizedApplication, {})
  return { normalizedApplication: saved.normalizedApplication, sectionVersion: saved.sectionVersion }
}

export async function markClientPortalBondApplicationParticipantReady({
  token,
  reviewContextHash,
  declarationEvidence = [],
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const context = await fetchClientPortalNormalizedBondApplication({ token })
  const normalizedApplication = context.normalizedApplication
  const participantKey = context.participantContext?.participant?.participantKey || context.participantContext?.participant?.participant_key
  const authoritativeHash = await calculateBondApplicationReviewContextHash(normalizedApplication)
  if (reviewContextHash && reviewContextHash !== authoritativeHash) {
    throw new Error('Some application details changed. Please review your information again before signing.')
  }
  const marked = markBondApplicationParticipantReady({
    normalizedApplication,
    participantKey,
    reviewContextHash: authoritativeHash,
    declarationEvidence,
  })
  if (!marked.ok) throw new Error('Participant record was not found.')
  const participant = (marked.normalizedApplication.participants || []).find((item) => item.participantKey === participantKey)
  const updateParticipant = await client
    .from('bond_application_participants')
    .update({
      status: participant.status,
      review_context_hash: participant.reviewContextHash,
      reviewed_revision: participant.reviewedRevision,
      reviewed_at: participant.reviewedAt,
      ready_at: participant.readyAt,
      metadata: participant.metadata || {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', participant.id)
  if (updateParticipant.error) throw updateParticipant.error
  await client
    .from('bond_applications')
    .update({ status: marked.normalizedApplication.status, updated_at: new Date().toISOString() })
    .eq('id', normalizedApplication.id)
  return { normalizedApplication: marked.normalizedApplication, reviewContextHash: authoritativeHash, allReady: marked.allReady }
}

export async function prepareClientPortalJointBondApplicationSubmission({
  token,
  idempotencyKey = '',
} = {}) {
  assertBondApplicationSigningAvailable()
  const client = requireClientPortalTokenClient(token)
  const portalContext = await fetchBondApplicationPortalSubmissionContext(client, token)
  const normalizedApplication = await fetchNormalizedBondApplicationBundle(client, portalContext.transaction.id)
  if (!normalizedApplication?.id) throw new Error('Normalized bond application is not available.')
  const activeParticipants = (normalizedApplication.participants || []).filter((participant) => !participant.removedAt && participant.status !== BOND_APPLICATION_PARTICIPANT_STATUSES.removed)
  const hasPrimary = activeParticipants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant)
  const hasCoApplicant = activeParticipants.some((participant) => participant.role === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant)
  if (!hasPrimary || !hasCoApplicant) throw new Error('A joint application requires one primary applicant and one co-applicant.')
  const reviewContextHash = await calculateBondApplicationReviewContextHash(normalizedApplication)
  const staleParticipant = activeParticipants.find((participant) => participant.status !== BOND_APPLICATION_PARTICIPANT_STATUSES.readyForSubmission || participant.reviewContextHash !== reviewContextHash)
  if (staleParticipant) {
    throw new Error('All applicants must review the latest application before signing.')
  }

  const applicationState = buildApplicationStateFromNormalizedApplication(normalizedApplication)
  const signerIdentities = resolveBondApplicationSignerIdentities(applicationState).map((identity) => {
    const participant = activeParticipants.find((item) => item.role === identity.participantRole)
    return {
      ...identity,
      participantId: participant?.id || null,
      participantKey: participant?.participantKey || null,
    }
  })
  const signerManifest = buildJointSignerManifest({ normalizedApplication, signerIdentities })
  const sourceHash = await hashBondApplicationSnapshot(projectNormalizedBondApplicationToLegacy({ normalizedApplication }))
  const existing = await fetchLatestClientPortalBondApplicationSubmissionRow(client, portalContext.transaction.id)
  if (existing?.status === BOND_APPLICATION_SUBMISSION_STATUSES.submitted && !(isBondCorrectionResubmission(normalizedApplication, existing))) {
    throw new Error('This bond application has already been submitted.')
  }
  if (existing?.status === BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature && existing.bond_application_id === normalizedApplication.id) {
    return { submission: existing }
  }
  const latestVersion = Number(existing?.submission_version || 0) + 1
  const jointDocumentRequirements = resolveBondApplicationDocumentRequirements({ applicationState, includeAllParticipants: true })
  const jointChecklist = buildBondApplicationDocumentChecklist({ activeRequirements: jointDocumentRequirements.activeRequirements, existingDocuments: portalContext.documents || [], existingRequiredDocuments: portalContext.requiredDocuments || [] })
  const jointDocumentManifest = buildBondApplicationSubmissionSnapshot({ applicationState, documentChecklist: jointChecklist }).documentManifest
  let snapshot = buildJointBondApplicationSubmissionSnapshot({
    normalizedApplication,
    documentManifest: jointDocumentManifest,
    signerManifest,
    submissionVersion: latestVersion,
    reviewContextHash,
    source: {
      onboardingFormDataId: normalizedApplication.onboardingFormDataId,
      sourceHash,
    },
  })
  snapshot = await sealBondReviewedVersion(snapshot)
  const snapshotHash = await hashBondApplicationSnapshot(snapshot)
  const insert = await client
    .from('transaction_bond_application_submissions')
    .insert({
      transaction_id: portalContext.transaction.id,
      onboarding_form_data_id: normalizedApplication.onboardingFormDataId || null,
      bond_application_id: normalizedApplication.id,
      submission_version: latestVersion,
      application_schema_version: snapshot.versions.applicationSchemaVersion,
      flow_version: snapshot.versions.flowVersion,
      document_rule_set_version: snapshot.versions.documentRuleSetVersion,
      declaration_contract_version: snapshot.versions.declarationContractVersion,
      status: BOND_APPLICATION_SUBMISSION_STATUSES.preparing,
      snapshot_json: snapshot,
      snapshot_hash: snapshotHash,
      source_application_hash: sourceHash,
      source_application_revision: normalizedApplication.revision || 1,
      review_context_hash: reviewContextHash,
      declarations_json: snapshot.participants.flatMap((participant) => participant.declarations || []),
      document_manifest_json: snapshot.documentManifest || [],
      selected_bank_ids: snapshot.selectedBanks || [],
      signer_manifest_json: signerManifest,
      prepared_at: new Date().toISOString(),
      metadata: {
        idempotencyKey: idempotencyKey || null,
        source: 'guided_bond_application_participants_v1',
      },
    })
    .select('*')
    .single()
  if (insert.error) {
    if (insert.error.code === '23505') {
      return fetchClientPortalBondApplicationSubmission({ token })
    }
    throw insert.error
  }
  let submission = insert.data
  const signing = await createOrReuseBondApplicationSigningPacket(client, {
    submission,
    context: portalContext,
    snapshot,
    snapshotHash,
    signerIdentity: signerManifest,
  })
  const update = await client
    .from('transaction_bond_application_submissions')
    .update({
      status: BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature,
      generated_document_id: signing.version?.id || null,
      signing_request_id: signing.packet?.id || null,
      awaiting_signature_at: new Date().toISOString(),
    })
    .eq('id', submission.id)
    .select('*')
    .single()
  if (update.error) throw update.error
  submission = update.data
  await client
    .from('bond_applications')
    .update({
      status: BOND_APPLICATION_STATUSES.awaitingSignatures,
      active_submission_id: submission.id,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedApplication.id)
  for (const signer of signing.signers || []) {
    const participant = activeParticipants.find((item) => item.participantKey === signer.participantKey)
    if (!participant?.id) continue
    await client
      .from('bond_application_participants')
      .update({
        status: BOND_APPLICATION_PARTICIPANT_STATUSES.awaitingSignature,
        awaiting_signature_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', participant.id)
  }
  return {
    submission: {
      ...submission,
      signers: signing.signers,
      signPath: signing.signPath,
      sign_path: signing.signPath,
    },
  }
}

async function createOrReuseBondApplicationSigningPacket(client, {
  submission,
  context,
  snapshot,
  snapshotHash,
  signerIdentity,
} = {}) {
  assertBondApplicationSigningAvailable()
  const sourceContext = {
    domain: 'guided_bond_application_v2',
    bondApplicationSubmissionId: submission.id,
    bondApplicationSubmissionVersion: submission.submission_version,
    snapshotHash,
  }
  const existingPacketQuery = await client
    .from('document_packets')
    .select('id, organisation_id, packet_type, status, title, current_version_number')
    .eq('source_context_json->>bondApplicationSubmissionId', submission.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingPacketQuery.error && !isMissingSchemaError(existingPacketQuery.error) && !isPermissionDeniedError(existingPacketQuery.error)) {
    throw existingPacketQuery.error
  }

  const organisationId =
    normalizeNullableUuid(context.transaction?.organisation_id) ||
    normalizeNullableUuid(context.transaction?.assigned_organisation_id) ||
    normalizeNullableUuid(context.transaction?.bond_workspace_id) ||
    normalizeNullableUuid(context.development?.organisation_id)
  if (!organisationId) {
    throw new Error('A signing organisation could not be resolved for this application.')
  }

  let packet = existingPacketQuery.data || null
  if (!packet?.id) {
    const packetInsert = await client
      .from('document_packets')
      .insert({
        organisation_id: organisationId,
        packet_type: 'custom',
        title: `Bond application submission v${submission.submission_version}`,
        status: 'signing_prep',
        transaction_id: context.transaction.id,
        unit_id: context.link.unit_id || null,
        source_context_json: sourceContext,
        branding_snapshot_json: {},
      })
      .select('id, organisation_id, packet_type, status, title, current_version_number')
      .single()
    if (packetInsert.error) throw packetInsert.error
    packet = packetInsert.data
  }

  const html = buildBondApplicationSubmissionHtml(snapshot, snapshotHash)
  const filePath = `client-portal/${context.transaction.id}/bond-application-submissions/${submission.id}/application.html`
  const file = new Blob([html], { type: 'text/html' })
  await uploadToDocumentsBucket(client, filePath, file, { contentType: 'text/html', upsert: true })

  let version = null
  const existingVersionQuery = await client
    .from('document_packet_versions')
    .select('id, packet_id, organisation_id, version_number, render_status, rendered_file_path, rendered_file_name, rendered_file_bucket, rendered_sha256')
    .eq('packet_id', packet.id)
    .eq('version_number', 1)
    .maybeSingle()
  if (existingVersionQuery.error && !isMissingSchemaError(existingVersionQuery.error) && !isPermissionDeniedError(existingVersionQuery.error)) throw existingVersionQuery.error
  version = existingVersionQuery.data || null
  if (!version?.id) {
    const versionInsert = await client
      .from('document_packet_versions')
      .insert({
        packet_id: packet.id,
        organisation_id: organisationId,
        version_number: 1,
        render_status: 'generated',
        rendered_file_path: filePath,
        rendered_file_name: `bond-application-submission-v${submission.submission_version}.html`,
        rendered_file_bucket: 'documents',
        rendered_media_type: 'text/html',
        rendered_sha256: snapshotHash,
        placeholders_resolved_json: {
          previewHtml: html,
          snapshotHash,
        },
        section_manifest_json: [
          { key: 'application', label: 'Application', required: true },
          { key: 'declarations', label: 'Declarations', required: true },
          { key: 'signature', label: 'Signature', required: true },
        ],
        validation_summary_json: {
          valid: true,
          source: 'guided_bond_application_v2',
        },
        generated_at: new Date().toISOString(),
      })
      .select('id, packet_id, organisation_id, version_number, render_status, rendered_file_path, rendered_file_name, rendered_file_bucket, rendered_sha256')
      .single()
    if (versionInsert.error) throw versionInsert.error
    version = versionInsert.data
  }

  const signerIdentities = (Array.isArray(signerIdentity) ? signerIdentity : [signerIdentity])
    .filter((identity) => identity?.required !== false)
  const signers = []
  for (const [index, identity] of signerIdentities.entries()) {
    const signerToken = generateBondApplicationSigningToken()
    const tokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    const signerRole = identity.signerRole ||
      (identity.participantRole === 'co_applicant' ? 'purchaser_2' : 'purchaser_1')
    const signerPayload = {
      organisation_id: organisationId,
      packet_id: packet.id,
      packet_version_id: version.id,
      signer_role: signerRole,
      signer_name: identity.fullName,
      signer_email: normalizeEmailAddress(identity.email),
      signing_order: identity.signingOrder || 1,
      status: 'ready_to_send',
      signing_token: signerToken,
      token_expires_at: tokenExpiresAt,
    }
    let signer = null
    const existingSignerQuery = await client
      .from('document_packet_signers')
      .select('id, signing_token, status, token_expires_at')
      .eq('packet_id', packet.id)
      .eq('packet_version_id', version.id)
      .eq('signer_role', signerRole)
      .maybeSingle()
    if (existingSignerQuery.error && !isMissingSchemaError(existingSignerQuery.error) && !isPermissionDeniedError(existingSignerQuery.error)) throw existingSignerQuery.error
    if (existingSignerQuery.data?.id) {
      const signerUpdate = await client
        .from('document_packet_signers')
        .update({
          signer_name: signerPayload.signer_name,
          signer_email: signerPayload.signer_email,
          signing_token: existingSignerQuery.data.signing_token || signerToken,
          token_expires_at: existingSignerQuery.data.signing_token ? existingSignerQuery.data.token_expires_at : tokenExpiresAt,
          status: ['signed', 'declined'].includes(normalizeTextValue(existingSignerQuery.data.status).toLowerCase()) ? existingSignerQuery.data.status : 'ready_to_send',
        })
        .eq('id', existingSignerQuery.data.id)
        .select('id, signer_role, signing_token, status, token_expires_at')
        .single()
      if (signerUpdate.error) throw signerUpdate.error
      signer = signerUpdate.data
    } else {
      const signerInsert = await client
        .from('document_packet_signers')
        .insert(signerPayload)
        .select('id, signer_role, signing_token, status, token_expires_at')
        .single()
      if (signerInsert.error) throw signerInsert.error
      signer = signerInsert.data
    }
    signers.push({
      ...signer,
      participantRole: identity.participantRole || 'primary_applicant',
      participantKey: identity.participantKey || null,
    })

    const existingFieldQuery = await client
      .from('document_signing_fields')
      .select('id')
      .eq('packet_id', packet.id)
      .eq('packet_version_id', version.id)
      .eq('signer_role', signerRole)
      .limit(1)
    if (existingFieldQuery.error && !isMissingSchemaError(existingFieldQuery.error) && !isPermissionDeniedError(existingFieldQuery.error)) throw existingFieldQuery.error
    if (!existingFieldQuery.data?.length) {
      const y = 680 - index * 90
      const fieldInsert = await client
        .from('document_signing_fields')
        .insert([
          {
            organisation_id: organisationId,
            packet_id: packet.id,
            packet_version_id: version.id,
            signer_role: signerRole,
            signer_name: identity.fullName,
            signer_email: normalizeEmailAddress(identity.email),
            field_type: 'signature',
            page_number: 1,
            x_position: 72,
            y_position: y,
            width: 220,
            height: 70,
            required: true,
            status: 'pending',
          },
          {
            organisation_id: organisationId,
            packet_id: packet.id,
            packet_version_id: version.id,
            signer_role: signerRole,
            signer_name: identity.fullName,
            signer_email: normalizeEmailAddress(identity.email),
            field_type: 'date',
            page_number: 1,
            x_position: 330,
            y_position: y,
            width: 120,
            height: 30,
            required: true,
            status: 'pending',
          },
        ])
      if (fieldInsert.error) throw fieldInsert.error
    }
  }

  await client.from('document_packets').update({ status: 'sent', current_version_number: 1 }).eq('id', packet.id)

  return {
    packet,
    version,
    signer: signers[0] || null,
    signers,
    signPath: signers[0]?.signing_token ? `/sign/${signers[0].signing_token}` : '',
  }
}

export async function fetchClientPortalBondApplicationSubmission({ token } = {}) {
  const client = requireClientPortalTokenClient(token)
  let context = null
  let participantRole = BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant
  try {
    context = await fetchBondApplicationPortalSubmissionContext(client, token)
  } catch (error) {
    const inviteContext = await resolveBondApplicationParticipantInviteContext(client, token)
    if (!inviteContext?.normalizedApplication) throw error
    context = {
      transaction: { id: inviteContext.normalizedApplication.transactionId || inviteContext.normalizedApplication.transaction_id },
    }
    participantRole = inviteContext.participant?.role || BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant
  }
  const submission = await fetchLatestClientPortalBondApplicationSubmissionRow(client, context.transaction.id)
  if (!submission?.id) return { submission: null }
  const normalized = await fetchNormalizedBondApplicationBundle(client, context.transaction.id)
  if (isBondCorrectionResubmission(normalized, submission)) return { submission: null, previousSubmissionId: submission.id }
  let signPath = ''
  if (submission.signing_request_id) {
    const signerRole = participantRole === BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant ? 'purchaser_2' : 'purchaser_1'
    const signerQuery = await client
      .from('document_packet_signers')
      .select('signing_token, token_expires_at, status, signed_at')
      .eq('packet_id', submission.signing_request_id)
      .eq('signer_role', signerRole)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!signerQuery.error && normalizeTextValue(signerQuery.data?.status).toLowerCase() === 'signed' && submission.status !== BOND_APPLICATION_SUBMISSION_STATUSES.submitted) {
      return finalizeClientPortalBondApplicationSubmission({ token, submissionId: submission.id })
    }
    if (!signerQuery.error && signerQuery.data?.signing_token && normalizeTextValue(signerQuery.data.status).toLowerCase() !== 'signed') {
      signPath = `/sign/${signerQuery.data.signing_token}`
    }
  }
  return { submission: { ...submission, signPath, sign_path: signPath } }
}

export async function prepareClientPortalBondApplicationSubmission({
  token,
  acceptedDeclarations = [],
  declarationValues = {},
  expectedSourceHash = '',
  idempotencyKey = '',
} = {}) {
  assertBondApplicationSigningAvailable()
  const client = requireClientPortalTokenClient(token)
  const context = await fetchBondApplicationPortalSubmissionContext(client, token)
  const normalizedApplication = await fetchNormalizedBondApplicationBundle(client, context.transaction.id)
  const applicationState = normalizedApplication?.activeChangeRequestId ? buildApplicationStateFromNormalizedApplication(normalizedApplication) : context.applicationState
  const resolvedDocs = resolveBondApplicationDocumentRequirements({ applicationState })
  const documentChecklist = buildBondApplicationDocumentChecklist({
    activeRequirements: resolvedDocs.activeRequirements,
    existingRequiredDocuments: context.requiredDocuments,
    existingDocuments: context.documents,
  })
  const declarations = resolveBondApplicationDeclarations({ applicationState })
  const signerIdentity = resolveBondApplicationSignerIdentity(applicationState)
  const readiness = validateBondApplicationSubmissionReadiness({
    applicationState,
    documentChecklist,
    declarations,
    declarationValues,
    signerIdentity,
    latestSaveStatus: 'saved',
    submission: null,
  })
  if (!readiness.ready) {
    const error = new Error('A few details still need your attention before the application can be signed.')
    error.issues = readiness.issues
    throw error
  }

  const sourceLegacy = toLegacyBondApplication(applicationState)
  const sourceHash = await hashBondApplicationSnapshot(sourceLegacy)
  if (expectedSourceHash && expectedSourceHash !== sourceHash) {
    const error = new Error('The saved application changed after review. Refresh and review the latest information before signing.')
    error.code = 'STALE_BOND_APPLICATION_SOURCE'
    throw error
  }

  const existingSubmitted = await fetchLatestClientPortalBondApplicationSubmissionRow(client, context.transaction.id)
  if (existingSubmitted?.status === BOND_APPLICATION_SUBMISSION_STATUSES.submitted && !(isBondCorrectionResubmission(normalizedApplication, existingSubmitted))) {
    const error = new Error('This bond application has already been submitted.')
    error.code = 'BOND_APPLICATION_ALREADY_SUBMITTED'
    throw error
  }
  if (existingSubmitted?.status === BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature && existingSubmitted?.source_application_hash === sourceHash) {
    const packetSummary = await fetchClientPortalBondApplicationSubmission({ token })
    return packetSummary
  }

  const latestVersionQuery = await client
    .from('transaction_bond_application_submissions')
    .select('submission_version')
    .eq('transaction_id', context.transaction.id)
    .order('submission_version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestVersionQuery.error && !isMissingTableError(latestVersionQuery.error, 'transaction_bond_application_submissions')) throw latestVersionQuery.error
  const nextVersion = Number(latestVersionQuery.data?.submission_version || 0) + 1
  const now = new Date().toISOString()
  let snapshot = buildBondApplicationSubmissionSnapshot({
    applicationState,
    transaction: context.transaction,
    submissionVersion: nextVersion,
    declarations: acceptedDeclarations.length
      ? acceptedDeclarations
      : buildBondApplicationDeclarationEvidence({
          declarations,
          values: declarationValues,
          acceptedAt: now,
          selectedBankIds: applicationState.application.selectedBankIds,
        }),
    documentChecklist,
    signerIdentity,
    source: {
      onboardingFormDataId: context.onboardingFormData?.id || null,
      sourceUpdatedAt: context.onboardingFormData?.updated_at || null,
      sourceHash,
    },
    createdAt: now,
  })
  snapshot = await sealBondReviewedVersion(snapshot)
  const snapshotHash = await hashBondApplicationSnapshot(snapshot)
  const insert = await client
    .from('transaction_bond_application_submissions')
    .insert({
      transaction_id: context.transaction.id,
      onboarding_form_data_id: context.onboardingFormData?.id || null,
      bond_application_id: normalizedApplication?.activeChangeRequestId ? normalizedApplication.id : null,
      source_application_revision: normalizedApplication?.activeChangeRequestId ? normalizedApplication.revision : null,
      submission_version: nextVersion,
      application_schema_version: String(snapshot.versions.applicationSchemaVersion),
      flow_version: BOND_APPLICATION_SUBMISSION_FLOW_VERSION,
      document_rule_set_version: snapshot.versions.documentRuleSetVersion,
      declaration_contract_version: snapshot.versions.declarationContractVersion,
      status: BOND_APPLICATION_SUBMISSION_STATUSES.preparing,
      snapshot_json: snapshot,
      snapshot_hash: snapshotHash,
      source_application_hash: sourceHash,
      source_application_updated_at: context.onboardingFormData?.updated_at || null,
      declarations_json: snapshot.declarations,
      document_manifest_json: snapshot.documentManifest,
      selected_bank_ids: snapshot.selectedBanks,
      signer_manifest_json: snapshot.signerManifest,
      prepared_at: now,
      metadata: {
        idempotencyKey: normalizeTextValue(idempotencyKey) || null,
        canonicalJsonLength: canonicalizeBondApplicationSnapshot(snapshot).length,
      },
    })
    .select('*')
    .single()
  if (insert.error) throw insert.error
  let submission = insert.data
  try {
    const signing = await createOrReuseBondApplicationSigningPacket(client, {
      submission,
      context,
      snapshot,
      snapshotHash,
      signerIdentity,
    })
    const update = await client
      .from('transaction_bond_application_submissions')
      .update({
        status: BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature,
        generated_document_id: signing.version?.id || null,
        signing_request_id: signing.packet?.id || null,
        awaiting_signature_at: new Date().toISOString(),
      })
      .eq('id', submission.id)
      .select('*')
      .single()
    if (update.error) throw update.error
    submission = { ...update.data, signPath: signing.signPath, sign_path: signing.signPath }
    if (normalizedApplication?.activeChangeRequestId) {
      const appUpdate = await client.from('bond_applications').update({ active_submission_id: submission.id, status: BOND_APPLICATION_STATUSES.awaitingSignatures, updated_at: new Date().toISOString() }).eq('id', normalizedApplication.id)
      if (appUpdate.error) throw appUpdate.error
    }
  } catch (signingError) {
    await client
      .from('transaction_bond_application_submissions')
      .update({
        status: BOND_APPLICATION_SUBMISSION_STATUSES.failed,
        failure_stage: 'signing_request_creation',
        failure_code: signingError?.code || 'signing_request_failed',
      })
      .eq('id', submission.id)
    throw signingError
  }
  return { submission, signPath: submission.signPath }
}

export async function submitClientPortalBondApplicationHtmlSignature({
  token,
  acceptedDeclarations = [],
  declarationValues = {},
  signatureEvidence = {},
  expectedSourceHash = '',
  idempotencyKey = '',
} = {}) {
  const signatureDataUrl = String(signatureEvidence?.dataUrl || '').trim()
  if (!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(signatureDataUrl) || signatureDataUrl.length > 1024 * 1024) {
    throw new Error('Draw your signature before signing the application.')
  }
  if (!signatureEvidence?.confirmed) throw new Error('Confirm the application information before signing.')

  const client = requireClientPortalTokenClient(token)
  const context = await fetchBondApplicationPortalSubmissionContext(client, token)
  const normalizedApplication = await fetchNormalizedBondApplicationBundle(client, context.transaction.id)
  const applicationState = normalizedApplication?.activeChangeRequestId ? buildApplicationStateFromNormalizedApplication(normalizedApplication) : context.applicationState
  const resolvedDocs = resolveBondApplicationDocumentRequirements({ applicationState })
  const documentChecklist = buildBondApplicationDocumentChecklist({ activeRequirements: resolvedDocs.activeRequirements, existingRequiredDocuments: context.requiredDocuments, existingDocuments: context.documents })
  const declarations = resolveBondApplicationDeclarations({ applicationState })
  const signerIdentity = resolveBondApplicationSignerIdentity(applicationState)
  const readiness = validateBondApplicationSubmissionReadiness({ applicationState, documentChecklist, declarations, declarationValues, signerIdentity, latestSaveStatus: 'saved', submission: null })
  if (!readiness.ready) {
    const error = new Error('A few details still need your attention before the application can be signed.')
    error.issues = readiness.issues
    throw error
  }

  const sourceLegacy = toLegacyBondApplication(applicationState)
  const sourceHash = await hashBondApplicationSnapshot(sourceLegacy)
  if (expectedSourceHash && expectedSourceHash !== sourceHash) throw new Error('The saved application changed after review. Refresh and review the latest information before signing.')
  const existing = await fetchLatestClientPortalBondApplicationSubmissionRow(client, context.transaction.id)
  if (existing?.status === BOND_APPLICATION_SUBMISSION_STATUSES.submitted && !(isBondCorrectionResubmission(normalizedApplication, existing))) {
    const error = new Error('This bond application has already been submitted.')
    error.code = 'BOND_APPLICATION_ALREADY_SUBMITTED'
    throw error
  }
  const latestVersionQuery = await client.from('transaction_bond_application_submissions').select('submission_version').eq('transaction_id', context.transaction.id).order('submission_version', { ascending: false }).limit(1).maybeSingle()
  if (latestVersionQuery.error && !isMissingTableError(latestVersionQuery.error, 'transaction_bond_application_submissions')) throw latestVersionQuery.error
  const now = new Date().toISOString()
  const evidence = {
    method: 'html_canvas',
    dataUrl: signatureDataUrl,
    signerName: normalizeTextValue(signatureEvidence.signerName || signerIdentity.fullName),
    signedAt: signatureEvidence.signedAt || now,
    confirmed: true,
  }
  let snapshot = buildBondApplicationSubmissionSnapshot({
    applicationState,
    transaction: context.transaction,
    submissionVersion: Number(latestVersionQuery.data?.submission_version || 0) + 1,
    declarations: acceptedDeclarations.length ? acceptedDeclarations : buildBondApplicationDeclarationEvidence({ declarations, values: declarationValues, acceptedAt: now, selectedBankIds: applicationState.application.selectedBankIds }),
    documentChecklist,
    signerIdentity,
    signatureEvidence: evidence,
    source: { onboardingFormDataId: context.onboardingFormData?.id || null, sourceUpdatedAt: context.onboardingFormData?.updated_at || null, sourceHash },
    createdAt: now,
  })
  snapshot = await sealBondReviewedVersion(snapshot)
  const snapshotHash = await hashBondApplicationSnapshot(snapshot)
  const insert = await client.from('transaction_bond_application_submissions').insert({
    transaction_id: context.transaction.id,
    onboarding_form_data_id: context.onboardingFormData?.id || null,
    bond_application_id: normalizedApplication?.activeChangeRequestId ? normalizedApplication.id : null,
    source_application_revision: normalizedApplication?.activeChangeRequestId ? normalizedApplication.revision : null,
    submission_version: snapshot.submissionVersion,
    application_schema_version: String(snapshot.versions.applicationSchemaVersion),
    flow_version: BOND_APPLICATION_SUBMISSION_FLOW_VERSION,
    document_rule_set_version: snapshot.versions.documentRuleSetVersion,
    declaration_contract_version: snapshot.versions.declarationContractVersion,
    status: BOND_APPLICATION_SUBMISSION_STATUSES.submitted,
    snapshot_json: snapshot,
    snapshot_hash: snapshotHash,
    source_application_hash: sourceHash,
    source_application_updated_at: context.onboardingFormData?.updated_at || null,
    declarations_json: snapshot.declarations,
    document_manifest_json: snapshot.documentManifest,
    selected_bank_ids: snapshot.selectedBanks,
    signer_manifest_json: snapshot.signerManifest,
    prepared_at: now,
    signed_at: evidence.signedAt,
    submitted_at: now,
    metadata: { idempotencyKey: normalizeTextValue(idempotencyKey) || null, signingMethod: 'html_canvas', signatureConfirmedAt: now },
  }).select('*').single()
  if (insert.error) throw insert.error

  if (normalizedApplication?.id) {
    const appUpdate = await client.from('bond_applications').update({ status: BOND_APPLICATION_STATUSES.submitted, active_submission_id: insert.data.id, submitted_at: now, updated_at: now }).eq('id', normalizedApplication.id)
    if (appUpdate.error) throw appUpdate.error
  }
  return { submission: insert.data }
}

export async function cancelClientPortalBondApplicationSubmission({ token, submissionId } = {}) {
  const client = requireClientPortalTokenClient(token)
  const context = await fetchBondApplicationPortalSubmissionContext(client, token)
  const query = await client
    .from('transaction_bond_application_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('transaction_id', context.transaction.id)
    .maybeSingle()
  if (query.error) throw query.error
  if (!query.data) throw new Error('Submission was not found.')
  if (query.data.status === BOND_APPLICATION_SUBMISSION_STATUSES.submitted) {
    throw new Error('A submitted application cannot be reopened from the buyer portal.')
  }
  if (query.data.signing_request_id) {
    await client
      .from('document_packet_signers')
      .update({ status: 'expired', signing_token: null, token_expires_at: null })
      .eq('packet_id', query.data.signing_request_id)
      .neq('status', 'signed')
  }
  const update = await client
    .from('transaction_bond_application_submissions')
    .update({
      status: BOND_APPLICATION_SUBMISSION_STATUSES.cancelled,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', query.data.id)
    .select('*')
    .single()
  if (update.error) throw update.error
  return { submission: update.data }
}

export async function finalizeClientPortalBondApplicationSubmission({ token, submissionId } = {}) {
  const client = requireClientPortalTokenClient(token)
  let context = null
  try {
    context = await fetchBondApplicationPortalSubmissionContext(client, token)
  } catch {
    const inviteContext = await resolveBondApplicationParticipantInviteContext(client, token)
    context = {
      transaction: { id: inviteContext.normalizedApplication.transactionId },
      onboardingFormData: { id: inviteContext.normalizedApplication.onboardingFormDataId, form_data: {} },
      applicationState: buildApplicationStateFromNormalizedApplication(inviteContext.normalizedApplication),
      normalizedApplication: inviteContext.normalizedApplication,
    }
  }
  const submissionQuery = await client
    .from('transaction_bond_application_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('transaction_id', context.transaction.id)
    .maybeSingle()
  if (submissionQuery.error) throw submissionQuery.error
  const submission = submissionQuery.data
  if (!submission?.id) throw new Error('Submission was not found.')
  if (submission.status === BOND_APPLICATION_SUBMISSION_STATUSES.submitted) return { submission }
  if (!submission.signing_request_id) throw new Error('Signing request is not linked to this submission.')
  const signerQuery = await client
    .from('document_packet_signers')
    .select('id, signer_role, status, signed_at')
    .eq('packet_id', submission.signing_request_id)
    .in('signer_role', ['purchaser_1', 'purchaser_2'])
  if (signerQuery.error) throw signerQuery.error
  const signerRows = signerQuery.data || []
  const expectedSignerCount = Math.max(Array.isArray(submission.signer_manifest_json) ? submission.signer_manifest_json.length : 1, 1)
  const signedRows = signerRows.filter((row) => normalizeTextValue(row.status).toLowerCase() === 'signed')
  if (signerRows.length < expectedSignerCount || signedRows.length < expectedSignerCount) {
    return { submission, finalized: false }
  }
  const now = new Date().toISOString()
  const update = await client
    .from('transaction_bond_application_submissions')
    .update({
      status: BOND_APPLICATION_SUBMISSION_STATUSES.submitted,
      signed_at: signedRows.map((row) => row.signed_at).filter(Boolean).sort().at(-1) || now,
      submitted_at: now,
      signed_document_id: submission.signed_document_id || null,
    })
    .eq('id', submission.id)
    .select('*')
    .single()
  if (update.error) throw update.error

  let normalizedApplication = null
  if (submission.bond_application_id) {
    normalizedApplication = await fetchNormalizedBondApplicationBundle(client, context.transaction.id)
  }
  const legacy = normalizedApplication
    ? projectNormalizedBondApplicationToLegacy({ normalizedApplication })
    : toLegacyBondApplication(context.applicationState)
  const nextLegacy = {
    ...legacy,
    status: 'Submitted',
    submitted_at: now,
    _meta: {
      ...(legacy._meta || {}),
      guided_bond_application_v2: {
        ...(legacy._meta?.guided_bond_application_v2 || {}),
        flow_version: BOND_APPLICATION_SUBMISSION_FLOW_VERSION,
        active_submission_id: update.data.id,
        active_submission_version: update.data.submission_version,
        submission_status: BOND_APPLICATION_SUBMISSION_STATUSES.submitted,
        submitted_at: now,
      },
    },
  }
  const formData = {
    ...(context.onboardingFormData?.form_data || {}),
    bond_application: nextLegacy,
  }
  await client
    .from('onboarding_form_data')
    .update({ form_data: formData, updated_at: now })
    .eq('transaction_id', context.transaction.id)

  if (normalizedApplication?.id) {
    await client
      .from('bond_applications')
      .update({
        status: BOND_APPLICATION_STATUSES.submitted,
        submitted_at: now,
        active_submission_id: update.data.id,
        updated_at: now,
      })
      .eq('id', normalizedApplication.id)
    const signersByRole = new Map(signedRows.map((row) => [
      row.signer_role === 'purchaser_2' ? BOND_APPLICATION_PARTICIPANT_ROLES.coApplicant : BOND_APPLICATION_PARTICIPANT_ROLES.primaryApplicant,
      row,
    ]))
    for (const participant of normalizedApplication.participants || []) {
      const signer = signersByRole.get(participant.role)
      if (!signer) continue
      await client
        .from('bond_application_participants')
        .update({
          status: BOND_APPLICATION_PARTICIPANT_STATUSES.completed,
          signed_at: signer.signed_at || now,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', participant.id)
    }
  }

  return { submission: update.data, finalized: true }
}

export async function fetchBondTrackerContext({ transactionId }) {
  const result = await requireClient().rpc('bridge_bond_tracker_context', { p_transaction: transactionId })
  if (result.error) throw result.error
  return result.data
}
