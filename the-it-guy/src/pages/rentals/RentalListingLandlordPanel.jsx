import { useEffect, useId, useRef, useState } from 'react'
import { Building2, CheckCircle2, Copy, Loader2, Plus, Search, UserRound } from 'lucide-react'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import { RENTAL_SELECT_OPTIONS } from '../../services/rentals/rentalListingDraftModel'
import { loadListingLandlordSetup, rentalListingHasLandlord, saveListingLandlord, startListingLandlordOnboarding } from '../../services/rentals/rentalListingLandlordService'
import { buildListingLandlordDiscovery, listingLandlordValues } from '../../services/rentals/rentalListingLandlordModel'
import { normalizeLandlordProfile } from '../../services/rentals/rentalLandlordWorkspaceModel'
import { requestRentalLandlordOnboarding } from '../../services/rentals/rentalLandlordOnboardingService'
import RentalListingLandlordProfile from './RentalListingLandlordProfile'
import RentalListingLandlordOnboardingEditor from './RentalListingLandlordOnboardingEditor'

const EMPTY_SETUP = {contacts:[],linkedLead:null,onboarding:null}
const cardClass = 'rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]'
function ContactFields({ values, onChange, disabled }) {
  return <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
    {[['landlordName', 'Landlord or entity name', 'text'], ['landlordEmail', 'Email address', 'email'], ['landlordPhone', 'Phone number', 'tel']].map(([key,label,type]) => <label key={key} className={`grid gap-2 text-sm font-semibold text-[#425970] ${key==='landlordName' ? 'sm:col-span-2' : ''}`}>{label}<Field required={key==='landlordName'} type={type} value={values[key]} onChange={(event)=>onChange(key,event.target.value)}/></label>)}
    <label className="grid gap-2 text-sm font-semibold text-[#425970] sm:col-span-2">Landlord type<Field as="select" value={values.landlordType} onChange={(event)=>onChange('landlordType',event.target.value)}>{RENTAL_SELECT_OPTIONS.landlordType.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Field></label>
  </fieldset>
}
export default function RentalListingLandlordPanel({ listing, scope, onSaved }) {
  const contextKey = `${listing.id}:${scope.organisationId}:${scope.branchId || ''}:${scope.assignedAgentId || ''}:${scope.scopeLevel || ''}`
  const [values,setValues] = useState(()=>listingLandlordValues(listing))
  const [loadedSetup,setSetup] = useState({...EMPTY_SETUP,key:contextKey})
  const setup = loadedSetup.key===contextKey ? loadedSetup : EMPTY_SETUP
  const [loading,setLoading] = useState(true)
  const [loadError,setLoadError] = useState('')
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [busy,setBusy] = useState('')
  const [query,setQuery] = useState('')
  const [selectedId,setSelectedId] = useState('')
  const [existingType,setExistingType] = useState(()=>listingLandlordValues(listing).landlordType)
  const [retry,setRetry] = useState(0)
  const [editor,setEditor] = useState(null)
  const [access,setAccess] = useState(null)
  const [changes,setChanges] = useState('')
  const formId = useId()
  const guard = useRef(false)
  const contactId = useRef('')
  const leadId = useRef('')
  const mounted = useRef(false)
  const currentKey = useRef(contextKey)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{currentKey.current=contextKey;setEditor(null);setAccess(null);setError('');setNotice('');setSelectedId('');setQuery('');contactId.current='';leadId.current=''},[contextKey])
  useEffect(()=>{
    let cancelled=false
    setLoading(true);setLoadError('')
    loadListingLandlordSetup(listing,scope).then(result=>{if(!cancelled)setSetup({...result,key:contextKey})}).catch(cause=>{if(!cancelled)setLoadError(cause.message || 'Unable to load landlords.')}).finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[listing,scope,retry,contextKey])
  useEffect(()=>{if(!editor)setValues(listingLandlordValues(listing,setup.onboarding))},[listing,setup.onboarding,editor])
  const connected = rentalListingHasLandlord(listing,setup.linkedLead)
  const selected = setup.contacts.find(item=>item.id===selectedId)
  const filtered = setup.contacts.filter(item=>`${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query.toLowerCase().trim()))
  const context = {...scope,linkedLead:setup.linkedLead,onboarding:setup.onboarding}
  const update = (key,value)=>{setValues(current=>({...current,[key]:value}));setError('');setNotice('')}
  async function run(action,work) {
    if(guard.current)return
    guard.current=true;setBusy(action);setError('');setNotice('')
    const key=contextKey
    const isCurrent=()=>mounted.current && currentKey.current===key
    try {await work(isCurrent)} catch(cause){if(isCurrent()){
      setError(cause.message || 'Unable to save landlord details.')
      if(cause.onboarding){setSetup(current=>({...current,onboarding:cause.onboarding}));setEditor(current=>current ? {...current,onboarding:cause.onboarding} : current)}
    }} finally{guard.current=false;if(isCurrent())setBusy('')}
  }
  async function save(mode,event) {
    event?.preventDefault()
    await run(mode,async isCurrent=>{
      if(mode==='new' && !contactId.current)contactId.current=crypto.randomUUID()
      const nextValues=mode==='existing' && selected ? {...values,landlordName:selected.name,landlordEmail:selected.email,landlordPhone:selected.phone,landlordType:existingType} : values
      const result=await saveListingLandlord(listing.id,nextValues,{...context,mode,contactId:mode==='new' ? contactId.current : mode==='existing' ? selectedId : '',...(editor?.mode==='profile' ? {expectedValues:editor.expectedValues,onboarding:editor.onboarding} : {})})
      if(!isCurrent())return
      if(result.landlordOnboarding)setSetup(current=>({...current,onboarding:result.landlordOnboarding}))
      onSaved?.(result);setEditor(null);setNotice(mode==='profile' ? 'Landlord details saved and verified.' : 'Landlord connected to this listing.')
    })
  }
  function editContact(){setError('');setValues(listingLandlordValues(listing,setup.onboarding));setEditor({mode:'profile',expectedValues:listingLandlordValues(listing),onboarding:setup.onboarding})}
  function continueOnboarding(){
    const seeded=buildListingLandlordDiscovery(listing)
    const saved=setup.onboarding.data
    let portfolio=saved.portfolio || []
    if(!portfolio.length)portfolio=seeded.portfolio
    else if(portfolio.length===1 && !portfolio[0].listingId && setup.linkedLead.relationships?.listingId===listing.id)portfolio=[{...portfolio[0],listingId:listing.id}]
    setError('');setEditor({mode:'onboarding',expectedValues:listingLandlordValues(listing),onboarding:setup.onboarding,data:{profile:{...seeded.profile,...saved.profile},portfolio}})
  }
  const start=()=>void run('start',async isCurrent=>{
    if(!leadId.current)leadId.current=crypto.randomUUID()
    const result=await startListingLandlordOnboarding(listing.id,{...scope,leadId:leadId.current})
    if(!isCurrent())return
    setSetup({...result.setup,key:contextKey});onSaved?.(result.listing);setNotice('Landlord onboarding is ready. Continue here or create a secure link.')
  })
  const saveOnboarding=event=>{
    event.preventDefault()
    void run('onboarding',async isCurrent=>{
      const normalized=normalizeLandlordProfile(editor.data.profile)
      const profile={...editor.data.profile,name:normalized.name,email:normalized.email,phone:normalized.phone,type:normalized.type}
      profile.people=(editor.data.profile.people || []).map(person=>{
        const cleaned=normalized.people.find(item=>item.id===person.id)
        return {...person,name:cleaned.name,...(Object.hasOwn(person,'email') ? {email:cleaned.email} : {})}
      })
      const result=await saveListingLandlord(listing.id,{landlordName:profile.name,landlordEmail:profile.email,landlordPhone:profile.phone,landlordType:profile.type},{...context,mode:'profile',expectedValues:editor.expectedValues,onboarding:editor.onboarding,discovery:{...editor.data,profile}})
      if(!isCurrent())return
      if(result.landlordOnboarding)setSetup(current=>({...current,onboarding:result.landlordOnboarding}))
      onSaved?.(result);setEditor(null);setNotice('Landlord onboarding details saved and verified.')
    })
  }
  const createLink=()=>void run('access',async isCurrent=>{
    const result=await requestRentalLandlordOnboarding(setup.linkedLead.id,'POST',{action:'create_access'})
    if(!result.token || !result.accessId || !result.expiresAt)throw new Error('The secure onboarding link could not be verified. Refresh before continuing.')
    if(isCurrent())setAccess({...result,url:`${window.location.origin}/rental-landlord-onboarding/${result.token}`})
  })
  const revoke=id=>void run('revoke',async isCurrent=>{
    await requestRentalLandlordOnboarding(setup.linkedLead.id,'POST',{action:'revoke_access',accessId:id})
    const result=await requestRentalLandlordOnboarding(setup.linkedLead.id)
    if(isCurrent()){setAccess(current=>current?.accessId===id ? null : current);setSetup(current=>({...current,onboarding:result.onboarding}));setNotice('Landlord onboarding link revoked.')}
  })
  return <div className="space-y-5">
    {loadError ? <div role="alert" className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-4 text-sm text-[#9f3131]">{loadError}<Button variant="secondary" size="sm" className="ml-3" onClick={()=>setRetry(value=>value+1)}>Retry</Button></div> : null}
    {error && !editor ? <p role="alert" className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-4 text-sm text-[#9f3131]">{error}</p> : null}
    {notice ? <p role="status" className="text-sm font-semibold text-[#257044]">{notice}</p> : null}
    {connected ? <RentalListingLandlordProfile listing={listing} onboarding={setup.onboarding} linkedLead={setup.linkedLead} loading={loading} busy={busy} onboardingError={loadError || setup.onboardingError} onEdit={editContact} onContinue={continueOnboarding} onStart={start} onCreateLink={createLink} onRequestChanges={()=>{setChanges('');setEditor({mode:'corrections'})}} onRefresh={()=>setRetry(value=>value+1)}/> : <>
      <header className={cardClass}><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl border border-[#dbe6f2] bg-[#f8fbff] text-[#1f4f78]"><Building2 size={21}/></span><div><h2 className="text-xl font-semibold text-[#18324b]">Landlord</h2><p className="mt-1 text-sm text-[#607387]">Create a landlord or connect someone already in Clients.</p></div></div></header>
      <div className="grid gap-5 lg:grid-cols-2">
        <form className={cardClass} onSubmit={event=>void save('new',event)}><h3 className="mb-5 flex items-center gap-2 font-semibold text-[#18324b]"><Plus size={18}/>Create new landlord</h3><ContactFields values={values} onChange={update} disabled={Boolean(busy) || loading || Boolean(loadError)}/><Button type="submit" className="mt-5" disabled={Boolean(busy) || loading || Boolean(loadError)}>{busy==='new' ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>}Create and connect landlord</Button></form>
        <section className={cardClass}><h3 className="mb-5 flex items-center gap-2 font-semibold text-[#18324b]"><UserRound size={18}/>Select existing landlord</h3><label className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[#8294aa]"/><Field aria-label="Search landlords" placeholder="Search name, email or phone" className="pl-10" value={query} onChange={event=>setQuery(event.target.value)} disabled={Boolean(busy) || loading}/></label><div className="mt-4 grid max-h-72 gap-2 overflow-y-auto">{loading ? <p className="text-sm text-[#607387]">Loading landlords…</p> : filtered.length ? filtered.slice(0,50).map(contact=><button type="button" key={contact.id} aria-pressed={selectedId===contact.id} disabled={Boolean(busy)} onClick={()=>{setSelectedId(contact.id);setError('')}} className={`rounded-xl border p-3 text-left ${selectedId===contact.id ? 'border-[#1f4f78] bg-[#f2f7fc]' : 'border-[#e1e9f2] bg-white hover:bg-[#f8fbff]'}`}><span className="block text-sm font-semibold text-[#243d56]">{contact.name}</span><span className="mt-1 block break-all text-xs text-[#607387]">{[contact.email,contact.phone].filter(Boolean).join(' · ')}</span></button>) : <p className="rounded-xl bg-[#f8fbff] p-4 text-sm text-[#607387]">{query ? 'No landlords match your search.' : 'No landlord contacts found in this workspace.'}</p>}</div>{selected ? <label className="mt-4 grid gap-2 text-sm font-semibold text-[#425970]">Selected landlord type<Field as="select" value={existingType} onChange={event=>setExistingType(event.target.value)} disabled={Boolean(busy)}>{RENTAL_SELECT_OPTIONS.landlordType.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</Field></label> : null}<Button type="button" className="mt-5" disabled={!selected || Boolean(busy) || loading || Boolean(loadError)} onClick={()=>void save('existing')}>{busy==='existing' ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}Connect selected landlord</Button></section>
      </div><p className="text-sm font-semibold text-[#607387]">Landlord profile locked</p>
    </>}
    {access || setup.onboarding?.accessLinks?.some(link=>!link.revokedAt && Date.parse(link.expiresAt)>Date.now()) ? <article className={cardClass}><h3 className="text-base font-semibold text-[#142132]">Landlord onboarding access</h3>{access ? <div className="mt-4 space-y-3"><p className="text-sm text-[#607387]">Secure link expires {new Date(access.expiresAt).toLocaleString('en-ZA')}.</p><Field readOnly aria-label="Secure landlord onboarding link" value={access.url}/><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={()=>void run('copy',async isCurrent=>{await navigator.clipboard.writeText(access.url);if(isCurrent())setNotice('Secure landlord onboarding link copied.')})}><Copy size={14}/>Copy link</Button><Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={()=>revoke(access.accessId)}>Revoke this link</Button></div></div> : null}{(setup.onboarding?.accessLinks || []).filter(link=>!link.revokedAt && Date.parse(link.expiresAt)>Date.now() && link.id!==access?.accessId).map(link=><div key={link.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2f7] pt-4"><p className="text-sm text-[#607387]">Existing link expires {new Date(link.expiresAt).toLocaleString('en-ZA')}.</p><Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={()=>revoke(link.id)}>Revoke existing link</Button></div>)}</article> : null}
    <Modal open={Boolean(editor)} title={editor?.mode==='onboarding' ? 'Landlord onboarding' : editor?.mode==='corrections' ? 'Request landlord corrections' : 'Edit landlord contact'} onClose={()=>{if(!busy){setEditor(null);setError('')}}} className={editor?.mode==='onboarding' ? 'max-w-4xl' : ''} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={Boolean(busy)} onClick={()=>setEditor(null)}>Cancel</Button><Button form={formId} type="submit" disabled={Boolean(busy) || editor?.mode==='corrections' && !changes.trim()}>{busy ? <Loader2 size={16} className="animate-spin"/> : null}{editor?.mode==='onboarding' ? 'Save onboarding details' : editor?.mode==='corrections' ? 'Request corrections' : 'Save landlord details'}</Button></div>}>
      {error ? <p role="alert" className="mb-4 rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-3 text-sm text-[#9f3131]">{error}</p> : null}
      {editor?.mode==='profile' ? <form id={formId} onSubmit={event=>void save('profile',event)}><ContactFields values={values} onChange={update} disabled={Boolean(busy)}/></form> : null}
      {editor?.mode==='onboarding' ? <form noValidate id={formId} onSubmit={saveOnboarding}><RentalListingLandlordOnboardingEditor data={editor.data} listingId={listing.id} disabled={Boolean(busy)} onChange={data=>setEditor(current=>({...current,data}))}/></form> : null}
      {editor?.mode==='corrections' ? <form id={formId} onSubmit={event=>{event.preventDefault();void run('corrections',async isCurrent=>{const result=await requestRentalLandlordOnboarding(setup.linkedLead.id,'POST',{action:'request_changes',version:setup.onboarding.version,patch:{message:changes.trim()}});if(!result.onboarding)throw new Error('Corrections saved, but onboarding could not refresh. Refresh before editing.');if(isCurrent()){setSetup(current=>({...current,onboarding:result.onboarding}));setEditor(null);setNotice('Corrections requested. The landlord can use the existing valid onboarding link.')}})}}><label className="grid gap-2 text-sm font-semibold text-[#425970]">What should the landlord correct?<Field as="textarea" value={changes} onChange={event=>setChanges(event.target.value)} disabled={Boolean(busy)}/></label></form> : null}
    </Modal>
  </div>
}
