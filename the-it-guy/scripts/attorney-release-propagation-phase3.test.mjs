import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyPropagationMatrix, resolveAttorneyUpdateDestinations } from '../src/services/attorneyReleasePropagation.js'

assert.deepEqual(resolveAttorneyUpdateDestinations({ visibility: 'internal' }), ['attorney_matter_workspace', 'attorney_operations'])
assert.deepEqual(resolveAttorneyUpdateDestinations({ visibility: 'professional_shared' }), ['attorney_matter_workspace', 'transaction_workspace', 'attorney_operations', 'agent_transaction_view'])
assert.deepEqual(resolveAttorneyUpdateDestinations({ visibility: 'client_visible', clientRecipients: ['buyer'] }), ['attorney_matter_workspace', 'transaction_workspace', 'attorney_operations', 'agent_transaction_view', 'buyer_portal'])
assert.deepEqual(resolveAttorneyUpdateDestinations({ visibility: 'client_visible', clientRecipients: ['seller'] }), ['attorney_matter_workspace', 'transaction_workspace', 'attorney_operations', 'agent_transaction_view', 'seller_portal'])
assert.equal(resolveAttorneyUpdateDestinations({ visibility: 'client_visible' }).includes('buyer_portal'), false)
assert.equal(resolveAttorneyUpdateDestinations({ visibility: 'client_visible' }).includes('seller_portal'), false)
assert.equal(buildAttorneyPropagationMatrix().length, 5)

const attorneyService = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx', import.meta.url), 'utf8')
assert.match(attorneyService, /Select at least one client recipient before publishing this update\./)
assert.match(attorneyService, /publishAttorneySharedProgress/)
assert.match(attorneyService, /AttorneyLaneClientVisibleUpdatePublished/)
assert.match(attorneyService, /AttorneyLaneSharedUpdateAdded/)
assert.match(attorneyService, /clientRecipients: payload\.client_recipients/)
assert.match(panel, /Select at least one client recipient\./)
assert.match(panel, /noteDraft\.visibility === 'client_visible'/)

console.log('Attorney release Phase 3 destination, visibility, and recipient-isolation contract passed.')
