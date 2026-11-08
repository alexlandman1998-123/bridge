import assert from 'node:assert/strict'
import { evaluateMvpFinanceGate } from '../mvpFinanceGate.js'
import { evaluateMvpTransferGate } from '../mvpTransferGate.js'
import { activeCapturedRequirement } from '../participantRequirementActivity.js'
import { transactionBootstrapBlockers } from '../transactionBootstrapHealth.js'
assert.equal(evaluateMvpFinanceGate({routingProfile:{financeType:'cash'}}).satisfied,false)
assert.equal(evaluateMvpFinanceGate({routingProfile:{financeType:'invalid'}}).satisfied,false)
for(const status of ['declined','removed','inactive','expired','cancelled'])assert.equal(activeCapturedRequirement({status,participantId:'p'},[{id:'p',status:'active'}]),false)
assert.equal(activeCapturedRequirement({status:'assigned',participantId:'p'},[{id:'p',status:'declined'}]),false)
assert.equal(activeCapturedRequirement({status:'assigned',participantId:'p'},[]),false)
assert.equal(activeCapturedRequirement({status:'assigned',participantId:'p',transaction_id:'a'},[{id:'p',status:'active',transaction_id:'b'}]),false)
assert.equal(activeCapturedRequirement({status:'assigned',participantId:'p',transaction_id:'a'},[{id:'p',status:'active',transaction_id:'a'}]),true)
assert.equal(evaluateMvpTransferGate({routingProfile:{financeType:'cash'},participants:[{role_type:'attorney',legal_role:'transfer'}],documentRequirements:[{document_key:'proof_of_funds',status:'verified'},{document_key:'optional',required:false,status:'pending'}]}).satisfied,true)
assert.equal(transactionBootstrapBlockers({}).length,2)
assert.equal(transactionBootstrapBlockers({transaction:{deal_setup_sync_status:'failed'},workflowLanes:[{}],documentRequirements:[{}]}).length,1)
console.log('Systemic readiness regressions passed')
