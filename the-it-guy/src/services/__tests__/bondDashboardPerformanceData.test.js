import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ server:{middlewareMode:true}, appType:'custom', optimizeDeps:{noDiscovery:true,entries:[]} })
try {
  const { readBondDashboardPerformance } = await server.ssrLoadModule('/src/services/bondDashboardPerformanceData.js')
  const calls = []
  const tables = { transaction_bond_applications:[{id:'bank-1',transaction_id:'tx-1'}],bond_applications:[{id:'form-1',transaction_id:'tx-1'}],bond_commissions:[{id:'c-1',application_id:'form-1',amount:100,status:'Pending'},{id:'c-2',application_id:'bank-1',amount:200,status:'Approved'}] }
  const client = { from(table) {
    const request = { table };calls.push(request)
    return { select(columns){request.columns=columns;return this},in(key,ids){request.key=key;request.ids=ids;return this},order(key){request.order=key;return this},range(start,end){request.range=[start,end];return this},eq(key,value){request.scope=[key,value];return this},then(resolve){resolve({data:tables[table] || [],error:null})} }
  } }
  const result = await readBondDashboardPerformance(['tx-1'],'org-1',client)
  assert.deepEqual(calls.slice(0,2).map((call)=>call.ids),[['tx-1'],['tx-1']], 'Extra datasets may only query visible transactions')
  assert.deepEqual(calls[2].scope,['organisation_id','org-1'])
  assert.deepEqual(calls[2].ids,['tx-1','bank-1','form-1'])
  assert.deepEqual(result.commissions.map((record)=>record.transaction_id),['tx-1','tx-1'],'Both application types map back to visible matters')
  assert.equal(result.commissionAvailable,true)
  calls.length=0
  await readBondDashboardPerformance([], 'org-1', client)
  assert.equal(calls.length,0,'An empty scope never falls back to reading the whole organisation')
  const broken = {from(){return {select(){return this},in(){return this},order(){return this},range(){return this},eq(){return this},then(resolve){resolve({data:null,error:{message:'Access denied'}})}}}}
  const unavailable = await readBondDashboardPerformance(['tx-1'],'org-1',broken)
  assert.equal(unavailable.bankAvailable,false)
  assert.equal(unavailable.commissionAvailable,false,'Read failures must never masquerade as a verified zero')
  // The API default limit must not silently truncate a large lender portfolio.
  let pages = 0
  const paged = {from(table){let start=0;return {select(){return this},in(){return this},order(){return this},range(value){start=value;return this},eq(){return this},then(resolve){if(table==='transaction_bond_applications'){pages++;resolve({data:start===0?Array.from({length:500},(_,i)=>({id:`b-${i}`,transaction_id:'tx-1'})):[],error:null})}else resolve({data:[],error:null})}}}}
  await readBondDashboardPerformance(['tx-1'],'org-1',paged)
  assert.equal(pages,2)
  console.log('Bond performance reads: passed')
} finally { await server.close() }
