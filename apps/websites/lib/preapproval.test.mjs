import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialApplication, personalFields, incomeFields, expenseFields, debtFields, creditFields, documentsFor, parseApplication, stageErrors, totals } from './preapproval.ts'
function complete() {
  const data = initialApplication()
  data.plan = { ...data.plan, stage:'Exploring my budget', purpose:'Primary residence', firstHome:'Yes', price:'2000000',deposit:'200000',depositSource:'Savings',area:'Pretoria' }
  const a = {}
  for (const field of [...personalFields,...incomeFields,...expenseFields,...debtFields,...creditFields]) a[field.key] = field.type === 'number' ? '0' : field.options?.[0] || 'Test'
  Object.assign(a,{firstName:'Sample',surname:'Applicant',email:'sample@example.com',phone:'+27820000000',dateOfBirth:'1990-01-01',identityType:'Passport',identityNumber:'TEST12345',employment:'Retired',grossIncome:'50000',netIncome:'40000',housingCost:'10000',debtReview:'No',creditIssues:'No',insolvency:'No',surety:'No'})
  data.applicants=[a]
  for (const d of documentsFor(a)) data.documents[`0-${d.key}`]='Ready'
  data.consent={'accuracy-0':true,'processing-0':true,'signature-0':'Sample Applicant'}
  return data
}
test('complete application passes all steps and round-trips without unknown data',()=>{
 const data=complete(); for(let s=0;s<7;s++)assert.deepEqual(stageErrors(data,s),[])
 data.applicants[0].injectedRecipient='attacker@example.com'
 const parsed=parseApplication(data); assert.ok(parsed); assert.equal(parsed.applicants[0].injectedRecipient,undefined)
})
test('joint applications require second applicant details and individual consent',()=>{
 const data=complete();data.plan.applicationType='Joint';assert.ok(stageErrors(data,0).length)
 data.applicants.push({...data.applicants[0],firstName:'Second'});assert.ok(stageErrors(data,6).length)
})
test('negative amounts, net above gross, invalid dates and bad SA IDs fail',()=>{
 const data=complete();data.applicants[0].netIncome='60000';assert.ok(stageErrors(data,3).length)
 data.applicants[0].netIncome='-1';assert.ok(stageErrors(data,3).length)
 data.applicants[0].dateOfBirth='2020-02-31';assert.ok(stageErrors(data,1).length)
 data.applicants[0].identityType='South African ID';data.applicants[0].identityNumber='123';assert.ok(stageErrors(data,1).length)
})
test('employment paths require business or contract details and exclude stale fields',()=>{
 const data=complete();data.applicants[0].employment='Self-employed';assert.ok(stageErrors(data,2).length)
 data.applicants[0].employment='Retired';data.applicants[0].businessName='Stale';assert.equal(parseApplication(data).applicants[0].businessName,undefined)
})
test('credit explanations, document availability and signatures cannot be skipped',()=>{
 const data=complete();data.applicants[0].creditIssues='Yes';data.applicants[0].creditExplanation='';assert.ok(stageErrors(data,4).length)
 data.documents={};assert.ok(stageErrors(data,5).length)
 data.consent['signature-0']='Someone else';assert.ok(stageErrors(data,6).length)
})
test('bounded parsing rejects invalid shapes; totals combine applicants without clamping deficits',()=>{
 assert.equal(parseApplication({version:1,applicants:[null]}),null)
 const data=complete();data.applicants[0].netIncome='100';data.applicants[0].groceries='500';assert.equal(totals(data.applicants).remaining,-10400)
})
