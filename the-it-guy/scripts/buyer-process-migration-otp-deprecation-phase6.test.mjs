import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  BUYER_OTP_DEPRECATION_NOTICE,
  BUYER_PROCESS_MIGRATION_VERSION,
  isDeprecatedBuyerOtpAction,
  isDeprecatedBuyerOtpStage,
  migrateBuyerProcessLeadRecord,
  resolveBuyerProcessStageMigration,
} from '../src/services/buyerProcessMigrationService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelinePageSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const buyerOfferSubmissionSource = readFileSync(resolve(appRoot, 'src/pages/BuyerOfferSubmission.jsx'), 'utf8')
const agencyPipelineServiceSource = readFileSync(resolve(appRoot, 'src/lib/agencyPipelineService.js'), 'utf8')
const agencyCrmRepositorySource = readFileSync(resolve(appRoot, 'src/lib/agencyCrmRepository.js'), 'utf8')

assert.equal(
  packageJson.scripts?.['test:buyer-process-migration-otp-deprecation-phase6'],
  'node scripts/buyer-process-migration-otp-deprecation-phase6.test.mjs',
  'package.json should expose the buyer process migration + OTP deprecation Phase 6 contract.',
)

assert.equal(BUYER_PROCESS_MIGRATION_VERSION, 'buyer_process_phase6_otp_deprecation_v1')
assert.match(BUYER_OTP_DEPRECATION_NOTICE, /OTP generation is deprecated/)

const legacyOtpMigration = resolveBuyerProcessStageMigration({
  leadId: 'lead_1',
  leadCategory: 'buyer',
  stage: 'Ready to Generate OTP',
  status: 'OTP Generated',
})

assert.equal(legacyOtpMigration.migrated, true)
assert.equal(legacyOtpMigration.stageKey, 'offer')
assert.equal(legacyOtpMigration.stageLabel, 'Offer')
assert.equal(legacyOtpMigration.statusLabel, 'Offer')
assert.equal(legacyOtpMigration.previousStage, 'Ready to Generate OTP')
assert.equal(legacyOtpMigration.previousStatus, 'OTP Generated')
assert.equal(legacyOtpMigration.deprecatedOtpStage, true)

const migratedLegacyOtpLead = migrateBuyerProcessLeadRecord({
  leadId: 'lead_1',
  leadCategory: 'buyer',
  stage: 'Ready to Generate OTP',
  status: 'OTP Generated',
})

assert.equal(migratedLegacyOtpLead.stage, 'Offer')
assert.equal(migratedLegacyOtpLead.status, 'Offer')
assert.equal(migratedLegacyOtpLead.buyerProcessStageKey, 'offer')
assert.equal(migratedLegacyOtpLead.buyerProcessMigrationVersion, BUYER_PROCESS_MIGRATION_VERSION)
assert.equal(migratedLegacyOtpLead.buyerProcessOtpDeprecated, true)
assert.equal(migratedLegacyOtpLead.legacyBuyerProcessStage, 'Ready to Generate OTP')
assert.equal(migratedLegacyOtpLead.legacyBuyerProcessStatus, 'OTP Generated')

const migratedFinanceLead = migrateBuyerProcessLeadRecord({
  leadId: 'lead_2',
  leadCategory: 'buyer',
  stage: 'Finance',
})
assert.equal(migratedFinanceLead.stage, 'Transaction')
assert.equal(migratedFinanceLead.buyerProcessStageKey, 'transaction')
assert.equal(migratedFinanceLead.buyerProcessOtpDeprecated, true)

const sellerLead = migrateBuyerProcessLeadRecord({
  leadId: 'lead_3',
  leadCategory: 'seller',
  stage: 'Deal Created',
  status: 'Deal Created',
})
assert.equal(sellerLead.stage, 'Deal Created')
assert.equal(sellerLead.status, 'Deal Created')
assert.equal(sellerLead.buyerProcessStageKey, undefined)

assert.equal(isDeprecatedBuyerOtpStage('Ready to Generate OTP'), true)
assert.equal(isDeprecatedBuyerOtpStage('Finance'), true)
assert.equal(isDeprecatedBuyerOtpStage('OTP Transaction'), false)
assert.equal(isDeprecatedBuyerOtpAction('Generate OTP'), true)
assert.equal(isDeprecatedBuyerOtpAction('Upload Offer Document'), false)

assert.match(agencyPipelineServiceSource, /import \{ migrateBuyerProcessLeadRecord \}/)
assert.match(agencyPipelineServiceSource, /return migrateBuyerProcessLeadRecord\(normalizedLead\)/)
assert.match(agencyCrmRepositorySource, /import \{ migrateBuyerProcessLeadRecord \}/)
assert.match(agencyCrmRepositorySource, /return migrateBuyerProcessLeadRecord\(lead\)/)

assert.doesNotMatch(agencyPipelinePageSource, /BUYER_OTP_DEPRECATION_NOTICE/)
assert.doesNotMatch(agencyPipelinePageSource, /OTP generator deprecated/)
assert.match(agencyPipelinePageSource, /label: 'Upload Signed OTP'/)
assert.match(agencyPipelinePageSource, /BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY = 'onboarding_otp'/)
assert.match(agencyPipelinePageSource, /Open Setup \/ Offer/)
assert.doesNotMatch(agencyPipelinePageSource, /key: 'offers'/)
assert.doesNotMatch(agencyPipelinePageSource, /Open Offer Centre/)
assert.doesNotMatch(agencyPipelinePageSource, /label: 'Generate OTP'/)
assert.doesNotMatch(agencyPipelinePageSource, /Generate & Send OTP/)
assert.doesNotMatch(agencyPipelinePageSource, /Preparing OTP pack/)
assert.doesNotMatch(agencyPipelinePageSource, /successPrefix: 'OTP '/)
assert.match(agencyPipelinePageSource, /Opening OTP upload workspace/)
assert.doesNotMatch(agencyPipelinePageSource, /successPrefix: 'Offer upload '/)

assert.match(buyerOfferSubmissionSource, /title: 'Offer Transaction'/)
assert.match(buyerOfferSubmissionSource, /signed offer after onboarding is submitted/)
assert.match(buyerOfferSubmissionSource, /Signed Offer Prepared Next/)
assert.match(buyerOfferSubmissionSource, /Signed offer prepared or uploaded/)
assert.match(buyerOfferSubmissionSource, /Buyer signs offer/)
assert.match(buyerOfferSubmissionSource, /Offer Route/)
assert.doesNotMatch(buyerOfferSubmissionSource, /title: 'OTP Transaction'/)
assert.doesNotMatch(buyerOfferSubmissionSource, /OTP Transaction Prepared Next/)
assert.doesNotMatch(buyerOfferSubmissionSource, /OTP prepared or uploaded/)
assert.doesNotMatch(buyerOfferSubmissionSource, /Buyer signs OTP/)
assert.doesNotMatch(buyerOfferSubmissionSource, /OTP Route/)
assert.doesNotMatch(buyerOfferSubmissionSource, /confirm the OTP transaction next/)

console.log('Buyer process Phase 6 migration + OTP deprecation contract passed.')
