import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
const [repository, panel, vacancies, applications, tenancies, collections, imports, migration, runbook] = await Promise.all([
  read('src/services/rentals/rentalVacancyMarketingRepository.js'),
  read('src/modules/rentals/shared/vacancies/RentalVacancyMarketingPanel.jsx'),
  read('src/pages/rentals/RentalVacanciesPage.jsx'),
  read('src/pages/rentals/RentalApplicationsPage.jsx'),
  read('src/pages/rentals/RentalTenanciesPage.jsx'),
  read('src/pages/rentals/RentalCollectionsPage.jsx'),
  read('src/pages/rentals/RentalFinancialImportsPage.jsx'),
  read('../supabase/migrations/20260830105640_rental_media_upload_hardening.sql'),
  read('docs/rentals-phase52-production-readiness.md'),
])

assert.match(repository, /RENTAL_MEDIA_UPLOAD_MAX_BYTES = 20 \* 1024 \* 1024/)
assert.match(repository, /image\/jpeg/)
assert.match(repository, /video\/quicktime/)
assert.match(repository, /validateRentalMediaUpload\(file\)/)
assert.match(panel, /accept=\{RENTAL_MEDIA_UPLOAD_ACCEPT\}/)
for (const page of [vacancies, applications, tenancies, collections, imports]) {
  assert.match(page, /error/i)
  assert.match(page, /loading|Loading/i)
}
assert.match(migration, /file_size_limit = 20971520/)
assert.match(migration, /allowed_mime_types/)
assert.match(migration, /create policy rental_vacancy_media_upload/i)
assert.match(migration, /rental_branch_access/)
assert.match(runbook, /mobile-width browser/)
assert.match(runbook, /Never use a browser-exposed service key/)

console.log('Rentals Phase 52 production readiness checks passed.')
