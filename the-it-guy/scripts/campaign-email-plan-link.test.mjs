import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), foreign = id(2), owner = id(3), colleague = id(4), manager = id(5), outsider = id(6)
test('quick property emails own a real retry-safe campaign without crossing channel or agency permissions', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create table organisations(id uuid primary key);
      create function bridge_is_active_member(org uuid) returns boolean language sql stable as $$select org='${org}' and auth.uid() in ('${owner}','${colleague}','${manager}')$$;
      create function email_campaign_can_send(org uuid) returns boolean language sql stable as $$select org='${org}' and auth.uid()='${manager}'$$;
      create table email_campaigns(id uuid primary key,organisation_id uuid,name text,created_by uuid,status text default 'draft',content_json jsonb,updated_at timestamptz default now(),updated_by uuid);
      create table whatsapp_campaigns(id uuid primary key,organisation_id uuid);
      create table private_listings(id uuid primary key,organisation_id uuid);
      alter table email_campaigns enable row level security;
      create policy read_email on email_campaigns for select to authenticated using(bridge_is_active_member(organisation_id));
      create policy edit_email on email_campaigns for update to authenticated using(bridge_is_active_member(organisation_id) and (created_by=auth.uid() or email_campaign_can_send(organisation_id))) with check(bridge_is_active_member(organisation_id) and (created_by=auth.uid() or email_campaign_can_send(organisation_id)));
      create function email_stamp() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
      create trigger email_stamp before update on email_campaigns for each row execute function email_stamp();
      grant select,update on email_campaigns to authenticated; grant select on whatsapp_campaigns,private_listings to authenticated;
      insert into auth.users values('${owner}'),('${colleague}'),('${manager}'),('${outsider}');
      insert into organisations values('${org}'),('${foreign}');
      insert into private_listings values('${id(20)}','${org}'),('${id(21)}','${foreign}');
    `)
    for (const name of ['20261022132550_marketing_campaign_initiatives.sql', '20261025205000_campaign_email_plan_link.sql'])
      await db.exec(readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    const login = async (user, role = 'authenticated') => {
      await db.exec('reset role')
      await db.query("select set_config('test.uid',$1,false)", [user || ''])
      await db.exec(`set role ${role}`)
    }
    const seed = async (emailId, actor = owner, agency = org, listing = id(20), extra = {}) => {
      await db.exec('reset role')
      const doc = { version: 1, blocks: [{ text: 'My manual copy' }], ai_campaign: { objective: 'new_listing', listing_id: listing }, ...extra }
      return (await db.query('insert into email_campaigns(id,organisation_id,name,created_by,content_json) values($1,$2,$3,$4,$5) returning *', [emailId, agency, 'Property launch', actor, JSON.stringify(doc)])).rows[0]
    }
    const link = async (row) => (await db.query('select marketing_campaign_ensure_email_plan($1,$2) as result', [row.id, row.updated_at])).rows[0].result
    const email = await seed(id(30))
    await login(owner)
    await t.test('creates one parent and activity, preserves manual blocks and returns the new concurrency timestamp', async () => {
      const first = await link(email)
      assert.equal(first.campaign_id, email.id)
      const saved = (await db.query('select * from email_campaigns where id=$1', [email.id])).rows[0]
      assert.deepEqual(saved.content_json.blocks, email.content_json.blocks)
      assert.equal(saved.content_json.arch9_campaign.id, email.id)
      assert.equal(new Date(first.email_updated_at).getTime(), new Date(saved.updated_at).getTime())
      await link(saved)
      assert.equal((await db.query('select count(*)::integer n from marketing_campaigns')).rows[0].n, 1)
      assert.equal((await db.query('select count(*)::integer n from marketing_campaign_activities')).rows[0].n, 1)
      await assert.rejects(link(email), /changed/)
    })
    await t.test('does not adopt a colleague draft and hides foreign agencies', async () => {
      const own = await seed(id(31))
      await login(colleague)
      await assert.rejects(link(own), /unavailable/)
      await login(outsider)
      await assert.rejects(link(own), /unavailable/)
      const foreignEmail = await seed(id(32), outsider, foreign, id(21))
      await login(owner)
      await assert.rejects(link(foreignEmail), /unavailable/)
    })
    await t.test('rejects foreign listing provenance, unknown objectives and unsaved revisions atomically', async () => {
      const wrongSource = await seed(id(33), owner, org, id(21))
      await login(owner)
      await assert.rejects(link(wrongSource), /source listing/)
      const unsupported = await seed(id(34), owner, org, id(20), { ai_campaign: { objective: 'invented', listing_id: id(20) } })
      await login(owner)
      await assert.rejects(link(unsupported), /supported property/)
      await assert.rejects(db.query('select marketing_campaign_ensure_email_plan($1,null)', [email.id]), /changed/)
      assert.equal((await db.query('select count(*)::integer n from marketing_campaigns')).rows[0].n, 1)
    })
    await t.test('reattaches a permitted pre-existing parent and preserves its prepared revision', async () => {
      await login(owner)
      const parent = (await db.query("insert into marketing_campaigns(organisation_id,name,goal,objective,planned_channels) values($1,'My broader campaign','seller_leads','Invite valuations',array['email']) returning *", [org])).rows[0]
      const prepared = await seed(id(35), owner, org, id(20), { arch9_campaign: { id: parent.id, revision: 1, audience_pending: true } })
      await login(owner)
      const result = await link(prepared)
      assert.equal(result.campaign_id, parent.id)
      assert.equal(result.reference.audience_pending, true)
      assert.equal((await db.query('select count(*)::integer n from marketing_campaigns')).rows[0].n, 2)
    })
    await t.test('rejects a forged parent and denies anonymous execution', async () => {
      await login(colleague)
      const other = (await db.query("insert into marketing_campaigns(organisation_id,name,goal,objective,planned_channels) values($1,'Colleague campaign','seller_leads','Invite valuations',array['email']) returning *", [org])).rows[0]
      const forged = await seed(id(36), owner, org, id(20), { arch9_campaign: { id: other.id, revision: 1 } })
      await login(owner)
      await assert.rejects(link(forged), /referenced campaign/)
      assert.equal((await db.query('select count(*)::integer n from marketing_campaign_activities where email_campaign_id=$1', [forged.id])).rows[0].n, 0)
      await login(null, 'anon')
      await assert.rejects(link(email), /permission denied/)
    })
  } finally { await db.close() }
})
