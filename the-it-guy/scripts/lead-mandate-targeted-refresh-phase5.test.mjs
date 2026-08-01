import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function sliceBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `${label} start not found: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start)
  assert.ok(end > start, `${label} end not found: ${endNeedle}`)
  return source.slice(start, end)
}

const helperBlock = sliceBetween(
  agencyPage,
  'async function refreshSelectedLeadMandateTarget',
  'const selectedLeadOnboardingStatusKey',
  'targeted refresh helper',
)
for (const token of [
  'patchSelectedLeadRecord',
  'Promise.all',
  'resolveDocumentPacketStatus',
  'listLegalDocumentJobsForPacket',
  'findLatestMandateSendJob',
  'findLatestMandateGenerationJob',
  'setMandatePacketStatus',
]) {
  assert.ok(helperBlock.includes(token), `Targeted mandate refresh helper must include: ${token}`)
}

const generateBlock = sliceBetween(
  agencyPage,
  'async function handleGenerateMandateFromSellerLead',
  'async function handleCreateListingFromSellerLead',
  'mandate generate handler',
)
assert.ok(
  generateBlock.includes('phase5_post_generate_targeted_refresh') &&
    generateBlock.includes('refreshSelectedLeadMandateTarget'),
  'Mandate generation should use the Phase 5 targeted refresh helper.',
)
assert.ok(
  !generateBlock.includes('reloadRecords(') &&
    !generateBlock.includes('scheduleRecordsReload('),
  'Mandate generation should not reload the full pipeline after generate.',
)

const sendBlock = sliceBetween(
  agencyPage,
  'async function handleSendMandateToSeller',
  'function openSelectedLeadMandateWorkspace',
  'mandate send handler',
)
assert.ok(
  sendBlock.includes('phase5_signature_send_job_queued_targeted_refresh') &&
    sendBlock.includes('phase5_post_send_targeted_refresh') &&
    sendBlock.includes("mandateStatus: 'sending'") &&
    sendBlock.includes('refreshSelectedLeadMandateTarget'),
  'Mandate sending should refresh only packet/job/signing/lead status.',
)
assert.ok(
  !sendBlock.includes('reloadRecords(') &&
    !sendBlock.includes('scheduleRecordsReload('),
  'Mandate sending should not reload the full pipeline after send.',
)

const workspacePropBlock = sliceBetween(
  agencyPage,
  'onRefreshContext={async () => {',
  'autoGenerateEnabled={legalWorkspaceOpen}',
  'mandate workspace refresh prop',
)
assert.ok(
  workspacePropBlock.includes('phase5_workspace_context_targeted_refresh') &&
    workspacePropBlock.includes('refreshSelectedLeadMandateTarget'),
  'Mandate workspace refresh context should be targeted.',
)
assert.ok(!workspacePropBlock.includes('reloadRecords('), 'Mandate workspace refresh context should not reload all records.')

assert.ok(
  agencyPage.includes("mandateStatus: 'sent_for_signature'") &&
    agencyPage.includes('targeted lead mandate status update skipped after background send'),
  'Background send polling should update only the selected lead mandate status when the job succeeds.',
)

assert.equal(
  packageJson.scripts?.['test:lead-mandate-targeted-refresh-phase5'],
  'node scripts/lead-mandate-targeted-refresh-phase5.test.mjs',
)

console.log('Lead mandate targeted refresh phase 5 contract passed.')
