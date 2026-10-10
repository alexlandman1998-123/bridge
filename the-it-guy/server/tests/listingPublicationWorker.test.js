import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatchPublicationJob, publicationJobOutcome, runListingPublicationJobs } from '../services/listingPublicationJobs.js'
const jobs=['property24','private_property','agency_website'].map((channel,index)=>({id:`job-${index}`,listing_id:'listing',requested_by:'actor',claim_id:`claim-${index}`,channel,created_at:new Date().toISOString()}))
test('worker commits independent receipts, retains uncertain responses, and does not retry provider calls',async()=>{
 const updates=[],activities=[],calls=[]
 const client={rpc:async(name)=>({data:name==='claim_listing_publications'?jobs:true}),from(table){
  const query={update(value){updates.push(value);return query},eq(){return query},select(){return query},single:async()=>({data:{id:'job'}}),insert:async value=>{activities.push(value);return {data:{}}}};return query
 }}
 const result=await runListingPublicationJobs({client,dispatch:async job=>{calls.push(job.id);if(job.channel==='property24')throw new Error('Connection lost');return job.channel==='private_property'?{status:422,body:{message:'Fix address'}}:{status:200,body:{publication:{status:'published'}}}}})
 assert.deepEqual(result.map(row=>row.state),['uncertain','failed','accepted']);assert.equal(calls.length,3)
 assert.deepEqual(updates.map(row=>row.state),['uncertain','failed','accepted']);assert.equal(activities.length,3)
 assert.ok(activities.every(row=>Number.isFinite(row.metadata.processingMs)))
})
test('revoked claims never dispatch',async()=>{
 const client={rpc:async name=>({data:name==='claim_listing_publications'?jobs:false})}
 const result=await runListingPublicationJobs({client,dispatch:()=>{throw new Error('must not call')}})
 assert.ok(result.every(row=>row.state==='cancelled'))
})
test('sales, developer and rental jobs use existing authorized provider APIs with the stored actor',async()=>{
 for(const listing_category of ['private_sale','development_unit','rental']) {
  let invocation
  const actor={data:{user:{id:'actor',email:'agent@example.test'}}}
  const client={auth:{admin:{getUserById:async id=>{assert.equal(id,'actor');return actor}}},from(){return {select(){return this},eq(){return this},single:async()=>({data:{listing_category}})}}}
  await dispatchPublicationJob(jobs[0],{client,env:{},property24:async value=>{invocation=value;return {status:200,body:{}}}})
  assert.match(invocation.url,listing_category==='rental'?/\/rentals\//:/\/listings\//)
  assert.equal((await invocation.dependencies.createSupabase().auth.getUser()).data.user.id,'actor')
  assert.equal(invocation.body.environment,'production');assert.ok(!JSON.stringify(jobs[0]).includes('access_token'))
 }
})
test('never mistakes a blocked response or server failure for accepted publication',()=>{
 assert.equal(publicationJobOutcome({status:200,body:{report:{status:'BLOCKED'}}}).state,'failed')
 assert.equal(publicationJobOutcome({status:200,body:{status:'UNCERTAIN'}}).state,'uncertain')
 assert.equal(publicationJobOutcome({status:503,body:{}}).state,'uncertain')
})
