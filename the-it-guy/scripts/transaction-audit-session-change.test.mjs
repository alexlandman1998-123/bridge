import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'

const source=await readDomainApiSource()
const a=source.indexOf('async function logTransactionEventIfPossible'),b=source.indexOf('  const insertPayload =',a)
const prefix=source.slice(a,b)
let reads=0,writes=0,current=null
const client={auth:{async getSession(){return{data:{session:current}}}},from(){writes++;throw Error('Unexpected write')}}
const run=Function('supabase','resolveActiveProfileContext',prefix+'return "continue";};return logTransactionEventIfPossible')(client,async()=>{reads++;return{}})
assert.equal(await run(client,{transactionId:'tx',createdBy:'original'}),null)
current={user:{id:'different'}};assert.equal(await run(client,{transactionId:'tx',createdBy:'original'}),null)
assert.equal(reads,0);assert.equal(writes,0)
current={user:{id:'original'}};assert.equal(await run(client,{transactionId:'tx',createdBy:'original'}),'continue');assert.equal(reads,1)
console.log('Delayed optional audits stop after sign-out/account switch and continue for the original actor.')
