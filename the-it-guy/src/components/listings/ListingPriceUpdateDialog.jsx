import { useRef,useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { listingPriceChange } from '../../services/listings/listingPriceUpdate.js'
export default function ListingPriceUpdateDialog({ currentPrice,currentReduced=false,listingStatus,pricePresentation,listingType='sale',onPublish,onClose,externalBusy=false }){
  const [originalPrice]=useState(currentPrice)
  const [originalReduced]=useState(currentReduced)
  const [price,setPrice]=useState(String(currentPrice||'')),[reduced,setReduced]=useState(Boolean(currentReduced)),[busy,setBusy]=useState(false),[results,setResults]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const lock=useRef(false)
  const saved=results.some(row=>row.channel==='Arch9'&&row.status==='saved')
  const failed=results.filter(row=>row.status==='failed'&&row.retryable!==false)
  async function submit(retry=false){
    if(lock.current||externalBusy)return
    lock.current=true;setBusy(true);setError('');setNotice('')
    try{
      const change=listingPriceChange({previousPrice:originalPrice,price,showReducedBanner:reduced,previousReduced:originalReduced,listingStatus,pricePresentation})
      const outcome=await onPublish({...change,retryResults:retry?results:[],onProgress:setResults})
      if(outcome?.cancelled||outcome?.deferred)return
      if(outcome?.results)setResults(outcome.results)
      if(outcome?.ok===false)setError('The price is saved where confirmed below. Some channels need attention; check their results before retrying.')
      else setNotice(outcome?.warning||outcome?.message||'Price saved. Check each channel result to confirm delivery.')
    }catch(failure){setError(failure.message||'The price could not be updated. Check channel status before trying again.')}
    finally{lock.current=false;setBusy(false)}
  }
  return <Modal open title="Update price" onClose={()=>{if(!busy)onClose()}} footer={<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Close</Button>{!saved?<Button type="button" disabled={busy||externalBusy} onClick={()=>void submit()}>{busy?'Saving and publishing…':'Save and publish price'}</Button>:failed.length?<Button type="button" disabled={busy||externalBusy} onClick={()=>void submit(true)}>Retry failed channels</Button>:null}</div>}>
    <div className="space-y-4 text-sm">
      <p>Saved {listingType==='rental'?'rental':'asking'} price: R {Number(originalPrice||0).toLocaleString('en-ZA')}</p>
      <label className="grid gap-2 font-semibold">New price (R)<Field type="number" min="0.01" step="0.01" inputMode="decimal" value={price} disabled={busy||saved} onChange={event=>{setPrice(event.target.value);if(Number(event.target.value)>Number(originalPrice)||(Number(event.target.value)===Number(originalPrice)&&!originalReduced))setReduced(false)}} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={reduced} disabled={busy||saved} onChange={event=>setReduced(event.target.checked)} />Mark as Reduced</label>
      <p className="text-xs text-slate-600">Updates the saved price and all currently published channels. Property24 supports a reduced-price status; under-offer listings keep Pending. Private Property receives the price but has no Reduced flag. Your website can show Reduced.</p>
      {busy?<p role="status">Saving and sending the price update…</p>:null}{error?<p role="alert" className="text-red-800">{error}</p>:null}{notice?<p role="status" className="text-green-800">{notice}</p>:null}
      {results.length?<div aria-label="Price update results" className="space-y-2">{results.map(row=><div key={row.channel} className="rounded-lg border p-3"><strong>{row.channel}: {row.status==='sent'?'Accepted':row.status==='saved'?'Saved':row.status==='uncertain'?'Check status':'Needs attention'}</strong><p>{row.detail}</p></div>)}</div>:null}
    </div>
  </Modal>
}
