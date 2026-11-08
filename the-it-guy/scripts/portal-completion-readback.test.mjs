import assert from 'node:assert/strict'
import {isPortalTransactionRegistered} from '../src/core/clientPortal/transactionCompletion.js'
import {getPassiveStatusActions} from '../src/lib/clientPortalNextActionsEngine.js'
import {readFile} from 'node:fs/promises'
for(const tx of [{lifecycle_state:'completed',status:'reserved'},{registered_at:'2026-11-04',status:'reserved'},{stage:'Registered'}]){
 assert.equal(isPortalTransactionRegistered(tx),true)
 assert.equal(getPassiveStatusActions({transaction:tx,lifecycle:{mainStage:'REG'}})[0].id,'registration_complete')
}
assert.equal(isPortalTransactionRegistered({current_main_stage:'REG',stage:'Registration preparation'}),false)
assert.equal(isPortalTransactionRegistered({lifecycle_state:'cancelled',registered_at:'2026-11-04'}),false)
assert.equal(getPassiveStatusActions({transaction:{lifecycle_state:'completed'},actions:[{blocking:true}]}).length,0)
console.log('Portal completion uses persisted registration facts, preserves blocking actions and rejects preparation/cancelled cases.')

const api=await readFile(new URL('../src/lib/api.js',import.meta.url),'utf8')
const saved={id:'matter',property_address_line_1:'17 Test Street',city:'Johannesburg',province:'Gauteng',
  lifecycle_state:'completed',registered_at:'2026-11-05',completed_at:'2026-11-05',stage:'Reserved'}
for(const name of ['fetchClientPortalCoreByToken','fetchClientPortalByToken']){
  const start=api.indexOf('export async function '+name+'(')
  const end=api.indexOf('\n  if (\n    transactionQuery.error',start)
  assert.ok(start>=0&&end>start)
  const query={from(table){assert.equal(table,'transactions');return this},select(columns){this.columns=columns.split(',').map(s=>s.trim());return this},eq(key,value){assert.equal(key,'id');assert.equal(value,'matter');return this},async maybeSingle(){return {data:Object.fromEntries(this.columns.filter(k=>k in saved).map(k=>[k,saved[k]])),error:null}}}
  const action=new Function('requireClientPortalTokenClient','resolveClientPortalLinkByToken',
    api.slice(start,end).replace('export ','')+'\nreturn transactionQuery.data;\n}; return '+name)(token=>{assert.equal(token,'scoped-link');return query},async()=>({transaction_id:'matter'}))
  const projected=await action('scoped-link')
  for(const key of ['property_address_line_1','city','province','lifecycle_state','registered_at','completed_at'])assert.equal(projected[key],saved[key],name+' must preserve '+key)
  assert.equal(isPortalTransactionRegistered(projected),true)
}
const page=await readFile(new URL('../src/pages/ClientPortal.jsx',import.meta.url),'utf8')
const start=page.indexOf('  const developmentName = pickFirstText(',page.indexOf('const activeSectionLabel'))
const end=page.indexOf('  const buyerName =',start)
assert.ok(start>=0&&end>start)
const display=new Function('portal','portalProfile','pickFirstText',page.slice(start,end)+'return {developmentName,unitLabel}')( {transaction:saved},{isDevelopmentBuyerPortal:false},(...values)=>values.find(v=>String(v||'').trim())||'')
assert.equal(display.developmentName,'17 Test Street')
assert.equal(display.unitLabel,'Johannesburg, Gauteng')
console.log('Both actual buyer query builders retain scoped canonical property/lifecycle fields; the actual header renders the stored address and location.')
