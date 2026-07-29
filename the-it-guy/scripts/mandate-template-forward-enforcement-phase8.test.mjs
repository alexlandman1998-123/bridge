import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PHASE4_B3_RELEASE_CONTRACT } from '../src/core/documents/legalTemplateApproval.js'
import {
  buildMandateTemplateVNextApprovalDigestPayload,
  stringifyMandateTemplateApprovalDigestPayload,
} from '../src/core/documents/mandateTemplateApprovalReleaseGate.js'
import {
  MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_CONTRACT,
  MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_VERSION,
  MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN,
  buildMandateTemplateForwardEnforcementReport,
  formatMandateTemplateForwardEnforcementMarkdown,
} from '../src/core/documents/mandateTemplateForwardEnforcement.js'
import {
  listMandateTemplateWordingVNextSections,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-forward-enforcement-phase8'],
  'node scripts/mandate-template-forward-enforcement-phase8.test.mjs',
  'package.json should expose the mandate template forward enforcement Phase 8 contract.',
)
assert.equal(
  packageJson.scripts?.['report:mandate-template-forward-enforcement'],
  'node scripts/report-mandate-template-forward-enforcement.mjs',
  'package.json should expose the mandate template forward enforcement reporter.',
)
assert.equal(
  packageJson.scripts?.['verify:mandate-template-vnext'],
  MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN.map((name) => `npm run ${name}`).join(' && '),
  'package.json should expose the full mandate vNext Phase 1-8 enforcement chain.',
)

const sections = listMandateTemplateWordingVNextSections()
const rendererSource = await readFile(new URL('../../supabase/functions/generate-mandate/index.ts', import.meta.url), 'utf8')
const expectedContentDigest = `sha256:${createHash('sha256').update(stringifyMandateTemplateApprovalDigestPayload(
  buildMandateTemplateVNextApprovalDigestPayload({ sections }),
)).digest('hex')}`
const generatedAt = '2026-07-28T12:00:00.000Z'
const approvalEvidence = {
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
}

const currentStateReport = buildMandateTemplateForwardEnforcementReport({
  packageScripts: packageJson.scripts,
  sections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
})

assert.equal(currentStateReport.version, MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_VERSION)
assert.equal(currentStateReport.contract, MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_CONTRACT)
assert.equal(currentStateReport.mutatedData, false)
assert.equal(currentStateReport.status, 'ENFORCEMENT_ACTIVE_RELEASE_BLOCKED')
assert.equal(currentStateReport.enforcementActive, true)
assert.equal(currentStateReport.releaseBlockedByApproval, true)
assert.equal(currentStateReport.summary.blockerCount, 0)
assert.equal(currentStateReport.releaseGate.status, 'AWAITING_COUNSEL_APPROVAL')
assert.equal(currentStateReport.organisationSync.status, 'SYNC_BLOCKED_PHASE6_GATE')
assert.ok(currentStateReport.summary.checkCount >= 30)

for (const code of [
  'PHASE8_VERIFY_CHAIN_BOUND',
  'PHASE8_REPORT_SCRIPT_PRESENT',
  'PHASE8_WORDING_GATE_STILL_PASSING',
  'PHASE8_PDF_LAYOUT_GATE_STILL_PASSING',
  'PHASE8_CLIENT_HEADINGS_STAY_CLEAN',
  'PHASE8_OPTIONAL_SECTIONS_STAY_BLANK_SAFE',
  'PHASE8_SIGNATURE_BODY_SUPPRESSION_ENFORCED',
  'PHASE8_RELEASE_GATE_FAILS_CLOSED',
  'PHASE8_ORGANISATION_SYNC_BOUND_TO_PHASE6',
  'PHASE8_ORGANISATION_SYNC_DRAFT_ONLY',
]) {
  assert.equal(currentStateReport.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

for (const scriptName of MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN) {
  assert.ok(packageJson.scripts?.[scriptName], `${scriptName} should be present.`)
}

const approvedSyncReport = buildMandateTemplateForwardEnforcementReport({
  packageScripts: packageJson.scripts,
  sections,
  rendererSource,
  approvalEvidence,
  expectedContentDigest,
  organisations: [{ id: 'org-1', name: 'Pilot Agency' }],
  generatedAt,
})

assert.equal(approvedSyncReport.status, 'ENFORCEMENT_ACTIVE')
assert.equal(approvedSyncReport.enforcementActive, true)
assert.equal(approvedSyncReport.releaseBlockedByApproval, false)
assert.equal(approvedSyncReport.summary.blockerCount, 0)
assert.equal(approvedSyncReport.releaseGate.releaseAllowed, true)
assert.equal(approvedSyncReport.organisationSync.status, 'SYNC_READY_FOR_DRAFT_CREATION')
assert.equal(approvedSyncReport.organisationSync.actionCount, 1)
assert.equal(approvedSyncReport.checks.find((check) => check.code === 'PHASE8_ORGANISATION_PAYLOADS_CANONICAL')?.pass, true)
assert.equal(approvedSyncReport.checks.find((check) => check.code === 'PHASE8_ORGANISATION_PAYLOADS_NOT_LIVE')?.pass, true)
assert.equal(approvedSyncReport.checks.find((check) => check.code === 'PHASE8_PHASE7_METADATA_ON_SYNCED_SECTIONS')?.pass, true)

const headingDriftSections = sections.map((section) => (
  section.section_key === 'parties'
    ? { ...section, section_label: 'Parties Packet' }
    : section
))
const headingDriftReport = buildMandateTemplateForwardEnforcementReport({
  packageScripts: packageJson.scripts,
  sections: headingDriftSections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
})

assert.equal(headingDriftReport.status, 'ENFORCEMENT_BROKEN')
assert.equal(headingDriftReport.enforcementActive, false)
assert.ok(headingDriftReport.blockers.some((check) => check.code === 'PHASE8_CLIENT_HEADINGS_STAY_CLEAN'))

const missingScriptReport = buildMandateTemplateForwardEnforcementReport({
  packageScripts: {
    ...packageJson.scripts,
    'verify:mandate-template-vnext': 'npm run test:mandate-template-forward-enforcement-phase8',
  },
  sections,
  rendererSource,
  expectedContentDigest,
  generatedAt,
})

assert.equal(missingScriptReport.status, 'ENFORCEMENT_BROKEN')
assert.ok(missingScriptReport.blockers.some((check) => check.code === 'PHASE8_VERIFY_CHAIN_BOUND'))

const markdown = formatMandateTemplateForwardEnforcementMarkdown(currentStateReport)
for (const token of [
  'Mandate Template vNext Phase 8 Enforcement Going Forward',
  'ENFORCEMENT_ACTIVE_RELEASE_BLOCKED',
  'verify:mandate-template-vnext',
  'non-mutating forward-enforcement guard',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/mandateTemplateForwardEnforcement.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_FORWARD_ENFORCEMENT_VERSION',
  'MANDATE_TEMPLATE_VNEXT_ENFORCEMENT_SCRIPT_CHAIN',
  'buildMandateTemplateForwardEnforcementReport',
  'formatMandateTemplateForwardEnforcementMarkdown',
  'PHASE8_ORGANISATION_SYNC_DRAFT_ONLY',
  'PHASE8_RELEASE_GATE_FAILS_CLOSED',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

assert.doesNotMatch(source, /\.insert\(/, 'Phase 8 enforcement core must not insert data.')
assert.doesNotMatch(source, /\.update\(/, 'Phase 8 enforcement core must not update data.')
assert.doesNotMatch(source, /\.upsert\(/, 'Phase 8 enforcement core must not upsert data.')
assert.doesNotMatch(source, /\.delete\(/, 'Phase 8 enforcement core must not delete data.')

console.log('Mandate template forward enforcement Phase 8 contract passed.')
