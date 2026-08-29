import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [migration, repository, panel] = await Promise.all(['sql/20260829_rental_unit_foundation.sql', 'src/services/rentals/rentalUnitRepository.js', 'src/modules/rentals/shared/units/RentalUnitsPanel.jsx'].map((file) => fs.readFile(path.join(root, file), 'utf8')))
for (const marker of ['create table if not exists public.rental_units', 'create table if not exists public.rental_unit_status_history', 'rental_units_occupied_claim_check', 'rental_units_active_tenancy_unique', 'rental_unit_validate_property_scope', 'rental_unit_restrict_occupancy_mutation', 'enable row level security']) assert.match(migration, new RegExp(marker.replaceAll('.', '\\.')))
assert.doesNotMatch(migration, /private_listings/i)
assert.match(repository, /from\('rental_units'\)/)
assert.match(panel, /A house uses one default MAIN unit/)
console.log('Rentals Phase 8 unit foundation checks passed.')
