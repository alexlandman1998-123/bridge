import {beforeEach,it,expect,vi} from 'vitest'
import {saveEmailAudience} from '../emailCampaignService'
import {saveMarketingAudience} from '../marketingAudienceService'
import {supabase} from '../../lib/supabaseClient'
vi.mock('../../lib/supabaseClient',()=>({supabase:{rpc:vi.fn(),from:vi.fn()}}))
vi.mock('../marketingAudienceService',()=>({saveMarketingAudience:vi.fn(),archiveMarketingAudience:vi.fn()}))
beforeEach(()=>vi.clearAllMocks())
const input={organisationId:'org',userId:'user',audience:{name:' Buyers ',filterJson:{role_type:'buyer'}}}
it('uses the shared catalogue when its read-only capability probe confirms it',async()=>{
 supabase.rpc.mockResolvedValue({data:true});saveMarketingAudience.mockResolvedValue({id:'shared'})
 await expect(saveEmailAudience(input)).resolves.toEqual({id:'shared'})
 expect(saveMarketingAudience).toHaveBeenCalledWith('org',expect.objectContaining({definition:{emailFilter:{role_type:'buyer'}},visibility:'personal'}))
 expect(supabase.from).not.toHaveBeenCalled()
})
it('uses the owned legacy table when the shared capability is absent',async()=>{
 supabase.rpc.mockResolvedValue({data:false});const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),single:vi.fn(async()=>({data:{id:'legacy'}}))};supabase.from.mockReturnValue(q)
 await expect(saveEmailAudience(input)).resolves.toEqual({id:'legacy'})
 expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({organisation_id:'org',created_by:'user',name:'Buyers',filter_json:{role_type:'buyer'}}))
 expect(saveMarketingAudience).not.toHaveBeenCalled()
})
it('does not fall back after an uncertain shared save',async()=>{
 supabase.rpc.mockResolvedValue({data:true});saveMarketingAudience.mockRejectedValueOnce(Error('Response lost'))
 await expect(saveEmailAudience(input)).rejects.toThrow('Response lost');expect(supabase.from).not.toHaveBeenCalled()
})
it('does not guess the catalogue when its capability check fails',async()=>{
 supabase.rpc.mockResolvedValue({error:{code:'42501',message:'Denied'}})
 await expect(saveEmailAudience(input)).rejects.toMatchObject({code:'42501'});expect(supabase.from).not.toHaveBeenCalled()
})
