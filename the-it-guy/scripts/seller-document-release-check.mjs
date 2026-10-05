#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { RETIRED_DOCUMENT_FUNCTIONS } from '../src/core/documents/documentGeneratorRetirement.js'
import { buildSellerReleaseCandidate, verifySellerReleaseCandidate, createSellerReleaseDecision,
  assessSellerReleaseReadiness } from './seller-document-release-candidate.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const entrypoint = 'supabase/functions/seller-portal-document-signing/index.ts'
const importMap = 'supabase/functions/seller-portal-document-signing/deno.json'
const digest = content => createHash('sha256').update(content).digest('hex')

// Supabase needs the complete local import graph, including nested JS renderers.
// Reading only index.ts would accept a deployment with stale branding or wording.
export async function collectSellerSigningBundle(root = repoRoot) {
  const result = await build({
    absWorkingDir: root, entryPoints: [entrypoint], bundle: true, write: false,
    metafile: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
    external: ['supabase', 'https://*', 'http://*', 'jsr:*', 'npm:*'],
  })
  const names = [...new Set([...Object.keys(result.metafile.inputs), importMap])].sort()
  const files = await Promise.all(names.map(async name => {
    assert.ok(!path.isAbsolute(name) && !name.startsWith('../'), `Out-of-repository dependency: ${name}`)
    assert.ok(name.startsWith('supabase/functions/') || name.startsWith('the-it-guy/src/'), `Unexpected dependency: ${name}`)
    return { name, content: await readFile(path.join(root, name), 'utf8') }
  }))
  return { name: 'seller-portal-document-signing', entrypoint_path: entrypoint,
    import_map_path: importMap, verify_jwt: false, files }
}

export function signingBundleManifest(bundle) {
  return bundle.files.map(({ name, content }) => ({ name, sha256: digest(content) }))
}

export function verifyRemoteSigningBundle(expected, remote) {
  assert.equal(remote.slug || remote.name, expected.name, 'Wrong signing function')
  assert.equal(remote.status, 'ACTIVE', 'Signing function is not active')
  // Seller links use their own expiring token; staff actions authenticate in the handler.
  assert.equal(remote.verify_jwt, expected.verify_jwt, 'Signing gateway authentication changed')
  assert.ok(Number.isInteger(remote.version) && remote.version > 0, 'Missing deployed function version')
  const actual = new Map((remote.files || []).map(file => [file.name, file.content]))
  assert.equal(actual.size, remote.files?.length, 'Duplicate signing bundle filenames')
  assert.equal(actual.size, expected.files.length, 'Signing bundle file set differs')
  for (const file of expected.files) {
    assert.ok(actual.has(file.name), `Signing bundle missing ${file.name}`)
    assert.equal(digest(actual.get(file.name)), digest(file.content), `Stale signing dependency: ${file.name}`)
  }
  return { version: remote.version, filesVerified: actual.size }
}

export async function verifyRetiredHandlerSnapshots(root, snapshots) {
  assert.ok(Array.isArray(snapshots.inventory) && snapshots.inventory.length > 0,
    'Supply the complete deployed function inventory to verify absent legacy handlers')
  assert.ok(snapshots.bundles && typeof snapshots.bundles === 'object', 'Missing retirement bundles')
  const inventory = new Map(snapshots.inventory.map(item => [item.slug || item.name, item]))
  const sharedName = 'supabase/functions/_shared/retiredDocumentGenerator.ts'
  const shared = await readFile(path.join(root, sharedName), 'utf8')
  const config = await readFile(path.join(root, 'supabase/config.toml'), 'utf8')
  const verified = []
  const absent = []
  for (const name of RETIRED_DOCUMENT_FUNCTIONS) {
    if (!inventory.has(name)) { absent.push(name); continue }
    const remote = snapshots.bundles[name]
    assert.ok(remote, `Missing retirement bundle snapshot: ${name}`)
    assert.equal(remote.slug || remote.name, name, `Wrong retired function: ${name}`)
    assert.equal(remote.status, 'ACTIVE', `Retirement handler inactive: ${name}`)
    assert.ok(Number.isInteger(remote.version) && remote.version > 0, `Missing retirement version: ${name}`)
    assert.equal(remote.version, inventory.get(name).version, `Inventory and bundle versions differ: ${name}`)
    const section = config.match(new RegExp(`\\[functions\\.${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`))?.[1]
    assert.ok(section, `Missing function configuration: ${name}`)
    const expectedJwt = /verify_jwt\s*=\s*true/.test(section)
    assert.equal(remote.verify_jwt, expectedJwt, `Retired gateway authentication changed: ${name}`)
    const entryName = `supabase/functions/${name}/index.ts`
    const expectedEntry = await readFile(path.join(root, entryName), 'utf8')
    const files = new Map((remote.files || []).map(file => [file.name, file.content]))
    assert.equal(files.size, remote.files?.length, `Duplicate retirement bundle filenames: ${name}`)
    assert.equal(files.size, 2, `Legacy dependencies still deployed: ${name}`)
    assert.equal(files.get(entryName), expectedEntry, `Legacy entrypoint still deployed: ${name}`)
    assert.equal(files.get(sharedName), shared, `Retirement response differs: ${name}`)
    verified.push({ name, version: remote.version })
  }
  return { verified, absent }
}

export async function verifyDeployedFrontend(url, expectedReleaseId, fetcher = fetch) {
  assert.ok(expectedReleaseId, 'Specify --expected-release-id for deployed frontend verification')
  const origin = new URL(url)
  assert.equal(origin.protocol, 'https:', 'Use an HTTPS deployment URL')
  const response = await fetcher(new URL('/release-manifest.json', origin), {
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  assert.ok(response.ok, `Deployment manifest returned HTTP ${response.status}`)
  const manifest = await response.json()
  assert.equal(manifest.releaseId, expectedReleaseId, 'Deployed frontend is a different release')
  const page = await fetcher(new URL('/', origin), { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  assert.ok(page.ok, `Application returned HTTP ${page.status}`)
  const html = await page.text()
  assert.ok(html.includes(`name="arch9-release" content="${expectedReleaseId}"`), 'HTML release marker differs')
  return { origin: origin.origin, releaseId: expectedReleaseId }
}

async function main() {
  const options = Object.fromEntries(process.argv.slice(2).map(arg => {
    const split = arg.indexOf('=')
    assert.ok(split > 2 && arg.startsWith('--'), `Use --option=value: ${arg}`)
    return [arg.slice(2, split), arg.slice(split + 1)]
  }))
  const accepted = new Set(['bundle-out', 'remote-signing', 'remote-retired', 'deployment-url', 'expected-release-id',
    'candidate-out', 'decision-template-out', 'candidate', 'decision', 'require-ready'])
  for (const key of Object.keys(options)) assert.ok(accepted.has(key), `Unknown option: ${key}`)
  if (options['require-ready']) assert.equal(options['require-ready'], 'true', 'Use --require-ready=true')
  if (options.decision || options['require-ready']) assert.ok(options.candidate, 'Supply --candidate with a release decision')
  if (options['decision-template-out']) assert.ok(options['candidate-out'], 'Export the candidate alongside the decision template')
  const bundle = await collectSellerSigningBundle()
  const report = { localBundle: signingBundleManifest(bundle), signingVerified: false,
    retirementVerified: false, frontendVerified: false, hostedSellerAcceptance: 'required_separately' }
  if (options['bundle-out']) await writeFile(options['bundle-out'], JSON.stringify(bundle, null, 2) + '\n')
  if (options['remote-signing']) {
    report.signing = verifyRemoteSigningBundle(bundle, JSON.parse(await readFile(options['remote-signing'], 'utf8')))
    report.signingVerified = true
  }
  if (options['remote-retired']) {
    report.retirement = await verifyRetiredHandlerSnapshots(repoRoot, JSON.parse(await readFile(options['remote-retired'], 'utf8')))
    report.retirementVerified = true
  }
  if (options['deployment-url']) {
    report.frontend = await verifyDeployedFrontend(options['deployment-url'], options['expected-release-id'])
    report.frontendVerified = true
  }
  if (options['candidate-out'] || options.candidate) {
    const candidate = await buildSellerReleaseCandidate(repoRoot, bundle)
    if (options.candidate) verifySellerReleaseCandidate(JSON.parse(await readFile(options.candidate, 'utf8')), candidate)
    if (options['candidate-out']) await writeFile(options['candidate-out'], JSON.stringify(candidate, null, 2) + '\n')
    if (options['decision-template-out']) await writeFile(options['decision-template-out'],
      JSON.stringify(createSellerReleaseDecision(candidate), null, 2) + '\n', { flag: 'wx' })
    const decision = options.decision ? JSON.parse(await readFile(options.decision, 'utf8')) : undefined
    report.candidate = { digest: candidate.candidateDigest, sourceFingerprint: candidate.source.fingerprint,
      proofs: candidate.proofs.length, proofPages: candidate.proofs.reduce((sum, item) => sum + item.pages, 0),
      localAcceptance: candidate.localAcceptance, migrations: candidate.migrations }
    report.readiness = assessSellerReleaseReadiness(candidate, decision, report)
    if (options['require-ready'] && report.readiness.status !== 'ready_for_release_review') process.exitCode = 1
  } else report.readiness = { status: 'not_evaluated', reason: 'Supply the exact candidate and sign-off decision.' }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`Seller document release check failed: ${error.message}\n`); process.exitCode = 1 })
}
