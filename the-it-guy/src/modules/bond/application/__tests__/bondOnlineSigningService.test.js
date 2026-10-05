// @vitest-environment node
import { createHash } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { createBondOnlineSigningService } from '../../../../../server/services/bond/bondOnlineSigningService.js'
import { createBondOnlineSigningResponse } from '../../../../../server/services/bond/bondOnlineSigningApi.js'
import { createBondPermissionReviewPolicy, getBondPermissionReviewContent } from '../submission/bondApplicationPermissionPolicy.js'
import { sealBondReviewedVersion } from '../submission/bondApplicationReviewedVersion.js'
const time = '2026-10-03T20:00:00Z'
let policy, snapshot, repo, provider, service, stored, original, stale, currentTime
const evidence = (version) => ({ status: 'approved', policyVersion: version, approvedBy: 'Fixture reviewer', approvedAt: '2026-10-03T12:00:00Z', reference: 'Fixture approval' })
beforeEach(async () => {
  currentTime = time; stale = false; stored = null; original = null
  policy = createBondPermissionReviewPolicy(); policy.status = 'approved'
  policy.originator = { id: 'fixture', legalName: 'Fixture Originator', privacyContact: 'Fixture Officer' }
  for (const field of Object.keys(policy.privacy)) if (typeof policy.privacy[field] === 'string') policy.privacy[field] = 'Fixture reviewed reference'
  for (const category of Object.values(policy.privacy.retention)) for (const field of Object.keys(category)) category[field] = 'Fixture reviewed rule'
  Object.assign(policy.privacy.statementHandoff, { provider: 'fixture', receiptEvidence: 'fixture' })
  for (const method of Object.values(policy.signingMethods)) for (const key of Object.keys(method)) method[key] = 'fixture'
  policy.signingMethods.online.provider = 'fixture-provider'
  policy.banks = [{ id: 'bank', name: 'Fixture Bank', requiredForms: [], methods: { online: evidence(policy.version), download_sign_upload: evidence(policy.version) } }]
  for (const role of Object.keys(policy.approvals)) policy.approvals[role] = evidence(policy.version)
  const content = getBondPermissionReviewContent(policy)
  for (const approval of Object.values(policy.approvals)) approval.reviewedContent = content
  for (const approval of Object.values(policy.banks[0].methods)) approval.reviewedContent = content
  const signers = ['primary', 'co'].map((key) => ({ participantKey: key, participantRole: key === 'primary' ? 'primary_applicant' : 'co_applicant', fullName: `${key} Fixture`, email: `${key}@example.test`, identityReference: `FIXTURE-${key}` }))
  snapshot = await sealBondReviewedVersion({ application: { id: 'app', transactionId: 'tx' }, createdAt: '2026-10-03T18:00:00Z', submissionVersion: 1, selectedBanks: ['bank'], signerManifest: signers, participants: signers.map((signer) => ({ participantKey: signer.participantKey, role: signer.participantRole, answers: {}, declarations: policy.clauses })) })
  repo = {
    freezeVersion: vi.fn(async () => ({ id: 'version', sourceRevision: 1, snapshot })), findEnvelope: vi.fn(async () => stored), findCurrentEnvelope: vi.fn(async () => stored),
    createEnvelope: vi.fn(async (value) => { stored = { ...value, id: 'envelope', revision: 1, sessions: [] }; return stored }), getEnvelope: vi.fn(async (id) => id === stored?.id ? structuredClone(stored) : null),
    assertCurrent: vi.fn(async () => { if (stale) throw new Error('Application changed') }), consumeVerificationStart: vi.fn(async () => true),
    transition: vi.fn(async (id, revision, value) => {
      if (revision !== stored.revision) throw new Error('Concurrent signing update; retry')
      if (value.session) stored.sessions = [...stored.sessions.filter((session) => session.id !== value.session.id), value.session]
      const { session: _session, ...changes } = value
      stored = { ...stored, ...changes, revision: revision + 1 }; return stored
    }),
    saveCompletedOriginal: vi.fn(async ({ bytes }) => { original = bytes; return { id: 'original' } }), readCompletedOriginal: vi.fn(async () => original),
  }
  provider = { id: 'fixture-provider', allowedOrigins: ['https://sign.example.test'], createEnvelope: vi.fn(async () => ({ id: 'provider-envelope' })),
    openSession: vi.fn(async ({ participantKey }) => ({ id: `session-${participantKey}`, status: 'awaiting_code', expiresAt: '2026-10-03T20:10:00Z' })),
    verifyCode: vi.fn(async ({ participantKey, snapshotHash }) => ({ verified: true, verifiedAt: time, participantKey, snapshotHash, signingUrl: 'https://sign.example.test/signer' })),
    readEnvelope: vi.fn(async () => ({ status: 'pending' })), readCompletedDocument: vi.fn(async () => new TextEncoder().encode('%PDF-1.7 fixture completed original')), verifyCompletion: vi.fn(),
  }
  service = createBondOnlineSigningService({ policy, provider, repository: repo, authorizeApplicant: async (credentials) => credentials === 'revoked' ? null : { applicationId: credentials === 'foreign' ? 'other' : 'app', participantKey: credentials === 'co' ? 'co' : 'primary' }, releaseEnabled: true, classificationApproved: () => true, now: () => currentTime })
})
const consent = () => Object.fromEntries(policy.clauses.map((clause) => [clause.key, clause.required]))
const prepare = () => service.prepare({ credentials: 'primary', expectedRevision: 1 })
const start = (credentials = 'primary') => service.start({ credentials, envelopeId: 'envelope', consent: consent(), intentToSign: true })
async function completion() {
  provider.readEnvelope.mockResolvedValue({ status: 'completed' })
  const bytes = await provider.readCompletedDocument()
  const proof = { authenticated: true, envelopeId: stored.providerEnvelopeId, snapshotHash: stored.snapshotHash, completedAt: time, documentSha256: createHash('sha256').update(bytes).digest('hex'), signers: snapshot.signerManifest.map((signer) => ({ participantKey: signer.participantKey, verifiedEmail: signer.email, verificationMethod: 'fixture', identityVerified: true, verifiedAt: '2026-10-03T19:00:00Z', signedAt: '2026-10-03T19:30:00Z', snapshotHash: stored.snapshotHash, intentToSign: true, consent: consent(), verificationReference: 'fixture-verification', signatureReference: 'fixture-signature' })) }
  provider.verifyCompletion.mockResolvedValue(proof); return proof
}
it('production is disabled and browser flags cannot approve or configure it', async () => {
  expect(createBondOnlineSigningService().availability().available).toBe(false)
  const result = await createBondOnlineSigningResponse({ method: 'POST', body: { action: 'prepare', releaseEnabled: true, approved: true, provider: 'fake' } })
  expect(result.status).toBe(503); expect(provider.createEnvelope).not.toHaveBeenCalled()
  policy.clauses[0].text += ' changed'; expect(service.availability().available).toBe(false)
})
it('freezes once with provider idempotency and only returns the applicant’s own financial review', async () => {
  const prepared = await prepare(); await prepare()
  expect(provider.createEnvelope).toHaveBeenCalledTimes(1)
  expect(provider.createEnvelope.mock.calls[0][0].idempotencyKey).toBe('version')
  expect(prepared.review.participants.map((item) => item.participantKey)).toEqual(['primary'])
  expect(prepared.requiredSigners).toBe(2)
  expect((await service.resume({ credentials: 'co' })).review.participants[0].participantKey).toBe('co')
})
it('requires explicit permissions and intent; a primary applicant cannot verify a co-applicant session', async () => {
  await prepare()
  await expect(service.start({ credentials: 'primary', envelopeId: 'envelope', consent: {}, intentToSign: true })).rejects.toMatchObject({ code: 'consent_required' })
  await start('co')
  await expect(service.verify({ credentials: 'primary', envelopeId: 'envelope', sessionId: 'session-co', code: '123456' })).rejects.toMatchObject({ code: 'invalid_signing_session' })
  expect(provider.verifyCode).not.toHaveBeenCalled()
})
it('expires codes, caps failed attempts and does not store the code', async () => {
  await prepare(); await start()
  provider.verifyCode.mockResolvedValue({ verified: false })
  for (let attempt = 0; attempt < 5; attempt++) await expect(service.verify({ credentials: 'primary', envelopeId: 'envelope', sessionId: 'session-primary', code: '123456' })).rejects.toMatchObject({ code: 'verification_failed' })
  await expect(service.verify({ credentials: 'primary', envelopeId: 'envelope', sessionId: 'session-primary', code: '123456' })).rejects.toMatchObject({ code: 'verification_locked' })
  expect(JSON.stringify(stored)).not.toContain('123456'); expect(provider.verifyCode).toHaveBeenCalledTimes(5)
  currentTime = '2026-10-03T21:00:00Z'
  await expect(service.verify({ credentials: 'primary', envelopeId: 'envelope', sessionId: 'session-primary', code: '123456' })).rejects.toMatchObject({ code: 'verification_expired' })
})
it('resumes interrupted signing and verifies a code before opening an allowlisted signing URL', async () => {
  await prepare(); await start()
  expect((await service.resume({ credentials: 'primary' })).status).toBe('awaiting_signatures')
  expect((await service.verify({ credentials: 'primary', envelopeId: 'envelope', sessionId: 'session-primary', code: '123456' })).signingUrl).toBe('https://sign.example.test/signer')
  expect(stored.sessions[0].status).toBe('verified')
})
it('rejects stale versions, revoked links, unrelated applications and unsafe signing links', async () => {
  await prepare()
  await expect(service.status({ credentials: 'foreign', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'signer_access_denied' })
  await expect(service.status({ credentials: 'revoked', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'signer_access_denied' })
  stale = true; await expect(start()).rejects.toThrow('Application changed'); stale = false
  await start(); provider.verifyCode.mockImplementation(async (args) => ({ verified: true, verifiedAt: time, participantKey: args.participantKey, snapshotHash: args.snapshotHash, signingUrl: 'https://attacker.example/sign' }))
  await expect(service.verify({ credentials: 'primary', envelopeId: 'envelope', sessionId: 'session-primary', code: '123456' })).rejects.toMatchObject({ code: 'invalid_signing_url' })
})
it('does not accept provider completion with a missing joint signer or altered content', async () => {
  await prepare(); const proof = await completion()
  provider.verifyCompletion.mockResolvedValue({ ...proof, signers: proof.signers.slice(0, 1) })
  await expect(service.status({ credentials: 'primary', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'invalid_completion_evidence' })
  provider.verifyCompletion.mockResolvedValue({ ...proof, snapshotHash: 'altered' })
  await expect(service.status({ credentials: 'primary', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'invalid_completion_evidence' })
  expect(repo.saveCompletedOriginal).not.toHaveBeenCalled()
})
it('preserves the verified completed PDF unchanged and completes idempotently only after every signer', async () => {
  await prepare(); const proof = await completion(); const result = await service.status({ credentials: 'co', envelopeId: 'envelope' })
  expect(result.status).toBe('completed'); expect(result.completedSigners).toBe(2)
  expect((await service.download({ credentials: 'co', envelopeId: 'envelope' })).bytes).toEqual(original)
  expect(stored.proof).toEqual(proof)
  await service.status({ credentials: 'primary', envelopeId: 'envelope' }); expect(repo.saveCompletedOriginal).toHaveBeenCalledTimes(1)
  await expect(start()).rejects.toMatchObject({ code: 'already_signed' })
  original[0] = 0; await expect(service.download({ credentials: 'co', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'original_integrity_failed' })
})
it('fails closed on missing verification/consent evidence, invalid PDF and persistence failures', async () => {
  await prepare(); const proof = await completion()
  proof.signers[0].consent = {}; await expect(service.status({ credentials: 'primary', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'incomplete_signer_evidence' })
  await completion(); provider.readCompletedDocument.mockResolvedValue(new TextEncoder().encode('%PDF-altered')); await expect(service.status({ credentials: 'primary', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'invalid_signed_document' })
  provider.readCompletedDocument.mockResolvedValue(new TextEncoder().encode('%PDF-1.7 fixture completed original')); repo.transition.mockRejectedValue(new Error('Database unavailable'))
  await expect(service.status({ credentials: 'primary', envelopeId: 'envelope' })).rejects.toThrow('Database unavailable'); expect(stored.status).toBe('awaiting_signatures')
})
it('enforces a challenge rate limit across new sessions', async () => {
  await prepare(); repo.consumeVerificationStart.mockResolvedValue(false)
  await expect(start()).rejects.toMatchObject({ code: 'verification_rate_limited' }); expect(provider.openSession).not.toHaveBeenCalled()
})
it('tracks a separately verified joint signer without completing the whole envelope', async () => {
  await prepare(); const proof = await completion()
  provider.readEnvelope.mockResolvedValue({ ...proof, status: 'pending', signers: proof.signers.slice(0, 1) })
  const result = await service.status({ credentials: 'primary', envelopeId: 'envelope' })
  expect(result.signerStatus).toBe('signed'); expect(result.completedSigners).toBe(1); expect(result.documentAvailable).toBe(false)
  await expect(start()).rejects.toMatchObject({ code: 'already_signed' })
  expect((await service.resume({ credentials: 'co' })).signerStatus).toBe('awaiting_signature')
})
it('never reports completion when original persistence returned no file reference', async () => {
  await prepare(); await completion(); repo.saveCompletedOriginal.mockResolvedValue({})
  await expect(service.status({ credentials: 'primary', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'original_not_saved' })
  expect(stored.status).toBe('awaiting_signatures')
})
it('does not expose provider or database error details through the public endpoint', async () => {
  provider.createEnvelope.mockRejectedValue(Object.assign(new Error('private provider detail'), { code: 'SDK_ERROR', status: 401 }))
  const response = await createBondOnlineSigningResponse({ method: 'POST', headers: { 'x-bridge-client-portal-token': 'primary' }, body: { action: 'prepare', expectedRevision: 1 } }, service)
  expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain('private provider detail')
})
it('keeps a verified individual signature immutable and avoids duplicate progress writes', async () => {
  await prepare(); const proof = await completion()
  provider.readEnvelope.mockResolvedValue({ ...proof, status: 'pending', signers: proof.signers.slice(0, 1) })
  await service.status({ credentials: 'primary', envelopeId: 'envelope' })
  const revision = stored.revision
  await service.status({ credentials: 'co', envelopeId: 'envelope' }); expect(stored.revision).toBe(revision)
  const altered = structuredClone(proof); altered.signers[0].signatureReference = 'changed-signature'
  provider.readEnvelope.mockResolvedValue({ status: 'completed' }); provider.verifyCompletion.mockResolvedValue(altered)
  await expect(service.status({ credentials: 'co', envelopeId: 'envelope' })).rejects.toMatchObject({ code: 'signed_evidence_changed' })
})
