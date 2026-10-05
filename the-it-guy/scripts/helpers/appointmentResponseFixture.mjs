import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = name => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// Execute the shipping response and durable-delivery migrations, without a
// network connection. Only unrelated identity/scope infrastructure is stubbed.
export async function verifyAppointmentResponses(PGlite) {
  const db = new PGlite()
  const actor=id(1), matter=id(8), appointment=id(9), buyer=id(20), seller=id(21), listing=id(22), link=id(23)
  const baseline='2099-07-20T08:00:00.000Z', checks=[]
  const check = async (name, run) => { await run(); checks.push(name) }
  const admin = async (sql, args=[]) => { await db.exec('reset role'); return (await db.query(sql,args)).rows }
  const portal = async ({ token='buyer-capability', session=null, command=id(40), status='Accepted', start=baseline, preferred=null, end=null, comment=null, target=appointment }={}) => {
    await db.exec('reset role')
    await db.query("select set_config('test.portal',$1,false)",[token])
    await db.exec('set role anon')
    try { return (await db.query('select bridge_respond_client_portal_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9) as saved',
      [token,target,command,status,start,preferred,end,comment,session])).rows[0].saved }
    finally { await db.exec('reset role') }
  }
  const rsvp = async (token, status, preferred=null, end=null, comment=null) => {
    await db.exec('set role anon')
    try { return (await db.query('select * from submit_appointment_rsvp($1,$2,$3,$4,$5)',[token,status,preferred,end,comment])).rows }
    finally { await db.exec('reset role') }
  }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private; create schema journey_private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('role')$$;
      create table profiles(id uuid primary key,full_name text,first_name text,last_name text,email text,role text default 'attorney');
      create table organisations(id uuid primary key);
      create table transactions(id uuid primary key,organisation_id uuid);
      create table contacts(contact_id uuid primary key); create table leads(lead_id uuid primary key);
      create table attorney_firm_members(firm_id uuid,user_id uuid,role text,status text);
      create table attorney_firms(id uuid primary key,organisation_id uuid);
      create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,assignment_status text,status text,can_manage_signing boolean);
      create function bridge_is_org_admin(uuid) returns boolean language sql as $$select false$$;
      create function bridge_membership_role(uuid) returns text language sql as $$select ''::text$$;
      create function bridge_attorney_can_manage_transaction(t uuid) returns boolean language sql stable security definer set search_path=public as $$
        select exists(select 1 from transaction_attorney_assignments ta join attorney_firm_members m on m.firm_id=ta.attorney_firm_id
          where ta.transaction_id=t and m.user_id=auth.uid() and m.status='active')$$;
      create function bridge_can_write_appointment_payload(t uuid,o uuid,c uuid,a uuid) returns boolean language sql stable security definer set search_path=public as $$
        select auth.uid() is not null and (c=auth.uid() or bridge_attorney_can_manage_transaction(t))$$;
    `)
    const base=migration('202605130001_appointment_module_v1')
    await db.exec(base.slice(0,base.indexOf('alter table public.appointments enable row level security;')))
    await db.exec(`
      alter table appointments add confirmed_at timestamptz;
      alter table appointment_participants add rsvp_expires_at timestamptz,add rsvp_revoked_at timestamptz;
      create table appointment_resources(id uuid primary key,organisation_id uuid,resource_name text,is_active boolean default true);
      create table appointment_reschedule_requests(id uuid primary key default gen_random_uuid(),appointment_id uuid references appointments on delete cascade,
        requested_by uuid,requested_by_role text,reason text,status text,preferred_start timestamptz,preferred_end timestamptz,
        reviewed_by uuid,reviewed_at timestamptz,suggested_slots jsonb,created_at timestamptz default now(),updated_at timestamptz);
      create table appointment_reminders(id uuid primary key default gen_random_uuid(),appointment_id uuid references appointments on delete cascade,status text,updated_at timestamptz);
      create function bridge_can_access_appointment(p uuid) returns boolean language sql stable security definer set search_path=public as $$
        select exists(select 1 from appointments where appointment_id=p and (created_by=auth.uid() or bridge_attorney_can_manage_transaction(transaction_id)))$$;
      grant usage on schema auth to authenticated,anon;
      grant select,insert,update,delete on all tables in schema public to authenticated;
    `)
    const notifications=migration('202607180024_attorney_calendar_phase1_environment_recovery')
    await db.exec(notifications.slice(notifications.indexOf('create table if not exists public.appointment_notification_events ('),notifications.indexOf('alter table public.appointment_notification_events')))
    await db.exec('create unique index fixture_notification_dedupe on appointment_notification_events(dedupe_key) where dedupe_key is not null;')
    const portalSql=migration('202605270001_bridge9_principal_demo_seed_support')
    await db.exec(portalSql.slice(portalSql.indexOf('create table if not exists public.client_portal_notifications ('),portalSql.indexOf('alter table if exists public.client_portal_notifications')))
    await db.exec(migration('202607180032_attorney_calendar_phase5_reschedule_coordination'))
    await db.exec(migration('20261003201121_attorney_appointment_management'))
    await db.exec(migration('20261003204422_attorney_calendar_durable_delivery'))
    await db.exec(`
      create schema extensions;
      create function extensions.digest(text,text) returns bytea language sql immutable as $$select sha256(convert_to($1,'UTF8'))$$;
      create function bridge_is_active_member(uuid) returns boolean language sql stable as $$select auth.uid() is not null$$;
      create function submit_appointment_rsvp(text,text,timestamptz default null,timestamptz default null,text default null)
        returns table(participant_id uuid,appointment_id uuid,rsvp_status text,responded_at timestamptz)
        language sql as $$select null::uuid,null::uuid,null::text,null::timestamptz where false$$;
    `)
    await db.exec(migration('20260925073026_listing_viewing_three_party_rounds'))
    await db.exec(`
      create table buyers(id uuid primary key,email text);
      create table client_portal_links(id uuid primary key,token text,is_active boolean,transaction_id uuid,buyer_id uuid,expires_at timestamptz);
      create table private_listing_seller_onboarding(id uuid primary key,form_data jsonb);
      create function bridge_client_portal_request_token() returns text language sql stable as $$select current_setting('test.portal',true)$$;
      create function bridge_has_client_portal_token_transaction_access(t uuid) returns boolean language sql stable security definer set search_path=public as $$
        select exists(select 1 from client_portal_links where transaction_id=t and token=bridge_client_portal_request_token() and is_active)$$;
      create function bridge_resolve_private_listing_seller_portal_token(text) returns table(onboarding_id uuid) language sql as $$select '${seller}'::uuid$$;
      create function journey_private.resolve_seller_portal_context(token text,access_token text) returns table(listing_id uuid,transaction_id uuid)
        language plpgsql security definer set search_path='' as $$begin
          if token <> 'seller-capability' or access_token is distinct from 'valid-session' then raise exception 'Seller portal access required' using errcode='42501'; end if;
          return query select '${listing}'::uuid,'${matter}'::uuid;
        end$$;
      create table transaction_events(id uuid primary key default gen_random_uuid(),transaction_id uuid references transactions on delete cascade,
        event_type text,event_data jsonb,created_by_role text,visibility_scope text);
      create table transaction_refresh_signals(transaction_id uuid primary key references transactions on delete cascade,version bigint,changed_at timestamptz,command_receipt_id uuid,canonical_event_id uuid);
      alter table transaction_refresh_signals enable row level security;
      grant select on transaction_refresh_signals to authenticated;
      create policy fixture_shared_matter on transaction_refresh_signals for select to authenticated using(bridge_attorney_can_manage_transaction(transaction_id));
    `)
    await db.query("insert into appointments(appointment_id,date_time) values($1,'2099-07-20T08:00Z')",[id(250)])
    await db.query("insert into appointment_participants(participant_id,appointment_id,participant_role) values($1,$5,'Buyer'),($2,$5,'Seller'),($3,$5,'Client'),($4,$5,'Client')",[id(251),id(252),id(253),id(254),id(250)])
    await db.query("insert into appointment_reschedule_requests(id,appointment_id,requested_by_role,status) values($1,$4,'Buyer','pending'),($2,$4,'Client','pending'),($3,$4,$5,'pending')",[id(261),id(262),id(263),id(250),id(252)])
    await db.exec(migration('20261004110204_attorney_cross_role_appointment_responses'))
    await check('legacy request linkage is deterministic and ambiguous party roles remain unassigned',async()=>{
      const requests=await admin('select id,participant_id from appointment_reschedule_requests order by id')
      assert.deepEqual(requests.map(row=>row.participant_id),[id(251),null,id(252)])
    })

    const seed = async ({ delivery=true, visibility='client_visible', transaction=matter, required=true }={}) => {
      await db.exec(`reset role; select set_config('test.actor','',false); truncate appointments,profiles,organisations,transactions,attorney_firm_members,transaction_attorney_assignments,buyers,client_portal_links,private_listing_seller_onboarding,transaction_events cascade;`)
      await db.query(`insert into profiles(id,email) values($1,'attorney@example.test'),($2,'bond@example.test'),($3,'cancellation@example.test')`,[actor,id(2),id(3)])
      await db.query('insert into organisations values($1)',[id(6)])
      await db.query('insert into transactions values($1,$2)',[matter,id(6)])
      await db.query(`insert into attorney_firm_members values($1,$2,'transfer_attorney','active'),($3,$4,'bond_attorney','active'),($5,$6,'cancellation_attorney','active')`,[id(30),actor,id(31),id(2),id(32),id(3)])
      await db.query(`insert into transaction_attorney_assignments(transaction_id,attorney_firm_id) values($1,$2),($1,$3),($1,$4)`,[matter,id(30),id(31),id(32)])
      await db.query(`insert into appointments(appointment_id,organisation_id,transaction_id,listing_id,created_by,appointment_date,start_time,end_time,date_time,status,visibility_scope,attorney_delivery_enabled)
        values($1,$2,$3,$4,$5,'2099-07-20','10:00','11:00',$6,'Pending Confirmation',$7,$8)`,[appointment,id(6),transaction,listing,actor,baseline,visibility,delivery])
      await db.query(`insert into appointment_participants(participant_id,appointment_id,user_id,email,participant_role,rsvp_status,rsvp_token,rsvp_expires_at,is_required)
        values($1,$4,$5,'attorney@example.test','Attorney','Accepted','attorney-rsvp',null,true),
        ($2,$4,null,'buyer@example.test','Buyer','Pending','buyer-rsvp','2099-07-20T08:00Z',true),
        ($3,$4,null,'seller@example.test','Seller','Pending','seller-rsvp','2099-07-20T08:00Z',$6)`,[id(10),buyer,seller,appointment,actor,required])
      await db.query(`insert into buyers values($1,'buyer@example.test')`,[buyer])
      await db.query(`insert into client_portal_links values($1,'buyer-capability',true,$2,$3,'2099-12-31')`,[link,matter,buyer])
      await db.query(`insert into private_listing_seller_onboarding values($1,'{"sellerEmail":"seller@example.test"}')`,[seller])
      await db.query(`insert into appointment_reminders(appointment_id,status) values($1,'pending')`,[appointment])
    }
    const snapshot=async()=>{
      const rows={}
      for(const table of ['appointments','appointment_participants','appointment_reschedule_requests','appointment_reminders','appointment_notification_events','client_portal_notifications','attorney_appointment_delivery_jobs','transaction_events','transaction_refresh_signals','private.appointment_response_receipts','listing_viewing_rounds','listing_viewing_round_responses']) {
        rows[table]=await admin(`select * from ${table.includes('.')?table:`public.${table}`} order by to_jsonb(${table.split('.').at(-1)})::text`)
      }
      return rows
    }
    await check('required attendees, both response paths and shared professional watermark',async()=>{
      await seed()
      const accepted=await portal()
      assert.equal(accepted.status,'Pending Confirmation')
      assert.equal((await admin('select status from appointments'))[0].status,'Pending Confirmation')
      assert.equal((await admin('select event_type from transaction_events'))[0].event_type,'appointment_updated')
      await rsvp('seller-rsvp','Accepted')
      assert.equal((await admin('select status from appointments'))[0].status,'Confirmed')
      const versions=[]
      for(const user of [actor,id(2),id(3)]) {
        await db.query("select set_config('test.actor',$1,false)",[user]);await db.exec('set role authenticated')
        versions.push((await db.query('select version from transaction_refresh_signals')).rows[0].version);await db.exec('reset role')
      }
      assert.equal(new Set(versions).size,1);assert.ok(Number(versions[0])>0)
      assert.ok((await admin("select * from attorney_appointment_delivery_jobs where event_kind='confirmed' and status='queued'")).length>=2)
    })
    await check('lost acknowledgements replay without duplicating or reverting later changes',async()=>{
      await seed()
      const saved=await portal(), before=await snapshot()
      assert.equal((await portal()).replayed,true);assert.deepEqual(await snapshot(),before)
      await portal({command:id(41),status:'Proposed New Time',preferred:'2099-07-21T08:00Z',comment:'Morning please'})
      const changed=await snapshot()
      assert.equal((await portal()).respondedAt,saved.respondedAt);assert.deepEqual(await snapshot(),changed)
      await assert.rejects(portal({status:'Declined'}),/already used/)
    })
    await check('all persistence and queued delivery roll back if the final write fails',async()=>{
      await seed(); const before=await snapshot()
      await db.exec(`create function private.fixture_fail_receipt() returns trigger language plpgsql as $$begin raise exception 'fixture final write failed';end$$;
        create trigger fixture_fail_receipt before insert on private.appointment_response_receipts for each row execute function private.fixture_fail_receipt();`)
      await assert.rejects(portal({status:'Proposed New Time',preferred:'2099-07-21T08:00Z'}),/fixture final write failed/)
      assert.deepEqual(await snapshot(),before)
      await db.exec('drop trigger fixture_fail_receipt on private.appointment_response_receipts')
      const result=await portal({status:'Proposed New Time',preferred:'2099-07-21T08:00Z'})
      assert.equal(result.status,'Reschedule Requested')
      assert.equal((await admin('select count(*)::int as n from appointment_reschedule_requests'))[0].n,1)
    })
    await check('seller session, correct identity, private appointments and wrong matter denied',async()=>{
      await seed()
      await assert.rejects(portal({token:'seller-capability'}),/Seller portal access/)
      assert.equal((await portal({token:'seller-capability',session:'valid-session'})).participantId,seller)
      await assert.rejects(portal({token:'seller-capability',session:'expired-session'}),/Seller portal access/)
      await admin("update buyers set email='other-person@example.test'")
      await assert.rejects(portal(),/could not be identified/)
      await seed({visibility:'internal_only',delivery:false});await assert.rejects(portal(),/access denied/)
      await rsvp('buyer-rsvp','Accepted')
      assert.equal((await admin('select count(*)::int n from transaction_events'))[0].n,0,'A private RSVP must not publish shared/client activity.')
      await seed();await admin('insert into transactions values($1,$2)',[id(99),id(6)])
      await admin('update appointments set transaction_id=$1',[id(99)]);await assert.rejects(portal(),/access denied/)
    })
    await check('active capability and identity required even when retrying a saved receipt',async()=>{
      await seed();await portal()
      await admin("update client_portal_links set is_active=false");await assert.rejects(portal(),/Portal access required/)
      await seed();await portal()
      await admin("update appointment_participants set email='previous-buyer@example.test' where participant_id=$1",[buyer])
      await admin("insert into appointment_participants(participant_id,appointment_id,email,participant_role,rsvp_status) values($1,$2,'buyer@example.test','Buyer','Pending')",[id(24),appointment])
      const currentInvite=await portal()
      assert.equal(currentInvite.participantId,id(24));assert.equal(currentInvite.replayed,false,'Receipt identity must follow the current authorised invitation.')
      await seed();await portal();await admin("update appointment_participants set rsvp_revoked_at=now() where participant_id=$1",[buyer])
      await assert.rejects(portal(),/no longer active/)
      await seed();await admin("update appointment_participants set rsvp_expires_at=now()-interval '1 day' where participant_id=$1",[buyer])
      assert.deepEqual(await rsvp('buyer-rsvp','Accepted'),[]);await assert.rejects(portal(),/no longer active/)
      assert.deepEqual(await rsvp('invalid','Accepted'),[])
      await seed();await admin("update appointment_participants set rsvp_token='rotated-token' where participant_id=$1",[buyer])
      const before=await snapshot()
      // Model a token captured before waiting for another writer's row lock.
      await assert.rejects(db.query('select private.commit_appointment_response($1,$2,$3,null,null,null,false,null,$4)',[appointment,buyer,'Accepted','buyer-rsvp']),/no longer active/)
      assert.deepEqual(await snapshot(),before)
    })
    await check('changed or closed appointment cannot take a stale response',async()=>{
      await seed();const before=await snapshot()
      await assert.rejects(portal({start:'2099-07-20T09:00Z'}),/time changed/);assert.deepEqual(await snapshot(),before)
      for(const status of ['Completed','Cancelled','Declined','no_show']) {
        await seed();await admin('update appointments set status=$1',[status]);await assert.rejects(portal(),/Closed or started/)
      }
      await seed();await admin("update appointments set date_time=now()-interval '1 hour'")
      await assert.rejects(rsvp('buyer-rsvp','Accepted'),/Closed or started/)
    })
    await check('participant proposals remain distinct, validate SAST dates and close only their own older request',async()=>{
      await seed()
      await portal({status:'Proposed New Time',preferred:'2099-07-21T08:00Z'})
      await portal({token:'seller-capability',session:'valid-session',status:'Proposed New Time',preferred:'2099-07-22T08:00Z'})
      assert.equal((await admin("select count(*)::int n from appointment_reschedule_requests where status='pending'"))[0].n,2)
      await portal({command:id(41),status:'Accepted'})
      assert.equal((await admin("select requested_by_role from appointment_reschedule_requests where status='pending'"))[0].requested_by_role,'Seller')
      assert.equal((await admin('select status from appointments'))[0].status,'Reschedule Requested')
      await assert.rejects(portal({command:id(42),status:'Proposed New Time',preferred:'2099-07-22T21:30Z',end:'2099-07-22T22:30Z'}),/same day/)
      await assert.rejects(portal({command:id(42),status:'Proposed New Time',preferred:'2000-01-01T08:00Z'}),/future/)
    })
    await check('public RSVP replay is unchanged and cannot replace a submitted choice or end time',async()=>{
      await seed();await rsvp('buyer-rsvp','Proposed New Time','2099-07-21T08:00Z','2099-07-21T09:00Z','Morning')
      const before=await snapshot();await rsvp('buyer-rsvp','Proposed New Time','2099-07-21T08:00Z','2099-07-21T09:00Z','Morning');assert.deepEqual(await snapshot(),before)
      await assert.rejects(rsvp('buyer-rsvp','Accepted'),/already been recorded/)
      await assert.rejects(rsvp('buyer-rsvp','Proposed New Time','2099-07-21T08:00Z','2099-07-21T10:00Z','Morning'),/already been recorded/)
    })
    await check('optional participants do not block confirmation and notifications-off persists',async()=>{
      await seed({required:false,delivery:false});assert.equal((await portal()).status,'Confirmed')
      await rsvp('seller-rsvp','Declined');assert.equal((await admin('select status from appointments'))[0].status,'Confirmed')
      assert.equal((await admin('select count(*)::int n from attorney_appointment_delivery_jobs'))[0].n,0)
      assert.equal((await admin('select count(*)::int n from appointment_notification_events'))[0].n,0)
    })
    await check('listing-only seller can respond while buyer cannot',async()=>{
      await seed({transaction:null})
      assert.equal((await portal({token:'seller-capability',session:'valid-session'})).participantId,seller)
      await assert.rejects(portal(),/access denied/)
    })
    await check('staff time/participant/request edits advance the same watermark; deletions remain valid',async()=>{
      await seed(); const version=async()=>Number((await admin('select version from transaction_refresh_signals'))[0]?.version||0)
      let previous=await version()
      await admin("update appointments set location='Office B'");assert.ok(await version()>previous);previous=await version()
      await admin("update appointment_participants set name='Updated participant' where participant_id=$1",[buyer]);assert.ok(await version()>previous)
      await portal({status:'Proposed New Time',preferred:'2099-07-21T08:00Z'});previous=await version()
      await admin('delete from appointment_reschedule_requests');assert.ok(await version()>previous);previous=await version()
      await admin('update appointments set location=location');assert.equal(await version(),previous)
      await admin('delete from appointments');assert.ok(await version()>previous)
      await seed();await admin('insert into transactions values($1,$2)',[id(99),id(6)]);await admin('delete from transactions where id=$1',[matter]);assert.equal((await admin('select count(*)::int n from transaction_refresh_signals'))[0].n,0)
    })
    const seedViewing=async()=>{
      await seed({transaction:null,delivery:false})
      await admin('delete from appointment_participants where participant_id=$1',[id(10)])
      await admin("insert into profiles(id,email,role) values($1,'agent@example.test','agent')",[id(4)])
      await admin('update appointments set created_by=$1,status=$2,listing_viewing_round_number=1',[id(4),'requested'])
      await admin("insert into appointment_participants(participant_id,appointment_id,email,participant_role,rsvp_status,rsvp_token) values($1,$2,'agent@example.test','Agent','Pending','agent-rsvp')",[id(25),appointment])
      await admin("insert into listing_viewing_rounds(appointment_id,organisation_id,round_number,proposed_start,expires_at) values($1,$2,1,$3,now()+interval '7 days')",[appointment,id(6),baseline])
    }
    await check('managed viewing requires buyer, seller and agent and retains public/portal convergence',async()=>{
      await seedViewing()
      const saved=await portal({token:'seller-capability',session:'valid-session'})
      assert.equal(saved.status,'requested');assert.equal(saved.refreshOnly,true)
      await rsvp('buyer-rsvp','Accepted');assert.equal((await admin('select status from appointments'))[0].status,'requested')
      await rsvp('agent-rsvp','Accepted');assert.equal((await admin('select status from appointments'))[0].status,'confirmed')
      assert.equal((await admin('select count(*)::int n from listing_viewing_round_responses'))[0].n,3)
    })
    await check('managed viewing proposals rotate all invitations and replay archived tokens without new rounds',async()=>{
      await seedViewing()
      const saved=await portal({token:'seller-capability',session:'valid-session',status:'Proposed New Time',preferred:'2099-07-21T08:00Z',end:'2099-07-21T09:00Z'})
      assert.equal(saved.refreshOnly,true);assert.equal(saved.status,'requested')
      assert.equal((await admin('select listing_viewing_round_number from appointments'))[0].listing_viewing_round_number,2)
      assert.ok((await admin('select rsvp_status,rsvp_token from appointment_participants')).every(row=>row.rsvp_status==='Pending' && !['seller-rsvp','buyer-rsvp','agent-rsvp'].includes(row.rsvp_token)))
      const before=await snapshot()
      await rsvp('seller-rsvp','Proposed New Time','2099-07-21T08:00Z','2099-07-21T09:00Z')
      assert.deepEqual(await snapshot(),before)
      await assert.rejects(rsvp('seller-rsvp','Accepted'),/already recorded/)
    })
    await check('managed viewing decline closes its active round and revokes unanswered invitations',async()=>{
      await seedViewing();await portal({token:'seller-capability',session:'valid-session',status:'Declined'})
      assert.equal((await admin('select status from listing_viewing_rounds'))[0].status,'declined')
      assert.equal((await admin('select status from appointments'))[0].status,'declined')
      assert.deepEqual(await rsvp('buyer-rsvp','Accepted'),[])
    })
    await check('an expired managed viewing closes without falsely acknowledging a portal response',async()=>{
      await seedViewing();await admin("update listing_viewing_rounds set expires_at=now()-interval '1 minute'")
      const saved=await portal({token:'seller-capability',session:'valid-session'})
      assert.equal(saved.responseUnavailable,true);assert.equal(saved.status,'cancelled')
      assert.equal((await admin('select count(*)::int n from listing_viewing_round_responses'))[0].n,0)
    })
    await check('private writer and receipts are inaccessible to client credentials',async()=>{
      await db.exec('set role anon')
      await assert.rejects(db.query('select * from private.appointment_response_receipts'),/permission denied/)
      await assert.rejects(db.query('select private.commit_appointment_response($1,$2,$3,null,null,null)',[appointment,buyer,'Accepted']),/permission denied/)
      await db.exec('reset role')
    })
    return checks
  } finally { await db.close() }
}
