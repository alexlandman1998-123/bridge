import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const scriptSource = fs.readFileSync('scripts/document-request-phase14-cross-workspace-parity.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase14-cross-workspace-parity.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase14-cross-workspace-parity'],
  'node scripts/document-request-phase14-cross-workspace-parity.test.mjs',
  'package.json should expose the Phase 14 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase14-cross-workspace-parity'],
  'node scripts/document-request-phase14-cross-workspace-parity.mjs',
  'package.json should expose the Phase 14 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase14-cross-workspace-parity'],
  'npm run verify:document-request-phase13-parent-child-containers && npm run test:document-request-phase14-cross-workspace-parity && npm run report:document-request-phase14-cross-workspace-parity',
  'package.json should expose the Phase 14 verification command.',
)

assert.match(scriptSource, /document_request_phase14_cross_workspace_parity/, 'Phase 14 script should carry a stable marker.')
assert.match(scriptSource, /buildDocumentRequestContainerModel/, 'Phase 14 should verify the shared container model.')
assert.match(scriptSource, /buildBondApplicationCanonicalDocumentModel/, 'Phase 14 should verify bond child containers.')
assert.match(scriptSource, /buildDocumentRequestWorkspaceSmokeAudit/, 'Phase 14 should include additional-request container parity.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 14 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 14 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 14 report should not query database tables.')
assert.doesNotMatch(scriptSource, /\.(insert|upsert|update|delete)\(/, 'Phase 14 report should not mutate data.')
assert.doesNotMatch(scriptSource, /documentGenerator|generateDocument|legalDocument/, 'Phase 14 should not touch the document generator.')
assert.match(docs, /Cross-Workspace Parity QA/, 'Phase 14 docs should name the phase.')
assert.match(docs, /document generator/i, 'Phase 14 docs should state generator work is out of scope.')

const outputPath = 'output/document-request-phase14-cross-workspace-parity.test.json'
execFileSync('node', ['scripts/document-request-phase14-cross-workspace-parity.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase14_cross_workspace_parity')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'cross_workspace_parity_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.warnings.length, 0)
assert.equal(report.gate.mayProceedToPhase15, true)
assert.equal(report.gate.productionActivationReady, true)
assert.equal(report.phase13Status, 'parent_child_upload_containers_mapped')
assert.ok(report.bondParityScenarios.length >= 8)
assert.ok(report.sellerGroupingSummary.length > 0)
assert.equal(report.smokeSummary.failedSmokeCount, 0)
assert.equal(report.smokeSummary.unstableContainerIdCount, 0)
assert.equal(report.smokeSummary.deferredSellerUploadLeakCount, 0)

for (const scenario of report.bondParityScenarios) {
  assert.equal(scenario.ok, true, `${scenario.id} should pass cross-workspace parity.`)
  assert.ok(scenario.parentKeys.includes('income_affordability_documents'), `${scenario.id} should retain parent roll-up.`)
  assert.ok(scenario.splitParentKeys.includes('income_affordability_documents'), `${scenario.id} should mark finance parent as split.`)
  assert.equal(scenario.audienceKeys.buyer.includes('income_affordability_documents'), false, `${scenario.id} buyer should not upload broad finance parent.`)
  assert.equal(scenario.audienceKeys.bond_originator.includes('income_affordability_documents'), false, `${scenario.id} originator should not upload broad finance parent.`)
  assert.equal(scenario.audienceKeys.seller.some((key) => scenario.childContainerKeys.includes(key)), false, `${scenario.id} seller should not see buyer finance children.`)
  for (const key of scenario.childContainerKeys) {
    assert.ok(scenario.audienceKeys.buyer.includes(key), `${scenario.id} buyer missing ${key}.`)
    assert.ok(scenario.audienceKeys.agent.includes(key), `${scenario.id} agent missing ${key}.`)
    assert.ok(scenario.audienceKeys.attorney.includes(key), `${scenario.id} attorney missing ${key}.`)
    assert.ok(scenario.audienceKeys.bond_originator.includes(key), `${scenario.id} originator missing ${key}.`)
    assert.ok(scenario.audienceKeys.internal.includes(key), `${scenario.id} internal missing ${key}.`)
  }
}

for (const grouping of report.sellerGroupingSummary) {
  assert.equal(grouping.accepted, true, `${grouping.canonicalKey} should be an accepted grouped seller upload target.`)
}

console.log('document request phase 14 cross workspace parity tests passed')
