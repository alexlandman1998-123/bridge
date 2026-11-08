import { randomUUID } from 'node:crypto'
import { createServer } from 'vite'
import { readFile,writeFile } from 'node:fs/promises'
const directory=process.argv[2]
if(!directory)throw Error('Provide the private snapshot directory.')
const snapshot=JSON.parse(await readFile(`${directory}/before.json`,'utf8')).rows[0].snapshot
const server=await createServer({root:process.cwd(),configFile:false,optimizeDeps:{noDiscovery:true,include:[],entries:[]},logLevel:'error',server:{middlewareMode:true}})
try {
 const {buildProjectedTransactionRequirementCandidates,buildProjectionRow}=await server.ssrLoadModule('/src/services/documents/transactionCanonicalDocumentRequirementService.js')
 const {buildInstanceSignature}=await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')
 const {canonicalInstanceToTransactionRequiredDocument}=await server.ssrLoadModule('/src/services/documents/canonicalDocumentAdapterService.js')
 const {SUBPROCESS_STEP_TEMPLATES,SUBPROCESS_DEFAULT_OWNERS}=await server.ssrLoadModule('/src/core/transactions/roleConfig.js')
 const {getFinanceWorkflowTemplate}=await server.ssrLoadModule('/src/core/transactions/financeWorkflow.js')
 const plans=[]
 for(const transaction of snapshot.transactions){
  const lanes=['finance','transfer']
  // Record applicable specialist work without inventing an appointment or completion.
  if(['bond','hybrid','combination'].includes(transaction.finance_type))lanes.push('bond')
  if(transaction.seller_has_existing_bond===true||transaction.existing_bond===true||transaction.cancellation_required===true)lanes.push('cancellation')
  const subprocesses=lanes.map(type=>({transaction_id:transaction.id,process_type:type,owner_type:type==='finance'&&transaction.finance_type==='cash'?'internal':SUBPROCESS_DEFAULT_OWNERS[type],status:'not_started',lane_status:'not_started',finance_type_context:transaction.finance_type,is_required:true,lane_metadata:{repair:'post_otp_integrity_20261103',reviewRequired:true},steps:(type==='finance'?getFinanceWorkflowTemplate(transaction.finance_type):SUBPROCESS_STEP_TEMPLATES[type]||[]).filter(step=>type!=='transfer'||String(transaction.property_type||'').toLowerCase().includes('sectional')||!['levy_clearance_requested','levy_clearance_uploaded'].includes(step.key)).map((step,index)=>({step_key:step.key,step_label:step.label,status:'not_started',owner_type:type==='finance'&&transaction.finance_type==='cash'?'internal':SUBPROCESS_DEFAULT_OWNERS[type],sort_order:step.sortOrder||index+1}))}))
  const context=snapshot.onboarding.find(row=>row.transaction_id===transaction.id)?.form_data||{}
  const before=snapshot.canonical.filter(row=>row.transaction_id===transaction.id)
  const signatures=new Set(before.map(buildInstanceSignature))
  const derived=buildProjectedTransactionRequirementCandidates({transaction,formData:context,subprocesses:snapshot.subprocesses.filter(row=>row.transaction_id===transaction.id),rules:snapshot.rules,definitions:snapshot.definitions})
  const candidates=derived.candidates.map(row=>({...row.generated,requirement_level:String(row.generated.requirement_level).startsWith('pending_policy_')?'optional':row.generated.requirement_level})).filter(row=>!signatures.has(buildInstanceSignature(row)))
  const all=[...before,...candidates.map(row=>({...row,id:randomUUID()}))]
  const bySignature=new Map(all.map(row=>[buildInstanceSignature(row),row]))
  const projection=derived.candidates.map(candidate=>buildProjectionRow({...candidate,instance:bySignature.get(buildInstanceSignature(candidate.generated)),facts:derived.facts,includeOutsideStage:true})).filter(Boolean)
  const legacy=all.map(row=>canonicalInstanceToTransactionRequiredDocument(row)).filter(Boolean)
  plans.push({subprocesses,canonical:all.filter(row=>!before.some(old=>old.id===row.id)),projection,legacy,transactionId:transaction.id,organisationId:transaction.organisation_id,expectedUpdatedAt:transaction.updated_at,expectedStage:transaction.stage,financeType:transaction.finance_type,requirements:candidates,existingRequirements:before.length,missingSubprocesses:!snapshot.subprocesses.some(row=>row.transaction_id===transaction.id),fixture:/smoke|fixture|synthetic/i.test(JSON.stringify(transaction))})
 }
 await writeFile(`${directory}/derived-plan.json`,JSON.stringify(plans,null,2))
 console.log(JSON.stringify({transactions:plans.length,canonicalInserts:plans.reduce((n,p)=>n+p.requirements.length,0),minCanonical:Math.min(...plans.map(p=>p.requirements.length+p.existingRequirements)),fixtures:plans.filter(p=>p.fixture).length}))
}finally{await server.close()}
