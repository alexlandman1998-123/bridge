import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const api=vi.hoisted(()=>({getSession:vi.fn(),fetch:vi.fn()}))
vi.mock('../../../lib/supabaseClient.js',()=>({supabase:{auth:{getSession:api.getSession}}}))
import { saveRentalLandlordDiscovery } from '../rentalLandlordOnboardingService.js'
const profile={type:'individual',name:'Owner',email:'owner@example.test',phone:'0821234567',people:[]}
const data={profile,portfolio:[{id:'home',address:'Road'}]},lead={id:'lead',raw:{rawEnquiryPayload:{landlordProfile:profile,landlordPortfolio:data.portfolio}}}
const response=body=>({ok:true,json:async()=>body})
beforeEach(()=>{api.getSession.mockResolvedValue({data:{session:{access_token:'local-fixture'}}});api.fetch.mockReset();vi.stubGlobal('fetch',api.fetch)})
afterEach(()=>vi.unstubAllGlobals())
it('refuses to write against a database without atomic profile saving',async()=>{
  api.fetch.mockResolvedValue(response({onboarding:{version:0,data,capabilities:{profileConsistency:false}}}))
  await expect(saveRentalLandlordDiscovery(lead,{profile:{...profile,name:'New'}},data)).rejects.toThrow('temporarily unavailable')
  expect(api.fetch).toHaveBeenCalledTimes(1)
})
it('posts only the profile with the displayed discovery and accepts its confirmed receipt',async()=>{
  const changed={...profile,name:'New'},confirmed={onboarding:{version:2,capabilities:{profileConsistency:true},consistency:{synced:true},data:{...data,profile:changed}}}
  api.fetch.mockResolvedValueOnce(response({onboarding:{version:1,data,capabilities:{profileConsistency:true}}})).mockResolvedValueOnce(response(confirmed))
  expect(await saveRentalLandlordDiscovery(lead,{profile:changed},data)).toEqual(confirmed)
  const request=JSON.parse(api.fetch.mock.calls[1][1].body)
  expect(request).toMatchObject({version:1,expectedDiscovery:data,patch:{profile:changed}})
  expect(request.patch).not.toHaveProperty('portfolio')
})
it('recognises the exact committed profile on retry without repeating the write',async()=>{
  const committed={onboarding:{version:2,capabilities:{profileConsistency:true},consistency:{synced:true},data}}
  api.fetch.mockResolvedValue(response(committed))
  expect(await saveRentalLandlordDiscovery(lead,{profile},data)).toEqual(committed)
  expect(api.fetch).toHaveBeenCalledTimes(1)
})
it('checks committed readback after a response loses its onboarding snapshot',async()=>{
  const changed={...profile,name:'New'}
  api.fetch.mockResolvedValueOnce(response({onboarding:{version:1,data,capabilities:{profileConsistency:true}}})).mockResolvedValueOnce(response({saved:true,version:2,consistency:{synced:true}})).mockResolvedValueOnce(response({onboarding:{version:2,consistency:{synced:true},data:{...data,profile:changed}}}))
  expect((await saveRentalLandlordDiscovery(lead,{profile:changed},data)).onboarding.data.profile.name).toBe('New')
  expect(api.fetch).toHaveBeenCalledTimes(3)
})
it('rejects a mismatched readback instead of displaying a saved status',async()=>{
  api.fetch.mockResolvedValueOnce(response({onboarding:{version:1,data,capabilities:{profileConsistency:true}}})).mockResolvedValueOnce(response({onboarding:{version:2,consistency:{synced:true},data}}))
  await expect(saveRentalLandlordDiscovery(lead,{profile:{...profile,name:'Expected'}},data)).rejects.toThrow('could not be confirmed')
})
it('preserves and verifies saved fields outside the editor, including private person notes',async()=>{
  const existing={...profile,legacyReference:'KEEP',people:[{id:'person',name:'Person',privateNotes:'KEEP'}]},changed={...profile,name:'Updated',people:[{id:'person',name:'Updated person'}]},merged={...existing,...changed,people:[{...existing.people[0],...changed.people[0]}]}
  api.fetch.mockResolvedValueOnce(response({onboarding:{version:1,data:{...data,profile:existing},capabilities:{profileConsistency:true}}})).mockResolvedValueOnce(response({onboarding:{version:2,consistency:{synced:true},data:{...data,profile:merged}}}))
  const result=await saveRentalLandlordDiscovery(lead,{profile:changed},{...data,profile:existing})
  expect(result.onboarding.data.profile).toMatchObject({legacyReference:'KEEP',people:[{name:'Updated person',privateNotes:'KEEP'}]})
})
