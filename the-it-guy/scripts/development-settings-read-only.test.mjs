import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/lib/api.js',import.meta.url),'utf8')
const start=source.indexOf('async function ensureDevelopmentSettings('),end=source.indexOf('\nexport async function ',start)
const body=source.slice(start,end)
const defaults={snag_reporting_enabled:false,alteration_requests_enabled:false,client_portal_enabled:true}
const make=new Function('DEFAULT_DEVELOPMENT_SETTINGS','fetchDevelopmentFeatureFlags','normalizeDevelopmentSettingsRow','isMissingSchemaError','isMissingColumnError','isPermissionDeniedError',`${body};return ensureDevelopmentSettings`)
const ensure=make(defaults,async()=>({snag_tracking_enabled:true,alterations_enabled:true}),x=>x,()=>false,()=>false,()=>false)
for(const row of [null,{snag_reporting_enabled:false,alteration_requests_enabled:false}]){
 const writes=[]
 const client={from:()=>({select(){return this},eq(){return this},limit(){return this},maybeSingle:async()=>({data:row,error:null}),insert(){writes.push('insert');throw Error('Unexpected settings write')},update(){writes.push('update');throw Error('Unexpected settings write')}})}
 const result=await ensure(client,'controlled-development')
 assert.equal(result.snag_reporting_enabled,true)
 assert.equal(result.alteration_requests_enabled,true)
 assert.deepEqual(writes,[],'Reading defaults or merged feature flags must not write settings')
}
console.log('PASS development settings reads preserve defaults and feature flags without inserts or updates.')
