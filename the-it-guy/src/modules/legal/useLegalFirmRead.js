import { useEffect, useState } from 'react';
import { legalRegisterRows } from './legalFirmOverviewModel';
/** Each source settles independently; a failed reader cannot hide the other workspace. */
export function useLegalFirmRead(legal,{kind='register',practice='',search='',legalPage=1,conveyancingPage=1,reload=0}) {
  const [legalResult,setLegalResult]=useState(null),[conveyancing,setConveyancing]=useState(null);
  const {service,firmId,userId,revoke,accessVersion}=legal;
  useEffect(()=>{
    let active=true;setLegalResult(null);
    if(practice!=='conveyancing') {
      const request=kind==='overview'?service.firmOverview(firmId,practice||null):service.register(firmId,{discipline:practice,search,page:legalPage,page_size:20,scope:'all'}).then(legalRegisterRows);
      request.then(data=>{if(active)setLegalResult({data});}).catch(error=>{if(active){setLegalResult({error});if(error.code==='42501')revoke();}});
    }
    return()=>{active=false;};
  },[service,firmId,practice,search,legalPage,kind,reload,revoke,accessVersion]);
  useEffect(()=>{
    let active=true;setConveyancing(null);
    if(!practice||practice==='conveyancing') import('./legalConveyancingReader').then(({readConveyancingRegister})=>readConveyancingRegister({firmId,userId,page:conveyancingPage,search})).then(data=>{if(active)setConveyancing({data});}).catch(error=>{if(active)setConveyancing({error});});
    return()=>{active=false;};
  },[firmId,userId,practice,search,conveyancingPage,reload,accessVersion]);
  return {legalResult,conveyancing};
}
