import assert from 'node:assert/strict'
import test from 'node:test'
import { recordProperty24ListingSync } from '../services/property24ListingSyncService.js'
import { applyProperty24ListingPublish } from '../property24/publishService.js'
const collision={code:'23505',message:'duplicate key value violates unique constraint "property24_listing_syncs_number_environment_uidx"'}
const tables=[]
const client={rpc:async()=>({error:null}),from(table){tables.push(table);return {upsert(){return this},select(){return this},single:async()=>({data:null,error:collision})}}}
test('does not reassign a portal reference belonging to another listing',async()=>{
 tables.length=0
 await assert.rejects(recordProperty24ListingSync({client,listingId:'unit-010',agencyId:40067,listingNumber:117790383,environment:'production'}),e=>e.code==='property24_reference_collision'&&e.listingNumber===117790383)
 assert.deepEqual(tables,['property24_listing_syncs'])
})
test('retains the accepted sales receipt as uncertain when its reference collides',async()=>{
 let saves=0
 const report=await applyProperty24ListingPublish({supabase:client,property24:{saveListing:async()=>{saves++;return {status:200,data:{listingNumber:117790383,isOnPortal:true,reasons:[]}}},checkListingOnPortal:async()=>({status:200,data:true})},config:{listingId:'unit-010',agencyId:40067,environment:'production'},preview:{payload:{},summary:{}}})
 assert.equal(report.status,'UNCERTAIN');assert.equal(report.error.code,'property24_reference_collision');assert.equal(report.property24Response.data.listingNumber,117790383);assert.equal(saves,1)
})
