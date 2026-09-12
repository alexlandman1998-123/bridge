import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import {projectSharedMatterJourneyRead} from '../src/services/sharedMatterJourneyReader.js'
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',esbuild:{jsx:'automatic'},server:{middlewareMode:true}})
try {
  const {default:Panel}=await server.ssrLoadModule('/src/components/transaction/AgentConveyancingJourney.jsx')
  const render=props=>renderToStaticMarkup(createElement(Panel,props))
  for(const status of ['completed','not_applicable','not_started']) {
    const result={status:'ready',snapshot:projectSharedMatterJourneyRead({schemaVersion:1,transactionId:'test-matter',revision:5,planRevision:5,lanes:['transfer','bond','cancellation'].map(key=>({key,phases:[{key:'instruction',label:'Instruction',clientLabel:'Instruction',tasks:[{key:'received',label:'Instruction received',status,revision:5},{key:'opened',label:'File opened',status:'completed',revision:5}]}]}))},{audience:'agent'})}
    const before=JSON.stringify(result)
    const html=render({result})
    assert.equal((html.match(new RegExp(`data-task-status="${status}"`,'g'))||[]).length,status==='completed'?6:3)
    const fraction=status==='completed'?'2/2':status==='not_applicable'?'1/1':'1/2'
    assert.ok(html.includes(`${fraction} complete`))
    assert.match(html,status==='not_started'?/50% complete/:/100% complete/)
    assert.doesNotMatch(html,/Complete task|Mark complete|0\/27/)
    assert.equal(JSON.stringify(result),before)
    assert.match(render({result,loading:true}),/data-shared-legal-revision="5"/,'Background refresh retains the loaded journey')
  }
  const missing=render({result:{status:'unavailable'}})
  assert.match(missing,/Legal journey unavailable/);assert.doesNotMatch(missing,/data-task-id|0%|0\/27/)
  assert.match(render({loading:true}),/Loading legal journey/)
  const source=readFileSync('src/pages/AttorneyTransactionDetail.jsx','utf8')
  assert.match(source,/<AgentConveyancingJourney\s+result=\{agentOverviewJourneyModel\?\.legalJourney\}/)
  assert.doesNotMatch(source,/<AgentConveyancingWorkspace\s/,'Old fallback renderer must not be mounted')
  console.log('PASS: agent canonical lanes, completion, N/A denominator, reopen, refresh retention, unavailable state and wiring')
}finally{await server.close()}
