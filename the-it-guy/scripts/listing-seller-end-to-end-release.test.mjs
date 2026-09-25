import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'
import { getSellerProfileAuthorityContract } from '../src/lib/sellerPartyAuthorityContract.js'
import { buildSellerSigningPlan } from '../src/lib/sellerSigningPlanModel.js'
import { buildListingMandateReplacementWorkflow, createListingMandateTermsRevision } from '../src/services/listings/listingMandateReplacementModel.js'
import { buildListingSellerCanonicalUpdate } from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { normalizeSellerCollaborationWorkspace } from '../src/services/listings/listingSellerCollaborationModel.js'
import { buildSellerDocumentUploadQueue } from '../src/services/listings/listingSellerDocumentUploadModel.js'
import { buildListingSellerSetupState } from '../src/services/listings/listingSellerSetupState.js'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(appRoot, '..')
const templatePath = path.join(appRoot, 'docs/listing-seller-phase10-controlled-manual-test.template.json')
const MANUAL_CONTRACT = 'listing-seller-phase10-controlled-manual-test-v1'

function arg(name) {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || ''
}

function assertNoSensitiveEvidence(value) {
  const content = JSON.stringify(value)
  assert.doesNotMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  assert.doesNotMatch(content, /(?:bearer|password|secret|signed.?url|portal.?token)/i)
  assert.doesNotMatch(content, /\+?\d[\d .()/-]{7,}\d/)
}

function validateManualObservation(observation, { template = false } = {}) {
  assert.equal(observation.contract, MANUAL_CONTRACT)
  assert.ok(['staging', 'authorised_test'].includes(observation.environment))
  assert.equal(typeof observation.checks, 'object')
  assert.ok(Object.keys(observation.checks).length >= 24)
  for (const [name, passed] of Object.entries(observation.checks)) {
    assert.equal(typeof passed, 'boolean', `${name} must be recorded as a boolean`)
    if (!template) assert.equal(passed, true, `${name} did not pass`)
  }
  if (!template) {
    assert.equal(observation.result, 'passed')
    assert.doesNotMatch(observation.listingReference, /^REPLACE_WITH_/)
    assert.doesNotMatch(observation.operatorReference, /^REPLACE_WITH_/)
    assert.doesNotMatch(observation.sourceRevision, /^REPLACE_WITH_/)
    assert.ok(Number.isFinite(Date.parse(observation.testedAt)))
    assert.equal(observation.deploymentApproved, false, 'Manual testing must not grant deployment approval')
    assert.equal(observation.remoteDataOperationApproved, false, 'Manual testing must not grant remote-data approval')
  }
  assertNoSensitiveEvidence({ ...observation, notes: '' })
}

test('direct listing without a seller stays usable but blocks assumed mandate and requirements', () => {
  const state = buildListingSellerSetupState({ id: 'listing-direct', source: 'direct_listing_intake', propertyAddress: 'Controlled test property' })
  assert.equal(state.status, 'setup_required')
  assert.equal(state.actions.canSendOnboarding, true)
  assert.equal(state.actions.canPrepareMandate, false)
  assert.equal(state.actions.canGenerateComplianceRequirements, false)
})

test('every supported seller entity has an explicit authority contract', () => {
  const scenarios = [
    ['individual', 'all_legal_owners'], ['married', 'owner_plus_conditional_spouse'],
    ['multiple_owners', 'all_owners_unless_delegated'], ['company', 'confirmed_representative'],
    ['close_corporation', 'confirmed_representative'], ['trust', 'confirmed_trustees'],
    ['deceased_estate', 'confirmed_executor'], ['power_of_attorney', 'confirmed_attorney'],
    ['foreign_individual', 'all_legal_owners'], ['foreign_company', 'confirmed_representative'],
    ['foreign_trust', 'confirmed_trustees'],
  ]
  for (const [profile, mode] of scenarios) {
    const contract = getSellerProfileAuthorityContract(profile)
    assert.equal(contract.profileType, profile)
    assert.equal(contract.signatoryPolicy.mode, mode)
    assert.notEqual(contract.legalEntityType, 'unknown')
  }
})

test('married sellers and multiple owners receive independent signing identities', () => {
  const married = buildSellerSigningPlan({ sellerType: 'married', form: {
    sellerFirstName: 'Seller', sellerSurname: 'One', email: 'seller@example.test',
    spouseName: 'Spouse Two', spouseEmail: 'spouse@example.test', maritalRegime: 'married_cop',
  } })
  assert.equal(married.ready, true)
  assert.equal(married.recipients.length, 2)
  assert.equal(married.requiresIndividualSignatures, true)

  const owners = buildSellerSigningPlan({ sellerType: 'multiple_owners', form: { multipleOwners: [
    { name: 'Owner One', email: 'one@example.test' }, { name: 'Owner Two', email: 'two@example.test' },
  ] } })
  assert.equal(owners.ready, true)
  assert.deepEqual(owners.recipients.map((recipient) => recipient.email), ['one@example.test', 'two@example.test'])
})

test('entity representatives are routed to the correct signing role', () => {
  const rows = [
    ['company', { authorisedSignatoryName: 'Director One', authorisedSignatoryEmail: 'director@example.test' }, 'Authorised signatory'],
    ['close_corporation', { authorisedSignatoryName: 'Member One', authorisedSignatoryEmail: 'member@example.test' }, 'Authorised signatory'],
    ['trust', { authorisedTrusteeName: 'Trustee One', authorisedTrusteeEmail: 'trustee@example.test' }, 'Authorised trustee'],
    ['deceased_estate', { executorName: 'Executor One', executorEmail: 'executor@example.test' }, 'Executor'],
    ['power_of_attorney', { powerOfAttorneyName: 'Representative One', powerOfAttorneyEmail: 'representative@example.test' }, 'Authorised representative'],
    ['foreign_company', { authorisedSignatoryName: 'Foreign Director', authorisedSignatoryEmail: 'foreign@example.test' }, 'Authorised signatory'],
    ['foreign_trust', { authorisedTrusteeName: 'Foreign Trustee', authorisedTrusteeEmail: 'foreigntrust@example.test' }, 'Authorised trustee'],
    ['foreign_individual', { sellerName: 'Foreign Owner', sellerEmail: 'foreignowner@example.test' }, 'Seller'],
  ]
  for (const [sellerType, form, role] of rows) {
    const plan = buildSellerSigningPlan({ sellerType, form })
    assert.equal(plan.ready, true, `${sellerType} should have a valid signing plan`)
    assert.equal(plan.recipients[0].role, role)
  }
})

test('multiple owners and trustees remain separate collaboration participants', () => {
  const workspace = normalizeSellerCollaborationWorkspace({ participants: [
    { id: 'owner-1', display_name: 'Owner One', email: 'one@example.test', participant_role: 'primary_owner', invitation_delivery_status: 'sent' },
    { id: 'owner-2', display_name: 'Owner Two', email: 'two@example.test', participant_role: 'co_owner', invitation_delivery_status: 'sent' },
    { id: 'trustee-1', display_name: 'Trustee One', email: 'trustee1@example.test', participant_role: 'trustee', invitation_delivery_status: 'sent' },
    { id: 'trustee-2', display_name: 'Trustee Two', email: 'trustee2@example.test', participant_role: 'trustee', invitation_delivery_status: 'sent' },
  ] })
  assert.equal(workspace.participants.length, 4)
  assert.equal(new Set(workspace.participants.map((participant) => participant.id)).size, 4)
})

test('changing the seller entity creates a requirement-affecting canonical update without overwriting the source snapshot', () => {
  const listing = { id: 'listing-entity-change', updatedAt: '2026-09-24T08:00:00.000Z', sellerOnboarding: { formData: {
    sellerLegalType: 'individual', ownerStructureType: 'individual', sellerFirstName: 'Original', sellerSurname: 'Owner', email: 'owner@example.test',
  } } }
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: {
    sellerLegalType: 'company', ownerEntityType: 'company', ownerStructureType: 'company',
    companyName: 'Controlled Holdings', companyRegistrationNumber: 'CONTROLLED-REG',
    authorisedSignatoryName: 'Director', authorisedSignatoryEmail: 'director@example.test',
  }, mutationId: 'controlled-mutation', now: '2026-09-24T09:00:00.000Z' })
  assert.equal(update.authority.profileType, 'company')
  assert.equal(update.requirementsAffected, true)
  assert.equal(update.expectedUpdatedAt, listing.updatedAt)
  assert.equal(listing.sellerOnboarding.formData.sellerLegalType, 'individual')
})

test('mandate edits are safe before, during and after signatures', () => {
  const revision = createListingMandateTermsRevision({ previous: { askingPrice: 1000000 }, next: { askingPrice: 950000 }, recordedAt: '2026-09-24T10:00:00.000Z' })
  const before = buildListingMandateReplacementWorkflow({ sessions: [{ signing_group_id: 'draft', status: 'active', selected_documents: ['mandate'], created_at: '2026-09-24T09:00:00.000Z' }], revisions: [revision], refreshRequired: true })
  assert.equal(before.status, 'draft_refresh_required')

  const partial = buildListingMandateReplacementWorkflow({ sessions: [
    { signing_group_id: 'partial', status: 'signed', selected_documents: ['mandate'], created_at: '2026-09-24T09:00:00.000Z', signed_at: '2026-09-24T09:30:00.000Z' },
    { signing_group_id: 'partial', status: 'active', selected_documents: ['mandate'], created_at: '2026-09-24T09:00:00.000Z' },
  ], revisions: [revision], refreshRequired: true })
  assert.equal(partial.status, 'amendment_required')
  assert.equal(partial.sourceWasPartiallySigned, true)
  assert.equal(partial.sourceSigningGroupId, 'partial')

  const full = buildListingMandateReplacementWorkflow({ sessions: [{ signing_group_id: 'signed', status: 'signed', selected_documents: ['mandate'], created_at: '2026-09-24T08:00:00.000Z', signed_at: '2026-09-24T09:00:00.000Z' }], revisions: [revision], refreshRequired: true })
  assert.equal(full.status, 'amendment_required')
  assert.equal(full.sourceSigningGroupId, 'signed')
})

test('failed operations remain visible and retryable, and concurrent changes remain conflicts', () => {
  const uploads = buildSellerDocumentUploadQueue([{ key: 'identity', label: 'Identity', required: true }], {
    identity: { status: 'failed', fileName: 'identity.pdf', error: 'Controlled upload failure' },
  })
  assert.equal(uploads.rows[0].uploadError, 'Controlled upload failure')
  assert.equal(uploads.outstanding.length, 1)

  const collaboration = normalizeSellerCollaborationWorkspace({
    participants: [{ id: 'p1', invitation_delivery_status: 'failed', invitation_error: 'Controlled delivery failure' }],
    changeRequests: [{ id: 'c1', status: 'conflict', conflict_json: { reason: 'record_version_changed' } }],
    notifications: [{ id: 'n1', status: 'failed' }],
  })
  assert.equal(collaboration.failedDeliveryCount, 2)
  assert.equal(collaboration.conflictCount, 1)
})

test('special conditions are included while internal notes are excluded', () => {
  const mapped = mapSellerOnboardingToMandateData({ onboardingSubmission: {
    sellerFirstName: 'Seller', sellerSurname: 'One', email: 'seller@example.test', propertyAddress: 'Controlled property',
    mandateType: 'sole', askingPrice: 1000000, commissionPercentage: 5, vatHandling: 'inclusive',
    specialConditions: 'Occupation is on transfer.', sellerNotes: 'Seller requests morning calls.',
    internalNotes: 'Internal compliance escalation.', agentNotes: 'Negotiation floor.', notes: 'Legacy internal note.',
  } })
  assert.match(mapped.placeholders.special_conditions, /Occupation is on transfer/)
  assert.match(mapped.placeholders.special_conditions, /Seller requests morning calls/)
  assert.doesNotMatch(mapped.placeholders.special_conditions, /compliance escalation|negotiation floor|legacy internal/i)
})

test('release contracts cover permissions, compatibility, failure recovery, responsive remediation and remote-operation locks', async () => {
  const [phase8, phase9, page, generationPanel, runbook] = await Promise.all([
    readFile(path.join(root, 'supabase/migrations/20260924160026_listing_seller_collaboration_permissions_phase8.sql'), 'utf8'),
    readFile(path.join(root, 'supabase/migrations/20260924161509_listing_seller_historical_normalization_phase9.sql'), 'utf8'),
    readFile(path.join(appRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8'),
    readFile(path.join(appRoot, 'src/components/documents/DocumentPacketWorkflowPanel.jsx'), 'utf8'),
    readFile(path.join(appRoot, 'docs/listing-seller-phase10-release-runbook.md'), 'utf8'),
  ])
  assert.match(phase8, /base_participant_version/)
  assert.match(phase8, /status in \('pending','approved','rejected','conflict','withdrawn'\)/)
  assert.match(phase8, /visible_sections/)
  assert.match(phase8, /invitation_delivery_status/)
  assert.match(phase9, /immutable_signed_history/)
  assert.doesNotMatch(phase9, /update\s+public\.private_listing_documents/i)
  assert.match(page, /sm:flex-row/)
  assert.match(page, /ListingSellerHistoricalNormalizationBanner/)
  assert.match(generationPanel, /Packet generation failed\. Please retry\./)
  assert.match(generationPanel, /handleGenerationRecoveryAction/)
  assert.match(runbook, /require their own explicit approval/i)
})

test('manual listing evidence template is safe and release remains blocked until a completed observation is supplied', async () => {
  const template = JSON.parse(await readFile(templatePath, 'utf8'))
  validateManualObservation(template, { template: true })
  assert.equal(template.result, 'pending')
  assert.equal(Object.values(template.checks).every((value) => value === false), true)

  const observationPath = arg('observation')
  const requireManual = process.argv.includes('--require-manual')
  if (!observationPath) {
    assert.equal(requireManual, false, 'Release requires --observation=/absolute/path/to/evidence.json')
    return
  }
  const observation = JSON.parse(await readFile(path.resolve(observationPath), 'utf8'))
  validateManualObservation(observation)
})
