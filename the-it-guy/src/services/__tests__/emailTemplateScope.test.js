import {beforeEach,it,expect,vi} from 'vitest'
import {saveEmailTemplate} from '../emailCampaignService'
import {supabase} from '../../lib/supabaseClient'
vi.mock('../../lib/supabaseClient',()=>({supabase:{from:vi.fn()}}))
beforeEach(()=>vi.clearAllMocks())
it('cannot update or move a template from another organisation through an ID-only request',async()=>{
 const foreign={id:'template',organisation_id:'foreign',name:'Foreign template'},filters=[];let patch
 const q={update:vi.fn(value=>{patch=value;return q}),eq:vi.fn((key,value)=>{filters.push([key,value]);return q}),select:vi.fn(()=>q),single:vi.fn(async()=>filters.every(([key,value])=>foreign[key]===value)?{data:{...foreign,...patch}}:{error:Error('No accessible template')})};supabase.from.mockReturnValue(q)
 await expect(saveEmailTemplate({organisationId:'active',userId:'user',template:{id:'template',name:'New name',html:'<p>Body</p>'}})).rejects.toThrow('No accessible template');expect(filters).toEqual([['organisation_id','active'],['id','template']]);expect(foreign.organisation_id).toBe('foreign')
})
it('requires an organisation and saves new designs in the chosen organisation',async()=>{
 await expect(saveEmailTemplate({organisationId:'',template:{name:'Draft',html:'<p>Body</p>'}})).rejects.toThrow('organisation');expect(supabase.from).not.toHaveBeenCalled();const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),single:vi.fn(async()=>({data:{id:'new'}}))};supabase.from.mockReturnValue(q);const design={version:1,blocks:[]};await saveEmailTemplate({organisationId:'active',userId:'user',template:{name:' Draft ',html:'<p>Body</p>',designJson:design}});expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({organisation_id:'active',name:'Draft',design_json:design,created_by:'user'}))
})
