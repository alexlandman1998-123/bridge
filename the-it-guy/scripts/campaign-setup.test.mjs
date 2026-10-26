import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { cleanCampaignSetup, metaCampaignObjective } from '../src/services/campaignSetupModel.js'

test('preserves exact provider objectives and validates structured setup', () => {
  const setup = cleanCampaignSetup({ metaObjective: 'OUTCOME_TRAFFIC', target: '30 listing visits', customGoal: 'Grow rental demand', placeId: 'google-region' })
  assert.equal(metaCampaignObjective({ campaign_setup: setup }), 'OUTCOME_TRAFFIC')
  assert.equal(setup.target, '30 listing visits')
  assert.throws(() => cleanCampaignSetup({ metaObjective: 'LEAD_GENERATION' }))
  assert.throws(() => cleanCampaignSetup({ audienceId: 'not-a-uuid' }))
  assert.throws(() => cleanCampaignSetup({ target: 'x'.repeat(241) }))
  assert.throws(() => metaCampaignObjective({ objective: 'Leads' }))
})

test('saves audience association atomically and preserves tenant RLS', async () => {
  const db = new PGlite()
  const org = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  const audience = '00000000-0000-4000-8000-000000000003'
  const foreignAudience = '00000000-0000-4000-8000-000000000004'
  const campaign = '00000000-0000-4000-8000-000000000005'
  try {
    await db.exec(`
      create role authenticated; create role anon; create role service_role;
      create table marketing_campaigns(id uuid primary key, organisation_id uuid not null, copied_from_id uuid);
      create table marketing_campaign_templates(id uuid primary key);
      create table marketing_audiences(id uuid primary key, organisation_id uuid not null, unique(id,organisation_id));
      create table marketing_campaign_audiences(campaign_id uuid primary key references marketing_campaigns(id), organisation_id uuid not null, audience_id uuid not null, updated_at timestamptz default now(), foreign key(audience_id,organisation_id) references marketing_audiences(id,organisation_id));
      insert into marketing_audiences values('${audience}','${org}'),('${foreignAudience}','${other}');
      alter table marketing_campaign_audiences enable row level security;
      create policy tenant_link on marketing_campaign_audiences for all to authenticated using(organisation_id=current_setting('test.org')::uuid) with check(organisation_id=current_setting('test.org')::uuid);
      grant usage on schema public to authenticated;
      grant select,insert,update on marketing_campaigns to authenticated;
      grant select,insert,update,delete on marketing_campaign_audiences to authenticated;
    `)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261025190045_campaign_setup_objectives.sql', import.meta.url), 'utf8'))
    await db.exec(`set role authenticated; set test.org='${org}';`)
    await db.query('insert into marketing_campaigns(id,organisation_id,campaign_setup) values($1,$2,$3)', [campaign,org,{ metaObjective: 'OUTCOME_LEADS', audienceId: audience }])
    assert.equal((await db.query('select audience_id from marketing_campaign_audiences')).rows[0].audience_id,audience)
    const copied = '00000000-0000-4000-8000-000000000007'
    await db.query('insert into marketing_campaigns(id,organisation_id,copied_from_id) values($1,$2,$3)',[copied,org,campaign])
    const copiedSetup = (await db.query('select campaign_setup from marketing_campaigns where id=$1',[copied])).rows[0].campaign_setup
    assert.equal(copiedSetup.metaObjective,'OUTCOME_LEADS')
    assert.equal(copiedSetup.audienceId,undefined)
    await assert.rejects(db.query('update marketing_campaigns set campaign_setup=$1 where id=$2',[{ metaObjective:'INVALID' },campaign]),/check constraint/)
    await assert.rejects(db.query('update marketing_campaigns set campaign_setup=$1 where id=$2',[{ metaObjective:'OUTCOME_LEADS',audienceId:foreignAudience },campaign]),/foreign key/)
    assert.equal((await db.query('select campaign_setup from marketing_campaigns where id=$1',[campaign])).rows[0].campaign_setup.audienceId,audience)
    const second = '00000000-0000-4000-8000-000000000006'
    await assert.rejects(db.query('insert into marketing_campaigns(id,organisation_id,campaign_setup) values($1,$2,$3)',[second,other,{ audienceId:foreignAudience }]),/row-level security/)
    assert.equal((await db.query('select count(*)::int as n from marketing_campaigns where id=$1',[second])).rows[0].n,0)
    await db.query('update marketing_campaigns set campaign_setup=$1 where id=$2',[{ metaObjective:'OUTCOME_LEADS', audienceId:'' },campaign])
    assert.equal((await db.query('select count(*)::int as n from marketing_campaign_audiences')).rows[0].n,0)
    await db.exec('reset role')
    assert.equal((await db.query("select has_function_privilege('anon','marketing_campaign_setup_audience_sync()','execute') as allowed")).rows[0].allowed,false)
  } finally { await db.close() }
})
