import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const [home, agency, developer, homeAgent, agent, peer, principal, outsider] = Array.from({ length: 8 }, (_, i) => id(i + 1))
try {
  await db.exec(`
    create schema auth; create role anon; create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key);
    create table public.organisations(id uuid primary key, name text, type text);
    create table public.organisation_users(organisation_id uuid,user_id uuid,role text,status text);
    create function public.bridge_is_active_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organisation_users where organisation_id=org and user_id=auth.uid() and status='active')$$;
    create function public.bridge_is_org_admin(org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organisation_users where organisation_id=org and user_id=auth.uid() and status='active' and role='principal')$$;
    grant usage on schema public,auth to authenticated,anon;
    grant select on organisations to authenticated;
    insert into auth.users values('${homeAgent}'),('${agent}'),('${peer}'),('${principal}'),('${outsider}');
    insert into organisations values('${home}','Home Seekers','agency'),('${agency}','Another agency','agency'),('${developer}','Developer','developer_company');
    insert into organisation_users values('${home}','${homeAgent}','agent','active'),('${agency}','${agent}','agent','active'),('${agency}','${peer}','agent','active'),('${agency}','${principal}','principal','active'),('${developer}','${outsider}','principal','active');
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20260909103142_home_seekers_fic_training.sql', import.meta.url), 'utf8'))
  const actor = (user) => db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`)
  const save = (org, user) => db.query('insert into home_seekers_fic_training_results(organisation_id,user_id,score,total_questions) values($1,$2,5,6)', [org,user])
  await actor(homeAgent); await save(home,homeAgent)
  await actor(agent); await assert.rejects(save(agency,agent), /row-level security/)
  await db.exec('reset role')
  await db.exec(await readFile(new URL('../../supabase/migrations/20261002070559_global_agency_fic_training.sql', import.meta.url), 'utf8'))
  await actor(agent); await save(agency,agent)
  assert.equal((await db.query('select * from home_seekers_fic_training_results')).rows.length,1)
  await assert.rejects(save(agency,peer), /row-level security/)
  await assert.rejects(save(home,agent), /row-level security/)
  await assert.rejects(db.query('update home_seekers_fic_training_results set organisation_id=$1',[home]), /row-level security/)
  await actor(peer)
  assert.equal((await db.query('select * from home_seekers_fic_training_results')).rows.length,0)
  await save(agency,peer)
  await actor(principal)
  assert.equal((await db.query('select * from home_seekers_fic_training_results')).rows.length,2)
  await actor(homeAgent)
  assert.equal((await db.query('select score from home_seekers_fic_training_results')).rows[0].score,5)
  await actor(outsider)
  await assert.rejects(save(developer,outsider), /row-level security/)
  assert.equal((await db.query('select * from home_seekers_fic_training_results')).rows.length,0)
  await db.exec(`reset role;update organisation_users set status='inactive' where user_id='${agent}';`)
  await actor(agent)
  assert.equal((await db.query('select * from home_seekers_fic_training_results')).rows.length,0)
  await assert.rejects(save(agency,agent), /row-level security/)
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon;")
  await assert.rejects(db.query('select * from home_seekers_fic_training_results'), /permission denied/)
  await assert.rejects(db.query('select home_seekers_fic_training_is_enabled($1)',[agency]), /permission denied/)
  console.log('Global FIC training migration passed: existing results, agency membership, self-only writes, principal read access and tenant isolation.')
} finally { await db.close() }
