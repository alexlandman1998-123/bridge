import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [page, edge] = await Promise.all([
  readFile(new URL('../src/pages/ListingMandateSigning.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
])

assert.match(page, /const \[acceptedDocuments, setAcceptedDocuments\] = useState\(\{\}\)/)
assert.match(page, /const missingAcceptance = selectedDocuments\.find/)
assert.match(page, /acceptedDocuments \}/)
assert.match(page, /checked=\{acceptedDocuments\[activeDocumentKey\] === true\}/)
assert.match(page, /groupComplete/)

assert.match(edge, /const acceptedDocuments = snapshot\(body\.acceptedDocuments\)/)
assert.match(edge, /const missingAcceptance = selectedDocuments\.find/)
assert.match(edge, /Review and accept the \$\{missingAcceptance\} document before submitting\./)

console.log('listing seller signing phase 4 checks passed.')
