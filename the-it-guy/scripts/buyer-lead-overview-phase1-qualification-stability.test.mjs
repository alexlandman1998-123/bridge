import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(pageSource, /const buyerQualificationLeadKeyRef = useRef\(''\)/, 'qualification drafts must be scoped to a lead identity')
assert.match(pageSource, /const leadChanged = buyerQualificationLeadKeyRef\.current !== nextLeadKey/, 'lead changes must be distinguished from background hydration')
assert.match(pageSource, /if \(!buyerQualificationEditing\) \{\s*const nextForm = buildBuyerQualificationFormFromLead\(selectedLead\)\s*buyerQualificationBaselineRef\.current = nextForm\s*setBuyerQualificationForm\(nextForm\)/, 'background hydration must not overwrite an active qualification draft')
assert.doesNotMatch(
  pageSource,
  /setBuyerQualificationForm\(buildBuyerQualificationFormFromLead\(selectedLead\)\)\s*setBuyerQualificationEditing\(false\)\s*\}, \[selectedLead, selectedLeadContact, selectedLeadLinkedListing\]\)/,
  'the general lead hydration effect must not close the qualification editor',
)
assert.match(pageSource, /data-testid="buyer-qualification-edit"/, 'qualification edit trigger contract is missing')
assert.match(pageSource, /data-testid="buyer-qualification-editor"/, 'qualification editor contract is missing')
assert.match(pageSource, /aria-controls="buyer-qualification-editor"/, 'qualification trigger must reference its editor')
assert.match(pageSource, /const canUseLeadFieldFallbacks = includeLeadFieldFallbacks/, 'saved API qualification fields should remain available when notes contain only a partial answer block')
assert.match(pageSource, /areaInterest: normalizeText\(parsed\.areaInterest\) \|\| \(canUseLeadFieldFallbacks \? normalizeText\(lead\?\.areaInterest \|\| lead\?\.area_interest\) : ''\)/, 'preferred area should fall back to the saved lead API field')
assert.match(pageSource, /<AreaAutocomplete\s+label="Which area should we focus on\?"[\s\S]*?value=\{buyerQualificationForm\.areaInterest\}[\s\S]*?onChange=\{\(value\) => updateBuyerQualificationField\('areaInterest', value\)\}/, 'buyer qualification area should use the Arch9 area directory API')

console.log('buyer lead overview Phase 1 qualification stability contracts passed')
