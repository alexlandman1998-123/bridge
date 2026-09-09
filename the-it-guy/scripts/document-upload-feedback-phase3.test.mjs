import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const documentsSource = readFileSync(new URL('../src/pages/Documents.jsx', import.meta.url), 'utf8')
const listingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

assert.match(documentsSource, /const \[uploadFailures, setUploadFailures\]/, 'document workspace should retain failed file state')
assert.match(documentsSource, /describeDocumentUploadFailure/, 'document workspace should classify upload failures for the user')
assert.match(documentsSource, /Retry \{uploadFailures\[item\.key\]\.file\.name\}/, 'document workspace should retry only the failed file')

assert.match(listingsSource, /describeQuickAddDocumentUploadFailure/, 'Quick Add should classify per-file upload failures')
assert.match(listingsSource, /file: documentUpload\.file/, 'Quick Add should retain a failed file for retry')
assert.match(listingsSource, /async function retryQuickAddDocumentUpload/, 'Quick Add should provide a targeted retry handler')
assert.match(listingsSource, /failure\.message \|\| 'The file was not attached\.'/, 'Quick Add should display the failure reason per file')
assert.match(listingsSource, /\{isRetrying \? 'Retrying…' : 'Retry'\}/, 'Quick Add should show retry progress')

console.log('document upload feedback phase 3 tests passed')
