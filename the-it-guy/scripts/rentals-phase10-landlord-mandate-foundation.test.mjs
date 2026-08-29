import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [migration, repository, panel] = await Promise.all(['sql/20260829_rental_landlord_mandate_foundation.sql', 'src/services/rentals/rentalLandlordMandateRepository.js', 'src/modules/rentals/shared/landlords/RentalLandlordMandatePanel.jsx'].map((file) => fs.readFile(path.join(root, file), 'utf8')))
for (const marker of ['create table if not exists public.rental_property_landlords', 'create table if not exists public.rental_property_mandates', 'rental_property_landlords_primary_contact_unique', 'rental_property_mandates_current_active_unique', 'rental_property_scoped_record_validate', 'rental_property_marketing_readiness', 'security_invoker = true', 'enable row level security']) assert.match(migration, new RegExp(marker.replaceAll('.', '\\.')))
assert.doesNotMatch(migration, /private_listings/i)
assert.match(repository, /from\('rental_property_marketing_readiness'\)/)
assert.match(panel, /Not marketing ready/)
console.log('Rentals Phase 10 landlord and mandate foundation checks passed.')
