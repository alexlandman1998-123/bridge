import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assertTransferTaxLodgementReadiness} from '../src/services/attorneyWorkflow/transferTaxLodgementGate.js'
import {phase4TaxTaskKeys} from '../src/services/attorneyWorkflow/transferPhase4Policy.js'
const source=readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js',import.meta.url),'utf8')
const start=source.indexOf('async function assertTransferTaxGateBeforeLodgement('),end=source.indexOf('\nexport async function ',start)
let profile={transferTaxDecision:{route:'transfer_duty',status:'confirmed',tdc01Reference:'STAGING-TDC',dutyPaymentRequired:'yes',assessmentReference:'STAGING-ASSESSMENT',paymentReference:'STAGING-DUTY',basisNote:'Synthetic attorney review',sarsProofReference:'STAGING-RECEIPT',sarsStatus:'receipted',sellerNonResidentReview:'yes',nonResidentSellers:{seller:{applicable:'yes',basisNote:'Synthetic review',directiveStatus:'issued',directiveReference:'STAGING-DIRECTIVE',withholdingRequired:'yes',paymentReference:'STAGING-NO-PAYMENT',proofReference:'STAGING-PROOF'}}},scenarioProfile:{parties:[{id:'seller',role:'seller',taxResidence:'outside_south_africa'}]}}
const steps=()=>phase4TaxTaskKeys(profile.transferTaxDecision,profile.scenarioProfile).map(step_key=>({step_key,status:'completed'}))
const client={from:()=>({select:()=>({eq:async()=>({data:steps(),error:null})})})}
const gate=new Function('fetchTransaction','assertTransferTaxLodgementReadiness',source.slice(start,end)+'\nreturn assertTransferTaxGateBeforeLodgement')(async()=>({routing_profile_json:profile}),assertTransferTaxLodgementReadiness)
const command={transactionId:'controlled',lane:{id:'transfer'},laneKey:'transfer',stepKey:'lodgement_ready',status:'completed'}
await gate(client,command)
profile={...profile,scenarioProfile:{parties:[]}}
await assert.rejects(()=>gate(client,command),/seller-by-seller tax residence/)
profile.scenarioProfile={parties:[{id:'seller',role:'seller',taxResidence:'outside_south_africa'}]}
profile.mvpProfile={hoaApplicable:'no',propertyConditions:{titleRestrictions:'no',complianceCertificates:'no',certificates:{electrical:'no'},electricalBasisNote:'Synthetic undeveloped erf',clearances:{municipal:{issuer:'Controlled municipality',reference:'STAGING-CLEARANCE',validUntil:'2020-01-01'}}}}
profile.propertyTenure='freehold'
await assert.rejects(()=>gate(client,command),/municipal clearance validity/)
profile.mvpProfile.propertyConditions.clearances.municipal.validUntil=new Date(Date.now()+30*86400000).toISOString().slice(0,10)
await gate(client,command)
console.log('PASS actual lodgement caller forwards seller-specific decisions and property context, accepts complete reviews, and blocks missing residence facts or expired clearances.')
