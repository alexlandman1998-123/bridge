#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectLegalDocumentRolloutPhase1Artifacts,
  sha256Digest,
} from '../the-it-guy/scripts/legal-document-rollout-phase1-artifacts.mjs'
import {
  assessLegalDocumentRolloutPhase1,
  rolloutPhase1ManifestDigest,
} from '../the-it-guy/scripts/legal-document-rollout-phase1-policy.mjs'
import {
  ROLLOUT_PHASE0_AUTHORITY_STATES,
  assessLegalDocumentRolloutPhase0Freeze,
} from '../the-it-guy/scripts/legal-document-rollout-phase0-policy.mjs'
import { collectRolloutSourceContinuity } from '../the-it-guy/scripts/legal-document-rollout-source-continuity.mjs'
import { collectLegalDocumentRolloutPhase1History } from '../the-it-guy/scripts/legal-document-rollout-phase1-history.mjs'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const PHASE1_RECEIPT_PATH = path.join('the-it-guy', 'config', 'legal-document-rollout-phase1-staging.json')
const PHASE0_FREEZE_PATH = path.join('the-it-guy', 'config', 'legal-document-rollout-phase0-freeze.json')
const REVIEW_MANIFEST_PATH = path.join('the-it-guy', 'config', 'legal-document-review-manifest.json')
const PILOT_PATH = path.join('the-it-guy', 'config', 'legal-document-pilot.json')
const SCALE_PATH = path.join('the-it-guy', 'config', 'legal-document-scale.json')
const JSON_REPORT_PATH = path.join('docs', 'supabase-phase1-receipt-binding.json')
const MARKDOWN_REPORT_PATH = path.join('docs', 'supabase-phase1-receipt-binding-report.md')

function findRepoRoot(startDir) {
  let current = startDir
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'supabase', 'migrations'))) return current
    current = path.dirname(current)
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function parseArgs(argv) {
  const options = { write: true, json: false, preparedBy: 'codex', reference: 'supabase-push-phase1-bind' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--write') options.write = true
    else if (arg === '--check') options.write = false
    else if (arg === '--prepared-by') options.preparedBy = argv[++index]
    else if (arg === '--reference') options.reference = argv[++index]
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function validDigest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(String(value || '').trim())
}

function validCommit(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || '').trim())
}

function validProjectRef(value) {
  return /^[a-z0-9]{8,64}$/.test(String(value || '').trim())
}

function gitOutput(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function authorityStates(repoRoot) {
  return Object.fromEntries(Object.entries(ROLLOUT_PHASE0_AUTHORITY_STATES).map(([file, expected]) => {
    const absolutePath = path.join(repoRoot, 'the-it-guy', 'config', file)
    const status = existsSync(absolutePath) ? String(readJson(absolutePath).status || '').trim() : ''
    return [file, status || expected]
  }))
}

function phase0Report(repoRoot, freeze, reviewManifest) {
  const currentCommit = gitOutput(repoRoot, ['rev-parse', 'HEAD'])
  const packageLockPath = path.join(repoRoot, 'the-it-guy', 'package-lock.json')
  const packageLockSha256 = existsSync(packageLockPath) ? sha256Digest(readFileSync(packageLockPath)) : ''
  const sourceContinuity = collectRolloutSourceContinuity({
    repoRoot,
    sourceCommit: freeze.source?.commitSha,
    currentCommit,
  })
  const report = assessLegalDocumentRolloutPhase0Freeze({
    freeze,
    pilot: readJson(path.join(repoRoot, PILOT_PATH)),
    scale: readJson(path.join(repoRoot, SCALE_PATH)),
    reviewManifest,
    authorityStates: authorityStates(repoRoot),
    currentCommit,
    sourceContinuity,
    currentPackageLockDigest: packageLockSha256,
    worktreeClean: gitOutput(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']) === '',
    creationPaused: String(process.env.MVP_PILOT_CREATION_PAUSED || 'true').trim().toLowerCase() !== 'false',
  })
  return { report, sourceContinuity, currentCommit, packageLockSha256 }
}

function bindReceipt({ receipt, freeze, reviewManifest, artifacts, phase0, options }) {
  const environment = receipt.environment || {}
  const stagingProjectRef = String(environment.stagingProjectRef || '').trim()
  const stagingOrigin = String(environment.stagingOrigin || '').trim() || (stagingProjectRef ? `https://${stagingProjectRef}.supabase.co` : null)
  const preparedAt = receipt.evidence?.preparedAt || new Date().toISOString()
  const source = receipt.source || {}
  const next = {
    ...receipt,
    version: 2,
    phase: 'ROLL_OUT_1',
    contract: 'legal-document-staging-release-v2',
    status: 'pending_staging',
    environment: {
      productionProjectRef: PRODUCTION_PROJECT_REF,
      stagingProjectRef,
      stagingOrigin,
    },
    source: {
      phase0ManifestDigest: validDigest(freeze.manifestDigest) ? freeze.manifestDigest : source.phase0ManifestDigest,
      commitSha: validCommit(freeze.source?.commitSha) ? freeze.source.commitSha : (validCommit(source.commitSha) ? source.commitSha : phase0.currentCommit),
      packageLockSha256: validDigest(freeze.source?.packageLockSha256) ? freeze.source.packageLockSha256 : (validDigest(source.packageLockSha256) ? source.packageLockSha256 : phase0.packageLockSha256),
      b1ManifestDigest: validDigest(freeze.templateReview?.boundB1ManifestDigest)
        ? freeze.templateReview.boundB1ManifestDigest
        : (validDigest(source.b1ManifestDigest) ? source.b1ManifestDigest : reviewManifest.manifestDigest),
      b1EvidenceProjectRef: validProjectRef(freeze.templateReview?.evidenceProjectRef)
        ? freeze.templateReview.evidenceProjectRef
        : (validProjectRef(source.b1EvidenceProjectRef) ? source.b1EvidenceProjectRef : stagingProjectRef),
      pendingReceiptManifestDigest: null,
    },
    artifacts: {
      migrations: artifacts.migrations,
      migrationSetDigest: artifacts.migrationSetDigest,
      applicationManifestSha256: artifacts.applicationManifestSha256,
      applicationManifestCoverageDigest: artifacts.applicationManifestCoverage?.digest || null,
      applicationManifestLinkedProjectRef: artifacts.applicationManifestLinkedProjectRef,
      edgeFunctions: artifacts.edgeFunctions,
      edgeFunctionSetDigest: artifacts.edgeFunctionSetDigest,
      edgeFunctionDeployUnitSha256: artifacts.edgeFunctionDeployUnitSha256,
      sharedRuntimeSha256: artifacts.sharedRuntimeSha256,
      sharedRuntimeFileCount: artifacts.sharedRuntimeFileCount,
      sharedRuntimeRequiredFileSha256: artifacts.sharedRuntimeRequiredFileSha256,
      configTomlSha256: artifacts.configTomlSha256,
      databaseRunnerSourceSha256: artifacts.databaseRunnerSourceSha256,
      databaseRunnerProtectedProjectRef: artifacts.databaseRunnerProtectedProjectRef,
      databaseRunnerTargetContract: artifacts.databaseRunnerTargetContract,
      databaseRunnerCliVersion: artifacts.databaseRunnerCliVersion,
      frontend: artifacts.frontend,
      releaseOrder: artifacts.releaseOrder,
    },
    safety: {
      pilotEnabled: false,
      organisationIdsSentinel: '__none__',
      creationPaused: true,
      scaleEnabled: false,
    },
    execution: {
      databaseRunner: 'scripts/supabase-phase6-staging-execution.mjs',
      databaseRunnerCliVersion: '2.109.1',
      recoveryEvidenceReference: null,
      preflightLedgerEvidenceDigest: null,
      migrationEvidence: [],
      edgeFunctionEvidence: [],
      functionConfigurationReviews: [],
      previewEvidence: {
        provider: null,
        attestationVersion: null,
        attestationEvidenceDigest: null,
        deploymentId: null,
        deploymentSourceCommitSha: null,
        deploymentMetadataEvidenceDigest: null,
        previewUrl: null,
        previewReleaseId: null,
        previewReleaseManifestSha256: null,
        previewIndexHtmlSha256: null,
        previewArtifactTreeSha256: null,
        publicSupabaseOrigin: null,
        attestedAt: null,
      },
      postDeployContractEvidenceDigest: null,
    },
    evidence: {
      preparedBy: receipt.evidence?.preparedBy || options.preparedBy,
      preparedAt,
      evidenceRecordedBy: null,
      reviewedBy: null,
      evidenceRecordedAt: null,
      changeReference: receipt.evidence?.changeReference || options.reference,
      fixtureWrites: 0,
    },
    manifestDigest: null,
  }
  next.manifestDigest = rolloutPhase1ManifestDigest(next)
  return next
}

function evidencePath(migration) {
  const stream = migration.version === '202607220013' || migration.version === '202607220014'
    ? 'bond_finance_runtime'
    : 'legal_document_runtime'
  return path.join('docs', 'staging-evidence', `${migration.version}-${stream}.json`)
}

function bindEvidenceFiles(repoRoot, receipt, write) {
  return receipt.artifacts.migrations.map((migration) => {
    const relativePath = evidencePath(migration)
    const absolutePath = path.join(repoRoot, relativePath)
    if (!existsSync(absolutePath)) {
      return {
        version: migration.version,
        evidenceFile: relativePath,
        status: 'missing',
        changed: false,
      }
    }
    const evidence = readJson(absolutePath)
    const before = JSON.stringify({
      phase1ReceiptManifestDigest: evidence.phase1ReceiptManifestDigest || null,
      migrationSha256: evidence.migrationSha256 || null,
    })
    evidence.phase1ReceiptManifestDigest = receipt.manifestDigest
    evidence.migrationSha256 = migration.sha256
    const changed = before !== JSON.stringify({
      phase1ReceiptManifestDigest: evidence.phase1ReceiptManifestDigest,
      migrationSha256: evidence.migrationSha256,
    })
    if (write && changed) writeFileSync(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`)
    return {
      version: migration.version,
      evidenceFile: relativePath,
      status: changed ? 'bound' : 'already_bound',
      changed,
    }
  })
}

function markdownTable(headers, rows) {
  if (!rows.length) return 'No rows.'
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(line),
  ].join('\n')
}

function buildMarkdown(result) {
  return `# Supabase Phase 1 Receipt Binding

Generated: ${result.generatedAt}

## Decision

| Field | Value |
| --- | --- |
| Status | \`${result.status}\` |
| Write mode | ${result.write ? 'Yes' : 'No'} |
| Receipt path | \`${result.receiptPath}\` |
| Manifest digest | \`${result.manifestDigest}\` |
| Migration bindings | ${result.migrationCount} |
| Evidence source bindings | ${result.evidenceBindingCount} |
| Push gate ready | ${result.pushGateReady ? 'Yes' : 'No'} |
| Official rollout policy status | \`${result.officialPolicy.status}\` |
| Official rollout blockers | ${result.officialPolicy.blockerCount} |

## Official Policy Blockers

${result.officialPolicy.blockers.length
    ? markdownTable(['Code', 'Detail'], result.officialPolicy.blockers.map((blocker) => [`\`${blocker.code}\``, blocker.detail]))
    : 'No official policy blockers.'}

This binding makes the Phase 1 receipt digest and migration list concrete for the Supabase push evidence gate. It does not apply SQL, record staging ledgers, or override the stricter legal rollout policy.
`
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-bind-phase1-receipt.mjs [--write|--check] [--prepared-by <name>] [--reference <id>] [--json]')
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) usage()
  else {
    const repoRoot = findRepoRoot(process.cwd())
    const receiptPath = path.join(repoRoot, PHASE1_RECEIPT_PATH)
    const freeze = readJson(path.join(repoRoot, PHASE0_FREEZE_PATH))
    const reviewManifest = readJson(path.join(repoRoot, REVIEW_MANIFEST_PATH))
    const receipt = readJson(receiptPath)
    const artifacts = collectLegalDocumentRolloutPhase1Artifacts({ repoRoot })
    const phase0 = phase0Report(repoRoot, freeze, reviewManifest)
    const boundReceipt = bindReceipt({ receipt, freeze, reviewManifest, artifacts, phase0, options })
    const evidenceBindings = bindEvidenceFiles(repoRoot, boundReceipt, options.write)
    const officialPolicy = assessLegalDocumentRolloutPhase1({
      receipt: boundReceipt,
      phase0Freeze: freeze,
      phase0Report: phase0.report,
      expectedArtifacts: artifacts,
      phase1History: collectLegalDocumentRolloutPhase1History({ repoRoot, sourceContinuity: phase0.sourceContinuity }),
    })
    const pushGateReady = Boolean(
      validDigest(boundReceipt.manifestDigest)
      && Array.isArray(boundReceipt.artifacts?.migrations)
      && boundReceipt.artifacts.migrations.length > 0
      && validProjectRef(boundReceipt.environment?.productionProjectRef)
      && validProjectRef(boundReceipt.environment?.stagingProjectRef)
    )
    const result = {
      generatedAt: new Date().toISOString(),
      status: pushGateReady ? 'PHASE1_RECEIPT_BOUND_FOR_PUSH_GATE' : 'PHASE1_RECEIPT_BINDING_BLOCKED',
      write: options.write,
      receiptPath: PHASE1_RECEIPT_PATH,
      manifestDigest: boundReceipt.manifestDigest,
      migrationCount: boundReceipt.artifacts.migrations.length,
      evidenceBindingCount: evidenceBindings.filter((row) => row.status === 'bound' || row.status === 'already_bound').length,
      evidenceBindings,
      pushGateReady,
      officialPolicy: {
        status: officialPolicy.status,
        blockerCount: officialPolicy.blockerCount,
        pendingCount: officialPolicy.pendingCount,
        blockers: officialPolicy.blockers,
      },
    }
    if (options.write) writeFileSync(receiptPath, `${JSON.stringify(boundReceipt, null, 2)}\n`)
    writeFileSync(path.join(repoRoot, JSON_REPORT_PATH), `${JSON.stringify(result, null, 2)}\n`)
    writeFileSync(path.join(repoRoot, MARKDOWN_REPORT_PATH), buildMarkdown(result))
    if (options.json) console.log(JSON.stringify(result, null, 2))
    else {
      console.log(`Wrote ${JSON_REPORT_PATH}`)
      console.log(`Wrote ${MARKDOWN_REPORT_PATH}`)
      console.log(`Status: ${result.status}`)
    }
  }
} catch (error) {
  console.error(`Bind Phase 1 receipt failed: ${error.message}`)
  process.exitCode = 1
}
