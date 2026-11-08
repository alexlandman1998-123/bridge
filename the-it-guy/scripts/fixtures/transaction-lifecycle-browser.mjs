import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transactionLifecycleFixture } from './transaction-lifecycle-commit.mjs'
import { actor, id } from './transaction-actor-access.mjs'

// Component acceptance: the production dialogs and handlers, the production
// receipt service and real migration SQL. Only Auth/HTTP and page context are
// synthetic. This fixture never loads hosted credentials or sends notifications.
const root = fileURLToPath(new URL('../../', import.meta.url))
const db = await transactionLifecycleFixture()
let queue = Promise.resolve(), user = 5, noticeFailure = false, calls = 0
const serial = run => { const pending = queue.catch(() => null).then(run); queue = pending; return pending }
const source = readFileSync(root + 'src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const handlers = source.slice(source.indexOf('  async function handleRunRegistration()'), source.indexOf('  async function handleSubmitReasonAction()'))
const modalStart = source.lastIndexOf('      <Modal', source.indexOf('        open={registrationModalOpen}'))
const modal = source.slice(modalStart, source.indexOf('\n      <Modal', source.indexOf('        open={confirmDialog.open}', modalStart)))
const entry = `
import React,{useState,useRef,useEffect}from'react';import{createRoot}from'react-dom/client';
import Modal from'${root}src/components/ui/Modal.jsx';import Button from'${root}src/components/ui/Button.jsx';import Field from'${root}src/components/ui/Field.jsx';import ConfirmDialog from'${root}src/components/ui/ConfirmDialog.jsx';
import DeveloperOverviewJourney from'${root}src/components/transaction/DeveloperOverviewJourney.jsx';
import{commitTransactionLifecycle,readCommittedLifecycle}from'${root}src/services/transactionLifecycleCommitService.js';
async function request(path,body){const response=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});return response.json()}
const client={rpc:(name,params)=>request('rpc',{name,params})};
function App(){
const[transaction,setTransaction]=useState({id:'${id(100)}'}),[saving,setSaving]=useState(false),[error,setError]=useState(''),[lifecycleActionNotice,setLifecycleActionNotice]=useState(''),[workspace,setWorkspace]=useState('');
const[registrationModalOpen,setRegistrationModalOpen]=useState(false),[registrationDraft,setRegistrationDraft]=useState({registrationDate:'2026-11-08',titleDeedNumber:'',registrationConfirmationDocumentId:''}),[registrationValidation,setRegistrationValidation]=useState({loading:false,canMarkRegistered:false,blockers:[]}),[confirmDialog,setConfirmDialog]=useState({open:false,title:'Complete transaction',description:'Confirm all required closeout checks.',action:'complete'});
const currentMatterAccessKey='${id(100)}:attorney',liveMatterScopeRef=useRef(currentMatterAccessKey),registrationDocumentOptions=[{id:'${id(103)}',name:'Stored registration proof'}];
async function refreshRegistrationValidation(){const{data,error:failed}=await client.rpc('bridge_get_transaction_lifecycle_permissions',{p_transaction_id:transaction.id});const blockers=[];if(failed)blockers.push({label:failed.message});else if(!data?.canRegister)blockers.push({label:'Only the assigned transfer legal team or an authorised developer can record registration.'});if(!registrationDraft.titleDeedNumber.trim())blockers.push({label:'Title deed number is required.'});if(!registrationDraft.registrationConfirmationDocumentId)blockers.push({label:'Choose registration confirmation evidence from this transaction.'});setRegistrationValidation({loading:false,canMarkRegistered:!blockers.length,blockers})}
async function commit(action,params={}){const receipt=await commitTransactionLifecycle(client,{transactionId:transaction.id,action,...params});return readCommittedLifecycle({receipt,transaction,read:async()=>{const data=await request('snapshot');setTransaction(data.transaction);return data},followUps:action==='register'?[{label:'registration notifications',run:async()=>{const result=await request('notification');if(result.error)throw new Error(result.error.message)}}]:[]})}
const markTransactionRegistered=params=>commit('register',{registrationDate:params.registrationDate,titleDeedNumber:params.titleDeedNumber,confirmationDocumentId:params.registrationConfirmationDocumentId}),markTransactionCompleted=()=>commit('complete');const unarchiveTransactionLifecycle=()=>{throw new Error('Outside fixture scope')};
${handlers}
useEffect(()=>{if(registrationModalOpen)void refreshRegistrationValidation()},[registrationModalOpen,registrationDraft]);
const milestones=['otp','finance','transfer','lodgement','registration'].map(id=>({id,status:id==='finance'?'waiting':id==='otp'?'complete':'unknown',isComplete:id==='otp'}));
return <main><h1>Isolated transaction acceptance</h1><p>Production dialogs and handlers with local PostgreSQL. No hosted writes or notifications.</p><label>Act as <select aria-label="Act as" onChange={async e=>{await request('control',{actor:Number(e.target.value)});setError('');setLifecycleActionNotice('')}} defaultValue="5"><option value="5">Assigned transfer attorney</option><option value="1">Ordinary agent</option><option value="2">Organisation developer</option></select></label>
<button onClick={()=>setRegistrationModalOpen(true)}>Open registration</button><button onClick={()=>setConfirmDialog({...confirmDialog,open:true})}>Open completion</button><button onClick={()=>request('control',{closeout:true})}>Record local financial closeout</button>
<p role="status">{lifecycleActionNotice}</p><output aria-label="Saved lifecycle">{transaction.lifecycle_state||'active'}</output>
<DeveloperOverviewJourney model={{highLevelJourney:{ruleVersion:1,milestones},legalJourney:{status:'ready',snapshot:{lanes:[]}}}} onOpenWorkspace={setWorkspace}/><output aria-label="Opened workspace">{workspace}</output>
${modal}
</main>}
createRoot(document.getElementById('root')).render(<App/>);
`
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: 'runtime.js', format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } })
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/runtime.js') { res.setHeader('content-type','text/javascript'); res.end(bundle.outputFiles[0].text); return }
    if (!req.url.startsWith('/api/')) { res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px Arial;margin:20px}button,input,select{font:inherit;padding:10px;margin:6px}label{display:block}.ui-modal-overlay{position:fixed;inset:0;background:#0008;display:grid;place-items:center;padding:12px}.ui-modal{background:white;padding:20px;max-height:90vh;overflow:auto;width:min(700px,90vw)}.ui-modal-head{display:flex;justify-content:space-between}.ui-modal-footer{margin-top:20px}[role=alert]{background:#fff1f2;color:#9f1239;padding:12px}[role=status]{color:#166534}ol{display:flex;gap:12px;list-style:none;overflow:auto;padding:0}li{min-width:120px}li span{display:block}section{margin:18px 0}</style></head><body><div id="root"></div><script type="module" src="/runtime.js"></script></body></html>');return }
    let raw='';for await(const chunk of req)raw+=chunk
    const body=raw?JSON.parse(raw):{}
    const result=await serial(async()=>{
      if(req.url==='/api/control'){
        await actor(db,null,'','postgres')
        if(body.actor)user=body.actor
        if(body.notificationsFail!==undefined)noticeFailure=body.notificationsFail
        if(body.closeout)await db.query('insert into transaction_attorney_closeouts(transaction_id,close_out_status) values($1,\'closed\')',[id(100)])
        if(body.auditFail)await db.exec(`create function browser_reject_audit() returns trigger language plpgsql as $$begin raise exception 'The registration audit could not be saved. Please ask support to check this transaction.';end$$;create trigger browser_audit_failure before insert on transaction_workflow_events for each row execute function browser_reject_audit();`)
        if(body.allowAudit)await db.exec('drop trigger if exists browser_audit_failure on transaction_workflow_events')
        return{ok:true}
      }
      if(req.url==='/api/notification')return noticeFailure?{error:{message:'Synthetic notification failure'}}:{ok:true}
      if(req.url==='/api/evidence'){
        await actor(db,null,'','postgres');return(await db.query('select (select count(*) from transaction_workflow_events) registration_audits,(select count(*) from transaction_events) completion_audits,(select count(*) from transaction_workflow_evidence) evidence_rows,(select lifecycle_state from transactions where id=$1) lifecycle',[id(100)])).rows[0]
      }
      await actor(db,id(user),user===5?'lawyer@example.test':user===1?'agent@example.test':'developer@example.test')
      if(req.url==='/api/snapshot')return{transaction:(await db.query('select * from transactions where id=$1',[id(100)])).rows[0]}
      if(req.url!=='/api/rpc')throw new Error('Unexpected fixture request')
      try{
        let data
        if(body.name==='bridge_get_transaction_lifecycle_permissions')data=(await db.query('select bridge_get_transaction_lifecycle_permissions($1) value',[body.params.p_transaction_id])).rows[0].value
        else if(body.name==='bridge_commit_transaction_lifecycle'){
          calls++;const p=body.params
          data=(await db.query('select bridge_commit_transaction_lifecycle($1,$2,$3::date,$4,$5) value',[p.p_transaction_id,p.p_action,p.p_registration_date,p.p_title_deed_number,p.p_confirmation_document_id])).rows[0].value
        }else throw new Error('Unexpected fixture RPC')
        return{data,error:null,calls}
      }catch(error){return{data:null,error:{message:error.message,code:error.code}}}
    })
    res.setHeader('content-type','application/json');res.end(JSON.stringify(result))
  }catch(error){res.statusCode=500;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:{message:error.message}}))}
})
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,isolation:'synthetic-PGlite-only'})))
async function close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();process.exit(0)}
process.on('SIGINT',close);process.on('SIGTERM',close)
