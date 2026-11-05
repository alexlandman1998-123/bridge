import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create role anon;create role authenticated;create table organisations(id uuid primary key);create table attorney_firms(id uuid primary key,organisation_id uuid references organisations(id));create table performance_metrics(workspace_id uuid references organisations(id),metadata jsonb);create table telemetry_events(workspace_id uuid references organisations(id),metadata jsonb);`)
 await db.query('insert into organisations values($1)',[id(1)]);await db.query('insert into attorney_firms values($1,$2)',[id(2),id(1)])
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104105500_observability_attorney_firm_workspace_identity.sql',import.meta.url),'utf8'))
 for(const table of ['performance_metrics','telemetry_events']){
  await db.query(`insert into ${table} values($1,'{"source":"fixture"}')`,[id(2)])
  const row=(await db.query(`select * from ${table}`)).rows[0]
  assert.equal(row.workspace_id,id(1));assert.equal(row.metadata.professionalWorkspaceId,id(2));assert.equal(row.metadata.source,'fixture')
  await db.query(`insert into ${table} values($1,'{"source":"organisation"}')`,[id(1)])
  assert.equal((await db.query(`select * from ${table} where metadata->>'source'='organisation'`)).rows[0].metadata.professionalWorkspaceId,undefined)
  await assert.rejects(db.query(`insert into ${table} values($1,'{}')`,[id(3)]),/foreign key/)
 }
 console.log('Firm telemetry keeps its owning organisation FK plus professional context; normal organisations and invalid-ID rejection are preserved.')
}finally{await db.close()}
