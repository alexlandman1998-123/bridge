import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildCrossModuleDocumentConsistencyAudit,
  buildCrossModuleDocumentConsistencyReviewPacket,
  getDefaultCrossModuleDocumentTouchpointRows,
  renderCrossModuleDocumentConsistencyReviewRunbook,
} from '../src/services/documents/crossModuleDocumentConsistencyService.js'

const brokenAudit = buildCrossModuleDocumentConsistencyAudit({
  includeDefinitionCoverage: false,
  generatedAt: '2026-07-13T12:00:00.000Z',
  touchpoints: [
    ...getDefaultCrossModuleDocumentTouchpointRows(),
    {
      touchpointKey: 'buyer_agency',
      documentKey: 'proof_of_address',
      groupKey: 'buyer_fica',
      parityGroup: 'seller_identity.proof_of_address',
      expectedCanonicalDocumentKey: 'seller_proof_of_address',
    },
  ],
})

const packet = buildCrossModuleDocumentConsistencyReviewPacket(brokenAudit, {
  source: 'phase_7_fixture',
  organisationId: '33333333-3333-4333-8333-333333333333',
  outputDir: '/tmp/cross-module-documents',
})

assert.equal(packet.version, 'cross_module_document_consistency_review_packet_v1')
assert.equal(packet.phase, '7')
assert.equal(packet.status, 'blocked')
assert.equal(packet.dryRun, true)
assert.equal(packet.mutatedData, false)
assert.equal(packet.gate.status, 'fail')
assert.equal(packet.repairPlan.canonicalMismatchCount > 0, true)
assert.equal(packet.repairPlan.mapCoverageCount, 0)
assert.ok(packet.repairPlan.canonicalMismatches.some((row) => row.touchpointKey === 'buyer_agency'))
assert.ok(packet.repairPlan.canonicalMismatches.some((row) => row.recommendedAction === 'repair_requirement_instance_or_touchpoint_key'))
assert.ok(packet.checklist.some((item) => item.key === 'resolve_canonical_mismatches' && item.done === false))
assert.ok(packet.operatorCommands.some((command) => command.includes('prepare:cross-module-documents')))
assert.equal(packet.operatorCommands.some((command) => command.includes('--apply')), false)
assert.ok(packet.artifacts.includes('cross-module-document-consistency-runbook.md'))

const readyPacket = buildCrossModuleDocumentConsistencyReviewPacket(buildCrossModuleDocumentConsistencyAudit())
assert.equal(readyPacket.status, 'ready')
assert.equal(readyPacket.gate.status, 'pass')
assert.equal(readyPacket.repairPlan.canonicalMismatchCount, 0)

const runbook = renderCrossModuleDocumentConsistencyReviewRunbook(packet)
assert.match(runbook, /# Cross-Module Document Consistency Review Packet/)
assert.match(runbook, /Mutated data: no/)
assert.match(runbook, /buyer_agency/)
assert.match(runbook, /Do not use the packet generator to apply repairs/)
assert.match(runbook, /Rerun `npm run verify:cross-module-documents`/)

const tempInput = path.join(os.tmpdir(), `cross-module-document-consistency-phase7-${Date.now()}.json`)
const outputDir = path.join(os.tmpdir(), `cross-module-document-consistency-phase7-output-${Date.now()}`)
fs.writeFileSync(tempInput, JSON.stringify(brokenAudit, null, 2))

const cliOutput = execFileSync(
  process.execPath,
  ['scripts/prepare-cross-module-document-consistency-packet.mjs', `--input=${tempInput}`, `--output-dir=${outputDir}`],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
)
const cliPacket = JSON.parse(cliOutput)
assert.equal(cliPacket.version, 'cross_module_document_consistency_review_packet_v1')
assert.equal(cliPacket.phase, '7')
assert.equal(cliPacket.repairPlan.canonicalMismatchCount > 0, true)
assert.equal(cliPacket.source, `file:${path.resolve(process.cwd(), tempInput)}`)

for (const fileName of [
  'cross-module-document-consistency-packet.json',
  'cross-module-document-consistency-audit.json',
  'cross-module-document-consistency-canonical-mismatches.json',
  'cross-module-document-consistency-map-coverage.json',
  'cross-module-document-consistency-module-warnings.json',
  'cross-module-document-consistency-query-warnings.json',
  'cross-module-document-consistency-runbook.md',
]) {
  assert.ok(fs.existsSync(path.join(outputDir, fileName)), `Expected ${fileName} artifact`)
}

const markdownOutput = execFileSync(
  process.execPath,
  ['scripts/prepare-cross-module-document-consistency-packet.mjs', `--input=${tempInput}`, '--markdown'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  },
)
assert.match(markdownOutput, /Cross-Module Document Consistency Review Packet/)
assert.match(markdownOutput, /Canonical mismatches: [1-9]/)

const cliSource = fs.readFileSync(path.resolve(process.cwd(), 'scripts/prepare-cross-module-document-consistency-packet.mjs'), 'utf8')
assert.match(cliSource, /--apply/)
assert.match(cliSource, /review packets are dry-run only/)

const packageSource = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
assert.match(packageSource, /"test:cross-module-document-consistency-phase7": "node scripts\/cross-module-document-consistency-phase7\.test\.mjs"/)
assert.match(packageSource, /"prepare:cross-module-documents": "node scripts\/prepare-cross-module-document-consistency-packet\.mjs"/)

console.log('cross-module document consistency Phase 7 packet tests passed')
