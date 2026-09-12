import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { buildDeveloperJourneySnapshot } from '../src/core/transactions/highLevelJourneyAdapter.js'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'
const keys=['lodgement_ready','lodged_at_deeds_office','registered']
const input={transaction:{id:'matter',lifecycle_state:'active'},financeType:'cash',plan:{status:'active',lanes:[{laneKey:'transfer',stepKeys:keys}]},rollup:{transactionId:'matter',usedLegacyFallback:false,workflows:{sales_otp:{requiredSteps:[{key:'signed_otp_received',status:'complete'}]},finance_cash:{requiredSteps:[{key:'proof_of_funds_reviewed',status:'completed'},{key:'cash_confirmation_approved',status:'waiting'}]}},transactionJourneySnapshot:{legalJourney:{status:'ready',snapshot:projectSharedMatterJourneyRead({schemaVersion:1,transactionId:'matter',revision:10,planRevision:10,lanes:[{key:'transfer',phases:[{key:'registration',label:'Registration',clientLabel:'Registration',tasks:keys.map(key=>({key,label:key,clientLabel:key,status:'completed',revision:10}))}]}]}, {audience:'developer'})}}}}
const result=buildDeveloperJourneySnapshot(input)
const readerManifest=structuredClone(input)
readerManifest.plan=null
readerManifest.rollup.transactionJourneySnapshot.legalJourney.snapshot.requiredLaneKeys=['transfer']
assert.equal(buildDeveloperJourneySnapshot(readerManifest).legalJourney.status,'ready','Active reader manifest must not depend on attorney operations or route enrichment')
readerManifest.rollup.transactionJourneySnapshot.legalJourney.snapshot.requiredLaneKeys=['transfer','bond']
assert.equal(buildDeveloperJourneySnapshot(readerManifest).legalJourney.status,'unavailable','Incomplete manifest must remain unavailable')
assert.equal(result.legalJourney,input.rollup.transactionJourneySnapshot.legalJourney)
assert.deepEqual(result.highLevelJourney.milestones.map(m=>m.status),['complete','waiting','complete','complete','complete'])
for(const mutate of [
 x=>x.rollup.transactionId='other',
 x=>x.rollup.transactionJourneySnapshot.legalJourney.snapshot.transactionId='other',
 x=>x.plan.lanes[0].stepKeys.pop(),
 x=>x.rollup.transactionJourneySnapshot.legalJourney.snapshot.planRevision=9,
 x=>x.rollup.transactionJourneySnapshot.legalJourney.snapshot.lanes[0].phases[0].tasks[0].revision=9,
 x=>x.plan=null,
]){const x=structuredClone(input);mutate(x);const r=buildDeveloperJourneySnapshot(x);assert.equal(r.legalJourney.status,'unavailable');assert.ok(r.highLevelJourney.milestones.slice(2).every(m=>m.status==='unknown'))}
const legacy=structuredClone(input);legacy.rollup.usedLegacyFallback=true
assert.deepEqual(buildDeveloperJourneySnapshot(legacy).highLevelJourney.milestones.slice(0,2).map(m=>m.status),['unknown','unknown'])
const reopened=structuredClone(input)
const s=reopened.rollup.transactionJourneySnapshot.legalJourney.snapshot
s.revision=11;s.planRevision=11
for(const task of s.lanes[0].phases[0].tasks)task.revision=11
s.lanes[0].phases[0].tasks[2].status='not_started'
const after=buildDeveloperJourneySnapshot(reopened)
assert.equal(after.highLevelJourney.milestones[4].isComplete,false)
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',esbuild:{jsx:'automatic'},server:{middlewareMode:true}})
try{
 const {default:Overview}=await server.ssrLoadModule('/src/components/transaction/DeveloperOverviewJourney.jsx')
 const {default:Detail}=await server.ssrLoadModule('/src/components/transaction/DeveloperConveyancingJourney.jsx')
 const beforeHtml=renderToStaticMarkup(createElement(Overview,{model:result}))
 const afterHtml=renderToStaticMarkup(createElement(Overview,{model:after}))
 assert.match(beforeHtml,/data-milestone="registration" data-milestone-status="complete"/)
 assert.match(afterHtml,/data-milestone="registration" data-milestone-status="pending"/)
 assert.match(afterHtml,/>Waiting</)
 assert.match(renderToStaticMarkup(createElement(Detail,{result:after.legalJourney})),/data-task-status="not_started"/)
 const unavailable=renderToStaticMarkup(createElement(Overview,{model:{steps:[{id:'otp_signed',isComplete:true}]}}))
 assert.doesNotMatch(unavailable,/>Completed</)
 console.log('High-level integration: shared sources, revision/plan guards, legacy rejection and reopening parity PASS')
}finally{await server.close()}
