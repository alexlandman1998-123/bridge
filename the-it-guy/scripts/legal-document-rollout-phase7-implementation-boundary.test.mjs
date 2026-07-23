import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assessLegalDocumentRolloutPhase6,
  createPendingLegalDocumentRolloutPhase6Receipt,
} from './legal-document-rollout-phase6-policy.mjs'
import { finalizeLegalDocumentRolloutPhase6Receipt } from './legal-document-rollout-phase6-finalize.mjs'
import {
  assessLegalDocumentRolloutPhase7,
  createPendingLegalDocumentRolloutPhase7Receipt,
  rolloutPhase7BoundaryPlanDigest,
  rolloutPhase7ManifestDigest,
} from './legal-document-rollout-phase7-policy.mjs'
import {
  finalizeLegalDocumentRolloutPhase7Receipt,
  writeCanonicalPhase7ReceiptAtomically,
} from './legal-document-rollout-phase7-finalize.mjs'
import {
  collectLegalDocumentRolloutPhase7StaticBoundaryFacts,
  ROLLOUT_PHASE7_IMPLEMENTATION_CHANGE_PATHS,
} from './legal-document-rollout-phase7-static-boundary.mjs'
import { sha256Digest } from './legal-document-rollout-phase1-artifacts.mjs'

const now = Date.parse('2026-07-10T00:00:00.000Z')
const preparedAt = '2026-07-08T00:00:00.000Z'
const organisationId = '11111111-1111-4111-8111-111111111111'
const productionProjectRef = 'productionref001'
const digest = (character) => `sha256:${character.repeat(64)}`

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function codes(report) {
  return report.blockers.map((blocker) => blocker.code)
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

function write(repoRoot, relativePath, contents) {
  const target = path.join(repoRoot, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents, 'utf8')
}

function commit(repoRoot, message, paths = ['-A']) {
  git(repoRoot, ['add', ...paths])
  git(repoRoot, ['commit', '--quiet', '-m', message])
  return git(repoRoot, ['rev-parse', 'HEAD'])
}

function retiredLegacyActivator(label) {
  return [
    `// ${label} historical activator: source-only retirement test fixture.`,
    "console.log('LEGAL_DOCUMENT_LEGACY_EXPANSION_RETIRED')",
    'process.exit(1)',
    "const historicalRemoteWrite = ['secrets', 'set']",
    '',
  ].join('\n')
}

function phase5History() {
  return {
    receiptCommitSha: 'a'.repeat(40),
    receiptManifestDigest: digest('b'),
    receiptManifestDigestValid: true,
    receiptOnlyCommit: true,
    receiptStatus: 'pilot_observation_recorded',
    receiptPhase: 'ROLL_OUT_5',
    receiptContract: 'legal-document-production-pilot-observation-v1',
    phase4ReceiptCommitSha: 'c'.repeat(40),
    phase4ReceiptManifestDigest: digest('d'),
    sourceCommitSha: 'e'.repeat(40),
    packageLockSha256: digest('f'),
    activationPlanDigest: digest('1'),
    observationPlanDigest: digest('2'),
    cohortDigest: sha256Digest(organisationId),
    organisationIds: [organisationId],
    requiredPacketTypes: ['mandate', 'otp'],
    productionProjectRef,
    productionOrigin: `https://${productionProjectRef}.supabase.co`,
    productionUrl: 'https://legal.example.test',
    observationRecordedAt: '2026-07-07T00:00:00.000Z',
    runtimeGuardContract: 'legal-document-pilot-release-v1',
    watchdogContract: 'phase5-f2-f3-f4-v2',
  }
}

function phase6Evidence() {
  return {
    inventory: { candidateCount: 2, candidateInventoryDigest: digest('3') },
    legalApproval: { evidenceDigest: digest('4'), approvedAt: '2026-07-08T12:00:00.000Z', actorReference: 'legal_reviewer_01' },
    releaseApproval: { evidenceDigest: digest('5'), approvedAt: '2026-07-08T13:00:00.000Z', actorReference: 'release_reviewer_01' },
    releaseEpochReadiness: {
      releaseEpochMigrationEvidenceDigest: digest('6'),
      legacyA3Q2V2MutatorRetirementEvidenceDigest: digest('7'),
      v1AllowlistPreservationEvidenceDigest: digest('8'),
    },
    proposalRecordedAt: '2026-07-09T00:00:00.000Z',
    proposalRecordedByReference: 'release_manager_01',
    reviewedByReference: 'governance_reviewer_01',
  }
}

function recordedPhase6History(receiptCommitSha) {
  const parent = phase5History()
  const pending = createPendingLegalDocumentRolloutPhase6Receipt({
    phase5History: parent,
    preparedByReference: 'release_manager_01',
    changeReference: 'REL-007',
    preparedAt,
  })
  const receipt = finalizeLegalDocumentRolloutPhase6Receipt({
    pendingPlan: pending,
    phase5History: parent,
    evidenceInput: phase6Evidence(),
    now,
  })
  const report = assessLegalDocumentRolloutPhase6({ receipt, phase5History: parent, now })
  assert.equal(report.status, 'SUCCESSOR_PROPOSAL_RECORDED')
  assert.equal(report.blockerCount, 0)
  return {
    receiptCommitSha,
    receipt,
    receiptManifestDigest: receipt.manifestDigest,
    receiptManifestDigestValid: true,
    receiptOnlyCommit: true,
    parentPlaceholderValid: true,
    directParentMatchesDeclaredPhase5: true,
    parentPhase5BlobSchemaValid: true,
    parentPhase5BlobManifestValid: true,
    parentPhase5PackageLockValid: true,
    phase6PackageLockValid: true,
    receiptStatus: 'successor_proposal_recorded',
    receiptPhase: 'ROLL_OUT_6',
    receiptContract: 'legal-document-successor-release-proposal-v1',
    phase6AssessmentStatus: report.status,
    phase6AssessmentBlockerCount: report.blockerCount,
    parentPhase5TerminalContinuityValid: true,
    phase5History: parent,
  }
}

function phase7Evidence() {
  return {
    architectureReview: { evidenceDigest: digest('a'), reviewedAt: '2026-07-09T01:00:00.000Z', actorReference: 'architecture_reviewer_01' },
    securityReview: { evidenceDigest: digest('b'), reviewedAt: '2026-07-09T02:00:00.000Z', actorReference: 'security_reviewer_01' },
    nonActivationReview: { evidenceDigest: digest('c'), reviewedAt: '2026-07-09T03:00:00.000Z', actorReference: 'nonactivation_reviewer_01' },
    boundaryRecordedAt: '2026-07-09T04:00:00.000Z',
    boundaryRecordedByReference: 'release_recorder_01',
    reviewedByReference: 'governance_reviewer_01',
  }
}

function createImmutableSourceFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-document-phase7-boundary-'))
  git(repoRoot, ['init', '--quiet'])
  git(repoRoot, ['config', 'user.email', 'phase7-test@example.invalid'])
  git(repoRoot, ['config', 'user.name', 'Phase 7 Boundary Test'])

  write(repoRoot, 'the-it-guy/package.json', '{}\n')
  write(repoRoot, 'the-it-guy/scripts/legal-document-phase-a3-activate.mjs', retiredLegacyActivator('A3'))
  write(repoRoot, 'the-it-guy/scripts/legal-document-phase-q2-activate-expansion.mjs', retiredLegacyActivator('Q2'))
  write(repoRoot, 'the-it-guy/scripts/legal-document-phase-v2-activate-expansion.mjs', retiredLegacyActivator('V2'))
  const phase6ReceiptCommitSha = commit(repoRoot, 'phase 6 immutable parent')

  const migrationSource = fs.readFileSync(new URL('../../supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql', import.meta.url), 'utf8')
  write(repoRoot, 'supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql', migrationSource)
  const implementationCommitSha = commit(repoRoot, 'phase 7 implementation boundary source')

  return { repoRoot, phase6ReceiptCommitSha, implementationCommitSha }
}

function withImmutableSourceFixture(assertions) {
  const nested = createImmutableSourceFixture()
  try {
    assertions(nested)
  } finally {
    fs.rmSync(nested.repoRoot, { recursive: true, force: true })
  }
}

const fixture = createImmutableSourceFixture()
try {
  const safeFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
    repoRoot: fixture.repoRoot,
    phase6ReceiptCommitSha: fixture.phase6ReceiptCommitSha,
    implementationCommitSha: fixture.implementationCommitSha,
  })
  assert.equal(safeFacts.staticBoundaryValid, true)
  assert.equal(safeFacts.implementationCommitDiffValid, true)
  assert.equal(safeFacts.implementationCommitDescendsFromPhase6, true)
  assert.equal(safeFacts.noSuccessorRpcRuntimeCallers, true)
  assert.equal(safeFacts.noMigrationApplyCallers, true)
  assert.equal(safeFacts.legacyActivatorsRetired, true)
  assert.deepEqual(safeFacts.implementationCommitDiffPaths, ['supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql'])
  assert.ok(safeFacts.implementationCommitDiffPaths.every((entry) => ROLLOUT_PHASE7_IMPLEMENTATION_CHANGE_PATHS.includes(entry)))
  assert.equal(safeFacts.migrationInvariantCodes.length, 10)

  // Facts must come from the named Git tree, not uncommitted source beside it.
  write(fixture.repoRoot, 'the-it-guy/src/uncommitted-successor-writer.js', "supabase.rpc('bridge_prepare_legal_document_successor_release_epoch_phase6')\n")
  const immutableFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
    repoRoot: fixture.repoRoot,
    phase6ReceiptCommitSha: fixture.phase6ReceiptCommitSha,
    implementationCommitSha: fixture.implementationCommitSha,
  })
  assert.equal(immutableFacts.staticBoundaryValid, true)
  assert.deepEqual(immutableFacts.successorRpcRuntimeCallers, [])
  assert.equal(immutableFacts.sourceTreeDigest, safeFacts.sourceTreeDigest)

  // An otherwise allowlisted diff with a dynamically wired successor RPC is
  // still a hard static-boundary failure.
  write(fixture.repoRoot, 'the-it-guy/package.json', JSON.stringify({
    check: "supabase.rpc('bridge_prepare_legal_document_successor_release_epoch_phase6')",
  }))
  const dynamicRpcCommitSha = commit(fixture.repoRoot, 'wire forbidden successor RPC', ['the-it-guy/package.json'])
  const dynamicRpcFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
    repoRoot: fixture.repoRoot,
    phase6ReceiptCommitSha: fixture.phase6ReceiptCommitSha,
    implementationCommitSha: dynamicRpcCommitSha,
  })
  assert.equal(dynamicRpcFacts.implementationCommitDiffValid, true)
  assert.equal(dynamicRpcFacts.noSuccessorRpcRuntimeCallers, false)
  assert.deepEqual(dynamicRpcFacts.successorRpcRuntimeCallers, ['the-it-guy/package.json'])
  assert.equal(dynamicRpcFacts.staticBoundaryValid, false)

  // A non-allowlisted path invalidates the whole commit-by-commit source diff.
  write(fixture.repoRoot, 'README.md', 'This source change is outside the Phase 7 implementation boundary.\n')
  const unallowedCommitSha = commit(fixture.repoRoot, 'outside boundary change', ['README.md'])
  const unallowedFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
    repoRoot: fixture.repoRoot,
    phase6ReceiptCommitSha: fixture.phase6ReceiptCommitSha,
    implementationCommitSha: unallowedCommitSha,
  })
  assert.equal(unallowedFacts.implementationCommitDiffValid, false)
  assert.equal(unallowedFacts.staticBoundaryValid, false)

  // A syntactically hidden client-side runtime caller is rejected even before
  // an operator could mistake the surrounding source tree for a safe plan.
  withImmutableSourceFixture((hiddenFixture) => {
    write(hiddenFixture.repoRoot, 'the-it-guy/src/hidden-successor-runtime.js', [
      'const client = { rpc: (...args) => args }',
      "client.rpc('bridge_prepare_legal_document_successor_release_epoch_phase6')",
      '',
    ].join('\n'))
    const hiddenRuntimeCommitSha = commit(hiddenFixture.repoRoot, 'hidden runtime successor writer', ['the-it-guy/src/hidden-successor-runtime.js'])
    const hiddenRuntimeFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
      repoRoot: hiddenFixture.repoRoot,
      phase6ReceiptCommitSha: hiddenFixture.phase6ReceiptCommitSha,
      implementationCommitSha: hiddenRuntimeCommitSha,
    })
    assert.equal(hiddenRuntimeFacts.implementationCommitDiffValid, false)
    assert.equal(hiddenRuntimeFacts.noSuccessorRpcRuntimeCallers, false)
    assert.deepEqual(hiddenRuntimeFacts.successorRpcRuntimeCallers, ['the-it-guy/src/hidden-successor-runtime.js'])
    assert.equal(hiddenRuntimeFacts.staticBoundaryValid, false)
  })

  // The source lineage must reject every unsafe Git shape, even where the
  // changed pathname itself is on the Phase 7 allowlist.
  withImmutableSourceFixture((mergeFixture) => {
    git(mergeFixture.repoRoot, ['checkout', '--quiet', '-b', 'phase7-main', mergeFixture.implementationCommitSha])
    write(mergeFixture.repoRoot, 'the-it-guy/scripts/legal-document-rollout-phase7-policy.mjs', 'export const localBoundary = true\n')
    commit(mergeFixture.repoRoot, 'allowlisted mainline boundary metadata', ['the-it-guy/scripts/legal-document-rollout-phase7-policy.mjs'])
    git(mergeFixture.repoRoot, ['checkout', '--quiet', '-b', 'phase7-side', mergeFixture.implementationCommitSha])
    write(mergeFixture.repoRoot, 'the-it-guy/config/legal-document-rollout-phase7-successor-implementation-boundary.json', '{}\n')
    commit(mergeFixture.repoRoot, 'allowlisted side boundary metadata', ['the-it-guy/config/legal-document-rollout-phase7-successor-implementation-boundary.json'])
    git(mergeFixture.repoRoot, ['checkout', '--quiet', 'phase7-main'])
    git(mergeFixture.repoRoot, ['merge', '--no-ff', '--no-edit', 'phase7-side'])
    const mergeFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
      repoRoot: mergeFixture.repoRoot,
      phase6ReceiptCommitSha: mergeFixture.phase6ReceiptCommitSha,
      implementationCommitSha: git(mergeFixture.repoRoot, ['rev-parse', 'HEAD']),
    })
    assert.equal(mergeFacts.implementationCommitDiffValid, false)
    assert.equal(mergeFacts.staticBoundaryValid, false)
  })
  withImmutableSourceFixture((modeFixture) => {
    fs.chmodSync(path.join(modeFixture.repoRoot, 'supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql'), 0o755)
    const modeChangeCommitSha = commit(modeFixture.repoRoot, 'make migration executable', ['supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql'])
    const modeFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
      repoRoot: modeFixture.repoRoot,
      phase6ReceiptCommitSha: modeFixture.phase6ReceiptCommitSha,
      implementationCommitSha: modeChangeCommitSha,
    })
    assert.equal(modeFacts.implementationCommitDiffValid, false)
    assert.equal(modeFacts.staticBoundaryValid, false)
  })
  withImmutableSourceFixture((symlinkFixture) => {
    const migrationPath = path.join(symlinkFixture.repoRoot, 'supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql')
    fs.mkdirSync(path.dirname(migrationPath), { recursive: true })
    fs.unlinkSync(migrationPath)
    fs.symlinkSync('untrusted-migration.sql', migrationPath)
    const symlinkCommitSha = commit(symlinkFixture.repoRoot, 'add migration symlink', ['supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql'])
    const symlinkFacts = collectLegalDocumentRolloutPhase7StaticBoundaryFacts({
      repoRoot: symlinkFixture.repoRoot,
      phase6ReceiptCommitSha: symlinkFixture.phase6ReceiptCommitSha,
      implementationCommitSha: symlinkCommitSha,
    })
    assert.equal(symlinkFacts.implementationCommitDiffValid, false)
    assert.equal(symlinkFacts.migrationSourceDigest, null)
    assert.equal(symlinkFacts.migrationInvariantsValid, false)
    assert.equal(symlinkFacts.staticBoundaryValid, false)
  })

  const phase6History = recordedPhase6History(fixture.phase6ReceiptCommitSha)
  const pending = createPendingLegalDocumentRolloutPhase7Receipt({
    phase6History,
    staticBoundaryFacts: safeFacts,
    preparedByReference: 'release_manager_01',
    changeReference: 'REL-008',
    preparedAt,
  })
  const ready = assessLegalDocumentRolloutPhase7({ receipt: pending, phase6History, staticBoundaryFacts: safeFacts, now })
  assert.equal(ready.status, 'IMPLEMENTATION_BOUNDARY_READY')
  assert.equal(ready.blockerCount, 0)
  assert.equal(ready.pendingCount, 1)
  assert.equal(ready.mutatedData, false)
  assert.ok(ready.doesNotAuthorize.includes('phase6_epoch_preparation_or_membership_registration'))
  assert.ok(ready.doesNotAuthorize.includes('customer_document_generation_or_email_delivery'))

  const finalized = finalizeLegalDocumentRolloutPhase7Receipt({
    pendingPlan: pending,
    phase6History,
    staticBoundaryFacts: safeFacts,
    evidenceInput: phase7Evidence(),
    now,
  })
  const recorded = assessLegalDocumentRolloutPhase7({ receipt: finalized, phase6History, staticBoundaryFacts: safeFacts, now })
  assert.equal(recorded.status, 'IMPLEMENTATION_BOUNDARY_RECORDED')
  assert.equal(recorded.blockerCount, 0)
  assert.equal(recorded.pendingCount, 0)

  const unsafeBoundary = clone(pending)
  unsafeBoundary.changeSurface.runtime = 'runtime_guard_changed'
  unsafeBoundary.safety.noDeploymentAuthorization = false
  unsafeBoundary.source.boundaryPlanDigest = rolloutPhase7BoundaryPlanDigest(unsafeBoundary)
  unsafeBoundary.manifestDigest = rolloutPhase7ManifestDigest(unsafeBoundary)
  const unsafeReport = assessLegalDocumentRolloutPhase7({ receipt: unsafeBoundary, phase6History, staticBoundaryFacts: safeFacts, now })
  assert.ok(codes(unsafeReport).includes('P7_NON_EXECUTABLE_BOUNDARY_INVALID'))
  assert.ok(codes(unsafeReport).includes('P7_NO_AUTHORITY_BOUNDARY_INVALID'))

  assert.throws(
    () => finalizeLegalDocumentRolloutPhase7Receipt({
      pendingPlan: pending,
      phase6History,
      staticBoundaryFacts: safeFacts,
      evidenceInput: {
        ...phase7Evidence(),
        architectureReview: { ...phase7Evidence().architectureReview, actorReference: 'Architecture Reviewer' },
      },
      now,
    }),
    /opaque actor reference|redacted SHA/i,
    'Human-readable reviewer names must never be accepted as opaque actor references.',
  )
  assert.throws(
    () => finalizeLegalDocumentRolloutPhase7Receipt({
      pendingPlan: pending,
      phase6History,
      staticBoundaryFacts: safeFacts,
      evidenceInput: {
        ...phase7Evidence(),
        securityReview: { ...phase7Evidence().securityReview, emailAddress: 'reviewer@example.test' },
      },
      now,
    }),
    /must contain only|forbidden sensitive/i,
    'Evidence must reject PII-bearing fields even when the rest of the review is valid.',
  )
  assert.throws(
    () => finalizeLegalDocumentRolloutPhase7Receipt({
      pendingPlan: pending,
      phase6History,
      staticBoundaryFacts: safeFacts,
      evidenceInput: {
        ...phase7Evidence(),
        nonActivationReview: { ...phase7Evidence().nonActivationReview, organisationId },
      },
      now,
    }),
    /must contain only|forbidden sensitive/i,
    'Organisation identifiers are prohibited from redacted Phase 7 evidence.',
  )
  assert.throws(
    () => finalizeLegalDocumentRolloutPhase7Receipt({
      pendingPlan: pending,
      phase6History,
      staticBoundaryFacts: safeFacts,
      evidenceInput: {
        ...phase7Evidence(),
        boundaryRecordedByReference: 'reviewer@example.test',
      },
      now,
    }),
    /safe opaque references/i,
    'Email addresses are not acceptable evidence actor references.',
  )

  const outputPath = path.join(fixture.repoRoot, 'phase7-canonical-receipt.json')
  const inertPlaceholder = fs.readFileSync(new URL('../config/legal-document-rollout-phase7-successor-implementation-boundary.json', import.meta.url), 'utf8')
  fs.writeFileSync(outputPath, inertPlaceholder, { mode: 0o644 })
  fs.chmodSync(outputPath, 0o644)
  const serialized = `${JSON.stringify(finalized, null, 2)}\n`
  writeCanonicalPhase7ReceiptAtomically(outputPath, serialized)
  assert.equal(fs.readFileSync(outputPath, 'utf8'), serialized)
  assert.equal(fs.lstatSync(outputPath).mode & 0o777, 0o644)
  assert.equal(fs.existsSync(`${outputPath}.phase7.lock`), false)
  assert.equal(fs.existsSync(`${outputPath}.phase7-${process.pid}.tmp`), false)
  assert.throws(
    () => writeCanonicalPhase7ReceiptAtomically(outputPath, serialized),
    /not the exact inert placeholder preimage|no longer an inert not_recorded placeholder/i,
    'A finalized canonical receipt must never be overwritten by a repeat finalization.',
  )

  const policySource = fs.readFileSync(new URL('./legal-document-rollout-phase7-policy.mjs', import.meta.url), 'utf8')
  const staticBoundarySource = fs.readFileSync(new URL('./legal-document-rollout-phase7-static-boundary.mjs', import.meta.url), 'utf8')
  const finalizerSource = fs.readFileSync(new URL('./legal-document-rollout-phase7-finalize.mjs', import.meta.url), 'utf8')
  for (const source of [policySource, staticBoundarySource, finalizerSource]) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|fetch\(|npx\s+supabase|secrets\s+(?:list|set)/)
  }
  assert.match(finalizerSource, /RECORD_PHASE7_IMPLEMENTATION_BOUNDARY/)
  assert.match(finalizerSource, /writeCanonicalPhase7ReceiptAtomically/)
  assert.match(finalizerSource, /fs\.renameSync\(temporaryPath, outputPath\)/)

  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  for (const scriptName of [
    'test:legal-documents:rollout-phase7',
    'plan:legal-documents:rollout-phase7',
    'work-order:legal-documents:rollout-phase7',
    'finalize:legal-documents:rollout-phase7',
    'verify:legal-documents:rollout-phase7',
  ]) assert.ok(packageJson.scripts?.[scriptName], `Missing ${scriptName}`)

  console.log('Legal-document rollout Phase 7 implementation-boundary contract passed.')
} finally {
  fs.rmSync(fixture.repoRoot, { recursive: true, force: true })
}
