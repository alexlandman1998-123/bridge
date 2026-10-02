import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createTransactionDetailReviewFixture} from './lib/transactionDetailReviewFixture.mjs'
import {reviewSectionDetails,transactionReviewedBuyerName} from '../src/core/transactions/transactionDetailReview.js'
const {db,tx,other,org,user,viewer,buyer,party,pdf,wrong,lost,ordinary,candidate,future}=await createTransactionDetailReviewFixture()
const privilegeAudit=(await db.query(`select has_function_privilege('anon','public.bridge_get_imported_transaction_review_status(uuid[])','execute') anon_execute,has_function_privilege('authenticated','public.bridge_get_imported_transaction_review_status(uuid[])','execute') authenticated_execute,has_schema_privilege('authenticated','deal_review_private','usage') private_usage`)).rows[0]
assert.deepEqual(privilegeAudit,{anon_execute:false,authenticated_execute:true,private_usage:false})
assert.equal((await db.query("select has_function_privilege('authenticated','deal_review_private.funding_valid(jsonb)','execute') allowed")).rows[0].allowed,false)
const statuses=async(ids=[tx,other,ordinary,candidate,future])=>(await db.query('select bridge_get_imported_transaction_review_status($1) r',[ids])).rows[0].r
const identity=async(id=user,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('test.user',$1,false)",[id||'']);await db.exec(`set role ${role}`)}
const load=async(id=tx)=>(await db.query('select bridge_get_transaction_detail_review($1) r',[id])).rows[0].r
const section=(r,k)=>r.sections.find(s=>s.key===k)
const save=async(r,k,changes={},confirm=false,source=null)=>{const s=section(r,k);return(await db.query('select bridge_save_transaction_detail_review($1,$2,$3,$4,$5,$6,$7) r',[tx,k,JSON.stringify({...reviewSectionDetails(k,s.currentSnapshot),...changes}),JSON.stringify(s.currentSnapshot),s.revision,confirm,source])).rows[0].r}
await identity()
let summaries=await statuses()
assert.equal(summaries.length,3)
assert.equal(summaries.find(s=>s.transactionId===tx).evidence,'identified')
assert.equal(summaries.find(s=>s.transactionId===tx).status,'needs_review')
assert.equal(summaries.find(s=>s.transactionId===candidate).status,'import_candidate')
assert.equal(summaries.find(s=>s.transactionId===future).status,'needs_review')
assert.ok(!summaries.some(s=>s.transactionId===ordinary||s.transactionId===other))
await assert.rejects(statuses(Array(201).fill(tx)),/at most 200/)
await db.exec('reset role')
assert.equal((await db.query('select count(*)::int n from deal_review_private.sections')).rows[0].n,0,'read-only rollout must not create confirmations')
assert.equal((await db.query('select sale_date::text,stage from transactions where id=$1',[tx])).rows[0].sale_date,'2024-04-03')
await identity()
let review=await load();assert.equal(review.sections.length,5);assert.equal(review.history.length,0);assert.equal(review.documents.find(d=>d.id===lost).available,false)
await assert.rejects(db.query('select * from deal_review_private.sections'),/permission denied/);await assert.rejects(load(other),/authorised/)
await identity(viewer);assert.equal((await statuses()).length,3);assert.doesNotMatch(JSON.stringify(await statuses()),/PRIVATE|Scanned name|actorName/);await assert.rejects(load(),/authorised/);await assert.rejects(save(review,'seller',{name:'Unauthorised'}),/authorised/);await identity(null,'anon');await assert.rejects(statuses(),/permission denied/);await assert.rejects(load(),/permission denied/);await identity()
await assert.rejects(save(review,'buyer',{},true),/source PDF/);await assert.rejects(save(review,'buyer',{},true,wrong),/another transaction/);await assert.rejects(save(review,'buyer',{},true,lost),/unavailable/)
const original=review
review=await save(review,'buyer',{name:'Correct name',email:'correct@example.com',identityNumber:'PRIVATE-ID'},true,pdf)
assert.equal(section(review,'buyer').status,'confirmed');assert.equal(section(review,'buyer').currentSnapshot.name,'Correct name');assert.equal(section(review,'buyer').capturedSnapshot.name,'Scanned name');assert.equal(review.history[0].actorName,'Reviewer One');assert.equal((await statuses([tx]))[0].status,'in_review');assert.equal((await statuses([tx]))[0].confirmedCount,1)
await assert.rejects(save(original,'buyer',{name:'Stale'}),/Details changed/)
await db.exec('reset role');const canonical=(await db.query('select * from transactions where id=$1',[tx])).rows[0]
assert.equal(canonical.sale_date.toISOString().slice(0,10),'2024-04-03');assert.equal(canonical.stage,'Transfer');assert.equal(canonical.buyer_id,buyer);assert.equal(canonical.primary_buyer_participant_id,party);assert.equal(transactionReviewedBuyerName(canonical),'Correct name');assert.equal(transactionReviewedBuyerName({...canonical,buyer_id:randomUUID()}),'');assert.doesNotMatch(JSON.stringify(canonical.deal_review_details),/PRIVATE-ID|correct@example/);assert.equal((await db.query('select name from buyers where id=$1',[buyer])).rows[0].name,'Shared profile')
await db.query("update storage.objects set updated_at=updated_at+interval '1 second' where name='otp.pdf'");await identity();review=await load();assert.equal(section(review,'buyer').status,'needs_review')
for(const [key,changes] of [['seller',{name:'Correct seller',identityNumber:'SELLER-PRIVATE'}],['property',{addressLine1:'Correct property'}],['attorney',{firmName:'Captured corrected firm',email:'captured@example.com'}]]) {review=await save(review,key,changes,true,pdf);assert.equal(section(review,key).status,'confirmed')}
review=await save(review,'buyer',{},true,pdf);assert.equal((await statuses([tx]))[0].status,'in_review');assert.equal((await statuses([tx]))[0].confirmedCount,4);
await assert.rejects(save(review,'funding',{purchasePrice:'-1',financeType:'cash',cashAmount:'100'},true,pdf),/non-negative/);
await assert.rejects(save(review,'funding',{purchasePrice:'100',depositAmount:'0',financeType:'bond',bondAmount:'100'},true,pdf),/finance manager/);
await assert.rejects(save(review,'funding',{purchasePrice:'1000000',depositAmount:'100000',financeType:'hybrid',cashAmount:'200000',bondAmount:'700000',managedBy:'client'},true,pdf),/does not reconcile/);
const beforeFunding=review;review=await save(review,'funding',{purchasePrice:'1000000',depositAmount:'100000',financeType:'hybrid',cashAmount:'300000',bondAmount:'700000',managedBy:'client',bank:'Example Bank'},true,pdf);
assert.equal(section(review,'funding').status,'confirmed');await assert.rejects(save(beforeFunding,'funding',{bank:'Stale bank'}),/Details changed/);
assert.equal((await statuses([tx]))[0].status,'reviewed');assert.equal((await statuses([tx]))[0].confirmedCount,5);assert.equal((await statuses([tx]))[0].totalSections,5)
await db.exec('reset role');await db.query("update transactions set bond_amount=650000 where id=$1",[tx]);await identity();review=await load();assert.equal(section(review,'funding').status,'needs_review');assert.equal((await statuses([tx]))[0].status,'in_review');review=await save(review,'funding',{bondAmount:'700000'},true,pdf);
for (const route of [
  {financeType:'cash',cashAmount:'1000000'},
  {financeType:'bond',bondAmount:'900000',managedBy:'bond_originator',bank:'Selected Bank'},
  {financeType:'hybrid',cashAmount:'300000',bondAmount:'700000',managedBy:'client'}
]) {
  review=await save(review,'funding',route,true,pdf);assert.equal(section(review,'funding').status,'confirmed');
  const snapshot=section(review,'funding').currentSnapshot;
  if(route.financeType==='cash'){assert.equal(snapshot.bondAmount,'');assert.equal(snapshot.managedBy,'');assert.equal(snapshot.bank,'')}
  if(route.financeType==='bond')assert.equal(snapshot.cashAmount,'');
  assert.equal(review.saleDate,'2024-04-03');assert.equal(review.stage,'Transfer');
}
await db.exec('reset role');assert.equal((await db.query('select assigned_attorney_email from transactions where id=$1',[tx])).rows[0].assigned_attorney_email,'appointed@example.com');await db.query("update transactions set seller_name='External change' where id=$1",[tx]);await identity();await assert.rejects(save(review,'seller',{name:'Overwrite'}),/Details changed/);review=await load();assert.equal(section(review,'seller').status,'needs_review');assert.equal((await statuses([tx]))[0].status,'in_review');review=await save(review,'seller',{name:'Draft correction'});assert.equal(section(review,'seller').status,'needs_review');assert.equal(section(review,'seller').revision,2)
await db.exec('reset role');await db.query("delete from storage.objects where name='otp.pdf'");await identity();assert.equal((await statuses([tx]))[0].sourceAvailable,false);assert.equal((await statuses([tx]))[0].status,'needs_review');await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name) values('documents','otp.pdf')");await identity();review=await load();const before=review

await db.exec('reset role');await db.exec("create function reject_review_event() returns trigger language plpgsql as $$begin raise exception 'Test history failure';end$$;create trigger reject_review_event before insert on deal_review_private.events for each row execute function reject_review_event();");await identity();await assert.rejects(save(review,'seller',{name:'Must roll back'}),/Test history failure/);assert.deepEqual(await load(),before)
await db.exec('reset role');await db.exec('drop trigger reject_review_event on deal_review_private.events');await db.query('update transaction_participants set is_primary_buyer=false where id=$1',[party]);await identity();review=await load();await assert.rejects(save(review,'buyer',{},true,pdf),/primary buyer links/)
await db.close();
// Upgrade an already-reviewed four-section import without rewriting its history.
const legacy=await createTransactionDetailReviewFixture({fundingReview:false});
await legacy.db.query("select set_config('test.user',$1,false)",[legacy.user]);await legacy.db.exec('set role authenticated');
let legacyReview=(await legacy.db.query('select bridge_get_transaction_detail_review($1) r',[legacy.tx])).rows[0].r;
for (const item of legacyReview.sections) {
  const result=await legacy.db.query('select bridge_save_transaction_detail_review($1,$2,$3,$4,$5,$6,$7) r',[legacy.tx,item.key,JSON.stringify(reviewSectionDetails(item.key,item.currentSnapshot)),JSON.stringify(item.currentSnapshot),item.revision,true,legacy.pdf]);
  legacyReview=result.rows[0].r;
}
assert.equal((await legacy.db.query('select bridge_get_imported_transaction_review_status($1) r',[[legacy.tx]])).rows[0].r[0].status,'reviewed');
await legacy.db.exec('reset role');await legacy.db.exec(readFileSync(new URL('../../supabase/migrations/20261001195834_imported_transaction_funding_review.sql',import.meta.url),'utf8'));await legacy.db.exec('set role authenticated');
const upgraded=(await legacy.db.query('select bridge_get_transaction_detail_review($1) r',[legacy.tx])).rows[0].r;
assert.equal(upgraded.sections.length,5);assert.equal(upgraded.sections.filter(s=>s.status==='confirmed').length,4);assert.equal(upgraded.history.length,4);assert.equal(upgraded.sections.find(s=>s.key==='funding').status,'needs_review');
assert.equal((await legacy.db.query('select bridge_get_imported_transaction_review_status($1) r',[[legacy.tx]])).rows[0].r[0].status,'in_review');await legacy.db.close();
// Previously confirmed, unreconciled finance loses its green state on upgrade.
const oldFunding=await createTransactionDetailReviewFixture({fundingValidation:false});
await oldFunding.db.query("select set_config('test.user',$1,false)",[oldFunding.user]);await oldFunding.db.exec('set role authenticated');
const oldReview=(await oldFunding.db.query('select bridge_get_transaction_detail_review($1) r',[oldFunding.tx])).rows[0].r;
const oldSection=oldReview.sections.find(s=>s.key==='funding');
await oldFunding.db.query('select bridge_save_transaction_detail_review($1,$2,$3,$4,$5,$6,$7)',[oldFunding.tx,'funding',JSON.stringify(reviewSectionDetails('funding',{purchasePrice:'1000',depositAmount:'100',financeType:'cash',cashAmount:'900'})),JSON.stringify(oldSection.currentSnapshot),0,true,oldFunding.pdf]);
await oldFunding.db.exec('reset role');await oldFunding.db.exec(readFileSync(new URL('../../supabase/migrations/20261001201355_imported_transaction_funding_validation.sql',import.meta.url),'utf8'));await oldFunding.db.exec('set role authenticated');
const reconciled=(await oldFunding.db.query('select bridge_get_transaction_detail_review($1) r',[oldFunding.tx])).rows[0].r;
assert.equal(reconciled.sections.find(s=>s.key==='funding').status,'needs_review');assert.equal(reconciled.history.length,1);
assert.equal((await oldFunding.db.query('select bridge_get_imported_transaction_review_status($1) r',[[oldFunding.tx]])).rows[0].r[0].confirmedCount,0);await oldFunding.db.close();
console.log('Transaction review database checks passed: legacy/future import status, permissions, atomicity, sources, conflicts, history and preserved dates.')
