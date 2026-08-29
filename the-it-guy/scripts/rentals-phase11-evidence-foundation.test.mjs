import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [migration, repository, panel, propertyPage] = await Promise.all(['sql/20260829_rental_evidence_foundation.sql', 'src/services/rentals/rentalEvidenceRepository.js', 'src/modules/rentals/shared/evidence/RentalPropertyEvidencePanel.jsx', 'src/pages/rentals/RentalPropertyDetailPage.jsx'].map((file) => fs.readFile(path.join(root, file), 'utf8')))
for (const marker of ['create table if not exists public.rental_entity_documents', 'create table if not exists public.rental_activity_projections', 'rental_activity_projections_payload_budget', 'rental_evidence_validate_entity_scope', 'enable row level security', 'grant select on public.rental_activity_projections']) assert.match(migration, new RegExp(marker.replaceAll('.', '\\.')))
assert.doesNotMatch(migration, /private_listings/i)
assert.match(repository, /from\('rental_entity_documents'\)/)
assert.match(repository, /from\('rental_activity_projections'\)/)
assert.match(panel, /canonical documents/)
assert.match(propertyPage, /lazy\(\(\) => import\(/)
console.log('Rentals Phase 11 evidence foundation checks passed.')
