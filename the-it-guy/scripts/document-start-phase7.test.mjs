import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const leadPage = await read('../src/pages/AgentLeadsPage.jsx')
const listingPage = await read('../src/pages/AgentListingDetail.jsx')
const workspacePage = await read('../src/pages/LegalDocumentWorkspacePage.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-7.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase7'],
  'node scripts/document-start-phase7.test.mjs',
  'package.json should expose the document-start Phase 7 audit.',
)

for (const reference of [
  'function buildAcceptedOfferOtpWorkspacePath',
  'DOCUMENT_START_ENTRY_POINTS.acceptedOfferOtp',
  'documentStart',
  'offerId',
  'Prepare OTP',
  '<StartDocumentModal',
  'startAcceptedOfferOtp',
]) {
  assertIncludes(leadPage, reference, `AgentLeadsPage should keep accepted-offer OTP wiring: ${reference}.`)
}

for (const reference of [
  'const [acceptedOfferOtpStartOffer, setAcceptedOfferOtpStartOffer] = useState(null)',
  'DOCUMENT_START_ENTRY_POINTS.acceptedOfferOtp',
  'accepted_offer_otp_start',
  'Prepare OTP',
  'handleStartAcceptedOfferOtpDocument',
  'buildAcceptedOfferOtpWorkspacePath',
]) {
  assertIncludes(listingPage, reference, `AgentListingDetail should keep listing accepted-offer OTP wiring: ${reference}.`)
}

for (const reference of [
  'const routeOfferId = normalizeText(params.offerId || searchParams.get(\'offerId\'))',
  'offerId: routeOfferId || null',
  "contextType: documentStartEntryPoint === 'accepted_offer_otp' ? 'accepted_offer' : 'transaction'",
]) {
  assertIncludes(workspacePage, reference, `LegalDocumentWorkspacePage should preserve accepted-offer context: ${reference}.`)
}

for (const reference of [
  'accepted-offer OTP start surface',
  'Prepare OTP',
  'documentStart=accepted_offer_otp',
  'offerId',
  'No packet schema change',
  'No duplicate OTP editor',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 7 rollout note should keep ${reference}.`)
}

console.log('document-start-phase7 audit passed')
