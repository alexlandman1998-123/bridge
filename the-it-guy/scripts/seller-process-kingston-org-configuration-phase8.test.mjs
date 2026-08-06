import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  KINGSTON_SELLER_PROCESS_ORG_ID,
  assertKingstonSellerProcessProfileConfigurationCanApply,
  buildKingstonSellerProcessProfileConfigurationPlan,
  parseKingstonSellerProcessProfileConfigurationArgs,
  runKingstonSellerProcessProfileConfiguration,
} from './configure-kingston-seller-process-profile.mjs'
import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const configScriptSource = readFileSync(resolve(appRoot, 'scripts/configure-kingston-seller-process-profile.mjs'), 'utf8')
const phase8Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase8-kingston-org-configuration.md'), 'utf8')

const existingSettings = {
  branding: {
    primaryColor: '#123456',
  },
  notifications: {
    sellerLeadCreated: true,
  },
  sellerProcess: {
    profile: DEFAULT_SELLER_PROCESS_PROFILE,
    retainedSetting: 'keep-me',
  },
}

{
  assert.equal(KINGSTON_SELLER_PROCESS_ORG_ID, 'ec19d0a6-bcba-4eef-aa72-9972de88204d')
  assert.equal(
    packageJson.scripts?.['test:seller-process-kingston-org-configuration-phase8'],
    'node scripts/seller-process-kingston-org-configuration-phase8.test.mjs',
  )
}

{
  const args = parseKingstonSellerProcessProfileConfigurationArgs([
    '--confirm-org-id=ec19d0a6-bcba-4eef-aa72-9972de88204d',
  ])
  assert.equal(args.apply, false)
  assert.equal(args.organisationId, KINGSTON_SELLER_PROCESS_ORG_ID)
  assert.equal(args.confirmOrgId, KINGSTON_SELLER_PROCESS_ORG_ID)
  assert.equal(args.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
}

{
  const plan = buildKingstonSellerProcessProfileConfigurationPlan({
    existingSettings,
  })

  assert.equal(plan.mode, 'dry_run')
  assert.equal(plan.apply, false)
  assert.equal(plan.canWrite, false)
  assert.equal(plan.target.organisationId, KINGSTON_SELLER_PROCESS_ORG_ID)
  assert.equal(plan.target.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(plan.currentProfile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(plan.nextProfile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(plan.settingsChanged, true)
  assert.deepEqual(plan.blockers, [])
  assert.equal(plan.mergedSettings.branding.primaryColor, '#123456')
  assert.equal(plan.mergedSettings.notifications.sellerLeadCreated, true)
  assert.equal(plan.mergedSettings.sellerProcess.retainedSetting, 'keep-me')
  assert.equal(plan.mergedSettings.sellerProcess.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.throws(
    () => assertKingstonSellerProcessProfileConfigurationCanApply(plan),
    /without --apply/,
  )
}

{
  const blockedApply = buildKingstonSellerProcessProfileConfigurationPlan({
    apply: true,
    existingSettings,
  })

  assert.equal(blockedApply.canWrite, false)
  assert.equal(
    blockedApply.blockers.some((blocker) => blocker.code === 'KINGSTON_SELLER_PROCESS_CONFIRMATION_REQUIRED'),
    true,
  )
  assert.throws(
    () => assertKingstonSellerProcessProfileConfigurationCanApply(blockedApply),
    /KINGSTON_SELLER_PROCESS_CONFIRMATION_REQUIRED/,
  )
}

{
  const applyPlan = buildKingstonSellerProcessProfileConfigurationPlan({
    apply: true,
    confirmOrgId: KINGSTON_SELLER_PROCESS_ORG_ID,
    existingSettings,
  })

  assert.equal(applyPlan.canWrite, true)
  assert.equal(applyPlan.blockers.length, 0)
  assert.doesNotThrow(() => assertKingstonSellerProcessProfileConfigurationCanApply(applyPlan))
}

{
  const alreadyConfiguredPlan = buildKingstonSellerProcessProfileConfigurationPlan({
    existingSettings: {
      sellerProcess: {
        retainedSetting: 'keep-me',
        profile: KINGSTONS_SELLER_PROCESS_PROFILE,
      },
      branding: {
        primaryColor: '#123456',
      },
    },
  })

  assert.equal(alreadyConfiguredPlan.currentProfile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(alreadyConfiguredPlan.nextProfile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(alreadyConfiguredPlan.settingsChanged, false)
}

{
  const wrongOrgPlan = buildKingstonSellerProcessProfileConfigurationPlan({
    apply: true,
    organisationId: '11111111-1111-4111-8111-111111111111',
    confirmOrgId: '11111111-1111-4111-8111-111111111111',
    existingSettings,
  })

  assert.equal(wrongOrgPlan.canWrite, false)
  assert.equal(
    wrongOrgPlan.blockers.some((blocker) => blocker.code === 'KINGSTON_SELLER_PROCESS_ORG_SCOPE_MISMATCH'),
    true,
  )
}

{
  const wrongProfilePlan = buildKingstonSellerProcessProfileConfigurationPlan({
    apply: true,
    confirmOrgId: KINGSTON_SELLER_PROCESS_ORG_ID,
    profile: DEFAULT_SELLER_PROCESS_PROFILE,
    existingSettings,
  })

  assert.equal(wrongProfilePlan.canWrite, false)
  assert.equal(
    wrongProfilePlan.blockers.some((blocker) => blocker.code === 'KINGSTON_SELLER_PROCESS_PROFILE_SCOPE_MISMATCH'),
    true,
  )
}

{
  const blockedDryRun = await runKingstonSellerProcessProfileConfiguration({
    organisationId: '11111111-1111-4111-8111-111111111111',
  })

  assert.equal(blockedDryRun.applied, false)
  assert.equal(blockedDryRun.plan.canWrite, false)
  assert.equal(
    blockedDryRun.plan.blockers.some((blocker) => blocker.code === 'KINGSTON_SELLER_PROCESS_ORG_SCOPE_MISMATCH'),
    true,
  )
}

{
  assert.doesNotMatch(configScriptSource, /Kingstons Real Estate|organisationName|displayName|tradingName/)
  assert.doesNotMatch(configScriptSource, /CREATE TABLE|ALTER TABLE|DROP TABLE|create policy|drop policy/i)
  assert.match(configScriptSource, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(configScriptSource, /--apply/)
  assert.match(configScriptSource, /--confirm-org-id/)
}

{
  assert.match(phase8Doc, /dry run/i)
  assert.match(phase8Doc, /--apply --confirm-org-id=ec19d0a6-bcba-4eef-aa72-9972de88204d/)
  assert.match(phase8Doc, /does not\s+infer Kingston from organisation name/i)
  assert.match(phase8Doc, /No migration/i)
}

console.log('seller process Kingston org configuration Phase 8 contract passed')
