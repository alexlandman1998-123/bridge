import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const edge = read('../supabase/functions/listing-mandate-signing/index.ts')
const listing = read('src/pages/AgentListingDetail.jsx')

assert.match(edge, /function signingPackStatusSummary/)
assert.match(edge, /signing_pack_snapshot/)
assert.match(edge, /signingPackSummary: signingPackStatusSummary\(packSnapshot\)/)
assert.match(edge, /const \{ signing_pack_snapshot: packSnapshot, \.\.\.safeSession \} = session/)
assert.match(edge, /legalType: text\(seller\.legalType\)/)
assert.match(listing, /Shared FICA details in this signing pack/)
assert.match(listing, /currentFicaRows/)
assert.match(listing, /currentFicaIsEntity/)
assert.match(listing, /Trust registration/)
assert.match(listing, /Company registration/)
assert.match(listing, /Updates made by the primary contact are reflected here for the agent and every signer/)

console.log('Seller signing agent audit phase 5 checks passed.')
