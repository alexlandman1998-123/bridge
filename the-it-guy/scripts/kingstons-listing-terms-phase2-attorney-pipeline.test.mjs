import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const readRoot = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

const allocationService = read('src/services/privateListingAttorneyAllocationService.js')
assert.match(
  allocationService,
  /export async function allocatePrivateListingTransferAttorneyPreInstruction/,
  'Kingstons listing terms should use a pre-instruction allocation service boundary.',
)
assert.match(
  allocationService,
  /bridge_resolve_partner_role_configuration/,
  'Pre-instruction allocation should resolve the canonical partner role configuration.',
)
assert.match(
  allocationService,
  /bridge_allocate_private_listing_transfer_attorney_v2/,
  'Pre-instruction allocation should prefer the canonical private-listing attorney allocator.',
)
assert.match(
  allocationService,
  /attorney_not_connected/,
  'Free-text attorney nominations should be explicitly skipped until the firm is connected.',
)

const agencyPipeline = read('src/pages/agency/AgencyPipelinePage.jsx')
assert.match(
  agencyPipeline,
  /allocatePrivateListingTransferAttorneyPreInstruction/,
  'Kingstons listing conversion should call the pre-instruction allocation service.',
)
assert.match(
  agencyPipeline,
  /transfer_attorney_pre_instruction_allocated/,
  'A routed attorney allocation should be visible as a private listing activity.',
)
assert.match(
  agencyPipeline,
  /pre_instruction_only_until_signed_otp/,
  'Kingstons attorney allocation must preserve the signed-OTP instruction boundary.',
)
assert.match(
  agencyPipeline,
  /Connect the attorney firm to add it to their pipeline/,
  'Unconnected attorneys should not be presented as routed pipeline items.',
)

const preInstructionMigration = readRoot('supabase/migrations/202607140010_attorney_pre_instruction_pipeline_phase2.sql')
assert.match(
  preInstructionMigration,
  /allocation\.allocation_status = 'awaiting_buyer'/,
  'Attorney pre-instruction pipeline should read awaiting-buyer private listing allocations.',
)

const signedOtpMigration = readRoot('supabase/migrations/202607140012_signed_otp_transfer_instruction_activation_phase4.sql')
assert.match(
  signedOtpMigration,
  /allocation_status = 'instructed'/,
  'Signed OTP should remain the trigger that converts pre-instruction allocation into formal instruction.',
)
assert.match(
  signedOtpMigration,
  /lower\(coalesce\(new\.onboarding_status, ''\)\) not in \('signed_otp_received', 'otp_uploaded'\)/,
  'The formal instruction trigger must remain gated to signed OTP statuses.',
)

console.log('Kingstons listing terms Phase 2 attorney pipeline checks passed.')
