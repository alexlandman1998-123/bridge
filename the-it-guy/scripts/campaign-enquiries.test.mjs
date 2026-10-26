import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org=id(1), foreign=id(2), manager=id(3), agent=id(4), colleague=id(5), suspended=id(6), outsider=id(7), campaign=id(10), otherCampaign=id(11), lead=id(20), otherLead=id(21), unassigned=id(22), foreignLead=id(23)

test('campaign enquiry persistence, permissions and atomic CRM follow-up', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create table organisations(id uuid primary key);
      create table members(organisation_id uuid,user_id uuid,manager boolean,active boolean);
      create function bridge_is_active_member(o uuid) returns boolean language sql stable as $$ select exists(select 1 from public.members where organisation_id=o and user_id=auth.uid() and active) $$;
      create function email_campaign_can_send(o uuid) returns boolean language sql stable as $$ select exists(select 1 from public.members where organisation_id=o and user_id=auth.uid() and manager and active) $$;
      create table marketing_campaigns(id uuid primary key,organisation_id uuid,created_by uuid,unique(id,organisation_id));
      create table leads(lead_id uuid primary key,organisation_id uuid,assigned_agent_id uuid,assigned_user_id uuid,lead_domain text);
      create table tasks(task_id uuid primary key,organisation_id uuid,lead_id uuid,assigned_agent_id uuid,created_by uuid,title text,due_date date,status text,priority text,metadata jsonb,updated_at timestamptz default now());
      create table lead_activities(activity_id uuid primary key,organisation_id uuid,lead_id uuid,agent_id uuid,activity_type text,activity_note text,activity_date timestamptz default now(),outcome text);
      grant select on members to authenticated;
      grant select on leads,marketing_campaigns to authenticated;
      grant select,insert,update on tasks,lead_activities to authenticated;
      alter table leads enable row level security;
      create policy visible_leads on leads for select to authenticated using(bridge_is_active_member(organisation_id) and (assigned_agent_id=auth.uid() or assigned_user_id=auth.uid() or email_campaign_can_send(organisation_id)));
      alter table marketing_campaigns enable row level security;
      create policy visible_campaigns on marketing_campaigns for select to authenticated using(bridge_is_active_member(organisation_id));
      alter table tasks enable row level security;
      create policy visible_tasks on tasks for all to authenticated using(bridge_is_active_member(organisation_id) and exists(select 1 from leads l where l.lead_id=tasks.lead_id and l.organisation_id=tasks.organisation_id)) with check(bridge_is_active_member(organisation_id) and exists(select 1 from leads l where l.lead_id=tasks.lead_id and l.organisation_id=tasks.organisation_id));
      alter table lead_activities enable row level security;
      create policy visible_activities on lead_activities for all to authenticated using(bridge_is_active_member(organisation_id) and exists(select 1 from leads l where l.lead_id=lead_activities.lead_id and l.organisation_id=lead_activities.organisation_id)) with check(bridge_is_active_member(organisation_id) and exists(select 1 from leads l where l.lead_id=lead_activities.lead_id and l.organisation_id=lead_activities.organisation_id));
    `)
    for (const user of [manager,agent,colleague,suspended,outsider]) await db.query('insert into auth.users values($1)',[user])
    await db.query('insert into organisations values($1),($2)',[org,foreign])
    for (const row of [[org,manager,true,true],[org,agent,false,true],[org,colleague,false,true],[org,suspended,false,false],[foreign,outsider,true,true]]) await db.query('insert into members values($1,$2,$3,$4)',row)
    await db.query('insert into marketing_campaigns values($1,$2,$3),($4,$5,$6)',[campaign,org,manager,otherCampaign,foreign,outsider])
    for (const row of [[lead,org,agent,null,'agency'],[otherLead,org,colleague,null,'agency'],[unassigned,org,null,null,'agency'],[foreignLead,foreign,outsider,null,'agency']]) await db.query('insert into leads values($1,$2,$3,$4,$5)',row)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261025100749_campaign_enquiries_follow_up.sql',import.meta.url),'utf8'))
    const actAs = async (user, fn, role='authenticated') => { await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)",[user||'']); await db.exec(`set role ${role}`); return fn() }
    const action = (user,targetLead,type,payload,targetOrg=org,targetCampaign=campaign) => actAs(user,()=>db.query('select marketing_campaign_enquiry_action($1,$2,$3,$4,$5) id',[targetOrg,targetCampaign,targetLead,type,JSON.stringify(payload)]))
    const record = { channel:'email',respondedAt:'2026-01-01T08:00:00Z' }
    const count = async (table) => { await db.exec('reset role'); return Number((await db.query(`select count(*) n from ${table}`)).rows[0].n) }
    await t.test('owners record once; managers can record visible unassigned enquiries',async()=>{
      await action(agent,lead,'record',record)
      await action(agent,lead,'record',{...record,channel:'whatsapp'})
      assert.equal(await count('marketing_campaign_enquiries'),1)
      await action(manager,otherLead,'record',record)
      await action(manager,unassigned,'record',record)
      const visible=await actAs(agent,()=>db.query('select * from marketing_campaign_enquiries'))
      assert.equal(visible.rows.length,1)
      assert.equal(visible.rows[0].channel,'email')
    })
    await t.test('other agents, tenants, suspended members and anonymous callers are denied',async()=>{
      for (const [user,l,o,c] of [[colleague,lead,org,campaign],[agent,unassigned,org,campaign],[manager,foreignLead,org,campaign],[manager,lead,foreign,otherCampaign],[suspended,lead,org,campaign],[outsider,lead,org,campaign]]) await assert.rejects(action(user,l,'record',record,o,c),/not available/)
      const hidden=await actAs(outsider,()=>db.query('select * from marketing_campaign_enquiries'))
      assert.equal(hidden.rows.length,0)
      await assert.rejects(actAs(null,()=>db.query('select * from marketing_campaign_enquiries'),'anon'),/permission denied/)
      await assert.rejects(actAs(null,()=>db.query("select marketing_campaign_enquiry_action($1,$2,$3,'record',$4)",[org,campaign,lead,JSON.stringify(record)]),'anon'),/permission denied/)
      await assert.rejects(actAs(manager,()=>db.query('update marketing_campaign_enquiries set lead_id=$1',[foreignLead])),/permission denied/)
    })
    await t.test('follow-ups use the lead owner, retry once and complete in the shared CRM',async()=>{
      const payload={id:id(30),title:'Arrange a valuation',dueDate:'2026-10-28'}
      await action(agent,lead,'follow_up',payload); await action(agent,lead,'follow_up',payload)
      assert.equal(await count('tasks'),1); assert.equal(await count('lead_activities'),1)
      const task=(await db.query('select * from tasks')).rows[0]
      assert.equal(task.assigned_agent_id,agent)
      await action(agent,lead,'complete',{id:id(30)}); await action(agent,lead,'complete',{id:id(30)})
      assert.equal(await count('lead_activities'),2)
      assert.equal((await db.query('select status from tasks')).rows[0].status,'Completed')
      await assert.rejects(action(agent,lead,'follow_up',{...payload,title:'Changed request'}),/already used/)
      await assert.rejects(action(agent,otherLead,'complete',{id:id(30)}),/not available/)
      await action(agent,lead,'follow_up',{id:id(35),title:'Cancelled follow-up',dueDate:'2026-10-28'})
      await db.exec('reset role')
      await db.query("update tasks set status='Cancelled' where task_id=$1",[id(35)])
      await assert.rejects(action(agent,lead,'complete',{id:id(35)}),/no longer open/)
      await db.exec('reset role')
      await db.query('delete from tasks where task_id=$1',[id(35)])
      await db.query("delete from lead_activities where activity_note='Task created: Cancelled follow-up'")
    })
    await t.test('contact logs are explicit and retry-safe, with invalid dates rejected',async()=>{
      const payload={id:id(31),channel:'Call',contactedAt:'2026-01-02T10:00:00Z',note:'Valuation booked'}
      await action(agent,lead,'contact',payload);await action(agent,lead,'contact',payload)
      assert.equal(await count('lead_activities'),3)
      await assert.rejects(action(agent,lead,'contact',{...payload,note:'Different'}),/already used/)
      await assert.rejects(action(agent,lead,'contact',{...payload,id:id(32),contactedAt:'2099-01-01T10:00:00Z'}),/past contact time/)
      await assert.rejects(action(agent,lead,'record',{...record,respondedAt:'2099-01-01T10:00:00Z'}),/check constraint/)
    })
    await t.test('task and audit writes roll back together if CRM activity is denied',async()=>{
      await db.exec('reset role;revoke insert on lead_activities from authenticated')
      await assert.rejects(action(agent,lead,'follow_up',{id:id(40),title:'Must roll back',dueDate:'2026-10-29'}),/permission denied/)
      assert.equal(await count('tasks'),1)
      await db.exec('grant insert on lead_activities to authenticated')
    })
  } finally { await db.close() }
})
