import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportInvoicesHandler } from '../api/knowledge-factory/report-invoices.js';
import { createReportCommerceHandler } from '../api/admin/knowledge-factory/report-commerce.js';
import { packageReportQueryFingerprint } from '../api/knowledge-factory/package-report-recipes.js';
const org='00000000-0000-4000-8000-000000000001';const actor='00000000-0000-4000-8000-000000000002';const evidenceId='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key'};
const response=()=>({status(n){this.code=n;return this;},setHeader(){return this;},end(value){this.body=JSON.parse(value);}});
function database({member={membership_status:'active',workspace_role:'principal'},executive=true,audit=null}={}){
 const calls=[];const db={calls,auth:{getUser:async()=>({data:{user:{id:actor,user_metadata:{role:'executive'}}}}),admin:{getUserById:async()=>({data:{user:{id:actor,app_metadata:{role:executive?'executive':'agent'}}}})}},from(table){
  const call={table,filters:[],insert:null};calls.push(call);
  const data=table==='organisation_users'?member:table==='organisations'?{id:org}:table==='knowledge_factory_audit_log'?audit:table==='knowledge_factory_report_cost_approvals'?{id:'new-approval'}:[{id:'invoice',knowledge_factory_report_invoice_lines:[{amount_cents:500}]}];
  return{select(){return this;},eq(k,v){call.filters.push([k,v]);return this;},order(){return this;},limit(){return this;},insert(value){call.insert=value;return this;},maybeSingle:async()=>({data}),single:async()=>({data}),then(resolve){resolve({data});}};
 }};return db;
}
const request={method:'GET',url:`/?organisationId=${org}`,headers:{authorization:'Bearer synthetic-session'}};
test('only active agency billing administrators can see scoped monthly invoices',async()=>{
 const db=database();const out=response();await createReportInvoicesHandler({createDb:()=>db,env})(request,out);assert.equal(out.code,200);assert.equal(out.body.invoices[0].totalCents,500);assert.deepEqual(db.calls.find(x=>x.table==='knowledge_factory_report_invoices').filters,[['organisation_id',org]]);
 for(const member of [null,{membership_status:'inactive',workspace_role:'principal'},{membership_status:'active',workspace_role:'agent'}]){const denied=response();await createReportInvoicesHandler({createDb:()=>database({member}),env})(request,denied);assert.equal(denied.code,403);}
});
test('invoice requests without authentication never read billing records',async()=>{
 let created=false;const out=response();await createReportInvoicesHandler({createDb:()=>{created=true;},env})({...request,headers:{}},out);assert.equal(out.code,401);assert.equal(created,false);
});
test('customer-editable metadata cannot grant internal report accounting access',async()=>{
 const db=database({executive:false});const out=response();await createReportCommerceHandler({createDb:()=>db,env})(request,out);assert.equal(out.code,403);assert.equal(db.calls.length,0);
});
test('internal cost approval stores numeric provenance separately and rejects incomplete owner fields',async()=>{
 const audit={operation:'property_report',request_metadata:{supplierApiVersion:'v1',querySha256:packageReportQueryFingerprint('basic_owner_lookup'),phase:'execution_result',executionSent:true,reportReturned:true,costs:{fieldCost:79,typeCost:30},billing:{complexity:109,rootSurcharge:0,fieldSurcharge:11050,surcharge:11050,credits:11159,amountDeducted:11159,rootFieldCount:1,status:'charged'},preflight:{maximumCredits:11159},fieldCoverage:{owners:[{buyerName:'string',buyerType:'number',share:'number'}]}}};
 const input={action:'approve_cost',evidenceAuditId:evidenceId,productId:'basic_owner_lookup',environment:'uat',fieldsReviewed:true,feeScheduleConfirmed:true,supplierReference:'Supplier fee reference',reviewNote:'Confirmed owner fields and schedule',expiresAt:new Date(Date.now()+86400000).toISOString()};
 const db=database({audit});const out=response();await createReportCommerceHandler({createDb:()=>db,env})({...request,method:'POST',body:input},out);assert.equal(out.code,201,JSON.stringify(out.body));
 const saved=db.calls.find(x=>x.table==='knowledge_factory_report_cost_approvals').insert;assert.equal(saved.maximum_credits,11159);assert.equal(saved.evidence_audit_id,evidenceId);assert.equal(saved.supplier_query_sha256,packageReportQueryFingerprint('basic_owner_lookup'));assert.equal(saved.reviewed_by,actor);assert.equal(saved.outcome,undefined);
 const incomplete={...audit,request_metadata:{...audit.request_metadata,fieldCoverage:{owners:[{buyerName:'string',buyerType:'missing',share:'null'}]}}};const denied=response();await createReportCommerceHandler({createDb:()=>database({audit:incomplete}),env})({...request,method:'POST',body:input},denied);assert.equal(denied.code,409);
});
