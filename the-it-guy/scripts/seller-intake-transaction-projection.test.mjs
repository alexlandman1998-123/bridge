import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
try{
 await db.exec(`create role anon;create role authenticated;create schema seller_save_private;
 create table transactions(id int,listing_id int,lifecycle_state text,seller_onboarding_status text,purchase_price numeric);
 create table private_listing_seller_onboarding(private_listing_id int,status text);
 insert into transactions values(1,10,'active','not_started',2190000),(2,11,'active','not_started',2300000),(3,10,'completed','not_started',2190000);`)
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104102000_seller_intake_transaction_completion_projection.sql',import.meta.url),'utf8'))
 await db.exec("insert into private_listing_seller_onboarding values(10,'in_progress')")
 assert.equal((await db.query('select seller_onboarding_status from transactions where id=1')).rows[0].seller_onboarding_status,'not_started')
 await db.exec("update private_listing_seller_onboarding set status='completed'")
 const rows=(await db.query('select * from transactions order by id')).rows
 assert.equal(rows[0].seller_onboarding_status,'completed');assert.equal(rows[0].purchase_price,'2190000')
 assert.equal(rows[1].seller_onboarding_status,'not_started');assert.equal(rows[2].seller_onboarding_status,'not_started')
 console.log('Completed seller intake projects only to its linked open transaction; drafts, signed price and historical/other matters are preserved.')
}finally{await db.close()}
