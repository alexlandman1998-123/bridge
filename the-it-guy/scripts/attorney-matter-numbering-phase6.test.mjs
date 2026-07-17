import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  attorneyMatterReferenceMatchesQuery,
  buildAttorneyMatterDocumentReferenceContext,
} from '../src/services/attorneyMatterNumberingService.js'

assert.deepEqual(
  buildAttorneyMatterDocumentReferenceContext({
    effectiveReference: 'YL/26/0042/LEGAL',
    platformReference: 'A9-ABC123',
    referenceStatus: 'confirmed',
    lane: 'transfer',
  }),
  {
    matterReference: 'YL/26/0042/LEGAL',
    matter_reference: 'YL/26/0042/LEGAL',
    transactionReference: 'A9-ABC123',
    transaction_reference: 'A9-ABC123',
    platformReference: 'A9-ABC123',
    platform_reference: 'A9-ABC123',
    matterReferenceStatus: 'confirmed',
    matter_reference_status: 'confirmed',
    matterLane: 'transfer',
    matter_lane: 'transfer',
  },
)

const searchableReference = {
  effectiveReference: 'YL/26/0042/LEGAL',
  platformReference: 'A9-ABC123',
  filingReference: 'YL/26/0042/LEGAL',
  referenceAliases: ['MAT-2026-000042', 'YL-OLD-42', 'A9-ABC123'],
}
assert.equal(attorneyMatterReferenceMatchesQuery(searchableReference, 'YL-OLD-42'), true, 'historical aliases must remain searchable')
assert.equal(attorneyMatterReferenceMatchesQuery(searchableReference, 'a9-abc123'), true, 'Arch9 references must be searchable case-insensitively')
assert.equal(attorneyMatterReferenceMatchesQuery(searchableReference, 'not-this-matter'), false)

const [migration, operations, workspace, mattersPage, documentWorkspace, detailPage] = await Promise.all([
  readFile(new URL('../../supabase/migrations/202607170008_attorney_matter_numbering_phase6_reference_index.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/attorneyOperations.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/attorneyMatterWorkspace.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8'),
])

for (const aliasSource of [
  'provisional_reference',
  'filing_reference',
  'platform_reference',
  'matter_number',
  'transaction_reference',
  'previous_reference',
  'new_reference',
]) {
  assert.ok(migration.includes(aliasSource), `reference index must include ${aliasSource}`)
}
assert.match(migration, /attorney_user_is_active_member/)
assert.match(migration, /bridge_can_access_transaction_spine/)
assert.match(operations, /getAttorneyMatterReferenceIndex/)
assert.match(workspace, /buildAttorneyMatterReferenceSearchText/)
assert.match(mattersPage, /<MatterReferenceMeta row=\{row\}/)
assert.match(documentWorkspace, /buildAttorneyMatterDocumentReferenceContext/)
assert.match(documentWorkspace, /matter_number: referenceContext\.matter_reference/)
assert.match(detailPage, /params\.set\('matterLane'/)
assert.match(detailPage, /printSubtitle=\{workspaceRole === 'attorney'/)

console.log('attorney matter-numbering Phase 6 tests passed')
