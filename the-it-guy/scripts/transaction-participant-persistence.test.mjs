import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'

const source=readDomainApiSource()
const start=source.indexOf('async function upsertTransactionParticipantsRowsWithFallback(')
const end=source.indexOf('\nasync function ensureTransactionParticipants',start)
const persist=new Function('normalizeRoleType','normalizeAttorneyLegalRole','normalizeTransactionParticipantAssignmentSource',
 'normalizeStakeholderStatus','isOnConflictConstraintError','isMissingColumnError',
 `${source.slice(start,end)};return upsertTransactionParticipantsRowsWithFallback`)(
 value=>value,value=>value||'transfer',value=>value,value=>value,error=>error?.code==='42P10',error=>error?.code==='42703')

function fixture({race=false,existing=null}={}) {
 const writes=[];let row=existing;let lookups=0
 const client={from(table){assert.equal(table,'transaction_participants');let mode='read';let value
  const chain={select(){return chain},eq(){return chain},
   upsert(data){writes.push('upsert');value=data;mode='upsert';return chain},
   update(data){writes.push('update');row={...row,...data};mode='update';return chain},
   insert(data){writes.push('insert');value=data;mode='insert';return chain},
   async maybeSingle(){if(mode==='read'){lookups++;return {data:row,error:null}}return {data:row,error:null}},
   async single(){assert.equal(mode,'insert');if(race){row={id:'concurrent'};return {data:null,error:{code:'23505'}}}row={id:'new',...value};return {data:row,error:null}},
   async in(){return {data:[row],error:null}},
   then(resolve){return Promise.resolve({data:[{id:'buyer'}],error:null}).then(resolve)}}
  return chain}}
 return {client,writes,get row(){return row},get lookups(){return lookups}}
}
const role={transaction_id:'matter',role_type:'attorney',legal_role:'transfer',status:'active'}
for(const options of [{},{existing:{id:'existing'}},{race:true}]) {
 const f=fixture(options);const result=await persist(f.client,{rows:[role]})
 assert.equal(result.error,null)
 assert.ok(!f.writes.includes('upsert'),'Non-buyer writes must not target an unsupported partial-index upsert.')
 assert.equal(f.row.transaction_id,'matter');assert.equal(f.row.role_type,'attorney');assert.equal(f.row.legal_role,'transfer')
 if(options.race){assert.deepEqual(f.writes,['insert','update']);assert.equal(f.lookups,2);assert.equal(f.row.id,'concurrent')}
}
const buyer=fixture();await persist(buyer.client,{rows:[{transaction_id:'matter',role_type:'buyer',transaction_role:'buyer'}]})
assert.deepEqual(buyer.writes,['upsert'],'Buyer-party identities must retain their separate persistence route.')
console.log('Participant persistence: new identity, existing assignment, concurrent insert recovery and buyer-route preservation passed.')
