import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildSellerReleaseCandidate, sellerCandidateDigest, verifySellerReleaseCandidate,
  createSellerReleaseDecision, assessSellerReleaseReadiness, SELLER_RELEASE_CHECKS } from './seller-document-release-candidate.mjs'
import { collectSellerSigningBundle, verifyRemoteSigningBundle, verifyRetiredHandlerSnapshots,
  verifyDeployedFrontend } from './seller-document-release-check.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const bundle = await collectSellerSigningBundle(root)
const deployed = () => ({ ...structuredClone(bundle), slug: bundle.name, status: 'ACTIVE', version: 12 })

test('bundle follows the actual entrypoint through nested branding, models and correction imports', () => {
  for (const name of ['sellerSigningDocumentCorrections.js', 'sellerReviewedDocumentVersions.js',
    'sellerMandateWordingMarkup.js', 'sellerMandateDocumentMarkup.js', 'ficaDeclarationDocumentMarkup.js',
    'ficaDeclarationDocumentModel.js', 'sellerFicaDueDiligenceMarkup.js', 'onboardingBranding.js', 'propertyDisclosure.js', 'deno.json']) {
    assert.ok(bundle.files.some(file => file.name.endsWith('/' + name)), name)
  }
  assert.ok(bundle.files.length > 15, 'Must reject the old 15-file production bundle')
  assert.equal(verifyRemoteSigningBundle(bundle, deployed()).filesVerified, bundle.files.length)
})

test('unchanged entrypoint cannot conceal stale branding or a missing renderer dependency', () => {
  const stale = deployed()
  stale.files.find(file => file.name.endsWith('/onboardingBranding.js')).content += '\n// old deployment\n'
  assert.throws(() => verifyRemoteSigningBundle(bundle, stale), /Stale signing dependency/)
  const missing = deployed()
  missing.files = missing.files.filter(file => !file.name.endsWith('/sellerMandateWordingMarkup.js'))
  assert.throws(() => verifyRemoteSigningBundle(bundle, missing), /file set differs/)
})

test('wrong function, inactive deployment and changed seller gateway are rejected', () => {
  for (const patch of [{ slug: 'other-function' }, { status: 'FAILED' }, { verify_jwt: true }]) {
    assert.throws(() => verifyRemoteSigningBundle(bundle, { ...deployed(), ...patch }))
  }
})

test('retired handlers require the pure 410 bundle and preserve gateway authentication', async () => {
  const name = 'generate-mandate'
  const entry = `supabase/functions/${name}/index.ts`
  const shared = 'supabase/functions/_shared/retiredDocumentGenerator.ts'
  const remote = { slug: name, status: 'ACTIVE', version: 92, verify_jwt: true, files: [
    { name: entry, content: await readFile(path.join(root, entry), 'utf8') },
    { name: shared, content: await readFile(path.join(root, shared), 'utf8') },
  ] }
  const snapshot = value => ({ inventory: [{ slug: name, version: 92 }], bundles: { [name]: value } })
  assert.equal((await verifyRetiredHandlerSnapshots(root, snapshot(remote))).verified.length, 1)
  await assert.rejects(verifyRetiredHandlerSnapshots(root, {}), /complete deployed function inventory/)
  await assert.rejects(verifyRetiredHandlerSnapshots(root, { inventory: [{ slug: name, version: 92 }], bundles: {} }), /Missing retirement bundle/)
  await assert.rejects(verifyRetiredHandlerSnapshots(root, snapshot({ ...remote, verify_jwt: false })), /authentication changed/)
  await assert.rejects(verifyRetiredHandlerSnapshots(root, snapshot({ ...remote, files: [
    ...remote.files, { name: 'old-renderer.ts', content: 'legacy renderer' },
  ] })), /Legacy dependencies/)
})

test('frontend verification rejects stale releases, protected HTML and inconsistent cache responses', async () => {
  const id = 'release-test-commit'
  const responses = (manifestId = id, htmlId = id) => async url => String(url).includes('/release-manifest.json')
    ? new Response(JSON.stringify({ releaseId: manifestId }), { status: 200 })
    : new Response(`<meta name="arch9-release" content="${htmlId}" />`, { status: 200 })
  assert.equal((await verifyDeployedFrontend('https://app.example.test', id, responses())).releaseId, id)
  await assert.rejects(verifyDeployedFrontend('https://app.example.test', id, responses('old')), /different release/)
  await assert.rejects(verifyDeployedFrontend('https://app.example.test', id, responses(id, 'old')), /marker differs/)
  await assert.rejects(verifyDeployedFrontend('https://app.example.test', id, async () => new Response('Sign in', { status: 401 })), /HTTP 401/)
  await assert.rejects(verifyDeployedFrontend('https://app.example.test', '', responses()), /expected-release-id/)
})

const candidate = await buildSellerReleaseCandidate(root, bundle)

test('sign-off pack identifies all exact wording, PDF proofs, app source and both migration dependencies', () => {
  assert.equal(candidate.wording.length, 3)
  assert.equal(candidate.proofs.length, 15)
  assert.equal(candidate.proofs.reduce((sum, proof) => sum + proof.pages, 0), 100)
  assert.ok(candidate.proofs.every(proof => proof.synthetic === true && /^[a-f0-9]{64}$/.test(proof.sha256)))
  assert.equal(candidate.migrations.length, 2)
  for (const name of ['ClientPortal.jsx', 'privateListingService.js', 'SellerDocumentSigning.jsx',
    'sellerMandateWordingRelease.js', 'sellerDocumentSignatureEvidence.js']) assert.ok(candidate.source.files.some(file => file.name.endsWith('/' + name)), name)
  assert.equal(candidate.candidateDigest, sellerCandidateDigest(candidate))
  assert.equal(verifySellerReleaseCandidate(candidate, candidate), true)
})

test('a changed source, PDF, migration or QA result invalidates the saved sign-off candidate', () => {
  for (const change of [
    value => { value.source.files[0].sha256 = '0'.repeat(64) },
    value => { value.proofs[0].sha256 = '1'.repeat(64) },
    value => { value.migrations[0].sha256 = '2'.repeat(64) },
    value => { value.localAcceptance.pages += 1 },
    value => { value.wording[0].approval.reference = 'older-template-approval' },
  ]) {
    const changed = structuredClone(candidate)
    change(changed)
    assert.throws(() => verifySellerReleaseCandidate(changed, candidate), /evidence changed/)
    changed.candidateDigest = sellerCandidateDigest(changed)
    assert.throws(() => verifySellerReleaseCandidate(changed, candidate), /stale/)
  }
})

test('preparing a sign-off template grants no agency approval, hosted acceptance or release', () => {
  const decision = createSellerReleaseDecision(candidate)
  assert.equal(decision.status, 'pending')
  assert.equal(decision.design.status, 'pending')
  assert.deepEqual(decision.agencySchedules, [])
  assert.ok(Object.values(decision.checks).every(check => check.status === 'pending'))
  const result = assessSellerReleaseReadiness(candidate, decision)
  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some(value => value.includes('schedule approval')))
  assert.ok(result.blockers.some(value => value.startsWith('migrationReplay')))
  assert.ok(result.blockers.some(value => value.startsWith('hostedAcceptance')))
  assert.equal(result.liveMutationPerformedByCheck, false)
  assert.equal(result.deploymentPerformedByCheck, false)
})

function syntheticReleaseEvidence() {
  const current = structuredClone(candidate)
  current.localAcceptance.sourceMatches = true
  current.localAcceptance.localRollbackVerified = true
  const decision = createSellerReleaseDecision(current)
  const time = '2026-10-04T00:00:00Z'
  Object.assign(decision, { status: 'approved', decidedAt: time, releaseOwner: 'synthetic-release-owner', reference: 'TEST-ONLY-RELEASE' })
  Object.assign(decision.design, { status: 'approved', reviewer: 'synthetic-designer', reference: 'TEST-ONLY-DESIGN', reviewedAt: time })
  for (const key of SELLER_RELEASE_CHECKS) Object.assign(decision.checks[key], { status: 'passed', reference: `TEST-ONLY-${key}`, checkedAt: time })
  const agencies = current.wording.map((wording, index) => ({ ...wording.approval,
    agencySchedulesDigest: `sha256:${String(index).repeat(64)}`, reference: 'TEST-ONLY-AGENCY-SCHEDULE' }))
  decision.agencySchedules = structuredClone(agencies)
  return { current, decision, agencies, deployed: { signingVerified: true, retirementVerified: true, frontendVerified: true } }
}

test('release review requires every actual evidence category and registered agency schedule', () => {
  const fixture = syntheticReleaseEvidence()
  const assess = item => assessSellerReleaseReadiness(item.current, item.decision, item.deployed, item.agencies)
  assert.equal(assess(fixture).status, 'ready_for_release_review')
  for (const key of SELLER_RELEASE_CHECKS) {
    const changed = structuredClone(fixture)
    changed.decision.checks[key].status = 'pending'
    assert.equal(assess(changed).status, 'blocked', key)
  }
  for (const key of Object.keys(fixture.deployed)) {
    const changed = structuredClone(fixture)
    changed.deployed[key] = false
    assert.equal(assess(changed).status, 'blocked', key)
  }
  assert.equal(assessSellerReleaseReadiness(fixture.current, fixture.decision, fixture.deployed).status, 'blocked', 'Synthetic schedule approval cannot enter the real registry')
})

test('wrong project, candidate, wording, schedule, design and stale or future evidence all remain blocked', () => {
  for (const change of [
    value => { value.decision.projectRef = 'wrong-project' },
    value => { value.decision.candidateDigest = 'sha256:' + '0'.repeat(64) },
    value => { value.decision.wording[0].wordingDigest = 'sha256:' + '0'.repeat(64) },
    value => { value.decision.agencySchedules[0].agencySchedulesDigest = 'sha256:' + '9'.repeat(64) },
    value => { value.decision.design.candidateDigest = 'old-proof' },
    value => { value.decision.checks.hostedAcceptance.sourceFingerprint = 'old-source' },
    value => { value.decision.checks.schemaCatalog.checkedAt = '2099-01-01' },
    value => { value.current.localAcceptance.sourceMatches = false },
  ]) {
    const fixture = syntheticReleaseEvidence()
    change(fixture)
    assert.equal(assessSellerReleaseReadiness(fixture.current, fixture.decision, fixture.deployed, fixture.agencies).status, 'blocked')
  }
})
