import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [migration, repository, propertiesPage] = await Promise.all([
  fs.readFile(path.join(root, 'sql/20260829_rental_property_foundation.sql'), 'utf8'),
  fs.readFile(path.join(root, 'src/services/rentals/rentalPropertyRepository.js'), 'utf8'),
  fs.readFile(path.join(root, 'src/pages/rentals/RentalPropertiesPage.jsx'), 'utf8'),
])
for (const table of ['rental_properties', 'rental_party_relationships', 'rental_party_workflow_snapshots']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
assert.match(migration, /enable row level security/)
assert.match(migration, /to authenticated/)
assert.match(migration, /rental_branch_access/)
assert.doesNotMatch(migration, /alter table public\.private_listings/i)
assert.match(repository, /from\('rental_properties'\)/)
assert.doesNotMatch(repository, /from\('private_listings'\)/)
assert.match(propertiesPage, /separate from marketing listings/)
console.log('Rentals Phase 7 property foundation checks passed.')
