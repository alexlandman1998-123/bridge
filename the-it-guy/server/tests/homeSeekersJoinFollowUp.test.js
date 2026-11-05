import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHomeSeekersJoinFollowUpResponse as followUp } from '../services/homeSeekersJoinFollowUpApi.js'
import { queueHomeSeekersJoinFollowUp } from '../services/homeSeekersJoinDelivery.js'
import { splitCalculatorDefaults } from '../../src/pages/homeSeekersSplitCalculatorModel.js'
const body={type:'call',name:'Sam Agent',email:'agent@example.test',mobile:'0821234567',sales:'10-19',model:'70/30',consent:true,source:'hero',calculator:{inputs:splitCalculatorDefaults,result:{difference:999999999}},idempotencyKey:'test-join-receipt-1234',pageUrl:'https://homeseeker.co.za/join'}
const env={WEBSITES_LEAD_FINGERPRINT_SECRET:'fingerprint-secret-'.repeat(4)}
const headers={host:'homeseeker.co.za'}
test('rejects invalid consent, origin, calculator and qualifier values before capture',async()=>{
 let calls=0
 for(const change of [{consent:false},{pageUrl:'https://evil.test/join'},{calculator:{inputs:{...splitCalculatorDefaults,sales:'bad'}}},{sales:'any'},{model:'unknown'}]) {
  assert.equal((await followUp({headers,env,body:{...body,...change},queue:async()=>{calls++}})).status,400)
 }
 assert.equal(calls,0)
})
test('uses the shared durable mail queue for breakdowns without a second provider key',async()=>{
 let request
 const result=await followUp({headers,body:{...body,type:'breakdown'},env,queue:async data=>{request=data;return {accepted:true,deliveryQueued:true}}})
 assert.equal(result.status,202)
 assert.equal(result.body.deliveryAccepted,false)
 assert.equal(result.body.deliveryQueued,true)
 assert.equal(request.contact.type,'breakdown')
 assert.match(request.fingerprint,/^[a-f0-9]{64}$/)
 assert.equal(request.key,body.idempotencyKey)
})
test('recomputes savings and retains source and answers in the durable message',async()=>{
 let captured
 const result=await followUp({headers,env,body,queue:async data=>{captured=data.contact;return {accepted:true,deliveryAccepted:true}}})
 assert.equal(result.status,200)
 assert.match(captured.subject,/Call requested: 10 sales, 70\/30, saves R147.?000 · hero/)
 assert.equal(captured.calculator.result.difference,147000)
 assert.ok(!captured.details.includes('999999999'))
 assert.match(captured.details,/not a confirmed calendar booking/)
 assert.equal(captured.email,body.email)
 assert.equal(captured.phone,body.mobile)
})
test('distinguishes delivery failures, rate limits and conflicting retries',async()=>{
 for(const [data,status] of [[{rateLimited:true},429],[{conflict:true},409],[{accepted:true,deliveryFailed:true},503]]) {
  assert.equal((await followUp({headers,env,body,queue:async()=>data})).status,status)
 }
 assert.equal((await followUp({headers,env,body,queue:async()=>{throw Error('offline')}})).status,503)
})
test('requires a server fingerprint secret and a real Calendly receipt shape',async()=>{
 assert.equal((await followUp({headers,env:{},body})).status,503)
 const invalid={...body,type:'booking',bookingUrl:'https://evil.test/booked'}
 assert.equal((await followUp({headers,env,body:invalid})).status,400)
 const booking={...invalid,bookingUrl:'https://api.calendly.com/scheduled_events/event/invitees/invitee'}
 let contact
 const result=await followUp({headers,env,body:booking,queue:async data=>{contact=data.contact;return {accepted:true,deliveryAccepted:true}}})
 assert.equal(result.status,200)
 assert.match(contact.subject,/^Call booked:/)
 assert.ok(contact.details.includes(booking.bookingUrl))
})
test('uses stable queue parameters on retries and recovers an uncertain immediate dispatch',async()=>{
 const calls=[];let count=0
 const client={rpc:async(name,params)=>{calls.push({name,params});return {data:++count===1?{accepted:true,deliveryQueued:true}:{accepted:true,deliveryAccepted:true}}},functions:{invoke:async()=>{throw Error('worker temporarily unavailable')}}}
 const result=await queueHomeSeekersJoinFollowUp({env,key:body.idempotencyKey,contact:{name:'Sam'},fingerprint:'f'.repeat(64),client})
 assert.equal(result.deliveryAccepted,true)
 assert.deepEqual(calls[0],calls[1])
})
test('does not invoke the worker after a rejected capture',async()=>{
 const client={rpc:async()=>({data:{rateLimited:true}}),functions:{invoke:async()=>{throw Error('must not invoke')}}}
 assert.deepEqual(await queueHomeSeekersJoinFollowUp({env,key:body.idempotencyKey,contact:{},fingerprint:'f'.repeat(64),client}),{rateLimited:true})
})
