import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
try{
 await db.exec(`create schema journey_private;create role anon;create role authenticated;create table transactions(id int primary key,routing_profile_json jsonb);create table transaction_attorney_closeouts(transaction_id int,close_out_status text);insert into transactions values(1,'{"transferTaxDecision":{"nonResidentSellers":{"seller-primary":{"applicable":"yes","withholdingRequired":"yes","reservedFundsReference":"reserved","remittanceStatus":"withheld"}}}}'),(2,'{}');`)
 const existing=await readFile(new URL('../../supabase/migrations/20261003185915_attorney_conveyancing_review_corrections.sql',import.meta.url),'utf8')
 await db.exec(existing.slice(existing.indexOf('create function journey_private.attorney_review_date'),existing.indexOf('create function journey_private.attorney_electrical_not_applicable')))
 await db.exec(existing.slice(existing.indexOf('create function journey_private.assert_attorney_withholding_remittance'),existing.indexOf('create function journey_private.assert_attorney_seller_withholding_review')))
 await db.exec(await readFile(new URL('../../supabase/migrations/20261104191415_attorney_financial_withholding_closeout_guard.sql',import.meta.url),'utf8'))
 await db.exec("insert into transaction_attorney_closeouts values(1,'in_progress')")
 await assert.rejects(()=>db.exec("update transaction_attorney_closeouts set close_out_status='closed' where transaction_id=1"),/Withholding remittance payment proof/)
 await assert.rejects(()=>db.exec("insert into transaction_attorney_closeouts values(1,'closed')"),/Withholding remittance payment proof/)
 await db.exec(`update transactions set routing_profile_json=jsonb_set(routing_profile_json,'{transferTaxDecision,nonResidentSellers,seller-primary,paymentReference}','"STAGING-NO-PAYMENT"') where id=1;update transaction_attorney_closeouts set close_out_status='closed' where transaction_id=1;insert into transaction_attorney_closeouts values(2,'closed');`)
 console.log('PASS actual SQL remittance rule blocks both insert/update financial closeout; reviewed payment reference and resident cases remain usable.')
}finally{await db.close()}
