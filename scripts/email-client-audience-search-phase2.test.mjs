import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve('supabase/migrations/20260911144423_email_client_audience_search_phase2.sql'), 'utf8')
const component = readFileSync(resolve('the-it-guy/src/components/marketing/EmailCampaigns.jsx'), 'utf8')

for (const expected of ['enquiry_property_type', 'highest_enquiry_price', 'email_marketing_contacts_enquiry_search_idx']) assert.ok(migration.includes(expected), `Missing enquiry-search data support: ${expected}`)
for (const expected of ['Enquired property type', 'Minimum enquiry price', 'searchableContacts', 'Curated search']) assert.ok(component.includes(expected), `Missing curated-search control: ${expected}`)
console.log('Email client audience search Phase 2 checks passed.')
