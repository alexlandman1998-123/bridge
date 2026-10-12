import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectAuthoritativeListingOptionSource } from '../src/services/listingOptionAuthorityService.js'
import { PGlite } from '@electric-sql/pglite'

const listingId = 'd8c01acb-a4ca-422f-b11a-d4a4fe0c3c45'
const hydrated = {
  id: listingId,
  sourceAuthority: 'canonical_listing',
  updatedAt: '2026-08-29T19:28:44.614Z',
  sourceListing: {
    id: listingId,
    sellerLeadId: 'seller-1',
    listingStatus: 'onboarding_completed',
    mandateStatus: 'not_started',
    sellerOnboardingStatus: 'completed',
    sellerOnboarding: { status: 'completed', submittedAt: '2026-08-29T19:28:44.614Z' },
    documents: [],
  },
}
const newerLeadProjection = {
  id: listingId,
  sourceAuthority: 'lead_projection',
  updatedAt: '2026-08-30T14:21:58.781Z',
  sourceListing: {
    id: listingId,
    address: '130 Nahoon Singel',
    updatedAt: '2026-08-30T14:21:58.781Z',
  },
}

assert.equal(
  selectAuthoritativeListingOptionSource(hydrated, newerLeadProjection).sourceListing.sellerOnboarding.status,
  'completed',
  'a newer CRM projection must not replace canonical onboarding evidence',
)
assert.equal(
  selectAuthoritativeListingOptionSource(newerLeadProjection, hydrated).sourceListing.mandateStatus,
  'not_started',
  'canonical listing selection must be independent of hydration order',
)

const newerCompactListing = {
  id: listingId,
  sourceAuthority: 'canonical_listing',
  updatedAt: '2026-08-30T15:00:00.000Z',
  sourceListing: { id: listingId, listingStatus: 'onboarding_completed' },
}
assert.ok(
  selectAuthoritativeListingOptionSource(hydrated, newerCompactListing).sourceListing.sellerOnboarding,
  'a compact listing query must not replace a richer hydrated listing of equal authority',
)

const canonicalHydratedListing = {
  ...hydrated,
  sourceAuthority: 'canonical_hydrated_listing',
  sourceListing: {
    ...hydrated.sourceListing,
    documentRequirements: [{ id: 'requirement-mandate', requirement_key: 'signed_mandate' }],
    documents: [{ id: 'document-mandate', document_type: 'signed_mandate', status: 'completed', storage_path: 'seller-signing/listing/session/signed-mandate.pdf' }],
  },
}
assert.equal(
  selectAuthoritativeListingOptionSource(canonicalHydratedListing, newerCompactListing).sourceListing.documents[0].id,
  'document-mandate',
  'a shallow canonical listing must never replace the document-complete read model',
)

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /listingOptionSourceAuthority:\s*'lead_projection'/)
assert.match(pageSource, /listingOptionSourceAuthority:\s*'canonical_hydrated_listing'/)
assert.match(pageSource, /selectedLeadHydratedListing/)
assert.match(pageSource, /Loading signed seller documents/)
assert.match(pageSource, /Checking signed documents/)
assert.match(pageSource, /selectAuthoritativeListingOptionSource\(existing, option\)/)

const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table private_listings(id uuid primary key, organisation_id uuid,
      address_line_1 text,address_line_2 text,street_address text,suburb text,city text,province text,country text,postal_code text,google_place_id text,
      latitude numeric,longitude numeric,property_type text,asking_price numeric,estimated_value numeric,
      seller_onboarding_status text,listing_status text,listing_visibility text,is_active boolean,mandate_status text,mandate_packet_id uuid,
      seller_lead_id text,originating_crm_lead_id text,updated_at timestamptz);
    create table private_listing_seller_onboarding(id uuid primary key,private_listing_id uuid,status text,form_data jsonb,updated_at timestamptz);
    create table private_listing_documents(private_listing_id uuid,document_type text,status text,updated_at timestamptz);
    create table private_listing_document_requirements(private_listing_id uuid,requirement_group text,requirement_key text,status text,is_required boolean,updated_at timestamptz);
    create table leads(organisation_id uuid,lead_id text,stage text,status text,seller_property_address text,formatted_address text,street_address text,
      suburb text,city text,province text,country text,postal_code text,google_place_id text,latitude numeric,longitude numeric,estimated_value numeric,
      mandate_packet_id uuid,seller_onboarding_status text,listing_id uuid,updated_at timestamptz);
    create table private_listing_activity(private_listing_id uuid,activity_type text,activity_title text,activity_description text,visibility text,metadata jsonb);
  `)
  for (const file of ['20260830155108_seller_listing_hydration_authority_and_property_reconciliation.sql',
    '20260830155228_seller_listing_reconciliation_coalesce_fix.sql', '20261012152243_seller_property_address_identity_reconciliation.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  const formatted = '942 Ben Swart St, Villieria, Pretoria, 0186, South Africa'
  for (const scenario of [
    { label: 'formatted address does not duplicate locality', saved: formatted, incoming: formatted, changed: false },
    { label: 'short street line and full address are the same property', saved: '942 Ben Swart St,', incoming: formatted, changed: false },
    { label: 'different street still retires the mandate', saved: formatted, incoming: '943 Ben Swart St, Villieria, Pretoria, 0186, South Africa', changed: true },
    { label: 'same street in another city remains a property change', saved: formatted, incoming: '942 Ben Swart St, Villieria, Johannesburg', city: 'Johannesburg', changed: true },
    { label: 'different place ID wins over matching text', saved: formatted, incoming: formatted, savedPlace: 'old-place', newPlace: 'new-place', changed: true },
    { label: 'same place ID preserves the mandate despite formatting', saved: formatted, incoming: '942 Ben Swart Street', savedPlace: 'same-place', newPlace: 'same-place', changed: false },
    { label: 'different unit at the same street needs a new mandate', saved: formatted, incoming: formatted + ', Unit 2', line2: 'Unit 2', changed: true },
  ]) {
    await db.exec('truncate private_listing_activity,private_listing_seller_onboarding,private_listing_documents,private_listing_document_requirements,private_listings')
    await db.query(`insert into private_listings(id,organisation_id,address_line_1,street_address,suburb,city,province,postal_code,google_place_id,
      listing_status,listing_visibility,is_active,mandate_status) values($1,$1,$2,$2,'Villieria','Pretoria','Gauteng','0186',$3,'active','public',true,'signed')`, [listingId, scenario.saved, scenario.savedPlace || null])
    await db.query("insert into private_listing_documents values($1,'signed_mandate','approved',now())", [listingId])
    await db.query("insert into private_listing_document_requirements values($1,'mandate','signed_mandate','completed',true,now())", [listingId])
    await db.query("insert into private_listing_seller_onboarding values($1,$1,'in_progress','{}',now())", [listingId])
    await db.query("update private_listing_seller_onboarding set status='completed',form_data=$1 where id=$2", [{
      propertyAddress: scenario.incoming, city: scenario.city || 'Pretoria', suburb: 'Villieria', province: 'Gauteng', postalCode: '0186',
      ...(scenario.newPlace ? { googlePlaceId: scenario.newPlace } : {}), ...(scenario.line2 ? { propertyAddressLine2: scenario.line2 } : {}),
    }, listingId])
    const saved = (await db.query('select mandate_status,is_active from private_listings')).rows[0]
    assert.equal(saved.mandate_status, scenario.changed ? 'not_started' : 'signed', scenario.label)
    assert.equal(saved.is_active, !scenario.changed, scenario.label)
    assert.equal((await db.query('select status from private_listing_documents')).rows[0].status, scenario.changed ? 'not_applicable' : 'approved', scenario.label)
    assert.equal((await db.query('select count(*)::int as n from private_listing_activity')).rows[0].n, scenario.changed ? 1 : 0, scenario.label)
  }
} finally { await db.close() }

console.log('seller listing hydration authority and property identity SQL tests passed')
