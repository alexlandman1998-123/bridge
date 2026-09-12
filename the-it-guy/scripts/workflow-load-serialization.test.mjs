import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const start = page.indexOf('  const loadWorkspaceDataset = useCallback(')
const end = page.indexOf('  const refreshTransactionDatasets =', start)
const source = page.slice(start, end)
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r}); return {promise,resolve} }
for (const workspaceRole of ['attorney', 'developer', 'agent']) {
  const loads = [], operationLoads = [], states = [], ref = {current:new Map()}, scope = {current:'scope'}
  let operations = 0
  const environment = {
    useCallback: f=>f, transactionId:'matter', isSupabaseConfigured:true,
    liveMatterScopeRef:scope, workspaceDatasetRequestRef:ref,
    setWorkspaceDatasetLoads:()=>{}, setData:f=>states.push(f({})),
    setWorkflowOperations:()=>{}, setWorkflowError:()=>{}, workspaceRole,
    requestWorkspaceHydrationContext:async()=>({}),
    loadTransactionWorkspaceDataset:()=>{const d=deferred(); loads.push(d); return d.promise},
    getAttorneyWorkflowOperationsForTransaction:()=>{const d=deferred(); operations++; operationLoads.push(d); return d.promise},
  }
  const load = new Function(...Object.keys(environment), `${source}; return loadWorkspaceDataset`)(...Object.values(environment))
  const first=load('workflow')
  await new Promise(r=>setImmediate(r))
  const forced=load('workflow',{force:true})
  const duplicate=load('workflow',{force:true})
  const authoritativeLoads = workspaceRole === 'attorney' ? operationLoads : loads
  assert.equal(authoritativeLoads.length,1,'Concurrent signal must not start competing load')
  assert.equal(loads.length,workspaceRole==='attorney'?0:1,'Attorney Work must not duplicate the generic task-table read')
  authoritativeLoads[0].resolve(workspaceRole === 'attorney' ? {lanes:[]} : {transactionSubprocesses:['first']})
  await first
  await new Promise(r=>setImmediate(r))
  assert.equal(states.length,1,'First successful read must paint before queued refresh')
  assert.equal(authoritativeLoads.length,2,'Signals must coalesce into one fresh read')
  authoritativeLoads[1].resolve(workspaceRole === 'attorney' ? {lanes:[]} : {transactionSubprocesses:['fresh']})
  await Promise.all([forced,duplicate])
  assert.equal(states.length,2)
  assert.equal(operations,workspaceRole==='attorney'?2:0,'Read-only roles must not load attorney operations')
  assert.equal(states[1].__workflowHydrated,true)
}
console.log('PASS: first paint, serialized forced refresh, signal coalescing and operator isolation')
