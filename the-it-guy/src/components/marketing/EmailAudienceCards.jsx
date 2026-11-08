import {UsersRound,Check,Plus,ArrowUpRight} from 'lucide-react'
import {useEffect,useState} from 'react'
import Modal from '../ui/Modal'
import MarketingAudiences from './MarketingAudiences'
import {loadMarketingAudiences,previewMarketingAudience} from '../../services/marketingAudienceService'
import {supabase} from '../../lib/supabaseClient'
import './EmailAudienceCards.css'

export default function EmailAudienceCards({organisationId,subscriptionId,audienceFilter,onSelect}){
 const [state,setState]=useState(null),[attempt,setAttempt]=useState(0),[modal,setModal]=useState('')
 useEffect(()=>{let active=true
  async function load(){
   const library=await loadMarketingAudiences(organisationId)
   const audiences=[...(library.audiences||[])]
   for(let offset=20;offset<library.total;offset+=20){if(!active)return;const page=await loadMarketingAudiences(organisationId,'',offset);audiences.push(...page.audiences)}
   const cards=new Array(audiences.length);let next=0
   await Promise.all(Array.from({length:Math.min(4,audiences.length)},async()=>{
    while(next<audiences.length&&active){const index=next++,audience=audiences[index]
     const [preview,history]=await Promise.allSettled([
      previewMarketingAudience({organisationId,audience,channel:'email',subscriptionId}),
      loadAudienceOpenRate(organisationId,audience.id),
     ])
     cards[index]={...audience,contacts:preview.status==='fulfilled'?preview.value.matched:null,openRate:history.status==='fulfilled'?history.value:undefined}
    }
   }))
   if(active)setState({organisationId,cards})
  }
  load().catch(error=>{if(active)setState({organisationId,error:error.message})});return()=>{active=false}
 },[organisationId,subscriptionId,attempt])
 const current=state?.organisationId===organisationId?state:null
 return <section className="email-audience-cards" aria-label="Saved audiences">
  <header className="ea-heading"><div><h1>Choose your audience</h1><span>{current?.cards?.length??'…'} saved {current?.cards?.length===1?'audience':'audiences'}</span></div><button className="ea-add" type="button" onClick={()=>setModal('add')}><Plus size={16}/>Add audience</button></header>
  {!current&&<p role="status">Loading audiences…</p>}
  {current?.error&&<p role="alert">{current.error}<button onClick={()=>setAttempt(value=>value+1)}>Retry</button></p>}
  <div className="email-audience-card-grid">{current?.cards?.map(audience=><article key={audience.id} className={audienceFilter?.shared_audience_id===audience.id?'is-selected':''}>
   <div className="ea-card-heading"><span className="ea-icon"><UsersRound size={21}/></span>{audienceFilter?.shared_audience_id===audience.id&&<span className="ea-selected"><Check size={12}/>Selected</span>}</div><h3>{audience.name}</h3><dl><div><dt>Contacts</dt><dd>{audience.contacts??'Unavailable'}</dd></div><div><dt>Average open rate</dt><dd className={audience.openRate==null?'ea-no-history':''}>{audience.openRate===undefined?'Unavailable':audience.openRate===null?'No history':`${audience.openRate}%`}</dd></div></dl>
   <footer><button className="ea-select" aria-pressed={audienceFilter?.shared_audience_id===audience.id} type="button" onClick={()=>onSelect(audience)}>{audienceFilter?.shared_audience_id===audience.id?<><Check size={14}/>Selected</>:'Select audience'}</button><button className="ea-view" type="button" onClick={()=>setModal(audience.id)}>View contacts<ArrowUpRight size={14}/></button></footer>
  </article>)}</div>
  {current?.cards?.length===0&&<p>No saved audiences yet.</p>}
  <Modal open={Boolean(modal)} title={modal==='add'?'Add audience':'Audience contacts'} onClose={()=>{setModal('');setAttempt(value=>value+1)}} className="ma-library-modal">
   {modal&&<MarketingAudiences key={`${organisationId}:${modal}`} organisationId={organisationId} channel="email" subscriptionId={subscriptionId} initialCreate={modal==='add'} initialAudience={current?.cards?.find(row=>row.id===modal)} onSelect={async audience=>{await onSelect(audience);setModal('');setAttempt(value=>value+1)}}/>}
  </Modal>
 </section>
}
export async function loadAudienceOpenRate(organisationId,audienceId){
 const ids=[]
 for(let offset=0;;offset+=1000){const response=await supabase.from('email_campaigns').select('id').eq('organisation_id',organisationId).eq('audience_filter->>shared_audience_id',audienceId).order('id').range(offset,offset+999);if(response.error)throw response.error;ids.push(...response.data.map(row=>row.id));if(response.data.length<1000)break}
 let delivered=0,opened=0
 for(let offset=0;offset<ids.length;offset+=100){const response=await supabase.from('email_campaign_performance').select('delivered,opened').eq('organisation_id',organisationId).in('campaign_id',ids.slice(offset,offset+100));if(response.error)throw response.error;for(const row of response.data){delivered+=Number(row.delivered)||0;opened+=Number(row.opened)||0}}
 return delivered?Math.round(Math.min(1,opened/delivered)*1000)/10:null
}
