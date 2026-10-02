import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite(),
  id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const [
  org,
  otherOrg,
  branch,
  otherBranch,
  owner,
  agent,
  peer,
  outsider,
  manager,
] = Array.from({ length: 9 }, (_, i) => id(i + 1))
const siblingBranch = id(10)
try {
  await db.exec(`create schema auth;create schema storage;create role anon;create role authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
create table auth.users(id uuid primary key);create table organisations(id uuid primary key);create table organisation_branches(id uuid primary key,organisation_id uuid);
grant select on organisations to authenticated;
create table organisation_users(organisation_id uuid,user_id uuid,branch_id uuid,primary_branch_id uuid,workspace_role text,organization_role text,organisation_role text,role text,membership_status text,status text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;create policy legacy_storage_permissive on storage.objects for all to authenticated using(true) with check(true);
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
insert into auth.users values('${owner}'),('${agent}'),('${peer}'),('${outsider}'),('${manager}');insert into organisations values('${org}'),('${otherOrg}');insert into organisation_branches values('${branch}','${org}'),('${otherBranch}','${otherOrg}'),('${siblingBranch}','${org}');
insert into organisation_users(organisation_id,user_id,branch_id,role,status) values('${org}','${owner}',null,'owner','active'),('${org}','${agent}','${branch}','agent','active'),('${org}','${peer}','${branch}','agent','active'),('${otherOrg}','${outsider}','${otherBranch}','owner','active'),('${org}','${manager}','${branch}','branch_manager','active');`)
  await db.exec(
    await readFile(
      new URL(
        '../../supabase/migrations/20261001202026_branch_fic_training_compliance.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  const actor = async (user) =>
    db.exec(
      `reset role;select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`,
    )
  const q = (sql, args = []) => db.query(sql, args)
  await actor(agent)
  await assert.rejects(
    q('select fic_submit_assessment($1,$2,array[1,0,2,1,0,2])', [org, branch]),
    /Complete all lessons/,
  )
  await assert.rejects(
    q('select fic_save_lesson($1,$2,6)', [org, branch]),
    /Invalid lesson/,
  )
  await assert.rejects(
    q('select fic_save_lesson($1,$2,0)', [otherOrg, otherBranch]),
    /denied/,
  )
  for (let i = 0; i < 6; i++)
    await q('select fic_save_lesson($1,$2,$3)', [org, branch, i])
  await q('select fic_save_lesson($1,$2,0)', [org, branch])
  assert.equal(
    (await q('select * from branch_fic_training_progress')).rows[0]
      .completed_lessons.length,
    6,
  )
  await assert.rejects(
    q(
      "insert into branch_fic_training_attempts(organisation_id,branch_id,user_id,course_version,answers,score,passed) values($1,$2,$3,'2026.10',array[0],6,true)",
      [org, branch, agent],
    ),
    /permission denied/,
  )
  await assert.rejects(
    q('select fic_submit_assessment($1,$2,array[1,0,2,1,0])', [org, branch]),
    /six questions/,
  )
  let r = (
    await q('select fic_submit_assessment($1,$2,array[0,0,0,0,0,0]) result', [
      org,
      branch,
    ])
  ).rows[0].result
  assert.equal(r.passed, false)
  assert.equal(r.score, 2)
  r = (
    await q('select fic_submit_assessment($1,$2,array[1,0,2,1,0,2]) result', [
      org,
      branch,
    ])
  ).rows[0].result
  assert.equal(r.passed, true)
  assert.equal(r.score, 6)
  assert.equal(
    (await q('select * from branch_fic_training_attempts')).rows.length,
    2,
  )
  await assert.rejects(
    q('select fic_assign_branch_training($1,$2,null)', [org, branch]),
    /denied/,
  )
  await actor(manager)
  await assert.rejects(q('select fic_assign_branch_training($1,$2,null)', [org, siblingBranch]), /denied/)
  await assert.rejects(q('select fic_save_lesson($1,$2,0)', [org, siblingBranch]), /denied/)
  await q("select fic_assign_branch_training($1,$2,'2026-11-01')", [
    org,
    branch,
  ])
  assert.equal(
    (await q('select * from branch_fic_training_progress')).rows.length,
    3,
  )
  await assert.rejects(
    q('select fic_assign_branch_training($1,$2,null)', [otherOrg, otherBranch]),
    /denied/,
  )
  await actor(peer)
  assert.equal(
    (await q('select * from branch_fic_training_progress')).rows.length,
    1,
  )
  assert.equal(
    (await q('select * from branch_fic_training_attempts')).rows.length,
    0,
  )
  await actor(outsider)
  assert.equal(
    (await q('select * from branch_fic_training_progress')).rows.length,
    0,
  )
  await db.exec(
    `reset role;update organisation_users set status='suspended' where user_id='${agent}';`,
  )
  await actor(agent)
  await assert.rejects(
    q('select fic_save_lesson($1,$2,0)', [org, branch]),
    /denied/,
  )
  await db.exec(
    `reset role;update organisation_users set status='accepted' where user_id='${agent}';`,
  )
  await actor(owner)
  const path = `organisations/${org}/rmcp.pdf`
  await q(
    "insert into storage.objects(bucket_id,name) values('fic-compliance',$1)",
    [path],
  )
  const publish = async (v) =>
    (
      await q(
        "select fic_publish_policy($1,$2,'RMCP','Compliance officer',$3) id",
        [org, v, path],
      )
    ).rows[0].id
  const policy = await publish('1.0')
  assert.equal(
    (await q("update storage.objects set name='overwritten' returning *")).rows
      .length,
    0,
  )
  assert.equal(
    (await q('delete from storage.objects returning *')).rows.length,
    0,
  )
  await actor(agent)
  await q('select fic_acknowledge_policy($1,$2,$3)', [org, branch, policy])
  await q('select fic_acknowledge_policy($1,$2,$3)', [org, branch, policy])
  assert.equal(
    (await q('select * from branch_fic_policy_acknowledgements')).rows.length,
    1,
  )
  await assert.rejects(
    q("select fic_publish_policy($1,'2.0','RMCP','Agent',$2)", [org, path]),
    /denied/,
  )
  await actor(owner)
  const newer = await publish('2.0')
  await assert.rejects(publish('2.0'), /duplicate key/)
  assert.equal(
    (await q('select * from organisation_fic_policies where is_current'))
      .rows[0].id,
    newer,
  )
  await actor(agent)
  await assert.rejects(
    q('select fic_acknowledge_policy($1,$2,$3)', [org, branch, policy]),
    /version changed/,
  )
  assert.equal(
    (await q('select * from branch_fic_policy_acknowledgements')).rows[0]
      .policy_id,
    policy,
  )
  assert.equal((await q('select * from storage.objects')).rows.length, 1)
  await actor(outsider)
  assert.equal(
    (await q('select * from organisation_fic_policies')).rows.length,
    0,
  )
  assert.equal((await q('select * from storage.objects')).rows.length, 0)
  await db.exec(
    "reset role;select set_config('request.jwt.claim.sub','',false);set role anon;",
  )
  await assert.rejects(
    q('select fic_save_lesson($1,$2,0)', [org, branch]),
    /permission denied/,
  )
  console.log(
    'FIC training: tenant/branch/self scope, server scoring, progress, assignment, immutable attempts, policy versions, acknowledgement and private storage passed',
  )
} finally {
  await db.close()
}
const source = await readFile(
  new URL('../src/services/branchFicTrainingService.js', import.meta.url),
  'utf8',
)
const service = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      source.replace(
        "import { supabase } from '../lib/supabaseClient'",
        'const supabase = null',
      ),
    ).toString('base64')
)
const evidence = {
  progress: [
    {
      user_id: 'person',
      course_version: '2026.10',
      completed_lessons: [0, 1, 2, 3, 4, 5],
    },
  ],
  attempts: [
    {
      user_id: 'person',
      course_version: '2026.10',
      passed: true,
      score: 6,
      completed_at: '2026-10-01T10:00:00Z',
    },
    {
      user_id: 'person',
      course_version: '2026.10',
      passed: false,
      score: 2,
      completed_at: '2026-10-01T11:00:00Z',
    },
  ],
  policies: [{ id: 'new', version: '2', is_current: true }],
  acknowledgements: [{ user_id: 'person', policy_id: 'old' }],
}
const status = service.ficMemberStatus(evidence, 'person', 'new')
assert.equal(status.status, 'Passed')
assert.equal(status.attempts[0].score, 2)
assert.equal(status.acknowledgement, undefined)
const csv = service.ficTrainingCsv(
  {
    name: ' =SUM(1)',
    members: [
      { user_id: 'person', status: 'accepted', first_name: '@formula' },
      { user_id: 'person', status: 'accepted', first_name: '@formula' },
    ],
  },
  evidence,
)
assert.equal(csv.split('\r\n').length, 2)
assert.match(csv, /"' =SUM\(1\)"/)
assert.match(csv, /"'@formula"/)
await assert.rejects(
  service.publishFicPolicy('org', { file: { type: 'image/png', size: 50 } }),
  /PDF/,
)
await assert.rejects(
  service.publishFicPolicy('org', {
    file: { type: 'application/pdf', size: 11000000 },
  }),
  /PDF/,
)
console.log(
  'FIC display/export: latest attempt, retained pass, current-policy acknowledgement, accepted members, deduplication and formula escaping passed',
)
