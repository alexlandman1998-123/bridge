import {useEffect,useState} from 'react'
import {listBuyerLeadDevelopmentOptions} from '../../services/developmentBuyerLeadService'
export default function EmailDevelopmentSelector({organisationId,value,onChange}){
 const [result,setResult]=useState(null),[attempt,setAttempt]=useState(0)
 useEffect(()=>{let active=true;listBuyerLeadDevelopmentOptions(organisationId).then(options=>{if(active)setResult({organisationId,options})}).catch(error=>{if(active)setResult({organisationId,error:error.message})});return()=>{active=false}},[organisationId,attempt])
 const current=result?.organisationId===organisationId?result:null
 const options=current?.options||[]
 return <div className="eb-field"><label>Linked development (optional)<select aria-label="Linked development" value={value?.development_id||''} disabled={!current||Boolean(current.error)} onChange={event=>{const option=options.find(row=>row.id===event.target.value);onChange(option?{development_id:option.id,development_name:option.label}:null)}}>
  <option value="">No development — general campaign</option>
  {value?.development_id&&!options.some(row=>row.id===value.development_id)&&<option value={value.development_id}>{value.development_name||'Linked development'}</option>}
  {options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
 </select></label><small>The same email appears in Marketing and in the linked development’s Marketing campaigns.</small>
 {current?.error&&<p role="alert">{current.error} <button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry developments</button></p>}
 </div>
}
