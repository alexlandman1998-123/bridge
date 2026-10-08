import {PGlite} from '@electric-sql/pglite'
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest'
import {setupCalendarReservationDatabase,org,actor,booking,id,input,people} from './calendarReservationFixture.js'
import {dispatchCalendarProviderConnection,handleCalendarProviderConnection} from '../../supabase/functions/_shared/calendarProviderRuntime.ts'
import {encryptCredential,hash} from '../../supabase/functions/_shared/calendarProviderTransport.ts'
import {config,controlledProvider} from './calendarProviderFixture.js'
let db,counter
async function role(name='service_role') {await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor})]);await db.exec(`set role ${name}`)}
async function call(name,args) {
 await role();const entries=Object.entries(args)
 return (await db.query(`select ${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) as result`,entries.map(([,value])=>typeof value==='object' && value!==null?JSON.stringify(value):value))).rows[0].result
}
const service={rpc:async(name,args)=>{try{return {data:await call(name,args),error:null}}catch(error){return {data:null,error}}}}
async function connect(provider) {
 const state=String(++counter).padStart(64,'0')
 const c=await call('begin_calendar_provider_oauth',{p_org:org,p_user:actor,p_provider:provider,p_state_hash:state,p_verifier:'v'.repeat(64),p_return_url:config.appUrl+'/mobile/calendar'})
 await call('consume_calendar_provider_oauth',{p_state_hash:state,p_provider:provider})
 const credential=await encryptCredential({access_token:'fixture-access',refresh_token:'fixture-refresh',expiresAt:'2099-01-01T00:00Z'},c.connectionId,config.encryptionKey)
 await call('finish_calendar_provider_oauth',{p_state_hash:state,p_account_id:'fixture-account',p_account_label:'owner@example.test',p_credential:credential})
 return c.connectionId
}
async function save(changes={},revision=null) {await role('authenticated');return (await db.query('select save_calendar_appointment_with_delivery($1,$2,$3,$4,$5,$6) as result',[org,booking,JSON.stringify(input(changes)),revision===null?JSON.stringify(people([])):null,revision,id(200+ ++counter)])).rows[0].result}
async function read() {await role('authenticated');return (await db.query('select read_calendar_provider_status($1,$2) as result',[org,booking])).rows[0].result}
async function worker(fake,limit=1) {
 const c=(await call('claim_calendar_provider_connections',{p_limit:2}))[0]
 return dispatchCalendarProviderConnection(c,{config,service,user:()=>Promise.resolve(null),fetcher:fake.fetcher},limit)
}
const forceDue=async()=>{await db.exec('reset role');await db.exec("update private.calendar_provider_events set next_attempt_at=now()-interval '1 minute'")}
beforeAll(async()=>{db=new PGlite();await setupCalendarReservationDatabase(db)},30000)
beforeEach(async()=>{counter=0;await db.exec('reset role;truncate appointments,appointment_participants,private.calendar_mutation_receipts,private.calendar_repair_batches,private.calendar_provider_connections,private.calendar_provider_audit cascade')})
afterAll(async()=>db?.close())
it.each(['google','outlook'])('runs %s through real SQL, encrypted credentials, worker receipts and review actions',async provider=>{
 await connect(provider);await save();const fake=controlledProvider(provider)
 expect((await read()).events[0].status).toBe('queued');expect((await worker(fake))[0]).toMatchObject({status:'synced',recorded:true})
 expect((await read()).events[0].status).toBe('synced');expect(fake.state.creates).toBe(1)
 const externalId=fake.state.event.id
 await save({title:'Changed in Arch9'},0);expect((await worker(fake))[0].status).toBe('synced');expect(fake.state.event.id).toBe(externalId)
 fake.change(provider==='google'?{summary:'Outside title'}:{subject:'Outside title'});await forceDue();expect((await worker(fake))[0].status).toBe('needs_review')
 const review=(await read()).events[0];expect(review.observed.title).toBe('Outside title')
 await role('authenticated');await db.query('select calendar_provider_event_action($1,$2,$3,$4,$5)',[org,booking,provider,'restore',review.reviewToken])
 expect((await worker(fake))[0]).toMatchObject({status:'synced',recorded:true})
 await save({status:'cancelled'},1);expect((await worker(fake))[0].status).toBe('removed');expect(fake.state.deletes).toBe(1)
 expect((await read()).events[0].status).toBe('removed');expect(fake.state.creates).toBe(1)
 expect(fake.fetcher.mock.calls.filter(([,init])=>init.body).every(([,init])=>JSON.parse(init.body).attendees.length===0)).toBe(true)
})
it.each(['google','outlook'])('recovers a lost %s creation response with one provider copy',async provider=>{
 await connect(provider);await save();const fake=controlledProvider(provider);fake.state.lostCreate=true
 expect((await worker(fake))[0].status).toBe('failed');await forceDue()
 expect((await worker(fake))[0]).toMatchObject({status:'synced',recorded:true});expect(fake.state.creates).toBe(1)
})
it('records a provider creation racing cancellation, then removes that exact copy',async()=>{
 await connect('google');await save();const fake=controlledProvider('google'),base=fake.fetcher
 fake.fetcher=vi.fn(async(url,init)=>{const result=await base(url,init);if(init.method==='POST') await save({status:'cancelled'},0);return result})
 expect((await worker(fake))[0]).toMatchObject({status:'synced',recorded:false});expect((await read()).events[0].status).toBe('queued')
 expect((await worker(fake))[0]).toMatchObject({status:'removed',recorded:true});expect(fake.state.creates).toBe(1);expect(fake.state.deletes).toBe(1)
})
it('keeps authorization failures visible as reconnect required and stores no vendor error text',async()=>{
 await connect('google');await save();const fake={fetcher:vi.fn(()=>Promise.resolve(new Response('secret private token failure',{status:401})))}
 expect((await worker(fake))[0].status).toBe('needs_reconnect');const result=await read();expect(result.connections[0].status).toBe('needs_reconnect');expect(JSON.stringify(result)).not.toContain('secret')
})
it('does no provider work after disconnect and cannot revive the booking',async()=>{
 const c=await connect('google');await save();const claim=(await call('claim_calendar_provider_connections',{p_limit:1}))[0]
 await role('authenticated');await db.query('select disconnect_calendar_provider($1)',[c]);const fake=controlledProvider('google')
 expect(await dispatchCalendarProviderConnection(claim,{config,service,user:()=>Promise.resolve(null),fetcher:fake.fetcher})).toEqual([]);expect(fake.fetcher).not.toHaveBeenCalled()
})
it('binds OAuth start to the authenticated user, consumes callbacks once and encrypts the verified refresh credential',async()=>{
 const fetcher=vi.fn(async url=>new Response(JSON.stringify(String(url).includes('/token')?{access_token:'access-secret',refresh_token:'refresh-secret',scope:'openid email https://www.googleapis.com/auth/calendar.events.owned',expires_in:3600}:{sub:'verified-account',email:'verified@example.test',email_verified:true})))
 const runtime={config,service,user:()=>Promise.resolve({id:actor}),fetcher}
 const response=await handleCalendarProviderConnection(new Request(config.supabaseUrl+'/functions/v1/calendar-provider-connection',{method:'POST',headers:{Authorization:'Bearer fixture-auth',Origin:config.appUrl},body:JSON.stringify({action:'connect',organisationId:org,provider:'google',userId:'forged-user',returnPath:'/mobile/calendar'})}),runtime)
 expect(response.status).toBe(200);const {authorizationUrl}=await response.json();const state=new URL(authorizationUrl).searchParams.get('state')
 const callback=`${config.supabaseUrl}/functions/v1/calendar-provider-connection?provider=google&state=${state}&code=fixture-code`
 const finished=await handleCalendarProviderConnection(new Request(callback),runtime);expect(finished.headers.get('Location')).toBe(config.appUrl+'/mobile/calendar?calendar_provider=connected')
 await db.exec('reset role');const stored=(await db.query('select * from private.calendar_provider_connections')).rows[0]
 expect(stored.user_id).toBe(actor);expect(stored.account_id).toBe('verified-account');expect(JSON.stringify(stored.credential)).not.toContain('secret')
 expect((await handleCalendarProviderConnection(new Request(callback),runtime)).headers.get('Location')).toContain('calendar_provider=failed');expect(fetcher).toHaveBeenCalledTimes(2)
 expect(JSON.stringify(await read())).not.toContain('secret')
})
it('consumes a declined callback without making token or calendar requests and refuses foreign origins',async()=>{
 const state='s'.repeat(64);await call('begin_calendar_provider_oauth',{p_org:org,p_user:actor,p_provider:'google',p_state_hash:await hash(state),p_verifier:'v'.repeat(64),p_return_url:config.appUrl+'/mobile/calendar'})
 const runtime={config,service,user:()=>Promise.resolve({id:actor}),fetcher:vi.fn()}
 const response=await handleCalendarProviderConnection(new Request(config.supabaseUrl+`/functions/v1/calendar-provider-connection?provider=google&state=${state}&error=access_denied`),runtime)
 expect(response.headers.get('Location')).toContain('calendar_provider=cancelled');expect(runtime.fetcher).not.toHaveBeenCalled()
 expect((await handleCalendarProviderConnection(new Request(config.supabaseUrl,{method:'POST',headers:{Origin:'https://evil.example.test'}}),runtime)).status).toBe(403)
})

it.each(['google','outlook'])('restores a reviewed deleted %s copy under a new creation identity',async provider=>{
 await connect(provider);await save();const fake=controlledProvider(provider);await worker(fake);const old=fake.state.event.id;fake.state.event=null;await forceDue();await worker(fake)
 const review=(await read()).events[0];expect(review.observed.deleted).toBe(true)
 await role('authenticated');await db.query('select calendar_provider_event_action($1,$2,$3,$4,$5)',[org,booking,provider,'restore',review.reviewToken])
 expect((await worker(fake))[0]).toMatchObject({status:'synced',recorded:true});expect(fake.state.creates).toBe(2)
 if(provider==='google')expect(fake.state.event.id).not.toBe(old)
 expect((await read()).events[0].status).toBe('synced')
})
it('rejects a tampered callback destination before exchanging credentials',async()=>{
 const runtime={config,user:()=>Promise.resolve(null),fetcher:vi.fn(),service:{rpc:()=>Promise.resolve({data:{returnUrl:'https://evil.example.test/',verifier:'v',connectionId:'c'},error:null})}}
 const response=await handleCalendarProviderConnection(new Request(config.supabaseUrl+'/functions/v1/calendar-provider-connection?provider=google&state='+ 's'.repeat(64)+'&code=private-code'),runtime)
 expect(response.headers.get('Location')).toBe(config.appUrl+'/pipeline/calendar?calendar_provider=failed');expect(runtime.fetcher).not.toHaveBeenCalled()
})

it.each(['google','outlook'])('keeps %s outside edits pending review after pause/resume and disconnect/reconnect',async provider=>{
 const connected=await connect(provider);await save();const fake=controlledProvider(provider);await worker(fake)
 fake.change(provider==='google'?{summary:'Outside change'}:{subject:'Outside change'});await forceDue();await worker(fake)
 await role('authenticated');await db.query('select calendar_provider_event_action($1,$2,$3,$4,null)',[org,booking,provider,'pause'])
 await db.query('select calendar_provider_event_action($1,$2,$3,$4,null)',[org,booking,provider,'sync'])
 expect((await worker(fake))[0].status).toBe('needs_review');expect(fake.state.updates).toBe(0)
 await role('authenticated');await db.query('select disconnect_calendar_provider($1)',[connected]);await connect(provider)
 expect((await worker(fake))[0].status).toBe('needs_review');expect(fake.state.updates).toBe(0)
 const review=(await read()).events[0];expect(review.observed.title).toBe('Outside change')
})
