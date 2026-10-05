import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createArch9WebsiteClient, createExampleListingCache, verifyArch9Webhook } from '../../docs/examples/external-website-client.mjs'
import { webhookSignature } from '../services/externalWebsiteDelivery.js'

test('handover client fetches scoped listings/property and sends the same enquiry key on retry',async()=>{
  const calls=[]
  const client=createArch9WebsiteClient({baseUrl:'https://arch9.example.test',credential:'fixture-backend-only',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data:{id:'property',version:'10'},accepted:true,leadId:'lead'})}}})
  await client.listings({transactionType:'sale',limit:'10'});await client.property('property');await client.enquiry({idempotencyKey:'example-submission-key-001'});await client.enquiry({idempotencyKey:'example-submission-key-001'})
  assert.match(calls[0].url,/transactionType=sale/);assert.equal(calls[0].options.headers.Authorization,'Bearer fixture-backend-only');assert.equal(calls[2].options.body,calls[3].options.body)
})
test('handover verifies raw body and protects newer cache data against duplicates and out-of-order withdrawals',async()=>{
  const timestamp=String(Math.floor(Date.now()/1000)),rawBody='{"id":"fixture-event"}',secret='fixture-signing-secret'
  assert.equal(verifyArch9Webhook({secret,timestamp,rawBody,signature:webhookSignature(secret,timestamp,rawBody)}),true)
  assert.equal(verifyArch9Webhook({secret,timestamp,rawBody:rawBody+' ',signature:webhookSignature(secret,timestamp,rawBody)}),false)
  let current={id:'listing',version:'20'}
  const event=(type,version)=>({id:`event-${version}`,type,version,listingId:'listing',connectionId:'connection',schemaVersion:1})
  const cache=createExampleListingCache({property:async()=>current,changes:async()=>({data:[event('listing.updated','10'),event('listing.withdrawn','15')],nextCursor:'20',hasMore:false})},'connection')
  assert.equal(await cache.reconcile(),'20');assert.equal(cache.properties.get('listing').version,'20')
  await cache.applyEvent(event('listing.withdrawn','15'));assert.equal(cache.properties.has('listing'),true)
  current=null;await cache.applyEvent(event('listing.withdrawn','21'));assert.equal(cache.properties.has('listing'),false);assert.equal(cache.versions.get('listing'),'21')
  await cache.applyEvent(event('listing.updated','10'));assert.equal(cache.properties.has('listing'),false)
})
