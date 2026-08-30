import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [sql, api, page] = await Promise.all(['sql/20260829_rental_applications_and_applicant_access.sql', 'server/services/publicRentalApplicationApi.js', 'src/pages/rentals/RentalApplicantJourneyPage.jsx'].map((file) => fs.readFile(path.join(root, file), 'utf8')))
for (const marker of ['rental_applications', 'rental_application_access_tokens', 'enable row level security']) assert.match(sql, new RegExp(marker))
assert.match(api, /token_hash/); assert.match(api, /Authorization/); assert.match(page, /Save draft/)
console.log('Rentals Phase 23 applicant journey checks passed.')
