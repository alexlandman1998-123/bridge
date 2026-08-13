import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const agencyPage = read('the-it-guy/src/pages/agency/AgencyPipelinePage.jsx')
const sellerDefinition = read('the-it-guy/src/services/sellerProcessDefinitionService.js')
const sellerPanel = read('the-it-guy/src/services/sellerProcessWorkspacePanelService.js')
const currentListingImportGuardMigration = read('supabase/migrations/202608130002_current_listing_import_activation_guard.sql')
const currentListingOperationalShapeMigration = read('supabase/migrations/202608130004_current_listing_upload_later_operational_shape.sql')

assert(!sellerDefinition.includes("key: 'listing_terms_confirmed'"), 'Kingstons seller process must not include a Listing Terms stage.')
assert(!sellerDefinition.includes("key: 'commission_terms_confirmed'"), 'Commission terms must not be a seller process evidence gate.')
assert(!sellerDefinition.includes("key: 'transfer_attorney_nominated'"), 'Transfer attorney must not be a seller process evidence gate.')
assert(!sellerPanel.includes("key: 'confirm_listing_terms'"), 'Seller workspace actions must not prompt agents to confirm listing terms.')

assert(!agencyPage.includes('!selectedKingstonsListingTermsSummary.complete'), 'Seller listing creation must not be blocked by listing terms.')
assert(!agencyPage.includes('transferAttorneyPreferredPartnerId'), 'Seller onboarding must not send a transfer attorney selection.')

assert(agencyPage.includes('getKingstonsBuyerOtpTermsState'), 'Buyer OTP terms must be read from the buyer lead.')
assert(agencyPage.includes('kingstonsBuyerOtpTerms'), 'Buyer OTP terms must be saved on the buyer lead payload.')
assert(agencyPage.includes('commissionVatIncluded'), 'Commission VAT inclusive/exclusive state must be captured.')
assert(agencyPage.includes('kingstons-buyer-otp-terms-summary'), 'Buyer OTP workspace must expose the internal terms selection card.')
assert(agencyPage.includes('handleCompleteKingstonsValuationPresentationFromJourney'), 'Kingstons valuation presentation completion must use the direct Seller Pack transition helper.')
assert(
  agencyPage.includes("if (selectedLeadHasKingstonsPipelineSignal) {\n        void handleCompleteKingstonsValuationPresentationFromJourney()"),
  'Kingstons Complete Valuation Presentation action must move directly to Seller Pack instead of opening the appointment modal.',
)

assert(
  currentListingImportGuardMigration.includes('bridge_private_listing_is_current_import_activation_phase0'),
  'Database mandate guard must expose a current-listing import bypass helper.',
)
assert(
  currentListingImportGuardMigration.includes('signed_external_pending_upload') &&
    currentListingImportGuardMigration.includes('"quickaddintent":"active_listing"') &&
    currentListingImportGuardMigration.includes('"quickaddintent":"under_offer"'),
  'Database bypass must only cover current/legacy imports with upload-later mandate status.',
)
assert(
  currentListingImportGuardMigration.includes('if public.bridge_private_listing_is_current_import_activation_phase0(new) then') &&
    currentListingImportGuardMigration.includes('if public.bridge_private_listing_is_current_import_activation_phase0(v_listing) then'),
  'Private listing and publication triggers must both skip current-listing imports.',
)
assert(
  currentListingOperationalShapeMigration.includes("v_listing_status in ('active', 'listing_active', 'live', 'published', 'under_offer', 'transaction_created', 'sold')") &&
    currentListingOperationalShapeMigration.includes("v_listing_visibility in ('active_market', 'public', 'published', 'live')") &&
    currentListingOperationalShapeMigration.includes('coalesce(p_listing.is_active, false)'),
  'Database bypass must recognise already-operational upload-later listings even when old imports have no quick-add notes.',
)

console.log('Kingstons buyer OTP terms regression checks passed.')
