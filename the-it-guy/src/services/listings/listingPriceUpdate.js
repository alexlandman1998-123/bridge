export function listingPriceChange({ previousPrice, price, showReducedBanner = false, previousReduced = false, listingStatus = 'active', pricePresentation = '' }) {
  const input=String(price ?? '').trim().replace(/[ ,]/g,'')
  const nextPrice=Number(input),oldPrice=Number(previousPrice)
  if(!/^\d+(?:\.\d{1,2})?$/.test(input)||!Number.isFinite(nextPrice)||nextPrice<=0||nextPrice*100>Number.MAX_SAFE_INTEGER)throw new Error('Enter a positive price with at most two decimal places.')
  if(['sold','withdrawn','expired','archived','deleted','transaction_created','let','rented'].includes(String(listingStatus).toLowerCase()))throw new Error('Reopen or relist this listing before updating its advertised price.')
  if(String(pricePresentation).toLowerCase()==='poa')throw new Error('Choose a fixed price in Property before publishing a price update.')
  if(showReducedBanner&&(!(oldPrice>0)||nextPrice>oldPrice||(nextPrice===oldPrice&&!previousReduced)))throw new Error('Choose Reduced only when the new price is lower than the saved price.')
  return {previousPrice:oldPrice,previousReduced:Boolean(previousReduced),price:nextPrice,showReducedBanner:Boolean(showReducedBanner)}
}
export function priceUpdateProperty24Status({ listingStatus, previousPrice, price, showReducedBanner }) {
  if(['under_offer','pending','pending_offer'].includes(String(listingStatus).toLowerCase()))return 'Pending'
  if(showReducedBanner&&Number(price)<=Number(previousPrice))return 'ReducedPrice'
  if(Number(price)>Number(previousPrice)&&Number(previousPrice)>0)return 'RaisedPrice'
  return 'Active'
}
const CHANNELS=['Property24','Private Property','Agency Website','Kingdom Website']
export async function publishListingPriceUpdate({ previousPrice, price, showReducedBanner, previousReduced = false, listingStatus, pricePresentation, activeChannels, retryResults = [], currentPrice, currentReduced }, { save, check, recordStarted, recordStage, send, recordFinished, onProgress = ()=>{} }) {
  const change=listingPriceChange({previousPrice,price,showReducedBanner,previousReduced,listingStatus,pricePresentation})
  const retry=retryResults.length>0
  if(retry&&(Number(currentPrice)!==change.price||Boolean(currentReduced)!==change.showReducedBanner))throw new Error('The saved price changed after this update. Close this window and review the listing before sending again.')
  const targets=retry ? retryResults.filter(row=>row.status==='failed'&&row.retryable!==false&&CHANNELS.includes(row.channel)).map(row=>row.channel) : [...new Set(activeChannels)].filter(channel=>CHANNELS.includes(channel))
  const ready=[],results=retry ? retryResults.filter(row=>row.channel!=='Arch9'&&!targets.includes(row.channel)) : []
  for(const channel of targets){try{await check(channel);ready.push(channel)}catch(error){
    if(error.code!=='LISTING_PUBLICATION_UNSETTLED')throw error
    results.push({channel,status:'uncertain',retryable:false,detail:`${error.message} No new request was sent.`})
  }}
  let saved
  if(!retry){
    saved=await save(change)
    if(!saved?.ok||saved.localOnly)throw saved?.error||new Error('The new price could not be saved. No channel update was sent.')
  }
  results.unshift({channel:'Arch9',status:'saved',detail:`Price saved: R ${change.price.toLocaleString('en-ZA')}${change.showReducedBanner?' · Reduced':''}.`});onProgress([...results])
  if(saved?.distributionSync?.skipped){return {ok:false,results:[...results,...ready.map(channel=>({channel,status:'failed',retryable:false,detail:'The price is saved, but its advertising data could not be prepared. Close this window, refresh the listing and save its advertising details before sending again.'}))]}}
  try{if(ready.length)await recordStarted(ready,change)}catch(error){return {ok:false,results:[...results,...ready.map(channel=>({channel,status:'failed',detail:error.message||'Update history is unavailable. No request was sent.'}))]}}
  for(const channel of ready){
    let accepted=false
    try{
      await recordStage(channel,'submitted',change,saved)
      await send(channel,change,saved)
      accepted=true
      await recordStage(channel,'accepted',change,saved)
      results.push({channel,status:'sent',detail:channel==='Private Property'?'Updated price accepted. Private Property does not expose a Reduced flag; check its public advert.':'Update accepted. Check the public advert to confirm its price.'})
    }catch(error){
      if(accepted||error?.operationAccepted===true){results.push({channel,status:'sent',detail:'Update accepted; its history needs attention. Check status before sending again.'})}
      else{
        const uncertain=error?.outcomeUncertain===true||error?.definiteRejection===false||error?.code==='LISTING_PUBLICATION_UNSETTLED'||error instanceof TypeError||/timeout|timed out|unconfirmed|did not confirm|unknown outcome|network|failed to fetch/i.test(error?.message||'')
        await recordStage(channel,uncertain?'uncertain':'failed',change,saved,error).catch(()=>{})
        results.push({channel,status:uncertain?'uncertain':'failed',retryable:!uncertain,detail:error.message||'The channel did not accept this price. Check status before retrying.'})
      }
    }
    onProgress([...results])
  }
  let warning=saved?.warning||''
  try{await recordFinished(results,change)}catch{warning='The price was saved, but its activity history could not be updated. Check channel status before sending again.'}
  return {ok:!results.some(row=>['failed','uncertain'].includes(row.status)),results,warning,...(!targets.length&&!retry?{message:'Price saved. No currently published channels were available to update.'}:{})}
}
