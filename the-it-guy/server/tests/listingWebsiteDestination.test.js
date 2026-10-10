import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveListingWebsiteDestination } from '../../api/listings/syndication-availability.js'

const source = 'isell'
const site = { id: 'kingdom-site', organisation_id: 'kingdom', status: 'published' }
function client({ ownSite = null, grant = true, partnerSite = site, activeDomain = true, grantError = null } = {}) {
  const reads = []
  return { reads, from(table) {
    const filters = []
    const query = {
      select() { return query },
      eq(key, value) { filters.push([key, value]); return query },
      order() { return query }, limit() { return query }, maybeSingle() { return query },
      then(resolve) {
        reads.push({ table, filters })
        let data
        if (table === 'website_sites') data = filters.some(([key]) => key === 'id') ? partnerSite : ownSite
        if (table === 'website_partner_listing_grants') data = grant ? [{ website_site_id: site.id }] : []
        if (table === 'website_domains') data = activeDomain ? [{ hostname: 'kingdomrealestate.co.za' }] : []
        if (table === 'organisations') data = { name: 'Kingdom Real Estate', logo_url: '/kingdom-logo.png' }
        if (table === 'organisation_branding') data = { logo_light_url: '/kingdom-brand-logo.png' }
        return Promise.resolve({ data, error: table === 'website_partner_listing_grants' ? grantError : null }).then(resolve)
      },
    }
    return query
  } }
}

test('iSell resolves only its enabled sharing grant to the live Kingdom destination', async () => {
  const db = client()
  assert.deepEqual(await resolveListingWebsiteDestination(db, source), {
    available: true, reason: '', channel: 'kingdom_website', websiteSiteId: site.id,
    hostname: 'kingdomrealestate.co.za', label: 'Kingdom Real Estate Website', logoUrl: '/kingdom-brand-logo.png',
  })
  assert.deepEqual(db.reads.find(read => read.table === 'website_partner_listing_grants').filters, [['source_organisation_id', source], ['enabled', true]])
  assert.deepEqual(db.reads.find(read => read.table === 'website_domains').filters, [['website_site_id', site.id], ['status', 'active']])
})

test('Kingdom uses its own website without requiring a partner grant', async () => {
  const db = client({ ownSite: site })
  const destination = await resolveListingWebsiteDestination(db, 'kingdom')
  assert.equal(destination.available, true)
  assert.equal(destination.channel, 'agency_website')
  assert.equal(destination.label, 'Kingdom Real Estate Website')
  assert.equal(destination.logoUrl, '/kingdom-brand-logo.png')
  assert.equal(db.reads.some(read => read.table === 'website_partner_listing_grants'), false)
})

test('absent grants, unpublished sites and inactive domains cannot enable publishing', async () => {
  for (const settings of [{ grant: false }, { partnerSite: null }, { partnerSite: { ...site, status: 'draft' } }, { activeDomain: false }]) {
    assert.equal((await resolveListingWebsiteDestination(client(settings), source)).available, false)
  }
})

test('failed permission/configuration reads fail closed and older installations without partner channels stay disconnected', async () => {
  await assert.rejects(resolveListingWebsiteDestination(client({ grantError: new Error('permission denied') }), source), /permission denied/)
  assert.equal((await resolveListingWebsiteDestination(client({ grantError: { code: '42P01' } }), source)).available, false)
})
