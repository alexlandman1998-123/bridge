import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectRolloutSourceContinuity } from './legal-document-rollout-source-continuity.mjs'
import { collectLegalDocumentRolloutPhase1History } from './legal-document-rollout-phase1-history.mjs'
import { collectLegalDocumentRolloutPhase2History } from './legal-document-rollout-phase2-history.mjs'
import { collectLegalDocumentRolloutPhase3History } from './legal-document-rollout-phase3-history.mjs'

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return String(result.stdout || '').trim()
}

function write(repo, relativePath, content) {
  const absolute = path.join(repo, relativePath)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content)
}

function commit(repo, message, changes = {}) {
  for (const [relativePath, content] of Object.entries(changes)) write(repo, relativePath, content)
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-m', message])
  return git(repo, ['rev-parse', 'HEAD'])
}

function fixtureRepo({ includePhase3 = true, includePhase4 = true, includePhase5 = true } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-rollout-continuity-'))
  git(repo, ['init'])
  git(repo, ['config', 'user.email', 'release@example.test'])
  git(repo, ['config', 'user.name', 'Release Test'])
  const sourceFiles = {
    'runtime/source.txt': 'source-v1\n',
    'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"pending":true}\n',
    'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"pending":true}\n',
    'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"pending":true}\n',
  }
  if (includePhase3) sourceFiles['the-it-guy/config/legal-document-rollout-phase3-production-preflight.json'] = '{"pending":true}\n'
  if (includePhase4) sourceFiles['the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json'] = '{"pending":true}\n'
  if (includePhase5) sourceFiles['the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json'] = '{"pending":true}\n'
  const source = commit(repo, 'release source', sourceFiles)
  return { repo, source }
}

function recordPhase0ThroughPhase3(fixture) {
  commit(fixture.repo, 'freeze receipt', {
    'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
  })
  commit(fixture.repo, 'phase one pending receipt', {
    'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
  })
  commit(fixture.repo, 'phase one evidence receipt', {
    'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
  })
  commit(fixture.repo, 'phase two acceptance receipt', {
    'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
  })
  return commit(fixture.repo, 'phase three production preflight receipt', {
    'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"production_preflight_recorded"}\n',
  })
}

const exactFixture = fixtureRepo()
const exact = collectRolloutSourceContinuity({ repoRoot: exactFixture.repo, sourceCommit: exactFixture.source, currentCommit: exactFixture.source })
assert.equal(exact.status, 'EXACT')
assert.equal(exact.phase4ReceiptChangeCount, 0)
assert.equal(exact.phase5ReceiptChangeCount, 0)
fs.rmSync(exactFixture.repo, { recursive: true, force: true })

const validFixture = fixtureRepo()
commit(validFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
const phase1Receipt = commit(validFixture.repo, 'phase one receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging","manifestDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n',
})
const valid = collectRolloutSourceContinuity({ repoRoot: validFixture.repo, sourceCommit: validFixture.source, currentCommit: phase1Receipt })
assert.equal(valid.status, 'RECEIPT_ONLY_DESCENDANT')
assert.equal(valid.phase0FreezeChangeCount, 1)
assert.equal(valid.phase1ReceiptChangeCount, 1)
assert.equal(valid.phase2ReceiptChangeCount, 0)
assert.equal(valid.phase3ReceiptChangeCount, 0)
assert.equal(valid.phase4ReceiptChangeCount, 0)
assert.equal(valid.phase5ReceiptChangeCount, 0)
assert.equal(valid.commits.length, 2)
assert.deepEqual(collectLegalDocumentRolloutPhase1History({ repoRoot: validFixture.repo, sourceContinuity: valid }), {
  pendingReceiptManifestDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  pendingReceiptCommitSha: phase1Receipt,
  pendingReceiptStatus: 'pending_staging',
  pendingReceiptParentDigest: null,
})
fs.rmSync(validFixture.repo, { recursive: true, force: true })

const phase2Fixture = fixtureRepo()
commit(phase2Fixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(phase2Fixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(phase2Fixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
const phase2Receipt = commit(phase2Fixture.repo, 'phase two acceptance receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
})
const phase2Valid = collectRolloutSourceContinuity({ repoRoot: phase2Fixture.repo, sourceCommit: phase2Fixture.source, currentCommit: phase2Receipt })
assert.equal(phase2Valid.status, 'RECEIPT_ONLY_DESCENDANT')
assert.equal(phase2Valid.phase0FreezeChangeCount, 1)
assert.equal(phase2Valid.phase1ReceiptChangeCount, 2)
assert.equal(phase2Valid.phase2ReceiptChangeCount, 1)
assert.equal(phase2Valid.phase3ReceiptChangeCount, 0)
assert.equal(phase2Valid.phase4ReceiptChangeCount, 0)
assert.equal(phase2Valid.phase5ReceiptChangeCount, 0)
assert.deepEqual(collectLegalDocumentRolloutPhase2History({ repoRoot: phase2Fixture.repo, sourceContinuity: phase2Valid }), {
  receiptCommitSha: phase2Receipt,
  receiptManifestDigest: null,
  receiptStatus: 'acceptance_evidence_recorded',
  phase1ReceiptManifestDigest: null,
})
fs.rmSync(phase2Fixture.repo, { recursive: true, force: true })

const phase3Fixture = fixtureRepo()
commit(phase3Fixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(phase3Fixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(phase3Fixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
commit(phase3Fixture.repo, 'phase two acceptance receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded","manifestDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","source":{"phase1ReceiptManifestDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}\n',
})
const phase3Receipt = commit(phase3Fixture.repo, 'phase three production preflight receipt', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"production_preflight_recorded"}\n',
})
const phase3Valid = collectRolloutSourceContinuity({ repoRoot: phase3Fixture.repo, sourceCommit: phase3Fixture.source, currentCommit: phase3Receipt })
assert.equal(phase3Valid.status, 'RECEIPT_ONLY_DESCENDANT')
assert.equal(phase3Valid.phase0FreezeChangeCount, 1)
assert.equal(phase3Valid.phase1ReceiptChangeCount, 2)
assert.equal(phase3Valid.phase2ReceiptChangeCount, 1)
assert.equal(phase3Valid.phase3ReceiptChangeCount, 1)
assert.equal(phase3Valid.phase4ReceiptChangeCount, 0)
assert.equal(phase3Valid.phase5ReceiptChangeCount, 0)
assert.deepEqual(collectLegalDocumentRolloutPhase2History({ repoRoot: phase3Fixture.repo, sourceContinuity: phase3Valid }), {
  receiptCommitSha: phase3Valid.commits[3].sha,
  receiptManifestDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  receiptStatus: 'acceptance_evidence_recorded',
  phase1ReceiptManifestDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
})
fs.rmSync(phase3Fixture.repo, { recursive: true, force: true })

const phase4Fixture = fixtureRepo()
commit(phase4Fixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(phase4Fixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(phase4Fixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
const phase4Phase2Receipt = commit(phase4Fixture.repo, 'phase two acceptance receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded","manifestDigest":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","source":{"phase1ReceiptManifestDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}\n',
})
const phase4Phase3Receipt = commit(phase4Fixture.repo, 'phase three production preflight receipt', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': `${JSON.stringify({
    status: 'production_preflight_recorded',
    manifestDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    source: {
      phase2ReceiptManifestDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      phase2ReceiptCommitSha: phase4Phase2Receipt,
      commitSha: phase4Fixture.source,
    },
  })}\n`,
})
const phase4Receipt = commit(phase4Fixture.repo, 'phase four controlled pilot receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
const phase4Valid = collectRolloutSourceContinuity({ repoRoot: phase4Fixture.repo, sourceCommit: phase4Fixture.source, currentCommit: phase4Receipt })
assert.equal(phase4Valid.status, 'RECEIPT_ONLY_DESCENDANT')
assert.equal(phase4Valid.phase0FreezeChangeCount, 1)
assert.equal(phase4Valid.phase1ReceiptChangeCount, 2)
assert.equal(phase4Valid.phase2ReceiptChangeCount, 1)
assert.equal(phase4Valid.phase3ReceiptChangeCount, 1)
assert.equal(phase4Valid.phase4ReceiptChangeCount, 1)
assert.equal(phase4Valid.phase5ReceiptChangeCount, 0)
assert.equal(phase4Valid.commits.length, 6)
assert.deepEqual(collectLegalDocumentRolloutPhase3History({ repoRoot: phase4Fixture.repo, sourceContinuity: phase4Valid }), {
  receiptCommitSha: phase4Phase3Receipt,
  receiptManifestDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  receiptStatus: 'production_preflight_recorded',
  phase2ReceiptManifestDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  phase2ReceiptCommitSha: phase4Phase2Receipt,
  sourceCommitSha: phase4Fixture.source,
})
const phase5Receipt = commit(phase4Fixture.repo, 'phase five pilot observation receipt', {
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json': '{"status":"pilot_observation_recorded"}\n',
})
const phase5Valid = collectRolloutSourceContinuity({ repoRoot: phase4Fixture.repo, sourceCommit: phase4Fixture.source, currentCommit: phase5Receipt })
assert.equal(phase5Valid.status, 'RECEIPT_ONLY_DESCENDANT')
assert.equal(phase5Valid.phase0FreezeChangeCount, 1)
assert.equal(phase5Valid.phase1ReceiptChangeCount, 2)
assert.equal(phase5Valid.phase2ReceiptChangeCount, 1)
assert.equal(phase5Valid.phase3ReceiptChangeCount, 1)
assert.equal(phase5Valid.phase4ReceiptChangeCount, 1)
assert.equal(phase5Valid.phase5ReceiptChangeCount, 1)
assert.equal(phase5Valid.commits.length, 7)
fs.rmSync(phase4Fixture.repo, { recursive: true, force: true })

const phase4TooEarlyFixture = fixtureRepo()
commit(phase4TooEarlyFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
const phase4TooEarly = commit(phase4TooEarlyFixture.repo, 'phase four too early', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
const phase4TooEarlyResult = collectRolloutSourceContinuity({ repoRoot: phase4TooEarlyFixture.repo, sourceCommit: phase4TooEarlyFixture.source, currentCommit: phase4TooEarly })
assert.equal(phase4TooEarlyResult.status, 'INVALID')
assert.match(phase4TooEarlyResult.reason, /Phase 4 controlled-pilot receipt may be committed only after.*Phase 1.*Phase 2.*Phase 3/i)
fs.rmSync(phase4TooEarlyFixture.repo, { recursive: true, force: true })

const phase4MixedFixture = fixtureRepo()
recordPhase0ThroughPhase3(phase4MixedFixture)
const phase4Mixed = commit(phase4MixedFixture.repo, 'mixed phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":"rewritten"}\n',
})
const phase4MixedResult = collectRolloutSourceContinuity({ repoRoot: phase4MixedFixture.repo, sourceCommit: phase4MixedFixture.source, currentCommit: phase4Mixed })
assert.equal(phase4MixedResult.status, 'INVALID')
assert.match(phase4MixedResult.reason, /Phase 4 controlled-pilot receipt must be its own single-file/i)
fs.rmSync(phase4MixedFixture.repo, { recursive: true, force: true })

const phase4RewriteFixture = fixtureRepo()
recordPhase0ThroughPhase3(phase4RewriteFixture)
commit(phase4RewriteFixture.repo, 'phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
const phase4Rewritten = commit(phase4RewriteFixture.repo, 'rewrite phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"rewritten"}\n',
})
const phase4RewriteResult = collectRolloutSourceContinuity({ repoRoot: phase4RewriteFixture.repo, sourceCommit: phase4RewriteFixture.source, currentCommit: phase4Rewritten })
assert.equal(phase4RewriteResult.status, 'INVALID')
assert.match(phase4RewriteResult.reason, /Phase 4 controlled-pilot receipt may be followed only by.*Phase 5/i)
fs.rmSync(phase4RewriteFixture.repo, { recursive: true, force: true })

const postPhase4Fixture = fixtureRepo()
recordPhase0ThroughPhase3(postPhase4Fixture)
commit(postPhase4Fixture.repo, 'phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
const postPhase4 = commit(postPhase4Fixture.repo, 'post phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"illegal"}\n',
})
const postPhase4Result = collectRolloutSourceContinuity({ repoRoot: postPhase4Fixture.repo, sourceCommit: postPhase4Fixture.source, currentCommit: postPhase4 })
assert.equal(postPhase4Result.status, 'INVALID')
assert.match(postPhase4Result.reason, /Phase 4 controlled-pilot receipt may be followed only by.*Phase 5/i)
fs.rmSync(postPhase4Fixture.repo, { recursive: true, force: true })

const phase5TooEarlyFixture = fixtureRepo()
commit(phase5TooEarlyFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
const phase5TooEarly = commit(phase5TooEarlyFixture.repo, 'phase five too early', {
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json': '{"status":"pilot_observation_recorded"}\n',
})
const phase5TooEarlyResult = collectRolloutSourceContinuity({ repoRoot: phase5TooEarlyFixture.repo, sourceCommit: phase5TooEarlyFixture.source, currentCommit: phase5TooEarly })
assert.equal(phase5TooEarlyResult.status, 'INVALID')
assert.match(phase5TooEarlyResult.reason, /Phase 5 pilot-observation receipt may be committed only after.*Phase 1.*Phase 2, 3, and 4/i)
fs.rmSync(phase5TooEarlyFixture.repo, { recursive: true, force: true })

const phase5MixedFixture = fixtureRepo()
recordPhase0ThroughPhase3(phase5MixedFixture)
commit(phase5MixedFixture.repo, 'phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
const phase5Mixed = commit(phase5MixedFixture.repo, 'mixed phase five receipt', {
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json': '{"status":"pilot_observation_recorded"}\n',
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":"rewritten"}\n',
})
const phase5MixedResult = collectRolloutSourceContinuity({ repoRoot: phase5MixedFixture.repo, sourceCommit: phase5MixedFixture.source, currentCommit: phase5Mixed })
assert.equal(phase5MixedResult.status, 'INVALID')
assert.match(phase5MixedResult.reason, /Phase 5 pilot-observation receipt must be its own single-file/i)
fs.rmSync(phase5MixedFixture.repo, { recursive: true, force: true })

const phase5RewriteFixture = fixtureRepo()
recordPhase0ThroughPhase3(phase5RewriteFixture)
commit(phase5RewriteFixture.repo, 'phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
commit(phase5RewriteFixture.repo, 'phase five receipt', {
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json': '{"status":"pilot_observation_recorded"}\n',
})
const phase5Rewritten = commit(phase5RewriteFixture.repo, 'rewrite phase five receipt', {
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json': '{"status":"rewritten"}\n',
})
const phase5RewriteResult = collectRolloutSourceContinuity({ repoRoot: phase5RewriteFixture.repo, sourceCommit: phase5RewriteFixture.source, currentCommit: phase5Rewritten })
assert.equal(phase5RewriteResult.status, 'INVALID')
assert.match(phase5RewriteResult.reason, /No receipt commit may follow the one-time Phase 5 pilot-observation receipt/i)
fs.rmSync(phase5RewriteFixture.repo, { recursive: true, force: true })

const postPhase5Fixture = fixtureRepo()
recordPhase0ThroughPhase3(postPhase5Fixture)
commit(postPhase5Fixture.repo, 'phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
commit(postPhase5Fixture.repo, 'phase five receipt', {
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json': '{"status":"pilot_observation_recorded"}\n',
})
const postPhase5 = commit(postPhase5Fixture.repo, 'post phase five receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"illegal"}\n',
})
const postPhase5Result = collectRolloutSourceContinuity({ repoRoot: postPhase5Fixture.repo, sourceCommit: postPhase5Fixture.source, currentCommit: postPhase5 })
assert.equal(postPhase5Result.status, 'INVALID')
assert.match(postPhase5Result.reason, /No receipt commit may follow the one-time Phase 5 pilot-observation receipt/i)
fs.rmSync(postPhase5Fixture.repo, { recursive: true, force: true })

const phase5AddedFixture = fixtureRepo({ includePhase5: false })
recordPhase0ThroughPhase3(phase5AddedFixture)
commit(phase5AddedFixture.repo, 'phase four receipt', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
const phase5Added = commit(phase5AddedFixture.repo, 'phase five added after freeze', {
  'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json': '{"status":"pilot_observation_recorded"}\n',
})
const phase5AddedResult = collectRolloutSourceContinuity({ repoRoot: phase5AddedFixture.repo, sourceCommit: phase5AddedFixture.source, currentCommit: phase5Added })
assert.equal(phase5AddedResult.status, 'INVALID')
assert.match(phase5AddedResult.reason, /non-receipt path or file mode/i)
fs.rmSync(phase5AddedFixture.repo, { recursive: true, force: true })

const phase4AddedFixture = fixtureRepo({ includePhase4: false })
recordPhase0ThroughPhase3(phase4AddedFixture)
const phase4Added = commit(phase4AddedFixture.repo, 'phase four added after freeze', {
  'the-it-guy/config/legal-document-rollout-phase4-pilot-activation.json': '{"status":"pilot_activation_recorded"}\n',
})
const phase4AddedResult = collectRolloutSourceContinuity({ repoRoot: phase4AddedFixture.repo, sourceCommit: phase4AddedFixture.source, currentCommit: phase4Added })
assert.equal(phase4AddedResult.status, 'INVALID')
assert.match(phase4AddedResult.reason, /non-receipt path or file mode/i)
fs.rmSync(phase4AddedFixture.repo, { recursive: true, force: true })

const phase3TooEarlyFixture = fixtureRepo()
commit(phase3TooEarlyFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
const phase3TooEarly = commit(phase3TooEarlyFixture.repo, 'phase three too early', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"production_preflight_recorded"}\n',
})
const phase3TooEarlyResult = collectRolloutSourceContinuity({ repoRoot: phase3TooEarlyFixture.repo, sourceCommit: phase3TooEarlyFixture.source, currentCommit: phase3TooEarly })
assert.equal(phase3TooEarlyResult.status, 'INVALID')
assert.match(phase3TooEarlyResult.reason, /only after.*Phase 1.*Phase 2/i)
fs.rmSync(phase3TooEarlyFixture.repo, { recursive: true, force: true })

const phase3AddedFixture = fixtureRepo({ includePhase3: false })
commit(phase3AddedFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(phase3AddedFixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(phase3AddedFixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
commit(phase3AddedFixture.repo, 'phase two receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
})
const phase3Added = commit(phase3AddedFixture.repo, 'phase three added after freeze', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"production_preflight_recorded"}\n',
})
const phase3AddedResult = collectRolloutSourceContinuity({ repoRoot: phase3AddedFixture.repo, sourceCommit: phase3AddedFixture.source, currentCommit: phase3Added })
assert.equal(phase3AddedResult.status, 'INVALID')
assert.match(phase3AddedResult.reason, /non-receipt path or file mode/i)
fs.rmSync(phase3AddedFixture.repo, { recursive: true, force: true })

const phase3MixedFixture = fixtureRepo()
commit(phase3MixedFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(phase3MixedFixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(phase3MixedFixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
commit(phase3MixedFixture.repo, 'phase two receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
})
const phase3Mixed = commit(phase3MixedFixture.repo, 'mixed phase three receipt', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"production_preflight_recorded"}\n',
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":"rewritten"}\n',
})
const phase3MixedResult = collectRolloutSourceContinuity({ repoRoot: phase3MixedFixture.repo, sourceCommit: phase3MixedFixture.source, currentCommit: phase3Mixed })
assert.equal(phase3MixedResult.status, 'INVALID')
assert.match(phase3MixedResult.reason, /Phase 3 production-preflight receipt must be its own single-file/i)
fs.rmSync(phase3MixedFixture.repo, { recursive: true, force: true })

const phase3RewriteFixture = fixtureRepo()
commit(phase3RewriteFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(phase3RewriteFixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(phase3RewriteFixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
commit(phase3RewriteFixture.repo, 'phase two receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
})
commit(phase3RewriteFixture.repo, 'phase three receipt', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"production_preflight_recorded"}\n',
})
const phase3Rewritten = commit(phase3RewriteFixture.repo, 'rewrite phase three receipt', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"rewritten"}\n',
})
const phase3RewriteResult = collectRolloutSourceContinuity({ repoRoot: phase3RewriteFixture.repo, sourceCommit: phase3RewriteFixture.source, currentCommit: phase3Rewritten })
assert.equal(phase3RewriteResult.status, 'INVALID')
assert.match(phase3RewriteResult.reason, /Phase 3 production-preflight receipt may be recorded exactly once/i)
fs.rmSync(phase3RewriteFixture.repo, { recursive: true, force: true })

const postPhase3Fixture = fixtureRepo()
commit(postPhase3Fixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(postPhase3Fixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(postPhase3Fixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
commit(postPhase3Fixture.repo, 'phase two receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
})
commit(postPhase3Fixture.repo, 'phase three receipt', {
  'the-it-guy/config/legal-document-rollout-phase3-production-preflight.json': '{"status":"production_preflight_recorded"}\n',
})
const postPhase3 = commit(postPhase3Fixture.repo, 'post phase three receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"illegal"}\n',
})
const postPhase3Result = collectRolloutSourceContinuity({ repoRoot: postPhase3Fixture.repo, sourceCommit: postPhase3Fixture.source, currentCommit: postPhase3 })
assert.equal(postPhase3Result.status, 'INVALID')
assert.match(postPhase3Result.reason, /Phase 3 production-preflight receipt may be followed only by.*Phase 4/i)
fs.rmSync(postPhase3Fixture.repo, { recursive: true, force: true })

const phase2TooEarlyFixture = fixtureRepo()
commit(phase2TooEarlyFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
const phase2TooEarly = commit(phase2TooEarlyFixture.repo, 'phase two too early', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
})
const phase2TooEarlyResult = collectRolloutSourceContinuity({ repoRoot: phase2TooEarlyFixture.repo, sourceCommit: phase2TooEarlyFixture.source, currentCommit: phase2TooEarly })
assert.equal(phase2TooEarlyResult.status, 'INVALID')
assert.match(phase2TooEarlyResult.reason, /only after.*Phase 1/i)
fs.rmSync(phase2TooEarlyFixture.repo, { recursive: true, force: true })

const phase1FirstFixture = fixtureRepo()
const phase1First = commit(phase1FirstFixture.repo, 'phase one receipt too early', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"planned":true}\n',
})
const phase1FirstResult = collectRolloutSourceContinuity({ repoRoot: phase1FirstFixture.repo, sourceCommit: phase1FirstFixture.source, currentCommit: phase1First })
assert.equal(phase1FirstResult.status, 'INVALID')
assert.match(phase1FirstResult.reason, /first descendant.*Phase 0/i)
fs.rmSync(phase1FirstFixture.repo, { recursive: true, force: true })

const revertedSourceFixture = fixtureRepo()
commit(revertedSourceFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(revertedSourceFixture.repo, 'source change', { 'runtime/source.txt': 'unsafe-change\n' })
const reverted = commit(revertedSourceFixture.repo, 'source revert', { 'runtime/source.txt': 'source-v1\n' })
const revertedSource = collectRolloutSourceContinuity({ repoRoot: revertedSourceFixture.repo, sourceCommit: revertedSourceFixture.source, currentCommit: reverted })
assert.equal(revertedSource.status, 'INVALID')
assert.match(revertedSource.reason, /non-receipt path/i)
fs.rmSync(revertedSourceFixture.repo, { recursive: true, force: true })

const rewriteFixture = fixtureRepo()
commit(rewriteFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
const rewritten = commit(rewriteFixture.repo, 'rewrite freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":"rewritten"}\n',
})
const rewrittenFreeze = collectRolloutSourceContinuity({ repoRoot: rewriteFixture.repo, sourceCommit: rewriteFixture.source, currentCommit: rewritten })
assert.equal(rewrittenFreeze.status, 'INVALID')
assert.match(rewrittenFreeze.reason, /exactly once/i)
fs.rmSync(rewriteFixture.repo, { recursive: true, force: true })

const postEvidenceRewriteFixture = fixtureRepo()
commit(postEvidenceRewriteFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(postEvidenceRewriteFixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"planned":true}\n',
})
commit(postEvidenceRewriteFixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"evidence":"recorded"}\n',
})
const postEvidenceRewrite = commit(postEvidenceRewriteFixture.repo, 'rewrite evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"evidence":"rewritten"}\n',
})
const postEvidenceRewriteResult = collectRolloutSourceContinuity({ repoRoot: postEvidenceRewriteFixture.repo, sourceCommit: postEvidenceRewriteFixture.source, currentCommit: postEvidenceRewrite })
assert.equal(postEvidenceRewriteResult.status, 'INVALID')
assert.match(postEvidenceRewriteResult.reason, /further rewrites are not permitted/i)
fs.rmSync(postEvidenceRewriteFixture.repo, { recursive: true, force: true })

const phase2RewriteFixture = fixtureRepo()
commit(phase2RewriteFixture.repo, 'freeze receipt', {
  'the-it-guy/config/legal-document-rollout-phase0-freeze.json': '{"frozen":true}\n',
})
commit(phase2RewriteFixture.repo, 'phase one pending receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"pending_staging"}\n',
})
commit(phase2RewriteFixture.repo, 'phase one evidence receipt', {
  'the-it-guy/config/legal-document-rollout-phase1-staging.json': '{"status":"staging_evidence_recorded"}\n',
})
commit(phase2RewriteFixture.repo, 'phase two receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"acceptance_evidence_recorded"}\n',
})
const phase2Rewritten = commit(phase2RewriteFixture.repo, 'rewrite phase two receipt', {
  'the-it-guy/config/legal-document-rollout-phase2-staging-acceptance.json': '{"status":"rewritten"}\n',
})
const phase2RewriteResult = collectRolloutSourceContinuity({ repoRoot: phase2RewriteFixture.repo, sourceCommit: phase2RewriteFixture.source, currentCommit: phase2Rewritten })
assert.equal(phase2RewriteResult.status, 'INVALID')
assert.match(phase2RewriteResult.reason, /Phase 2 acceptance receipt may be recorded exactly once/i)
fs.rmSync(phase2RewriteFixture.repo, { recursive: true, force: true })

console.log('Legal-document rollout source-continuity contract passed.')
