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
  const vertical=renderToStaticMarkup(createElement(Journey,{model,vertical:true}))
  assert.equal((vertical.match(/data-milestone=/g)||[]).length,5)
  assert.match(vertical,/data-orientation="vertical"/)
  assert.doesNotMatch(vertical,/min-w-\[640px\]|overflow-x-auto/)
  assert.match(vertical,/data-milestone="otp_signed" data-milestone-status="complete"/)
  assert.match(vertical,/data-milestone="finance"[^>]*aria-current="step"/)
  assert.doesNotMatch(html,/Legal journey|Matter updates|conversation|Never rendered|data-task-id/)
  const preparation={...model,highLevelJourney:{...model.highLevelJourney,milestones:model.highLevelJourney.milestones.map(step=>step.id==='finance'?{...step,status:'complete',isComplete:true}:step)},currentStepId:'lodgement',legalJourney:{status:'ready',snapshot:{lanes:[{key:'transfer',phases:[{tasks:[{key:'lodgement_ready',status:'waiting'},{key:'lodged_at_deeds_office',status:'not_started'},{key:'registered',status:'not_started'}]}]}]}},currentWorkflowItem:{label:'Ready for lodgement',summary:'Preparing for lodgement',ownerLabel:'Attorney'}}
  const preparationHtml=renderToStaticMarkup(createElement(Journey,{model:preparation}))
  assert.match(preparationHtml,/data-milestone="transfer"[^>]*aria-current="step"/)
  assert.doesNotMatch(preparationHtml,/data-milestone="lodgement"[^>]*aria-current|Current stage|Current matter item|Ready for lodgement|With: Attorney|Current transaction focus/)
  const awaitingInstruction={...preparation,highLevelJourney:{...preparation.highLevelJourney,
    milestones:preparation.highLevelJourney.milestones.map(step=>step.id==='finance'?{...step,status:'waiting',isComplete:false}:step)}}
  for(const vertical of [false,true]){
    const waitingHtml=renderToStaticMarkup(createElement(Journey,{model:awaitingInstruction,vertical}))
    assert.match(waitingHtml,/data-milestone="finance"[^>]*aria-current="step"/)
    assert.doesNotMatch(waitingHtml,/data-milestone="transfer"[^>]*aria-current/)
    assert.equal((waitingHtml.match(/aria-current="step"/g)||[]).length,1)
    assert.match(waitingHtml,/Waiting/)
    assert.match(waitingHtml,/Transfer<\/span><span[^>]*>Pending/)
  }
  const lodged={...preparation,legalJourney:{status:'ready',snapshot:{lanes:[{key:'transfer',phases:[{tasks:[{key:'lodged_at_deeds_office',status:'completed'},{key:'registered',status:'not_started'}]}]}]}}}
  assert.match(renderToStaticMarkup(createElement(Journey,{model:lodged})),/data-milestone="lodgement"[^>]*aria-current="step"/)
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
