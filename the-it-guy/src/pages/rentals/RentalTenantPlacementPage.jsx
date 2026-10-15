import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {Loader2,UserRoundCheck} from 'lucide-react'
import {useWorkspace} from '../../context/WorkspaceContext'
import {listRentalLeads} from '../../services/rentals/rentalLeadService'
import {listPersistedRentalApplicationsForLead} from '../../services/rentals/rentalApplicationRepository.js'
import {resolveRentalWorkspaceScope} from '../../services/rentals/rentalWorkspaceScope'
import RentalApplicationTenancyConversionPanel from '../../modules/rentals/shared/applications/RentalApplicationTenancyConversionPanel.jsx'
export default function RentalTenantPlacementPage(){
 const workspace=useWorkspace(),scope=useMemo(()=>resolveRentalWorkspaceScope(workspace),[workspace])
 const key=`${scope.organisationId}:${scope.assignedAgentId}:${scope.branchId}:${scope.scopeLevel}`
 return <PlacementHandoff key={key} scope={scope}/>
}
function PlacementHandoff({scope}){
 const[leads,setLeads]=useState([]),[leadId,setLeadId]=useState(''),[applications,setApplications]=useState([]),[applicationId,setApplicationId]=useState(''),[loading,setLoading]=useState(Boolean(scope.organisationId)),[error,setError]=useState('')
 useEffect(()=>{let active=true;if(!scope.organisationId)return
  listRentalLeads(scope.organisationId,{assignedAgentId:scope.assignedAgentId,branchId:scope.branchId,scopeLevel:scope.scopeLevel,includeAllOrganisationLeads:scope.scopeLevel==='organisation'}).then(rows=>{if(active)setLeads(rows.filter(lead=>lead.role==='tenant'&&lead.stage==='placement_ready'))}).catch(cause=>{if(active)setError(cause.message||'Unable to load tenant handoffs.')}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[scope.organisationId,scope.assignedAgentId,scope.branchId,scope.scopeLevel])
 useEffect(()=>{let active=true;if(!leadId)return
  listPersistedRentalApplicationsForLead(scope.organisationId,leadId).then(rows=>{if(!active)return;const approved=rows.filter(application=>application.status==='approved');setApplications(approved);const lead=leads.find(item=>item.id===leadId);const linked=approved.find(application=>application.id===lead?.relationships?.applicationId);setApplicationId(linked?.id||(!lead?.relationships?.applicationId&&approved.length===1?approved[0].id:''))}).catch(cause=>{if(active)setError(cause.message||'Unable to load the approved application.')})
  return()=>{active=false}
 },[leadId,scope.organisationId,leads])
 const selected=applications.find(application=>application.id===applicationId)
 return <section className="page-content"><div className="ui-section-stack"><header className="ui-toolbar"><div className="ui-toolbar-group"><UserRoundCheck size={20}/><div><p className="text-xs font-semibold uppercase text-[#607891]">Rental pipeline</p><h1 className="text-2xl font-semibold text-[#18324b]">Tenant Placement Handoff</h1><p className="mt-1 text-sm text-[#607891]">Prepare the tenancy from the tenant’s approved application and selected property.</p></div></div></header>{error?<p role="alert" className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-4 text-sm text-[#9f3131]">{error}</p>:null}<section className="ui-panel ui-panel-body">{loading?<p className="py-8 text-center text-sm text-[#607891]"><Loader2 className="mr-2 inline animate-spin" size={15}/>Loading placement-ready tenants…</p>:<><label className="form-field"><span>Placement-ready tenant</span><select value={leadId} onChange={event=>{setLeadId(event.target.value);setApplications([]);setApplicationId('');setError('')}}><option value="">Choose a tenant</option>{leads.map(lead=><option key={lead.id} value={lead.id}>{lead.name} · {lead.focus}</option>)}</select></label>{leadId?<><Link className="mt-3 inline-block text-sm font-semibold text-[#1f4f78]" to={`/agent/rentals/pipeline/leads/${leadId}`}>Open tenant lead</Link><label className="form-field mt-4"><span>Approved application and property</span><select value={applicationId} onChange={event=>setApplicationId(event.target.value)}><option value="">Choose the approved application</option>{applications.map(application=><option key={application.id} value={application.id}>{application.data?.property?.title||application.data?.property?.address||`Application ${application.id.slice(0,8)}`}</option>)}</select></label>{selected?<RentalApplicationTenancyConversionPanel key={selected.id} application={selected}/>:<p className="mt-3 text-sm text-[#607891]">Choose the approved application connected to this tenant journey. Confirm missing links in the tenant workspace.</p>}</>:null}{!leads.length?<p className="mt-3 text-sm text-[#607891]">No tenant leads are currently at Placement ready.</p>:null}</>}</section></div></section>
}
