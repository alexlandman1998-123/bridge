import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createRentalLeadClassification,
  getRentalLeadMetadata,
  isRentalLead,
} from '../rentalLeadClassificationModel.js'

const lead = createRentalLeadClassification({ leadId: 'l1', organisationId: 'o1', vacancyId: 'v1', unitId: 'u1' })
assert.equal(lead.stage, 'new')
assert.equal(isRentalLead(lead), true)

const metadata = getRentalLeadMetadata({ rawEnquiryPayload: {
  arch9RentalLead: true,
  classification: 'rental',
  role: 'tenant',
  stage: 'contacted',
} })
assert.equal(metadata.role, 'tenant')
assert.equal(metadata.stage, 'contacted')
assert.equal(isRentalLead({ rawEnquiryPayload: metadata }), true)

const typeFix = readFileSync(new URL('../../../../../supabase/migrations/20260926212945_fix_rental_lead_classifier_listing_id_type.sql', import.meta.url), 'utf8')
assert.match(typeFix, /v_listing_id := new\.enquired_listing_id;/)
assert.match(typeFix, /if v_listing_id is null and new\.listing_id ~\*/)
assert.match(typeFix, /v_listing_id := new\.listing_id::uuid;/)
assert.match(typeFix, /pg_catalog\.replace\(v_definition, v_old, v_new\)/)
assert.match(typeFix, /raise exception 'Rental lead classifier changed/)

console.log('Rental lead classification model tests passed.')
