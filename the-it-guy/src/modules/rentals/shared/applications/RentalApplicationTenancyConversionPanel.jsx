import {useCallback,useEffect,useRef,useState} from 'react'
import {ArrowRight} from 'lucide-react'
import {Link} from 'react-router-dom'
import {convertRentalApplicationToTenancy,getRentalApplicationTenancyConversion,getRentalTenancyHandoffContext} from '../../../../services/rentals/rentalApplicationRepository.js'
export default function RentalApplicationTenancyConversionPanel({application,onConverted}){
 const[conversion,setConversion]=useState(null),[context,setContext]=useState(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false)
 const guard=useRef(false),current=useRef(application?.id),generation=useRef(0)
 const load=useCallback(async()=>{
  if(!application?.id||current.current!==application.id)return
  const request=++generation.current
  // Existing tenancies stay accessible even if a historical lead needs review.
  const saved=await getRentalApplicationTenancyConversion(application.id)
  const nextContext=saved?null:await getRentalTenancyHandoffContext(application.id)
  if(current.current!==application.id||request!==generation.current)return
  setConversion(saved);setContext(nextContext);setLoaded(true)
 },[application?.id])
 useEffect(()=>{current.current=application?.id;setConversion(null);setContext(null);setLoaded(false);setSaving(false);setError('');void load().catch(cause=>{if(current.current===application?.id)setError(cause.message)});return()=>{if(current.current===application?.id)current.current=null}},[application?.id,application?.status,application?.version,load])
 async function convert(){
  if(guard.current||!loaded||!context?.canCreate)return
  guard.current=true;setSaving(true);setError('')
  try{
   const result=await convertRentalApplicationToTenancy({applicationId:application.id,expectedVersion:application.version})
   if(current.current!==application.id)return
   if(!result?.tenancy_id||!result?.lease_id)throw new Error('The tenancy connection could not be confirmed. Refresh before retrying.')
   setConversion({id:result.tenancy_id,status:'draft',rental_leases:{id:result.lease_id,status:'draft'}})
   try{await onConverted?.()}catch(cause){if(current.current===application.id)setError(`Tenancy saved. Refresh its details: ${cause.message}`)}
  }catch(cause){if(current.current===application.id)setError(cause.message||'Unable to prepare this tenancy.')}
  finally{guard.current=false;if(current.current===application.id)setSaving(false)}
 }
 if(application?.status!=='approved')return <p className="rounded-xl border bg-white p-5 text-sm text-slate-600">Approve the reviewed application before preparing a lease.</p>
 return <section className="mt-5 border-t pt-5"><h3 className="font-semibold">Tenancy preparation</h3>{conversion?<div className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><p><b>Saved tenancy.</b> Lease: {(Array.isArray(conversion.rental_leases)?conversion.rental_leases[0]:conversion.rental_leases)?.status||'draft'}.</p><p className="mt-1">Open its workspace to upload the agreement and signed copies, then complete move-in readiness and inspection.</p><Link to={`/agent/rentals/tenancies/${encodeURIComponent(conversion.id)}`} className="mt-3 inline-flex items-center gap-1 font-semibold underline">Open tenancy workspace <ArrowRight className="h-4 w-4"/></Link></div>:<div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-600">Creates one saved tenancy and lease, reserves the unit, and links both records to this tenant lead. Complete the tenant journey to Placement ready first.</p>{loaded&&!context?.canCreate?<p className="mt-2 text-sm text-amber-800">{context?.leadId?`Current tenant stage: ${String(context.leadStage||'needs review').replaceAll('_',' ')}.`:'Link this application to its separate tenant lead before continuing.'} Open the lead to complete its saved journey.</p>:null}{context?.leadId?<Link to={`/agent/rentals/pipeline/leads/${context.leadId}`} className="mt-2 inline-block text-sm font-semibold text-sky-700 underline">Open tenant lead</Link>:null}<button type="button" disabled={saving||!loaded||!context?.canCreate} onClick={()=>void convert()} className="mt-3 block rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving?'Creating…':'Create tenancy draft'}</button></div>}{error?<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>:null}</section>
}
