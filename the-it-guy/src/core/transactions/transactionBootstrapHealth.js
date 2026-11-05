export function transactionBootstrapBlockers({transaction={},workflowLanes=[],documentRequirements=[]}={}) {
 const blockers=[]
 const add=(key,message)=>blockers.push({key,type:'setup_incomplete',ownerRole:'transaction_coordinator',reason:message})
 if(!workflowLanes.length)add('bootstrap:workflow','Workflow setup is missing. Review and initialise this transaction before progressing.')
 if(!documentRequirements.length)add('bootstrap:documents','The document checklist is missing. Review and initialise this transaction before progressing.')
 if(['pending','failed'].includes(transaction.dealSetupSyncStatus||transaction.deal_setup_sync_status))add('setup:reconciliation','Deal terms were saved but related workflow updates are not confirmed. Retry workflow updates in Deal Setup.')
 return blockers
}
