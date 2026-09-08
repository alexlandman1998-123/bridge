import assert from 'node:assert/strict'
import { evaluateJourneyRelease, ROLES, SCENARIOS, OUTCOMES, SAFETY_CHECKS, scenarioLanes } from './shared-journey-release-gate.mjs'
// Synthetic unit-test fixtures only; never emitted as staging evidence.
const now=Date.parse('2026-09-08T18:00:00Z'), sourceDigest='a'.repeat(64)
const local={status:'passed',sourceDigest}
const staging={schemaVersion:1,environment:'staging',projectRef:'x'.repeat(20),deploymentId:'test-only',reviewedBy:'test-operator',sourceDigest,recordedAt:new Date(now).toISOString(),
 transitions:SCENARIOS.flatMap(scenario=>scenarioLanes(scenario).flatMap(laneKey=>OUTCOMES.map(outcome=>({scenario,laneKey,outcome,matterId:'fixture',taskId:'fixture',beforeRevision:1,afterRevision:2,committedAt:new Date(now-20000).toISOString(),reads:ROLES.map(role=>({role,revision:2,taskId:'fixture',taskStatus:outcome==='reopened'?'not_started':outcome,snapshotDigest:'b'.repeat(64),observedAt:new Date(now-10000).toISOString()}))})))),
 checks:Object.fromEntries(SAFETY_CHECKS.map(key=>[key,{status:'passed',evidenceRef:'synthetic-unit-test'}]))}
const gate=(e=staging,l=local)=>evaluateJourneyRelease({local:l,staging:e,now})
assert.equal(gate().decision,'ready_for_controlled_release')
assert.equal(gate(null).decision,'blocked')
assert.equal(gate(staging,{status:'failed'}).decision,'blocked')
for(const change of [
 e=>e.sourceDigest='c'.repeat(64), e=>e.environment='production', e=>e.reviewedBy='',
 e=>e.recordedAt='2020-01-01', e=>e.transitions.pop(), e=>e.transitions.push(e.transitions[0]),
 e=>e.transitions[0].reads.pop(), e=>e.transitions[0].reads[0].revision=1,
 e=>e.transitions[0].reads[0].snapshotDigest='c'.repeat(64),
 e=>e.transitions[0].reads[0].taskStatus='completed', e=>e.transitions[0].reads[0].taskId='wrong-task',
 e=>e.transitions=e.transitions.filter(t=>t.laneKey!=='bond'),
 e=>e.transitions[0].beforeRevision=2, e=>e.transitions[0].reads[0].observedAt=new Date(now+20000).toISOString(),
 e=>e.transitions[0].reads[0].observedAt=new Date(now-40000).toISOString(),
 e=>e.checks['private-notes-not-exposed'].status='not_run',
 e=>e.checks['rollback-rehearsed'].evidenceRef='',
]) {const e=structuredClone(staging);change(e);assert.equal(gate(e).decision,'blocked')}
assert.equal(gate().productionChanged,false)
console.log('Shared journey release gate: missing, stale, mismatched and unsafe evidence blocked')
