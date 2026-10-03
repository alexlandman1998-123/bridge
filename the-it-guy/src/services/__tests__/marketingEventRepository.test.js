import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ insert:vi.fn(), update:vi.fn(), single:vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured:true, supabase:{ auth:{getUser:async()=>({data:{user:{id:'user-1'}}})}, from:()=>({insert:api.insert,update:api.update})} }))
import { createMarketingEvent, updateMarketingEvent } from '../marketingEventRepository'
beforeEach(()=>{
  vi.clearAllMocks()
  api.single.mockResolvedValue({data:{id:'event-1',event_type:'show_day',subject_type:'listing',subject_id:'listing-1',status:'upcoming',public_token:'token',timezone:'Africa/Johannesburg',starts_at:'2099-10-03T08:00:00.000Z',ends_at:'2099-10-03T12:00:00.000Z'}})
  api.insert.mockReturnValue({select:()=>({single:api.single})})
  api.update.mockReturnValue({eq:()=>({select:()=>({single:api.single})})})
})
it('creates and edits a South African event time independent of browser timezone and returns the persisted token',async()=>{
  const values={title:'Show day',subjectId:'listing-1',startDate:'2099-10-03',startTime:'10:00',endTime:'14:00',status:'upcoming'}
  const event=await createMarketingEvent('org-1','showDays',values)
  expect(api.insert).toHaveBeenCalledWith(expect.objectContaining({organisation_id:'org-1',subject_id:'listing-1',starts_at:'2099-10-03T08:00:00.000Z',ends_at:'2099-10-03T12:00:00.000Z',created_by:'user-1'}))
  expect(event.publicToken).toBe('token');expect(event.listingId).toBe('listing-1');expect(event.time).toBe('10:00 – 14:00')
  await updateMarketingEvent('event-1',values)
  expect(api.update).toHaveBeenCalledWith(expect.objectContaining({starts_at:'2099-10-03T08:00:00.000Z',ends_at:'2099-10-03T12:00:00.000Z'}))
})
it('propagates a rejected database save instead of fabricating an event',async()=>{
  api.single.mockResolvedValue({error:new Error('Not permitted')})
  await expect(createMarketingEvent('org-1','showDays',{title:'Draft'})).rejects.toThrow('Not permitted')
})
