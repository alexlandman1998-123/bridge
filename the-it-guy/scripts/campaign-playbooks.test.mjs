import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1), foreign=id(2), owner=id(3), colleague=id(4), manager=id(5), outsider=id(6)
const book={version:1,sourceRevision:2,response:{kind:'reply',value:'',label:'Request a valuation'},steps:[{id:id(10),channel:'email',day:0,title:'Know your home’s value',body:'A helpful valuation. {response}'},{id:id(11),channel:'email',day:7,title:'Following up',body:'Still planning a move? {response}'}],followUp:[{id:id(12),title:'Call {contact}',days:1}]}
test('campaign playbooks inherit campaign/template permissions and save atomically',async(t)=>{
  const db=new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create table organisations(id uuid primary key);
      create function bridge_is_active_member(org uuid) returns boolean language sql stable as $$select org='${org}' and auth.uid() in ('${owner}','${colleague}','${manager}')$$;
      create function email_campaign_can_send(org uuid) returns boolean language sql stable as $$select org='${org}' and auth.uid()='${manager}'$$;
      create table email_campaigns(id uuid primary key,organisation_id uuid);
      create table whatsapp_campaigns(id uuid primary key,organisation_id uuid);
      grant select on email_campaigns,whatsapp_campaigns to authenticated;
      insert into auth.users values('${owner}'),('${colleague}'),('${manager}'),('${outsider}');
      insert into organisations values('${org}'),('${foreign}');
    `)
    for(const file of ['20261022132550_marketing_campaign_initiatives.sql','20261023111430_marketing_campaign_templates.sql','20261025104933_campaign_playbooks.sql']) await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
    const login=async(user,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[user||'']);await db.exec(`set role ${role}`)}
    await login(owner)
    const campaign=(await db.query("insert into marketing_campaigns(organisation_id,name,goal,objective,planned_channels) values($1,'Seller valuations','seller_leads','Book valuations',array['email','whatsapp']) returning *",[org])).rows[0]
    const write=async(doc,revision=2)=>db.query('update marketing_campaigns set playbook=$1,revision=$2 where id=$3 returning *',[JSON.stringify(doc),revision,campaign.id])
    await t.test('saves a complete playbook in one versioned campaign write without channel activity',async()=>{
      const row=(await write(book)).rows[0]
      assert.equal(row.revision,2);assert.equal(row.playbook.steps.length,2)
      assert.equal((await db.query('select count(*)::integer n from marketing_campaign_activities')).rows[0].n,0)
      assert.equal((await db.query('select count(*)::integer n from email_campaigns')).rows[0].n,0)
      await assert.rejects(write(book,2),/Reload/)
    })
    await t.test('rejects invalid channels, destination protocols, excess steps, metadata and duplicate action IDs',async()=>{
      const bad=[{...book,version:'1'},{...book,steps:[]},{...book,steps:[{...book.steps[0],channel:'sms'}]},{...book,steps:[{...book.steps[0],day:-1}]},{...book,steps:[{...book.steps[0],day:366}]},{...book,steps:[{...book.steps[0],body:''}]},{...book,steps:[book.steps[0],book.steps[0]]},{...book,recipientIds:[id(99)]},{...book,response:{kind:'url',value:'javascript:alert(1)',label:'Reply'}},{...book,response:{kind:'url',value:'https://user:pass@example.test',label:'Reply'}},{...book,followUp:[{...book.followUp[0],days:366}]},{...book,steps:Array.from({length:13},(_,i)=>({...book.steps[0],id:id(100+i)}))}]
      for(const doc of bad) await assert.rejects(write(doc,3),/check constraint/)
      assert.equal((await db.query('select revision from marketing_campaigns where id=$1',[campaign.id])).rows[0].revision,2)
      await assert.rejects(db.query("update marketing_campaigns set name='Must roll back',playbook=$1,revision=3 where id=$2",[JSON.stringify({...book,steps:[]}),campaign.id]),/check constraint/)
      assert.equal((await db.query('select name from marketing_campaigns where id=$1',[campaign.id])).rows[0].name,'Seller valuations')
    })
    await t.test('viewers can read but only owners/managers may update the campaign playbook',async()=>{
      await login(colleague)
      assert.equal((await db.query('select playbook from marketing_campaigns')).rows.length,1)
      assert.equal((await write(book,3)).rows.length,0)
      await login(manager)
      assert.equal((await write(book,3)).rows[0].revision,3)
      await login(outsider)
      assert.equal((await db.query('select playbook from marketing_campaigns')).rows.length,0)
      assert.equal((await write(book,4)).rows.length,0)
      await login(null,'anon')
      await assert.rejects(db.query('select playbook from marketing_campaigns'),/permission denied/)
    })
    await t.test('personal/agency template reuse keeps existing privacy and revision rules',async()=>{
      await login(owner)
      const template=(await db.query("insert into marketing_campaign_templates(organisation_id,name,goal,objective,planned_channels,run_mode,duration_days,playbook) values($1,'Valuation playbook','seller_leads','Book valuations',array['email'],'bounded',14,$2) returning *",[org,JSON.stringify(book)])).rows[0]
      await login(colleague)
      assert.equal((await db.query('select * from marketing_campaign_templates')).rows.length,0)
      await login(owner)
      await assert.rejects(db.query("update marketing_campaign_templates set planned_channels=array['whatsapp'],revision=2 where id=$1",[template.id]),/check constraint/)
      await assert.rejects(db.query('update marketing_campaigns set organisation_id=$1 where id=$2',[foreign,campaign.id]),/permission denied/)
      await login(manager)
      const shared=(await db.query("insert into marketing_campaign_templates(organisation_id,name,goal,objective,planned_channels,run_mode,duration_days,visibility,playbook) values($1,'Agency playbook','seller_leads','Book valuations',array['email'],'bounded',14,'agency',$2) returning *",[org,JSON.stringify(book)])).rows[0]
      await login(colleague)
      assert.equal((await db.query('select * from marketing_campaign_templates')).rows.length,1)
      assert.equal((await db.query('update marketing_campaign_templates set playbook=$1,revision=2 where id=$2 returning id',[JSON.stringify(book),shared.id])).rows.length,0)
    })
  } finally { await db.close() }
})
