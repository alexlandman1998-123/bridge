import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptCampaignPublicResponse, campaignResponseData, campaignResponseToken, resolveCampaignPublicResponse, CAMPAIGN_EMAIL_CONSENT_VERSION } from '../services/campaignPublicResponse.js'

const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const token=id(1), link={id:id(2),organisation_id:id(3),slug:'agency',enabled_intents:['buy','sell'],privacy_policy_version:'privacy-v1'}
const responseLink={id:id(4),organisation_id:link.organisation_id,campaign_id:id(5),campaign_revision:1,intake_link_id:link.id,purpose:'valuation',assigned_user_id:id(6),disabled_at:null}
const normalized={intent:'sell',idempotencyKey:'response-request-0001',contactName:'Avery Seller',contactEmail:'avery@example.test',contactPhone:'',privacyConsent:true,privacyPolicyVersion:'privacy-v1',budgetMin:null,budgetMax:null,seller:{suburb:'Brooklyn',propertyAddress:'10 Example Road',propertyType:'House',estimatedValue:2500000}}
function client(patch={}) {
  const calls=[]
  const rows={marketing_campaign_response_links:{data:responseLink},marketing_campaigns:{data:{id:responseLink.campaign_id}},organisation_users:{data:{user_id:responseLink.assigned_user_id}},...patch}
  return {calls,from(table){const q={};for(const method of ['select','eq','is','in','limit'])q[method]=(...args)=>{calls.push([table,method,...args]);return q};q.maybeSingle=async()=>rows[table];return q},async rpc(name,args){calls.push(['rpc',name,args]);return rows.rpc || {data:{accepted:true,duplicate:false,followUpPrepared:true,marketingConsentRecorded:args.p_data.emailMarketingConsent}}}}
}
test('campaign tokens are explicit, bounded and never inferred from a campaign name/code',()=>{
  assert.equal(campaignResponseToken({context:{campaignResponseToken:token}}),token)
  assert.equal(campaignResponseToken({campaignCode:token}), '')
  assert.throws(()=>campaignResponseToken({campaignResponseToken:'guess'}),/unavailable/)
  assert.equal(campaignResponseToken({},new URLSearchParams({campaignResponse:token})),token)
})
test('public resolution validates exact agency/link, live campaign and active responsible member without exposing internal ids',async()=>{
  const db=client(), value=await resolveCampaignPublicResponse(db,token,link)
  assert.equal(value.public.intent,'sell')
  assert.equal(value.public.marketingConsentOptional,true)
  assert(!JSON.stringify(value.public).includes(responseLink.campaign_id))
  assert(db.calls.some(call=>JSON.stringify(call)===JSON.stringify(['marketing_campaign_response_links','eq','organisation_id',link.organisation_id])))
  for(const patch of [{marketing_campaign_response_links:{data:{...responseLink,organisation_id:id(90)}}},{marketing_campaign_response_links:{data:null}},{marketing_campaigns:{data:null}},{organisation_users:{data:null}}]) await assert.rejects(resolveCampaignPublicResponse(client(patch),token,link),/unavailable/)
})
test('normalisation preserves only response fields and treats enquiry permission separately from optional marketing',()=>{
  const data=campaignResponseData(normalized,{message:'Please call',campaignId:id(80),organisationId:id(81),assignedAgentId:id(82),emailMarketingConsent:'true'},'privacy-v1')
  assert.equal(data.privacyConsent,true)
  assert.equal(data.emailMarketingConsent,false)
  assert.equal(data.marketingConsentVersion,null)
  assert(!JSON.stringify(data).includes(id(80)))
  assert(!JSON.stringify(data).includes(id(81)))
  assert.equal(data.propertyAddress,'10 Example Road')
  assert.throws(()=>campaignResponseData(normalized,{emailMarketingConsent:true},'privacy-v1'),/separate optional/)
  assert.throws(()=>campaignResponseData({...normalized,contactEmail:''},{emailMarketingConsent:true,marketingConsentVersion:CAMPAIGN_EMAIL_CONSENT_VERSION},'privacy-v1'),/email address/)
})
test('acceptance uses the atomic RPC and exposes no CRM identifiers or send claims',async()=>{
  const db=client(), result=await acceptCampaignPublicResponse(db,{token,link,normalized,payload:{emailMarketingConsent:true,marketingConsentVersion:CAMPAIGN_EMAIL_CONSENT_VERSION},ipHash:'a'.repeat(64)})
  assert.deepEqual(result,{accepted:true,duplicate:false,lead:{followUpPrepared:true},marketingConsentRecorded:true})
  const call=db.calls.find(call=>call[0]==='rpc')
  assert.equal(call[1],'marketing_campaign_accept_response')
  assert.equal(call[2].p_slug,'agency')
  assert.equal(call[2].p_data.emailMarketingConsent,true)
  assert.equal(call[2].p_ip_hash,'a'.repeat(64))
  assert(!db.calls.some(call=>['contacts','leads','tasks','notification_events','email_marketing_contacts'].includes(call[0])))
  await assert.rejects(acceptCampaignPublicResponse(client(),{token,link,normalized:{...normalized,privacyPolicyVersion:'old'},payload:{}}),/privacy information changed/)
})
test('uncertain, changed, revoked and limited responses remain recoverable and never become success',async()=>{
  for(const [rpc,status] of [[{error:{code:'23505'}},409],[{error:{code:'42501'}},404],[{error:{message:'Offline'}},503],[{data:{accepted:true}},503],[{error:{message:'Too many intake submissions. Please try again later.'}},429]]) {
    await assert.rejects(acceptCampaignPublicResponse(client({rpc}),{token,link,normalized,payload:{}}),error=>error.status===status)
  }
})
