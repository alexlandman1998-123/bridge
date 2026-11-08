import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {buildRouteBuyerForm,sellerRouteVariant} from './fixtures/transaction-route-onboarding.mjs'
const vite=await createServer({root:process.cwd(),logLevel:'silent',server:{middlewareMode:true,watch:null,hmr:false}})
try{
 const {getDemoBuyerOnboardingPayload}=await vite.ssrLoadModule('/src/lib/onboardingDemoLinks.js')
 const {getBuyerRequirementProfile}=await vite.ssrLoadModule('/src/lib/buyerRequirementEngine.js')
 const {validateOnboardingSubmission}=await vite.ssrLoadModule('/src/lib/purchaserPersonas.js')
 const {getBuyerFicaDeclarationSigners}=await vite.ssrLoadModule('/src/core/documents/buyerFicaDeclarationSigning.js')
 for(const [scenario,branch,signerIds] of [[{buyerEntityType:'company'},'company',['authorised-signatory']],[{buyerEntityType:'trust'},'trust',['authorised-trustee']],[{partyVariant:'joint_purchasers'},'individual',['purchaser-1','purchaser-2']],[{partyVariant:'foreign_buyer'},'foreign_purchaser',['purchaser-1']],...['married_coc','married_anc','married_anc_accrual'].map(purchaserType=>[{purchaserType},purchaserType,['purchaser-1']])]){
  const form=buildRouteBuyerForm({scenario:{financeType:'cash',...scenario},primary:getDemoBuyerOnboardingPayload().formData.purchasers[0],buyerEmail:'controlled@example.test',phone:'+27821234567'})
  const profile=getBuyerRequirementProfile({formData:form,purchaserType:form.purchaser_type,financeType:form.purchase_finance_type})
  assert.equal(profile.buyerBranch,branch)
  validateOnboardingSubmission(form,{purchaserType:form.purchaser_type,financeType:form.purchase_finance_type})
  assert.deepEqual(getBuyerFicaDeclarationSigners({purchaserEntityType:form.purchaser_entity_type,purchasers:form.purchasers,company:form.company,trust:form.trust}).map(x=>x.id),signerIds)
  if(scenario.partyVariant==='joint_purchasers'){assert.equal(profile.buyerCount,2);assert.equal(form.purchasers.reduce((sum,p)=>sum+Number(p.ownership_share),0),100)}
 }
 assert.equal(sellerRouteVariant({sellerEntityType:'company'},'controlled@example.test','0821234567').ownershipType,'company')
 assert.equal(sellerRouteVariant({sellerEntityType:'trust'},'controlled@example.test','0821234567').trustees.length,1)
 assert.equal(sellerRouteVariant({nonResidentSeller:true},'controlled@example.test','0821234567').taxResident,'no')
 console.log('PASS real company/trust/foreign/joint buyer branches, every expected FICA signer, shares, seller authority and non-resident facts.')
}finally{await vite.close()}
