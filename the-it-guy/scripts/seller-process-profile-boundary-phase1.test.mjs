import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  SELLER_PROCESS_PROFILE_KEYS,
  buildSellerProcessProfileSettings,
  isKingstonsSellerProcessOrganisationId,
  isKingstonsSellerProcessProfile,
  isKnownSellerProcessProfile,
  normalizeSellerProcessProfile,
  resolveSellerProcessProfileActivation,
  resolveSellerProcessProfile,
  resolveSellerProcessProfileForOrganisation,
  resolveSellerProcessProfileKey,
} from '../src/services/sellerProcessProfileService.js'
import {
  buildSellerJourney,
  SELLER_JOURNEY_STAGES,
} from '../src/services/sellerJourneyService.js'
import {
  getNextSellerAction,
  getSellerReadiness,
} from '../src/services/sellerReadinessService.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase0Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase0-default-freeze.md'), 'utf8')
const phase1Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase1-profile-boundary.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const profileServiceSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessProfileService.js'), 'utf8')
const settingsApiSource = readFileSync(resolve(appRoot, 'src/lib/settingsApi.js'), 'utf8')
const organisationBootstrapApiSource = readFileSync(resolve(appRoot, 'src/lib/organisationBootstrapApi.js'), 'utf8')

const defaultStageKeys = [
  'new_lead',
  'contacted',
  'seller_onboarding_sent',
  'seller_onboarding_submitted',
  'mandate_sent',
  'mandate_signed',
  'listing_created',
  'listing_live',
  'documents_submitted',
]

const baseLead = {
  leadId: 'seller-phase1-boundary',
  leadCategory: 'seller',
  sellerPhone: '+27820000000',
  sellerEmail: 'seller@example.test',
  sellerPropertyAddress: '12 Oak Road',
  sellerOnboardingStatus: 'completed',
  mandatePacketId: 'packet-phase1-boundary',
}

const mandatePacketStatus = {
  packet: { id: 'packet-phase1-boundary', status: 'completed' },
  signingSummary: { allSignersSigned: true },
}

{
  assert.equal(SELLER_PROCESS_PROFILE_KEYS.DEFAULT_RESIDENTIAL, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(SELLER_PROCESS_PROFILE_KEYS.KINGSTONS_RESIDENTIAL, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(normalizeSellerProcessProfile(''), DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(normalizeSellerProcessProfile('unknown_profile'), DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(normalizeSellerProcessProfile('standard'), DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(normalizeSellerProcessProfile('Kingstons Residential'), KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(normalizeSellerProcessProfile('kingstons-residential'), KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(isKnownSellerProcessProfile('kingstons'), true)
  assert.equal(isKnownSellerProcessProfile('made_up'), false)
  assert.equal(isKingstonsSellerProcessProfile('kingstons'), true)
  assert.equal(isKingstonsSellerProcessProfile('default_residential'), false)
}

{
  const resolved = resolveSellerProcessProfile({})
  assert.equal(resolved.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(resolved.configured, false)
  assert.equal(resolved.knownProfile, false)
  assert.equal(resolved.sourcePath, '')
  assert.equal(resolved.isDefault, true)
  assert.equal(resolved.isKingstons, false)
}

{
  const resolved = resolveSellerProcessProfile({
    organisation: {
      name: 'Kingstons Real Estate',
      displayName: 'Kingstons',
    },
    onboarding: {
      agencyInformation: {
        tradingName: 'Kingstons Properties',
      },
    },
  })
  assert.equal(resolved.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(resolved.configured, false)
  assert.equal(resolved.isKingstons, false)
}

{
  const kingstonOrgId = KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS[0]
  assert.equal(kingstonOrgId, 'ec19d0a6-bcba-4eef-aa72-9972de88204d')
  assert.equal(isKingstonsSellerProcessOrganisationId(kingstonOrgId), true)
  assert.equal(isKingstonsSellerProcessOrganisationId('11111111-1111-4111-8111-111111111111'), false)

  const explicitOnly = resolveSellerProcessProfile({
    organisationId: kingstonOrgId,
  })
  assert.equal(explicitOnly.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(explicitOnly.isKingstons, false)

  const orgScoped = resolveSellerProcessProfileForOrganisation({
    organisationId: kingstonOrgId,
  })
  assert.equal(orgScoped.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(orgScoped.isKingstons, true)
  assert.equal(orgScoped.organisationScoped, true)

  const unknownExplicitStillDefault = resolveSellerProcessProfileForOrganisation({
    organisationId: kingstonOrgId,
    sellerProcessProfile: 'future_partner_profile',
  })
  assert.equal(unknownExplicitStillDefault.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(unknownExplicitStillDefault.configured, true)
  assert.equal(unknownExplicitStillDefault.knownProfile, false)
}

{
  const resolved = resolveSellerProcessProfile({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
  })
  assert.equal(resolved.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(resolved.key, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(resolved.configured, true)
  assert.equal(resolved.knownProfile, true)
  assert.equal(resolved.requestedProfile, 'kingstons_residential')
  assert.equal(resolved.sourcePath, 'organisationSettings.sellerProcess.profile')
  assert.equal(resolved.isKingstons, true)
  assert.equal(resolveSellerProcessProfileKey({ seller_process_profile: 'kingstons' }), KINGSTONS_SELLER_PROCESS_PROFILE)
}

{
  const resolved = resolveSellerProcessProfile({
    settings: {
      seller_process: {
        process_profile: 'Kingstons Residential',
      },
    },
  })
  assert.equal(resolved.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(resolved.sourcePath, 'settings.seller_process.process_profile')
}

{
  const resolved = resolveSellerProcessProfile({
    sellerProcessProfile: 'future_partner_profile',
  })
  assert.equal(resolved.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(resolved.configured, true)
  assert.equal(resolved.knownProfile, false)
  assert.equal(resolved.requestedProfile, 'future_partner_profile')
  assert.equal(resolved.sourcePath, 'sellerProcessProfile')
}

{
  const activation = resolveSellerProcessProfileActivation({
    sellerProcessProfile: 'Kingstons Residential',
  })
  assert.equal(activation.ok, true)
  assert.equal(activation.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(activation.isKingstons, true)

  const missing = resolveSellerProcessProfileActivation({})
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, 'missing_profile')

  const unknown = resolveSellerProcessProfileActivation({
    sellerProcessProfile: 'future_partner_profile',
  })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.reason, 'unknown_profile')

  const activatedSettings = buildSellerProcessProfileSettings(
    {
      onboardingRules: { enableEmploymentTypeForBond: true },
      sellerProcess: {
        profile: 'default_residential',
        notes: 'keep local metadata',
      },
    },
    { sellerProcessProfile: 'kingstons' },
  )
  assert.equal(activatedSettings.sellerProcess.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(activatedSettings.sellerProcess.notes, 'keep local metadata')
  assert.equal(activatedSettings.onboardingRules.enableEmploymentTypeForBond, true)
  assert.throws(
    () => buildSellerProcessProfileSettings({}, { sellerProcessProfile: 'not_real' }),
    /Unknown seller process profile: not_real/,
  )
}

{
  const journey = buildSellerJourney({
    lead: baseLead,
    mandatePacketStatus,
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
  })
  assert.deepEqual(SELLER_JOURNEY_STAGES.map((stage) => stage.key), defaultStageKeys)
  assert.deepEqual(journey.steps.map((step) => step.key), defaultStageKeys)
  assert.equal(journey.stage.key, 'mandate_signed')
  assert.equal(getNextSellerAction({ lead: baseLead, journey }).id, 'create_listing')
  assert.equal(getSellerReadiness({ lead: baseLead, journey }).nextAction.id, 'create_listing')
}

{
  assert.equal(profileServiceSource.includes('organisation.name'), false)
  assert.equal(profileServiceSource.includes('organization.name'), false)
  assert.match(phase0Doc, /keep default profile output unchanged/)
  assert.match(phase1Doc, /Explicit Configuration Only/)
  assert.match(phase1Doc, /configured-but-unknown/)
  assert.match(phase1Doc, /metadata only in Phase 1/)
  assert.match(settingsApiSource, /sellerProcess:\s*{\s*profile: 'default_residential'/)
  assert.match(organisationBootstrapApiSource, /sellerProcess:\s*{\s*profile: 'default_residential'/)
  assert.match(settingsApiSource, /export async function updateOrganisationSellerProcessProfile/)
  assert.match(settingsApiSource, /assertOrganisationAdminAccess\(context, 'update seller process profile'\)/)
  assert.match(settingsApiSource, /\.from\('organisation_settings'\)[\s\S]*settings_json: merged/)
  assert.match(settingsApiSource, /action: 'seller_process_profile_updated'/)
  assert.equal(settingsApiSource.includes('Kingstons Real Estate'), false)
  assert.equal(
    packageJson.scripts?.['test:seller-process-profile-boundary-phase1'],
    'node scripts/seller-process-profile-boundary-phase1.test.mjs',
  )
}

console.log('seller process profile boundary Phase 1 contract passed')
