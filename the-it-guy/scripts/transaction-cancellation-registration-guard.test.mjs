import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
try{
 await db.exec(`create schema journey_private;create role anon;create role authenticated;
 create table transactions(id int primary key,lifecycle_state text,registered_at timestamptz,completed_at timestamptz,cancelled_reason text,cancelled_at timestamptz);
 insert into transactions values(1,'active',null,null,null,null),(2,'registered',now(),null,null,null),(3,'completed',now(),now(),null,null),(4,'archived',null,null,null,null);`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104122922_transaction_cancellation_registration_guard.sql',import.meta.url),'utf8'))
 await assert.rejects(()=>db.exec("update transactions set lifecycle_state='cancelled' where id=1"),/reason and timestamp/)
 for(const id of [2,3,4])await assert.rejects(()=>db.exec(`update transactions set lifecycle_state='cancelled',cancelled_reason='Synthetic',cancelled_at=now(),registered_at=null,completed_at=null where id=${id}`),/Undo registration/)
 await db.exec("update transactions set lifecycle_state='cancelled',cancelled_reason='Synthetic withdrawn sale',cancelled_at=now() where id=1")
 assert.equal((await db.query('select lifecycle_state from transactions where id=1')).rows[0].lifecycle_state,'cancelled')
 await db.exec("update transactions set lifecycle_state='active',registered_at=null,completed_at=null where id=2;update transactions set lifecycle_state='cancelled',cancelled_reason='Synthetic reviewed reversal',cancelled_at=now() where id=2")
 assert.equal((await db.query('select lifecycle_state from transactions where id=2')).rows[0].lifecycle_state,'cancelled')
 console.log('PASS active sale cancellation, required reason and timestamp, registered/completed/archived protection and reviewed-reversal route.')
}finally{await db.close()}
