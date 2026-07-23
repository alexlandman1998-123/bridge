import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function getFunctionBlock(name) {
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

assert.equal(
  packageJson.scripts?.['test:lead-mandate-quick-start'],
  'node scripts/lead-mandate-quick-start.test.mjs',
  'package.json should expose the lead mandate quick-start regression.',
)

assert.ok(
  !appSource.includes("import('./pages/AgentLeadsPage')"),
  'The retired AgentLeadsPage should not be mounted through App routes.',
)
assert.match(
  appSource,
  /path="\/pipeline\/leads"[\s\S]{0,180}<Pipeline initialAgentViewMode="leads" \/>/,
  'The canonical leads list route should use the unified pipeline workspace.',
)
assert.match(
  appSource,
  /path="\/pipeline\/leads\/:leadId"[\s\S]{0,180}<Pipeline initialAgentViewMode="leads" \/>/,
  'The canonical lead detail route should use the unified pipeline workspace.',
)

for (const reference of [
  'function resolveMandateQuickStartPrimaryLabel',
  'function resolveMandateQuickStartIntro',
  'function resolveOtpQuickStartPrimaryLabel',
  'function resolveOtpQuickStartIntro',
  'const [mandateQuickStartOpen, setMandateQuickStartOpen] = useState(false)',
  'const [mandateQuickStartBusy, setMandateQuickStartBusy] = useState(false)',
  'const [otpQuickStartOpen, setOtpQuickStartOpen] = useState(false)',
  'const [otpQuickStartBusy, setOtpQuickStartBusy] = useState(false)',
  'const selectedLeadMandateQuickStartRows = useMemo',
  'const selectedLeadMandateQuickStartBlockers = useMemo',
  'const selectedLeadMandateQuickStartWarnings = useMemo',
  'const selectedLeadOtpQuickStartRows = useMemo',
  'const selectedLeadOtpQuickStartBlockers = useMemo',
  'const selectedLeadOtpQuickStartWarnings = useMemo',
  'title="Confirm OTP details"',
  'title="Confirm mandate details"',
  'Edit Offer / Terms',
  'Edit Wording / Terms',
  'autoGenerateEnabled={false}',
]) {
  assert.ok(source.includes(reference), `AgencyPipelinePage should keep ${reference}.`)
}

const primaryActionBlock = getFunctionBlock('handleSelectedLeadMandatePrimaryAction')
assert.ok(
  primaryActionBlock.includes("if (['view', 'view_signed'].includes(actionKey))"),
  'View actions should keep opening the existing workspace path.',
)
assert.ok(
  primaryActionBlock.includes('setMandateQuickStartOpen(true)'),
  'Generate/edit/send actions should open the confirmation modal.',
)
assert.ok(
  !primaryActionBlock.includes('setLegalWorkspaceOpen(true)'),
  'Generate/edit/send actions should not open the full document workspace directly.',
)

const quickStartBlock = getFunctionBlock('handleMandateQuickStartGenerateAndSend')
for (const reference of [
  'selectedLeadMandateQuickStartBlockers.length',
  'handleGenerateMandateFromSellerLead',
  'handleSendMandateToSeller({ packetId: mandatePacketId })',
  'setMandateQuickStartOpen(false)',
]) {
  assert.ok(quickStartBlock.includes(reference), `Quick start flow should keep ${reference}.`)
}

const otpActionBlock = getFunctionBlock('handleSelectedLeadOtpPrimaryAction')
assert.ok(
  otpActionBlock.includes('setOtpQuickStartOpen(true)'),
  'Generate OTP actions should open the confirmation modal.',
)

const otpQuickStartBlock = getFunctionBlock('handleOtpQuickStartGenerateAndSend')
for (const reference of [
  'selectedLeadOtpQuickStartBlockers.length',
  'createAndSendOfferLinkForLead',
  "successPrefix: 'OTP '",
  'setOtpQuickStartOpen(false)',
]) {
  assert.ok(otpQuickStartBlock.includes(reference), `OTP quick start flow should keep ${reference}.`)
}

const workspaceBlock = getFunctionBlock('openSelectedLeadMandateWorkspace')
for (const reference of [
  'resolveWorkspaceModeFromAction(actionKey)',
  'setMandateQuickStartOpen(false)',
  'setLegalWorkspaceOpen(true)',
]) {
  assert.ok(workspaceBlock.includes(reference), `Editor escape hatch should keep ${reference}.`)
}

console.log('lead mandate quick-start regression passed')
