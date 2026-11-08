import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/lib/api.js',import.meta.url),'utf8')
const a=source.indexOf('async function ensureTransactionAttorneyCloseout('),b=source.indexOf('\nfunction buildAttorneyCloseoutViewModel',a)
let persist,allowed=false,writes=0
const existing={id:'closeout',transaction_id:'tx',responsible_attorney_firm_id:'firm',actual_billed_amount:15000,close_out_status:'closed'}
const client={from(){return{select(){return this},eq(){return this},async maybeSingle(){return{data:existing,error:null}},insert(){writes++;throw Error('Unexpected insert')},upsert(){writes++;throw Error('Unexpected upsert')}}},async rpc(){return{data:allowed,error:null}}}
const ensure=Function('isRegisteredTransactionForCloseout','isMissingSchemaError','fetchDevelopmentAttorneyConfig','normalizeOptionalNumber','syncTransactionAttorneyCloseoutDocuments',source.slice(a,b)+';return ensureTransactionAttorneyCloseout')(
 ()=>true,()=>false,async()=>null,v=>v??null,async(_client,id,_config,options)=>{assert.equal(id,'closeout');persist=options.persistDefinitions;return[]})
const read=await ensure(client,{id:'tx'})
assert.equal(persist,false);assert.equal(writes,0);assert.equal(read.closeout.actual_billed_amount,15000)
allowed=true;await ensure(client,{id:'tx'});assert.equal(persist,true)
console.log('Existing financial closeout reads preserve billed state and cannot trigger writes for a read-only viewer.')
