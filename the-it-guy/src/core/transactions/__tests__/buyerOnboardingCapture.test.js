import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hydrateBuyerOnboardingCapture, buyerCaptureProfile } from '../buyerOnboardingCapture.js'
test('exact buyer hydration removes a previous buyer but preserves commercial and seller state',()=>{
 const source={first_name:'Wrong',identity_number:'wrong-id',purchasers:[{first_name:'Wrong'}],co_email:'wrong@example.test',purchase_price:123,finance:{type:'bond'},__bridge_transaction_parties:{seller:{name:'Seller'}}}
 const result=hydrateBuyerOnboardingCapture(source,{profile:{first_name:'Right',identity_number:'right-id'},participantId:'p2',buyerId:'b2',revision:{formUpdatedAt:'stamp',profileVersion:2}})
 assert.equal(result.first_name,'Right');assert.equal(result.identity_number,'right-id');assert.equal(result.co_email,undefined);assert.equal(result.purchasers,undefined)
 assert.equal(result.purchase_price,123);assert.deepEqual(result.__bridge_transaction_parties,source.__bridge_transaction_parties)
 assert.equal(result.buyerParticipantId,'p2');assert.equal(result.buyerPartyId,'b2');assert.equal(result.__bridge_buyer_capture_revision.profileVersion,2)
})
test('manual editor reads structured answers and lets its current flat edits take precedence',()=>{
 assert.equal(buyerCaptureProfile({purchasers:[{identity_number:'nested',street_address:'Street'}],identity_number:'edited'}).identity_number,'edited')
 assert.equal(buyerCaptureProfile({purchasers:[{street_address:'Street'}]}).residential_address,'Street')
 assert.throws(()=>hydrateBuyerOnboardingCapture({},{}),/could not be confirmed/)
})
