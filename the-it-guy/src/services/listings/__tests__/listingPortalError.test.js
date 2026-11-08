import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeListingPortalError, listingPortalFailureMessage, listingAdvertReceiptForEditor } from '../listingChannelUpdateState.js'
import { deriveListingPublicationStates } from '../listingPublicationState.js'

test('immediate actions and background jobs read the same detailed response envelopes', () => {
  assert.equal(listingPortalFailureMessage({ message: 'Request failed', report: { error: { message: 'Assigned agent is not connected to this agency.' } } }), 'Assigned agent is not connected to this agency.')
  assert.match(listingPortalFailureMessage({ report: { preview: { technicalBlockers: ['missing_agent_mapping'] } } }), /Add agent mapping/)
  assert.match(listingPortalFailureMessage({ report: { checks: [{ blockers: [{ code: 'missing_branch_guid' }] }] } }), /Add branch guid/)
  assert.equal(listingPortalFailureMessage({ error: { code: 'unknown', token: 'must-not-display' } }, 'Check requirements.'), 'Check requirements.')
  assert.equal(listingPortalFailureMessage({ report: { preview: { dataBlockers: 'not an array' } } }, 'Check requirements.'), 'Check requirements.')
  assert.equal(listingPortalFailureMessage({ preview: { imageByteLoad: { message: {}, results: 'invalid' } } }, 'Check requirements.'), 'Check requirements.')
  assert.match(listingPortalFailureMessage({ preview: { imageByteLoad: { results: [null, { status: 'FAILED', index: 2, message: {} }] } } }), /Photo 3.*Review this photo/)
})

test('SOAP feature rejection has a short explanation without exposing the stack trace', () => {
  const error = `<soap:Text>System.InvalidOperationException: Instance validation error: 'Jacuzzi' is not a valid value for AttributeType. at Microsoft.Xml.Serialization.GeneratedAssembly</soap:Text>`
  assert.match(summarizeListingPortalError(error), /feature code “Jacuzzi”/)
  assert.doesNotMatch(summarizeListingPortalError(error), /soap|Microsoft|System\./)
  assert.match(summarizeListingPortalError(error), /latest saved listing/)
})

test('useful field errors stay readable and long errors stay bounded', () => {
  const error = 'Property24 rejected this request: Agent does not belong to the agency.'
  assert.equal(summarizeListingPortalError(error), error)
  assert.ok(summarizeListingPortalError('x'.repeat(1000)).length <= 240)
  assert.equal(summarizeListingPortalError(''), '')
})

test('failed submission retains its timestamp and a subsequent acceptance clears the failure', () => {
  const failure = { activity_type: 'listing_channel_publication_failed', created_at: '2026-10-01T08:00:00Z', metadata: { channel: 'Private Property', error: 'Rejected feature' } }
  const state = deriveListingPublicationStates([failure]).private_property
  assert.equal(state.stage, 'failed')
  assert.equal(state.failedAt, failure.created_at)
  const acceptance = { activity_type: 'listing_channel_publication_accepted', created_at: '2026-10-01T08:05:00Z', metadata: { channel: 'Private Property' } }
  const recovered = deriveListingPublicationStates([failure, acceptance]).private_property
  assert.equal(recovered.stage, 'accepted')
  assert.equal(recovered.failedAt, '')
})


test('Property24 field validation survives a generic HTTP error and a summarized response', () => {
 const message = listingPortalFailureMessage({ message: 'Request failed', report: { error: {
  message: 'Property24 POST /listing/v55/save failed with 422.',
  response: { type: 'object', sample: { Message: 'Validation failed', ModelState: {
   'listing.price': ['Price must be greater than zero.'], 'listing.agentId': ['The agent must belong to this agency.'], password: ['hidden-secret'],
  } } },
 } } })
 assert.match(message, /listing.price: Price must be greater than zero/)
 assert.match(message, /listing.agentId: The agent must belong to this agency/)
 assert.match(message, /Review these fields.*save the listing/)
 assert.doesNotMatch(message, /failed with 422|hidden-secret|Validation failed/)
})
test('Private Property SOAP business faults stay specific and omit credentials and stack frames', () => {
 const message=listingPortalFailureMessage({report:{apiResponse:{error:{
  message:'System.Web.Services.Protocols.SoapException: Suburb ID 123 is invalid for this branch. at Portal.Import.Listing()',
  faultString:'System.Web.Services.Protocols.SoapException: Suburb ID 123 is invalid for this branch. at Portal.Import.Listing()',
 }}}})
 assert.match(message,/Suburb ID 123 is invalid for this branch/)
 assert.doesNotMatch(message,/System\.|Portal.Import|SoapException/)
 const safe=summarizeListingPortalError('Invalid branch. &lt;Token&gt;encoded-secret&lt;/Token&gt; <Password>xml-secret</Password> access_token=query-secret Bearer header-secret')
 assert.match(safe,/Invalid branch/)
 assert.doesNotMatch(safe,/encoded-secret|xml-secret|query-secret|header-secret/)
})
test('direct validation arrays keep their field names and implementation failures give a support action', () => {
 assert.match(listingPortalFailureMessage({errors:[{field:'description',message:'Description must have at least 50 characters.'}]}),/description: Description must have at least 50 characters/)
 assert.match(listingPortalFailureMessage({error:{message:'permission denied for table private_listings'}}),/Contact support.*request reference/)
})

test('Private Property application rejection text survives a successful HTTP response envelope', () => {
 const reason=listingPortalFailureMessage({report:{apiResponse:{error:{message:'Private Property did not acknowledge UpdateListing. Review its response before retrying.',responseSummary:{resultText:'Failed: agent ID 17 does not belong to this branch.'}}}}})
 assert.match(reason,/agent ID 17 does not belong to this branch/)
})

test('readiness field blockers outrank a generic top-level summary', () => {
 const reason=listingPortalFailureMessage({message:'Private Property cannot submit this listing.',readiness:{preview:{dataBlockers:['missing_description']},blockers:['missing_agent_mapping']}})
 assert.match(reason,/Add description/)
 assert.match(reason,/Add agent mapping/)
 assert.doesNotMatch(reason,/cannot submit this listing/)
})

test('reload restores unresolved advert failures without presenting old acceptance as a new update', () => {
 const receipt={status:'needs_attention',jobId:'job',message:'Correct the suburb.',retryable:true}
 assert.deepEqual(listingAdvertReceiptForEditor(null,receipt),{...receipt,previous:true})
 assert.equal(listingAdvertReceiptForEditor(null,{...receipt,status:'submitted'}),null)
 const blocked={status:'needs_attention',notSent:true,message:'Save the required price.'}
 assert.equal(listingAdvertReceiptForEditor(blocked,receipt),blocked)
 assert.equal(listingAdvertReceiptForEditor({status:'publishing'},receipt),receipt)
})
