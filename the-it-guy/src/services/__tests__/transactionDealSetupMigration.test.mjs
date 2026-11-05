import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
try {
 await db.exec('create role anon;create role authenticated;create table public.transactions(id integer primary key,purchase_price numeric,sales_price numeric);insert into public.transactions values(1,100,100);')
 await db.exec(await readFile(new URL('../../../../supabase/migrations/20261103194710_transaction_deal_setup_reconciliation_state.sql',import.meta.url),'utf8'))
 const original=(await db.query('select * from transactions')).rows[0];assert.equal(original.deal_setup_sync_status,null);assert.equal(Number(original.purchase_price),100)
 await db.exec("update transactions set purchase_price=200,deal_setup_terms_version='11111111-1111-4111-8111-111111111111',deal_setup_sync_status='pending' where id=1")
 assert.equal(Number((await db.query('select sales_price from transactions')).rows[0].sales_price),200)
 await db.exec('update transactions set sales_price=300 where id=1');assert.equal(Number((await db.query('select purchase_price from transactions')).rows[0].purchase_price),300)
 await assert.rejects(db.exec('update transactions set sales_price=400,purchase_price=500 where id=1'),/must agree/)
 assert.equal(Number((await db.query('select purchase_price from transactions')).rows[0].purchase_price),300)
 await db.exec('insert into transactions(id,sales_price) values(2,600)');assert.equal(Number((await db.query('select purchase_price from transactions where id=2')).rows[0].purchase_price),600)
 await db.exec('update transactions set purchase_price=0 where id=2');assert.equal(Number((await db.query('select sales_price from transactions where id=2')).rows[0].sales_price),0)
 console.log('Migration: no historical rewrite, durable pending state, price aliases and conflict rollback passed')
}finally{await db.close()}
