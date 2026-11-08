import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({writes:[],error:null,activityError:null}))
vi.mock('../../lib/supabaseClient.js',()=>({isSupabaseConfigured:true,supabase:{from(table){let filters={};const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q},in:()=>q,order:()=>q,update:patch=>{state.writes.push({table,patch,filters});return q},insert:async()=>({error:state.activityError}),single:async()=>({data:{developer_lead_id:id,developer_org_id:org,lead_owner:'developer',lead_status:'contacted'},error:state.error}),then:(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject)};return q}}}))
import {updateDeveloperLeadWorkspaceSetup}from'../developerLeadService.js'
const org='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002'
beforeEach(()=>{state.writes=[];state.error=null;state.activityError=null})
it.each(['onboarding_sent','onboarding_submitted','otp','converted'])('refuses to manufacture evidence by manually changing status to %s',async leadStatus=>{
 await expect(updateDeveloperLeadWorkspaceSetup({developerOrgId:org,developerLeadId:id,leadStatus})).rejects.toThrow('saved evidence');expect(state.writes).toHaveLength(0)
})
it('uses the saved status as a concurrency condition and explains a stale action',async()=>{
 state.error={code:'PGRST116'};await expect(updateDeveloperLeadWorkspaceSetup({developerOrgId:org,developerLeadId:id,leadStatus:'contacted',previousLeadStatus:'new'})).rejects.toThrow('Refresh');expect(state.writes[0].filters.lead_status).toBe('new')
})
it('retains a successful stage save when optional activity enrichment fails',async()=>{
 state.activityError={code:'XX000'};const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});try{const row=await updateDeveloperLeadWorkspaceSetup({developerOrgId:org,developerLeadId:id,leadStatus:'contacted',previousLeadStatus:'new'});expect(row.leadStatus).toBe('contacted');expect(state.writes).toHaveLength(1)}finally{warn.mockRestore()}
})

it.each(['onboarding_submitted','otp','converted'])('does not rewind a %s deal while editing qualification',async previousLeadStatus=>{
 await expect(updateDeveloperLeadWorkspaceSetup({developerOrgId:org,developerLeadId:id,leadStatus:'qualified',previousLeadStatus})).rejects.toThrow('cannot move it backwards');expect(state.writes).toHaveLength(0)
})
