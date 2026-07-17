import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { validateAttorneyMatterFilingReference } from '../src/services/attorneyMatterNumberingService.js'

assert.equal(validateAttorneyMatterFilingReference('YL/26/0042/LEGAL'), '')
assert.equal(validateAttorneyMatterFilingReference('   '), 'A filing reference is required.')
assert.equal(
  validateAttorneyMatterFilingReference('X'.repeat(161)),
  'The filing reference cannot exceed 160 characters.',
)

const [cardSource, detailSource, serviceSource] = await Promise.all([
  readFile(new URL('../src/components/attorney/AttorneyMatterReferenceCard.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/attorneyMatterNumberingService.js', import.meta.url), 'utf8'),
])

assert.match(detailSource, /<AttorneyMatterReferenceCard/)
assert.match(detailSource, /attorneyMatterReference\?\.effectiveReference/)
assert.match(cardSource, /Edit matter number/)
assert.match(cardSource, /Confirm matter number/)
assert.match(cardSource, /Arch9 reference:/)
assert.match(cardSource, /Documents already generated/)
assert.match(cardSource, /Matter number history/)
assert.match(serviceSource, /attorney_matter_reference_is_available/)
assert.match(serviceSource, /set_attorney_matter_filing_reference/)
assert.doesNotMatch(serviceSource, /transactions['"]\)\s*\.update\([^)]*matter_number/s)

console.log('attorney matter-numbering Phase 5 tests passed')
