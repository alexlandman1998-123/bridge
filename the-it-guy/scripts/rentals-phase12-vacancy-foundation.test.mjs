import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [migration, repository, page] = await Promise.all(['sql/20260829_rental_vacancy_foundation.sql', 'src/services/rentals/rentalVacancyRepository.js', 'src/pages/rentals/RentalVacanciesPage.jsx'].map((file) => fs.readFile(path.join(root, file), 'utf8')))
for (const marker of ['create table if not exists public.rental_vacancies', 'rental_vacancies_one_open_unit_unique', 'rental_vacancy_validate_scope_and_transition', 'rental_vacancy_record_status_history', 'rental_property_marketing_readiness', 'enable row level security']) assert.match(migration, new RegExp(marker.replaceAll('.', '\\.')))
assert.doesNotMatch(migration, /private_listings/i)
assert.match(repository, /from\('rental_vacancies'\)/)
assert.match(page, /independent from marketing listings/)
console.log('Rentals Phase 12 vacancy foundation checks passed.')
