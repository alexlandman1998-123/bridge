import assert from 'node:assert/strict'
import { evaluateHighLevelJourney } from '../src/core/transactions/highLevelJourneyRules.js'
const keys={transfer:['lodgement_ready','lodged_at_deeds_office','registered'],bond:['bond_lodgement_ready','bond_lodged','bond_registered'],cancellation:['cancellation_lodgement_ready','cancellation_lodged','cancellation_registered']}
function fixture(financeType='cash',requiredLaneKeys=['transfer']) {
 return {financeType,requiredLaneKeys,workflows:{sales_otp:{requiredSteps:[{key:'signed_otp_received',status:'completed'}]},[`finance_${financeType}`]:{requiredSteps:['proof_of_funds_reviewed','cash_confirmation_approved','cash_portion_confirmed','quote_approved','instruction_sent'].map(key=>({key,status:'completed'}))}},legalJourney:{status:'ready',snapshot:{lanes:requiredLaneKeys.map(key=>({key,phases:[{tasks:keys[key].map(key=>({key,status:'not_started'}))}]}))}}}
}
const statuses=x=>evaluateHighLevelJourney(x).milestones.map(m=>m.status)
assert.deepEqual(statuses({}),Array(5).fill('unknown'))
for(const route of ['cash','bond','hybrid']) for(const cancellation of [false,true]) {
 const lanes=['transfer',...(route==='cash'?[]:['bond']),...(cancellation?['cancellation']:[])]
 const x=fixture(route,lanes), before=JSON.stringify(x)
 assert.deepEqual(statuses(x),['complete','complete','pending','pending','pending'])
 assert.equal(JSON.stringify(x),before)
 for(const lane of x.legalJourney.snapshot.lanes)lane.phases[0].tasks[0].status='completed'
 assert.deepEqual(statuses(x),['complete','complete','complete','pending','pending'],'ready is not lodged')
 for(const lane of x.legalJourney.snapshot.lanes)lane.phases[0].tasks[1].status='completed_externally'
 assert.equal(statuses(x)[3],'complete');assert.equal(statuses(x)[4],'pending')
 for(const lane of x.legalJourney.snapshot.lanes)lane.phases[0].tasks[2].status='completed'
 assert.equal(statuses(x)[4],'complete')
 x.legalJourney.snapshot.lanes[0].phases[0].tasks[2].status='not_started'
 assert.notEqual(statuses(x)[4],'complete','reopening immediately removes completion')
 x.legalJourney.snapshot.lanes[0].phases[0].tasks[0].status='not_applicable'
 assert.equal(statuses(x)[2],'unknown','N/A is not a readiness confirmation')
 x.legalJourney.snapshot.lanes.pop()
 assert.equal(statuses(x)[3],'unknown','missing required lane cannot disappear from denominator')
}
const hybrid=fixture('hybrid',['transfer','bond'])
hybrid.workflows.finance_hybrid.requiredSteps.find(s=>s.key==='cash_portion_confirmed').status='waiting'
assert.equal(statuses(hybrid)[1],'waiting')
hybrid.financeType='unknown';assert.equal(statuses(hybrid)[1],'unknown')
const cash=fixture();cash.workflows.sales_otp.requiredSteps=[];cash.stage='registered';cash.registration_date='2026-01-01'
assert.equal(statuses(cash)[0],'unknown','stage/date cannot prove OTP')
cash.factsAvailable=false;assert.deepEqual(statuses(cash).slice(0,2),['unknown','unknown'])
const duplicate=fixture();duplicate.workflows.sales_otp.requiredSteps.push({key:'signed_otp_received',status:'completed'})
assert.equal(statuses(duplicate)[0],'unknown')
const blocked=fixture();blocked.workflows.finance_cash.requiredSteps[0].status='blocked'
assert.equal(statuses(blocked)[1],'blocked')
console.log('High-level milestone rules: cash/bond/hybrid, cancellation, missing facts, duplicates, N/A and reopening PASS')
