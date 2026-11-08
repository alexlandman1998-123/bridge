import {useEffect,useRef,useState} from 'react'
import {FileUp,Save,SlidersHorizontal,UsersRound} from 'lucide-react'
import {saveEmailAudience} from '../../services/emailCampaignService'
import AudienceImportDialog from './AudienceImportDialog'
import {loadMarketingAudiences} from '../../services/marketingAudienceService'
import './EmailAudienceBuilder.css'
export default function EmailAudienceBuilder({audienceFilter,onChange,contacts,savedAudiences,organisationId,userId,onRefresh,setNotice,setError,subscriptionId}){
 const [name,setName]=useState(''),[saving,setSaving]=useState(false),[importing,setImporting]=useState(false),[selectionName,setSelectionName]=useState('')
 const saveLock=useRef(false)
 const [library,setLibrary]=useState(null),[libraryError,setLibraryError]=useState(''),[attempt,setAttempt]=useState(0)
 useEffect(()=>{
  let active=true
  setLibrary(null);setLibraryError('')
  async function load(){
   const first=await loadMarketingAudiences(organisationId)
   const audiences=[...(first.audiences||[])]
   for(let offset=20;offset<first.total;offset+=20){
    if(!active)return
    const page=await loadMarketingAudiences(organisationId,'',offset)
    audiences.push(...(page.audiences||[]))
   }
   if(active)setLibrary({...first,audiences,organisationId})
  }
  load().catch(cause=>{if(active)setLibraryError(cause.message||'Unable to load shared audiences.')})
  return()=>{active=false}
 },[organisationId,attempt,savedAudiences])
 const shared=library?.organisationId===organisationId?library:null

 const set=(key,value)=>{setSelectionName('');const next={...audienceFilter,[key]:value};delete next.saved_audience_id;delete next.shared_audience_id;delete next.audience_revision;onChange(next)}
 const apply=id=>{if(id.startsWith('shared:')){const audience=shared?.audiences.find(row=>row.id===id.slice(7));if(audience){onChange({shared_audience_id:audience.id,audience_revision:audience.revision});setSelectionName(audience.name);setNotice(`Selected “${audience.name}”.`)}return}const audience=savedAudiences.find(row=>row.id===id);if(!audience)return;onChange(audience.filter_json||{});setSelectionName(audience.name);setNotice(`Applied “${audience.name}”.`)}
 const save=async()=>{if(saveLock.current)return;saveLock.current=true;setSaving(true);setError('');try{await saveEmailAudience({organisationId,userId,audience:{name:name.trim(),filterJson:audienceFilter}});setName('');setNotice('Audience saved.');await onRefresh()}catch(cause){setError(cause.message||'Unable to save this audience.')}finally{saveLock.current=false;setSaving(false)}}
 return <section className="email-audience-studio email-audience-builder">
 <header className="email-audience-builder-heading"><div><SlidersHorizontal size={17}/><h2>Audience builder</h2></div><button type="button" className="email-audience-import" disabled={!subscriptionId} title={!subscriptionId?'Choose an email category in Step 1':undefined} onClick={()=>setImporting(true)}><FileUp size={15}/>Import Excel / CSV</button></header>
 <div className="email-audience-saved"><label>Saved audience<select aria-label="Apply a saved audience" value={audienceFilter.shared_audience_id?`shared:${audienceFilter.shared_audience_id}`:audienceFilter.saved_audience_id||savedAudiences.find(row=>JSON.stringify(row.filter_json)===JSON.stringify(audienceFilter))?.id||''} onChange={event=>apply(event.target.value)}><option value="">Choose a saved audience</option>{shared?.audiences.map(row=><option key={`shared:${row.id}`} value={`shared:${row.id}`}>{row.name} · Shared CRM</option>)}{savedAudiences.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button type="button" className="ma-button" onClick={()=>{setAttempt(value=>value+1);Promise.resolve().then(()=>onRefresh()).catch(cause=>setError(cause.message||'Unable to refresh email audiences.'))}}>Refresh audiences</button>{selectionName&&<span role="status"><UsersRound size={14}/>{selectionName}</span>}</div>
 {libraryError&&<p role="alert">{libraryError} Use Refresh audiences to try again.</p>}
 <div className="email-audience-filters"> <label className="wa-field-label"><span>Contact type</span><select value={audienceFilter.role_type||''} onChange={event=>set('role_type',event.target.value)}><option value="">All contact types</option>{['lead','buyer','seller','investor','landlord','tenant'].map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select></label><label className="wa-field-label"><span>Area</span><input value={audienceFilter.area||''} onChange={event=>set('area',event.target.value)} placeholder="Any area"/></label><label className="wa-field-label"><span>Tag</span><input value={audienceFilter.tag||''} onChange={event=>set('tag',event.target.value)} placeholder="Any tag"/></label></div>
 <details className="email-audience-individuals"><summary>Choose individual contacts <span>{audienceFilter.contact_ids?.length?`${audienceFilter.contact_ids.length} selected`:'Optional'}</span></summary>{contacts.length?<label className="wa-field-label"><span>Contacts</span><select multiple aria-label="Specific contacts" value={audienceFilter.contact_ids||[]} onChange={event=>set('contact_ids',[...event.target.selectedOptions].map(option=>option.value))}>{contacts.map(contact=><option key={contact.id} value={contact.id}>{contact.full_name||contact.email} · {contact.email}</option>)}</select><small>Use ⌘/Ctrl to select multiple contacts.</small></label>:<p>No marketing contacts yet. Import an audience to get started.</p>}</details>
 <div className="email-audience-save"><label><span>Save this selection</span><input value={name} maxLength={140} onChange={event=>setName(event.target.value)} placeholder="Audience name" aria-label="Audience name"/></label><button type="button" disabled={saving||!name.trim()} onClick={()=>void save()}><Save size={14}/>{saving?'Saving…':'Save audience'}</button></div>
 {importing&&<AudienceImportDialog key={`${organisationId}:${subscriptionId}`} organisationId={organisationId} subscriptionId={subscriptionId} onClose={()=>setImporting(false)} onImported={async receipt=>{await onRefresh();onChange({contact_ids:receipt.contactIds});setSelectionName(receipt.name);setNotice(`Imported “${receipt.name}”: ${receipt.total} contacts, ${receipt.eligible} eligible for this email category.`)}}/>}
 </section>
}
