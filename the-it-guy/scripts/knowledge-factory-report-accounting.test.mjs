import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountingDatabase, accountingClient, org, actor, approvalId } from '../server/tests/fixtures/knowledgeFactoryAccounting.js';
import handler from '../api/knowledge-factory/report-purchase-intents.js';
import { packageReportQueryFingerprint } from '../api/knowledge-factory/package-report-recipes.js';
import { reportSupplierRuntime } from '../server/services/knowledgeFactoryReportRuntime.js';
import { reviewReportCostEvidence } from '../server/services/knowledgeFactoryReportAccounting.js';
const runtime = environment => ({ SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'local-test',KNOWLEDGE_FACTORY_REPORT_ENVIRONMENT:environment,VERCEL_ENV:'production',KNOWLEDGE_FACTORY_LIVE_REPORTS_ENABLED:'true',KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT:'https://propinfoapi.co.za/uat/v1/graphql/',KNOWLEDGE_FACTORY_EMAIL:'uat@example.test',KNOWLEDGE_FACTORY_PASSWORD:'test-password',KNOWLEDGE_FACTORY_LIVE_GRAPHQL_ENDPOINT:'https://propinfoapi.co.za/live/v1/graphql/',KNOWLEDGE_FACTORY_LIVE_EMAIL:'live@example.test',KNOWLEDGE_FACTORY_LIVE_PASSWORD:'test-live-password' });
const response = () => ({status(n){this.code=n;return this;},setHeader(){return this;},end(value){this.body=JSON.parse(value);}});
const sample={propertyId:383723,currentOwnership:{nodes:[{isCurrentOwner:true,dateRegister:'2020-01-01',buyers:{nodes:[{buyerName:'Synthetic owner',buyerType:1,share:100}],pageInfo:{hasNextPage:false}}}]},streetAddress:[{address:'1 Test Road'}]};
const billing={complexity:109,rootSurcharge:0,fieldSurcharge:11050,surcharge:11050,credits:11159,amountDeducted:11159,discountMultiplier:1,rootFieldCount:1,status:'charged'};
const makeSupplier=(requests,change=value=>value)=>async(_url,options)=>{
 const input=JSON.parse(options.body);requests.push(options.headers['GraphQL-Cost']||'login');
 if(input.query.startsWith('mutation'))return new Response(JSON.stringify({data:{login:{tokenPayload:{token:'private-synthetic-token',expiresUtc:'2099-01-01'}}}}));
 if(options.headers['GraphQL-Cost']==='validate')return new Response(JSON.stringify({extensions:{operationCost:{fieldCost:79,typeCost:30}}}));
 return new Response(JSON.stringify(change({data:{propertyReports:{nodes:[sample]}},extensions:{operationCost:{fieldCost:79,typeCost:30},billingCost:billing}})));
};
async function flow(db,environment,productId="basic_owner_lookup",extras={}){
 const deps={createDb:()=>accountingClient(db),env:runtime(environment)};
 const call=async body=>{const out=response();await handler({method:'POST',headers:{authorization:'Bearer local-test'},body:{organisationId:org,...body}},out,deps);return out;};
 const quote=await call({action:'quote',productId,propertyId:383723,purpose:'Local synthetic report acceptance',...extras});assert.equal(quote.code,201,JSON.stringify(quote.body));
 const confirmed=await call({action:'confirm',intentId:quote.body.intent.id,attested:true});assert.equal(confirmed.code,201,JSON.stringify(confirmed.body));
 return{call,intentId:quote.body.intent.id};
}
async function scenario(environment,change,run){const db=await accountingDatabase(environment);const original=globalThis.fetch;const requests=[];globalThis.fetch=makeSupplier(requests,change);try{await run(db,await flow(db,environment),requests);}finally{globalThis.fetch=original;await db.close();}}

test('live requires explicit production gate, dedicated credentials and exact endpoint',()=>{
 const env=runtime('live');assert.equal(reportSupplierRuntime(env).environment,'live');
 for(const patch of [{VERCEL_ENV:'preview'},{KNOWLEDGE_FACTORY_LIVE_REPORTS_ENABLED:'false'},{KNOWLEDGE_FACTORY_LIVE_EMAIL:''},{KNOWLEDGE_FACTORY_LIVE_GRAPHQL_ENDPOINT:env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT},{KNOWLEDGE_FACTORY_REPORT_ENVIRONMENT:'unknown'}])assert.throws(()=>reportSupplierRuntime({...env,...patch}));
 assert.equal(reportSupplierRuntime(runtime('uat')).email,'uat@example.test');
});
test('live quote, confirmation, report save and monthly invoice are connected and cannot duplicate',()=>scenario('live',undefined,async(db,{call,intentId},requests)=>{
 const result=await call({action:'execute',intentId});assert.equal(result.code,200,JSON.stringify(result.body));assert.equal(result.body.report.data.owners[0].name,'Synthetic owner');
 const line=(await db.query('select * from knowledge_factory_report_invoice_lines')).rows;assert.equal(line.length,1);assert.equal(line[0].amount_cents,500);
 assert.equal((await db.query('select status from knowledge_factory_report_credit_ledger')).rows[0].status,'completed');
 assert.equal((await call({action:'execute',intentId})).code,409);assert.equal(requests.filter(x=>x==='report').length,1);
 assert.equal((await db.query('select count(*) as n from knowledge_factory_report_invoice_lines')).rows[0].n,1);
}));
test('UAT reports save normally and never create customer invoice lines',()=>scenario('uat',undefined,async(db,{call,intentId})=>{
 const result=await call({action:'execute',intentId});assert.equal(result.code,200,JSON.stringify(result.body));assert.equal((await db.query('select count(*) as n from knowledge_factory_report_invoices')).rows[0].n,0);
}));
test('charged supplier errors preserve credits and do not invoice the customer or retry',()=>scenario('live',value=>({...value,errors:[{message:'Synthetic downstream failure'}]}),async(db,{call,intentId},requests)=>{
 const result=await call({action:'execute',intentId});assert.equal(result.code,502);
 const row=(await db.query('select * from knowledge_factory_report_credit_ledger')).rows[0];assert.equal(row.charged_credits,11159);assert.equal(row.status,'settled');
 assert.equal((await db.query('select count(*) as n from knowledge_factory_report_invoice_lines')).rows[0].n,0);
 assert.equal((await call({action:'execute',intentId})).code,409);assert.equal(requests.filter(x=>x==='report').length,1);
}));
test('missing billing holds the full reservation and requires review',()=>scenario('live',value=>({...value,extensions:{operationCost:value.extensions.operationCost}}),async(db,{call,intentId})=>{
 assert.equal((await call({action:'execute',intentId})).code,502);const row=(await db.query('select * from knowledge_factory_report_credit_ledger')).rows[0];assert.equal(row.status,'review_required');assert.equal(row.reserved_credits,11159);
 assert.equal((await db.query('select count(*) as n from knowledge_factory_report_invoice_lines')).rows[0].n,0);
}));
test('real PostgreSQL reservation rejects competing requests over the same agency budget',async()=>{
 const db=await accountingDatabase();const client=accountingClient(db);const fingerprint=packageReportQueryFingerprint('basic_owner_lookup');
 try{const ids=[];for(let n=0;n<2;n++)ids.push((await db.query(`insert into knowledge_factory_report_purchase_intents(organisation_id,actor_id,product_id,status,quote_expires_at,quoted_supplier_credits,supplier_environment) values($1,$2,'basic_owner_lookup','executing',now()+interval '20 minutes',11159,'live') returning id`,[org,actor])).rows[0].id);
 const result=await Promise.all(ids.map(id=>client.rpc('knowledge_factory_reserve_report_credits',{p_intent_id:id,p_actor_id:actor,p_maximum_credits:11159,p_environment:'live',p_query_sha256:fingerprint,p_approval_id:approvalId})));
 assert.equal(result.filter(r=>!r.error).length,1);assert.equal(result.filter(r=>r.error).length,1);
 const held=(await db.query('select * from knowledge_factory_report_credit_ledger')).rows[0];
 await client.rpc('knowledge_factory_record_report_charge',{p_intent_id:held.purchase_intent_id,p_actor_id:actor,p_action:'dispatch'});
 assert.ok((await client.rpc('knowledge_factory_record_report_charge',{p_intent_id:held.purchase_intent_id,p_actor_id:actor,p_action:'release'})).error);
 }finally{await db.close();}
});
test('RPCs and accounting tables cannot be reached by browser roles',async()=>{
 const db=await accountingDatabase();try{const result=await db.query(`select has_function_privilege('authenticated','knowledge_factory_reserve_report_credits(uuid,uuid,integer,text,text,uuid)','execute') as execute,has_table_privilege('anon','knowledge_factory_report_credit_ledger','select') as read`);assert.equal(result.rows[0].execute,false);assert.equal(result.rows[0].read,false);}finally{await db.close();}
});
test('cost approval accepts actual billing evidence and rejects estimates, changed queries and missing owner fields',()=>{
 const audit={operation:'property_report',request_metadata:{supplierApiVersion:'v1',querySha256:packageReportQueryFingerprint('basic_owner_lookup'),phase:'execution_result',executionSent:true,reportReturned:true,reportIssue:null,costs:{fieldCost:79,typeCost:30},billing,preflight:{maximumCredits:11159},fieldCoverage:{owners:[{buyerName:'string',buyerType:'number',share:'number'}]}}};
 assert.equal(reviewReportCostEvidence(audit,'basic_owner_lookup').maximumCredits,11159);
 for(const patch of [{billing:{}},{querySha256:'a'.repeat(64)},{executionSent:false},{fieldCoverage:{owners:[{buyerName:'string',buyerType:'missing',share:'null'}]}}])assert.throws(()=>reviewReportCostEvidence({...audit,request_metadata:{...audit.request_metadata,...patch}},'basic_owner_lookup'));
});

test('an invoice save failure rolls back the report, request and customer charge together',()=>scenario('live',undefined,async(db,{call,intentId})=>{
 await db.exec(`create function reject_invoice_test() returns trigger language plpgsql as $$begin raise exception 'Synthetic invoice write failure';end$$;create trigger reject_invoice before insert on knowledge_factory_report_invoice_lines for each row execute function reject_invoice_test();`);
 assert.equal((await call({action:'execute',intentId})).code,409);
 for(const table of ['knowledge_factory_report_results','knowledge_factory_report_requests','knowledge_factory_report_invoices','knowledge_factory_report_invoice_lines'])assert.equal((await db.query(`select count(*) as n from ${table}`)).rows[0].n,0);
 const ledger=(await db.query('select * from knowledge_factory_report_credit_ledger')).rows[0];assert.equal(ledger.charged_credits,11159);assert.equal(ledger.status,'settled');
 assert.equal((await db.query('select status from knowledge_factory_report_purchase_intents where id=$1',[intentId])).rows[0].status,'execution_failed');
}));
test('revoking approval after quoting prevents supplier data execution',()=>scenario('live',undefined,async(db,{call,intentId},requests)=>{
 await db.exec('update knowledge_factory_report_cost_approvals set revoked_at=now()');assert.equal((await call({action:'execute',intentId})).code,409);assert.equal(requests.filter(x=>x==='report').length,0);
}));
test('unknown charges stay reserved until an explicit dated supplier review',()=>scenario('live',value=>({...value,extensions:{operationCost:value.extensions.operationCost}}),async(db,{call,intentId})=>{
 await call({action:'execute',intentId});const client=accountingClient(db);
 const input={p_intent_id:intentId,p_actor_id:actor,p_organisation_id:org,p_credits:0,p_deducted:0,p_reference:'Supplier confirmed request was not charged'};
 assert.ok((await client.rpc('knowledge_factory_review_report_charge',input)).error);
 await db.query("update knowledge_factory_report_credit_ledger set dispatched_at=now()-interval '10 minutes' where purchase_intent_id=$1",[intentId]);
 assert.ok((await client.rpc('knowledge_factory_review_report_charge',{...input,p_organisation_id:'00000000-0000-4000-8000-999999999999'})).error);
 assert.equal((await client.rpc('knowledge_factory_review_report_charge',input)).data.reviewed,true);
 const usage=await client.rpc('knowledge_factory_report_usage',{p_organisation_id:org});assert.equal(usage.data.creditsReserved,0);assert.equal(usage.data.creditsConsumed,0);
 assert.equal((await db.query('select count(*) as n from knowledge_factory_report_credit_reviews')).rows[0].n,1);
}));
test('only completed months may be issued as monthly invoices',()=>scenario('live',undefined,async(db,{call,intentId})=>{
 await call({action:'execute',intentId});const client=accountingClient(db);const invoice=(await db.query('select id from knowledge_factory_report_invoices')).rows[0];
 assert.ok((await client.rpc('knowledge_factory_issue_report_invoice',{p_invoice_id:invoice.id,p_organisation_id:org})).error);
 await db.query("update knowledge_factory_report_invoices set invoice_month=(date_trunc('month',now())-interval '1 month')::date where id=$1",[invoice.id]);
 assert.equal((await client.rpc('knowledge_factory_issue_report_invoice',{p_invoice_id:invoice.id,p_organisation_id:org})).data.issued,true);
 assert.equal((await db.query('select status from knowledge_factory_report_invoices')).rows[0].status,'issued');
}));

test('Full report fields, saved snapshot and invoice use the same approved query',async()=>{
 const db=await accountingDatabase('live');const original=globalThis.fetch;
 try{
 await db.exec("update knowledge_factory_package_commercial_policies set allowed_product_ids=array['basic_owner_lookup','full_canvassing_report']");
 await db.query(`insert into knowledge_factory_report_cost_approvals(organisation_id,product_id,supplier_environment,supplier_query_sha256,schedule_version,maximum_credits,evidence_audit_id,supplier_reference,review_note,reviewed_by,expires_at) values($1,'full_canvassing_report','live',$2,'kf-v1-2026-09-22',18000,'00000000-0000-4000-8000-000000000004','full-fee-reference','Complete synthetic Full report evidence',$3,now()+interval '7 days')`,[org,packageReportQueryFingerprint('full_canvassing_report'),actor]);
 await db.query(`insert into knowledge_factory_report_products values($1,'full_canvassing_report','uat_validated','Full property report','Complete report','[]',2500,'package_full_v1','[]','[]','canvassing-v1')`,[org]);
 globalThis.fetch=async(_url,options)=>{
  const query=JSON.parse(options.body).query;if(query.startsWith('mutation'))return makeSupplier([])(_url,options);
  assert.match(query,/transfers\(first: 5, order: \{ dateRegister: DESC \}\)/);
  if(options.headers['GraphQL-Cost']==='validate')return new Response(JSON.stringify({extensions:{operationCost:{fieldCost:101,typeCost:42}}}));
  const fullProperty = { ...sample, valuationValue: 1500000, valuationZoning: 'Residential',
    transfers: { pageInfo: { hasNextPage: false }, nodes: [{ dateRegister: '2020-01-01', purchaseAmount: 1000000, isCurrentOwner: true }] } };
  return new Response(JSON.stringify({ data: { propertyReports: { nodes: [fullProperty] } },
    extensions: { operationCost: { fieldCost: 101, typeCost: 42 },
      billingCost: { ...billing, complexity: 143, fieldSurcharge: 17575, surcharge: 17575, credits: 17718, amountDeducted: 17718 } } }));
 };
 const {call,intentId}=await flow(db,'live','full_canvassing_report');const result=await call({action:'execute',intentId});assert.equal(result.code,200,JSON.stringify(result.body));
 assert.equal(result.body.report.data.municipalValuation.value,1500000);assert.equal(result.body.report.data.transactions[0].purchaseAmount,1000000);
 const saved=(await db.query('select * from knowledge_factory_report_results')).rows[0];assert.equal(saved.request_context_snapshot.supplierQuerySha256,packageReportQueryFingerprint('full_canvassing_report'));
 const { buildKnowledgeFactoryReportPdf } = await import('../src/services/propertyIntelligence/knowledgeFactoryReportPdf.js');
 assert.match(buildKnowledgeFactoryReportPdf(saved).output(), /^%PDF-/);
 assert.equal((await db.query('select amount_cents from knowledge_factory_report_invoice_lines')).rows[0].amount_cents,2500);
 }finally{globalThis.fetch=original;await db.close();}
});
test('a response without current owners retains the supplier charge and creates no customer invoice',()=>scenario('live',value=>({...value,data:{propertyReports:{nodes:[{propertyId:383723}]}}}),async(db,{call,intentId})=>{
 assert.equal((await call({action:'execute',intentId})).code,502);assert.equal((await db.query('select charged_credits from knowledge_factory_report_credit_ledger')).rows[0].charged_credits,11159);assert.equal((await db.query('select count(*) as n from knowledge_factory_report_invoice_lines')).rows[0].n,0);
}));

test('the private service role can complete invoicing but cannot rewrite invoice lines or approved ceilings',()=>scenario('live',undefined,async(db,{call,intentId})=>{
 await db.exec('set role service_role');
 const result=await call({action:'execute',intentId});assert.equal(result.code,200,JSON.stringify(result.body));
 await assert.rejects(db.exec('delete from knowledge_factory_report_invoice_lines'),/permission denied/);
 await assert.rejects(db.exec('update knowledge_factory_report_cost_approvals set maximum_credits=99999'),/permission denied/);
 await db.exec('reset role');
}));

test('a verified map boundary and chosen lead survive quote and execution without changing supplier query or calls',async()=>{
 const db=await accountingDatabase('uat'),original=globalThis.fetch,requests=[];
 const {issueBoundaryReceipt}=await import('../server/services/knowledgeFactoryBoundaryReceipt.js');
 const geometry={type:'MultiPolygon',coordinates:[[[[28,-25],[28.001,-25],[28.001,-25.001],[28,-25]]]]};
 const sellerLeadId='00000000-0000-4000-8000-000000000099';
 const boundaryReceipt=issueBoundaryReceipt({geometry,organisationId:org,actorId:actor,propertyId:383723,environment:'uat',key:runtime('uat').SUPABASE_SERVICE_ROLE_KEY});
 globalThis.fetch=makeSupplier(requests);
 try{
  // Actual target validation is exercised against leads/listings in the filing DB suite.
  await db.exec(`create function knowledge_factory_validate_seller_target(p_org uuid,p_actor uuid,p_property bigint,p_lead uuid) returns jsonb language sql as $$select jsonb_build_object('leadId',p_lead)$$;`);
  const {call,intentId}=await flow(db,'uat','basic_owner_lookup',{boundaryReceipt,sellerLeadId});
  const intent=(await db.query('select boundary_snapshot,target_seller_lead_id from knowledge_factory_report_purchase_intents where id=$1',[intentId])).rows[0];
  assert.deepEqual(intent.boundary_snapshot.geometry,geometry);assert.equal(intent.target_seller_lead_id,sellerLeadId);
  const before=requests.length;const invalid=await call({action:'quote',productId:'basic_owner_lookup',propertyId:383723,purpose:'Local invalid boundary proof',boundaryReceipt:boundaryReceipt+'bad'});assert.equal(invalid.code,400);assert.equal(requests.length,before);
  const executed=await call({action:'execute',intentId,sellerLeadId:'ignored-browser-change'});assert.equal(executed.code,200,JSON.stringify(executed.body));
  const saved=(await db.query('select * from knowledge_factory_report_results')).rows[0];
  assert.deepEqual(saved.report_data.boundary.geometry,geometry);assert.equal(saved.request_context_snapshot.targetSellerLeadId,sellerLeadId);
  assert.equal(saved.request_context_snapshot.supplierQuerySha256,packageReportQueryFingerprint('basic_owner_lookup'));assert.equal(requests.filter(x=>x==='report').length,1);

 } finally {globalThis.fetch=original;await db.close();}
});
