import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',esbuild:{jsx:'automatic'},server:{middlewareMode:true}})
try {
  const {default:Journey}=await server.ssrLoadModule('/src/components/transaction/DeveloperOverviewJourney.jsx')
  const model={highLevelJourney:{ruleVersion:1,milestones:[{id:'otp_signed',isComplete:true,status:'complete'},{id:'finance',status:'in_progress'},{id:'transfer',status:'pending'},{id:'lodgement',status:'pending'},{id:'registration',status:'pending'}]},legalJourney:{status:'ready',snapshot:{lanes:[{private:'Never rendered'}]}}}
  const html=renderToStaticMarkup(createElement(Journey,{model}))
  assert.equal((html.match(/data-milestone=/g)||[]).length,5)
  assert.match(html,/overflow-x-auto/)
  assert.match(html,/min-w-\[640px\]/)
  assert.match(html,/aria-current="step"/)
  assert.doesNotMatch(html,/Legal journey|Matter updates|conversation|Never rendered|data-task-id/)
  const opened=[]
  function walk(node){if(!node||typeof node!=='object')return;if(node.type==='button')node.props.onClick();const children=node.props?.children;for(const child of [children].flat(Infinity))walk(child)}
  walk(Journey({model,onOpenWorkspace:target=>opened.push(target)}))
  assert.deepEqual(opened,['transfer','deal_setup','finance','transfer','transfer','transfer'])
  const loading=renderToStaticMarkup(createElement(Journey,{model,loading:true}))
  assert.match(loading,/aria-busy="true"/);assert.doesNotMatch(loading,/Completed|aria-current/)
  const missing=renderToStaticMarkup(createElement(Journey,{model:{}}))
  assert.equal((missing.match(/Not available/g)||[]).length,5)
  const page=readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx',import.meta.url),'utf8')
  assert.match(page,/developerOverview=\{isDeveloperTransactionView\}/)
  assert.match(page,/developerOverview \? <DeveloperOverviewJourney/)
  assert.match(page,/plan: transaction\?\.routing_profile_json\?\.workflowPlan/, 'Developer journey must use persisted plan without waiting for attorney operations')
  console.log('Developer Overview: five milestones, navigation, loading, empty state and no legal detail PASS')
}finally{await server.close()}
