import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'
import { buildTransactionJourneyPresentation } from '../src/core/transactions/transactionJourneyPresentation.js'
const server=await createServer({configFile:false,envFile:false,logLevel:'silent',esbuild:{jsx:'automatic'},server:{middlewareMode:true}})
try {
  const {default:Tracker}=await server.ssrLoadModule('/src/components/transaction/TransactionJourneyTracker.jsx')
  const {default:Seller}=await server.ssrLoadModule('/src/components/client-portal/seller/TransactionStageWorkspace.jsx')
  const source={schemaVersion:1,transactionId:'matter',revision:4,planRevision:4,lanes:[{key:'transfer',phases:[
    {key:'instruction',label:'Instruction',clientLabel:'Instruction',tasks:[
      {key:'instruction_received',label:'Instruction received',clientLabel:'Instruction received',status:'completed_externally',revision:4,comment:'PRIVATE NOTE'},
      {key:'authority',label:'Authority',clientLabel:'Authority',status:'not_applicable',revision:4},
      {key:'rates',label:'Rates clearance',clientLabel:'Rates clearance',status:'waiting',revision:4},
    ]},
  ]}]}
  const legalJourney={status:'ready',snapshot:projectSharedMatterJourneyRead(source)}
  const model=buildTransactionJourneyPresentation({snapshot:{schemaVersion:1,transactionId:'matter',milestones:[],legalJourney}})
  assert.doesNotMatch(renderToStaticMarkup(createElement(Tracker,{model,audience:'status-share'})),/Matter updates &amp; conversation/)
  for(const audience of ['attorney','agent','developer','buyer','seller']) {
    const html=renderToStaticMarkup(createElement(Tracker,{model,audience,variant:'detailed'}))
    assert.match(html,/data-shared-legal-revision="4"/)
    assert.match(html,/Completed externally/)
    assert.match(html,/Not applicable/)
    assert.match(html,/Rates clearance/)
    assert.match(html,/50% complete/)
    assert.doesNotMatch(html,/PRIVATE NOTE/)
    assert.equal((html.match(/data-task-id=/g)||[]).length,3)
  }
  const seller=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(Seller,{journeyModel:model,overviewPath:'/overview',documentsPath:'/documents'})))
  assert.match(seller,/Rates clearance/)
  assert.doesNotMatch(seller,/Estimated duration|Current day|What is happening/)
  const unavailable=renderToStaticMarkup(createElement(Tracker,{variant:'detailed',model:{...model,legalJourney:{status:'unavailable',snapshot:null}}}))
  assert.match(unavailable,/Legal journey unavailable/)
  assert.doesNotMatch(unavailable,/data-task-id=/)
  console.log('Shared journey views: 5 audiences render identical tasks/outcomes; seller legacy panel removed; privacy and unavailable-state checks PASS')
} finally {await server.close()}
