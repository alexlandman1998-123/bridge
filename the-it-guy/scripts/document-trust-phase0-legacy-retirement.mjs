import fs from 'node:fs'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const PHASE = 'document_trust_phase0_legacy_retirement'
const DEFAULT_OUTPUT_PATH = 'output/document-trust-phase0-legacy-retirement.json'
const REGISTER_PATH = 'docs/document-trust-phase0-legacy-retirement.md'

const REGISTERED_PATHS = Object.freeze([
  {
    id: 'legacy-required-document-projection',
    path: 'src/lib/api.js',
    evidence: 'transaction_required_documents',
  },
  {
    id: 'legacy-seller-listing-documents',
    path: 'src/services/sellerDocumentTransactionContinuityService.js',
    evidence: 'bridge_promote_pending_private_listing_documents',
  },
  {
    id: 'legacy-client-document-matching',
    path: 'src/components/client-portal/documents/ClientDocumentCentre.jsx',
    evidence: 'findUploadedDocumentForRequirement',
  },
  {
    id: 'legacy-client-document-matching-workspace',
    path: 'src/services/clientPortalWorkspaceService.js',
    evidence: 'findUploadedDocumentForRequirement',
  },
  {
    id: 'legacy-seller-generator',
    path: 'src/services/documents/documentRequestCanonicalTransactionSyncService.js',
    evidence: 'buildCanonicalDocumentRequestScenarioFromTransactionContext',
  },
  {
    id: 'legacy-upload-link-soft-failure',
    path: 'src/lib/api.js',
    evidence: 'Canonical upload linkage skipped',
  },
])

function parseArgs(argv = process.argv.slice(2)) {
  const options = { output: DEFAULT_OUTPUT_PATH, compact: false }
  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    if (arg === '--compact') options.compact = true
  }
  return options
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function buildReport() {
  const register = read(REGISTER_PATH)
  const requiredSections = [
    '## Authoritative lifecycle',
    '## Retirement register',
    '## Freeze rules',
    '## Phase exit gate',
  ]
  const lifecycleTokens = [
    'document_requirement_instances.id',
    'documents.canonical_requirement_instance_id',
    'role-scoped portal projection',
  ]
  const requiredRegisterTokens = [
    'Bridge temporarily',
    'Replace now',
    'Keep, bounded',
    'transaction_required_documents',
    'private_listing_documents',
    'document_requests',
  ]
  const pathChecks = REGISTERED_PATHS.map((entry) => {
    const source = read(entry.path)
    return {
      key: entry.id,
      path: entry.path,
      evidence: entry.evidence,
      ok: source.includes(entry.evidence),
    }
  })
  const checks = [
    ...requiredSections.map((section) => ({ key: `section:${section}`, ok: register.includes(section) })),
    ...lifecycleTokens.map((token) => ({ key: `lifecycle:${token}`, ok: register.includes(token) })),
    ...requiredRegisterTokens.map((token) => ({ key: `register:${token}`, ok: register.includes(token) })),
    ...pathChecks.map((check) => ({ key: `path:${check.key}`, ok: check.ok, path: check.path })),
  ]
  const failed = checks.filter((check) => !check.ok)
  return {
    phase: PHASE,
    version: 'document_trust_phase0_legacy_retirement_v1',
    mutatedData: false,
    connectsToSupabase: false,
    registerPath: REGISTER_PATH,
    authoritativeLifecycle: {
      requirement: 'document_requirement_instances.id',
      documentLink: 'documents.canonical_requirement_instance_id',
      projection: 'role-scoped portal projection',
    },
    registeredPaths: pathChecks,
    gate: {
      status: failed.length ? 'blocked' : 'legacy_retirement_register_locked',
      ok: failed.length === 0,
      mayProceedToPhase1: failed.length === 0,
      failed,
    },
  }
}

async function main() {
  const options = parseArgs()
  const report = buildReport()
  const outputPath = path.resolve(process.cwd(), options.output)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, options.compact ? 0 : 2)}\n`)
  console.log(JSON.stringify({
    phase: report.phase,
    status: report.gate.status,
    output: options.output,
    mutatedData: report.mutatedData,
    failedChecks: report.gate.failed.length,
  }, null, 2))
  if (!report.gate.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
