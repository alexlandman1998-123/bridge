import { expect,it } from 'vitest'
import { checkDevelopmentCampaignSource } from '../../../../supabase/functions/_shared/developmentCampaignSource.js'
const context={source:'development_workspace',version:1,organisation_id:'org',development_id:'dev',event_id:'event',event_snapshot:{title:'Viewing',starts_at:'2030-11-20T10:00:00Z',location:'Sales centre',description:'Parking'}}
function database(overrides={}){const calls=[];return{calls,from(table){const row={developments:{id:'dev',organisation_id:'org',status:'active'},marketing_events:{id:'event',title:'Viewing',starts_at:'2030-11-20T10:00:00Z',location:'Sales centre',description:'Parking',status:'upcoming'},...overrides}[table];const q={select:()=>q,eq:(...args)=>{calls.push([table,...args]);return q},maybeSingle:async()=>({data:row,error:null})};return q}}}
it.each(['email','whatsapp'])('checks a prepared %s campaign against its real development event',async channel=>{
 const campaign={organisation_id:'org',...(channel==='email'?{content_json:{arch9_context:context}}:{parameter_values:{__arch9_context:context}})},db=database()
 expect((await checkDevelopmentCampaignSource({db,campaign,now:new Date('2026-11-09')})).ready).toBe(true)
 expect(db.calls).toContainEqual(['marketing_events','subject_type','development'])
 expect(db.calls).toContainEqual(['marketing_events','subject_id','dev'])
})
it.each([{status:'cancelled'},{title:'Changed'},{starts_at:'2030-11-21T10:00:00Z'},{description:'Changed arrival details'}])('blocks stale event information before dispatch: %j',async patch=>{
 const row={id:'event',title:'Viewing',starts_at:'2030-11-20T10:00:00Z',location:'Sales centre',description:'Parking',status:'upcoming',...patch}
 expect((await checkDevelopmentCampaignSource({db:database({marketing_events:row}),campaign:{organisation_id:'org',content_json:{arch9_context:context}},now:new Date('2026-11-09')})).ready).toBe(false)
})
it('leaves ordinary channel campaigns on their existing validation path',async()=>{
 const db=database();expect((await checkDevelopmentCampaignSource({db,campaign:{organisation_id:'org',content_json:{arch9_context:{development_id:'dev'}}}})).state).toBe('not_applicable');expect(db.calls).toHaveLength(0)
})
it('blocks unpublished or changed website links and retries temporary source outages',async()=>{
 const campaign={organisation_id:'org',content_json:{arch9_context:{...context,website_url:'https://app.arch9.co.za/development/madison'}}}
 expect(await checkDevelopmentCampaignSource({db:database({development_profiles:{marketing_content:{}}}),campaign})).toMatchObject({ready:false,retryable:false})
 expect(await checkDevelopmentCampaignSource({db:{from(){throw Error('network')}},campaign})).toMatchObject({ready:false,retryable:true,code:'development_source_unavailable'})
})
