import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'

export default function WhatsAppUnread({ organisationId, viewerId, membership, role, enabled=true }) {
  const identity=[viewerId,role,membership?.role,membership?.workspaceRole,membership?.workspace_role,membership?.organisationRole,membership?.organisation_role,membership?.status,membership?.membershipStatus].filter(Boolean).join(':')
  const scope=`${organisationId}:${identity}`
  const [state,setState]=useState({scope:'',count:0,error:false}),generation=useRef(0)
  const invalidate=useCallback(()=>{generation.current++},[])
  const refresh=useCallback(async()=>{
    if(!enabled||!organisationId||!viewerId)return
    const current=++generation.current
    try{const data=await metaIntegrationRequest(organisationId,'inbox_notifications');if(generation.current===current)setState({scope,count:Number(data.unreadCount)||0,error:false})}
    catch{if(generation.current===current)setState({scope,count:0,error:true})}
  },[enabled,organisationId,viewerId,scope])
  useEffect(()=>{
    const initial=window.setTimeout(()=>void refresh(),0);const timer=window.setInterval(()=>{if(!document.hidden)void refresh()},30000)
    window.addEventListener('focus',refresh);window.addEventListener('arch9:whatsapp-read',refresh)
    return()=>{invalidate();window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('arch9:whatsapp-read',refresh)}
  },[refresh,invalidate])
  if(!enabled||!organisationId||!viewerId)return null
  const current=state.scope===scope?state:{count:0,error:false}
  const label=current.error?'WhatsApp messages unavailable':current.count?`WhatsApp, ${current.count} unread messages`:'WhatsApp inbox'
  const params=new URLSearchParams({section:'whatsapp',view:'inbox',organisationId})
  return <Link className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-white text-green-800" to={`/marketing?${params}`} aria-label={label} title={label}><MessageCircle size={20}/>{current.count>0&&<span className="absolute -right-1 -top-1 rounded-full bg-green-700 px-1.5 text-xs font-semibold text-white">{current.count>99?'99+':current.count}</span>}<span className="sr-only" role="status" aria-live="polite">{current.count>0?`${current.count} unread WhatsApp messages`:''}</span></Link>
}
