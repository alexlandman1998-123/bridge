import {
  buildRentalProperty24Readiness,
} from './rentalListingProperty24ReadinessModel.js'
import {
  buildRentalProperty24PublishRequest,
} from './rentalListingProperty24PublishModel.js'

export const RENTAL_PROPERTY24_VETTING_PHASE0_VERSION = 'arch9_rental_property24_vetting_phase0_v1'

// This is a presentation fixture only. It must never be submitted to Property24.
export const RENTAL_PROPERTY24_VETTING_FIXTURE = Object.freeze({
  id: 'rental-property24-vetting-fixture-1',
  title: 'Green Point two-bedroom apartment',
  formattedAddress: '12 Main Road, Green Point',
  suburb: 'Green Point',
  city: 'Cape Town',
  province: 'Western Cape',
  propertyType: 'Apartment',
  property24AgencyId: '31382',
  property24ContactAgentIds: ['77959'],
  property24SuburbId: '12345',
  property24PropertyTypeId: '5',
  assignedAgentId: 'rental-vetting-agent',
  mandateEndDate: '2026-12-31',
  bedrooms: 2,
  bathrooms: 2,
  parkingBays: 1,
  garages: 0,
  garden: false,
  pool: false,
  flatlet: false,
  description: 'Bright two-bedroom apartment close to the promenade and local amenities.',
  photos: ['https://example.test/rental-vetting-front.jpg', 'https://example.test/rental-vetting-lounge.jpg'],
  sellerCanonicalFacts: {
    landlordName: 'Demo Landlord',
    landlordEmail: 'demo.landlord@example.test',
    rentalInfo: {
      monthlyRent: 22000,
      depositAmount: 44000,
      availableFrom: '2026-09-01',
      leasePeriodMonths: 12,
      furnishedStatus: 'unfurnished',
      petsPolicy: 'not_allowed',
      utilitiesPolicy: 'tenant_pays',
      mandateStatus: 'signed_uploaded',
      marketingApprovalStatus: 'approved',
    },
  },
})

const DEMO_STEPS = Object.freeze([
  ['open_fixture', 'Open the complete rental fixture in Rentals > Listings.', 'No external call'],
  ['show_terms', 'Show rent, deposit, availability, mandate, and landlord marketing approval.', 'No external call'],
  ['check_readiness', 'Run Property24 rental readiness and inspect the Listing Service v53 payload preview.', 'Preview only'],
  ['show_blocked_example', 'Show an incomplete listing being blocked before a handoff can be prepared.', 'Preview only'],
  ['prepare_handoff', 'Prepare the internal backend publish handoff for the complete fixture.', 'Creates internal audit activity only'],
])

const OUT_OF_SCOPE = Object.freeze([
  'Live Property24 rental submission',
  'Rental portal status update or withdrawal',
  'Rental lead import or reconciliation',
  'Production credentials or customer data',
])

export function buildRentalProperty24VettingPhase0Pack(options = {}) {
  const fixture = options.fixture || RENTAL_PROPERTY24_VETTING_FIXTURE
  const readiness = buildRentalProperty24Readiness(fixture)
  const handoff = buildRentalProperty24PublishRequest(fixture, {
    requestedAt: options.requestedAt || '2026-08-30T12:00:00.000Z',
    requestedBy: options.requestedBy || 'property24-vetting',
  })

  return {
    version: RENTAL_PROPERTY24_VETTING_PHASE0_VERSION,
    phase: 'vetting_scope_locked',
    status: readiness.readyToPublish && handoff.canPrepare && handoff.liveWriteEnabled === false
      ? 'READY_FOR_CONTROLLED_VETTING'
      : 'BLOCKED',
    claim: 'Arch9 validates and prepares Property24 rental listing payloads for controlled backend handoff. Live rental publication is not part of this vetting scope.',
    fixture: {
      id: fixture.id,
      title: fixture.title,
      listingType: 'Rental',
      isPresentationFixture: true,
      mustNotBeSubmitted: true,
    },
    readiness: {
      percent: readiness.readinessPercent,
      completed: readiness.completedCount,
      total: readiness.totalCount,
      blockers: readiness.blockers,
    },
    handoff: {
      status: handoff.status,
      canPrepare: handoff.canPrepare,
      liveWriteEnabled: handoff.liveWriteEnabled,
      requiresBackendPublisher: handoff.requiresBackendPublisher,
    },
    demoSteps: DEMO_STEPS.map(([key, action, safety]) => ({ key, action, safety })),
    outOfScope: [...OUT_OF_SCOPE],
  }
}

export function formatRentalProperty24VettingPhase0Markdown(pack = {}) {
  const stepRows = (pack.demoSteps || []).map((step, index) => `${index + 1}. **${step.action}** _(${step.safety})_`).join('\n')
  const exclusions = (pack.outOfScope || []).map((item) => `- ${item}`).join('\n')
  return `# Property24 Rental Vetting — Phase 0\n\n` +
    `**Status:** ${pack.status || 'UNKNOWN'}  \n` +
    `**Scope statement:** ${pack.claim || ''}\n\n` +
    `## Fixture\n\n` +
    `- ${pack.fixture?.title || 'Unknown fixture'} (${pack.fixture?.id || 'no id'})\n` +
    `- Readiness: ${pack.readiness?.percent ?? 0}% (${pack.readiness?.completed ?? 0}/${pack.readiness?.total ?? 0})\n` +
    `- Live submit: disabled\n\n` +
    `## Demonstration\n\n${stepRows}\n\n` +
    `## Explicitly out of scope\n\n${exclusions}\n`
}
