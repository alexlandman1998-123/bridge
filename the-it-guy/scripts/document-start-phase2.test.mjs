import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

function assertNotIncludes(source, needle, message) {
  assert.ok(!source.includes(needle), message)
}

function getFunctionBlock(source, name) {
  const declarationMatch = source.match(new RegExp(`(?:const\\s+${name}\\s*=\\s*useCallback|function\\s+${name})`))
  assert.ok(declarationMatch, `${name} should remain defined.`)

  const callbackBodyMarker = source.indexOf('=> {', declarationMatch.index)
  const bodyStart = callbackBodyMarker >= 0
    ? source.indexOf('{', callbackBodyMarker)
    : source.indexOf('{', declarationMatch.index)
  assert.notEqual(bodyStart, -1, `${name} should have a function body.`)

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart, index + 1)
  }

  assert.fail(`${name} should have a closed function body.`)
}

const packageJson = JSON.parse(await read('../package.json'))
const page = await read('../src/pages/AgentLeadsPage.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-2.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase2'],
  'node scripts/document-start-phase2.test.mjs',
  'package.json should expose the document-start Phase 2 audit.',
)

for (const reference of [
  "import StartDocumentModal from '../components/documents/StartDocumentModal'",
  'DOCUMENT_START_DOCUMENT_KINDS',
  'DOCUMENT_START_ENTRY_POINTS',
  'DOCUMENT_START_PACKET_TYPES',
  'DOCUMENT_START_SOURCE_MODES',
  'const [mandateStartOpen, setMandateStartOpen] = useState(false)',
  'const sellerMandateStartSummary = useMemo',
  'contextSummary={sellerMandateStartSummary}',
  'entryPoint={DOCUMENT_START_ENTRY_POINTS.sellerLeadMandate}',
  'packetType={DOCUMENT_START_PACKET_TYPES.mandate}',
  'documentKind={DOCUMENT_START_DOCUMENT_KINDS.standard}',
  'hasClientContact={Boolean(normalizeText(row.email || row.contact?.email || row.phone || row.contact?.phone))}',
  'onContinue={handleStartMandateDocument}',
]) {
  assertIncludes(page, reference, `AgentLeadsPage should keep Phase 2 wiring ${reference}.`)
}

const openMandateBlock = getFunctionBlock(page, 'openMandateWorkspace')
for (const reference of [
  'const mandateMeta = getSellerMandateMeta(row, linkedSellerListing, sellerJourney)',
  'if (!mandateMeta.hasRecord)',
  'setMandateStartOpen(true)',
  'const returnTo = `/pipeline/leads/${row.leadId}`',
  'navigate(`/pipeline/leads/${row.leadId}/legal/mandate?mode=${mandateMeta.mode}&returnTo=${returnTo}`)',
]) {
  assertIncludes(openMandateBlock, reference, `openMandateWorkspace should keep ${reference}.`)
}
assertNotIncludes(
  openMandateBlock,
  'Send seller onboarding and wait for the seller to submit their details before generating the mandate.',
  'openMandateWorkspace should not hard-block mandate generation behind seller onboarding.',
)

const startMandateBlock = getFunctionBlock(page, 'handleStartMandateDocument')
for (const reference of [
  'sourceMode === DOCUMENT_START_SOURCE_MODES.onboarding',
  'void sendSellerOnboardingForLead()',
  "params.set('mode', 'generate')",
  "params.set('sourceMode', sourceMode)",
  "params.set('documentStart', DOCUMENT_START_ENTRY_POINTS.sellerLeadMandate)",
  'navigate(`/pipeline/leads/${row.leadId}/legal/mandate?${params.toString()}`)',
]) {
  assertIncludes(startMandateBlock, reference, `handleStartMandateDocument should keep ${reference}.`)
}

assertIncludes(
  page,
  'Start the mandate with saved lead details, manual details, or seller onboarding.',
  'Seller Actions copy should explain all three start paths.',
)
assertIncludes(
  page,
  'Choose saved details, manual details, or seller onboarding.',
  'Seller Actions mandate CTA should explain the non-blocking choice.',
)
assertNotIncludes(
  page,
  'const mandateRequiresOnboarding = !mandateMeta.hasRecord && !sellerOnboardingIsSubmitted(onboardingStatus)',
  'Header action menu should no longer disable Generate Mandate behind onboarding.',
)
assertNotIncludes(
  page,
  'title={mandateRequiresOnboarding ?',
  'Header action menu should not show the old hard-block tooltip.',
)

for (const reference of [
  'Seller lead mandate entry point',
  'Saved details',
  'Manual details',
  'Ask client to complete',
  'No new packet engine',
  'No signing changes',
  'Legal Document Workspace',
]) {
  assertIncludes(rolloutDoc, reference, `Phase 2 rollout note should keep ${reference}.`)
}

console.log('document-start-phase2 audit passed')
