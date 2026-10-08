import { describe,it,expect,vi } from 'vitest'
import { authorizationUrl,encryptCredential,decryptCredential,safeReturnUrl,eventPayload,normalizedEvent,syncProviderEvent,exchangeCode,hash,refreshCredential } from '../../supabase/functions/_shared/calendarProviderTransport.ts'
import {config,copyKey,source,job,controlledProvider} from './calendarProviderFixture.js'
const valid=()=>Promise.resolve(true)
const sync=(provider,work,fake,gate=valid)=>syncProviderEvent(provider,work,'fixture-token',config.appUrl,gate,fake.fetcher)
describe('Connected calendar security and schedule contract',()=>{
 it('encrypts tokens with authenticated connection identity and rejects tampering',async()=>{
  const token={access_token:'secret-token',refresh_token:'secret-refresh'}
  const encrypted=await encryptCredential(token,copyKey,config.encryptionKey)
  expect(JSON.stringify(encrypted)).not.toContain('secret');expect(await decryptCredential(encrypted,copyKey,config.encryptionKey)).toEqual(token)
  await expect(decryptCredential(encrypted,'different-connection',config.encryptionKey)).rejects.toThrow('credential_unavailable')
  await expect(encryptCredential(token,copyKey,'invalid')).rejects.toThrow('encryption_configuration_missing')
 })
 it.each(['google','outlook'])('uses PKCE, configured callback and minimum personal-copy permissions for %s',async provider=>{
  const url=new URL(await authorizationUrl(provider,'state','verifier',config))
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('code_challenge')).not.toBe('verifier')
  expect(url.searchParams.get('redirect_uri')).toBe(`https://project.example.test/functions/v1/calendar-provider-connection?provider=${provider}`)
  expect(url.searchParams.get('scope')).not.toContain('Mail.Send');expect(url.searchParams.get('scope')).not.toContain('calendar.events ')
 })
 it.each(['https://evil.example.test/','//evil.example.test/','/\\evil.example.test/'])('refuses foreign return path %s',path=>{
  expect(()=>safeReturnUrl(path,config.appUrl)).toThrow('invalid_return_path')
 })
 it('requires granted permission and a verified account before keeping refresh credentials',async()=>{
  const fetcher=vi.fn(()=>Promise.resolve(new Response(JSON.stringify({access_token:'token',refresh_token:'refresh',scope:'openid email'}))))
  await expect(exchangeCode('google','code','verifier',config,fetcher)).rejects.toThrow('calendar_permission_missing');expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('retains the original refresh token when Google rotates only the access token',async()=>{
  const fetcher=vi.fn(()=>Promise.resolve(new Response(JSON.stringify({access_token:'new-token',expires_in:3600}))))
  expect(await refreshCredential('google',{refresh_token:'old-refresh',expiresAt:'2000-01-01'},config,fetcher)).toMatchObject({access_token:'new-token',refresh_token:'old-refresh'})
 })
 it.each(['google','outlook'])('copies canonical instants with no guests or provider reminders for %s',provider=>{
  const payload=eventPayload(provider,source,copyKey,'hash',config.appUrl)
  expect(payload.attendees).toEqual([]);expect(normalizedEvent(provider,payload)).toMatchObject({start:'2099-07-20T08:00:00.000Z',end:'2099-07-20T09:00:00.000Z',reminders:false,attendees:0,private:true})
  expect(JSON.stringify(payload)).not.toContain('client@example.test')
 })
 it('keeps Outlook all-day civil dates when Graph returns UTC instants',()=>{
  const payload=eventPayload('outlook',{...source,allDay:true,date:'2099-07-20',endDate:'2099-07-21',start:'2099-07-19T22:00Z',end:'2099-07-20T22:00Z'},copyKey,'hash',config.appUrl)
  const graph={...payload,start:{dateTime:'2099-07-19T22:00:00.0000000',timeZone:'UTC'},end:{dateTime:'2099-07-20T22:00:00.0000000',timeZone:'UTC'}}
  expect(normalizedEvent('outlook',graph)).toEqual(normalizedEvent('outlook',payload))
 })
})
describe.each(['google','outlook'])('%s controlled provider lifecycle',provider=>{
 it('creates, retries a lost receipt without duplicates, updates the same copy and removes it',async()=>{
  const fake=controlledProvider(provider);fake.state.lostCreate=true
  await expect(sync(provider,job,fake)).rejects.toThrow('Lost create response')
  const first=await sync(provider,job,fake);expect(first.status).toBe('synced');expect(fake.state.creates).toBe(1)
  const next={...job,external_id:first.externalId,remote_hash:first.remoteHash,synced_hash:first.writtenHash,desired_hash:'second-hash',desired_payload:{...source,title:'Updated viewing',start:'2099-07-20T10:00Z',end:'2099-07-20T11:00Z'}}
  const updated=await sync(provider,next,fake);expect(updated.status).toBe('synced');expect(updated.externalId).toBe(first.externalId);expect(fake.state.updates).toBe(1)
  const removed=await sync(provider,{...next,desired_action:'delete',remote_hash:updated.remoteHash},fake);expect(removed.status).toBe('removed');expect(fake.state.deletes).toBe(1)
  expect(fake.fetcher.mock.calls.filter(([,init])=>['PUT','PATCH','DELETE'].includes(init.method)).every(([,init])=>Boolean(init.headers['If-Match']))).toBe(true)
 })
 it('detects outside edits and restores only the reviewed remote version',async()=>{
  const fake=controlledProvider(provider),first=await sync(provider,job,fake)
  const tracked={...job,external_id:first.externalId,remote_hash:first.remoteHash,synced_hash:first.writtenHash}
  fake.change(provider==='google'?{summary:'Outside edit'}:{subject:'Outside edit'})
  const review=await sync(provider,tracked,fake);expect(review.status).toBe('needs_review');expect(fake.state.updates).toBe(0)
  expect((await sync(provider,{...tracked,force_hash:'stale-review'},fake)).status).toBe('needs_review')
  expect((await sync(provider,{...tracked,force_hash:review.remoteHash},fake)).status).toBe('synced');expect(fake.state.updates).toBe(1)
 })
 it('flags a deleted connected copy rather than silently recreating a booking',async()=>{
  const fake=controlledProvider(provider),first=await sync(provider,job,fake);fake.state.event=null
  expect((await sync(provider,{...job,external_id:first.externalId,remote_hash:first.remoteHash},fake)).status).toBe('needs_review');expect(fake.state.creates).toBe(1)
 })
 it('refuses edits and cancellations when outside guests would receive provider mail',async()=>{
  const fake=controlledProvider(provider),first=await sync(provider,job,fake)
  fake.change({attendees:[{email:'outside@example.test'}]})
  const remoteHash=await hash(JSON.stringify(normalizedEvent(provider,fake.state.event)))
  for(const action of ['upsert','delete']) {
   expect(await sync(provider,{...job,external_id:first.externalId,remote_hash:first.remoteHash,force_hash:remoteHash,desired_action:action},fake)).toMatchObject({status:'needs_review',observed:{reason:'provider_has_guests'}})
  }
  expect(fake.state.updates).toBe(0);expect(fake.state.deletes).toBe(0)
 })
 it('fences conditional-write races and does not trust an event changed during receipt verification',async()=>{
  const fake=controlledProvider(provider),first=await sync(provider,job,fake)
  const next={...job,external_id:first.externalId,remote_hash:first.remoteHash,desired_hash:'new',desired_payload:{...source,title:'New'}}
  fake.state.raceWrite=true;expect((await sync(provider,next,fake)).status).toBe('needs_review')
  fake.state.raceWrite=false;fake.state.afterWrite=event=>({...event,...(provider==='google'?{summary:'Racing outside edit'}:{subject:'Racing outside edit'})})
  expect((await sync(provider,next,fake)).status).toBe('needs_review')
 })
 it('sends no requests for stale work and no writes after a failed second preflight',async()=>{
  const fake=controlledProvider(provider)
  expect((await sync(provider,job,fake,()=>Promise.resolve(false))).status).toBe('superseded');expect(fake.fetcher).not.toHaveBeenCalled()
  let checks=0;expect((await sync(provider,job,fake,()=>Promise.resolve(++checks===1))).status).toBe('superseded');expect(fake.state.creates).toBe(0)
 })
 it('honours throttling without leaking vendor response bodies',async()=>{
  const fake={fetcher:vi.fn(()=>Promise.resolve(new Response('private provider details',{status:429,headers:{'Retry-After':'90'}})))}
  await expect(sync(provider,job,fake)).rejects.toMatchObject({code:'provider_unavailable',retryAfter:90})
 })
})
it('flags duplicate Outlook copies and never follows an arbitrary pagination URL',async()=>{
 const fake=controlledProvider('outlook');fake.seed();fake.state.duplicate=true
 expect((await sync('outlook',job,fake)).observed.reason).toBe('duplicate_provider_copies');expect(fake.state.creates).toBe(0)
 fake.fetcher.mockImplementationOnce(()=>Promise.resolve(new Response(JSON.stringify({value:[], '@odata.nextLink':'https://evil.example.test/'}))))
 expect((await sync('outlook',job,fake)).status).toBe('needs_review');expect(fake.fetcher).toHaveBeenCalledTimes(2)
})

it('preserves personal Google event colours while patching owned fields',async()=>{
 const fake=controlledProvider('google'),first=await sync('google',job,fake)
 fake.change({colorId:'7'});const next={...job,external_id:first.externalId,remote_hash:first.remoteHash,desired_hash:'updated',desired_payload:{...source,title:'Updated'}}
 expect((await sync('google',next,fake)).status).toBe('synced');expect(fake.state.event.colorId).toBe('7')
 expect(fake.fetcher.mock.calls.some(([,init])=>init.method==='PATCH')).toBe(true)
})
it('requires manual review of Outlook online meetings before modifying the provider body',async()=>{
 const fake=controlledProvider('outlook'),first=await sync('outlook',job,fake);fake.change({isOnlineMeeting:true})
 const remoteHash=await hash(JSON.stringify(normalizedEvent('outlook',fake.state.event)))
 expect((await sync('outlook',{...job,external_id:first.externalId,remote_hash:first.remoteHash,force_hash:remoteHash},fake)).observed.reason).toBe('provider_has_online_meeting')
 expect(fake.state.updates).toBe(0)
})
it.each(['google','outlook'])('flags an outside recurring series in %s even after a restore request',async provider=>{
 const fake=controlledProvider(provider),first=await sync(provider,job,fake);fake.change(provider==='google'?{recurrence:['RRULE:FREQ=DAILY']}:{type:'seriesMaster'})
 expect((await sync(provider,{...job,external_id:first.externalId,remote_hash:first.remoteHash,force_hash:first.remoteHash},fake)).observed.reason).toBe('provider_copy_is_recurring');expect(fake.state.updates).toBe(0)
})
