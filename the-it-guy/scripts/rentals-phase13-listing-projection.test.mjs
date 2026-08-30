import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [migration, repository, panel] = await Promise.all(['sql/20260829_rental_internal_marketing_operations.sql', 'src/services/rentals/rentalVacancyMarketingRepository.js', 'src/modules/rentals/shared/vacancies/RentalVacancyMarketingPanel.jsx'].map((file) => fs.readFile(path.join(root, file), 'utf8')))
for (const marker of ['rental_vacancy_marketing_status_history', 'rental_vacancy_marketing_validate_operation', 'enable row level security']) assert.match(migration, new RegExp(marker.replaceAll('.', '\\.')))
assert.doesNotMatch(migration, /private_listings|property24|private property/i)
assert.match(repository, /from\('rental_vacancy_marketing'\)/)
assert.match(panel, /Nothing here creates, updates or publishes a Sales listing/)
console.log('Rentals Phase 13 internal marketing checks passed.')
