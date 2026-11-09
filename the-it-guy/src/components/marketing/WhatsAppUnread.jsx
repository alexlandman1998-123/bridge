import { useCallback, useEffect, useRef, useState } from 'react'
import usePortalWorkspaceRefresh from '../../hooks/usePortalWorkspaceRefresh'
import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'

export default function WhatsAppUnread({ organisationId, viewerId, membership, role, enabled=true }) {
  const identity=[viewerId,role,membership?.role,membership?.workspaceRole,membership?.workspace_role,membership?.organisationRole,membership?.organisation_role,membership?.status,membership?.membershipStatus].filter(Boolean).join(':')
  const scope=`${organisationId}:${identity}`
  const [state,setState]=useState({scope:'',count:0,error:false}),generation=useRef(0),pending=useRef(null)
  const invalidate=useCallback(()=>{generation.current++;pending.current=null},[])
  const refresh=useCallback(async()=>{
    if(!enabled||!organisationId||!viewerId||document.hidden||navigator.onLine===false||pending.current?.scope===scope)return
    const request={scope};pending.current=request
    const current=++generation.current
    try{const data=await metaIntegrationRequest(organisationId,'inbox_notifications');if(generation.current===current)setState({scope,count:Number(data.unreadCount)||0,mentions:Number(data.mentionCount)||0,conversationId:data.notificationConversationId,view:data.notificationView,error:false})}
    catch{if(generation.current===current)setState({scope,count:0,error:true})}
    finally{if(pending.current===request)pending.current=null}
  },[enabled,organisationId,viewerId,scope])
  usePortalWorkspaceRefresh({ enabled: Boolean(enabled && organisationId && viewerId), onRefresh: refresh, scopeKey: scope, refreshOnMount: true, pollingIntervalMs: 30000, debounceMs: 100 })
  useEffect(()=>{
    window.addEventListener('arch9:whatsapp-read',refresh)
    return()=>{invalidate();window.removeEventListener('arch9:whatsapp-read',refresh)}
  },[refresh,invalidate])
  if(!enabled||!organisationId||!viewerId)return null
  const current=state.scope===scope?state:{count:0,error:false}
  const label=current.error?'WhatsApp messages unavailable':current.count?`WhatsApp, ${current.count} unread messages`:'WhatsApp inbox'
  const accessibleLabel=current.mentions?`${label}, ${current.mentions} mentions`:label
  const params=new URLSearchParams({channel:'whatsapp',view:current.view||'all',organisationId,...(current.conversationId?{conversation:`whatsapp:${current.conversationId}`}:{})})
  return <Link className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-white text-green-800" to={`/inbox?${params}`} aria-label={accessibleLabel} title={accessibleLabel}><MessageCircle size={20}/>{(current.count>0||current.mentions>0)&&<span className="absolute -right-1 -top-1 rounded-full bg-green-700 px-1.5 text-xs font-semibold text-white">{current.count+Number(current.mentions||0)>99?'99+':current.count+Number(current.mentions||0)}</span>}<span className="sr-only" role="status" aria-live="polite">{current.count>0?`${current.count} unread WhatsApp messages`:''}</span></Link>
}
