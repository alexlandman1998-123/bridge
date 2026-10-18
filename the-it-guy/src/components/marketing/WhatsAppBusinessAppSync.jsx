import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'

const historyLabels={not_started:'Not started',requested:'Requested from Meta',unconfirmed:'Request not confirmed',receiving:'Receiving history',complete:'Available history synced',declined:'History sharing declined',failed:'Needs attention'}
export default function WhatsAppBusinessAppSync({organisationId,sender}) {
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const generation=useRef(0),alive=useRef(true)
  const refresh=useCallback(async()=>{
    const current=++generation.current
    try{const data=await metaIntegrationRequest(organisationId,'business_app_status',{senderId:sender.id});if(alive.current&&generation.current===current){setState(data);setError('')}}
    catch(failure){if(alive.current&&generation.current===current){setState(null);setError(failure.message)}}
  },[organisationId,sender.id])
  const invalidate=useCallback(()=>{alive.current=false;generation.current++},[])
  useEffect(()=>{
    alive.current=true
    const initial=window.setTimeout(()=>void refresh(),0),timer=window.setInterval(()=>{if(!document.hidden)void refresh()},15000)
    window.addEventListener('focus',refresh)
    return()=>{invalidate();window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[refresh,invalidate])
  async function update(action) {
    setBusy(true);setError('')
    try{await metaIntegrationRequest(organisationId,action,{senderId:sender.id,ownershipVersion:sender.ownership_version});if(alive.current)await refresh()}
    catch(failure){if(alive.current)setError(failure.message)}finally{if(alive.current)setBusy(false)}
  }
  const connected=sender.connection_status==='connected',requests=state?.requests||{},canStart=state&&(!requests.history||!requests.smb_app_state_sync)
  return <section className="w-full space-y-2 rounded-lg border bg-green-50/40 p-3 text-sm" aria-label={`Phone app sync for ${sender.display_phone_number||'this number'}`}>
    <strong>WhatsApp Business phone app sync</strong>
    {state?<><p>History: {historyLabels[state.history]||'Checking'}{state.history==='receiving'?` · ${state.progress||0}%`:''}</p>
      {state.contactsReceivedAt&&<p className="text-xs text-slate-600">Contact names updated {new Date(state.contactsReceivedAt).toLocaleString()}. This does not add CRM contacts or campaign permission.</p>}
      {state.history==='declined'?<p>You chose not to share history with Arch9. New messages can still sync.</p>:connected&&state.history!=='complete'&&<p>Keep WhatsApp Business open on your phone while Meta prepares and shares available history.</p>}
      {state.history==='failed'&&!state.failedUpdates&&<p>Meta could not complete initial history sharing. Check your phone and reconnect through Meta if a new onboarding session is needed.</p>}
      {state.history==='unconfirmed'&&<p>Check progress and your phone before reconnecting. Arch9 will not repeat a one-time request automatically.</p>}
      {state.pendingUpdates>0&&<p>{state.pendingUpdates} saved update{state.pendingUpdates===1?'':'s'} waiting to finish.</p>}
      {state.failedUpdates>0&&<p role="alert">Some saved updates need another processing attempt.</p>}
    </>:!error&&<p role="status">Checking phone app sync…</p>}
    {error&&<p role="alert" className="text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void refresh()}>Refresh sync progress</Button>
      {connected&&canStart&&<Button size="sm" disabled={busy} onClick={()=>void update('start_business_app_sync')}>Start initial phone app sync</Button>}
      {connected&&state?.failedUpdates>0&&<Button size="sm" disabled={busy} onClick={()=>void update('retry_business_app_updates')}>Retry saved updates</Button>}
    </div>
    <p className="text-xs text-slate-600">Meta controls number eligibility and which history and media it supplies. Only new customer messages after onboarding open an Arch9 reply window.</p>
  </section>
}
