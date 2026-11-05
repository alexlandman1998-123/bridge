import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveTransactionRoutingProfile} from '../src/services/transactionRoutingProfileService.js'
import {applyTransferTaxDecisionUpdate,TRANSFER_TAX_ROUTES} from '../src/services/transferTaxDecisionService.js'
import {buildMatterWorkflowPlan,resolveMatterWorkflowPlan,diffMatterWorkflowPlans} from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
import {normalizeFinanceType} from '../src/core/transactions/financeType.js'
import {normalizeStoredTransactionType} from '../src/core/transactions/transactionSaleProfile.js'
import {normalizePurchaserType,getTransactionPurchaserTypeValue,PURCHASER_TYPES} from '../src/lib/purchaserPersonas.js'
import {resolveTransactionFacts} from '../src/services/attorneyWorkflow/transactionFactsResolver.js'
import {buildTransactionRoutingDiagnostics} from '../src/services/transactionRoutingDiagnosticsService.js'
const source=readFileSync(new URL('../src/lib/api.js',import.meta.url),'utf8')
const start=source.indexOf('function normalizeRoutingKey('),end=source.indexOf('\nexport async function saveTransactionRoutingProfile(',start)
const normalizeNullableText=value=>value==null?null:String(value).trim()||null
const build=new Function('normalizeFinanceType','normalizeNullableText','normalizePurchaserType','applyTransferTaxDecisionUpdate','TRANSFER_TAX_ROUTES','resolveTransactionRoutingProfile','buildMatterWorkflowPlan','resolveMatterWorkflowPlan','diffMatterWorkflowPlans','normalizeSaleStoredTransactionType','getTransactionPurchaserTypeValue',source.slice(start,end)+'\nreturn buildTransactionRoutingCorrectionPayload')(normalizeFinanceType,normalizeNullableText,normalizePurchaserType,applyTransferTaxDecisionUpdate,TRANSFER_TAX_ROUTES,resolveTransactionRoutingProfile,buildMatterWorkflowPlan,resolveMatterWorkflowPlan,diffMatterWorkflowPlans,normalizeStoredTransactionType,getTransactionPurchaserTypeValue)
for(const route of TRANSFER_TAX_ROUTES.filter(r=>r!=='needs_tax_advice')){
 const transaction={id:'controlled',finance_type:'cash',transaction_type:'private_property',property_type:'residential',property_tenure:'freehold',purchaser_type:'individual',seller_type:'individual',vat_treatment:'vat',routing_profile_json:{transferTaxDecision:{status:'confirmed',route}}}
 const profile=resolveTransactionRoutingProfile({transaction})
 assert.equal(profile.vatTreatment,route,'The confirmed decision must override a stale scalar')
 const result=build(transaction,{vatTreatment:'transfer_duty'})
 assert.equal(result.payload.vat_treatment,route,'The actual correction payload must preserve every confirmed tax route')
 assert.equal(result.payload.routing_profile_json.vatTreatment,route)
 assert.equal(resolveTransactionRoutingProfile({transaction:{...transaction,...result.payload}}).vatTreatment,route,'Reopening must preserve the saved route')
}
for(const purchaserType of PURCHASER_TYPES){
 const transaction={finance_type:'cash',transaction_type:'private_property',property_type:'residential',property_tenure:'freehold',purchaser_type:getTransactionPurchaserTypeValue(purchaserType),seller_type:'individual',vat_treatment:'transfer_duty'}
 assert.equal(build(transaction,{purchaserType}).payload.purchaser_type,getTransactionPurchaserTypeValue(purchaserType),'Routing corrections must retain the detailed buyer persona: '+purchaserType)
 if(!['company','trust'].includes(purchaserType))assert.equal(build(transaction,{purchaserType:'individual'}).payload.purchaser_type,getTransactionPurchaserTypeValue(purchaserType),'The broad entity selector must preserve an existing personal branch')
 assert.equal(build(transaction,{purchaserType:'unknown'}).payload.purchaser_type,getTransactionPurchaserTypeValue(purchaserType),'An unknown correction must not erase a known buyer persona')
}
const captured=resolveTransactionRoutingProfile({transaction:{transaction_type:'private_property',finance_type:'cash',vat_treatment:'exempt'}})
assert.equal(captured.vatTreatment,'exempt')
assert.notEqual(captured.transferTaxDecision.status,'confirmed','A captured hint must not manufacture attorney confirmation')
const legacy={transaction_type:'private_property',finance_type:'cash',vat_treatment:null,routing_profile_json:{vatTreatment:'unknown',transferTaxDecision:{status:'confirmed',route:'exempt'}}}
assert.equal(resolveTransactionFacts(legacy).vatTreatment,'exempt','Existing confirmed exemptions must also read correctly without a historical backfill')
assert.equal(resolveTransactionFacts(legacy).rawFieldsUsed.vatTreatment,'routing_profile_json.transferTaxDecision.route')
const diagnostics=buildTransactionRoutingDiagnostics(legacy)
assert.equal(diagnostics.facts.vatTreatment,'exempt','The editor fact model must use the authoritative decision')
assert.equal(diagnostics.profile.vatTreatment,'exempt')
const ui=readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx',import.meta.url),'utf8')
assert.match(ui,/value: 'exempt', label: 'Exempt'/)
assert.match(ui,/vatTreatment: event\.target\.value === 'needs_tax_advice' \? 'unknown' : event\.target\.value/)
console.log('PASS all confirmed transfer-tax routes persist in the actual correction payload and reopen unchanged; exemption stays explicit and captured hints do not confirm legal decisions.')
