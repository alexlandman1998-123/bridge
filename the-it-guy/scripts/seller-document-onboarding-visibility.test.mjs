import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  filterSellerDocumentRequirementsForOnboarding,
  isManualSignedFicaDeclarationRequirement,
} from '../src/services/sellerDocumentRequirementsService.js'

const rows = [
  { key: 'signed_fica_declaration', label: 'Signed FICA Declaration' },
  { key: 'signed_mandate', label: 'Signed Mandate' },
  { key: 'seller_fica_id_document', label: 'Seller ID Document' },
]

assert.equal(isManualSignedFicaDeclarationRequirement(rows[0]), true)
assert.equal(isManualSignedFicaDeclarationRequirement({ label: 'Signed FICA Declaration' }), true)
assert.equal(filterSellerDocumentRequirementsForOnboarding(rows, { onboardingSubmitted: false }).length, 3)

const portalRows = filterSellerDocumentRequirementsForOnboarding(rows, { onboardingSubmitted: true })
assert.deepEqual(
  portalRows.map((row) => row.key),
  ['signed_mandate', 'seller_fica_id_document'],
  'submitted portal onboarding should replace only the manual signed FICA declaration requirement',
)

const workspaceSource = await readFile(new URL('../src/components/documents/LeadDocumentWorkspace.jsx', import.meta.url), 'utf8')
assert.match(workspaceSource, /populatedCategories\.map\(\(category\)/)
assert.match(workspaceSource, /document-category-\$\{category\.key\}/)
assert.match(workspaceSource, /Document categories/)

console.log('seller document onboarding visibility tests passed')
