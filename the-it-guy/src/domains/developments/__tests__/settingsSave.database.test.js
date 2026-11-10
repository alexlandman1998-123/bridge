// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

const dev = '20000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const actor = '30000000-0000-4000-8000-000000000001'
const replacement = [{ role_type: 'agent', participant_name: 'Replacement', participant_email: 'agent@example.test' }]
const patch = { client_portal_enabled: false, stakeholder_teams: { agents: [{ name: 'Replacement', email: 'agent@example.test' }] } }
let db
beforeAll(async () => {
  db = new PGlite()
  const schema = readFileSync(new URL('../../../../sql/schema.sql', import.meta.url), 'utf8')
  const settingsDdl = schema.match(/create table if not exists development_settings \([\s\S]*?\n\);/)[0]
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create table developments(id uuid primary key, organisation_id uuid);
    ${settingsDdl}
    create table development_participants(
      id uuid primary key default gen_random_uuid(), development_id uuid references developments(id), user_id uuid,
      role_type text, participant_name text, participant_email text, organisation_name text,
      is_primary boolean, can_view boolean, can_create_transactions boolean, assignment_source text, is_active boolean
    );
    create function bridge_can_manage_development_record(target_development_id uuid) returns boolean
    language sql stable security invoker set search_path = '' as $$
      select exists(select 1 from public.developments where id = target_development_id and organisation_id = auth.uid())
    $$;
    grant usage on schema auth to authenticated;
    grant select, update on developments to authenticated;
    grant select, insert, update on development_settings to authenticated;
    grant select, insert, delete on development_participants to authenticated;
    alter table developments enable row level security;
    alter table development_settings enable row level security;
    alter table development_participants enable row level security;
    create policy visible_developments on developments to authenticated using (organisation_id = auth.uid()) with check (organisation_id = auth.uid());
    create policy visible_settings on development_settings for select to authenticated using (bridge_can_manage_development_record(development_id));
    create policy insert_settings on development_settings for insert to authenticated with check (bridge_can_manage_development_record(development_id));
    create policy update_settings on development_settings for update to authenticated
      using (bridge_can_manage_development_record(development_id) and current_setting('test.deny_settings',true) <> 'yes')
      with check (bridge_can_manage_development_record(development_id));
    create policy visible_participants on development_participants for select to authenticated using (bridge_can_manage_development_record(development_id));
    create policy delete_participants on development_participants for delete to authenticated
      using (bridge_can_manage_development_record(development_id) and current_setting('test.deny_delete',true) <> 'yes');
    create policy insert_participants on development_participants for insert to authenticated
      with check (bridge_can_manage_development_record(development_id) and participant_name <> 'Rejected');
    create function ignore_assignment() returns trigger language plpgsql as $$ begin
      if new.participant_name = 'Ignored' then return null; end if; return new; end $$;
    create trigger ignore_assignment before insert on development_participants for each row execute function ignore_assignment();
  `)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261109184103_development_settings_atomic_save.sql', import.meta.url), 'utf8'))
}, 30_000)
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`reset role; set test.deny_settings = 'no'; set test.deny_delete = 'no'; truncate development_settings, development_participants, developments;`)
  await db.query('insert into developments values ($1,$2),($3,$3)', [dev, actor, other])
  await db.query(`insert into development_settings(development_id, client_portal_enabled, reservation_deposit_amount, reservation_deposit_payment_details, stakeholder_teams)
    values ($1,true,1234,'{"account_number":"fixture-only"}', '{"agents":[{"name":"Original"}]}')`, [dev])
  await db.query(`insert into development_participants(development_id,role_type,participant_name,assignment_source) values
    ($1,'agent','Original','development_default'),($1,'attorney','Manual attorney','manual'),($1,'buyer','Other role','development_default'),($2,'agent','Other development','development_default')`, [dev, other])
  await db.query("select set_config('test.actor',$1,false)", [actor])
  await db.exec('set role authenticated;')
})
async function save(settings = patch, participants = replacement, developmentId = dev) {
  return (await db.query('select bridge_save_development_settings($1,$2::jsonb,$3::jsonb) as receipt', [developmentId, settings === null ? null : JSON.stringify(settings), JSON.stringify(participants)])).rows[0].receipt
}
async function snapshot() {
  await db.exec('reset role;')
  const settings = (await db.query('select * from development_settings order by development_id')).rows
  const participants = (await db.query('select * from development_participants order by id')).rows
  await db.exec('set role authenticated;')
  return { settings, participants }
}

it('commits settings and default assignments while preserving manual assignments, other roles and unrelated settings', async () => {
  const receipt = await save()
  expect(receipt.development_id).toBe(dev)
  expect(receipt.participants_saved).toBe(1)
  expect(receipt.settings.client_portal_enabled).toBe(false)
  expect(receipt.settings.reservation_deposit_amount).toBe(1234)
  expect(receipt.settings.reservation_deposit_payment_details).toEqual({ account_number: 'fixture-only' })
  const { participants } = await snapshot()
  expect(participants.map(p => p.participant_name).sort()).toEqual(['Manual attorney','Other development','Other role','Replacement'])
  expect(participants.find(p => p.participant_name === 'Replacement')).toMatchObject({ development_id: dev, role_type: 'agent', can_create_transactions: true, assignment_source: 'development_default' })
})

it('rolls back the settings and deletion when a replacement insert is denied by RLS', async () => {
  const before = await snapshot()
  await expect(save(patch, [...replacement, { role_type: 'attorney', participant_name: 'Rejected' }])).rejects.toMatchObject({ code: '42501' })
  expect(await snapshot()).toEqual(before)
})

it('rolls back all writes when an insert trigger skips a replacement row', async () => {
  const before = await snapshot()
  await expect(save(patch, [...replacement, { role_type: 'attorney', participant_name: 'Ignored' }])).rejects.toThrow('could not be confirmed')
  expect(await snapshot()).toEqual(before)
})

it('rejects a silent zero-row delete and rolls back the settings', async () => {
  const before = await snapshot()
  await db.exec("set test.deny_delete = 'yes';")
  await expect(save()).rejects.toThrow('could not be replaced')
  expect(await snapshot()).toEqual(before)
})

it('keeps existing settings and participants when settings are denied', async () => {
  const before = await snapshot()
  await db.exec("set test.deny_settings = 'yes';")
  await expect(save()).rejects.toMatchObject({ code: '42501' })
  expect(await snapshot()).toEqual(before)
})

it('can intentionally clear managed defaults without clearing manual assignments', async () => {
  await save(patch, [])
  expect((await snapshot()).participants.map(p => p.participant_name).sort()).toEqual(['Manual attorney','Other development','Other role'])
})

it('uses database defaults for first settings saves', async () => {
  await db.exec('reset role; delete from development_settings; set role authenticated;')
  const receipt = await save()
  expect(receipt.settings.client_portal_enabled).toBe(false)
  expect(receipt.settings.snag_reporting_enabled).toBe(true)
  expect(receipt.settings.enabled_modules.agent).toBe(true)
})

it('supports participant-only synchronization without modifying settings', async () => {
  const before = await snapshot()
  const receipt = await save(null)
  expect(receipt.settings).toBeNull()
  expect((await snapshot()).settings).toEqual(before.settings)
})

it('prevents an authenticated user from saving another development', async () => {
  const before = await snapshot()
  await expect(save(patch, replacement, other)).rejects.toMatchObject({ code: '42501' })
  expect(await snapshot()).toEqual(before)
})

it('rejects invalid roles and settings fields before changing anything', async () => {
  const before = await snapshot()
  await expect(save(patch, [{ role_type: 'admin' }])).rejects.toMatchObject({ code: '22023' })
  await expect(save({ organisation_id: other })).rejects.toMatchObject({ code: '22023' })
  await expect(save({ development_id: other })).rejects.toMatchObject({ code: '22023' })
  expect(await snapshot()).toEqual(before)
})

it('does not accept participant-supplied development identity or assignment privileges', async () => {
  await save(patch, [{ ...replacement[0], development_id: other, can_create_transactions: false, assignment_source: 'manual' }])
  const saved = (await snapshot()).participants.find(p => p.participant_name === 'Replacement')
  expect(saved).toMatchObject({ development_id: dev, can_create_transactions: true, assignment_source: 'development_default' })
})

it('runs with caller permissions and denies anonymous and signed-out execution', async () => {
  await db.exec('reset role;')
  const security = (await db.query(`select prosecdef, proconfig,
    has_function_privilege('anon','bridge_save_development_settings(uuid,jsonb,jsonb)','EXECUTE') as anon_allowed
    from pg_proc where proname = 'bridge_save_development_settings'`)).rows[0]
  expect(security.prosecdef).toBe(false)
  expect(security.proconfig).toEqual(['search_path=""'])
  expect(security.anon_allowed).toBe(false)
  await db.exec('set role anon;')
  await expect(save()).rejects.toMatchObject({ code: '42501' })
  await db.exec("reset role; set test.actor = ''; set role authenticated;")
  await expect(save()).rejects.toMatchObject({ code: '42501' })
})

it('rolls back first-save settings creation when its team replacement fails', async () => {
  await db.exec('reset role; delete from development_settings; set role authenticated;')
  const before = await snapshot()
  await expect(save(patch, [...replacement, { role_type: 'attorney', participant_name: 'Rejected' }])).rejects.toMatchObject({ code: '42501' })
  expect(await snapshot()).toEqual(before)
})
