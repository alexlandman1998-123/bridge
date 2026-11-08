import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import Modal from '../ui/Modal'
import { addClientPropertyEnquiry, addClientTag, findClientTags, loadClientPropertyEnquiries, loadClientTags, removeClientTag, searchClientProperties } from '../../services/inboxClientService'
import './ClientOrganiser.css'

export default function ClientOrganiser({ client, section='tags', existing=[], organisationId, onNeedLead, onChanged }) {
 const [rows,setRows]=useState([]),[options,setOptions]=useState([]),[input,setInput]=useState(''),[kind,setKind]=useState('listing'),[choice,setChoice]=useState(''),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[searchError,setSearchError]=useState('')
 const alive=useRef(true),version=useRef(0),lock=useRef(false),isTags=section==='tags',clientId=client?.identityId,org=client?.organisationId||organisationId
 const refresh=useCallback(async()=>{
  const generation=++version.current;setLoading(true);setError('')
  try{const next=isTags?await loadClientTags({identityId:clientId,organisationId:org}):await loadClientPropertyEnquiries({identityId:clientId,organisationId:org});if(version.current===generation)setRows(next)}catch(cause){if(version.current===generation)setError(cause.message)}finally{if(version.current===generation)setLoading(false)}
 },[clientId,org,isTags])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const invalidate=useCallback(()=>{version.current++},[])
 useEffect(()=>{setRows([]);setInput('');setOptions([]);setOpen(false);setError('');if(clientId&&org)void refresh();return invalidate},[refresh,clientId,org,client?.identityVersion,invalidate])
 useEffect(()=>{
  if(!org||!open)return
  let active=true;setSearchError('');const timer=setTimeout(()=>{const query=isTags?findClientTags(org):searchClientProperties(org,kind,input);query.then(next=>{if(active)setOptions(next)}).catch(cause=>{if(active){setOptions([]);setSearchError(cause.message)}})},250)
  return()=>{active=false;clearTimeout(timer)}
 },[org,clientId,isTags,open,kind,input])
 async function save(action){if(lock.current)return;lock.current=true;setSaving(true);setError('');const generation=version.current;try{await action();if(generation!==version.current)return;setInput('');setChoice('');setOpen(false);await refresh();onChanged?.()}catch(cause){if(generation===version.current)setError(cause.message)}finally{lock.current=false;if(alive.current)setSaving(false)}}
 const properties=[...new Map([...existing.map(row=>({...row,targetId:row.targetId||row.id,kind:row.kind||'listing'})),...rows].filter(row=>row.targetId).map(row=>[`${row.kind}:${row.targetId}`,row])).values()]
 return <section className="client-organiser" aria-label={isTags?'Client tags':'Client property enquiries'}><div className="client-organiser-title"><h3>{isTags?'Tags':'Enquired listings & developments'}</h3><button type="button" disabled={saving||loading||Boolean(error)||(!clientId&&!onNeedLead)} onClick={()=>setOpen(value=>!value)} aria-label={isTags?'Add client tag':'Add listing or development'} aria-expanded={open}><Plus size={15}/></button></div>
  {clientId&&<>
  {loading?<span role="status" className="sr-only">Loading {isTags?'tags':'enquiries'}…</span>:isTags?<div className="client-organiser-tags">{rows.map(tag=><button type="button" key={tag} disabled={saving} aria-label={`Remove tag ${tag}`} onClick={()=>void save(()=>removeClientTag(client,tag))}>{tag}<X size={11}/></button>)}</div>:<div className="client-organiser-properties">{properties.map(row=><Link key={`${row.kind}:${row.targetId}`} to={row.path}><span>{row.title||'Open property'}<small>{row.kind==='development'?'Development':'Listing'}</small></span></Link>)}</div>}

  </>}
  {error&&<div role="alert" className="client-organiser-error">{error}{clientId&&<button type="button" onClick={()=>void refresh()}>Retry</button>}</div>}
  {isTags&&searchError&&<p className="client-organiser-error">Tag suggestions unavailable. You can still enter a tag.</p>}
  {open&&isTags&&<Modal open title="Tags" subtitle="Choose an existing tag or create one for this client." onClose={saving?undefined:()=>setOpen(false)} className="client-organiser-modal"><form onSubmit={event=>{event.preventDefault();if(!clientId){setOpen(false);onNeedLead?.(linked=>addClientTag(linked,input));return}void save(()=>addClientTag(client,input))}}><label>Tag name<input autoFocus aria-label="Add or create client tag" placeholder="Type a new tag…" maxLength={60} value={input} disabled={saving} onChange={event=>setInput(event.target.value)}/></label><div className="client-tag-options" aria-label="Existing tags">{options.filter(tag=>!rows.includes(tag)&&tag.toLowerCase().includes(input.toLowerCase())).map(tag=><button type="button" key={tag} aria-pressed={input===tag} onClick={()=>setInput(tag)}>{tag}</button>)}</div>{!clientId&&<p>Choose a tag, then link this chat to a lead to save it to their client record.</p>}{searchError&&<p role="alert">Tag suggestions unavailable. You can still enter a tag.</p>}{error&&<p role="alert">{error}</p>}<button type="submit" aria-label={clientId?'Save client tag':'Link a lead to save tag'} disabled={saving||!input.trim()}>{saving?'Saving…':clientId?'Save tag':'Continue to link a lead'}</button></form></Modal>}
  {open&&!isTags&&<Modal open title="Add property enquiry" subtitle="Find a listing or development this client is interested in." onClose={saving?undefined:()=>setOpen(false)} className="client-organiser-modal"><form onSubmit={event=>{event.preventDefault();if(!clientId){setOpen(false);onNeedLead?.(linked=>addClientPropertyEnquiry(linked,kind,choice));return}if(choice)void save(()=>addClientPropertyEnquiry(client,kind,choice))}}><label>Property type<select value={kind} disabled={saving} onChange={event=>{setKind(event.target.value);setChoice('');setOptions([])}}><option value="listing">Listing</option><option value="development">Development</option></select></label><label>Search<input value={input} onChange={event=>{setInput(event.target.value);setChoice('')}} placeholder="Search by name…"/></label><label>Property<select required value={choice} disabled={saving||Boolean(searchError)} onChange={event=>setChoice(event.target.value)}><option value="">Choose a {kind}</option>{options.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</select></label>{!clientId&&<p>Link this chat to a lead to save the enquiry to their client record.</p>}{searchError&&<p role="alert">{searchError}</p>}{error&&<p role="alert">{error}</p>}<button type="submit" disabled={saving||!choice||Boolean(searchError)}>{saving?'Saving…':clientId?'Add enquiry':'Continue to link a lead'}</button></form></Modal>}
 </section>
}
