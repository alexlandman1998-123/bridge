import assert from 'node:assert/strict'
import {trackTransactionBackgroundWork,flushTransactionBackgroundWork} from '../src/lib/transactionBackgroundWork.js'
let releaseA,releaseB,releaseLate
const a=trackTransactionBackgroundWork('a',new Promise(resolve=>{releaseA=resolve}))
const b=trackTransactionBackgroundWork('b',new Promise(resolve=>{releaseB=resolve}))
let done=false
const flush=flushTransactionBackgroundWork({transactionId:'a'}).then(()=>{done=true})
await new Promise(resolve=>setTimeout(resolve,0));assert.equal(done,false)
const late=trackTransactionBackgroundWork('a',new Promise(resolve=>{releaseLate=resolve}))
releaseA();await a;await new Promise(resolve=>setTimeout(resolve,0));assert.equal(done,false,'Drain includes work started while waiting')
releaseLate();await Promise.all([late,flush]);assert.equal(done,true,'An unrelated matter must not block a scoped lifecycle gate')
assert.equal((await flushTransactionBackgroundWork({timeoutMs:5})).complete,false,'Logout has a bounded wait during a network outage')
releaseB();await b
const failure=trackTransactionBackgroundWork('a',Promise.reject(Error('Controlled failed reporting')))
await assert.rejects(failure,/Controlled failed/)
assert.equal((await flushTransactionBackgroundWork()).complete,true,'A rejected report must release its registry entry')
console.log('PASS background-save drainage, work added during drain, matter isolation, bounded logout and failure release.')
