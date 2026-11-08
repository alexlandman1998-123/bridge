import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {Mail,Phone,PanelRightClose,Plus} from 'lucide-react'
import {loadInboxContactSummary} from '../../services/inboxContactSummaryService'
import InboxCrmActions from './InboxCrmActions'
import './InboxEmailContactPanel.css'
const money=value=>value?new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:0}).format(value):''
const date=value=>value?new Date(value).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}):''
const active=value=>!['closed','cancelled','completed','lost','spam','archived','deleted'].includes(String(value||'').toLowerCase())
function Facts({rows}){return <dl className="inbox-contact-facts">{rows.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
export default function InboxEmailContactPanel({organisationId,userId,agentName,conversation,onClose,onCreate,onLinked,children,revision}){
 const [tab,setTab]=useState('overview'),[data,setData]=useState(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[linkOpen,setLinkOpen]=useState(false)
 useEffect(()=>{let alive=true;loadInboxContactSummary({organisationId,conversationId:conversation.id,email:conversation.address}).then(result=>{if(alive)setData(result)}).catch(()=>{if(alive)setError('Contact details could not be loaded.')});return()=>{alive=false}},[organisationId,conversation.id,conversation.address,version,revision])
 const contacts=data?.contacts||[],contact=contacts.length===1?contacts[0]:null
 const savedName=contact?[contact.first_name,contact.last_name].filter(Boolean).join(' '):''
 const name=savedName||(conversation.name&&!conversation.name.includes('@')?conversation.name:'Contact name not recorded')
 const email=contact?.email||conversation.address,phone=contact?.phone
 const leads=data?.leads||[],transactions=data?.transactions||[]
 const history=[...(data?.activities||[]).map(row=>({id:row.activity_id,title:row.activity_type||'CRM activity',body:row.activity_note,at:row.activity_date||row.created_at})),...(data?.conversations||[]).map(row=>({id:row.id,title:row.id===conversation.id?'This conversation':'Previous conversation',body:row.subject||'No subject',at:row.last_message_at})),...(data?.enquiries||[]).filter(row=>row.at).map(row=>({...row,title:`${row.kind} enquiry`,body:row.title}))].sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0))
 return <>
 <div className="revo-details-heading"><strong>Contact details</strong><button type="button" className="revo-icon" aria-label="Hide contact details" onClick={onClose}><PanelRightClose size={17}/></button></div>
 <div className="inbox-contact-identity"><h2>{name}</h2><div><a href={`mailto:${email}`}><Mail size={13}/>{email}</a>{phone&&<a href={`tel:${phone}`}><Phone size={13}/>{phone}</a>}</div>{contacts.length>1&&<small>Multiple saved contacts use this email. Open a linked lead to confirm the person.</small>}</div>
 <button className="inbox-create-lead-button inbox-contact-create-lead" type="button" onClick={onCreate}><Plus size={14}/>Create lead</button>
 <div className="inbox-contact-tabs" role="tablist" aria-label="Contact summary sections" onKeyDown={event=>{const tabs=['overview','enquiries','history'];if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const index=tabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;setTab(tabs[next]);event.currentTarget.querySelectorAll('[role=tab]')[next]?.focus()}}}>{['overview','enquiries','history'].map(item=><button type="button" role="tab" aria-selected={tab===item} tabIndex={tab===item?0:-1} key={item} id={`contact-${item}-tab`} aria-controls={`contact-${item}`} onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div>
 <div className="inbox-contact-panel-content" role="tabpanel" id={`contact-${tab}`} aria-labelledby={`contact-${tab}-tab`}>
 {!data&&!error&&<p role="status">Loading contact summary…</p>}{error&&<p role="alert">{error}</p>}
 {tab==='overview'&&<>
 <section><h3>Active leads</h3>{leads.filter(row=>active(row.status)&&active(row.stage)).map(lead=><article className="inbox-contact-record" key={lead.lead_id}><div className="inbox-contact-record-heading"><Link to={`/pipeline/leads/${lead.lead_id}`}>Open lead</Link></div><Facts rows={[["Stage",lead.stage||lead.status],["Owner",data.people.find(row=>row.id===lead.assigned_user_id)?.full_name||data.people.find(row=>row.id===lead.assigned_user_id)?.email],["Priority",lead.priority],["Budget",money(lead.budget)],["Property",lead.enquired_property_title||lead.property_interest],["Area",lead.area_interest],["Next follow-up",date(lead.next_follow_up_at)]]}/></article>)}{data&&!leads.some(row=>active(row.status)&&active(row.stage))&&<p>No active lead found.</p>}<div className="inbox-contact-link-card"><div><strong>Connect a saved lead</strong><p>Link this conversation to an existing lead.</p></div><button type="button" className="inbox-contact-link-action" onClick={()=>setLinkOpen(true)}>Link existing lead</button></div></section>
 <section><h3>Active transactions</h3>{transactions.filter(row=>!row.cancelled_at&&active(row.lifecycle_state)).map(deal=><article className="inbox-contact-record" key={deal.id}><Link to={`/transactions/${deal.id}`}>{deal.transaction_reference||'Open transaction'}</Link><Facts rows={[["Property",[deal.property_address_line_1,deal.suburb].filter(Boolean).join(', ')],["Stage",deal.current_main_stage||deal.stage],["Price",money(deal.sales_price||deal.purchase_price)],["Finance",deal.finance_status],["Next action",deal.next_action],["Expected transfer",date(deal.expected_transfer_date)],["Agent",deal.assigned_agent],["Attorney",deal.attorney],["Risk",deal.risk_status]]}/></article>)}{data&&!transactions.some(row=>!row.cancelled_at&&active(row.lifecycle_state))&&<p>No active transaction found.</p>}</section>
 <section><h3>This conversation</h3>{children}</section>
 </>}
 {tab==='enquiries'&&<section><h3>Previous property enquiries</h3>{data?.enquiries.map(row=><Link className="inbox-contact-enquiry" key={row.id} to={row.path}><strong>{row.title||row.kind}</strong><small>{row.kind}{row.at?` · ${date(row.at)}`:''}</small></Link>)}{data&&!data.enquiries.length&&<p>No property enquiries recorded.</p>}</section>}
 {tab==='history'&&<section><h3>Recent activity</h3><ol className="inbox-contact-history">{history.map(row=><li key={row.id}><strong>{row.title}</strong><time>{date(row.at)}</time>{row.body&&<p>{row.body}</p>}</li>)}</ol>{data&&!history.length&&<p>No earlier activity recorded.</p>}<small>Showing up to 50 recent CRM activities and conversations.</small></section>}
 {data?.issues.length>0&&<p role="alert">Some information could not be loaded: {data.issues.join(', ')}.</p>}
 </div>
 {linkOpen&&<InboxCrmActions mode="link" info={{contact,context:{candidates:leads.map(row=>({kind:row.lead_category,recordId:row.lead_id,name:savedName||name}))}}} current={{id:conversation.id,channel:'email',contact_name:name}} workspace={{organisationId,currentUserId:userId,assignees:[{id:userId,name:agentName}]}} onClose={()=>setLinkOpen(false)} onCreate={()=>{setLinkOpen(false);onCreate()}} onChanged={async()=>{setVersion(value=>value+1);await onLinked?.()}}/>}
 </>
}
