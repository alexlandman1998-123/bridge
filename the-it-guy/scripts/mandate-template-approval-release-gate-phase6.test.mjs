import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  PHASE4_B3_RELEASE_CONTRACT,
} from '../src/core/documents/legalTemplateApproval.js'
import {
  MANDATE_TEMPLATE_APPROVAL_RELEASE_GATE_VERSION,
  MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT,
  buildMandateTemplateApprovalReleaseGate,
  buildMandateTemplateVNextApprovalDigestPayload,
  formatMandateTemplateApprovalReleaseGateMarkdown,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-approval-release-gate-phase6'],
  'node scripts/mandate-template-approval-release-gate-phase6.test.mjs',
  'package.json should expose the mandate template approval release gate Phase 6 contract.',
)
assert.equal(
  packageJson.scripts?.['report:mandate-template-approval-release-gate'],
  'node scripts/report-mandate-template-approval-release-gate.mjs',
  'package.json should expose the mandate template approval release gate reporter.',
)

const sections = listMandateTemplateWordingVNextSections()
const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const payload = buildMandateTemplateVNextApprovalDigestPayload({ sections })
const expectedContentDigest = `sha256:${createHash('sha256').update(stringifyMandateTemplateApprovalDigestPayload(payload)).digest('hex')}`

assert.equal(payload.release_contract, MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT)
assert.equal(payload.runtime_release_contract, PHASE4_B3_RELEASE_CONTRACT)
assert.equal(payload.packet_type, 'mandate')
assert.equal(payload.sections.length, 16)
assert.ok(payload.sections.some((section) => section.section_key === 'introduction_purpose' && section.legal_text.includes('The Seller appoints')))
assert.ok(expectedContentDigest.startsWith('sha256:'))

const generatedAt = '2026-07-28T12:00:00.000Z'
const awaitingReport = buildMandateTemplateApprovalReleaseGate({
  sections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
})

assert.equal(awaitingReport.version, MANDATE_TEMPLATE_APPROVAL_RELEASE_GATE_VERSION)
assert.equal(awaitingReport.mutatedData, false)
assert.equal(awaitingReport.status, 'AWAITING_COUNSEL_APPROVAL')
assert.equal(awaitingReport.releaseAllowed, false)
assert.equal(awaitingReport.expectedContentDigest, expectedContentDigest)
assert.equal(awaitingReport.summary.preApprovalBlockerCount, 0)
assert.ok(awaitingReport.summary.approvalBlockerCount > 0)
assert.equal(awaitingReport.wording.status, 'WORDING_VNEXT_READY_FOR_COUNSEL_REVIEW')
assert.equal(awaitingReport.pdfLayout.status, 'PDF_LAYOUT_PRESERVED_AND_REFINED')
assert.equal(awaitingReport.publishGate.canPublish, true)
assert.equal(awaitingReport.dataSourceMap.unmappedFields.length, 0)
assert.equal(awaitingReport.checks.find((check) => check.code === 'PHASE6_DATA_SOURCE_FIELDS_MAPPED')?.pass, true)
assert.equal(awaitingReport.approvalChecks.find((check) => check.code === 'PHASE6_COUNSEL_APPROVAL_EVIDENCE_PRESENT')?.pass, false)
assert.equal(awaitingReport.approvalChecks.find((check) => check.code === 'PHASE6_B3_RELEASE_CONTRACT_BOUND')?.pass, false)

const staleReport = buildMandateTemplateApprovalReleaseGate({
  sections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
  approvalEvidence: {
    status: 'approved',
    approvedAt: generatedAt,
    reference: 'COUNSEL-MANDATE-VNEXT-001',
    contentDigest: 'sha256:stale',
    reviewEvidenceDigest: 'sha256:review-evidence',
    b1ManifestDigest: 'sha256:b1-manifest',
    b3AppliedAt: generatedAt,
    b3AppliedBy: 'service_role',
    b3ApplicationReference: 'B3-MANDATE-VNEXT-001',
    phase4B3ReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
  },
})

assert.equal(staleReport.status, 'RELEASE_BLOCKED_APPROVAL_EVIDENCE')
assert.equal(staleReport.releaseAllowed, false)
assert.equal(staleReport.summary.preApprovalBlockerCount, 0)
assert.equal(staleReport.approvalChecks.find((check) => check.code === 'PHASE6_COUNSEL_DIGEST_MATCHES_VNEXT')?.pass, false)

const approvedReport = buildMandateTemplateApprovalReleaseGate({
  sections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
  approvalEvidence: {
    status: 'approved',
    approvedAt: generatedAt,
    reference: 'COUNSEL-MANDATE-VNEXT-001',
    contentDigest: expectedContentDigest,
    reviewEvidenceDigest: 'sha256:review-evidence',
    b1ManifestDigest: 'sha256:b1-manifest',
    b3AppliedAt: generatedAt,
    b3AppliedBy: 'service_role',
    b3ApplicationReference: 'B3-MANDATE-VNEXT-001',
    phase4B3ReleaseContract: PHASE4_B3_RELEASE_CONTRACT,
  },
})

assert.equal(approvedReport.status, 'RELEASE_GATE_PASSED')
assert.equal(approvedReport.releaseAllowed, true)
assert.equal(approvedReport.summary.preApprovalBlockerCount, 0)
assert.equal(approvedReport.summary.approvalBlockerCount, 0)
for (const code of [
  'PHASE6_WORDING_READY_FOR_COUNSEL',
  'PHASE6_PDF_LAYOUT_GATE_PASSED',
  'PHASE6_CONTENT_PUBLISH_GATE_PASSED',
  'PHASE6_DATA_SOURCE_FIELDS_MAPPED',
  'PHASE6_SECTIONS_VERSIONED',
  'PHASE6_SECTIONS_LAYOUT_CONTRACTED',
]) {
  assert.equal(approvedReport.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}
for (const code of [
  'PHASE6_COUNSEL_DECISION_APPROVED',
  'PHASE6_COUNSEL_DIGEST_MATCHES_VNEXT',
  'PHASE6_COUNSEL_REVIEW_EVIDENCE_DIGEST_PRESENT',
  'PHASE6_B1_MANIFEST_BOUND',
  'PHASE6_B3_APPLICATION_TIME_PRESENT',
  'PHASE6_B3_RELEASE_CONTRACT_BOUND',
]) {
  assert.equal(approvedReport.approvalChecks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

const markdown = formatMandateTemplateApprovalReleaseGateMarkdown(awaitingReport)
for (const token of [
  'Mandate Template vNext Phase 6 Approval and Release Gate',
  'AWAITING_COUNSEL_APPROVAL',
  PHASE4_B3_RELEASE_CONTRACT,
  'service-owned B3',
  'does not mutate live data',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/mandateTemplateApprovalReleaseGate.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_APPROVAL_RELEASE_GATE_VERSION',
  'MANDATE_TEMPLATE_VNEXT_RELEASE_CONTRACT',
  'buildMandateTemplateApprovalReleaseGate',
  'buildMandateTemplateVNextApprovalDigestPayload',
  'formatMandateTemplateApprovalReleaseGateMarkdown',
  'PHASE6_COUNSEL_DIGEST_MATCHES_VNEXT',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('Mandate template approval release gate Phase 6 contract passed.')
