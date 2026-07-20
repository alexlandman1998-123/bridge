import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'
import { buildPrivateListingAttorneyAllocationInput } from '../src/services/privateListingAttorneyAllocationService.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const listingId = '11111111-1111-4111-8111-111111111111'
const partnerId = '22222222-2222-4222-8222-222222222222'
const packetId = '33333333-3333-4333-8333-333333333333'
const roleConfigurationId = '44444444-4444-4444-8444-444444444444'

const mandateData = mapSellerOnboardingToMandateData({
  onboardingSubmission: { status: 'completed' },
  mandateDraft: {
    sellerFullName: 'Seller Example',
    propertyAddress: '1 Example Street',
    mandateType: 'sole',
    mandateStartDate: '2026-07-14',
    mandateEndDate: '2026-10-14',
    askingPrice: '2500000',
    commissionStructure: 'percentage',
    commissionPercent: '5',
    transferAttorneyPreferredPartnerId: partnerId,
    transferAttorneyPartnerRoleConfigurationId: roleConfigurationId,
    transferAttorneyCompanyName: 'Example Attorneys Inc.',
    transferAttorneyContactPerson: 'Transfer Department',
    transferAttorneyEmail: 'TRANSFERS@EXAMPLE.CO.ZA',
    transferAttorneyPhone: '+27 11 555 0100',
    transferAttorneySelectionSource: 'seller_mandate',
  },
})

assert.equal(mandateData.transferAttorney.companyName, 'Example Attorneys Inc.')
assert.equal(mandateData.transferAttorney.email, 'transfers@example.co.za')
assert.equal(mandateData.placeholders.transfer_attorney_company_name, 'Example Attorneys Inc.')
assert.equal(mandateData.placeholders.transfer_attorney_contact_person, 'Transfer Department')
assert.equal(mandateData.placeholders.transfer_attorney_email, 'transfers@example.co.za')
assert.equal(mandateData.placeholders.transfer_attorney_phone, '+27 11 555 0100')

const allocationInput = buildPrivateListingAttorneyAllocationInput({
  privateListingId: listingId,
  attorney: mandateData.transferAttorney,
  mandatePacketId: packetId,
  mandateSignedAt: '2026-07-14T10:00:00.000Z',
  source: 'seller_mandate',
})

assert.equal(allocationInput.p_private_listing_id, listingId)
assert.equal(allocationInput.p_preferred_partner_id, partnerId)
assert.equal(allocationInput.p_partner_role_configuration_id, roleConfigurationId)
assert.equal(allocationInput.p_company_name, 'Example Attorneys Inc.')
assert.equal(allocationInput.p_email_address, 'transfers@example.co.za')
assert.equal(allocationInput.p_selection_source, 'seller_mandate')
assert.equal(allocationInput.p_mandate_packet_id, packetId)

assert.throws(
  () => buildPrivateListingAttorneyAllocationInput({ privateListingId: listingId, attorney: {} }),
  /Select a transfer attorney/,
)

const [pageSource, panelSource, migrationSource] = await Promise.all([
  readFile(resolve(root, 'src/pages/LegalDocumentWorkspacePage.jsx'), 'utf8'),
  readFile(resolve(root, 'src/components/documents/MandateDraftIntakePanel.jsx'), 'utf8'),
  readFile(resolve(root, '../supabase/migrations/202607140009_private_listing_transfer_attorney_allocation_phase1.sql'), 'utf8'),
])

assert.match(pageSource, /allocatePrivateListingTransferAttorney/)
assert.match(pageSource, /transfer_attorney_allocated/)
assert.match(panelSource, /Seller's transferring attorney/)
assert.match(panelSource, /Seller will nominate the transferring attorney later/)
assert.match(migrationSource, /private_listing_role_players_active_transfer_idx/)
assert.match(migrationSource, /bridge_allocate_private_listing_transfer_attorney/)
assert.match(migrationSource, /'awaiting_buyer',\n\s+p_mandate_packet_id/)
assert.match(migrationSource, /when v_existing\.allocation_status in \('under_offer', 'instructed'\)/)

console.log('Mandate attorney allocation Phase 1 checks passed.')
