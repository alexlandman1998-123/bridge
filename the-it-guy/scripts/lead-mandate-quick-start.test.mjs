import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const readinessSource = await readFile(new URL('../src/core/documents/mandateReadiness.js', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const { resolveMandateReadiness } = await import('../src/core/documents/mandateReadiness.js')
const { resolveOtpReadiness } = await import('../src/core/documents/otpReadiness.js')
const { getSellerJourneyStage } = await import('../src/services/sellerJourneyService.js')

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
  'selectedLeadMandateTemplateReadiness',
  'selectedLeadMandateTemplateBlocking',
  'resolveMandatePacketStateHintFromLead',
  'selectedLeadMandateResolvedState',
  'resolveSignableTemplatePolicy',
  'describeMandateTemplateReadiness',
  'function resolveOtpQuickStartPrimaryLabel',
  'function resolveOtpQuickStartIntro',
  'resolveOtpReadiness',
  'selectedLeadOtpTemplateReadiness',
  'selectedLeadOtpTemplateBlocking',
  'describeOtpTemplateReadiness',
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
  'title={resolveMandateQuickStartTitle(mandateQuickStartStep)}',
  'PreferredAttorneySelectionModal',
  'sellerAttorneyPickerOpen',
  'transferAttorneyPreferredPartnerId: preferredAttorneyId',
  'Listing Readiness',
  "{ key: 'property', label: 'Property', meta: '' }",
  "{ key: 'mandate', label: 'Mandate', meta: '' }",
  "{ key: 'appointments', label: 'Appointments', meta: selectedLeadAppointments.length }",
  'data-testid="seller-journey-rail"',
  'gridTemplateColumns: `repeat(${Math.max(selectedSellerJourney.steps.length, 1)}, minmax(140px, 1fr))`',
  'Edit Offer / Terms',
  'autoGenerateEnabled={legalWorkspaceOpen}',
]) {
  assert.ok(source.includes(reference), `AgencyPipelinePage should keep ${reference}.`)
}
assert.ok(
  source.includes("{ key: 'seller', label: 'Seller', meta: '' }") ||
    source.includes("{ key: 'seller', label: 'Seller Profile', meta: '' }"),
  'AgencyPipelinePage should keep the seller workspace tab.',
)

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
  'generated?.draftReadyOnly === true',
  'signable PDF was not confirmed before the database timed out',
  'handleSendMandateToSeller({',
  'packetVersionId: mandatePacketVersionId',
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
assert.ok(
  !source.includes("selectedLeadStageKey.includes('onboarding submitted')"),
  'Mandate confirmation should not treat lead stage text as submitted onboarding evidence.',
)
assert.ok(
  source.includes('function hasExplicitMandateSentEvidence'),
  'Seller lead activity should use an explicit mandate sent evidence resolver.',
)
assert.ok(
  source.includes("const selectedLeadMandatePacketId = normalizeText(selectedLead?.mandatePacketId || selectedLead?.mandate_packet_id || selectedLead?.mandatePacket?.id)"),
  'Selected seller leads should recognise camelCase, snake_case, and nested mandate packet ids.',
)
assert.ok(
  source.includes('isMandatePreSendPacketState(packetState)') &&
    source.includes('!explicitSentEvidence') &&
    source.includes('return mandatePacketStatus?.state'),
  'Mandate quick-start should prefer draft/generated/ready packet state over stale lead sent stage without explicit send evidence.',
)
assert.ok(
  source.includes('function hasConfirmedMandateSendJob') &&
    source.includes('function hasMandateSignerDeliveryEvidence') &&
    !source.includes('const sentStates = new Set'),
  'Mandate quick-start should require durable delivery evidence instead of status-only sent labels.',
)
assert.ok(
  source.includes('packetStatePriority >= 40 && packetStatePriority < 50') &&
    source.includes("return 'ready_to_send'"),
  'Mandate quick-start should downgrade status-only sent packet state back to a sendable state.',
)
assert.ok(
  source.includes('return leadState || mandatePacketStatus?.state'),
  'Mandate quick-start should use selected-lead mandate evidence while packet status is still stale.',
)
assert.ok(
  source.includes("? 'Send for Signature'"),
  'Sendable generated mandates should label the primary action as Send for Signature.',
)
assert.ok(
  source.includes('hasMandateDeliveredOrSignedEvidence({ lead: selectedLead, mandatePacketStatus })'),
  'Mandate quick-start should not offer regeneration after sent or signed mandate evidence exists.',
)
assert.ok(
  source.includes('function isStaleMandateGenerationRecoveryMessage') &&
    source.includes("message.includes('could not confirm a usable mandate draft')") &&
    source.includes("message.includes('select generate once more')"),
  'Mandate quick-start should identify stale generation recovery banners.',
)
assert.ok(
  source.includes('isStaleMandateGenerationRecoveryMessage(error)') &&
    source.includes('hasMandateDeliveredOrSignedEvidence({ lead: selectedLead, mandatePacketStatus })') &&
    source.includes("setMessage(\n      mandateStatePriority >= 60"),
  'Sent or signed mandate evidence should clear stale generation recovery banners.',
)
assert.ok(
  source.includes('const mandateStatePriority = getMandateStatePriority(selectedLeadMandateResolvedState)') &&
    source.includes('const mandateComplete = mandateStatePriority >= 50') &&
    source.includes("mandateStatePriority >= 40 || selectedSellerJourney.mandateStatus === 'sent'"),
  'Listing readiness should use resolved packet mandate state instead of stale journey-only mandate status.',
)
assert.ok(
  source.includes('alreadyDeliveredOrSigned: true') &&
    source.includes('This mandate is already signed. Open the signed mandate instead of generating another draft.'),
  'Draft-only generation success should not overwrite already sent or signed mandate state.',
)
assert.ok(
  source.includes('selectedLeadWorkspaceRouteHydrating') &&
    source.includes('selectedLead && !selectedLeadWorkspaceRouteHydrating'),
  'Direct lead routes should not render seller journey cards from partial CRM data while route hydration is loading.',
)
assert.ok(
  source.includes('activateSellerPortalForListing') &&
    source.includes('SELLER_PORTAL_ACTIVATION_SOURCES.existingListing') &&
    source.includes('void handleSendSellerPortalLink()'),
  'Completed seller onboarding portal resends should use the Seller Portal invite flow instead of seller onboarding attorney selection.',
)
assert.ok(
  source.includes("normalizeKey(selectedLeadMandateTemplateReadiness?.status) !== 'checking'") &&
    source.includes("optional: true,\n      value: 'Checking published mandate template route...'"),
  'Mandate quick-start should not hard-block while the template route check is still pending.',
)
assert.ok(
  source.includes("'mandate draft ready'") &&
    source.includes("'mandate generated'") &&
    source.includes('lead?.mandate_packet_id'),
  'Mandate packet state hints should cover draft/generated lead rows before template-route checking runs.',
)
assert.ok(
  source.includes('hasExplicitMandateSentEvidence({ lead: selectedLead, mandatePacketStatus })'),
  'Seller lead timeline should use explicit mandate sent evidence.',
)
assert.ok(
  !source.includes("selectedLead?.stage || selectedLead?.status).toLowerCase().includes('sent')"),
  'Seller onboarding sent must not be interpreted as mandate sent activity.',
)
assert.ok(
  source.includes('await updateAgencyCrmLeadRecord(organisationId, lead.leadId'),
  'Seller onboarding submitted events should persist before announcing submitted status.',
)

for (const reference of [
  'export function resolveMandateReadiness',
  'export function resolveMandatePropertyLabel',
  'export function hasMandateSellerOnboardingSubmitted',
  'templateReadiness = null',
  'sellerOnboardingSubmittedAt',
  'seller_canonical_facts_json',
  'propertyAddressDetails',
  'mapSellerOnboardingToMandateData',
  'validateMandateGenerationData',
  "buildReadinessRow('property', 'Property'",
  "buildReadinessRow('legal_route', 'Legal route'",
  'legalRouteReady',
  'missingRoutingFacts',
  'Smart route',
  "'template_route'",
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

const companyRouteReadiness = resolveMandateReadiness({
  lead: {
    leadId: 'lead-company-route',
    sellerOnboarding: {
      status: 'completed',
      submittedAt: '2026-07-25T08:00:00.000Z',
      formData: {
        companyName: 'Acme Property Holdings Pty Ltd',
        propertyAddress: '12 Oak Avenue',
        propertyType: 'House',
        askingPrice: 2500000,
        entityType: 'company',
        representativeName: 'Jane Director',
        representativeIdNumber: '8001015009087',
      },
    },
  },
  contact: {
    firstName: 'Jane',
    lastName: 'Director',
    email: 'jane@example.test',
    phone: '0676125009',
  },
  agent: {
    fullName: 'Agent Smith',
    email: 'agent@example.test',
  },
})
assert.equal(
  companyRouteReadiness.rows.find((row) => row.key === 'legal_route')?.ready,
  true,
  'Mandate readiness should expose a ready smart legal route when company seller facts are complete.',
)
assert.equal(
  companyRouteReadiness.facts.sellerClauseProfile,
  'company',
  'Mandate readiness facts should identify company seller routing.',
)
assert.equal(
  companyRouteReadiness.facts.propertyClauseProfile,
  'full_title',
  'Mandate readiness facts should identify full-title property routing.',
)

const trustRouteReadiness = resolveMandateReadiness({
  lead: {
    leadId: 'lead-trust-route',
    sellerOnboarding: {
      status: 'completed',
      submittedAt: '2026-07-25T08:00:00.000Z',
      formData: {
        trustName: 'The Oak Family Trust',
        propertyAddress: 'Unit 4, Oak Estate',
        propertyType: 'Apartment',
        askingPrice: 1750000,
        entityType: 'trust',
        trusteeName: 'John Trustee',
        trusteeIdNumber: '7901015009087',
      },
    },
  },
  contact: {
    firstName: 'John',
    lastName: 'Trustee',
    email: 'john@example.test',
    phone: '0676125009',
  },
  agent: {
    fullName: 'Agent Smith',
    email: 'agent@example.test',
  },
})
assert.ok(
  trustRouteReadiness.rows.find((row) => row.key === 'legal_route')?.value.includes('Trust seller'),
  'Mandate readiness should explain trust seller routing in the modal row.',
)
assert.equal(
  trustRouteReadiness.facts.sellerClauseProfile,
  'trust',
  'Mandate readiness facts should identify trust seller routing.',
)
assert.equal(
  trustRouteReadiness.facts.propertyClauseProfile,
  'sectional_title',
  'Mandate readiness facts should identify sectional-title routing.',
)

const templateReadyReadiness = resolveMandateReadiness({
  lead: {
    leadId: 'lead-template-ready',
    sellerOnboarding: {
      status: 'completed',
      submittedAt: '2026-07-25T08:00:00.000Z',
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
  templateReadiness: {
    ready: true,
    value: 'Published mandate route ready: Standard mandate',
    source: 'mandate_scenario_variant',
  },
})
assert.equal(
  templateReadyReadiness.rows.find((row) => row.key === 'template_route')?.ready,
  true,
  'Mandate readiness should expose a ready template-route row when the published route exists.',
)
assert.equal(
  templateReadyReadiness.facts.templateRouteReady,
  true,
  'Mandate readiness facts should expose template route readiness.',
)

const templateBlockedReadiness = resolveMandateReadiness({
  lead: {
    leadId: 'lead-template-missing',
    sellerOnboarding: {
      status: 'completed',
      submittedAt: '2026-07-25T08:00:00.000Z',
      formData: {
        propertyAddress: '409 Queens Cres',
        suburb: 'Lynnwood',
        city: 'Pretoria',
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
  templateReadiness: {
    ready: false,
    value: 'No published template matches this document’s legal route.',
    status: 'TEMPLATE_ROUTE_NOT_PUBLISHED',
  },
})
assert.ok(
  templateBlockedReadiness.blockers.includes('No published template matches this document’s legal route.'),
  'Mandate readiness should block generation when the template route is not published.',
)

const staleSubmittedStageReadiness = resolveMandateReadiness({
  lead: {
    leadId: 'lead-stale-stage',
    stage: 'Seller Onboarding Submitted',
    status: 'Submitted',
    sellerOnboardingStatus: 'completed',
    sellerOnboardingToken: 'seller-stale-token',
    sellerOnboarding: {
      status: 'in_progress',
      formData: {
        propertyAddress: '409 Queens Cres',
        suburb: 'Lynnwood',
        city: 'Pretoria',
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
  staleSubmittedStageReadiness.facts.sellerOnboardingSubmitted,
  false,
  'Nested in-progress onboarding should override stale submitted lead status.',
)
assert.equal(
  staleSubmittedStageReadiness.rows.find((row) => row.key === 'onboarding')?.value,
  'Link sent, not submitted',
  'Stale submitted lead status should still display the durable in-progress onboarding state.',
)

const staleSubmittedJourney = getSellerJourneyStage({
  lead: {
    leadCategory: 'seller',
    stage: 'Seller Onboarding Submitted',
    status: 'Submitted',
    sellerOnboardingStatus: 'completed',
    sellerOnboardingToken: 'seller-stale-token',
    sellerOnboarding: {
      status: 'in_progress',
    },
  },
  listing: {
    sellerOnboarding: {
      status: 'in_progress',
    },
  },
})
assert.equal(
  staleSubmittedJourney?.key,
  'seller_onboarding_sent',
  'Seller journey should not advance to submitted while the durable onboarding record is in progress.',
)

assert.match(
  source,
  /resolveActiveTemplate\(\{[\s\S]*validationAction: 'generate'[\s\S]*mandateData[\s\S]*resolveSignableTemplatePolicy/,
  'Mandate quick-start should preflight the published template route with mapped mandate data.',
)
assert.match(
  source,
  /templateResolution = await resolveActiveTemplate\(\{[\s\S]*validationAction: 'generate'[\s\S]*mandateData/,
  'Mandate generation should resolve the template route after mandate data is mapped.',
)
assert.ok(
  quickStartBlock.includes('selectedLeadMandateTemplateBlocking'),
  'Quick start flow should block generation while the template route check is missing or failed.',
)

const otpIndividualReadiness = resolveOtpReadiness({
  lead: {
    leadId: 'lead-otp-ready',
    buyerName: 'Buyer One',
    buyerEntityType: 'individual',
    buyerMaritalStatus: 'single',
    financeType: 'bond',
  },
  contact: {
    firstName: 'Buyer',
    lastName: 'One',
    email: 'buyer@example.test',
    phone: '0676125009',
  },
  property: {
    id: 'listing-1',
    title: '12 Oak Avenue',
    propertyType: 'House',
    price: 'R 1 500 000',
    sellerEntityType: 'company',
  },
  agent: {
    fullName: 'Agent Smith',
    email: 'agent@example.test',
  },
  deliveryMode: 'digital_portal',
  deliveryLabel: 'Digital portal',
  requiresDigitalContact: true,
  templateReadiness: {
    ready: true,
    value: 'Published OTP route ready: Standard OTP',
    source: 'legal_scenario_variant',
  },
})
assert.equal(
  otpIndividualReadiness.rows.find((row) => row.key === 'legal_route')?.ready,
  true,
  'OTP readiness should expose a ready legal route when buyer, seller, property, and finance facts are complete.',
)
assert.equal(
  otpIndividualReadiness.rows.find((row) => row.key === 'template_route')?.ready,
  true,
  'OTP readiness should expose a ready template-route row when the published route exists.',
)
assert.equal(
  otpIndividualReadiness.facts.buyerClauseProfile,
  'individual',
  'OTP readiness facts should identify individual buyer routing.',
)
assert.equal(
  otpIndividualReadiness.facts.sellerClauseProfile,
  'company',
  'OTP readiness facts should identify company seller routing.',
)
assert.equal(
  otpIndividualReadiness.facts.financeClauseProfile,
  'bond',
  'OTP readiness facts should identify bond finance routing.',
)

const otpTemplateBlockedReadiness = resolveOtpReadiness({
  lead: {
    leadId: 'lead-otp-missing-template',
    buyerName: 'Buyer Two',
  },
  contact: {
    firstName: 'Buyer',
    lastName: 'Two',
    email: 'buyer2@example.test',
    phone: '0676125009',
  },
  property: {
    id: 'listing-2',
    title: 'Unit 4, Oak Estate',
    propertyType: 'Apartment',
    price: 'R 950 000',
  },
  agent: {
    fullName: 'Agent Smith',
    email: 'agent@example.test',
  },
  deliveryMode: 'digital_portal',
  deliveryLabel: 'Digital portal',
  requiresDigitalContact: true,
  templateReadiness: {
    ready: false,
    value: 'No published OTP template matches this legal route.',
    status: 'TEMPLATE_ROUTE_NOT_PUBLISHED',
  },
})
assert.ok(
  otpTemplateBlockedReadiness.blockers.includes('No published OTP template matches this legal route.'),
  'OTP readiness should block generation when the template route is not published.',
)

const otpActionBlock = getFunctionBlock('handleSelectedLeadOtpPrimaryAction')
assert.ok(
  otpActionBlock.includes('setOtpQuickStartOpen(true)'),
  'Generate OTP actions should open the confirmation modal.',
)

const otpQuickStartBlock = getFunctionBlock('handleOtpQuickStartGenerateAndSend')
for (const reference of [
  'selectedLeadOtpQuickStartBlockers.length',
  'selectedLeadOtpTemplateBlocking',
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
