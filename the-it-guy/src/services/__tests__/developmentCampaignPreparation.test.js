import { expect,it,vi } from 'vitest'
import { prepareDevelopmentCampaign,publicCampaignUrl } from '../developmentCampaignPreparation.js'
vi.mock('../../lib/supabaseClient',()=>({supabase:null}))
const dev='20000000-0000-4000-8000-000000000001',org='30000000-0000-4000-8000-000000000001'
const source=()=>({development:{id:dev,organisation_id:org,name:'Madison fixture'},profile:{description:'Saved copy',marketing_content:{listingOverview:{shortDescription:'Homes for buyers'},listingConfiguration:{publicVisibility:true,marketingStatus:'live',listingSlug:'madison-fixture'},mediaLibrary:{coverImageUrl:'https://images.example.test/cover.jpg'}}},events:[{id:'event',title:'Launch evening',status:'upcoming',starts_at:'2030-11-20T16:00:00Z',location:'Sales centre',description:'Parking available'}],whatsappContactIds:['contact'],whatsappTotal:1})
it('prepares a real development email with saved copy, a public image, a live CTA and a narrow audience',()=>{
 const draft=prepareDevelopmentCampaign(source(),null,Date.parse('2026-11-09'))
 expect(draft.context).toMatchObject({source:'development_workspace',development_id:dev,organisation_id:org})
 expect(draft.email.audienceFilter).toEqual({development_id:dev})
 expect(draft.email.contentJson.blocks).toEqual(expect.arrayContaining([expect.objectContaining({type:'image',src:'https://images.example.test/cover.jpg'}),expect.objectContaining({type:'text',text:'Homes for buyers'}),expect.objectContaining({type:'button',url:'https://app.arch9.co.za/development/madison-fixture'})]))
 expect(draft.whatsapp.contactIds).toEqual(['contact'])
})
it('adapts a development event directly without inventing a listing or a public RSVP link',()=>{
 const draft=prepareDevelopmentCampaign(source(),'event',Date.parse('2026-11-09'))
 expect(draft.context).toMatchObject({event_id:'event',event_snapshot:{title:'Launch evening',location:'Sales centre'}})
 expect(draft.email.subject).toBe('Launch evening')
 expect(draft.email.contentJson.blocks.some(block=>block.text?.includes('SAST'))).toBe(true)
 expect(draft.context.listing_id).toBeUndefined()
 expect(JSON.stringify(draft)).not.toContain('/rsvp/')
})
it('does not turn an unpublished website or a signed image into campaign links',()=>{
 const data=source();data.profile.marketing_content.listingConfiguration.publicVisibility=false;data.profile.marketing_content.mediaLibrary.coverImageUrl='https://storage.test/object/sign/private/photo.jpg?token=secret'
 const draft=prepareDevelopmentCampaign(data)
 expect(draft.email.contentJson.blocks.some(block=>block.type==='image'||block.type==='button')).toBe(false)
 expect(draft.context.website_url).toBe('')
 expect(draft.warnings).toHaveLength(2)
 expect(publicCampaignUrl('http://localhost:5173/development/test')).toBe('')
})
it('blocks missing, cancelled and started events instead of silently creating a generic campaign',()=>{
 expect(()=>prepareDevelopmentCampaign(source(),'missing')).toThrow('unavailable')
 const data=source();data.events[0].status='cancelled'
 expect(()=>prepareDevelopmentCampaign(data,'event')).toThrow('unavailable')
 expect(()=>prepareDevelopmentCampaign(source(),'event',Date.parse('2031-01-01'))).toThrow('already started')
})
