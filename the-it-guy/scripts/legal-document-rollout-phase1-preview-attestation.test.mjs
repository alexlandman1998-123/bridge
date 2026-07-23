import assert from 'node:assert/strict'
import {
  attestLegalDocumentRolloutPhase1Preview,
  parsePreviewAttestationCliArguments,
  validateVercelPreviewUrl,
} from './legal-document-rollout-phase1-preview-attestation.mjs'

const RELEASE_ID = 'a'.repeat(40)
const STAGING_ORIGIN = 'https://stagingref001.supabase.co'
// This hostname is never resolved.  Every request below is handled by the
// injected in-memory fetch implementation.
const PREVIEW_URL = 'https://legal-docs-phase1-preview.vercel.app'
const DEPLOYMENT_ID = 'dpl_preview123'
const VERCEL_PROJECT_ID = 'prj_preview123'
const VERCEL_TEAM_ID = 'team_preview123'

function fakeResponse({ url, body, contentType }) {
  const bytes = Buffer.from(body, 'utf8')
  return {
    ok: true,
    status: 200,
    url,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? contentType : null
      },
    },
    async text() {
      return bytes.toString('utf8')
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
  }
}

function createFixtureFetch({
  manifestOrigin = STAGING_ORIGIN,
  metadataUrl = PREVIEW_URL,
  metadataCommitSha = RELEASE_ID,
  metadataProjectId = VERCEL_PROJECT_ID,
  metadataTarget = 'preview',
} = {}) {
  const html = `<!doctype html><html><head><meta name="arch9-release" content="${RELEASE_ID}" /></head><body></body></html>`
  const manifest = JSON.stringify({
    version: 1,
    releaseId: RELEASE_ID,
    supabaseOrigin: manifestOrigin,
    criticalAssets: ['assets/main.css', 'assets/main.js'],
  })
  const routes = new Map([
    ['/', { body: html, contentType: 'text/html; charset=utf-8' }],
    ['/release-manifest.json', { body: manifest, contentType: 'application/json; charset=utf-8' }],
    ['/assets/main.css', { body: 'body{color:#000}', contentType: 'text/css; charset=utf-8' }],
    ['/assets/main.js', { body: 'console.log("fixture")', contentType: 'application/javascript; charset=utf-8' }],
  ])
  const deploymentMetadata = JSON.stringify({
    id: DEPLOYMENT_ID,
    projectId: metadataProjectId,
    url: metadataUrl.replace(/^https:\/\//, ''),
    target: metadataTarget,
    state: 'READY',
    gitSource: { sha: metadataCommitSha },
  })
  const calls = []
  const fetchImpl = async (request, options) => {
    const url = new URL(request)
    calls.push({ origin: url.origin, pathname: url.pathname, options })
    if (url.origin === 'https://api.vercel.com') {
      if (url.pathname !== `/v13/deployments/${DEPLOYMENT_ID}`) return { ok: false, status: 404, url: url.toString(), headers: { get: () => null } }
      return fakeResponse({ url: url.toString(), body: deploymentMetadata, contentType: 'application/json; charset=utf-8' })
    }
    const route = routes.get(url.pathname)
    if (!route) return { ok: false, status: 404, url: url.toString(), headers: { get: () => null } }
    return fakeResponse({ url: url.toString(), ...route })
  }
  return { fetchImpl, calls }
}

const fixture = createFixtureFetch()
const evidence = await attestLegalDocumentRolloutPhase1Preview({
  url: PREVIEW_URL,
  expectedReleaseId: RELEASE_ID,
  expectedSupabaseOrigin: STAGING_ORIGIN,
  deploymentId: DEPLOYMENT_ID,
  vercelProjectId: VERCEL_PROJECT_ID,
  vercelTeamId: VERCEL_TEAM_ID,
  vercelToken: 'fixture-token',
  fetchImpl: fixture.fetchImpl,
  now: '2026-07-22T12:00:00.000Z',
})

assert.equal(evidence.deploymentId, DEPLOYMENT_ID)
assert.equal(evidence.previewUrl, PREVIEW_URL)
assert.equal(evidence.providerMetadata.observed.url, PREVIEW_URL)
assert.equal(evidence.providerMetadata.observed.sourceCommitSha, RELEASE_ID)
assert.match(evidence.providerMetadata.sha256, /^sha256:[0-9a-f]{64}$/)
assert.equal(evidence.receiptPreviewEvidence.previewReleaseId, RELEASE_ID)
assert.equal(evidence.receiptPreviewEvidence.publicSupabaseOrigin, STAGING_ORIGIN)
assert.deepEqual(Object.keys(evidence.receiptPreviewEvidence).sort(), [
  'attestationVersion',
  'attestedAt',
  'deploymentId',
  'previewArtifactTreeSha256',
  'previewIndexHtmlSha256',
  'previewReleaseId',
  'previewReleaseManifestSha256',
  'previewUrl',
  'provider',
  'publicSupabaseOrigin',
].sort())
assert.deepEqual(evidence.receiptPreviewEvidenceRequiredOperatorFields, [
  'deploymentSourceCommitSha',
  'deploymentMetadataEvidenceDigest',
  'attestationEvidenceDigest',
])
assert.equal(evidence.observed.manifestSupabaseOrigin, STAGING_ORIGIN)
assert.equal(evidence.observed.criticalAssets.length, 2)
assert.match(evidence.hashes.previewIndexHtmlSha256, /^sha256:[0-9a-f]{64}$/)
assert.match(evidence.hashes.previewReleaseManifestSha256, /^sha256:[0-9a-f]{64}$/)
assert.match(evidence.hashes.previewArtifactTreeSha256, /^sha256:[0-9a-f]{64}$/)
assert.deepEqual(fixture.calls.map((call) => call.pathname), [`/v13/deployments/${DEPLOYMENT_ID}`, '/', '/release-manifest.json', '/assets/main.css', '/assets/main.js'])
assert.equal(fixture.calls[0].origin, 'https://api.vercel.com')
assert.equal(fixture.calls[0].options.headers.Authorization, 'Bearer fixture-token')
assert.match(fixture.calls[0].origin, /^https:\/\/api\.vercel\.com$/)
for (const call of fixture.calls) {
  assert.equal(call.options.redirect, 'error')
  assert.equal(call.options.credentials, 'omit')
}

let productionFetchCalled = false
await assert.rejects(
  attestLegalDocumentRolloutPhase1Preview({
    url: 'https://app.arch9.co.za',
    expectedReleaseId: RELEASE_ID,
    expectedSupabaseOrigin: STAGING_ORIGIN,
    deploymentId: DEPLOYMENT_ID,
    fetchImpl: async () => {
      productionFetchCalled = true
      throw new Error('must not run')
    },
  }),
  /known production host/i,
)
assert.equal(productionFetchCalled, false, 'Production-host validation must occur before any request.')

const mismatchedOriginFixture = createFixtureFetch({ manifestOrigin: 'https://otherstage001.supabase.co' })
await assert.rejects(
  attestLegalDocumentRolloutPhase1Preview({
    url: PREVIEW_URL,
    expectedReleaseId: RELEASE_ID,
    expectedSupabaseOrigin: STAGING_ORIGIN,
    deploymentId: DEPLOYMENT_ID,
    vercelProjectId: VERCEL_PROJECT_ID,
    vercelToken: 'fixture-token',
    fetchImpl: mismatchedOriginFixture.fetchImpl,
  }),
  /supabaseOrigin does not equal/i,
)
assert.deepEqual(mismatchedOriginFixture.calls.map((call) => call.pathname), [`/v13/deployments/${DEPLOYMENT_ID}`, '/', '/release-manifest.json'])

const mismatchedProviderFixture = createFixtureFetch({ metadataCommitSha: 'b'.repeat(40) })
await assert.rejects(
  attestLegalDocumentRolloutPhase1Preview({
    url: PREVIEW_URL,
    expectedReleaseId: RELEASE_ID,
    expectedSupabaseOrigin: STAGING_ORIGIN,
    deploymentId: DEPLOYMENT_ID,
    vercelProjectId: VERCEL_PROJECT_ID,
    vercelToken: 'fixture-token',
    fetchImpl: mismatchedProviderFixture.fetchImpl,
  }),
  /does not bind the preview to --expected-release-id/i,
)
assert.deepEqual(mismatchedProviderFixture.calls.map((call) => call.pathname), [`/v13/deployments/${DEPLOYMENT_ID}`])

assert.throws(
  () => validateVercelPreviewUrl('https://legal-docs-phase1-preview.vercel.app/release-manifest.json'),
  /without a path/i,
)
assert.deepEqual(
  parsePreviewAttestationCliArguments([
    `--url=${PREVIEW_URL}`,
    `--expected-release-id=${RELEASE_ID}`,
    `--expected-supabase-origin=${STAGING_ORIGIN}`,
    `--deployment-id=${DEPLOYMENT_ID}`,
    `--vercel-project-id=${VERCEL_PROJECT_ID}`,
    `--team-id=${VERCEL_TEAM_ID}`,
  ]),
  {
    url: PREVIEW_URL,
    expectedReleaseId: RELEASE_ID,
    expectedSupabaseOrigin: STAGING_ORIGIN,
    deploymentId: DEPLOYMENT_ID,
    vercelProjectId: VERCEL_PROJECT_ID,
    vercelTeamId: VERCEL_TEAM_ID,
  },
)

console.log('Legal-document rollout Phase 1 preview attestation tests passed.')
