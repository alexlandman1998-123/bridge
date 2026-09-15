import{r as h,j as e,L as lt,N as Se}from"./vendor-react-nZI-YelQ.js";import{r as Te,b as ot,D as Ce,c as dt,A as pe,d as Ee,e as X,f as ct,h as ut,i as mt,j as pt,k as gt,u as ht,l as ft,m as bt,p as xt,n as yt,o as vt,q as jt,g as Nt}from"./attorneyOperations-JLXu8kTh.js";import{g as kt,a as wt}from"./appointmentTypeDefinitions-DMiwhQCw.js";import{P as St,a1 as ee,q as Le,u as Tt,d as Ct,F as It,U as be,C as qe,X as te,aN as xe,R as At,aE as Be,ab as Oe,b8 as Rt}from"./vendor-icons-BqoWcGWz.js";import{u as Dt,H as Ie}from"./index-D8YQMSSu.js";import{l as Mt}from"./agencyPipelineService-BSgcBFt7.js";import{u as zt}from"./useAttorneyPermissions-2_FQQU1y.js";import"./vendor-runtime-CsAVBJvT.js";import"./attorneyPermissions-BySJr2gh.js";import"./attorneyFirmServiceShared-CljLCpQz.js";import"./matterWorkflowPlanService-CkHdsMP2.js";import"./financeType-CUnNfZDz.js";import"./matterScenarioProfile-BvlfAaKd.js";import"./purchaserPersonas-BK3vfNim.js";import"./sellerMandateInformationModel-BxAh6k0x.js";import"./conditionalPackDataRules-JMlIzFC_.js";import"./transactionSaleProfile-maT5I4ZG.js";import"./documentRequestCanonicalMatrix-DiA7yn1Q.js";import"./dashboardSecondaryDataApi-Ck-W43Jf.js";import"./attorneySelectors-HBmn74jJ.js";import"./stages-C8AZJ3uI.js";import"./attorneyOperationalEngine-CN1kY-SK.js";import"./permissions-CaHWqXeq.js";import"./matterPropertyContext-CfgY-xr2.js";import"./attorneyFirms-DOyKue9g.js";import"./storageFallbacks-BNLWdM2_.js";import"./inviteService-DwVEJ7L6.js";import"./bondAssignmentService-ConeXqIU.js";import"./universalAssignmentService-Dqlb4bUi.js";import"./activityAudit-CtQkWBNJ.js";import"./portalCanonicalFieldFallbacks-DnJGhHvZ.js";import"./canonicalFieldResolver-BUnDPJsV.js";import"./vendor-supabase-DTqiiTOY.js";import"./agentListingStorage-kQGHDol6.js";import"./appointmentAvailabilityEngine-COYaKwkd.js";import"./buyerLifecycleService-Cfc8ZnOZ.js";import"./sellerDocumentRequirementEngine-KbAA0ckQ.js";import"./propertyTaxonomy-BFeaYqoy.js";import"./sellerBasePackContract-Bl6CBu2v.js";import"./leadCategory-D1nNq22h.js";const W=8,Pe=18,ge=(Pe-W)*60,U={transfer:{label:"Transfer Signing",accent:"#2563eb",text:"#174ea6",bg:"#eff6ff",border:"#bfdbfe"},bond:{label:"Bond Signing",accent:"#7c3aed",text:"#5b21b6",bg:"#f5f3ff",border:"#ddd6fe"},cancellation:{label:"Cancellation Signing",accent:"#16a34a",text:"#166534",bg:"#ecfdf3",border:"#bbf7d0"},reschedule:{label:"Reschedule Request",accent:"#f97316",text:"#9a3412",bg:"#fff7ed",border:"#fed7aa"},internal:{label:"Internal Meeting",accent:"#64748b",text:"#334155",bg:"#f8fafc",border:"#dbe3ef"},buyer:{label:"Buyer",accent:"#2563eb",text:"#1d4ed8",bg:"#eff6ff",border:"#bfdbfe"},seller:{label:"Seller",accent:"#16a34a",text:"#166534",bg:"#ecfdf3",border:"#bbf7d0"},both:{label:"Both Parties",accent:"#8b5cf6",text:"#6d28d9",bg:"#f5f3ff",border:"#ddd6fe"},deadline:{label:"Deadline",accent:"#ef4444",text:"#b42318",bg:"#fef2f2",border:"#fecaca"},task:{label:"Task",accent:"#0f766e",text:"#0f766e",bg:"#f0fdfa",border:"#99f6e4"},external:{label:"External",accent:"#d97706",text:"#92400e",bg:"#fffbeb",border:"#fde68a"}},he={confirmed:{label:"Confirmed",color:"#067647",bg:"#ecfdf3",border:"#bbf7d0"},awaiting_confirmation:{label:"Pending",color:"#b45309",bg:"#fffbeb",border:"#fde68a"},reschedule_requested:{label:"Reschedule Requested",color:"#c2410c",bg:"#fff7ed",border:"#fed7aa"},blocked:{label:"Blocked",color:"#b42318",bg:"#fef3f2",border:"#fecaca"},completed:{label:"Completed",color:"#067647",bg:"#ecfdf3",border:"#bbf7d0"},cancelled:{label:"Cancelled",color:"#475569",bg:"#f8fafc",border:"#dbe3ef"}},_t=["Day","Week","Month","Agenda"],G=["#2563eb","#16a34a","#7c3aed","#f97316","#db2777","#0891b2","#65a30d","#dc2626"],$t={transfer_signing:xe,bond_signing:xe,attorney_consultation:be,internal_meeting:qe};function v(n=""){return String(n||"").trim()}function N(n=""){return v(n).toLowerCase()}function Ae(n){const t=new Date(n||"").getTime();return Number.isFinite(t)?t<Date.now():!1}function H(n,t){const r=new Date(n||""),i=new Date(t||"");return Number.isNaN(r.getTime())||Number.isNaN(i.getTime())?!1:r.getFullYear()===i.getFullYear()&&r.getMonth()===i.getMonth()&&r.getDate()===i.getDate()}function ne(n){return H(n,new Date)}function B(n,t){const r=new Date(n);return r.setDate(r.getDate()+t),r}function ie(n){const t=new Date(n);return t.setHours(0,0,0,0),t}function V(n){const t=ie(n),r=t.getDay(),i=r===0?-6:1-r;return t.setDate(t.getDate()+i),t}function Fe(n){const t=ie(n);return t.setDate(1),t}function re(n,t={}){const r=new Date(n||"");return Number.isNaN(r.getTime())?"Date pending":r.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:t.includeYear===!1?void 0:"numeric"})}function J(n){const t=new Date(n||"");return Number.isNaN(t.getTime())?"Time pending":t.toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"})}function Re(n=""){const t=v(n).match(/^(\d{2}):(\d{2})$/);if(!t)return Number.NaN;const r=Number(t[1]),i=Number(t[2]);return r>23||i>59?Number.NaN:r*60+i}function Et(n={},t=60){const r=Re(n.startTime),i=Re(n.endTime);return Number.isFinite(r)&&Number.isFinite(i)&&i>r?i-r:t}function ye(n){const t=new Date(n||"");return Number.isNaN(t.getTime())?"Date pending":t.toLocaleString("en-ZA",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}function Lt(n){const t=n instanceof Date?n:new Date(n||"");if(Number.isNaN(t.getTime()))return"";const r=t.getFullYear(),i=String(t.getMonth()+1).padStart(2,"0"),a=String(t.getDate()).padStart(2,"0");return`${r}-${i}-${a}`}function De(n=""){const t=v(n).split(/\s+/).filter(Boolean);return t.length?t.slice(0,2).map(r=>r.charAt(0).toUpperCase()).join(""):"YL"}function qt(n=""){const t=v(n);return t?t.split("_").filter(Boolean).map(r=>r.charAt(0).toUpperCase()+r.slice(1)).join(" "):"Team Member"}function Me(n){const t=new Date(n||"");if(Number.isNaN(t.getTime()))return"";const r=new Intl.DateTimeFormat("en-CA",{timeZone:X,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(t).reduce((i,a)=>(i[a.type]=a.value,i),{});return`${r.year}-${r.month}-${r.day}T${r.hour}:${r.minute}`}function ze(n=""){const t=v(n);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t))return"";const r=new Date(`${t}:00+02:00`);return Number.isNaN(r.getTime())?"":r.toISOString()}function Bt(n,t){return!n||!t?"Date range":n.getMonth()===t.getMonth()&&n.getFullYear()===t.getFullYear()?`${n.toLocaleDateString("en-ZA",{day:"2-digit"})} - ${t.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"numeric"})}`:`${re(n)} - ${re(t)}`}function ve(n={}){const t=N(n.status);return t?t.includes("cancel")?"cancelled":t.includes("complete")?"completed":t.includes("block")?"blocked":t.includes("reschedule")?"reschedule_requested":t.includes("pending")||t.includes("proposed")||t.includes("requested")?"awaiting_confirmation":t.includes("confirm")?"confirmed":"awaiting_confirmation":"awaiting_confirmation"}function Ot(n=[],t=""){const r=ve({status:t});return r==="cancelled"?"Cancelled":r==="completed"?"Ready":n.some(i=>i.toLowerCase().includes("document"))?"Waiting on Documents":n.some(i=>i.toLowerCase().includes("confirm"))?"Waiting on Client":n.some(i=>i.toLowerCase().includes("attorney"))?"Waiting on Attorney":n.length?"Blocked":"Ready"}function Pt(n=""){const t=v(n).replaceAll("_"," ");return t?t.charAt(0).toUpperCase()+t.slice(1):"Awaiting Confirmation"}function Ft(n=""){const t=N(n);return["requested","uploaded","rejected","required","under_review"].includes(t)}function Wt(n="",t=""){const r=N(n),i=N(t);return["firm_admin","director_partner","conveyancing_secretary","reception_scheduling"].includes(r)?!0:r==="transfer_attorney"?i.includes("transfer"):r==="bond_attorney"?i.includes("bond"):!0}function Ut(n,t={}){const r=[],i=v(n.transactionId);(i?t[i]||[]:[]).filter(p=>Ft(p.status)).length&&r.push("Required document checks are still pending.");const l=kt(n.appointmentTypeKey||n.appointmentType);return wt(l.type,{requirementStatusByKey:{},uploadedRequirementKeys:[]}).some(p=>p.completed===!1)&&r.push("Template prep requirements still need confirmation."),ve(n)==="awaiting_confirmation"&&r.push("Client confirmation is still outstanding."),!v(n.assignedAttorneyName)&&N(n.matterType).includes("transfer")&&r.push("Transfer attorney allocation missing."),N(n.appointmentTypeKey).includes("transfer")&&(n.flags?.guaranteesOutstanding&&r.push("Guarantees are still outstanding."),n.flags?.awaitingFica&&r.push("FICA documentation is outstanding.")),N(n.appointmentTypeKey).includes("bond")&&(n.flags?.bankConditionsPending&&r.push("Bank conditions are outstanding."),n.flags?.awaitingFica&&r.push("Buyer finance/FICA documents are incomplete.")),!v(n.resourceId)&&N(n.appointmentTypeKey).includes("signing")&&r.push("Boardroom/resource is not allocated yet."),{label:Ot(r,n.status),blockers:r}}function Ht({appointmentRows:n=[],matterRows:t=[],documentRows:r=[],role:i=""}){const a=(t||[]).reduce((l,d)=>(l[d.matterReference]=d,l),{}),s=(r||[]).reduce((l,d)=>{const c=v(d.transactionId);return c&&(l[c]||(l[c]=[]),l[c].push(d)),l},{});return(n||[]).map(l=>{const d=a[l.matterReference]||null,c=ve(l),u=Ut({...l,transactionId:l.transactionId,matterType:d?.matterType||l.matterType||"",flags:d?.flags||l.flags||{},assignedAttorneyName:l.assignedAttorneyName||d?.assignedAttorneyName||""},s),p=u.blockers,f=p.filter(w=>w.toLowerCase().includes("guarantee")||w.toLowerCase().includes("levy")||w.toLowerCase().includes("fica")||w.toLowerCase().includes("document")),k=p.filter(w=>w.toLowerCase().includes("bank")||w.toLowerCase().includes("finance")||w.toLowerCase().includes("document"));return{...l,matterType:d?.matterType||l.matterType||"Transfer",propertyLabel:d?.propertyLabel||l.propertyLabel||"",flags:d?.flags||l.flags||{},operationalStatus:c,operationalStatusLabel:Pt(c),readiness:u,transferWarnings:f,bondWarnings:k,transactionId:l.transactionId||null,requiredDocuments:Array.isArray(l.requiredDocuments)?l.requiredDocuments:[]}}).filter(l=>Wt(i,l.matterType))}function ae(n=[]){return[...n].sort((t,r)=>new Date(t.dateTime||0).getTime()-new Date(r.dateTime||0).getTime())}function We(n=[]){return n.filter(t=>!["cancelled","completed"].includes(t.operationalStatus))}function _e(n=[]){return n.flatMap(t=>Array.isArray(t.rescheduleRequests)?t.rescheduleRequests.map(r=>({requestId:r.id,appointmentId:t.id,appointmentType:t.appointmentType,matterReference:t.matterReference,clientName:t.clientName,requestedByRole:r.requestedByRole,reason:r.reason,preferredStart:r.preferredStart,preferredEnd:r.preferredEnd,status:r.status,appointment:t})):[]).filter(t=>["pending","proposed"].includes(N(t.status)))}function Ue(n=[]){return(n||[]).filter(t=>["attorney_conveyancer","transfer_attorney","bond_attorney","conveyancing_secretary","admin_staff","reception_scheduling","candidate_attorney","firm_admin","director_partner"].includes(N(t.role))).map(t=>({value:t.value,label:t.label,role:t.role}))}function je(n={}){const t=N(`${n.appointmentTypeKey||""} ${n.appointmentType||""} ${n.status||""} ${n.linkedWorkflow||""} ${n.linkedWorkflowStage||""}`);return t.includes("deadline")?"deadline":t.includes("task")?"task":t.includes("court")||t.includes("external")?"external":t.includes("buyer")&&t.includes("seller")?"both":t.includes("buyer")?"buyer":t.includes("seller")?"seller":t.includes("reschedule")?"reschedule":t.includes("bond")?"bond":t.includes("cancel")?"cancellation":t.includes("transfer")?"transfer":"internal"}function Y(n={}){return U[je(n)]||U.internal}function He(n={}){return n.readiness?.label==="Blocked"?he.blocked:he[n.operationalStatus]||he.awaiting_confirmation}function Vt(n={},t="all"){return t==="all"?!0:je(n)===t||N(n.matterType).includes(t)}function Yt(n={},t="all"){return t==="all"?!0:[n.assignedAttorneyId,n.assignedSecretaryId,n.assignedAdminHandlerId].some(r=>String(r||"")===String(t))}function Zt(n={},t="all"){return t==="all"?!0:t==="unassigned"?!v(n.resourceId):String(n.resourceId||"")===String(t)}function Qt(n={},t="all",r=new Date){const i=new Date(n.dateTime||"");if(Number.isNaN(i.getTime()))return t==="all";const a=ie(new Date);if(t==="today")return H(i,a);if(t==="week"){const s=V(r),l=B(s,7);return i>=s&&i<l}return t==="month"?i.getMonth()===r.getMonth()&&i.getFullYear()===r.getFullYear():!0}function $e(n={}){const t=je(n);return t==="bond"||t==="transfer"?60:t==="cancellation"?45:t==="reschedule"?30:45}function Kt(n=[],t={},r=new Date){const i=N(t.query);return n.filter(a=>{const s=N([a.matterReference,a.propertyLabel,a.clientName,a.appointmentType,a.status,a.resourceName,a.assignedAttorneyName,a.assignedSecretaryName,a.assignedAdminHandlerName].join(" "));return!(i&&!s.includes(i)||!Vt(a,t.matterType)||!Yt(a,t.attorney)||t.status==="blocked"&&a.readiness?.label!=="Blocked"&&a.operationalStatus!=="blocked"||t.status!=="all"&&t.status!=="blocked"&&a.operationalStatus!==t.status||!Zt(a,t.boardroom)||!Qt(a,t.dateRange,r))})}function Gt(n=[],t=[]){const r=We(t);if(!n.length){const i=r.filter(a=>v(a.resourceId)).length;return[{id:"unconfigured",name:"Boardrooms",bookings:i,utilisation:r.length?Math.round(i/r.length*100):0}]}return n.map(i=>{const a=r.filter(l=>String(l.resourceId||"")===String(i.resourceId||"")).length,s=Math.min(100,Math.round(a/10*100));return{id:i.resourceId,name:i.resourceName,bookings:a,utilisation:s}})}function Jt(n=[],t=[]){const r=ae(n).slice(0,8).map(a=>({id:`appointment-${a.id}`,tone:Y(a),title:`${a.appointmentType||"Appointment"} ${a.operationalStatus==="confirmed"?"confirmed":"scheduled"}`,description:`${a.matterReference} - ${a.clientName||"Client pending"}`,timestamp:a.dateTime})),i=t.slice(0,4).map(a=>({id:`reschedule-${a.requestId}`,tone:U.reschedule,title:"Client requested reschedule",description:`${a.matterReference} - ${a.reason||"New time requested"}`,timestamp:a.preferredStart}));return ae([...r,...i]).slice(0,9)}function Xt(n="Week",t=new Date){if(N(n)==="day")return[ie(t)];const i=V(t);return Array.from({length:7},(a,s)=>B(i,s))}function Ve(n=new Date){const t=Fe(n),r=V(t);return Array.from({length:42},(i,a)=>B(r,a))}function Ye(n=""){return pt(n)||Ee[0]}function en(n=[]){return(n||[]).map(t=>{const r=v(t.matterId||t.transactionId||t.id||t.transaction_id),i=v(t.matterReference||t.reference||t.transaction_reference);return r?{matterId:r,matterReference:i||`MAT-${r.slice(0,8).toUpperCase()}`,propertyLabel:v(t.propertyLabel||t.property||t.address),clientName:v(t.clientName||t.buyerName||t.sellerName),matterType:v(t.matterType||t.assignmentType),organisationId:v(t.organisationId||t.organisation_id)}:null}).filter(Boolean)}function tn(n=[],t=[]){const r=new Set,i=Ue(n).map((s,l)=>{r.add(String(s.value||""));const d=G[l%G.length],c=t.filter(u=>[u.assignedAttorneyId,u.assignedSecretaryId,u.assignedAdminHandlerId].some(p=>String(p||"")===String(s.value||""))).length;return{...s,roleLabel:qt(s.role),initials:De(s.label),color:d,appointments:c}}),a=[];return t.forEach(s=>{[{id:s.assignedAttorneyId,name:s.assignedAttorneyName,role:"Attorney"},{id:s.assignedSecretaryId,name:s.assignedSecretaryName,role:"Secretary"},{id:s.assignedAdminHandlerId,name:s.assignedAdminHandlerName,role:"Support Staff"}].forEach(l=>{const d=v(l.id);if(!d||r.has(d))return;r.add(d);const c=G[(i.length+a.length)%G.length];a.push({value:d,label:l.name||"Team Member",role:l.role,roleLabel:l.role,initials:De(l.name),color:c,appointments:t.filter(u=>[u.assignedAttorneyId,u.assignedSecretaryId,u.assignedAdminHandlerId].some(p=>String(p||"")===d)).length})})}),[...i,...a].filter(s=>v(s.value))}function nn(n={},t=[]){return t.length?[n.assignedAttorneyId,n.assignedSecretaryId,n.assignedAdminHandlerId].some(r=>t.includes(String(r||""))):!0}function rn(n={},t=[]){return t.find(r=>[n.assignedAttorneyId,n.assignedSecretaryId,n.assignedAdminHandlerId].some(i=>String(i||"")===String(r.value||"")))||null}function fe(n=new Date){const t=new Date(n);return Number.isNaN(t.getTime())?{...Ce}:(t.getHours()||t.setHours(9,0,0,0),{...Ce,title:"",date:Lt(t),startTime:`${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`,endTime:`${String(Math.min(t.getHours()+1,23)).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`,sendNotifications:!0})}function an({onCreateInvite:n,rolloutStatus:t}){const r=t?.enabled===!0;return e.jsxs("section",{className:"scheduling-page-header",children:[e.jsxs("div",{children:[e.jsx("h1",{children:"Calendar"}),e.jsx("p",{children:"Manage appointments, deadlines and important dates."})]}),e.jsx("div",{className:"scheduling-header-actions",children:e.jsxs("button",{type:"button",className:"scheduling-primary-action",onClick:n,disabled:!r,title:r?"Create attorney invite":"Create Invite is outside the active rollout cohort",children:[e.jsx(St,{size:16}),"Create Invite"]})})]})}function sn({filters:n,setFilters:t,resources:r,memberOptions:i}){return e.jsxs("section",{className:"scheduling-toolbar",children:[e.jsxs("label",{className:"scheduling-search",children:[e.jsx(Ct,{size:16}),e.jsx("input",{value:n.query,onChange:a=>t(s=>({...s,query:a.target.value})),placeholder:"Search matters, clients or appointments..."})]}),e.jsxs("select",{value:n.attorney,onChange:a=>t(s=>({...s,attorney:a.target.value})),children:[e.jsx("option",{value:"all",children:"All Attorneys"}),i.map(a=>e.jsx("option",{value:a.value,children:a.label},a.value))]}),e.jsxs("select",{value:n.matterType,onChange:a=>t(s=>({...s,matterType:a.target.value})),children:[e.jsx("option",{value:"all",children:"All Matter Types"}),e.jsx("option",{value:"transfer",children:"Transfer"}),e.jsx("option",{value:"bond",children:"Bond"}),e.jsx("option",{value:"cancellation",children:"Cancellation"})]}),e.jsxs("select",{value:n.status,onChange:a=>t(s=>({...s,status:a.target.value})),children:[e.jsx("option",{value:"all",children:"All Statuses"}),e.jsx("option",{value:"confirmed",children:"Confirmed"}),e.jsx("option",{value:"awaiting_confirmation",children:"Pending"}),e.jsx("option",{value:"reschedule_requested",children:"Reschedule requested"}),e.jsx("option",{value:"blocked",children:"Blocked"})]}),e.jsxs("select",{value:n.boardroom,onChange:a=>t(s=>({...s,boardroom:a.target.value})),children:[e.jsx("option",{value:"all",children:"All Boardrooms"}),e.jsx("option",{value:"unassigned",children:"Unassigned"}),r.map(a=>e.jsx("option",{value:a.resourceId,children:a.resourceName},a.resourceId))]}),e.jsxs("select",{value:n.dateRange,onChange:a=>t(s=>({...s,dateRange:a.target.value})),children:[e.jsx("option",{value:"all",children:"All Dates"}),e.jsx("option",{value:"today",children:"Today"}),e.jsx("option",{value:"week",children:"This Week"}),e.jsx("option",{value:"month",children:"This Month"})]}),e.jsx("button",{type:"button",className:"scheduling-filter-icon","aria-label":"Advanced calendar filters",children:e.jsx(It,{size:16})})]})}function ln({selectedDate:n,setSelectedDate:t}){const r=Fe(n),i=Ve(n).slice(0,35);function a(s){t(l=>{const d=new Date(l);return d.setMonth(d.getMonth()+s),d})}return e.jsxs("aside",{className:"mini-month-picker","aria-label":"Monthly date picker",children:[e.jsxs("div",{className:"mini-month-header",children:[e.jsx("strong",{children:n.toLocaleDateString("en-ZA",{month:"long",year:"numeric"})}),e.jsxs("span",{children:[e.jsx("button",{type:"button",onClick:()=>a(-1),"aria-label":"Previous month",children:e.jsx(Be,{size:14})}),e.jsx("button",{type:"button",onClick:()=>a(1),"aria-label":"Next month",children:e.jsx(Oe,{size:14})})]})]}),e.jsxs("div",{className:"mini-month-grid",children:[["M","T","W","T","F","S","S"].map((s,l)=>e.jsx("span",{children:s},`${s}-${l}`)),i.map(s=>e.jsx("button",{type:"button",className:`${s.getMonth()!==r.getMonth()?"is-muted":""} ${H(s,n)?"is-selected":""}`,onClick:()=>t(s),children:s.getDate()},s.toISOString()))]})]})}function on({metrics:n,selectedDate:t,setSelectedDate:r}){const i=[{key:"today",title:"Today",label:"Appointments",icon:ee,value:n.todaysAppointments,tone:"blue"},{key:"week",title:"This Week",label:"Appointments",icon:ee,value:n.thisWeekAppointments,tone:"green"},{key:"pending",title:"Pending",label:"Confirmations",icon:Le,value:n.pendingConfirmations,tone:"amber"},{key:"overdue",title:"Overdue",label:"Items",icon:Tt,value:n.overdueItems,tone:"red"}];return e.jsxs("section",{className:"scheduling-summary-row",children:[e.jsx("div",{className:"scheduling-metrics",children:i.map(a=>{const s=a.icon;return e.jsxs("article",{className:`scheduling-metric-card tone-${a.tone}`,children:[e.jsx("div",{className:"scheduling-metric-icon",children:e.jsx(s,{size:18})}),e.jsxs("div",{children:[e.jsx("p",{children:a.title}),e.jsx("strong",{children:a.value}),e.jsx("span",{children:a.label})]})]},a.key)})}),e.jsx(ln,{selectedDate:t,setSelectedDate:r})]})}function dn({row:n}){const t=He(n);return e.jsx("span",{className:"scheduling-status-badge",style:{color:t.color,background:t.bg,borderColor:t.border},children:t.label})}function cn({staffRows:n,selectedStaffIds:t,setSelectedStaffIds:r}){const i=t.length===0;function a(s){const l=String(s||"");r(d=>d.includes(l)?d.filter(c=>c!==l):[...d,l])}return e.jsxs("section",{className:"scheduling-panel staff-visibility-panel",children:[e.jsxs("div",{className:"scheduling-panel-header",children:[e.jsx("h2",{children:"Attorneys"}),e.jsx("button",{type:"button",onClick:()=>r([]),children:"View everyone"})]}),n.length?e.jsxs("div",{className:"staff-list",children:[e.jsxs("button",{type:"button",className:`staff-row ${i?"is-active":""}`,onClick:()=>r([]),children:[e.jsx("span",{className:"staff-avatar is-all",children:e.jsx(be,{size:15})}),e.jsxs("span",{children:[e.jsx("strong",{children:"Everyone"}),e.jsx("small",{children:"Firm calendar"})]}),e.jsx("i",{style:{background:"#0f3558"}})]}),n.map(s=>{const l=i||t.includes(String(s.value));return e.jsxs("button",{type:"button",className:`staff-row ${l?"is-active":"is-muted"}`,onClick:()=>a(s.value),children:[e.jsx("span",{className:"staff-avatar",style:{borderColor:s.color},children:s.initials}),e.jsxs("span",{children:[e.jsx("strong",{children:s.label}),e.jsx("small",{children:s.roleLabel})]}),e.jsx("i",{style:{background:s.color}})]},s.value)})]}):e.jsxs("div",{className:"scheduling-empty-state",children:[e.jsx(be,{size:18}),e.jsx("strong",{children:"No staff calendars yet"}),e.jsx("span",{children:"Assigned appointment owners will appear here."})]})]})}function un({viewMode:n,setViewMode:t,selectedDate:r,setSelectedDate:i}){const a=V(r),s=B(a,6),l=N(n)==="month"?r.toLocaleDateString("en-ZA",{month:"long",year:"numeric"}):N(n)==="day"?re(r):Bt(a,s);function d(c){const u=N(n),p=u==="month"?31:u==="day"?1:7;i(f=>B(f,c*p))}return e.jsxs("div",{className:"calendar-controls",children:[e.jsxs("div",{className:"calendar-date-controls",children:[e.jsx("button",{type:"button","aria-label":"Previous",onClick:()=>d(-1),children:e.jsx(Be,{size:16})}),e.jsx("button",{type:"button",onClick:()=>i(new Date),children:"Today"}),e.jsx("button",{type:"button","aria-label":"Next",onClick:()=>d(1),children:e.jsx(Oe,{size:16})}),e.jsx("strong",{children:l})]}),e.jsx("div",{className:"calendar-view-toggle",children:_t.map(c=>e.jsx("button",{type:"button",className:c===n?"is-active":"",onClick:()=>t(c),children:c},c))})]})}function mn({rows:n,viewMode:t,selectedDate:r,onSelect:i,staffRows:a}){const s=Xt(t,r),l=Array.from({length:Pe-W},(u,p)=>W+p),d=new Date,c=(d.getHours()*60+d.getMinutes()-W*60)/ge*100;return e.jsxs("div",{className:`week-calendar ${s.length===1?"is-day-view":""}`,children:[e.jsxs("div",{className:"week-calendar-header",style:{gridTemplateColumns:`64px repeat(${s.length}, minmax(136px, 1fr))`},children:[e.jsx("span",{}),s.map(u=>e.jsxs("div",{className:ne(u)?"is-today":"",children:[e.jsx("span",{children:u.toLocaleDateString("en-ZA",{weekday:"short"})}),e.jsx("strong",{children:u.toLocaleDateString("en-ZA",{day:"2-digit",month:"short"})})]},u.toISOString()))]}),e.jsxs("div",{className:"week-calendar-body",style:{gridTemplateColumns:`64px repeat(${s.length}, minmax(136px, 1fr))`},children:[e.jsx("div",{className:"calendar-time-rail",children:l.map(u=>e.jsxs("span",{children:[String(u).padStart(2,"0"),":00"]},u))}),s.map(u=>{const p=n.filter(f=>H(f.dateTime,u));return e.jsxs("div",{className:"calendar-day-column",children:[ne(u)&&c>=0&&c<=100?e.jsx("div",{className:"calendar-now-line",style:{top:`${c}%`},children:e.jsx("span",{children:J(d)})}):null,p.map(f=>{const k=new Date(f.dateTime||"");if(Number.isNaN(k.getTime()))return null;const w=k.getHours()*60+k.getMinutes()-W*60,S=Math.max(0,Math.min(93,w/ge*100)),y=Math.max(7,Math.min(22,$e(f)/ge*100)),o=Y(f),j=rn(f,a);return e.jsxs("button",{type:"button",className:"calendar-event",style:{top:`${S}%`,minHeight:`${y}%`,background:o.bg,borderColor:o.border,borderLeftColor:j?.color||o.accent,color:o.text},onClick:()=>i(f),children:[e.jsx("span",{children:f.matterReference}),e.jsx("strong",{children:f.appointmentType||o.label}),e.jsxs("small",{children:[J(f.dateTime)," - ",J(new Date(k.getTime()+$e(f)*60*1e3))]}),e.jsx("small",{children:j?.label||f.assignedAttorneyName||f.assignedSecretaryName||o.label})]},f.id)})]},u.toISOString())})]})]})}function pn({rows:n,selectedDate:t,onSelect:r}){const i=Ve(t);return e.jsxs("div",{className:"month-calendar",children:[["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(a=>e.jsx("strong",{className:"month-calendar-day-label",children:a},a)),i.map(a=>{const s=n.filter(d=>H(d.dateTime,a)),l=a.getMonth()!==t.getMonth();return e.jsxs("article",{className:`month-calendar-cell ${l?"is-outside":""} ${ne(a)?"is-today":""}`,children:[e.jsx("span",{children:a.getDate()}),s.slice(0,3).map(d=>{const c=Y(d);return e.jsx("button",{type:"button",style:{color:c.text,background:c.bg},onClick:()=>r(d),children:d.matterReference},d.id)}),s.length>3?e.jsxs("small",{children:["+",s.length-3," more"]}):null]},a.toISOString())})]})}function gn({rows:n,onSelect:t}){return e.jsx("div",{className:"agenda-calendar",children:n.length?ae(n).map(r=>{const i=Y(r);return e.jsxs("button",{type:"button",className:"agenda-row",onClick:()=>t(r),children:[e.jsx("span",{className:"scheduling-row-dot",style:{background:i.accent}}),e.jsxs("div",{children:[e.jsx("strong",{children:r.appointmentType||i.label}),e.jsxs("span",{children:[r.matterReference," - ",r.clientName||"Client pending"]})]}),e.jsx("time",{children:ye(r.dateTime)}),e.jsx(dn,{row:r})]},r.id)}):e.jsxs("div",{className:"scheduling-empty-state",children:[e.jsx(Rt,{size:18}),e.jsx("strong",{children:"No agenda items"}),e.jsx("span",{children:"Try widening the date range or clearing filters."})]})})}function hn({rows:n,viewMode:t,setViewMode:r,selectedDate:i,setSelectedDate:a,onSelect:s,staffRows:l}){return e.jsxs("section",{className:"scheduling-panel calendar-surface",children:[e.jsx(un,{viewMode:t,setViewMode:r,selectedDate:i,setSelectedDate:a}),e.jsx("div",{className:"calendar-shell",children:N(t)==="month"?e.jsx(pn,{rows:n,selectedDate:i,onSelect:s}):N(t)==="agenda"?e.jsx(gn,{rows:n,onSelect:s}):e.jsx(mn,{rows:n,viewMode:t,selectedDate:i,onSelect:s,staffRows:l})}),e.jsx("div",{className:"calendar-legend",children:Object.entries(U).map(([d,c])=>e.jsxs("span",{children:[e.jsx("i",{style:{background:c.accent}}),c.label]},d))})]})}function fn({rows:n,onPropose:t,onResolve:r,onSelect:i,busyId:a=""}){return e.jsxs("section",{className:"scheduling-panel",children:[e.jsxs("div",{className:"scheduling-panel-header",children:[e.jsx("h2",{children:"Reschedule Requests"}),e.jsx("button",{type:"button",children:"View all"})]}),n.length?e.jsx("div",{className:"scheduling-row-list",children:n.slice(0,5).map(s=>e.jsxs("article",{className:"reschedule-row",children:[e.jsx("span",{className:"scheduling-row-dot",style:{background:U.reschedule.accent}}),e.jsxs("button",{type:"button",className:"scheduling-row-main",onClick:()=>i(s.appointment),children:[e.jsx("strong",{children:s.matterReference}),e.jsxs("span",{children:[s.clientName||"Client pending"," - Preferred ",ye(s.preferredStart)]}),s.reason?e.jsx("small",{children:s.reason}):null]}),e.jsxs("div",{className:"reschedule-actions",children:[e.jsx("button",{type:"button",disabled:!!a,onClick:()=>r(s,"accepted"),children:a===`resolve-${s.requestId}-accepted`?"Approving...":"Approve"}),e.jsx("button",{type:"button",disabled:!!a,onClick:()=>r(s,"rejected"),children:a===`resolve-${s.requestId}-rejected`?"Declining...":"Decline"}),e.jsx("button",{type:"button",disabled:!!a,onClick:()=>t(s),children:"Counter time"})]})]},s.requestId))}):e.jsxs("div",{className:"scheduling-empty-state is-compact",children:[e.jsx(qe,{size:17}),e.jsx("strong",{children:"No pending requests"}),e.jsx("span",{children:"Reschedule exceptions are clear."})]})]})}function bn({request:n,draft:t,setDraft:r,busyId:i,onClose:a,onSubmit:s}){if(!n)return null;function l(d,c){r(u=>({...u,[d]:c}))}return e.jsx("aside",{className:"invite-drawer","aria-label":"Propose appointment reschedule",children:e.jsxs("form",{className:"invite-drawer-card",onSubmit:s,children:[e.jsxs("div",{className:"appointment-drawer-header",children:[e.jsx("span",{children:"Counter proposal"}),e.jsx("button",{type:"button",onClick:a,"aria-label":"Close reschedule proposal",children:e.jsx(te,{size:17})})]}),e.jsxs("div",{children:[e.jsx("h2",{children:"Propose another time"}),e.jsxs("p",{children:[n.matterReference," · ",n.clientName||"Client"," · Times use ",X,"."]})]}),e.jsxs("div",{className:"invite-form-grid",children:[e.jsxs("label",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Proposed start"}),e.jsx("input",{type:"datetime-local",value:t.preferredStart,onChange:d=>l("preferredStart",d.target.value),required:!0})]}),e.jsxs("label",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Proposed end"}),e.jsx("input",{type:"datetime-local",value:t.preferredEnd,onChange:d=>l("preferredEnd",d.target.value),required:!0})]}),e.jsxs("label",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Coordination note"}),e.jsx("textarea",{value:t.reason,onChange:d=>l("reason",d.target.value),maxLength:1e3,rows:4,placeholder:"Explain the proposed alternative."})]})]}),e.jsxs("div",{className:"invite-actions",children:[e.jsx("button",{type:"button",onClick:a,children:"Cancel"}),e.jsxs("button",{type:"submit",disabled:!!i,children:[e.jsx(At,{size:15}),"Send counter proposal"]})]})]})})}function xn({rows:n,resources:t}){const r=h.useMemo(()=>Gt(t,n),[t,n]);return e.jsxs("section",{className:"scheduling-panel",children:[e.jsxs("div",{className:"scheduling-panel-header",children:[e.jsx("h2",{children:"Boardroom Utilisation"}),e.jsx("button",{type:"button",children:"This week"})]}),e.jsx("div",{className:"boardroom-list",children:r.map(i=>e.jsxs("article",{children:[e.jsxs("div",{children:[e.jsx("strong",{children:i.name||"Boardroom"}),e.jsxs("span",{children:[i.bookings," ",i.bookings===1?"booking":"bookings"]})]}),e.jsx("div",{className:"boardroom-progress",children:e.jsx("span",{style:{width:`${i.utilisation}%`}})}),e.jsxs("strong",{children:[i.utilisation,"%"]})]},i.id))})]})}function yn({rows:n}){return e.jsxs("section",{className:"scheduling-panel",children:[e.jsxs("div",{className:"scheduling-panel-header",children:[e.jsx("h2",{children:"Operational Scheduling Feed"}),e.jsx("button",{type:"button",children:"Live"})]}),n.length?e.jsx("div",{className:"feed-list",children:n.map(t=>e.jsxs("article",{children:[e.jsx("span",{className:"scheduling-row-dot",style:{background:t.tone.accent}}),e.jsxs("div",{children:[e.jsx("strong",{children:t.title}),e.jsx("span",{children:t.description})]}),e.jsx("time",{children:ye(t.timestamp)})]},t.id))}):e.jsxs("div",{className:"scheduling-empty-state is-compact",children:[e.jsx(Le,{size:17}),e.jsx("strong",{children:"No scheduling activity yet"}),e.jsx("span",{children:"Appointment updates will appear here."})]})]})}function vn({open:n,draft:t,setDraft:r,matterOptions:i,resources:a,busyId:s,onClose:l,onSubmit:d}){if(!n)return null;const c=Ye(t.appointmentType),u=i.find(o=>o.matterId===t.matterId),p=t.locationMode===pe.boardroom,f=t.locationMode===pe.videoCall,k=t.locationMode===pe.phoneCall,w=t.appointmentType!=="internal_meeting",S=i.filter(o=>{const j=N(t.matterSearch||"");return j?N(`${o.matterReference} ${o.propertyLabel} ${o.clientName}`).includes(j):!0}).slice(0,8);function y(o,j){r(M=>({...M,[o]:j}))}return e.jsx("aside",{className:"invite-drawer event-modal-backdrop","aria-label":"Create attorney invite",children:e.jsxs("form",{className:"invite-drawer-card event-modal-card",onSubmit:d,children:[e.jsxs("div",{className:"event-modal-header",children:[e.jsxs("div",{className:"event-modal-title",children:[e.jsx("span",{children:e.jsx(ee,{size:18})}),e.jsxs("div",{children:[e.jsx("h2",{children:"Create attorney invite"}),e.jsx("p",{children:"Schedule a supported attorney appointment and send the invite."})]})]}),e.jsx("button",{type:"button",onClick:l,"aria-label":"Close create invite",children:e.jsx(te,{size:17})})]}),e.jsxs("div",{className:"event-modal-body",children:[e.jsxs("div",{className:"event-modal-column",children:[e.jsxs("label",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Invite title *"}),e.jsx("input",{"aria-label":"Invite title",value:t.title||"",onChange:o=>y("title",o.target.value),placeholder:"e.g. OTP Signing with Buyer",required:!0})]}),e.jsxs("div",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Invite type *"}),e.jsx("div",{className:"event-type-card-list",role:"radiogroup","aria-label":"Invite type",children:Ee.map(o=>{const j=$t[o.value]||ee;return e.jsxs("button",{type:"button",className:`event-type-card ${t.appointmentType===o.value?"is-active":""}`,"aria-pressed":t.appointmentType===o.value,onClick:()=>{r(M=>({...M,appointmentType:o.value}))},children:[e.jsx(j,{size:17}),e.jsx("strong",{children:o.label}),e.jsxs("small",{children:[o.durationMinutes," min"]})]},o.value)})})]}),e.jsxs("div",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Date & Time *"}),e.jsxs("div",{className:"event-date-grid",children:[e.jsxs("label",{children:[e.jsx("span",{children:"Date"}),e.jsx("input",{"aria-label":"Date",type:"date",value:t.date,onChange:o=>y("date",o.target.value),required:!0})]}),e.jsxs("label",{children:[e.jsx("span",{children:"Start time"}),e.jsx("input",{"aria-label":"Start time",type:"time",value:t.startTime,onChange:o=>y("startTime",o.target.value),required:!0})]}),e.jsxs("label",{children:[e.jsx("span",{children:"End time"}),e.jsx("input",{"aria-label":"End time",type:"time",value:t.endTime||"",onChange:o=>y("endTime",o.target.value)})]})]}),e.jsx("select",{value:t.timezone||X,onChange:o=>y("timezone",o.target.value),children:e.jsx("option",{value:X,children:"(GMT+02:00) South Africa Standard Time"})})]}),e.jsxs("div",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Location type"}),e.jsx("select",{"aria-label":"Location type",value:t.locationMode,onChange:o=>y("locationMode",o.target.value),required:!0,children:ct.map(o=>e.jsx("option",{value:o.value,children:o.label},o.value))}),p?null:e.jsxs("label",{className:"drawer-nested-field",children:[e.jsx("span",{children:f?"Meeting link":k?"Phone details":"Location"}),e.jsx("input",{"aria-label":f?"Meeting link":k?"Phone details":"Location",value:t.location,onChange:o=>y("location",o.target.value),placeholder:f?"Microsoft Teams, Zoom or meeting link":"Office, external address or phone details",required:!0})]})]}),e.jsxs("label",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Description / Notes"}),e.jsx("textarea",{value:t.notes,onChange:o=>y("notes",o.target.value),placeholder:"Add any additional details, agenda or notes...",rows:5,maxLength:500}),e.jsxs("small",{children:[v(t.notes).length,"/500"]})]}),e.jsxs("div",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Invitees"}),e.jsx("input",{"aria-label":"Invitee email",value:t.recipientEmail,onChange:o=>y("recipientEmail",o.target.value),placeholder:"Invitee email address",type:"email",required:!0}),e.jsx("input",{"aria-label":"Invitee name",value:t.recipientName,onChange:o=>y("recipientName",o.target.value),placeholder:"Invitee name"})]})]}),e.jsxs("div",{className:"event-modal-column event-modal-side",children:[e.jsxs("div",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Matter"}),e.jsx("input",{value:t.matterSearch||"",onChange:o=>y("matterSearch",o.target.value),placeholder:"Search matter number or address..."}),e.jsxs("select",{"aria-label":"Matter",value:t.matterId,onChange:o=>y("matterId",o.target.value),required:w,children:[e.jsx("option",{value:"",children:"Choose a matter"}),S.map(o=>e.jsxs("option",{value:o.matterId,children:[o.matterReference," ",o.propertyLabel?`- ${o.propertyLabel}`:o.clientName?`- ${o.clientName}`:""]},o.matterId))]}),u?e.jsxs("div",{className:"linked-matter-card",children:[e.jsxs("div",{children:[e.jsx("strong",{children:u.matterReference}),e.jsx("span",{children:u.propertyLabel||u.clientName||"Property pending"})]}),e.jsx("small",{children:u.matterType||c.label}),e.jsx("button",{type:"button",onClick:()=>y("matterId",""),"aria-label":"Remove linked matter",children:e.jsx(te,{size:14})})]}):null]}),p?e.jsxs("label",{className:"drawer-field invite-field-wide",children:[e.jsx("span",{children:"Boardroom"}),e.jsxs("select",{"aria-label":"Boardroom",value:t.resourceId,onChange:o=>y("resourceId",o.target.value),required:!0,children:[e.jsx("option",{value:"",children:"Choose boardroom"}),a.map(o=>e.jsx("option",{value:o.resourceId,children:o.resourceName},o.resourceId))]})]}):null,e.jsxs("div",{className:"invite-selected-summary",children:[e.jsx("span",{children:"Visibility"}),e.jsx("strong",{children:c.visibility==="internal_only"?"Internal only":c.visibility==="client_visible"?"Client visible":"Shared role players"})]})]})]}),e.jsxs("div",{className:"invite-actions",children:[e.jsxs("label",{className:"event-check-row event-notify-row",children:[e.jsx("input",{type:"checkbox",checked:t.sendNotifications!==!1,onChange:o=>y("sendNotifications",o.target.checked)}),e.jsx("span",{children:"Send notifications"})]}),e.jsx("button",{type:"button",onClick:l,children:"Cancel"}),e.jsxs("button",{type:"submit",disabled:!!s,children:[e.jsx(xe,{size:15}),"Create Invite"]})]})]})})}function jn({appointment:n,resources:t,staffOptions:r,busyId:i,onClose:a,onResourceAssign:s,onStaffAssign:l,onComplete:d,onResendCommunication:c}){if(!n)return null;const u=Y(n);return e.jsx("aside",{className:"appointment-drawer","aria-label":"Appointment detail",children:e.jsxs("div",{className:"appointment-drawer-card",children:[e.jsxs("div",{className:"appointment-drawer-header",children:[e.jsx("span",{style:{color:u.text,background:u.bg,borderColor:u.border},children:u.label}),e.jsx("button",{type:"button",onClick:a,"aria-label":"Close appointment detail",children:e.jsx(te,{size:17})})]}),e.jsx("h2",{children:n.matterReference}),e.jsx("p",{children:n.clientName||"Client pending"}),e.jsxs("div",{className:"drawer-facts",children:[e.jsxs("div",{children:[e.jsx("span",{children:"Date"}),e.jsx("strong",{children:re(n.dateTime)})]}),e.jsxs("div",{children:[e.jsx("span",{children:"Time"}),e.jsx("strong",{children:J(n.dateTime)})]}),e.jsxs("div",{children:[e.jsx("span",{children:"Status"}),e.jsx("strong",{children:He(n).label})]}),e.jsxs("div",{children:[e.jsx("span",{children:"Boardroom"}),e.jsx("strong",{children:n.resourceName||"Unassigned"})]}),e.jsxs("div",{children:[e.jsx("span",{children:"Attorney"}),e.jsx("strong",{children:n.assignedAttorneyName||n.assignedSecretaryName||"Unassigned"})]}),e.jsxs("div",{children:[e.jsx("span",{children:"Calendar Sync"}),e.jsx("strong",{children:n.externalCalendarStatus||"Not synced"})]})]}),n.readiness?.blockers?.length?e.jsxs("div",{className:"drawer-blockers",children:[e.jsx("strong",{children:"Readiness blockers"}),n.readiness.blockers.slice(0,4).map(p=>e.jsx("span",{children:p},p))]}):null,e.jsxs("div",{className:"drawer-field",children:[e.jsx("label",{children:"Boardroom"}),e.jsxs("select",{value:n.resourceId||"",onChange:p=>s(n,p.target.value),children:[e.jsx("option",{value:"",children:"Unassigned"}),t.map(p=>e.jsx("option",{value:p.resourceId,children:p.resourceName},p.resourceId))]})]}),e.jsxs("div",{className:"drawer-field",children:[e.jsx("label",{children:"Scheduling owner"}),e.jsxs("select",{value:"",onChange:p=>l(n,{role:"coordinator",userId:p.target.value}),children:[e.jsx("option",{value:"",children:"Assign staff member"}),r.map(p=>e.jsx("option",{value:p.value,children:p.label},p.value))]})]}),e.jsxs("div",{className:"drawer-actions",children:[e.jsx("button",{type:"button",onClick:()=>d(n),disabled:!!i,children:"Mark Completed"}),e.jsx("button",{type:"button",onClick:()=>c(n,"confirmation"),disabled:!!i,children:"Send Reminder"}),n.actionHref?e.jsx(lt,{to:n.actionHref,children:"Open Matter"}):null]})]})})}function Nn(){return e.jsx("style",{children:`
      .attorney-scheduling-os {
        display: grid;
        gap: 1rem;
        color: #10233f;
      }

      .scheduling-page-header,
      .scheduling-toolbar,
      .scheduling-panel,
      .scheduling-metric-card {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #dce6f2;
        box-shadow: 0 8px 24px rgba(15, 35, 65, 0.05);
      }

      .scheduling-page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        border-radius: 14px;
        padding: 0.82rem 0.95rem;
      }

      .scheduling-page-header > div:first-child > span {
        display: block;
        color: #2563eb;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .scheduling-page-header h1 {
        margin: 0;
        font-size: 1.2rem;
        line-height: 1.05;
        letter-spacing: 0;
        color: #08172d;
      }

      .scheduling-page-header p {
        margin: 0.25rem 0 0;
        color: #5a6f89;
        font-size: 0.78rem;
      }

      .scheduling-header-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.55rem;
        flex-wrap: wrap;
      }

      .scheduling-primary-action,
      .scheduling-toolbar select,
      .calendar-date-controls button,
      .calendar-view-toggle button,
      .scheduling-row-actions button,
      .reschedule-actions button,
      .scheduling-panel-header button,
      .drawer-actions button,
      .drawer-actions a,
      .invite-actions button {
        min-height: 2.35rem;
        border-radius: 10px;
        border: 1px solid #d9e4f0;
        background: #fff;
        color: #18314d;
        font-weight: 700;
        font-size: 0.78rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        padding: 0 0.75rem;
        text-decoration: none;
        cursor: pointer;
      }

      .scheduling-primary-action {
        color: #fff;
        background: #0f3558;
        border-color: #0f3558;
        box-shadow: 0 8px 18px rgba(15, 53, 88, 0.16);
      }

      .scheduling-toolbar {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) repeat(5, minmax(132px, 0.35fr)) 2.35rem;
        gap: 0.55rem;
        align-items: center;
        padding: 0.72rem;
        border-radius: 16px;
      }

      .scheduling-search {
        min-height: 2.35rem;
        border-radius: 10px;
        border: 1px solid #d9e4f0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0 0.72rem;
        color: #6b7f98;
        background: #fff;
      }

      .scheduling-search input,
      .scheduling-toolbar select,
      .drawer-field select,
      .drawer-field input,
      .drawer-field textarea {
        width: 100%;
        border: 0;
        outline: 0;
        background: transparent;
        color: #18314d;
      }

      .scheduling-toolbar select,
      .drawer-field select,
      .drawer-field input,
      .drawer-field textarea {
        border: 1px solid #d9e4f0;
        background: #fff;
      }

      .scheduling-metrics {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 0.75rem;
      }

      .scheduling-metric-card {
        min-height: 4.85rem;
        border-radius: 12px;
        padding: 0.68rem;
        display: flex;
        gap: 0.58rem;
        align-items: flex-start;
      }

      .scheduling-metric-card.is-risk .scheduling-metric-icon {
        color: #b42318;
        background: #fef3f2;
      }

      .scheduling-metric-icon {
        width: 1.8rem;
        height: 1.8rem;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: #eff6ff;
        color: #2563eb;
        flex: 0 0 auto;
      }

      .scheduling-metric-card p,
      .scheduling-metric-card span {
        margin: 0;
        color: #5a6f89;
        font-size: 0.74rem;
      }

      .scheduling-metric-card strong {
        display: block;
        margin: 0.2rem 0 0.12rem;
        color: #07172d;
        font-size: 1.3rem;
        line-height: 1;
      }

      .scheduling-main-grid {
        display: grid;
        grid-template-columns: minmax(280px, 0.34fr) minmax(0, 1fr);
        gap: 1rem;
        align-items: start;
      }

      .scheduling-secondary-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(260px, 0.78fr) minmax(300px, 1fr);
        gap: 1rem;
      }

      .scheduling-panel {
        border-radius: 12px;
        overflow: hidden;
      }

      .scheduling-panel-header {
        min-height: 2.8rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.8rem;
        border-bottom: 1px solid #e4ecf5;
      }

      .scheduling-panel-header h2 {
        margin: 0;
        font-size: 1rem;
        color: #0c1b34;
      }

      .scheduling-panel-header button {
        min-height: 1.95rem;
        color: #1459b8;
        padding: 0 0.6rem;
      }

      .scheduling-row-list,
      .feed-list,
      .boardroom-list,
      .agenda-calendar {
        display: grid;
      }

      .scheduling-queue-row,
      .reschedule-row,
      .feed-list article,
      .boardroom-list article,
      .agenda-row {
        display: grid;
        align-items: center;
        gap: 0.58rem;
        border-bottom: 1px solid #edf2f7;
        padding: 0.58rem 0.75rem;
      }

      .scheduling-queue-row {
        grid-template-columns: auto minmax(0, 1fr) auto auto;
      }

      .scheduling-queue-row:hover,
      .reschedule-row:hover,
      .agenda-row:hover {
        background: #f8fbff;
      }

      .scheduling-row-dot {
        width: 0.45rem;
        height: 0.45rem;
        border-radius: 999px;
        flex: 0 0 auto;
      }

      .scheduling-row-main,
      .agenda-row {
        border: 0;
        background: transparent;
        text-align: left;
        padding: 0;
        cursor: pointer;
        min-width: 0;
      }

      .scheduling-row-main strong,
      .feed-list strong,
      .agenda-row strong,
      .boardroom-list strong {
        display: block;
        color: #10233f;
        font-size: 0.82rem;
      }

      .scheduling-row-main span,
      .scheduling-row-main small,
      .feed-list span,
      .agenda-row span,
      .boardroom-list span {
        display: block;
        margin-top: 0.16rem;
        color: #62768e;
        font-size: 0.74rem;
        line-height: 1.35;
      }

      .scheduling-row-meta {
        display: grid;
        justify-items: end;
        gap: 0.28rem;
        font-size: 0.73rem;
        font-weight: 800;
      }

      .scheduling-status-badge {
        width: max-content;
        border: 1px solid;
        border-radius: 999px;
        padding: 0.2rem 0.48rem;
        font-size: 0.68rem;
        font-weight: 800;
      }

      .scheduling-row-actions {
        display: flex;
        gap: 0.38rem;
      }

      .scheduling-row-actions button {
        min-height: 1.72rem;
        padding: 0 0.55rem;
      }

      .calendar-surface {
        min-width: 0;
      }

      .calendar-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        padding: 0.7rem 0.8rem;
        border-bottom: 1px solid #e4ecf5;
      }

      .calendar-view-toggle,
      .calendar-date-controls {
        display: flex;
        align-items: center;
        gap: 0.38rem;
        flex-wrap: wrap;
      }

      .calendar-view-toggle {
        border: 1px solid #d9e4f0;
        border-radius: 11px;
        padding: 0.18rem;
        background: #f8fbff;
      }

      .calendar-view-toggle button {
        min-height: 1.95rem;
        border: 0;
        background: transparent;
        box-shadow: none;
      }

      .calendar-view-toggle button.is-active {
        background: #0f3558;
        color: #fff;
      }

      .calendar-date-controls strong {
        min-width: 10.5rem;
        text-align: center;
        font-size: 0.86rem;
        color: #10233f;
      }

      .calendar-date-controls button {
        min-height: 2rem;
        padding: 0 0.58rem;
      }

      .calendar-shell {
        overflow-x: auto;
      }

      .week-calendar {
        min-width: 760px;
      }

      .week-calendar.is-day-view {
        min-width: 430px;
      }

      .week-calendar-header,
      .week-calendar-body {
        display: grid;
      }

      .week-calendar-header {
        border-bottom: 1px solid #e4ecf5;
      }

      .week-calendar-header > div {
        padding: 0.74rem 0.62rem;
        border-left: 1px solid #edf2f7;
      }

      .week-calendar-header span {
        display: block;
        color: #60748c;
        font-size: 0.72rem;
      }

      .week-calendar-header strong {
        display: block;
        margin-top: 0.2rem;
        color: #10233f;
        font-size: 0.78rem;
      }

      .week-calendar-header .is-today strong {
        color: #1459b8;
      }

      .week-calendar-body {
        min-height: 540px;
      }

      .calendar-time-rail {
        display: grid;
        grid-template-rows: repeat(10, 1fr);
        border-right: 1px solid #e4ecf5;
        background: #fbfdff;
      }

      .calendar-time-rail span {
        color: #60748c;
        font-size: 0.72rem;
        padding: 0.75rem 0.55rem 0 0;
        text-align: right;
        border-bottom: 1px solid #edf2f7;
      }

      .calendar-day-column {
        position: relative;
        min-height: 540px;
        border-left: 1px solid #edf2f7;
        background-image: linear-gradient(to bottom, transparent calc(10% - 1px), #edf2f7 calc(10% - 1px), #edf2f7 10%, transparent 10%);
        background-size: 100% 10%;
      }

      .calendar-event {
        position: absolute;
        left: 0.34rem;
        right: 0.34rem;
        border: 1px solid;
        border-left-width: 3px;
        border-radius: 7px;
        padding: 0.28rem 0.38rem;
        display: grid;
        gap: 0.08rem;
        text-align: left;
        cursor: pointer;
        overflow: hidden;
        box-shadow: none;
      }

      .calendar-event span {
        font-size: 0.6rem;
        font-weight: 800;
      }

      .calendar-event strong {
        font-size: 0.68rem;
        color: inherit;
      }

      .calendar-event small {
        font-size: 0.6rem;
        color: inherit;
      }

      .calendar-now-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 1px;
        background: #ef4444;
        z-index: 3;
      }

      .calendar-now-line span {
        position: absolute;
        left: -3.2rem;
        top: -0.68rem;
        border-radius: 999px;
        background: #ef4444;
        color: #fff;
        padding: 0.16rem 0.42rem;
        font-size: 0.66rem;
        font-weight: 800;
      }

      .calendar-legend {
        display: flex;
        gap: 0.8rem;
        flex-wrap: wrap;
        padding: 0.75rem 1rem;
        border-top: 1px solid #e4ecf5;
        color: #60748c;
        font-size: 0.72rem;
      }

      .calendar-legend span {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }

      .calendar-legend i {
        width: 0.42rem;
        height: 0.42rem;
        border-radius: 999px;
      }

      .month-calendar {
        min-width: 820px;
        display: grid;
        grid-template-columns: repeat(7, minmax(112px, 1fr));
      }

      .month-calendar-day-label,
      .month-calendar-cell {
        border-bottom: 1px solid #edf2f7;
        border-left: 1px solid #edf2f7;
      }

      .month-calendar-day-label {
        padding: 0.62rem;
        color: #60748c;
        font-size: 0.72rem;
      }

      .month-calendar-cell {
        min-height: 104px;
        padding: 0.5rem;
        display: grid;
        align-content: start;
        gap: 0.28rem;
      }

      .month-calendar-cell > span {
        color: #10233f;
        font-size: 0.76rem;
        font-weight: 800;
      }

      .month-calendar-cell.is-outside {
        background: #fbfdff;
        opacity: 0.64;
      }

      .month-calendar-cell.is-today > span {
        color: #1459b8;
      }

      .month-calendar-cell button {
        border: 0;
        border-radius: 7px;
        padding: 0.22rem 0.35rem;
        text-align: left;
        font-size: 0.68rem;
        font-weight: 800;
        cursor: pointer;
      }

      .agenda-calendar {
        padding: 0.4rem 0;
      }

      .agenda-row {
        width: 100%;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        background: transparent;
        border: 0;
        border-bottom: 1px solid #edf2f7;
      }

      .agenda-row time,
      .feed-list time {
        color: #60748c;
        font-size: 0.72rem;
        white-space: nowrap;
      }

      .reschedule-row {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }

      .reschedule-actions {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .reschedule-actions button {
        min-height: 1.92rem;
        padding: 0 0.55rem;
      }

      .boardroom-list article {
        grid-template-columns: minmax(0, 1fr) minmax(88px, 0.5fr) auto;
      }

      .boardroom-progress {
        height: 0.38rem;
        border-radius: 999px;
        background: #edf2f7;
        overflow: hidden;
      }

      .boardroom-progress span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #10b981;
      }

      .feed-list article {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }

      .scheduling-empty-state {
        min-height: 9rem;
        display: grid;
        place-items: center;
        align-content: center;
        gap: 0.35rem;
        color: #60748c;
        padding: 1rem;
        text-align: center;
      }

      .scheduling-empty-state.is-compact {
        min-height: 8rem;
      }

      .scheduling-empty-state strong {
        color: #10233f;
        font-size: 0.86rem;
      }

      .scheduling-empty-state span {
        font-size: 0.76rem;
      }

      .scheduling-alert {
        border-radius: 14px;
        border: 1px solid #dce6f2;
        background: #fff;
        padding: 0.7rem 0.85rem;
        font-size: 0.83rem;
      }

      .scheduling-alert.is-error {
        border-color: #fecaca;
        background: #fff7f7;
        color: #b42318;
      }

      .scheduling-alert.is-success {
        border-color: #bbf7d0;
        background: #f0fdf4;
        color: #067647;
      }

      .appointment-drawer,
      .invite-drawer {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: flex;
        justify-content: flex-end;
        background: rgba(6, 22, 49, 0.16);
        backdrop-filter: blur(3px);
      }

      .appointment-drawer-card,
      .invite-drawer-card {
        width: min(440px, calc(100vw - 1rem));
        height: calc(100vh - 1rem);
        margin: 0.5rem;
        overflow: auto;
        background: #fff;
        border: 1px solid #dce6f2;
        border-radius: 18px;
        box-shadow: 0 24px 72px rgba(15, 35, 65, 0.2);
        padding: 1rem;
        display: grid;
        align-content: start;
        gap: 0.85rem;
      }

      .invite-drawer-card {
        width: min(520px, calc(100vw - 1rem));
      }

      .appointment-drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.8rem;
      }

      .appointment-drawer-header span {
        border: 1px solid;
        border-radius: 999px;
        padding: 0.26rem 0.58rem;
        font-size: 0.72rem;
        font-weight: 800;
      }

      .appointment-drawer-header button {
        width: 2rem;
        height: 2rem;
        border-radius: 9px;
        border: 1px solid #d9e4f0;
        background: #fff;
        display: grid;
        place-items: center;
      }

      .appointment-drawer h2,
      .appointment-drawer p,
      .invite-drawer h2,
      .invite-drawer p {
        margin: 0;
      }

      .appointment-drawer h2,
      .invite-drawer h2 {
        font-size: 1.25rem;
        color: #08172d;
      }

      .appointment-drawer p,
      .invite-drawer p {
        color: #60748c;
        font-size: 0.86rem;
      }

      .invite-type-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.55rem;
      }

      .invite-type-option {
        border: 1px solid #e4ecf5;
        border-radius: 10px;
        background: #fbfdff;
        padding: 0.65rem;
        text-align: left;
        cursor: pointer;
      }

      .invite-type-option.is-active {
        border-color: #9ec5fe;
        background: #eff6ff;
        box-shadow: inset 0 0 0 1px #bfdbfe;
      }

      .invite-type-option strong,
      .invite-type-option span {
        display: block;
      }

      .invite-type-option strong {
        color: #10233f;
        font-size: 0.82rem;
      }

      .invite-type-option span {
        margin-top: 0.16rem;
        color: #60748c;
        font-size: 0.72rem;
        line-height: 1.35;
      }

      .invite-selected-summary {
        min-height: 2.35rem;
        border: 1px solid #d9e4f0;
        border-radius: 10px;
        background: #f8fbff;
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0 0.7rem;
        color: #60748c;
        font-size: 0.78rem;
      }

      .invite-selected-summary strong {
        margin-left: auto;
        color: #10233f;
      }

      .invite-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.6rem;
      }

      .invite-field-wide {
        grid-column: 1 / -1;
      }

      .drawer-facts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.55rem;
      }

      .drawer-facts div,
      .drawer-blockers,
      .drawer-field {
        border: 1px solid #e4ecf5;
        border-radius: 12px;
        padding: 0.65rem;
        background: #fbfdff;
      }

      .drawer-facts span,
      .drawer-field label,
      .drawer-field > span {
        display: block;
        color: #60748c;
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .drawer-facts strong {
        display: block;
        margin-top: 0.18rem;
        color: #10233f;
        font-size: 0.8rem;
      }

      .drawer-blockers {
        display: grid;
        gap: 0.35rem;
      }

      .drawer-blockers strong {
        color: #b42318;
        font-size: 0.82rem;
      }

      .drawer-blockers span {
        color: #5a6f89;
        font-size: 0.75rem;
      }

      .drawer-field {
        display: grid;
        gap: 0.4rem;
      }

      .drawer-field select,
      .drawer-field input,
      .drawer-field textarea {
        min-height: 2.25rem;
        border-radius: 9px;
        padding: 0 0.6rem;
      }

      .drawer-field textarea {
        min-height: 5rem;
        padding: 0.55rem 0.6rem;
        resize: vertical;
      }

      .drawer-actions,
      .invite-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .drawer-actions button:first-child,
      .invite-actions button:last-child {
        background: #0f3558;
        border-color: #0f3558;
        color: #fff;
      }

      .invite-actions {
        justify-content: flex-end;
      }

      .scheduling-summary-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 228px;
        gap: 1rem;
        align-items: stretch;
      }

      .scheduling-metrics {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .scheduling-metric-card {
        min-height: 7.25rem;
        border-radius: 14px;
        padding: 1rem;
        align-items: center;
      }

      .scheduling-metric-icon {
        width: 2.35rem;
        height: 2.35rem;
        border-radius: 13px;
      }

      .scheduling-metric-card.tone-green .scheduling-metric-icon {
        background: #ecfdf3;
        color: #087443;
      }

      .scheduling-metric-card.tone-amber .scheduling-metric-icon {
        background: #fff7ed;
        color: #c2410c;
      }

      .scheduling-metric-card.tone-red .scheduling-metric-icon {
        background: #fef3f2;
        color: #b42318;
      }

      .scheduling-metric-card p {
        color: #60748c;
        font-weight: 700;
      }

      .scheduling-metric-card strong {
        font-size: 2rem;
      }

      .mini-month-picker {
        border: 1px solid #dce6f2;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 8px 24px rgba(15, 35, 65, 0.05);
        padding: 0.8rem;
      }

      .mini-month-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;
        margin-bottom: 0.55rem;
      }

      .mini-month-header strong {
        color: #10233f;
        font-size: 0.82rem;
      }

      .mini-month-header span {
        display: inline-flex;
        gap: 0.25rem;
      }

      .mini-month-header button,
      .scheduling-filter-icon {
        width: 2rem;
        height: 2rem;
        border-radius: 9px;
        border: 1px solid #d9e4f0;
        background: #fff;
        color: #18314d;
        display: inline-grid;
        place-items: center;
        cursor: pointer;
      }

      .mini-month-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0.16rem;
      }

      .mini-month-grid span,
      .mini-month-grid button {
        min-height: 1.34rem;
        border: 0;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: transparent;
        color: #60748c;
        font-size: 0.68rem;
        font-weight: 700;
      }

      .mini-month-grid button {
        cursor: pointer;
      }

      .mini-month-grid button.is-muted {
        color: #a7b3c2;
      }

      .mini-month-grid button.is-selected {
        background: #0f3558;
        color: #fff;
      }

      .staff-list {
        display: grid;
      }

      .staff-row {
        width: 100%;
        min-height: 4rem;
        border: 0;
        border-bottom: 1px solid #edf2f7;
        background: #fff;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.7rem;
        padding: 0.65rem 0.8rem;
        text-align: left;
        cursor: pointer;
      }

      .staff-row.is-active {
        background: #f7fbfa;
      }

      .staff-row.is-muted {
        opacity: 0.48;
      }

      .staff-avatar {
        width: 2.15rem;
        height: 2.15rem;
        border: 2px solid #d9e4f0;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #fff;
        color: #10233f;
        font-size: 0.72rem;
        font-weight: 800;
      }

      .staff-avatar.is-all {
        border-color: #d9e4f0;
        background: #eff6ff;
        color: #1459b8;
      }

      .staff-row strong,
      .staff-row small {
        display: block;
      }

      .staff-row strong {
        color: #10233f;
        font-size: 0.82rem;
      }

      .staff-row small {
        margin-top: 0.12rem;
        color: #60748c;
        font-size: 0.72rem;
      }

      .staff-row i {
        width: 0.44rem;
        height: 0.44rem;
        border-radius: 999px;
      }

      .calendar-controls {
        flex-wrap: nowrap;
      }

      .calendar-date-controls strong {
        text-align: left;
        min-width: 13rem;
      }

      .event-modal-backdrop {
        justify-content: center;
        align-items: center;
        background: rgba(7, 18, 36, 0.42);
      }

      .event-modal-card {
        width: min(980px, calc(100vw - 2rem));
        max-height: calc(100vh - 2rem);
        height: auto;
        margin: 1rem;
        padding: 0;
        overflow: hidden;
      }

      .event-modal-header {
        min-height: 5.7rem;
        border-bottom: 1px solid #e4ecf5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.35rem;
      }

      .event-modal-title {
        display: flex;
        align-items: center;
        gap: 0.85rem;
      }

      .event-modal-title > span {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: #eff6ff;
        color: #2563eb;
      }

      .event-modal-title h2 {
        margin: 0;
      }

      .event-modal-header > button {
        width: 2.15rem;
        height: 2.15rem;
        border-radius: 10px;
        border: 1px solid #d9e4f0;
        background: #fff;
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      .event-modal-body {
        max-height: calc(100vh - 9.8rem);
        overflow: auto;
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.72fr);
      }

      .event-modal-column {
        display: grid;
        align-content: start;
        gap: 0.85rem;
        padding: 1.25rem;
      }

      .event-modal-side {
        border-left: 1px solid #e4ecf5;
        background: #fbfdff;
      }

      .event-type-card-list {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.55rem;
      }

      .event-type-card {
        min-height: 4.7rem;
        border: 1px solid #d9e4f0;
        border-radius: 10px;
        background: #fff;
        color: #60748c;
        display: grid;
        place-items: center;
        gap: 0.35rem;
        cursor: pointer;
      }

      .event-type-card strong {
        color: #10233f;
        font-size: 0.78rem;
      }

      .event-type-card small {
        color: #60748c;
        font-size: 0.68rem;
        font-weight: 800;
      }

      .event-type-card.is-active {
        border-color: #93c5fd;
        background: #eff6ff;
        color: #2563eb;
        box-shadow: inset 0 0 0 1px #bfdbfe;
      }

      .event-date-grid {
        display: grid;
        grid-template-columns: minmax(145px, 1fr) repeat(2, minmax(96px, 0.55fr));
        gap: 0.55rem;
        align-items: center;
      }

      .event-date-grid label,
      .drawer-nested-field {
        display: grid;
        gap: 0.28rem;
      }

      .event-date-grid label span,
      .drawer-nested-field span {
        color: #60748c;
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .event-check-row {
        min-height: 2.25rem;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        color: #334155;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .event-check-row input {
        width: 1rem;
        height: 1rem;
      }

      .linked-matter-card {
        border: 1px solid #d9e4f0;
        border-radius: 12px;
        background: #fff;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.65rem;
        padding: 0.7rem;
      }

      .linked-matter-card strong,
      .linked-matter-card span,
      .linked-matter-card small {
        display: block;
      }

      .linked-matter-card strong {
        color: #10233f;
        font-size: 0.86rem;
      }

      .linked-matter-card span {
        margin-top: 0.18rem;
        color: #60748c;
        font-size: 0.74rem;
      }

      .linked-matter-card small {
        border-radius: 999px;
        background: #ecfdf3;
        color: #067647;
        padding: 0.22rem 0.48rem;
        font-size: 0.68rem;
        font-weight: 800;
      }

      .linked-matter-card button {
        width: 1.8rem;
        height: 1.8rem;
        border: 0;
        background: transparent;
        color: #60748c;
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      .related-toggle {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.45rem;
      }

      .related-toggle button {
        min-height: 2.35rem;
        border: 1px solid #d9e4f0;
        border-radius: 10px;
        background: #fff;
        color: #334155;
        font-weight: 800;
        cursor: pointer;
      }

      .related-toggle button.is-active {
        border-color: #93c5fd;
        background: #eff6ff;
        color: #2563eb;
      }

      .event-notify-row {
        margin-right: auto;
      }

      @media (max-width: 1280px) {
        .scheduling-summary-row {
          grid-template-columns: 1fr;
        }

        .mini-month-picker {
          display: none;
        }

        .scheduling-toolbar {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .scheduling-search {
          grid-column: span 3;
        }

        .scheduling-secondary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 980px) {
        .scheduling-page-header,
        .scheduling-main-grid {
          grid-template-columns: 1fr;
        }

        .scheduling-page-header {
          display: grid;
        }

        .scheduling-header-actions {
          justify-content: flex-start;
        }

        .scheduling-main-grid,
        .scheduling-secondary-grid {
          display: grid;
          grid-template-columns: 1fr;
        }

        .event-modal-body {
          grid-template-columns: 1fr;
        }

        .event-modal-side {
          border-left: 0;
          border-top: 1px solid #e4ecf5;
        }
      }

      @media (max-width: 720px) {
        .attorney-scheduling-os {
          gap: 0.8rem;
        }

        .scheduling-page-header,
        .scheduling-toolbar,
        .scheduling-panel-header {
          border-radius: 14px;
        }

        .scheduling-toolbar,
        .scheduling-metrics,
        .event-type-card-list,
        .event-date-grid,
        .invite-type-list,
        .invite-form-grid {
          grid-template-columns: 1fr;
        }

        .invite-field-wide {
          grid-column: auto;
        }

        .scheduling-search {
          grid-column: auto;
        }

        .scheduling-queue-row,
        .reschedule-row,
        .agenda-row,
        .feed-list article,
        .boardroom-list article {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .scheduling-row-meta,
        .scheduling-row-actions,
        .reschedule-actions,
        .agenda-row time,
        .agenda-row .scheduling-status-badge,
        .feed-list time {
          grid-column: 2;
          justify-self: start;
        }

        .calendar-date-controls strong {
          min-width: 100%;
          text-align: left;
          order: 10;
        }

        .event-modal-card {
          width: calc(100vw - 1rem);
          max-height: calc(100vh - 1rem);
        }

        .event-modal-header,
        .event-modal-column {
          padding: 1rem;
        }
      }
    `})}function kn({appointmentRows:n=[],matterRows:t=[],documentRows:r=[],resources:i=[],memberOptions:a=[],organisationId:s="",currentRole:l="",currentUser:d=null,onWorkspaceChanged:c=null}){const[u,p]=h.useState(""),[f,k]=h.useState(""),[w,S]=h.useState(""),[y,o]=h.useState("Week"),[j,M]=h.useState(new Date),[se,O]=h.useState(null),[I,A]=h.useState(null),[z,P]=h.useState({preferredStart:"",preferredEnd:"",reason:""}),[R,$]=h.useState(!1),[T,_]=h.useState(()=>fe(new Date)),[le,Ze]=h.useState([]),[Ne,oe]=h.useState(()=>({enabled:Te()!=="production",environment:Te(),reason:"loading"})),[de,Qe]=h.useState({query:"",attorney:"all",matterType:"all",status:"all",boardroom:"all",dateRange:"week"}),Z=h.useMemo(()=>{const g=(i||[]).reduce((m,x)=>(m[String(x.resourceId||"")]=x.resourceName,m),{});return Ht({appointmentRows:n,matterRows:t,documentRows:r,role:l}).map(m=>({...m,resourceName:m.resourceName||g[String(m.resourceId||"")]||""}))},[n,t,r,l,i]),C=h.useMemo(()=>We(Z),[Z]),ce=h.useMemo(()=>tn(a,C),[a,C]),ke=h.useMemo(()=>C.filter(g=>nn(g,le)),[C,le]),L=h.useMemo(()=>ae(Kt(ke,de,j)),[ke,de,j]),ue=h.useMemo(()=>_e(Z),[Z]),Q=h.useMemo(()=>_e(L),[L]),we=h.useMemo(()=>Ue(a),[a]),Ke=h.useMemo(()=>Jt(L,Q),[L,Q]),K=h.useMemo(()=>en(t),[t]);h.useEffect(()=>{let g=!0;const m=s||K.find(x=>x.organisationId)?.organisationId;return m?(ot(m).then(x=>{g&&oe(x)}).catch(()=>{g&&oe(x=>({...x,enabled:!1,reason:"decision_unavailable"}))}),()=>{g=!1}):(oe(x=>({...x,enabled:!1,reason:"organisation_required"})),()=>{g=!1})},[s,K]);const Ge=h.useMemo(()=>{const g=C.filter(b=>v(b.resourceId)).length,m=V(j),x=B(m,7);return{todaysAppointments:C.filter(b=>ne(b.dateTime)).length,thisWeekAppointments:C.filter(b=>{const D=new Date(b.dateTime||"");return!Number.isNaN(D.getTime())&&D>=m&&D<x}).length,pendingConfirmations:C.filter(b=>b.operationalStatus==="awaiting_confirmation").length,blockedSignings:C.filter(b=>b.readiness?.label==="Blocked"||b.operationalStatus==="blocked").length,overdueSignings:C.filter(b=>b.operationalStatus==="awaiting_confirmation"&&Ae(b.dateTime)).length,overdueItems:C.filter(b=>(b.operationalStatus==="awaiting_confirmation"||b.readiness?.label==="Blocked")&&Ae(b.dateTime)).length,rescheduleRequests:ue.length,boardroomUtilisation:C.length?Math.round(g/C.length*100):0}},[C,ue.length,j]);async function E(g,m,x="Scheduling workspace updated."){p(g),k(""),S("");try{const b=await m(),D=v(b?.message);D&&b?.tone==="error"?k(D):S(D||x),await c?.()}catch(b){k(b?.message||"Unable to update scheduling workspace.")}finally{p("")}}const Je=(g,m)=>E(`resource-${g.id}`,async()=>{await gt(g.id,m||null)}),Xe=(g,m)=>E(`staff-${g.id}-${m?.role||""}`,async()=>{const x=(a||[]).find(b=>String(b.value)===String(m?.userId||""));await ht(g.id,{participantRole:m.role,name:x?.label||"Assigned Staff",email:""})}),et=g=>E(`complete-${g.id}`,async()=>{await ft(g.id,"completed",{actorRole:l})}),tt=(g,m)=>E(`notify-${g.id}-${m}`,async()=>{const x=await bt(g.id,m);return x.failedCount>0?{tone:"error",message:"The appointment remains saved, but the communication could not be delivered."}:x.deliveredCount>0?{tone:"success",message:"Appointment communication sent."}:{tone:"error",message:"No eligible external recipient was available for this communication."}}),nt=g=>{const m=g.preferredStart||g.appointment?.dateTime,x=g.preferredEnd||(m?new Date(new Date(m).getTime()+2700*1e3).toISOString():"");A(g),P({preferredStart:Me(m),preferredEnd:Me(x),reason:g.reason||""})},rt=g=>{if(g.preventDefault(),!I?.requestId)return;const m=mt({preferredStart:ze(z.preferredStart),preferredEnd:ze(z.preferredEnd),reason:z.reason});if(!m.isValid){k(m.errors[0]?.message||"Choose a valid counter-proposal time.");return}E(`propose-${I.requestId}`,async()=>(await xt(I.requestId,m.value),A(null),{tone:"success",message:"Counter proposal recorded and queued for delivery."}))},at=(g,m)=>{const x={decision:m,confirmedStart:m==="accepted"?g.preferredStart:null,confirmedEnd:m==="accepted"?g.preferredEnd:null,reason:m==="rejected"?"Unable to accommodate requested slot.":"Reschedule approved."};if(m==="accepted"&&!x.confirmedStart)return k("Approve requires a preferred appointment time."),null;const b=dt(x);return b.isValid?E(`resolve-${g.requestId}-${m}`,async()=>(await yt(g.requestId,b.value),{tone:"success",message:m==="accepted"?"Reschedule approved and appointment calendar updated.":"Reschedule request declined and appointment retained."})):(k(b.errors[0]?.message||"Choose a valid reschedule decision."),null)},it=g=>{if(g.preventDefault(),!Ne.enabled){k("Create Invite is temporarily unavailable for this firm.");return}const m=K.find(F=>F.matterId===T.matterId),x=T.appointmentType==="internal_meeting";if(!m&&!x){k("Choose a matter before creating the invite.");return}const D=i.find(F=>String(F.resourceId||"")===String(T.resourceId||""))?.resourceName||"",me=ut({...T,title:T.title,durationMinutes:Et(T,Ye(T.appointmentType).durationMinutes),attachCalendarInvite:T.sendNotifications!==!1,recipientName:T.recipientName||m?.clientName||d?.name||d?.email||"Team Member",organisationId:s||m?.organisationId,transactionId:m?.matterId||"",resourceName:D,attorneyName:d?.name||d?.email||"",attorneyEmail:d?.email||""});if(!me.isValid){k(me.errors[0]?.message||"Attorney invite details are invalid.");return}E("create-invite",async()=>{const F=await vt(me.value);return $(!1),_(fe(j)),jt(F.delivery)})};function st(){_(fe(j)),$(!0)}return e.jsxs("section",{className:"attorney-scheduling-os",children:[e.jsx(Nn,{}),e.jsx(an,{onCreateInvite:st,rolloutStatus:Ne}),f?e.jsx("div",{className:"scheduling-alert is-error",children:f}):null,w?e.jsx("div",{className:"scheduling-alert is-success",children:w}):null,u?e.jsx("div",{className:"scheduling-alert",children:"Processing scheduling action..."}):null,e.jsx(on,{metrics:Ge,selectedDate:j,setSelectedDate:M}),e.jsx(sn,{filters:de,setFilters:Qe,resources:i,memberOptions:ce}),e.jsxs("section",{className:"scheduling-main-grid",children:[e.jsx(cn,{staffRows:ce,selectedStaffIds:le,setSelectedStaffIds:Ze}),e.jsx(hn,{rows:L,viewMode:y,setViewMode:o,selectedDate:j,setSelectedDate:M,onSelect:O,staffRows:ce})]}),e.jsxs("section",{className:"scheduling-secondary-grid",children:[e.jsx(fn,{rows:Q.length?Q:ue,onPropose:nt,onResolve:at,onSelect:O,busyId:u}),e.jsx(xn,{rows:L,resources:i}),e.jsx(yn,{rows:Ke})]}),e.jsx(jn,{appointment:se,resources:i,staffOptions:we,busyId:u,onClose:()=>O(null),onResourceAssign:Je,onStaffAssign:Xe,onComplete:et,onResendCommunication:tt}),e.jsx(vn,{open:R,draft:T,setDraft:_,matterOptions:K,resources:i,staffOptions:we,busyId:u,onClose:()=>$(!1),onSubmit:it}),e.jsx(bn,{request:I,draft:z,setDraft:P,busyId:u,onClose:()=>A(null),onSubmit:rt})]})}function q(n=""){return String(n||"").trim()}function cr(){const{role:n,profile:t,workspace:r}=Dt(),i=zt(),[a,s]=h.useState(!0),[l,d]=h.useState(""),[c,u]=h.useState(null),[p,f]=h.useState([]),[k,w]=h.useState(!1),S=h.useRef(0),y=h.useMemo(()=>q(r?.type)==="attorney_firm"?q(r?.id):q(t?.primaryAttorneyFirmId||t?.primary_attorney_firm_id),[r?.id,r?.type,t?.primaryAttorneyFirmId,t?.primary_attorney_firm_id]),o=q(t?.id||t?.userId),j=h.useCallback(async({force:I=!1}={})=>{const A=S.current+1;S.current=A;const z=Ie("attorney.page.scheduling",{firmId:y||null,userId:o||null,force:!!I});let P="success";s(!0),d("");try{z.mark("workspace:start");const R=await Nt(y||null,o||null,{force:I});if(z.mark("workspace:end",{hasFirm:!!R?.firm?.id,matters:R?.matterQueue?.length||0,appointments:R?.appointmentQueue?.length||0}),S.current!==A)return;u(R),s(!1);const $=q(R?.matterQueue?.[0]?.organisationId||R?.appointmentQueue?.[0]?.organisationId);if($){w(!0);const T=Ie("attorney.page.scheduling.resources",{organisationId:$});Mt($,{includeInactive:!1}).then(_=>{S.current===A&&(f(Array.isArray(_)?_:[]),T.mark("resources:end",{resources:Array.isArray(_)?_.length:0}))}).catch(()=>{S.current===A&&(f([]),T.mark("resources:failed"))}).finally(()=>{S.current===A&&(w(!1),T.end())})}else f([]),w(!1)}catch(R){if(P="failed",S.current!==A)return;d(R?.message||"Unable to load attorney scheduling workspace."),s(!1),w(!1)}finally{z.end({outcome:P})}},[y,o]);h.useEffect(()=>{let I=!0;return(async()=>I&&await j())(),()=>{I=!1}},[j]);const M=!!c?.permissions?.can_manage_signing_appointments,se=h.useMemo(()=>c?.availableFilters?.members||[],[c?.availableFilters?.members]),O=q(c?.matterQueue?.[0]?.organisationId||c?.appointmentQueue?.[0]?.organisationId);return n!=="attorney"?e.jsx(Se,{to:"/dashboard",replace:!0}):i.loading||a?e.jsx("section",{className:"page",children:e.jsx("div",{className:"panel card-tier-standard",children:e.jsx("p",{className:"status-message",style:{margin:0},children:"Loading attorney scheduling workspace…"})})}):i.error?e.jsx("section",{className:"page",children:e.jsx("div",{className:"panel card-tier-standard",children:e.jsx("p",{className:"status-message",style:{margin:0,color:"#b42318"},children:i.error})})}):c?.firm?.id?M?e.jsxs("section",{className:"page",style:{display:"grid",gap:"1rem"},children:[l?e.jsx("div",{className:"panel card-tier-standard",children:e.jsx("p",{className:"status-message",style:{margin:0,color:"#b42318"},children:l})}):null,e.jsx(kn,{appointmentRows:c?.appointmentQueue||[],matterRows:c?.matterQueue||[],documentRows:c?.documentQueue||[],resources:p,resourcesLoading:k,memberOptions:se,organisationId:O,currentRole:c?.currentUser?.role||"",currentUser:c.currentUser,onWorkspaceChanged:()=>j({force:!0})})]}):e.jsx("section",{className:"page",style:{display:"grid",gap:"1rem"},children:e.jsxs("div",{className:"panel card-tier-standard",children:[e.jsx("h2",{style:{margin:"0 0 0.35rem"},children:"Calendar & Scheduling"}),e.jsx("p",{className:"status-message",style:{margin:0},children:"Your role does not include signing appointment coordination permissions."})]})}):e.jsx(Se,{to:"/attorney/onboarding",replace:!0})}export{cr as default};
