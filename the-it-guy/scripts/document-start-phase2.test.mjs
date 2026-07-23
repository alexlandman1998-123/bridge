import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

function getFunctionBlock(source, name) {
  const declarationMatch = source.match(new RegExp(`(?:async\\s+function|function)\\s+${name}\\s*\\(`))
  assert.ok(declarationMatch, `${name} should remain defined.`)

  const bodyStart = source.indexOf('{', declarationMatch.index)
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
const app = await read('../src/App.jsx')
const agencyPipeline = await read('../src/pages/agency/AgencyPipelinePage.jsx')
const rolloutDoc = await read('../docs/audits/document-start-phase-2.md')

assert.equal(
  packageJson.scripts?.['test:document-start-phase2'],
  'node scripts/document-start-phase2.test.mjs',
  'package.json should expose the document-start Phase 2 audit.',
)

assert.ok(
  !app.includes("import('./pages/AgentLeadsPage')"),
  'The retired AgentLeadsPage should not be mounted by App routes.',
)
assert.match(
  app,
  /path="\/pipeline\/leads"[\s\S]{0,180}<Pipeline initialAgentViewMode="leads" \/>/,
  'The lead list route should use the unified pipeline workspace.',
)
assert.match(
  app,
  /path="\/pipeline\/leads\/:leadId"[\s\S]{0,180}<Pipeline initialAgentViewMode="leads" \/>/,
  'The lead detail route should use the unified pipeline workspace.',
)
assert.match(
  app,
  /path="\/pipeline\/leads\/:leadId\/legal\/:packetType"[\s\S]{0,280}?<LegalDocumentWorkspacePage \/>/,
  'Explicit legal document URLs should still open the legal workspace.',
)

for (const reference of [
  'function resolveOtpQuickStartPrimaryLabel',
  'function resolveOtpQuickStartIntro',
  'function resolveMandateQuickStartPrimaryLabel',
  'function resolveMandateQuickStartIntro',
  'const selectedLeadOtpQuickStartRows = useMemo',
  'const selectedLeadOtpQuickStartBlockers = useMemo',
  'const selectedLeadOtpQuickStartWarnings = useMemo',
  'const selectedLeadMandateQuickStartRows = useMemo',
  'const selectedLeadMandateQuickStartBlockers = useMemo',
  'const selectedLeadMandateQuickStartWarnings = useMemo',
  'title="Confirm OTP details"',
  'title="Confirm mandate details"',
  'Edit Offer / Terms',
  'Edit Wording / Terms',
  'onGenerate={handleGenerateMandateFromSellerLead}',
  'onSend={handleSendMandateToSeller}',
  'autoGenerateEnabled={false}',
]) {
  assertIncludes(agencyPipeline, reference, `Unified lead workspace should keep ${reference}.`)
}

const primaryActionBlock = getFunctionBlock(agencyPipeline, 'handleSelectedLeadMandatePrimaryAction')
assertIncludes(
  primaryActionBlock,
  'setMandateQuickStartOpen(true)',
  'Lead mandate generate/edit/send should open the confirm modal first.',
)
assert.ok(
  !primaryActionBlock.includes('setLegalWorkspaceOpen(true)'),
  'Lead mandate generate/edit/send should not open the full legal workspace directly.',
)

const quickStartBlock = getFunctionBlock(agencyPipeline, 'handleMandateQuickStartGenerateAndSend')
for (const reference of [
  'handleGenerateMandateFromSellerLead',
  'handleSendMandateToSeller({ packetId: mandatePacketId })',
  'setMandateQuickStartOpen(false)',
]) {
  assertIncludes(quickStartBlock, reference, `Quick start flow should keep ${reference}.`)
}

const otpPrimaryActionBlock = getFunctionBlock(agencyPipeline, 'handleSelectedLeadOtpPrimaryAction')
assertIncludes(
  otpPrimaryActionBlock,
  'setOtpQuickStartOpen(true)',
  'Lead OTP generation should open the confirm modal first.',
)

const otpQuickStartBlock = getFunctionBlock(agencyPipeline, 'handleOtpQuickStartGenerateAndSend')
for (const reference of [
  'createAndSendOfferLinkForLead',
  "successPrefix: 'OTP '",
  'setOtpQuickStartOpen(false)',
]) {
  assertIncludes(otpQuickStartBlock, reference, `OTP quick start flow should keep ${reference}.`)
}

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
