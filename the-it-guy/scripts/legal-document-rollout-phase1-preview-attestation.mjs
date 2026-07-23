import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Phase 1 preview attestation deliberately has no configuration or network
 * side effects when it is imported.  A real request can only be made by an
 * explicit CLI invocation with the preview, frozen source, staging origin,
 * deployment, and Vercel-project bindings supplied.
 */
export const LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION =
  'legal_document_rollout_phase1_preview_attestation_v2'

export const KNOWN_PRODUCTION_HOSTS = Object.freeze([
  'arch9.co.za',
  'www.arch9.co.za',
  'app.arch9.co.za',
  'admin.arch9.co.za',
  'bridgenine.co.za',
  'www.bridgenine.co.za',
  'app.bridgenine.co.za',
  // These are historical/direct Vercel production aliases.  A preview must
  // use its generated deployment hostname instead.
  'arch9.vercel.app',
  'bridgenine.vercel.app',
  'bridge-nine.vercel.app',
])

const KNOWN_PRODUCTION_HOST_SET = new Set(KNOWN_PRODUCTION_HOSTS)
const CLI_OPTION_NAMES = Object.freeze([
  'url',
  'expected-release-id',
  'expected-supabase-origin',
  'deployment-id',
  'vercel-project-id',
  'team-id',
])
const REQUIRED_CLI_OPTION_NAMES = Object.freeze([
  'url',
  'expected-release-id',
  'expected-supabase-origin',
  'deployment-id',
  'vercel-project-id',
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function sha256Digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function error(message) {
  throw new Error(`Phase 1 preview attestation blocked: ${message}`)
}

function requireNonBlank(value, label) {
  const normalized = text(value)
  if (!normalized) error(`${label} is required.`)
  return normalized
}

function canonicalHttpsOrigin(value, label) {
  const raw = requireNonBlank(value, label)
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    error(`${label} must be a valid HTTPS origin.`)
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password ||
    parsed.pathname !== '/' || parsed.search || parsed.hash || raw !== parsed.origin) {
    error(`${label} must be an exact credential-free HTTPS origin without a path, query, fragment, or trailing slash.`)
  }
  return parsed.origin
}

/**
 * Validates that the attestation target is a generated Vercel preview host,
 * not an application production hostname or the direct project alias.
 */
export function validateVercelPreviewUrl(value) {
  const raw = requireNonBlank(value, '--url')
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    error('--url must be a valid HTTPS Vercel preview URL.')
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password ||
    (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
    error('--url must be a credential-free HTTPS origin without a path, query, or fragment.')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (KNOWN_PRODUCTION_HOST_SET.has(hostname)) {
    error(`--url points at known production host ${hostname}; Phase 1 only permits a Vercel preview deployment.`)
  }

  const labels = hostname.split('.')
  const deploymentLabel = labels.length === 3 && labels[1] === 'vercel' && labels[2] === 'app' ? labels[0] : ''
  if (!deploymentLabel || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(deploymentLabel) || !deploymentLabel.includes('-')) {
    error('--url must use a generated Vercel preview hostname such as https://project-git-branch-team.vercel.app.')
  }
  return new URL(parsed.origin)
}

export function validateExpectedReleaseId(value) {
  const releaseId = requireNonBlank(value, '--expected-release-id')
  if (!/^[0-9a-f]{40}$/i.test(releaseId)) {
    error('--expected-release-id must be the full 40-character frozen Git commit SHA.')
  }
  return releaseId
}

export function validateExpectedSupabaseOrigin(value) {
  const origin = canonicalHttpsOrigin(value, '--expected-supabase-origin')
  const hostname = new URL(origin).hostname
  if (!/^[a-z0-9]{8,64}\.supabase\.co$/.test(hostname)) {
    error('--expected-supabase-origin must be exactly https://<project-ref>.supabase.co.')
  }
  return origin
}

export function validateDeploymentId(value) {
  const deploymentId = requireNonBlank(value, '--deployment-id')
  if (!/^dpl_[A-Za-z0-9_-]{6,}$/.test(deploymentId)) {
    error('--deployment-id must be a Vercel deployment identifier beginning with dpl_.')
  }
  return deploymentId
}

export function validateVercelProjectId(value) {
  const projectId = requireNonBlank(value, '--vercel-project-id')
  if (!/^prj_[A-Za-z0-9_-]{6,}$/.test(projectId)) {
    error('--vercel-project-id must be a Vercel project identifier beginning with prj_.')
  }
  return projectId
}

export function validateVercelTeamId(value) {
  const teamId = text(value)
  if (teamId && !/^team_[A-Za-z0-9_-]{6,}$/.test(teamId)) {
    error('--team-id must be a Vercel team identifier beginning with team_.')
  }
  return teamId || null
}

function parseMetaAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match?.[2] || ''
}

export function readIndexReleaseId(indexHtml) {
  const tags = String(indexHtml || '').match(/<meta\b[^>]*>/gi) || []
  const marker = tags.find((tag) => parseMetaAttribute(tag, 'name').toLowerCase() === 'arch9-release')
  const releaseId = marker ? parseMetaAttribute(marker, 'content').trim() : ''
  if (!releaseId) error('The preview index.html is missing its arch9-release marker.')
  return releaseId
}

function assertSameOrigin(response, expectedOrigin, label) {
  const responseUrl = text(response?.url)
  if (!responseUrl) return
  let actualOrigin
  try {
    actualOrigin = new URL(responseUrl).origin
  } catch {
    error(`${label} returned an invalid response URL.`)
  }
  if (actualOrigin !== expectedOrigin) {
    error(`${label} redirected outside the approved Vercel preview origin.`)
  }
}

function contentType(response) {
  return text(response?.headers?.get?.('content-type')).toLowerCase()
}

function requireContentType(response, expected, label) {
  const actual = contentType(response)
  if (!actual.includes(expected)) {
    error(`${label} returned unexpected content type ${actual || '(missing)'}.`)
  }
}

async function fetchRequired(fetchImpl, url, expectedOrigin, label) {
  let response
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Accept: '*/*',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (cause) {
    error(`${label} could not be fetched (${cause instanceof Error ? cause.message : 'request failed'}).`)
  }
  if (!response || !response.ok) {
    error(`${label} returned HTTP ${Number.isInteger(response?.status) ? response.status : 'unknown'}.`)
  }
  assertSameOrigin(response, expectedOrigin, label)
  return response
}

function deploymentPreviewOrigin(value) {
  const raw = requireNonBlank(value, 'Vercel deployment url')
  const url = raw.startsWith('https://') ? raw : `https://${raw}`
  return validateVercelPreviewUrl(url).origin
}

function deploymentSourceCommit(metadata) {
  const meta = metadata?.meta && typeof metadata.meta === 'object' ? metadata.meta : {}
  const gitSource = metadata?.gitSource && typeof metadata.gitSource === 'object' ? metadata.gitSource : {}
  const candidates = [
    gitSource.sha,
    meta.githubCommitSha,
    meta.gitlabCommitSha,
    meta.bitbucketCommitSha,
    meta.gitCommitSha,
  ].map(text)
  return candidates.find((value) => /^[0-9a-f]{40}$/i.test(value)) || ''
}

function validateVercelDeploymentMetadata(metadata, {
  deploymentId,
  projectId,
  previewUrl,
  expectedReleaseId,
} = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    error('Vercel deployment metadata must be a JSON object.')
  }
  if (text(metadata.id) !== deploymentId) error('Vercel deployment metadata id does not equal --deployment-id.')
  if (text(metadata.projectId) !== projectId) error('Vercel deployment metadata projectId does not equal --vercel-project-id.')
  if (deploymentPreviewOrigin(metadata.url) !== previewUrl.origin) error('Vercel deployment metadata url does not equal the preview URL.')
  const target = text(metadata.target).toLowerCase()
  if (target && target !== 'preview') error('Vercel deployment metadata must identify a preview deployment, never production.')
  if (text(metadata.state).toUpperCase() !== 'READY') error('Vercel deployment metadata must be in READY state.')
  const sourceCommitSha = deploymentSourceCommit(metadata)
  if (sourceCommitSha.toLowerCase() !== expectedReleaseId.toLowerCase()) {
    error('Vercel deployment metadata does not bind the preview to --expected-release-id.')
  }
  return {
    id: text(metadata.id),
    projectId: text(metadata.projectId),
    url: deploymentPreviewOrigin(metadata.url),
    target: target || 'preview',
    state: text(metadata.state).toUpperCase(),
    sourceCommitSha,
  }
}

async function fetchVercelDeploymentMetadata({ fetchImpl, token, deploymentId, projectId, teamId, previewUrl, expectedReleaseId }) {
  const bearerToken = text(token)
  if (!bearerToken) error('VERCEL_TOKEN is required to provider-bind a Phase 1 preview attestation.')
  const endpoint = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`)
  if (teamId) endpoint.searchParams.set('teamId', teamId)
  let response
  try {
    response = await fetchImpl(endpoint, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (cause) {
    error(`Vercel deployment metadata could not be fetched (${cause instanceof Error ? cause.message : 'request failed'}).`)
  }
  if (!response || !response.ok) {
    error(`Vercel deployment metadata returned HTTP ${Number.isInteger(response?.status) ? response.status : 'unknown'}.`)
  }
  requireContentType(response, 'json', 'Vercel deployment metadata')
  const raw = await response.text()
  let metadata
  try {
    metadata = JSON.parse(raw)
  } catch {
    error('Vercel deployment metadata is not valid JSON.')
  }
  return {
    observed: validateVercelDeploymentMetadata(metadata, { deploymentId, projectId, previewUrl, expectedReleaseId }),
    sha256: sha256Digest(Buffer.from(raw, 'utf8')),
    apiUrl: endpoint.toString(),
  }
}

function normalizeCriticalAssetPath(value) {
  const raw = text(value)
  if (!raw || raw !== value || raw.startsWith('/') || raw.includes('\\') || raw.includes('?') || raw.includes('#') || raw.includes('..')) {
    error(`The release manifest contains an unsafe critical asset path: ${JSON.stringify(value)}.`)
  }
  if (!raw.startsWith('assets/')) {
    error(`The release manifest critical asset must be inside assets/: ${raw}.`)
  }
  const url = new URL(raw, 'https://preview.invalid/')
  if (url.pathname !== `/${raw}` || url.search || url.hash) {
    error(`The release manifest contains a non-canonical critical asset path: ${raw}.`)
  }
  return raw
}

function validateManifest(manifest, expectedReleaseId, expectedSupabaseOrigin) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    error('release-manifest.json must contain a JSON object.')
  }
  if (text(manifest.releaseId) !== expectedReleaseId) {
    error(`release-manifest.json releaseId does not equal --expected-release-id.`)
  }
  if (text(manifest.supabaseOrigin) !== expectedSupabaseOrigin) {
    error('release-manifest.json supabaseOrigin does not equal --expected-supabase-origin.')
  }
  if (!Array.isArray(manifest.criticalAssets) || manifest.criticalAssets.length === 0) {
    error('release-manifest.json must contain at least one critical asset.')
  }

  const criticalAssets = manifest.criticalAssets.map(normalizeCriticalAssetPath)
  if (new Set(criticalAssets).size !== criticalAssets.length) {
    error('release-manifest.json contains duplicate critical assets.')
  }
  return criticalAssets.sort((left, right) => left.localeCompare(right))
}

function expectedAssetContentType(asset) {
  if (asset.endsWith('.css')) return 'text/css'
  if (asset.endsWith('.js') || asset.endsWith('.mjs')) return 'javascript'
  return ''
}

async function fetchCriticalAsset(fetchImpl, previewUrl, asset) {
  const assetUrl = new URL(asset, previewUrl)
  const response = await fetchRequired(fetchImpl, assetUrl, previewUrl.origin, `Critical asset ${asset}`)
  const expectedType = expectedAssetContentType(asset)
  if (expectedType) requireContentType(response, expectedType, `Critical asset ${asset}`)
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length === 0) error(`Critical asset ${asset} returned an empty body.`)
  return {
    path: asset,
    bytes: body.length,
    sha256: sha256Digest(body),
    contentType: contentType(response),
  }
}

function assetTreeDigest(assets) {
  return sha256Digest(assets
    .map((asset) => `${asset.path}\u0000${asset.sha256}\u0000${asset.bytes}`)
    .join('\n'))
}

/**
 * Fetches and verifies one preview deployment.  It does not deploy, promote,
 * or change Vercel/Supabase state.  `fetchImpl` is injectable solely for local
 * tests; callers should use the default global fetch for a real attestation.
 */
export async function attestLegalDocumentRolloutPhase1Preview({
  url,
  expectedReleaseId,
  expectedSupabaseOrigin,
  deploymentId,
  vercelProjectId,
  vercelTeamId = null,
  vercelToken = process.env.VERCEL_TOKEN,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') error('A fetch implementation is required.')
  const previewUrl = validateVercelPreviewUrl(url)
  const expectedRelease = validateExpectedReleaseId(expectedReleaseId)
  const expectedOrigin = validateExpectedSupabaseOrigin(expectedSupabaseOrigin)
  const verifiedDeploymentId = validateDeploymentId(deploymentId)
  const verifiedProjectId = validateVercelProjectId(vercelProjectId)
  const verifiedTeamId = validateVercelTeamId(vercelTeamId)

  const providerMetadata = await fetchVercelDeploymentMetadata({
    fetchImpl,
    token: vercelToken,
    deploymentId: verifiedDeploymentId,
    projectId: verifiedProjectId,
    teamId: verifiedTeamId,
    previewUrl,
    expectedReleaseId: expectedRelease,
  })

  const indexUrl = new URL('/', previewUrl)
  const indexResponse = await fetchRequired(fetchImpl, indexUrl, previewUrl.origin, 'Preview index.html')
  requireContentType(indexResponse, 'text/html', 'Preview index.html')
  const indexHtml = await indexResponse.text()
  const indexReleaseId = readIndexReleaseId(indexHtml)
  if (indexReleaseId !== expectedRelease) {
    error('The preview index.html release marker does not equal --expected-release-id.')
  }

  const manifestUrl = new URL('/release-manifest.json', previewUrl)
  const manifestResponse = await fetchRequired(fetchImpl, manifestUrl, previewUrl.origin, 'release-manifest.json')
  requireContentType(manifestResponse, 'json', 'release-manifest.json')
  const manifestText = await manifestResponse.text()
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch {
    error('release-manifest.json is not valid JSON.')
  }
  const criticalAssets = validateManifest(manifest, expectedRelease, expectedOrigin)

  const assetEvidence = await Promise.all(criticalAssets.map((asset) => fetchCriticalAsset(fetchImpl, previewUrl, asset)))
  const indexHtmlSha256 = sha256Digest(Buffer.from(indexHtml, 'utf8'))
  const releaseManifestSha256 = sha256Digest(Buffer.from(manifestText, 'utf8'))
  const previewArtifactTreeSha256 = assetTreeDigest(assetEvidence)

  return {
    version: LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
    attestedAt: new Date(now).toISOString(),
    deploymentId: verifiedDeploymentId,
    previewUrl: previewUrl.origin,
    expectedReleaseId: expectedRelease,
    expectedSupabaseOrigin: expectedOrigin,
    providerMetadata,
    observed: {
      indexReleaseId,
      manifestReleaseId: text(manifest.releaseId),
      manifestSupabaseOrigin: text(manifest.supabaseOrigin),
      criticalAssets: assetEvidence,
    },
    hashes: {
      previewIndexHtmlSha256: indexHtmlSha256,
      previewReleaseManifestSha256: releaseManifestSha256,
      previewArtifactTreeSha256,
    },
    // This is the non-secret, mechanically observed portion of
    // execution.previewEvidence in the Phase 1 receipt.  The operator must
    // still add the digest of this saved attestation output. The deployment
    // metadata digest is obtained above through Vercel's authenticated API.
    receiptPreviewEvidence: {
      provider: 'vercel',
      attestationVersion: LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
      deploymentId: verifiedDeploymentId,
      previewUrl: previewUrl.origin,
      previewReleaseId: expectedRelease,
      previewReleaseManifestSha256: releaseManifestSha256,
      previewIndexHtmlSha256: indexHtmlSha256,
      previewArtifactTreeSha256,
      publicSupabaseOrigin: expectedOrigin,
      attestedAt: new Date(now).toISOString(),
    },
    receiptPreviewEvidenceRequiredOperatorFields: [
      'deploymentSourceCommitSha',
      'deploymentMetadataEvidenceDigest',
      'attestationEvidenceDigest',
    ],
  }
}

export function parsePreviewAttestationCliArguments(argv = process.argv.slice(2)) {
  const result = {}
  for (const argument of argv) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      error(`Use --name=value form for every argument; received ${argument}.`)
    }
    const separator = argument.indexOf('=')
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (!CLI_OPTION_NAMES.includes(name)) error(`Unknown argument --${name}.`)
    if (Object.hasOwn(result, name)) error(`Argument --${name} was supplied more than once.`)
    result[name] = value
  }
  for (const name of REQUIRED_CLI_OPTION_NAMES) requireNonBlank(result[name], `--${name}`)
  return {
    url: result.url,
    expectedReleaseId: result['expected-release-id'],
    expectedSupabaseOrigin: result['expected-supabase-origin'],
    deploymentId: result['deployment-id'],
    vercelProjectId: result['vercel-project-id'],
    vercelTeamId: result['team-id'] || null,
  }
}

function invokedDirectly() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

async function main() {
  const evidence = await attestLegalDocumentRolloutPhase1Preview(parsePreviewAttestationCliArguments())
  console.log(JSON.stringify(evidence, null, 2))
}

if (invokedDirectly()) {
  main().catch((cause) => {
    console.error(cause instanceof Error ? cause.message : 'Phase 1 preview attestation blocked.')
    process.exitCode = 1
  })
}
