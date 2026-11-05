import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 await db.exec(`create schema journey_private;create role anon;create role authenticated;
 create table developments(id uuid primary key,organisation_id uuid);
 create table units(id uuid primary key,development_id uuid,status text);
 create table transactions(id uuid primary key,unit_id uuid,development_id uuid,organisation_id uuid,registered_at timestamptz,lifecycle_state text,created_at timestamptz);
 insert into developments values('${id(1)}','${id(2)}');
 insert into units values('${id(3)}','${id(1)}','Reserved');`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104172439_registered_unit_inventory_projection.sql',import.meta.url),'utf8'))
 const status=async()=>(await db.query('select status from units')).rows[0].status
 await db.query("insert into transactions values($1,$2,$3,$4,null,'active',now())",[id(4),id(3),id(1),id(2)])
 assert.equal(await status(),'Reserved')
 await db.query('update transactions set registered_at=now() where id=$1',[id(4)])
 assert.equal(await status(),'Registered')
 await db.exec("update units set status='Reserved'")
 assert.equal(await status(),'Registered','A late reservation callback cannot reverse registration')
 await db.query("update transactions set lifecycle_state='completed' where id=$1",[id(4)])
 assert.equal(await status(),'Registered')
 await db.query("update transactions set registered_at=null,lifecycle_state='active' where id=$1",[id(4)])
 assert.equal(await status(),'Transfer in Progress','An authorised registration reversal restores transfer inventory')
 await db.exec("update units set status='Reserved'")
 await db.query("insert into transactions values($1,$2,$3,$4,now(),'registered',now()+interval '1 second')",[id(5),id(3),id(1),id(9)])
 assert.equal(await status(),'Reserved','A foreign tenant transaction cannot change inventory')
 await db.query("insert into transactions values($1,$2,$3,$4,null,'active',now()+interval '2 seconds')",[id(6),id(3),id(1),id(2)])
 await db.query('update transactions set registered_at=now() where id=$1',[id(4)])
 assert.equal(await status(),'Reserved','An older sale cannot overwrite a newer sale inventory')
 await db.query('update transactions set registered_at=now() where id=$1',[id(6)])
 assert.equal(await status(),'Registered')
 await db.query("update transactions set registered_at=null,lifecycle_state='active' where id=$1",[id(4)])
 assert.equal(await status(),'Registered','Reversing an older sale cannot disturb the current registered sale')
 assert.equal((await db.query("select has_function_privilege('anon','journey_private.project_registered_unit_inventory()','execute') allowed")).rows[0].allowed,false)
 console.log('PASS registered stock projection, late callback, completion, reversal, foreign tenant and latest-sale isolation.')
}finally{await db.close()}
