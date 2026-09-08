import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',esbuild:{jsx:'automatic'},server:{middlewareMode:true}})
try {
  const {default:Conveyancing}=await server.ssrLoadModule('/src/components/transaction/DeveloperConveyancingJourney.jsx')
  const result={status:'ready',snapshot:projectSharedMatterJourneyRead({schemaVersion:1,transactionId:'matter',revision:9,planRevision:9,lanes:['transfer','bond','cancellation'].map(key=>({key,phases:[{key:'instruction',label:'Instruction',clientLabel:'Instruction',tasks:[{key:'received',label:`${key} instruction`,clientLabel:`${key} instruction`,status:'completed_externally',revision:9}]}]}))})}
  const before=JSON.stringify(result)
  const html=renderToStaticMarkup(createElement(Conveyancing,{result}))
  assert.equal((html.match(/data-task-id=/g)||[]).length,3)
  assert.match(html,/data-shared-legal-revision="9"/)
  assert.match(html,/Bond registration/);assert.match(html,/Bond cancellation/)
  assert.doesNotMatch(html,/data-matter-conversation|Read-only conversation|Post update|Complete task/)
  assert.equal(JSON.stringify(result),before)
  const empty=renderToStaticMarkup(createElement(Conveyancing,{result:{status:'ready',snapshot:{...result.snapshot,lanes:[]}}}))
  assert.match(empty,/No legal workflow/)
  assert.match(renderToStaticMarkup(createElement(Conveyancing,{result:{status:'unavailable'}})),/Legal journey unavailable/)
  const loading=renderToStaticMarkup(createElement(Conveyancing,{result,loading:true}))
  assert.match(loading,/Loading legal journey/);assert.doesNotMatch(loading,/data-task-id/)
  let opened=false
  Conveyancing({result,onOpenActivity:()=>{opened=true}}).props.children[0].props.children[1].props.onClick()
  assert.equal(opened,true)
  const page=readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx',import.meta.url),'utf8')
  assert.match(page,/isDeveloperTransactionView \? <DeveloperConveyancingJourney/)
  assert.match(page,/isDeveloperTransactionView \? <MatterConversation transactionId=/)
  assert.match(page,/composer=\{isDeveloperTransactionView \? null/)
  assert.match(page,/developerOverview \? <div[^]*?Open updates &amp; conversation/)
  assert.match(page,/activeWorkspaceMenu === 'deal_setup'[^]*?<DealSetupPanel/)
  assert.match(page,/activeWorkspaceMenu === 'finance'[^]*?financeCommandCenterPanel/)
  console.log('Developer placement: shared legal lanes, Activity link, loading/empty states and tab wiring PASS')
}finally{await server.close()}
