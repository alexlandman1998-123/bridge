import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('seller lead linking is atomic, scoped, idempotent and preserves saved seller facts', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table private_listings(id uuid primary key, organisation_id uuid, assigned_agent_id uuid,
        seller_lead_id text, originating_crm_lead_id text, listing_category text, seller_type text,
        updated_at timestamptz, seller_facts jsonb, documents jsonb);
      create table contacts(contact_id uuid primary key, organisation_id uuid);
      create table leads(lead_id uuid primary key, organisation_id uuid, assigned_agent_id uuid,
        contact_id uuid, lead_category text, lead_domain text, listing_id uuid, enquired_listing_id uuid,
        updated_at timestamptz, stage text, seller_onboarding_token text);
      create function bridge_can_access_private_listing(p_id uuid) returns boolean language sql security definer set search_path=public
        as $$select exists(select 1 from private_listings where id=p_id and assigned_agent_id=auth.uid())$$;
      grant execute on function bridge_can_access_private_listing(uuid) to authenticated;
      grant select, update on private_listings, leads to authenticated;
      grant select on contacts to authenticated;
      alter table private_listings enable row level security;
      alter table leads enable row level security;
      alter table contacts enable row level security;
      create policy listing_select on private_listings for select to authenticated using(assigned_agent_id=auth.uid());
      create policy listing_update on private_listings for update to authenticated using(assigned_agent_id=auth.uid()) with check(assigned_agent_id=auth.uid());
      create policy lead_select on leads for select to authenticated using(assigned_agent_id=auth.uid());
      create policy lead_update on leads for update to authenticated using(assigned_agent_id=auth.uid()) with check(assigned_agent_id=auth.uid());
      create policy contact_select on contacts for select to authenticated using(organisation_id='${id(2)}');
      insert into private_listings values('${id(1)}','${id(2)}','${id(3)}',null,null,'sale','individual',null,'{"name":"Saved Owner"}','["signed-mandate"]');
      insert into contacts values('${id(4)}','${id(2)}');
      insert into leads values('${id(5)}','${id(2)}','${id(3)}','${id(4)}','seller','agency',null,null,null,'Mandate Signed','saved-token');
    `)
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261010223242_listing_link_existing_seller_lead.sql', import.meta.url), 'utf8'))
    const actor = n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
    const link = (lead = 5, org = 2) => db.query('select bridge_link_listing_seller_lead($1,$2,$3) as receipt', [id(1), id(lead), id(org)])
    await actor(null)
    await assert.rejects(link(), /access to link/)
    await actor(9); await db.exec('set role authenticated')
    await assert.rejects(link(), /access to link/)
    await actor(3)
    await assert.rejects(link(5, 9), /could not be found/)
    await db.exec('reset role')
    await db.exec(`insert into leads values('${id(6)}','${id(9)}','${id(3)}','${id(4)}','seller','agency',null,null,null,'New',null);
      insert into leads values('${id(7)}','${id(2)}','${id(3)}','${id(4)}','buyer','agency',null,null,null,'New',null);`)
    await db.exec('set role authenticated')
    await assert.rejects(link(6), /accessible seller lead/)
    await assert.rejects(link(7), /accessible seller lead/)

    // RLS rejects a lead the actor cannot update before it can be attached.
    await db.exec('reset role; drop policy lead_update on leads; create policy lead_update on leads for update to authenticated using(false) with check(false); set role authenticated')
    await assert.rejects(link(), /accessible seller lead/)
    assert.equal((await db.query('select seller_lead_id from private_listings')).rows[0].seller_lead_id, null)
    await db.exec('reset role; drop policy lead_update on leads; create policy lead_update on leads for update to authenticated using(assigned_agent_id=auth.uid()) with check(assigned_agent_id=auth.uid()); set role authenticated')
    // If the second write fails, the first write rolls back in the same call.
    await db.exec(`reset role; create function reject_lead_link() returns trigger language plpgsql as $$begin raise exception 'Lead write rejected'; end$$;
      create trigger reject_lead_link before update on leads for each row execute function reject_lead_link(); set role authenticated`)
    await assert.rejects(link(), /Lead write rejected/)
    assert.equal((await db.query('select seller_lead_id from private_listings')).rows[0].seller_lead_id, null)
    await db.exec('reset role; drop trigger reject_lead_link on leads; set role authenticated')
    const receipt = (await link()).rows[0].receipt
    assert.equal(receipt.sellerLeadId, id(5))
    const saved = (await db.query('select * from private_listings')).rows[0]
    assert.equal(saved.seller_lead_id, id(5)); assert.equal(saved.originating_crm_lead_id, id(5))
    assert.deepEqual(saved.seller_facts, { name: 'Saved Owner' }); assert.deepEqual(saved.documents, ['signed-mandate'])
    const lead = (await db.query('select * from leads where lead_id=$1', [id(5)])).rows[0]
    assert.equal(lead.listing_id, id(1)); assert.equal(lead.enquired_listing_id, id(1))
    assert.equal(lead.stage, 'Mandate Signed'); assert.equal(lead.seller_onboarding_token, 'saved-token')
    assert.deepEqual((await link()).rows[0].receipt, receipt)
    assert.deepEqual((await db.query('select updated_at from private_listings')).rows[0].updated_at, saved.updated_at)
    await assert.rejects(link(7), /different seller lead/)

    // A result picked earlier cannot steal a lead that was linked meanwhile.
    await db.exec('reset role')
    await db.query('update private_listings set seller_lead_id=null, originating_crm_lead_id=null')
    await db.query('update leads set listing_id=$1 where lead_id=$2', [id(8), id(5)])
    await db.exec('set role authenticated')
    await assert.rejects(link(), /already linked to another listing/)
    assert.equal((await db.query('select seller_lead_id from private_listings')).rows[0].seller_lead_id, null)
    await db.exec('reset role')
    await db.query('update leads set listing_id=null,enquired_listing_id=null where lead_id=$1', [id(5)])
    await db.exec(`insert into private_listings values('${id(8)}','${id(2)}','${id(3)}','${id(5)}',null,'sale','individual',null,null,null); set role authenticated`)
    await assert.rejects(link(), /already linked to another listing/)
    await db.exec('reset role')
    await db.query('delete from private_listings where id=$1', [id(8)])
    await db.query('update leads set lead_category=$1,listing_id=$2 where lead_id=$3', ['seller', id(1), id(7)])
    await db.exec('set role authenticated')
    await assert.rejects(link(), /Another seller lead/)
    await db.exec('reset role; set role anon')
    await assert.rejects(link(), /permission denied for function/)
  } finally { await db.close() }
})
