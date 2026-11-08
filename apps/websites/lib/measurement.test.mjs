import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readWebsiteMeasurement,saveWebsiteMeasurement,websiteTrackingAllowed,WEBSITE_SESSION_MS,isAutomatedWebsiteTraffic,normaliseMeasurement} from './measurement.ts'
function browser(href='https://agency.example/properties?utm_source=email&utm_campaign=launch&arch9_attribution=01234567890123456789012345678901') {
 const data=new Map(),self={}
 return {location:new URL(href),self,top:self,sessionStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)}}
}
test('campaign context survives navigation and sessions restart after 30 minutes',()=>{
 const b=browser();const first=readWebsiteMeasurement(b,{},1000);assert.equal(first.firstTouch.campaign,'launch');assert.equal(first.visitRecorded,false)
 first.visitRecorded=true;saveWebsiteMeasurement(b,first);b.location=new URL('https://agency.example/properties/one')
 const next=readWebsiteMeasurement(b,{},2000);assert.equal(next.sessionId,first.sessionId);assert.equal(next.lastTouch.token,first.lastTouch.token);assert.equal(next.visitRecorded,true)
 const later=readWebsiteMeasurement(b,{},2000+WEBSITE_SESSION_MS);assert.notEqual(later.sessionId,first.sessionId);assert.equal(later.visitRecorded,false);assert.equal(later.firstTouch.campaign,'launch')
})
test('internal previews stay excluded after query removal, without disabling another browser',()=>{
 const b=browser('https://agency.example/?arch9_preview=1');assert.equal(websiteTrackingAllowed(b,{}),false);b.location=new URL('https://agency.example/properties');assert.equal(websiteTrackingAllowed(b,{}),false);assert.equal(websiteTrackingAllowed(browser(),{}),true)
})
test('DNT, frames, automation and denied storage are handled safely',()=>{
 const b=browser();assert.equal(readWebsiteMeasurement(b,{doNotTrack:'1'}),null);assert.equal(readWebsiteMeasurement(b,{webdriver:true}),null)
 b.top={};assert.equal(readWebsiteMeasurement(b,{}),null);b.top=b.self
 b.sessionStorage={getItem(){throw Error('Denied')},setItem(){throw Error('Denied')}}
 const result=readWebsiteMeasurement(b,{},1000);assert.ok(result.sessionId);assert.equal(readWebsiteMeasurement(b,{},2000).sessionId,result.sessionId)
})
test('classification is conservative and server context excludes arbitrary fields',()=>{
 assert.equal(isAutomatedWebsiteTraffic('Googlebot/2.1'),true);assert.equal(isAutomatedWebsiteTraffic('Mozilla/5.0','prefetch'),true);assert.equal(isAutomatedWebsiteTraffic('Mozilla/5.0'),false)
 const safe=normaliseMeasurement({sessionId:'valid-session-id',organisationId:'foreign',email:'private@example.test',lastTouch:{campaign:'launch',token:'bad',email:'private@example.test'}})
 assert.equal(safe.sessionId,'valid-session-id');assert.equal(safe.lastTouch.campaign,'launch');assert.equal(safe.lastTouch.token,undefined);assert.ok(!JSON.stringify(safe).includes('private@example'))
})
