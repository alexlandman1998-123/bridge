import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveListingDeletion, verifyListingDeletion } from '../src/services/privateListingDeletion.js'
function client(rows, error = null) {
  return { from() {
    const filters = []
    const q = { select() { return q }, eq(k,v) { filters.push([k,v]); return q },
      async maybeSingle() { return { data: rows.find(r => filters.every(([k,v]) => r[k]===v)) || null, error } },
      async limit(n) { return { data: rows.filter(r => filters.every(([k,v]) => r[k]===v)).slice(0,n), error } }
    }; return q
  } }
}
const listing={ id:'remote',organisation_id:'kingdom',listing_reference:'PRV-TEST' }
test('stale draft UUID resolves to real server listing in the same organisation',async()=>{
  assert.deepEqual(await resolveListingDeletion(client([listing]),'local',{organisationId:'kingdom',listingReference:'PRV-TEST'}),listing)
})
test('never substitutes another organisation or a conflicting existing UUID',async()=>{
  assert.equal(await resolveListingDeletion(client([listing]),'local',{organisationId:'other',listingReference:'PRV-TEST'}),null)
  await assert.rejects(resolveListingDeletion(client([listing]),'remote',{organisationId:'kingdom',listingReference:'different'}),/identity has changed/)
})
test('ambiguous references and failed reads stop deletion',async()=>{
  await assert.rejects(resolveListingDeletion(client([listing,{...listing,id:'second'}]),'local',{organisationId:'kingdom',listingReference:'PRV-TEST'}),/More than one/)
  await assert.rejects(resolveListingDeletion(client([],new Error('offline')),'remote'),/offline/)
})
test('a success response cannot hide a listing that still exists',async()=>{
  await assert.rejects(verifyListingDeletion(client([listing]),listing),/still saved/)
  await verifyListingDeletion(client([]),listing)
})
