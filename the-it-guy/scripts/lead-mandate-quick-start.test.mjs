import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const readinessSource = await readFile(new URL('../src/core/documents/mandateReadiness.js', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const { resolveMandateReadiness } = await import('../src/core/documents/mandateReadiness.js')

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
  'resolveMandateReadiness',
  'hasMandateSellerOnboardingSubmitted',
  'function resolveOtpQuickStartPrimaryLabel',
  'function resolveOtpQuickStartIntro',
  'const [mandateQuickStartOpen, setMandateQuickStartOpen] = useState(false)',
  'const [mandateQuickStartBusy, setMandateQuickStartBusy] = useState(false)',
  'const [otpQuickStartOpen, setOtpQuickStartOpen] = useState(false)',
  'const [otpQuickStartBusy, setOtpQuickStartBusy] = useState(false)',
  'const selectedLeadMandateReadiness = useMemo',
  'const selectedLeadMandateQuickStartRows = useMemo',
  'const selectedLeadMandateQuickStartBlockers = useMemo',
  'const selectedLeadMandateQuickStartWarnings = useMemo',
  'const selectedLeadOtpQuickStartRows = useMemo',
  'const selectedLeadOtpQuickStartBlockers = useMemo',
  'const selectedLeadOtpQuickStartWarnings = useMemo',
  'title="Confirm OTP details"',
  'title="Confirm mandate details"',
  'PreferredAttorneySelectionModal',
  'sellerAttorneyPickerOpen',
  'transferAttorneyPreferredPartnerId: preferredAttorneyId',
  'Listing Readiness Score',
  "{ key: 'seller', label: 'Seller', meta: '' }",
  "{ key: 'property', label: 'Property', meta: '' }",
  "{ key: 'mandate', label: 'Mandate', meta: '' }",
  "{ key: 'appointments', label: 'Appointments', meta: selectedLeadAppointments.length }",
  'data-testid="seller-journey-rail"',
  'gridTemplateColumns: `repeat(${Math.max(selectedSellerJourney.steps.length, 1)}, minmax(140px, 1fr))`',
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

assert.ok(
  source.includes('() => selectedLeadMandateReadiness.rows'),
  'Mandate confirmation rows should come from the shared mandate readiness resolver.',
)
assert.ok(
  source.includes('selectedLeadMandateReadiness.blockers'),
  'Mandate confirmation blockers should come from the shared mandate readiness resolver.',
)
assert.ok(
  source.includes('selectedLeadMandateReadiness.warnings'),
  'Mandate confirmation warnings should come from the shared mandate readiness resolver.',
)

for (const reference of [
  'export function resolveMandateReadiness',
  'export function resolveMandatePropertyLabel',
  'export function hasMandateSellerOnboardingSubmitted',
  'sellerOnboardingSubmittedAt',
  'seller_canonical_facts_json',
  'propertyAddressDetails',
  'mapSellerOnboardingToMandateData',
  'validateMandateGenerationData',
  "buildReadinessRow('property', 'Property'",
  "'Seller onboarding'",
]) {
  assert.ok(readinessSource.includes(reference), `mandateReadiness should keep ${reference}.`)
}

const onboardingBackedReadiness = resolveMandateReadiness({
  lead: {
    leadId: 'lead-test',
    sellerOnboardingToken: 'seller-test-token',
    sellerOnboardingStatus: 'sent',
    sellerOnboarding: {
      status: 'in_progress',
      formData: {
        propertyAddress: '409 Queens Cres',
        suburb: 'Lynnwood',
        city: 'Pretoria',
        askingPrice: 1250000,
        entityType: 'individual',
      },
    },
  },
  contact: {
    firstName: 'Alex',
    lastName: 'Landman',
    email: 'alex@example.test',
    phone: '0676125009',
  },
  agent: {
    fullName: 'Agent Smith',
    email: 'agent@example.test',
  },
})
assert.equal(
  onboardingBackedReadiness.rows.find((row) => row.key === 'property')?.ready,
  true,
  'Mandate readiness should accept property evidence from seller onboarding form data.',
)
assert.equal(
  onboardingBackedReadiness.rows.find((row) => row.key === 'onboarding')?.value,
  'Link sent, not submitted',
  'Mandate readiness should distinguish in-progress onboarding from submitted onboarding.',
)
assert.deepEqual(
  onboardingBackedReadiness.blockers,
  [],
  'A lead with seller, property, agent, and email evidence should not have hard quick-start blockers.',
)
assert.ok(
  onboardingBackedReadiness.warnings.includes('Link sent, not submitted'),
  'In-progress onboarding should remain visible as a warning.',
)

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
