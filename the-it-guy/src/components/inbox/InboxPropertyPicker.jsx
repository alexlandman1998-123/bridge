import { useEffect, useRef } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'
import './InboxPropertyPicker.css'
function Photo({ url }) {
 return <span className="inbox-property-photo"><Building2 size={22}/>{url&&<img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true}}/>}</span>
}
export default function InboxPropertyPicker({ kind, options, value, onChange, loading }) {
 const root=useRef(null),selected=options.find(row=>row.id===value),label=kind==='development'?'Development':'Listing'
 useEffect(()=>{
  const outside=event=>{if(root.current&&!root.current.contains(event.target))root.current.open=false}
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)
 },[])
 return <details ref={root} className="inbox-property-picker" onKeyDown={event=>{
  if(event.key==='Escape'){root.current.open=false;root.current.querySelector('summary').focus()}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();root.current.open=true
   const items=[...root.current.querySelectorAll('[role=option]')],index=items.indexOf(document.activeElement)
   const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length:index)-1
   items[next]?.focus()
  }
 }}>
 <summary aria-label={label} aria-haspopup="listbox" aria-busy={loading}>
  <Photo url={selected?.imageUrl}/><span><strong>{selected?.title||(loading?'Loading…':`Choose a ${label.toLowerCase()}`)}</strong><small>{selected?label:'Select from your workspace'}</small></span><ChevronDown size={17}/>
 </summary>
 <div className="inbox-property-options" role="listbox" aria-label={`${label} options`}>
  {loading?<p>Loading…</p>:options.length?options.map(row=><button key={row.id} type="button" role="option" aria-selected={row.id===value} onClick={()=>{onChange(row.id);root.current.open=false;root.current.querySelector('summary').focus()}}><Photo url={row.imageUrl}/><span><strong>{row.title}</strong><small>{label}</small></span>{row.id===value&&<Check size={17}/>}</button>):<p>No {kind==='development'?'developments':'listings'} available in this workspace.</p>}
 </div>
 </details>
}
