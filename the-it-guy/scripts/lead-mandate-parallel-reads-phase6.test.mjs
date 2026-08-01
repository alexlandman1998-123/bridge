import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencyPage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const privateListingService = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function sliceBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle)
  assert.ok(start >= 0, `${label} start not found: ${startNeedle}`)
  const end = source.indexOf(endNeedle, start)
  assert.ok(end > start, `${label} end not found: ${endNeedle}`)
  return source.slice(start, end)
}

const generateBlock = sliceBetween(
  agencyPage,
  'async function handleGenerateMandateFromSellerLead',
  'async function handleCreateListingFromSellerLead',
  'mandate generate handler',
)

assert.match(
  generateBlock,
  /const \[onboardingContext, existingPacketForGeneration\] = await Promise\.all\(\[[\s\S]+getSellerOnboardingByToken\(onboardingToken[\s\S]+fetchExistingMandatePacket\(\)[\s\S]+\]\)/,
  'Mandate generation should read seller onboarding and existing packet in parallel.',
)
assert.ok(
  generateBlock.indexOf('const [onboardingContext, existingPacketForGeneration] = await Promise.all([') <
    generateBlock.indexOf('const phase2DraftReuse = resolvePhase2FrozenMandateDraftReuse'),
  'Mandate generation should finish parallel reads before source-hash draft reuse decisions.',
)
assert.match(
  generateBlock,
  /resolveActiveTemplate\([\s\S]+mandateData[\s\S]+sourceContext: mandateData\?\.sourceContext/,
  'Template lookup should remain after mandate data mapping because it depends on resolved mandate data.',
)

const targetedRefreshBlock = sliceBetween(
  agencyPage,
  'async function refreshSelectedLeadMandateTarget',
  'const selectedLeadOnboardingStatusKey',
  'targeted refresh helper',
)
assert.match(
  targetedRefreshBlock,
  /const \[status, jobs\] = await Promise\.all\(\[[\s\S]+resolveDocumentPacketStatus[\s\S]+listLegalDocumentJobsForPacket/,
  'Targeted refresh should read packet/signing status and job status in parallel.',
)

const precreateBlock = sliceBetween(
  privateListingService,
  'export async function precreateSellerMandateDraftFromOnboarding',
  'export function isSellerPortalInviteReadyAfterSignedMandate',
  'seller onboarding draft precreation',
)
assert.match(
  precreateBlock,
  /const \[templateResolution, existingPacket\] = await Promise\.all\(\[[\s\S]+resolveActiveTemplate\([\s\S]+fetchDocumentPacket\(existingPacketId/,
  'Onboarding draft precreation should read selected template and existing packet in parallel.',
)
assert.ok(
  precreateBlock.indexOf('const [templateResolution, existingPacket] = await Promise.all([') <
    precreateBlock.indexOf('const existingStatus = normalizeKey(existingPacket?.status)'),
  'Draft precreation should finish parallel reads before packet lock checks.',
)

assert.equal(
  packageJson.scripts?.['test:lead-mandate-parallel-reads-phase6'],
  'node scripts/lead-mandate-parallel-reads-phase6.test.mjs',
)

console.log('Lead mandate parallel reads phase 6 contract passed.')
