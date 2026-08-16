import assert from 'node:assert/strict'
import {
  AGENCY_FED_REDACTED_FIELDS,
  DEVELOPER_LEAD_PHASE10_CONTRACT,
  buildDeveloperLeadAccessProfile,
  maskDeveloperLeadForDeveloper,
  normalizeDeveloperLeadStatus,
} from '../developerLeadContract.js'

const directLead = buildDeveloperLeadAccessProfile({
  leadOwner: 'developer',
  ownershipModel: 'developer_direct',
  primaryDevelopmentId: 'development-a',
})

assert.equal(directLead.contract, DEVELOPER_LEAD_PHASE10_CONTRACT)
assert.equal(directLead.leadOwner, 'developer')
assert.equal(directLead.sellingModel, 'developer_led')
assert.equal(directLead.visibilityState, 'full')
assert.equal(directLead.developmentScope, 'one')
assert.equal(directLead.canDeveloperSeePrivateDetails, true)
assert.equal(normalizeDeveloperLeadStatus('captured'), 'new')
assert.equal(normalizeDeveloperLeadStatus('lead captured'), 'new')
assert.equal(normalizeDeveloperLeadStatus('buyer_onboarding_sent'), 'onboarding_sent')
assert.equal(normalizeDeveloperLeadStatus('signed OTP uploaded'), 'otp')

const multiDevelopmentLead = buildDeveloperLeadAccessProfile({
  leadOwner: 'developer',
  primaryDevelopmentId: 'development-a',
  interestedDevelopmentIds: ['development-b', 'development-c'],
})

assert.equal(multiDevelopmentLead.developmentScope, 'many')

const agencyLead = buildDeveloperLeadAccessProfile({
  leadOwner: 'agency',
  ownershipModel: 'agency_introduced',
  visibilityState: 'full',
  interestedDevelopmentIds: ['development-a'],
})

assert.equal(agencyLead.sellingModel, 'agent_led')
assert.equal(agencyLead.visibilityState, 'limited')
assert.equal(agencyLead.requiresHandoverBeforePrivateDetails, true)
assert.deepEqual(agencyLead.redactedFields, AGENCY_FED_REDACTED_FIELDS)

const masked = maskDeveloperLeadForDeveloper({
  developerLeadId: 'lead-1',
  developerOrgId: 'developer-org',
  sourceAgencyOrgId: 'agency-org',
  leadOwner: 'agency',
  visibilityState: 'limited',
  protectedSummary: '2-bed buyer, R2m-R2.3m budget',
  buyerFullName: 'Private Buyer',
  buyerEmail: 'buyer@example.test',
  buyerPhone: '+27000000000',
  privateNotes: 'Sensitive agency note',
})

assert.equal(masked.developerLeadId, 'lead-1')
assert.equal(masked.protectedSummary, '2-bed buyer, R2m-R2.3m budget')
assert.equal(masked.buyerFullName, null)
assert.equal(masked.buyerEmail, null)
assert.equal(masked.buyerPhone, null)
assert.equal(masked.privateNotes, null)
assert.equal(masked.accessProfile.canDeveloperSeePrivateDetails, false)

const handedOver = maskDeveloperLeadForDeveloper({
  developerLeadId: 'lead-2',
  leadOwner: 'agency',
  visibilityState: 'handed_over',
  buyerFullName: 'Visible Buyer',
})

assert.equal(handedOver.buyerFullName, 'Visible Buyer')
assert.equal(handedOver.accessProfile.canDeveloperSeePrivateDetails, true)

console.log('developer lead Phase 10 domain contract passed')
