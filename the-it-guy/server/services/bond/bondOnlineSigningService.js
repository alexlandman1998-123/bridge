import { createHash } from 'node:crypto'
import { assessBondPermissionReviewPolicy } from '../../../src/modules/bond/application/submission/bondApplicationPermissionPolicy.js'
import { assertBondReviewedVersionIntegrity } from '../../../src/modules/bond/application/submission/bondApplicationReviewedVersion.js'
import { hashBondApplicationSnapshot } from '../../../src/modules/bond/application/submission/bondApplicationSnapshotHash.js'
import { isElectronicSigningApproved } from '../../../src/core/documents/signingClassificationPolicy.js'

const fail = (code, message, status = 409) => { const error = new Error(message); error.code = code; error.status = status; error.isBondSigningError = true; throw error }
const requiredProviderMethods = ['createEnvelope', 'openSession', 'verifyCode', 'readEnvelope', 'readCompletedDocument', 'verifyCompletion']
const requiredRepositoryMethods = ['freezeVersion', 'findEnvelope', 'createEnvelope', 'getEnvelope', 'assertCurrent', 'transition', 'saveCompletedOriginal', 'readCompletedOriginal', 'consumeVerificationStart', 'findCurrentEnvelope']
const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Only server dependencies supply approvals, provider credentials, applicant
// authorization and durable persistence. No browser flag can release signing.
// No real provider is registered in phase 5; production stays unavailable.
export function createBondOnlineSigningService({ policy, provider, repository, authorizeApplicant, releaseEnabled = false, classificationApproved = () => isElectronicSigningApproved('buyer_bond_application'), now = () => new Date().toISOString() } = {}) {
  function availability() {
    const approved = policy && assessBondPermissionReviewPolicy(policy, { asOf: now() }).methods.online.readyForImplementation
    const configured = requiredProviderMethods.every((key) => typeof provider?.[key] === 'function') && requiredRepositoryMethods.every((key) => typeof repository?.[key] === 'function') && typeof authorizeApplicant === 'function'
    const available = Boolean(releaseEnabled && classificationApproved() && approved && configured && provider.id === policy.signingMethods.online.provider && provider.allowedOrigins?.length && provider.allowedOrigins.every((origin) => { try { return new URL(origin).protocol === 'https:' && new URL(origin).origin === origin } catch { return false } }))
    return { available, code: available ? null : 'online_signing_unavailable', message: available ? 'Each applicant verifies their identity and signs their own application version.' : 'Verified online signing is not enabled yet. You can download, sign and upload your application here.' }
  }
  function enabled() { if (!availability().available) fail('online_signing_unavailable', availability().message, 503) }
  async function scope(credentials) {
    enabled()
    const applicant = await authorizeApplicant(credentials)
    if (!applicant?.applicationId || !applicant?.participantKey) fail('signer_access_denied', 'This signing link is not accessible.', 403)
    return applicant
  }
  function signerFor(envelope, applicant) {
    if (envelope.applicationId !== applicant.applicationId) fail('signer_access_denied', 'This signing link is not accessible.', 403)
    const signer = envelope.snapshot.signerManifest?.find((item) => item.participantKey === applicant.participantKey)
    if (!signer) fail('signer_access_denied', 'You cannot sign for another applicant.', 403)
    return signer
  }
  function checkClauses(snapshot) {
    for (const participant of snapshot.participants || []) {
      for (const clause of policy.clauses) {
        const matches = participant.declarations?.filter((entry) => entry.key === clause.key) || []
        if (matches.length !== 1 || matches[0].text !== clause.text || matches[0].required !== clause.required) fail('permission_version_mismatch', 'Review the approved permissions on a new application version.')
      }
    }
  }
  function signingUrl(value) {
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password && provider.allowedOrigins?.includes(url.origin)) return url.href } catch { /* Invalid provider URL. */ }
    fail('invalid_signing_url', 'The verified signing link could not be validated.', 502)
  }
  function verifySignerEvidence(evidence, signer, envelope, completedAt = now()) {
    if (!evidence || evidence.identityVerified !== true || String(evidence.verifiedEmail || '').toLowerCase() !== String(signer.email || '').toLowerCase() || evidence.verificationMethod !== policy.signingMethods.online.verificationMethod || evidence.intentToSign !== true || evidence.snapshotHash !== envelope.snapshotHash || !validTime(evidence.signedAt) || Date.parse(evidence.signedAt) < Date.parse(envelope.snapshot.createdAt) || Date.parse(evidence.signedAt) > Date.parse(completedAt) || !evidence.verificationReference || !evidence.signatureReference || !validTime(evidence.verifiedAt) || Date.parse(evidence.verifiedAt) < Date.parse(envelope.snapshot.createdAt) || Date.parse(evidence.verifiedAt) > Date.parse(evidence.signedAt) || policy.clauses.some((clause) => clause.required && evidence.consent?.[clause.key] !== true)) fail('incomplete_signer_evidence', 'Every applicant must separately verify, consent and sign this version.', 502)
  }
  async function get(credentials, envelopeId) {
    const applicant = await scope(credentials)
    const envelope = await repository.getEnvelope(envelopeId)
    if (!envelope) fail('signer_access_denied', 'This signing link is not accessible.', 403)
    const signer = signerFor(envelope, applicant)
    if (envelope.policyVersion !== policy.version || envelope.providerId !== provider.id) fail('permission_version_mismatch', 'Review the current approved signing method on a new version.')
    checkClauses(envelope.snapshot)
    await assertBondReviewedVersionIntegrity(envelope.snapshot)
    if (await hashBondApplicationSnapshot(envelope.snapshot) !== envelope.snapshotHash) fail('version_changed', 'The fixed application could not be verified.')
    if (envelope.status !== 'completed') await repository.assertCurrent(envelope.applicationId, envelope.sourceRevision)
    return { applicant, signer, envelope }
  }
  function publicState(envelope, participantKey) {
    return { id: envelope.id, reference: envelope.snapshot.reviewedVersion.reference, status: envelope.status,
      signerStatus: envelope.signerEvidence?.find((item) => item.participantKey === participantKey)?.status || 'awaiting_signature',
      completedSigners: envelope.signerEvidence?.filter((item) => item.status === 'signed').length || 0,
      requiredSigners: envelope.snapshot.signerManifest.length, review: { applicationIntent: envelope.snapshot.applicationIntent, shared: envelope.snapshot.shared, selectedBanks: envelope.snapshot.selectedBanks, submissionVersion: envelope.snapshot.submissionVersion, createdAt: envelope.snapshot.createdAt, documentManifest: [], participants: envelope.snapshot.participants.filter((item) => item.participantKey === participantKey), declarations: policy.clauses, signerManifest: envelope.snapshot.signerManifest.filter((item) => item.participantKey === participantKey) }, declarations: policy.clauses, privacyNotice: policy.privacy.noticeReference, documentAvailable: envelope.status === 'completed' && Boolean(envelope.originalId) }
  }
  function allowedSession(envelope) {
    if (envelope.status === 'cancelled') fail('signing_cancelled', 'This signing version was cancelled. Review a new version.')
    if (envelope.status === 'completed') fail('already_signed', 'This application has already been signed.')
  }
  return {
    availability,
    async resume({ credentials }) {
      const applicant = await scope(credentials)
      const current = await repository.findCurrentEnvelope(applicant.applicationId)
      if (!current) return null
      const { envelope } = await get(credentials, current.id)
      return publicState(envelope, applicant.participantKey)
    },
    async prepare({ credentials, expectedRevision }) {
      const applicant = await scope(credentials)
      const version = await repository.freezeVersion({ applicant, expectedRevision, policy })
      await assertBondReviewedVersionIntegrity(version.snapshot)
      checkClauses(version.snapshot)
      await repository.assertCurrent(applicant.applicationId, version.sourceRevision)
      if (version.snapshot.application?.id !== applicant.applicationId) fail('signer_access_denied', 'This signing version is not accessible.', 403)
      signerFor({ applicationId: applicant.applicationId, snapshot: version.snapshot }, applicant)
      if (!version.snapshot.signerManifest?.length) fail('signers_required', 'Every applicant must be included.')
      if ((version.snapshot.selectedBanks || []).some((id) => !policy.banks.some((bank) => bank.id === id))) fail('bank_not_approved', 'Online signing is not approved for a selected bank.')
      if (!version.snapshot.selectedBanks?.length || new Set(version.snapshot.signerManifest.map((item) => item.participantKey)).size !== version.snapshot.signerManifest.length || version.snapshot.signerManifest.some((item) => !['primary_applicant', 'co_applicant'].includes(item.participantRole))) fail('unsupported_signer_manifest', 'Review all required applicants and banks before signing.')
      const prior = await repository.findEnvelope(version.id)
      if (prior) { signerFor(prior, applicant); return publicState(prior, applicant.participantKey) }
      const snapshotHash = await hashBondApplicationSnapshot(version.snapshot)
      const providerEnvelope = await provider.createEnvelope({ idempotencyKey: version.id, snapshot: version.snapshot, snapshotHash, signers: version.snapshot.signerManifest, policyVersion: policy.version })
      if (!providerEnvelope?.id) fail('provider_unavailable', 'The signing service did not prepare the application.', 502)
      const envelope = await repository.createEnvelope({ versionId: version.id, applicationId: applicant.applicationId, sourceRevision: version.sourceRevision, snapshot: version.snapshot, snapshotHash, providerId: provider.id, providerEnvelopeId: providerEnvelope.id, status: 'awaiting_signatures', signerEvidence: [], policyVersion: policy.version })
      signerFor(envelope, applicant)
      return publicState(envelope, applicant.participantKey)
    },
    async start({ credentials, envelopeId, consent, intentToSign }) {
      const { envelope, signer } = await get(credentials, envelopeId)
      allowedSession(envelope)
      if (intentToSign !== true || policy.clauses.some((clause) => clause.required && consent?.[clause.key] !== true)) fail('consent_required', 'Confirm the required permissions and your intent to sign.')
      // The provider binds its challenge to this signer AND this content hash.
      if (envelope.signerEvidence?.some((entry) => entry.participantKey === signer.participantKey && entry.status === 'signed')) fail('already_signed', 'You have already signed this application version.')
      if (!await repository.consumeVerificationStart({ applicationId: envelope.applicationId, participantKey: signer.participantKey, at: now() })) fail('verification_rate_limited', 'Please wait before requesting another verification code.', 429)
      const session = await provider.openSession({ envelopeId: envelope.providerEnvelopeId, participantKey: signer.participantKey, snapshotHash: envelope.snapshotHash, consent: Object.fromEntries(policy.clauses.map((clause) => [clause.key, consent?.[clause.key] === true])), intentToSign: true })
      if (!session?.id || !validTime(session.expiresAt) || Date.parse(session.expiresAt) <= Date.parse(now()) || !['awaiting_code', 'verified'].includes(session.status)) fail('invalid_signing_session', 'The verification session could not be started.', 502)
      await repository.transition(envelope.id, envelope.revision, { session: { ...session, participantKey: signer.participantKey, snapshotHash: envelope.snapshotHash }, event: { type: 'verification_started', participantKey: signer.participantKey, at: now() } })
      return { sessionId: session.id, status: session.status, expiresAt: session.expiresAt }
    },
    async verify({ credentials, envelopeId, sessionId, code }) {
      const { envelope, signer } = await get(credentials, envelopeId)
      allowedSession(envelope)
      const session = envelope.sessions?.find((entry) => entry.id === sessionId && entry.participantKey === signer.participantKey)
      if (!session || session.snapshotHash !== envelope.snapshotHash) fail('invalid_signing_session', 'Start verification for your own application version.', 403)
      if (Date.parse(session.expiresAt) <= Date.parse(now())) fail('verification_expired', 'Your code expired. Start verification again.')
      if (session.status === 'verified') return { verified: true, signingUrl: signingUrl(session.signingUrl) }
      if (session.status === 'locked' || session.attempts >= 5) fail('verification_locked', 'Too many failed attempts. Start a new verification session.')
      if (!/^\d{4,10}$/.test(String(code || ''))) fail('invalid_code', 'Enter the verification code.')
      // Codes are sent only to the approved provider; they are never stored.
      const result = await provider.verifyCode({ envelopeId: envelope.providerEnvelopeId, sessionId, participantKey: signer.participantKey, snapshotHash: envelope.snapshotHash, code: String(code) })
      const valid = result?.verified === true && result.snapshotHash === envelope.snapshotHash && result.participantKey === signer.participantKey && validTime(result.verifiedAt) && Date.parse(result.verifiedAt) >= Date.parse(envelope.snapshot.createdAt) && Date.parse(result.verifiedAt) <= Date.parse(now())
      const link = valid ? signingUrl(result.signingUrl) : null
      const attempts = (session.attempts || 0) + (valid ? 0 : 1)
      await repository.transition(envelope.id, envelope.revision, { session: { ...session, attempts, status: valid ? 'verified' : attempts >= 5 ? 'locked' : 'awaiting_code', verifiedAt: valid ? result.verifiedAt : null, signingUrl: link }, event: { type: valid ? 'identity_verified' : 'verification_failed', participantKey: signer.participantKey, at: now() } })
      if (!valid) fail('verification_failed', attempts >= 5 ? 'Too many failed attempts. Start a new verification session.' : 'That code could not be verified. Try again.')
      return { verified: true, signingUrl: link }
    },
    async status({ credentials, envelopeId }) {
      const { envelope, applicant } = await get(credentials, envelopeId)
      if (envelope.status === 'completed' || envelope.status === 'cancelled') return publicState(envelope, applicant.participantKey)
      const progress = await provider.readEnvelope(envelope.providerEnvelopeId)
      if (progress?.status !== 'completed') {
        if (progress?.authenticated === true && progress.envelopeId === envelope.providerEnvelopeId && progress.snapshotHash === envelope.snapshotHash && progress.signers?.length) {
          if (new Set(progress.signers.map((item) => item.participantKey)).size !== progress.signers.length) fail('incomplete_signer_evidence', 'Each applicant must have separate signing evidence.', 502)
          for (const item of progress.signers) {
            const signer = envelope.snapshot.signerManifest.find((entry) => entry.participantKey === item.participantKey)
            if (!signer) fail('incomplete_signer_evidence', 'An unexpected signer was reported.', 502)
            verifySignerEvidence(item, signer, envelope)
            const previous = envelope.signerEvidence?.find((entry) => entry.participantKey === item.participantKey && entry.status === 'signed')
            if (previous && await hashBondApplicationSnapshot(previous) !== await hashBondApplicationSnapshot({ ...item, status: 'signed' })) fail('signed_evidence_changed', 'A previously verified signature changed. Review a new version.', 502)
          }
          const combined = [...(envelope.signerEvidence || []).filter((item) => !progress.signers.some((entry) => entry.participantKey === item.participantKey)), ...progress.signers.map((item) => ({ ...item, status: 'signed' }))]
          if (await hashBondApplicationSnapshot([...combined].sort((a, b) => a.participantKey.localeCompare(b.participantKey))) === await hashBondApplicationSnapshot([...(envelope.signerEvidence || [])].sort((a, b) => a.participantKey.localeCompare(b.participantKey)))) return publicState(envelope, applicant.participantKey)
          const updated = await repository.transition(envelope.id, envelope.revision, { signerEvidence: combined, event: { type: 'signer_progress_verified', at: now() } })
          return publicState(updated, applicant.participantKey)
        }
        return publicState(envelope, applicant.participantKey)
      }
      // Never trust a browser success redirect, or an unsigned webhook payload.
      const proof = await provider.verifyCompletion({ envelopeId: envelope.providerEnvelopeId, snapshotHash: envelope.snapshotHash })
      if (!proof?.authenticated || proof.envelopeId !== envelope.providerEnvelopeId || proof.snapshotHash !== envelope.snapshotHash || proof.signers?.length !== envelope.snapshot.signerManifest.length || !validTime(proof.completedAt) || Date.parse(proof.completedAt) > Date.parse(now())) fail('invalid_completion_evidence', 'The signing service completion evidence could not be verified.', 502)
      for (const signer of envelope.snapshot.signerManifest) {
        const matches = proof.signers?.filter((item) => item.participantKey === signer.participantKey) || []
        const evidence = matches[0]
        if (matches.length !== 1) fail('incomplete_signer_evidence', 'Each required applicant must sign separately.', 502)
        verifySignerEvidence(evidence, signer, envelope, proof.completedAt)
        const previous = envelope.signerEvidence?.find((entry) => entry.participantKey === signer.participantKey && entry.status === 'signed')
        if (previous && await hashBondApplicationSnapshot(previous) !== await hashBondApplicationSnapshot({ ...evidence, status: 'signed' })) fail('signed_evidence_changed', 'A previously verified signature changed. Review a new version.', 502)
      }
      const bytes = await provider.readCompletedDocument(envelope.providerEnvelopeId)
      if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > 26214400 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-' || fingerprint(bytes) !== proof.documentSha256) fail('invalid_signed_document', 'The completed signed document could not be verified.', 502)
      const original = await repository.saveCompletedOriginal({ envelopeId: envelope.id, bytes, sha256: proof.documentSha256, proof })
      // The repository must atomically finish the immutable evidence and link the
      // canonical submission; a failed CAS must never report completion.
      if (!original?.id) fail('original_not_saved', 'The signed original could not be preserved.', 502)
      const completed = await repository.transition(envelope.id, envelope.revision, { status: 'completed', originalId: original.id, originalSha256: proof.documentSha256, signerEvidence: proof.signers.map((item) => ({ ...item, status: 'signed' })), proof, event: { type: 'completed', at: now() } })
      return publicState(completed, applicant.participantKey)
    },
    async download({ credentials, envelopeId }) {
      const { envelope } = await get(credentials, envelopeId)
      if (envelope.status !== 'completed' || !envelope.originalId) fail('signed_document_not_ready', 'All applicants must finish signing before downloading the completed document.')
      const bytes = await repository.readCompletedOriginal(envelope.originalId)
      if (!(bytes instanceof Uint8Array) || fingerprint(bytes) !== envelope.originalSha256) fail('original_integrity_failed', 'The signed original could not be verified.', 502)
      return { bytes, filename: `signed-application-v${envelope.snapshot.submissionVersion}.pdf` }
    },
  }
}
