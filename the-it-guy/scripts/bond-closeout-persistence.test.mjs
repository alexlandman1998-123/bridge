import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/lib/api.js',import.meta.url),'utf8')
const a=source.indexOf('async function syncTransactionBondCloseoutDocuments('),b=source.indexOf('\nasync function ensureTransactionBondCloseout',a)
const sync=new Function('buildDefaultDevelopmentBondDocuments','normalizeDevelopmentBondDocumentRow','isMissingSchemaError','normalizeBondCloseoutDocumentRow','getSignedUrl',source.slice(a,b)+';return syncTransactionBondCloseoutDocuments')(
 ()=>[{key:'statement',requiredForCloseOut:true,label:'Statement'}],v=>v,()=>false,v=>v,async path=>'signed:'+path)
const saved={id:'file',document_type_key:'statement',status:'uploaded',file_path:'owned/statement.pdf',filename:'statement.pdf'}
const client={from(){const query={upsert(rows,options){assert.equal(options.ignoreDuplicates,true);for(const row of rows)if(row.document_type_key!==saved.document_type_key)throw Error('Unexpected definition');return query},select(){return query},async eq(){return {data:[saved],error:null}},then(resolve){return Promise.resolve({error:null}).then(resolve)}};return query}}
for(let i=0;i<3;i++){
 const files=await sync(client,'closeout')
 assert.equal(files[0].status,'uploaded');assert.equal(files[0].file_path,'owned/statement.pdf');assert.equal(files[0].url,'signed:owned/statement.pdf')
}
const start=source.indexOf('function isBondCommissionEligible('),end=source.indexOf('\nfunction ',start+10)
const eligible=new Function('normalizeFinanceType','isBondFinanceType','getMainStageFromDetailedStage','normalizeStageLabel',source.slice(start,end)+';return isBondCommissionEligible')(
 v=>v,v=>['bond','hybrid','combination'].includes(v),()=>'',v=>v)
assert.equal(eligible({finance_type:'bond',current_main_stage:'post_registration',registered_at:'2026-11-04'}),true)
assert.equal(eligible({finance_type:'bond',stage:'Reserved',finance_status:'Complete'}),true)
assert.equal(eligible({finance_type:'cash',registered_at:'2026-11-04'}),false)
assert.equal(eligible({finance_type:'bond',stage:'Reserved'}),false)
console.log('PASS repeated bond closeout reads retain uploaded file state; canonical registration and finance completion establish eligibility without enabling a cash or unapproved route.')
