import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const org = '10000000-0000-4000-8000-000000000001'
const otherOrg = '10000000-0000-4000-8000-000000000002'
const lead = '20000000-0000-4000-8000-000000000001'
const agent = '30000000-0000-4000-8000-000000000001'
const otherAgent = '30000000-0000-4000-8000-000000000002'
let db
const migration = readFileSync(new URL('../../../../supabase/migrations/20261006072627_lead_appointment_history_reader.sql', import.meta.url), 'utf8')
const calendarMigration = readFileSync(new URL('../../../../supabase/migrations/202605210001_agent_calendar_visibility_rpc.sql', import.meta.url), 'utf8')
async function read(user = agent, active = true, organisation = org) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, org: organisation, active })])
  return (await db.query('select public.bridge_list_lead_appointments($1,$2,false) as rows', [organisation, lead])).rows[0].rows
}
beforeAll(async () => {
  db = new PGlite()
  const columns = calendarMigration.match(/returns table \(([\s\S]*?)\)\nlanguage sql/)[1]
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function public.bridge_is_active_member(target uuid) returns boolean language sql stable as $$ select (auth.jwt()->>'active')::boolean and (auth.jwt()->>'org')::uuid = target $$;
    create function public.bridge_membership_role(target uuid) returns text language sql stable as $$ select 'agent'::text $$;
    create table public.profiles(id uuid, role text);
    create table public.appointments(${columns});
    create table public.appointment_participants(appointment_id uuid, organisation_id uuid, user_id uuid, email text, participant_role text);
    create table public.leads(lead_id uuid, organisation_id uuid, assigned_agent_id uuid);
  `)
  await db.exec(calendarMigration)
  await db.exec(migration)
  await db.query('insert into leads values ($1,$2,$3)', [lead, org, agent])
  const fixtures = [
    [1, org, lead, otherAgent, null, null, '2027-10-01T09:40:00Z'],
    [2, org, lead, otherAgent, null, null, '2025-10-01T09:40:00Z'],
    [3, org, null, agent, 'lead', lead, '2027-10-01T09:39:00Z'],
    [4, org, null, agent, 'transaction', lead, '2027-10-01T09:41:00Z'],
    [5, otherOrg, lead, agent, null, null, '2027-10-01T09:42:00Z'],
  ]
  for (const [id, organisation, leadId, assigned, relatedType, relatedId, date] of fixtures) {
    await db.query('insert into appointments(appointment_id,organisation_id,lead_id,agent_id,related_entity_type,related_entity_id,date_time) values($1,$2,$3,$4,$5,$6,$7)', [`40000000-0000-4000-8000-${String(id).padStart(12,'0')}`, organisation, leadId, assigned, relatedType, relatedId, date])
  }
  await db.exec('set role authenticated')
}, 30000)
afterAll(async () => { await db?.close() })
describe('lead history through the actual calendar permission reader', () => {
  it('includes past and far future bookings, even when the lead owner is not the booked agent', async () => {
    const rows = await read()
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.date_time.slice(0,10))).toEqual(['2025-10-01','2027-10-01','2027-10-01'])
    expect(rows.every(row => row.organisation_id === org)).toBe(true)
  })
  it('does not match a transaction merely because its ID equals the lead ID', async () => {
    expect((await read()).some(row => row.related_entity_type === 'transaction')).toBe(false)
  })
  it('retains the calendar reader access boundary for other agents and inactive members', async () => {
    expect(await read(otherAgent)).toHaveLength(2)
    expect(await read(agent, false)).toEqual([])
    expect(await read(agent, true, otherOrg)).toHaveLength(1)
  })
  it('denies anonymous execution', async () => {
    const result = await db.query("select has_function_privilege('anon', 'public.bridge_list_lead_appointments(uuid,uuid,boolean)', 'EXECUTE') as allowed")
    expect(result.rows[0].allowed).toBe(false)
  })
})
