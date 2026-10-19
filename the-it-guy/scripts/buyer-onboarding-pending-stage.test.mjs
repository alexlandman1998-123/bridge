import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const db = new PGlite()
try {
 const previous=readFileSync('../supabase/migrations/20260831125357_align_agent_transaction_stages.sql','utf8')
 const original=previous.match(/create or replace function public\.bridge_normalize_transaction_stage\([\s\S]*?\$\$;/i)[0]
 const migration=readFileSync('../supabase/migrations/20261019202916_buyer_onboarding_pending_stage.sql','utf8')
 await db.exec(original)
 await db.exec(`create table stage_probe(stage text check(stage is null or (public.bridge_normalize_transaction_stage(stage) is not null and stage=public.bridge_normalize_transaction_stage(stage))))`)
 await assert.rejects(db.exec(`insert into stage_probe values ('Buyer Onboarding Pending')`),/check constraint/)
 const known=['Available','Reserved','Offer Accepted','OTP Signed','Deposit','Deposit Paid','Finance','Finance Pending','Bond Approved / Proof of Funds','Proceed to Attorneys','Transfer','Transfer in Progress','Transfer Lodged','Registration','Registered']
 const prior=await db.query(`select pg_get_functiondef('public.bridge_normalize_transaction_stage(text)'::regprocedure) definition`)
 await db.exec(migration)
 const after=await db.query(`select pg_get_functiondef('public.bridge_normalize_transaction_stage(text)'::regprocedure) definition`)
 assert.equal(after.rows[0].definition,prior.rows[0].definition.replace("    when 'available' then 'Available'","    when 'buyer onboarding pending' then 'Buyer Onboarding Pending'\n    when 'available' then 'Available'"))
 for(const stage of [...known,'Buyer Onboarding Pending']) await db.query('insert into stage_probe values ($1)',[stage])
 for(const stage of ['unsupported','buyer onboarding pending','OTP signed']) await assert.rejects(db.query('insert into stage_probe values ($1)',[stage]),/check constraint/)
 await db.exec(migration)
 assert.equal((await db.query(`select count(*)::integer n from stage_probe`)).rows[0].n,16)
 console.log('buyer onboarding pending stage: exact function preservation, actual check constraint, all existing stages and idempotence passed')
} finally {await db.close()}
