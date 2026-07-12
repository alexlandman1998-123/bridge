import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const app = await read('../src/App.jsx')
const listingPage = await read('../src/pages/AgentListings.jsx')
const listingDetail = await read('../src/pages/AgentListingDetail.jsx')
const workspacePage = await read('../src/pages/LegalDocumentWorkspacePage.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-4.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase4'],
  'node scripts/document-start-phase4.test.mjs',
  'package.json should expose the document-start Phase 4 audit.',
)

for (const reference of [
  'path="/agent/listings/:listingId/legal/:packetType"',
  '<LegalDocumentWorkspacePage />',
]) {
  assertIncludes(app, reference, `App should keep listing legal workspace route ${reference}.`)
}

for (const reference of [
  "DOCUMENT_START_ENTRY_POINTS",
  "DOCUMENT_START_SOURCE_MODES",
  "function buildListingMandateWorkspacePath",
  "params.set('mode', 'generate')",
  "params.set('sourceMode', DOCUMENT_START_SOURCE_MODES.saved)",
  "params.set('documentStart', DOCUMENT_START_ENTRY_POINTS.listingMandate)",
  "params.set('listingId', listingId)",
  "Generate Mandate",
  "openListingMandateWorkspace(card, event)",
]) {
  assertIncludes(listingPage, reference, `AgentListings should keep listing-page mandate entry point ${reference}.`)
}

for (const reference of [
  "import StartDocumentModal from '../components/documents/StartDocumentModal'",
  'DOCUMENT_START_ENTRY_POINTS.listingMandate',
  'DOCUMENT_START_PACKET_TYPES.mandate',
  'DOCUMENT_START_SOURCE_MODES.saved',
  'const [mandateStartOpen, setMandateStartOpen] = useState(false)',
  'function resolveSellerLeadIdFromListing',
  'const listingMandateStartSummary = useMemo',
  'async function handleStartListingMandateDocument',
  'setMandateStartOpen(true)',
  "params.set('listingId', String(listingRecord.id))",
  "params.set('sourceMode', sourceMode)",
  "params.set('documentStart', DOCUMENT_START_ENTRY_POINTS.listingMandate)",
  "navigate(`/agent/listings/${encodeURIComponent(String(listingRecord.id))}/legal/mandate?${params.toString()}`)",
  '<StartDocumentModal',
  'Create Mandate',
  'Start from saved listing details, enter the missing fields manually, or send seller onboarding.',
]) {
  assertIncludes(listingDetail, reference, `AgentListingDetail should keep Phase 4 listing mandate wiring ${reference}.`)
}

for (const reference of [
  'const routeListingId = normalizeText(params.listingId || searchParams.get(\'listingId\'))',
  'fetchListingContextFromSupabase',
  'mapPrivateListingToLeadContext',
  'mergeLeadContextWithListingContext',
  'const safeIncomingLeadId = incomingLeadId && incomingLeadId !== listingId ? incomingLeadId : \'\'',
  'listingId: routeListingId',
  'A transaction, packet, lead, or listing reference is required',
  'Listing lookup is taking too long.',
  'listingId: sourceListingId || null',
  "backLabel={routeListingId && !transactionId ? 'Back to Listing'",
]) {
  assertIncludes(workspacePage, reference, `LegalDocumentWorkspacePage should keep listing context support ${reference}.`)
}

for (const reference of [
  'Listing Create Mandate entry point',
  'Start Document modal',
  'listing-scoped legal workspace route',
  'No schema change',
  'No duplicate mandate editor',
  'No fake lead ID',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 4 rollout note should keep ${reference}.`)
}

console.log('document-start-phase4 audit passed')
