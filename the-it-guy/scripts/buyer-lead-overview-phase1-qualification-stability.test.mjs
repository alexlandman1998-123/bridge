import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(pageSource, /const buyerQualificationLeadKeyRef = useRef\(''\)/, 'qualification drafts must be scoped to a lead identity')
assert.match(pageSource, /const leadChanged = buyerQualificationLeadKeyRef\.current !== nextLeadKey/, 'lead changes must be distinguished from background hydration')
assert.match(pageSource, /if \(!buyerQualificationEditing\) \{\s*setBuyerQualificationForm\(buildBuyerQualificationFormFromLead\(selectedLead\)\)/, 'background hydration must not overwrite an active qualification draft')
assert.doesNotMatch(
  pageSource,
  /setBuyerQualificationForm\(buildBuyerQualificationFormFromLead\(selectedLead\)\)\s*setBuyerQualificationEditing\(false\)\s*\}, \[selectedLead, selectedLeadContact, selectedLeadLinkedListing\]\)/,
  'the general lead hydration effect must not close the qualification editor',
)
assert.match(pageSource, /data-testid="buyer-qualification-edit"/, 'qualification edit trigger contract is missing')
assert.match(pageSource, /data-testid="buyer-qualification-editor"/, 'qualification editor contract is missing')
assert.match(pageSource, /aria-controls="buyer-qualification-editor"/, 'qualification trigger must reference its editor')

console.log('buyer lead overview Phase 1 qualification stability contracts passed')
