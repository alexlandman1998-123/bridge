import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const signingPage = read('src/pages/ListingMandateSigning.jsx')
const documentModel = read('src/lib/sellerSigningPackDocumentModel.js')
const edgeFunction = read('../supabase/functions/listing-mandate-signing/index.ts')
const migration = read('../supabase/migrations/20260919193637_extend_listing_signing_fica_details.sql')

assert.match(signingPage, /Review and correct your FICA details/)
assert.match(signingPage, /FICA details are managed by the primary contact/)
assert.match(signingPage, /<FicaField label="First name" field="firstName"/)
assert.match(signingPage, /<FicaField label="Surname" field="surname"/)
assert.match(signingPage, /<FicaField label="Date of birth" field="dateOfBirth"/)
assert.match(signingPage, /Saving changes updates the seller profile and this unsigned pack for every signer/)
assert.match(signingPage, /missingFicaDetails/)
assert.match(documentModel, /row\('First name', seller\.firstName\)/)
assert.match(documentModel, /row\('Date of birth', seller\.dateOfBirth\)/)
assert.match(edgeFunction, /function ficaDetailErrors/)
assert.match(edgeFunction, /Only the primary document contact can change shared seller details/)
assert.match(edgeFunction, /firstName: text\(fica\.firstName\), surname: text\(fica\.surname\)/)
assert.match(edgeFunction, /sourceOfFunds: text\(fica\.sourceOfFunds\)/)
assert.match(edgeFunction, /First name: \$\{escapeHtml\(seller\.firstName\)\}/)
assert.match(migration, /create or replace function public\.bridge_update_listing_signing_seller_details/)
assert.match(migration, /'sellerFirstName'/)
assert.match(migration, /signing_group_id/)
assert.match(migration, /grant execute on function public\.bridge_update_listing_signing_seller_details\(uuid, jsonb\) to service_role/)

console.log('Seller signing FICA correction phase 4 checks passed.')
