import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('./site-repository.ts', import.meta.url), 'utf8')
const functionSource = source.slice(source.indexOf('async function getPublishedPartnerListings('), source.indexOf('async function getPublishedWebsiteListings('))
const javascript = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const readPartnerListings = new Function('mapSnapshotMedia', `${javascript}; return getPublishedPartnerListings`)((media) => media)

function client(sourceOrganisation = 'isell', channelStatus = 'published', grantEnabled = true) {
  const tables = {
    website_partner_listing_publications: [{ listing_id: 'listing', grant_id: 'grant', website_site_id: 'kingdom-site', status: channelStatus, publication_json: { title: 'Saved snapshot' }, media_json: [] }],
    website_partner_listing_grants: [{ id: 'grant', source_organisation_id: 'isell', website_site_id: 'kingdom-site', enabled: grantEnabled }],
    private_listings: [{ id: 'listing', organisation_id: sourceOrganisation, arch9_reference: 'A9-ISP-123456' }],
  }
  return { from(table) {
    // No Arch9 publication lookup should gate a published channel snapshot.
    assert.ok(table in tables, `Unexpected prerequisite: ${table}`)
    let rows = tables[table]
    const query = {
      select() { return query }, order() { return query }, limit() { return query },
      eq(key, value) { rows = rows.filter((row) => row[key] === value); return query },
      in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query },
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
    }
    return query
  } }
}

test('Kingdom serves its published snapshot independently of Arch9 publication', async () => {
  const result = await readPartnerListings(client(), { id: 'kingdom-site', organisationId: 'kingdom' }, 100)
  assert.equal(result.length, 1)
  assert.equal(result[0].row.title, 'Saved snapshot')
})

test('unpublished channels, disabled grants and other agencies remain excluded', async () => {
  for (const database of [client('isell', 'unpublished'), client('isell', 'published', false), client('other-agency')]) {
    assert.deepEqual(await readPartnerListings(database, { id: 'kingdom-site', organisationId: 'kingdom' }, 100), [])
  }
})
