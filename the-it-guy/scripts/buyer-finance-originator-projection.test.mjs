import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { buildBuyerFinancePresentationModel } from '../src/core/clientPortal/buyerFinancePresentationModel.js'
import { buildBondOriginatorBuyerOfferGrantViewModel } from '../src/modules/bond/integrations/packages/bondApplicationExportPackages.js'
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`
create role anon; create role authenticated;
create table transactions(id uuid,primary_bond_consultant_user_id uuid,bond_workspace_id uuid,bond_amount numeric,bond_originator text,assigned_bond_originator_email text);
create table profiles(id uuid,full_name text,email text,phone text,private_notes text);
create table organisations(id uuid,name text,logo_url text);
create table transaction_role_players(transaction_id uuid,role_type text,updated_at timestamptz,snapshot_json jsonb,contact_person text,email_address text,partner_name text,notes text);
create table transaction_bond_originator_workspace_assignments(id uuid,transaction_id uuid,assigned_to_profile_id uuid,status text,assigned_at timestamptz,accepted_at timestamptz);
create table transaction_bond_applications(id uuid,transaction_id uuid,bank_name text,application_type text,status text,submitted_at timestamptz,updated_at timestamptz,notes text);
create table transaction_bond_application_export_packages(id uuid,transaction_id uuid,destination_key text,status text);
create table bond_application_external_submission_records(id uuid,export_package_id uuid,lender_names text[],submitted_at timestamptz,status text,notes text);
create table transaction_bond_originator_bank_offer_captures(id uuid,export_package_id uuid,transaction_id uuid,bank_name text,offered_amount numeric,interest_rate numeric,interest_rate_display text,monthly_repayment numeric,valid_until text,quote_document_id uuid,conditions_summary text,status text,buyer_decision text,published_at timestamptz);
create table transaction_bond_originator_grant_captures(id uuid,export_package_id uuid,transaction_id uuid,bank_name text,approved_amount numeric,grant_document_id uuid,status text,published_at timestamptz);
create function bridge_has_client_portal_token_transaction_access(uuid) returns boolean language sql stable as $$ select $1 = '${id(1)}'::uuid $$;
insert into transactions values ('${id(1)}','${id(2)}','${id(3)}',2200000,'Stale company','stale@example.test');
insert into profiles values ('${id(2)}','Assigned consultant','consultant@example.test','0123456789','private');
insert into organisations values ('${id(3)}','Assigned originator','https://example.test/logo.svg');
insert into transaction_bond_application_export_packages values ('${id(4)}','${id(1)}','bond_originator_intake','delivered'),('${id(5)}','${id(99)}','bond_originator_intake','delivered');
insert into transaction_bond_originator_workspace_assignments values ('${id(6)}','${id(1)}','${id(2)}','accepted',now(),now());
`)
await db.exec(await readFile(new URL('../../supabase/migrations/20261003150131_buyer_finance_originator_projection.sql',import.meta.url),'utf8'))
const read = async () => (await db.query('select bridge_read_buyer_originator_finance($1) as data',[id(1)])).rows[0].data
const model = finance => buildBuyerFinancePresentationModel({source:'production',financeType:'bond',status:'Submitted',originatorFinance:finance, offers:buildBondOriginatorBuyerOfferGrantViewModel({exportPackage:finance}).offers})
let finance = await read()
assert.equal(finance.applicationReceived,true)
assert.equal(finance.manager.name,'Assigned consultant')
assert.equal(finance.manager.company,'Assigned originator')
assert.equal('private_notes' in finance.manager,false)
assert.equal(model(finance).stageKey,'application','buyer form submission must not imply bank submission')
await db.exec(`insert into transaction_bond_applications values
('${id(10)}','${id(1)}','Draft bank','draft_application','pending',null,now(),'private'),
('${id(11)}','${id(1)}','Bond originator intake','originator_intake','submitted',now(),now(),'private'),
('${id(12)}','${id(1)}','Unsubmitted bank','bank_application','pending',null,now(),'private');
insert into bond_application_external_submission_records values
('${id(13)}','${id(4)}',array['Nedbank','Standard Bank'],now(),'recorded','private'),
('${id(14)}','${id(4)}',array['Withdrawn bank'],now(),'withdrawn','private'),
('${id(15)}','${id(5)}',array['Other matter bank'],now(),'recorded','private');`)
finance = await read()
assert.deepEqual(finance.bankApplications.map(b=>b.bankName),['Nedbank','Standard Bank'])
assert.equal(model(finance).stageKey,'submitted')
assert.equal('notes' in finance.bankApplications[0],false)
await db.exec(`insert into transaction_bond_applications values ('${id(16)}','${id(1)}','Nedbank','bank_application','feedback_received',now(),now(),'private');`)
finance = await read()
assert.equal(finance.bankApplications.length,2,'duplicate lender submissions must not create duplicate cards')
assert.equal(model(finance).stageKey,'responses')
await db.exec(`insert into transaction_bond_originator_bank_offer_captures(id,export_package_id,transaction_id,bank_name,status,published_at,offered_amount,monthly_repayment,quote_document_id) values
('${id(20)}','${id(4)}','${id(1)}','Nedbank','draft',null,2100000,15000,'${id(30)}'),
('${id(21)}','${id(4)}','${id(1)}','Standard Bank','published_to_buyer',now(),2200000,16000,'${id(31)}'),
('${id(22)}','${id(5)}','${id(99)}','Other bank','published_to_buyer',now(),999999,111,'${id(32)}');`)
finance = await read()
assert.equal(finance.offerCaptures.length,1)
assert.equal(finance.offerCaptures[0].quote_document_id,id(31))
assert.equal(model(finance).stageKey,'approval')
await db.exec(`insert into transaction_bond_originator_grant_captures values ('${id(23)}','${id(4)}','${id(1)}','Standard Bank',2200000,'${id(33)}','received',null);`)
assert.equal(model(await read()).stageKey,'approval','unpublished grant must not mark final approval')
await db.exec(`update transaction_bond_originator_grant_captures set status='published_to_buyer',published_at=now();`)
assert.equal(model(await read()).stageKey,'guarantees')
await db.exec(`insert into transaction_bond_applications values ('${id(40)}','${id(1)}','First National Bank','bank_application','declined',now() - interval '1 day',now() - interval '1 day','private');
insert into bond_application_external_submission_records values ('${id(41)}','${id(4)}',array['FNB'],now(),'recorded','private');`)
finance = await read()
assert.equal(finance.bankApplications.filter(bank => /fnb|first national/i.test(bank.bankName)).length,1)
assert.equal(finance.bankApplications.find(bank => /fnb|first national/i.test(bank.bankName)).status,'submitted','newer re-submission replaces older lender feedback')
await db.exec('set role anon')
assert.equal((await read()).manager.name,'Assigned consultant','authorised secure-link reader works without staff access')
await db.exec('reset role')
await db.exec(`create schema document_security;
create table documents(id uuid,transaction_id uuid,name text,file_path text,file_bucket text,visibility_scope text);
create function document_security.can_read(d public.documents) returns boolean language sql stable as $$ select d.visibility_scope='client' $$;
insert into documents values ('${id(31)}','${id(1)}','Quote.pdf','matter/quote.pdf','documents','client'),('${id(35)}','${id(99)}','Other.pdf','other/quote.pdf','documents','client');`)
await db.exec(await readFile(new URL('../../supabase/migrations/20261003151102_buyer_quote_document_access.sql',import.meta.url),'utf8'))
const pdf = async offerId => (await db.query('select bridge_read_buyer_quote_document($1,$2) as data',[id(1),offerId])).rows[0].data
assert.equal((await pdf(id(21))).filePath,'matter/quote.pdf')
await assert.rejects(pdf(id(20)),/not available/,'private quote must not resolve')
await assert.rejects(pdf(id(22)),/not available/,'other matter quote must not resolve')
await db.exec(`update transaction_bond_originator_bank_offer_captures set status='withdrawn' where id='${id(21)}';`)
await assert.rejects(pdf(id(21)),/not available/,'withdrawn quote must not resolve from an old popup')
await db.exec(`update transaction_bond_originator_bank_offer_captures set status='published_to_buyer' where id='${id(21)}'; update documents set visibility_scope='internal' where id='${id(31)}';`)
await assert.rejects(pdf(id(21)),/not available/,'document audience must still apply to published quote')
await db.exec(`update documents set visibility_scope='client',file_path='matter/replaced-quote.pdf' where id='${id(31)}';`)
assert.equal((await pdf(id(21))).filePath,'matter/replaced-quote.pdf','click resolves current path rather than cached URL')
await db.exec(`update transaction_bond_originator_bank_offer_captures set quote_document_id='${id(35)}' where id='${id(21)}';`)
await assert.rejects(pdf(id(21)),/not available/,'linked document cannot belong to another matter')
for (const denied of [null,id(99)]) await assert.rejects(db.query('select bridge_read_buyer_quote_document($1,$2)',[denied,id(21)]),/access denied/)
for (const denied of [null,id(99)]) await assert.rejects(db.query('select bridge_read_buyer_originator_finance($1)',[denied]),/access denied/i)
await db.close()
console.log('Originator finance projection passed: consultant, receipt, real submissions, bank responses, published quotes/grants, no private data and matter access denial.')
