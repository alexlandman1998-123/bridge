import{d as ze,r as f,j as e,f as $e}from"./vendor-react-CxWbXxZ0.js";import{L as Ue}from"./LoadingSkeleton-DBoc_dJp.js";import{d as Ne,i as we,S as Ve}from"./stages-C8AZJ3uI.js";import{a as Be,b as Ge,f as Ye}from"./financeType-CUnNfZDz.js";import{g as fe}from"./reportNextAction--C_XrIXk.js";import{I as Ie,bg as Ze,i as ke,bd as qe,bG as Xe,aN as He,C as Ke}from"./vendor-icons-DVwaqAC6.js";import{F as z}from"./Field-BJcqRsNE.js";import{B as ge}from"./Button-Da1yC0BU.js";import{u as We,i as me}from"./index-DRIIUtDS.js";import{aX as Je,b as Qe,aY as et}from"./api-tuR50g_Q.js";import{f as tt}from"./settingsApi-BOBCqdDV.js";import{getCommissionOverview as Se,updateCommissionTarget as rt}from"./commissionService-Drew8UCD.js";import"./vendor-runtime-CsAVBJvT.js";import"./developerTransactionReadinessProfile-Bsq3wry4.js";import"./vendor-ui-DjDDyUy_.js";import"./vendor-supabase-DTqiiTOY.js";import"./utils-BQHNewu7.js";import"./bondApplicationSigningAvailability-DPadczeH.js";import"./financeReadinessSelectors-CSCtKDQr.js";import"./bondApplicationSubmissionReadiness-CHAbXvYc.js";import"./documentRequestCanonicalMatrix-DiA7yn1Q.js";import"./purchaserPersonas-BK3vfNim.js";import"./sellerMandateInformationModel-BxAh6k0x.js";import"./conditionalPackDataRules-JMlIzFC_.js";import"./storageFallbacks-BNLWdM2_.js";import"./platformFeeConsent-D-9ooztF.js";import"./attorneyIncomingMatterContract-DDMoBIwk.js";import"./kingstonsBuyerOtpReadiness-BuaJq1xh.js";import"./finalSignedArtifactAccess-CCEwrp-i.js";import"./matterPropertyContext-CfgY-xr2.js";import"./documentRequestCanonicalTransactionSyncService-XEOEJWjK.js";import"./financeWorkflow-L0k2vnTR.js";import"./canonicalDocumentAdapterService-BnFp8xhY.js";import"./crossModuleDocumentKeyMapService-BvUS8QX0.js";import"./matterScenarioProfile-BvlfAaKd.js";import"./transactionSaleProfile-maT5I4ZG.js";import"./generateMandateDocument-DtmyfhXF.js";import"./developmentTransactionVisibility-DoN1lFoG.js";import"./developmentVisualMap-BcwOH0T9.js";import"./onboardingBranding-DDK0TXZo.js";import"./permissions-B5t9d0Z_.js";import"./requirementReviewStatus-BNFW9Ohr.js";import"./matterWorkflowPlanService-CkHdsMP2.js";import"./clientAccessPolicy-BsICr08s.js";import"./attorneyFirmServiceShared-DCe5AT8D.js";import"./portalDocumentMetadata-D8woUlyK.js";import"./attorneyPermissions-0kVPVH_z.js";import"./transactionWorkflowReadModelService-DfDW7PT5.js";import"./appointmentAvailabilityEngine-COYaKwkd.js";import"./appointmentTypeDefinitions-DMiwhQCw.js";import"./attorneySelectors-HBmn74jJ.js";import"./transactionLifecycle-CT91jIzw.js";import"./bondIntakeSelectors-BcMSuWTm.js";import"./journeyStageOverrideContract-Br3kv2u2.js";import"./canonicalFieldResolver-BUnDPJsV.js";import"./bondApplicationAdapterRegistry--S7MU2bd.js";import"./attorneyOperationalEngine-CN1kY-SK.js";import"./permissions-CaHWqXeq.js";import"./highLevelJourneyRules-D6sa0EB7.js";import"./propertyTaxonomy-BFeaYqoy.js";import"./bondIntakeNotificationService-D4uX6xf7.js";import"./portalCanonicalFieldFallbacks-DnJGhHvZ.js";import"./partnerRoutingResolverService-DuQA1ugf.js";import"./activityAudit-CtQkWBNJ.js";import"./partnerNetworkService-CZwpLGTi.js";import"./organizationService-BEOeFD9m.js";import"./bondPartnerProfileService-DGtdMSpJ.js";import"./partnersRepository-BOlH8AVC.js";import"./universalAssignmentService-Bf3uHHob.js";import"./attorneyIncomingMatterNotificationService-Bz870gSp.js";const ye="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]";function Te(t="On Track"){const r=String(t||"").toLowerCase();return r.includes("blocked")?"border-[#f1c7c7] bg-[#fff1f1] text-[#b42318]":r.includes("delay")?"border-[#f3d7a8] bg-[#fff8ed] text-[#9a5b0f]":r.includes("track")?"border-[#d8f0de] bg-[#edfdf3] text-[#1e7a46]":"border-[#dde4ee] bg-[#f7f9fc] text-[#66758b]"}function Re(t,r=120){return t?t.length<=r?t:`${t.slice(0,r-1)}…`:"-"}function _(t){const r=Number(t);return Number.isFinite(r)?new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",maximumFractionDigits:0}).format(r):"-"}function k(t){return Number.isFinite(t)?`${Math.round(t)}%`:"0%"}function ae(t){return!Number.isFinite(t)||t<=0?"0.0x":`${t.toFixed(t>=10?0:1)}x`}function Q(t){return t.transaction?.sales_price??t.report?.purchasePrice??t.unit?.price??null}const L=["AVAIL","DEP","OTP","FIN","ATTY","XFER","REG"],ee={AVAIL:"Available",DEP:"Deposit",OTP:"OTP",FIN:"Finance",ATTY:"Transfer Preparation",XFER:"Transfer",REG:"Registered"},U={cash:"#37576f",bond:"#22c55e",combination:"#2563eb",unknown:"#cbd5e1"};function st(t){const r=String(t||"").trim().toUpperCase();if(L.includes(r))return r;const s=Ne(t).toLowerCase();return s.includes("available")?"AVAIL":s.includes("deposit")?"DEP":s.includes("otp")||s.includes("reserved")||s.includes("sign")?"OTP":s.includes("finance")||s.includes("bank")||s.includes("bond")?"FIN":s.includes("attorney")||s.includes("tuckers")?"ATTY":s.includes("transfer")||s.includes("lodg")?"XFER":s.includes("registered")?"REG":"AVAIL"}function w(t){return st(t?.transaction?.current_main_stage||t?.report?.currentMainStage||t?.stage)}function Le(t){return L.indexOf(w(t))}function be(t){if(!t)return 0;const r=new Date(t);if(Number.isNaN(r.getTime()))return 0;const s=Date.now()-r.getTime();return!Number.isFinite(s)||s<=0?0:Math.floor(s/(1e3*60*60*24))}function Fe(t){return Be(t,{allowUnknown:!0})}function Oe(t){const r=t.reduce((a,m)=>a+m.count,0);if(!r)return"conic-gradient(#cbd5e1 0 100%)";let s=0;return`conic-gradient(${t.map(a=>{const m=s/r*100;s+=a.count;const l=s/r*100;return`${a.color} ${m}% ${l}%`}).join(", ")})`}function ne(t,r=78){if(!t)return"";const s=String(t).replace(/\s+/g," ").trim();if(!s)return"";const o=s.search(/[.!?](\s|$)/),a=o>20&&o<r?s.slice(0,o+1):s;return a.length<=r?a:`${a.slice(0,r-1)}…`}function nt(t){const r=Ne(t);return r==="Available"?"Open for sale.":r==="Reserved"?"Waiting for deposit confirmation.":r==="OTP Signed"?"OTP signed; preparing funding checks.":r==="Deposit Paid"?"Deposit received; waiting for OTP signature.":r==="Finance Pending"?"Funding verification in progress.":r==="Bond Approved / Proof of Funds"?"Funds secured; attorney instruction pending.":r==="Proceed to Attorneys"?"Transfer preparation with attorneys.":["Transfer in Progress","Transfer Lodged","Transfer"].includes(r)?"Transfer processing at deeds office.":r==="Registered"?"Registration complete.":"Transaction in progress."}function at(t){const r=ne(t.report?.workflowComment,84),s=ne(t.report?.latestOperationalNote,82),o=ne(t.report?.notesSummary,72),a=ne(t.transaction?.next_action,72),m=nt(t.stage);return r||s||o||a||m}function it({marketingSummary:t}){const r=(t?.sourceRows||[]).length>0,s=t?.actualSpend?"Actual spend mode":"Estimated spend mode",o=t?.spendUsed?(t.attributedRevenue||0)/t.spendUsed:0,a=(t?.sourceRows||[]).slice(0,6),m=a[0]||null;return e.jsxs("section",{className:ye,children:[e.jsxs("header",{className:"flex flex-col gap-4 border-b border-[#edf2f7] pb-5 lg:flex-row lg:items-start lg:justify-between",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]",children:"Marketing Performance"}),e.jsx("p",{className:"mt-2 text-sm leading-6 text-[#6b7d93]",children:"See which channels are feeding the pipeline, converting cleanly, and actually turning spend into secured revenue."})]}),e.jsx("span",{className:"inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]",children:s})]}),e.jsxs("div",{className:"mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6",children:[e.jsxs("article",{className:"flex min-w-0 flex-col rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]",children:[e.jsx("span",{className:"block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Total Leads"}),e.jsx("strong",{className:"mt-2 block truncate text-[clamp(1.15rem,1.9vw,1.45rem)] font-semibold leading-tight tracking-[-0.03em] text-[#142132]",children:t?.totalLeads||0}),e.jsx("p",{className:"mt-1.5 text-sm leading-5 text-[#6b7d93]",children:"Visible in this report."})]}),e.jsxs("article",{className:"flex min-w-0 flex-col rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]",children:[e.jsx("span",{className:"block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Conversions"}),e.jsx("strong",{className:"mt-2 block truncate text-[clamp(1.15rem,1.9vw,1.45rem)] font-semibold leading-tight tracking-[-0.03em] text-[#1e7a46]",children:t?.totalConverted||0}),e.jsxs("p",{className:"mt-1.5 text-sm leading-5 text-[#6b7d93]",children:[k(t?.conversionRate||0)," conversion."]})]}),e.jsxs("article",{className:"flex min-w-0 flex-col rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]",children:[e.jsx("span",{className:"block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Spend Used"}),e.jsx("strong",{className:"mt-2 block truncate text-[clamp(1.15rem,1.9vw,1.45rem)] font-semibold leading-tight tracking-[-0.03em] text-[#142132]",children:_(t?.spendUsed||0)}),e.jsxs("p",{className:"mt-1.5 text-sm leading-5 text-[#6b7d93]",children:[s,"."]})]}),e.jsxs("article",{className:"flex min-w-0 flex-col rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]",children:[e.jsx("span",{className:"block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Attributed Revenue"}),e.jsx("strong",{className:"mt-2 block truncate text-[clamp(1.15rem,1.9vw,1.45rem)] font-semibold leading-tight tracking-[-0.03em] text-[#142132]",children:_(t?.attributedRevenue||0)}),e.jsx("p",{className:"mt-1.5 text-sm leading-5 text-[#6b7d93]",children:"Revenue secured."})]}),e.jsxs("article",{className:"flex min-w-0 flex-col rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]",children:[e.jsx("span",{className:"block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Cost per Lead"}),e.jsx("strong",{className:"mt-2 block truncate text-[clamp(1.15rem,1.9vw,1.45rem)] font-semibold leading-tight tracking-[-0.03em] text-[#142132]",children:_(t?.costPerLead||0)}),e.jsx("p",{className:"mt-1.5 text-sm leading-5 text-[#6b7d93]",children:"Acquisition efficiency."})]}),e.jsxs("article",{className:"flex min-w-0 flex-col rounded-[18px] border border-[#dce6f1] bg-[#fbfcfe] px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)]",children:[e.jsx("span",{className:"block text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"ROAS"}),e.jsx("strong",{className:"mt-2 block truncate text-[clamp(1.15rem,1.9vw,1.45rem)] font-semibold leading-tight tracking-[-0.03em] text-[#1e7a46]",children:ae(o)}),e.jsx("p",{className:"mt-1.5 text-sm leading-5 text-[#6b7d93]",children:"Revenue versus spend."})]})]}),e.jsxs("div",{className:"mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]",children:[e.jsxs("article",{className:"rounded-[22px] border border-[#dce6f1] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]",children:[e.jsxs("div",{className:"flex items-start justify-between gap-3",children:[e.jsxs("div",{children:[e.jsx("h5",{className:"text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]",children:"Source Performance"}),e.jsx("p",{className:"mt-2 text-sm leading-6 text-[#6b7d93]",children:"Which channels are feeding the pipeline and what quality they are producing."})]}),e.jsxs("span",{className:"inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-[#eef4f9] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#5d7287]",children:[a.length," sources"]})]}),r?e.jsx("div",{className:"mt-5 grid gap-4",children:a.map((l,v)=>{const S=t?.attributedRevenue?l.revenue/t.attributedRevenue*100:0,x=l.estimatedSpend?l.revenue/l.estimatedSpend:0;return e.jsxs("article",{className:"rounded-[20px] border border-[#dce6f1] bg-[#fbfcfe] px-5 py-5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]",children:[e.jsxs("div",{className:"flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between",children:[e.jsx("div",{className:"min-w-0",children:e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("span",{className:"inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-[#eef4f9] px-2 text-xs font-semibold text-[#35546c]",children:v+1}),e.jsxs("div",{children:[e.jsx("h5",{className:"text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]",children:l.label}),e.jsxs("p",{className:"mt-1 text-sm text-[#6b7d93]",children:[l.leads," leads • ",l.converted," registered • ",k(l.conversionRate)," conversion"]})]})]})}),e.jsxs("div",{className:"grid min-w-0 w-full gap-3 sm:grid-cols-3 2xl:min-w-[360px]",children:[e.jsxs("div",{className:"min-w-0 rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3",children:[e.jsx("span",{className:"text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Revenue"}),e.jsx("strong",{className:"mt-1 block truncate text-sm font-semibold text-[#142132]",children:_(l.revenue)})]}),e.jsxs("div",{className:"min-w-0 rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3",children:[e.jsx("span",{className:"text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Spend Model"}),e.jsx("strong",{className:"mt-1 block truncate text-sm font-semibold text-[#142132]",children:_(l.estimatedSpend)})]}),e.jsxs("div",{className:"min-w-0 rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3",children:[e.jsx("span",{className:"text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"ROAS"}),e.jsx("strong",{className:"mt-1 block text-sm font-semibold text-[#1e7a46]",children:ae(x)})]})]})]}),e.jsxs("div",{className:"mt-3 grid gap-3 md:grid-cols-2",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 text-xs font-medium text-[#6b7d93]",children:[e.jsx("span",{children:"Lead Share"}),e.jsx("span",{children:k(l.leadShare)})]}),e.jsx("div",{className:"mt-2 h-2.5 rounded-full bg-[#e8eef5]","aria-hidden":!0,children:e.jsx("span",{className:"block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#7ea5c8_100%)]",style:{width:`${Math.max(l.leadShare,3)}%`}})})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 text-xs font-medium text-[#6b7d93]",children:[e.jsx("span",{children:"Revenue Share"}),e.jsx("span",{children:k(S)})]}),e.jsx("div",{className:"mt-2 h-2.5 rounded-full bg-[#e8eef5]","aria-hidden":!0,children:e.jsx("span",{className:"block h-full rounded-full bg-[linear-gradient(90deg,#1d7b52_0%,#57c785_100%)]",style:{width:`${Math.max(S,3)}%`}})})]})]})]},l.key)})}):e.jsx("p",{className:"mt-4 text-sm text-[#6b7d93]",children:"No marketing source data available for the selected filters."})]}),e.jsxs("section",{className:"space-y-4",children:[e.jsxs("article",{className:"rounded-[22px] border border-[#dce6f1] bg-[#fbfcfe] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]",children:[e.jsx("span",{className:"inline-flex whitespace-nowrap items-center rounded-full bg-[#eef4f9] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#5d7287]",children:"Top Performing Source"}),e.jsx("h5",{className:"mt-3 text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]",children:t?.topSource||"Unknown"}),e.jsx("p",{className:"mt-1 text-sm leading-5 text-[#6b7d93]",children:m?`${m.leads} leads • ${m.converted} registered • ${k(m.conversionRate)} conversion`:"No source data available in this report slice."}),e.jsxs("div",{className:"mt-4 grid gap-3 sm:grid-cols-2",children:[e.jsxs("div",{className:"rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5",children:[e.jsx("span",{className:"text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Cost per Lead"}),e.jsx("strong",{className:"mt-2 block text-[1.25rem] font-semibold text-[#142132]",children:_(t?.costPerLead||0)})]}),e.jsxs("div",{className:"rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5",children:[e.jsx("span",{className:"text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Cost per Conversion"}),e.jsx("strong",{className:"mt-2 block text-[1.25rem] font-semibold text-[#142132]",children:_(t?.costPerConversion||0)})]}),e.jsxs("div",{className:"rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5",children:[e.jsx("span",{className:"text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"ROAS"}),e.jsx("strong",{className:"mt-2 block text-[1.25rem] font-semibold text-[#1e7a46]",children:ae(o)})]}),e.jsxs("div",{className:"rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5",children:[e.jsx("span",{className:"text-[0.72rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Estimated Spend"}),e.jsx("strong",{className:"mt-2 block text-[1.25rem] font-semibold text-[#142132]",children:_(t?.estimatedSpend||0)})]})]})]}),e.jsxs("article",{className:"rounded-[22px] border border-[#dce6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]",children:[e.jsx("h5",{className:"text-[0.98rem] font-semibold tracking-[-0.02em] text-[#142132]",children:"Source Conversion Ladder"}),e.jsx("p",{className:"mt-2 text-sm leading-6 text-[#6b7d93]",children:"Use this to decide where to keep spending and which channels need quality intervention."}),r?e.jsx("ul",{className:"mt-4 space-y-3",children:a.map(l=>e.jsxs("li",{children:[e.jsxs("div",{className:"flex items-center justify-between gap-3 text-sm",children:[e.jsx("span",{className:"font-medium text-[#4f647a]",children:l.label}),e.jsx("strong",{className:"font-semibold text-[#142132]",children:k(l.conversionRate)})]}),e.jsx("div",{className:"mt-2 h-2.5 rounded-full bg-[#e8eef5]","aria-hidden":!0,children:e.jsx("span",{className:"block h-full rounded-full bg-[linear-gradient(90deg,#1d7b52_0%,#57c785_100%)]",style:{width:`${Math.max(l.conversionRate,3)}%`}})})]},`${l.key}-ladder`))}):e.jsx("p",{className:"mt-5 text-sm text-[#6b7d93]",children:"No conversion data available for the selected filters."})]})]})]})]})}function ot({title:t,transactionScopeLabel:r,generatedAt:s,summary:o,rows:a,marketingSummary:m}){const l=a.length,v=a.filter(d=>!["AVAIL","REG"].includes(w(d))),S=a.filter(d=>w(d)==="REG"),x=a.filter(d=>w(d)==="AVAIL"),P=v.reduce((d,j)=>d+(Number(Q(j))||0),0),N=a.filter(d=>["Delayed","Blocked"].includes(d.report?.riskStatus||"")||be(V(d))>=10),g=[{key:"cash",label:"Cash",count:0,value:0,color:U.cash},{key:"bond",label:"Bond",count:0,value:0,color:U.bond},{key:"combination",label:"Hybrid",count:0,value:0,color:U.combination},{key:"unknown",label:"Unknown",count:0,value:0,color:U.unknown}];a.forEach(d=>{const j=Fe(d?.transaction?.finance_type),A=g.find(q=>q.key===j);A&&(A.count+=1,A.value+=Number(Q(d))||0)});const B=g.map(d=>({...d,share:l?d.count/l*100:0})),T=Oe(B),G=L.map(d=>({key:d,label:ee[d],count:a.filter(j=>w(j)===d).length})).filter(d=>d.count>0).sort((d,j)=>j.count-d.count),F=(m?.sourceRows||[]).slice(0,5),D=new Map;a.forEach(d=>{const j=d?.development?.name||"Unknown development",A=D.get(j)||{label:j,total:0,active:0,completed:0};A.total+=1,["AVAIL","REG"].includes(w(d))||(A.active+=1),w(d)==="REG"&&(A.completed+=1),D.set(j,A)});const Z=[...D.values()].sort((d,j)=>j.total-d.total).slice(0,5);return e.jsxs("section",{className:"investor-print-page report-page-one",children:[e.jsxs("header",{className:"report-doc-head",children:[e.jsxs("div",{children:[e.jsx("p",{className:"report-doc-eyebrow",children:"Arch9"}),e.jsx("h1",{children:"Arch9 Portfolio Report"}),e.jsxs("p",{className:"report-doc-subtitle",children:[t," • ",r]})]}),e.jsxs("div",{className:"report-doc-head-meta",children:[e.jsx("span",{children:"Generated"}),e.jsx("strong",{children:s})]})]}),e.jsxs("div",{className:"report-doc-body",children:[e.jsxs("section",{className:"report-doc-kpis",children:[e.jsxs("article",{children:[e.jsx("span",{children:"Total Units"}),e.jsx("strong",{children:l})]}),e.jsxs("article",{children:[e.jsx("span",{children:"Units in Transaction"}),e.jsx("strong",{children:v.length})]}),e.jsxs("article",{children:[e.jsx("span",{children:"Completed"}),e.jsx("strong",{children:S.length})]}),e.jsxs("article",{children:[e.jsx("span",{children:"Available"}),e.jsx("strong",{children:x.length})]}),e.jsxs("article",{children:[e.jsx("span",{children:"Pipeline Value"}),e.jsx("strong",{children:_(P)})]}),e.jsxs("article",{children:[e.jsx("span",{children:"Conversion Rate"}),e.jsx("strong",{children:k(o.totalTransactions?(o.totalTransactions-x.length)/o.totalTransactions*100:0)})]})]}),e.jsxs("section",{className:"report-doc-grid report-doc-grid-primary",children:[e.jsxs("article",{className:"report-doc-card",children:[e.jsxs("header",{children:[e.jsx("h3",{children:"Marketing & Lead Sources"}),e.jsx("span",{children:m?.actualSpend?"Actual spend":"Estimated spend"})]}),e.jsxs("div",{className:"report-doc-mini-kpis",children:[e.jsxs("div",{children:[e.jsx("span",{children:"Total Leads"}),e.jsx("strong",{children:m?.totalLeads||0})]}),e.jsxs("div",{children:[e.jsx("span",{children:"Conversions"}),e.jsx("strong",{children:m?.totalConverted||0})]}),e.jsxs("div",{children:[e.jsx("span",{children:"Cost per Lead"}),e.jsx("strong",{children:_(m?.costPerLead||0)})]}),e.jsxs("div",{children:[e.jsx("span",{children:"ROAS"}),e.jsx("strong",{children:ae(m?.spendUsed?(m.attributedRevenue||0)/m.spendUsed:0)})]})]}),e.jsx("div",{className:"report-doc-source-list",children:F.length?F.map(d=>e.jsxs("div",{className:"report-doc-source-row",children:[e.jsxs("div",{children:[e.jsx("strong",{children:d.label}),e.jsxs("span",{children:[d.leads," leads • ",k(d.conversionRate)," conversion"]})]}),e.jsx("div",{className:"report-doc-source-bar",children:e.jsx("em",{style:{width:`${Math.max(d.leadShare,4)}%`}})})]},d.key)):e.jsx("p",{className:"report-doc-empty",children:"No lead-source data in the selected scope."})})]}),e.jsxs("article",{className:"report-doc-card",children:[e.jsxs("header",{children:[e.jsx("h3",{children:"Portfolio Mix"}),e.jsxs("span",{children:[N.length," delayed / stuck"]})]}),e.jsxs("div",{className:"report-doc-mix",children:[e.jsx("div",{className:"report-doc-donut",style:{background:T},"aria-hidden":!0,children:e.jsx("div",{})}),e.jsx("div",{className:"report-doc-finance-list",children:B.map(d=>e.jsxs("div",{className:"report-doc-finance-row",children:[e.jsx("span",{className:"swatch",style:{backgroundColor:d.color}}),e.jsxs("div",{children:[e.jsx("strong",{children:d.label}),e.jsxs("span",{children:[d.count," deals • ",k(d.share)]})]}),e.jsx("em",{children:_(d.value)})]},d.key))})]})]})]}),e.jsxs("section",{className:"report-doc-grid report-doc-grid-secondary",children:[e.jsxs("article",{className:"report-doc-card",children:[e.jsxs("header",{children:[e.jsx("h3",{children:"Transaction Status Summary"}),e.jsxs("span",{children:[v.length," live deals"]})]}),e.jsx("div",{className:"report-doc-stage-list",children:G.slice(0,6).map(d=>e.jsxs("div",{className:"report-doc-stage-row",children:[e.jsx("span",{children:d.label}),e.jsx("div",{className:"track",children:e.jsx("em",{style:{width:`${Math.max(l?d.count/l*100:0,4)}%`}})}),e.jsx("strong",{children:d.count})]},d.key))})]}),e.jsxs("article",{className:"report-doc-card",children:[e.jsxs("header",{children:[e.jsx("h3",{children:"Development Snapshot"}),e.jsx("span",{children:"Current portfolio spread"})]}),e.jsxs("table",{className:"report-doc-mini-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Development"}),e.jsx("th",{children:"Total"}),e.jsx("th",{children:"Active"}),e.jsx("th",{children:"Done"})]})}),e.jsx("tbody",{children:Z.map(d=>e.jsxs("tr",{children:[e.jsx("td",{children:d.label}),e.jsx("td",{children:d.total}),e.jsx("td",{children:d.active}),e.jsx("td",{children:d.completed})]},d.label))})]})]})]})]}),e.jsxs("footer",{className:"report-doc-foot",children:[e.jsx("span",{children:"Executive Summary"}),e.jsx("span",{children:"Arch9 Portfolio Report"})]})]})}function lt({row:t}){const r=Math.max(Le(t),0);return e.jsx("div",{className:"report-doc-progress","aria-label":"Transaction progress",children:L.map((s,o)=>{const a=o<r?"complete":o===r?"current":"future";return e.jsxs("div",{className:`report-doc-progress-node ${a}`,children:[e.jsx("span",{className:"dot"}),o<L.length-1?e.jsx("span",{className:"line"}):null]},s)})})}function ct({rows:t}){return e.jsxs("table",{className:"report-doc-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Unit / Property"}),e.jsx("th",{children:"Buyer"}),e.jsx("th",{children:"Finance"}),e.jsx("th",{children:"Current Stage"}),e.jsx("th",{children:"Progress"}),e.jsx("th",{children:"Latest Update"}),e.jsx("th",{children:"Last Updated"})]})}),e.jsx("tbody",{children:t.length?t.map(r=>e.jsxs("tr",{children:[e.jsxs("td",{children:[e.jsx("strong",{children:r.development?.name||"Unknown development"}),e.jsxs("span",{children:["Unit ",r.unit?.unit_number||"-"]})]}),e.jsx("td",{children:r.buyer?.name||"No buyer linked"}),e.jsx("td",{children:Ge(r.transaction?.finance_type)||"-"}),e.jsxs("td",{children:[e.jsx("strong",{children:Ne(r.stage)}),e.jsx("span",{children:fe(r)})]}),e.jsx("td",{children:e.jsx(lt,{row:r})}),e.jsx("td",{className:"comment-cell",children:at(r)}),e.jsx("td",{children:je(V(r))})]},r.unit.id)):e.jsx("tr",{children:e.jsx("td",{colSpan:7,children:"No active transactions in the selected reporting scope."})})})]})}function dt({rows:t,generatedAt:r,title:s,transactionScopeLabel:o}){return e.jsxs("section",{className:"investor-print-page report-page-two",children:[e.jsxs("header",{className:"report-doc-head",children:[e.jsxs("div",{children:[e.jsx("p",{className:"report-doc-eyebrow",children:"Arch9"}),e.jsx("h1",{children:"Transaction Overview"}),e.jsxs("p",{className:"report-doc-subtitle",children:[s," • ",o]})]}),e.jsxs("div",{className:"report-doc-head-meta",children:[e.jsx("span",{children:"Generated"}),e.jsx("strong",{children:r})]})]}),e.jsx("div",{className:"report-doc-body report-doc-body-table",children:e.jsxs("section",{className:"report-doc-card report-doc-card-table",children:[e.jsxs("header",{children:[e.jsx("h3",{children:"Active Transactions"}),e.jsxs("span",{children:[t.length," live deals"]})]}),e.jsx(ct,{rows:t})]})}),e.jsxs("footer",{className:"report-doc-foot",children:[e.jsx("span",{children:"Transaction Overview"}),e.jsx("span",{children:"Arch9 Portfolio Report"})]})]})}function xe(t){const r=Number(t);return Number.isFinite(r)?new Intl.NumberFormat("en-ZA",{notation:Math.abs(r)>=1e3?"compact":"standard",maximumFractionDigits:Math.abs(r)>=1e3?1:0}).format(r):"0"}function _e(t){if(!t)return"No recent update";const r=new Date(t);if(Number.isNaN(r.getTime()))return"No recent update";const s=Date.now()-r.getTime(),o=Math.max(Math.floor(s/(1e3*60*60*24)),0);return o===0?"Today":o===1?"1 day ago":o<30?`${o} days ago`:r.toLocaleDateString()}function V(t){return t?.report?.stageDate||t?.transaction?.updated_at||t?.transaction?.created_at||null}function ie(t){return w(t)!=="REG"?null:t?.report?.stageDate||t?.transaction?.updated_at||t?.transaction?.created_at||null}function Ae(t){const r=t?.transaction?.created_at,s=ie(t);if(!r||!s)return null;const o=new Date(r).getTime(),a=new Date(s).getTime();return!Number.isFinite(o)||!Number.isFinite(a)||a<=o?null:Math.max(Math.round((a-o)/(1e3*60*60*24)),0)}function je(t){if(!t)return"-";const r=new Date(t);return Number.isNaN(r.getTime())?"-":r.toLocaleDateString("en-ZA",{day:"2-digit",month:"short"})}function pt(t,r){return t<r?"complete":t===r?"current":"future"}function Y({label:t,value:r,helper:s="",trend:o="",tone:a="default"}){const m=a==="warning"?"text-[#9a5b0f]":a==="success"?"text-[#1e7a46]":"text-[#142132]",l=String(r??"").length>10?"text-[clamp(1.45rem,1.65vw,2rem)]":"text-[clamp(1.7rem,1.95vw,2.3rem)]";return e.jsxs("article",{className:"rounded-[20px] border border-[#e5ebf3] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]",children:[e.jsx("span",{className:"text-[0.79rem] font-semibold tracking-[0.02em] text-[#72839a]",children:t}),e.jsx("strong",{className:`mt-3 block ${l} font-semibold leading-none tracking-[-0.05em] ${m}`,children:r}),s?e.jsx("p",{className:"mt-2 text-[0.84rem] leading-5 text-[#6f8298]",children:s}):null,o?e.jsx("p",{className:"mt-2 text-xs font-medium text-[#5c738d]",children:o}):null]})}function mt({reportType:t,onChange:r}){return e.jsx("div",{className:"inline-flex flex-wrap items-center gap-2 rounded-[16px] border border-[#dde4ee] bg-[#f8fafc] p-1.5",children:[{value:"overview",label:"Overview Table"},{value:"unit_view",label:"Unit View"},{value:"performance",label:"Performance"}].map(s=>e.jsx("button",{type:"button",className:["inline-flex min-h-[40px] items-center justify-center rounded-[12px] px-4 py-2 text-sm font-semibold transition duration-150 ease-out",t===s.value?"bg-[#35546c] text-white shadow-[0_10px_20px_rgba(15,23,42,0.08)]":"text-[#5f7288] hover:bg-white hover:text-[#162334]"].join(" "),onClick:()=>r(s.value),children:s.label},s.value))})}function Ce({row:t}){const r=Math.max(Le(t),0);return e.jsx("div",{className:"flex min-w-[180px] items-center gap-1",title:ee[w(t)]||t.stage,children:L.map((s,o)=>{const a=pt(o,r),m=a==="complete"?"bg-[#35546c] ring-[#35546c]":a==="current"?"bg-[#24445d] ring-[#24445d]":"bg-[#d5dde7] ring-[#d5dde7]",l=o<r?"bg-[#35546c]":"bg-[#dbe4ee]";return e.jsxs("div",{className:"flex flex-1 items-center gap-1 last:flex-none",title:ee[s],children:[e.jsx("span",{className:`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-white ${m}`}),o<L.length-1?e.jsx("span",{className:`h-0.5 flex-1 rounded-full ${l}`}):null]},s)})})}function xt({stageRows:t,bottleneckKey:r}){const s=t.reduce((o,a)=>o+a.count,0);return e.jsxs("section",{className:ye,children:[e.jsxs("div",{className:"flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:"Pipeline Overview"}),e.jsx("p",{className:"mt-2 text-sm leading-6 text-[#6b7d93]",children:"See where active deals are sitting and which stage is absorbing the most volume."})]}),e.jsxs("span",{className:"inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-[#f7f9fc] px-3 py-1 text-xs font-semibold text-[#5c738d] ring-1 ring-[#dde4ee]",children:[s," active deals in pipeline"]})]}),e.jsxs("div",{className:"mt-6 rounded-[18px] bg-[#f8fafc] p-5 ring-1 ring-[#e6edf5]",children:[e.jsx("div",{className:"flex h-4 overflow-hidden rounded-full bg-[#e6edf3]",children:t.map((o,a)=>{const m=s?Math.max(o.count/s*100,o.count?6:0):0,l=o.key===r;return e.jsx("span",{className:"block h-full",style:{width:`${m}%`,backgroundColor:l?"#d6a94d":`rgba(53, 84, 108, ${Math.max(.22,.92-a*.12)})`},title:`${o.label}: ${o.count}`},o.key)})}),e.jsx("div",{className:"mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5",children:t.map(o=>{const a=o.key===r;return e.jsxs("div",{className:`rounded-[16px] px-3.5 py-3.5 ring-1 ${a?"bg-[#fff8ed] ring-[#f3d7a8]":"bg-white ring-[#e5ebf3]"}`,children:[e.jsxs("div",{className:"flex items-start justify-between gap-3",children:[e.jsx("span",{className:"text-[0.84rem] font-semibold leading-5 text-[#142132]",children:o.label}),e.jsx("strong",{className:`shrink-0 text-base font-semibold ${a?"text-[#9a5b0f]":"text-[#35546c]"}`,children:o.count})]}),e.jsxs("p",{className:"mt-2 text-[0.8rem] leading-5 text-[#6b7d93]",children:[s?k(o.count/s*100):"0%"," of active pipeline"]})]},o.key)})})]})]})}function ut({rows:t,onOpen:r}){return e.jsxs("section",{className:ye,children:[e.jsxs("div",{className:"flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:"Active Transactions"}),e.jsx("p",{className:"mt-2 text-sm leading-6 text-[#6b7d93]",children:"Detailed operational view with stage progress, last touchpoint, and next action."})]}),e.jsxs("span",{className:"inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-[#f7f9fc] px-3 py-1 text-xs font-semibold text-[#5c738d] ring-1 ring-[#dde4ee]",children:[t.length," active rows"]})]}),e.jsxs("div",{className:"mt-6 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]",children:[e.jsx("div",{className:"xl:hidden divide-y divide-[#edf2f7]",children:t.length?t.map(s=>e.jsxs("button",{type:"button",className:"flex w-full flex-col gap-4 px-4 py-4 text-left transition duration-150 ease-out hover:bg-[#f8fafc]",onClick:()=>r(s),children:[e.jsxs("div",{className:"flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsx("strong",{className:"block text-sm font-semibold text-[#142132]",children:s.development?.name||"Unknown development"}),e.jsxs("p",{className:"mt-1 text-sm text-[#6b7d93]",children:["Unit ",s.unit?.unit_number," • ",s.buyer?.name||"No buyer linked"]})]}),e.jsx("span",{className:`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${Te(s.report?.riskStatus||"On Track")}`,children:s.stage})]}),e.jsx("div",{className:"min-w-0",children:e.jsx(Ce,{row:s})}),e.jsxs("div",{className:"grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end",children:[e.jsxs("div",{children:[e.jsx("span",{className:"block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Status"}),e.jsx("p",{className:"mt-1 text-sm leading-6 text-[#51657b]",children:Re(fe(s)||s.transaction?.next_action||s.report?.workflowComment||"-",110)})]}),e.jsxs("div",{className:"flex items-center justify-between gap-3 sm:flex-col sm:items-end",children:[e.jsxs("div",{className:"text-sm text-[#142132]",children:[e.jsx("div",{children:_e(V(s))}),e.jsx("div",{className:"mt-1 text-xs text-[#8aa0b8]",children:je(V(s))})]}),e.jsxs("span",{className:"inline-flex items-center gap-2 rounded-[12px] bg-[#f7f9fc] px-3 py-2 text-sm font-semibold text-[#35546c] ring-1 ring-[#dde4ee]",children:["View",e.jsx(ke,{size:14})]})]})]})]},s.unit.id)):e.jsx("div",{className:"px-4 py-10 text-center text-sm text-[#6b7d93]",children:"No active transactions for the selected filters."})}),e.jsx("div",{className:"hidden overflow-x-auto rounded-[18px] border border-[#e5edf5] bg-white xl:block",children:e.jsxs("table",{className:"min-w-[1480px] text-left",children:[e.jsx("thead",{children:e.jsxs("tr",{className:"border-b border-[#edf2f7] text-xs uppercase tracking-[0.08em] text-[#7b8ca2]",children:[e.jsx("th",{className:"min-w-[250px] px-6 py-5 font-semibold",children:"Property / Unit"}),e.jsx("th",{className:"min-w-[180px] px-6 py-5 font-semibold",children:"Buyer"}),e.jsx("th",{className:"min-w-[150px] px-6 py-5 font-semibold",children:"Stage"}),e.jsx("th",{className:"min-w-[250px] px-6 py-5 font-semibold",children:"Progress"}),e.jsx("th",{className:"min-w-[320px] px-6 py-5 font-semibold",children:"Status"}),e.jsx("th",{className:"min-w-[130px] px-6 py-5 font-semibold",children:"Last Updated"}),e.jsx("th",{className:"min-w-[120px] px-6 py-5 font-semibold",children:"Action"})]})}),e.jsxs("tbody",{children:[t.map(s=>e.jsxs("tr",{className:"cursor-pointer border-b border-[#f1f5f9] transition duration-150 ease-out hover:bg-[#f8fafc]",onClick:()=>r(s),children:[e.jsx("td",{className:"px-6 py-5 align-top",children:e.jsxs("div",{children:[e.jsx("strong",{className:"text-sm font-semibold text-[#142132]",children:s.development?.name||"Unknown development"}),e.jsxs("p",{className:"mt-1 text-sm text-[#6b7d93]",children:["Unit ",s.unit?.unit_number]})]})}),e.jsx("td",{className:"px-6 py-5 align-top text-sm text-[#142132]",children:s.buyer?.name||"No buyer linked"}),e.jsx("td",{className:"px-6 py-5 align-top",children:e.jsx("span",{className:`inline-flex whitespace-nowrap items-center rounded-full border px-3 py-1 text-xs font-semibold ${Te(s.report?.riskStatus||"On Track")}`,children:s.stage})}),e.jsx("td",{className:"px-6 py-5 align-top",children:e.jsx(Ce,{row:s})}),e.jsx("td",{className:"px-6 py-5 align-top text-sm leading-6 text-[#51657b]",children:Re(fe(s)||s.transaction?.next_action||s.report?.workflowComment||"-",96)}),e.jsxs("td",{className:"px-6 py-5 align-top",children:[e.jsx("div",{className:"text-sm text-[#142132]",children:_e(V(s))}),e.jsx("div",{className:"mt-1 text-xs text-[#8aa0b8]",children:je(V(s))})]}),e.jsx("td",{className:"px-6 py-5 align-top",children:e.jsxs("button",{type:"button",className:"inline-flex items-center gap-2 rounded-[12px] bg-[#f7f9fc] px-3 py-2 text-sm font-semibold text-[#35546c] ring-1 ring-[#dde4ee] transition duration-150 ease-out hover:bg-white",onClick:o=>{o.stopPropagation(),r(s)},children:["View",e.jsx(ke,{size:14})]})})]},s.unit.id)),t.length?null:e.jsx("tr",{children:e.jsx("td",{colSpan:7,className:"px-6 py-10 text-center text-sm text-[#6b7d93]",children:"No active transactions for the selected filters."})})]})]})})]})]})}function ht({funnelRows:t,financeMix:r,financeDonut:s,totalRows:o}){const a=r.reduce((x,P)=>x+(Number(P.value)||0),0),m=Math.round(r.find(x=>x.key==="cash")?.share||0),l=Math.round(r.find(x=>x.key==="bond")?.share||0),v=r.find(x=>x.key==="combination")?.count||0,S=o?a/o:0;return e.jsxs("section",{className:"grid items-stretch gap-4 xl:grid-cols-2",children:[e.jsxs("article",{className:"flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]",children:[e.jsxs("div",{className:"mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsx("h4",{className:"text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:"Transaction Funnel"}),e.jsx("p",{className:"mt-2 text-[0.96rem] leading-7 text-[#6b7d93]",children:"Track deal compression through the operating stages so drop-off becomes visible before revenue slips."})]}),e.jsxs("span",{className:"inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]",children:[e.jsx(Ie,{size:12}),o," tracked rows"]})]}),e.jsx("div",{className:"flex flex-1 flex-col divide-y divide-[#edf2f7]",children:t.map(x=>e.jsxs("div",{className:"grid gap-3 py-4 md:grid-cols-[170px_minmax(0,1fr)_96px] md:items-center",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsx("div",{className:"text-[0.98rem] font-medium tracking-[-0.02em] text-[#23384d]",children:x.label}),e.jsxs("p",{className:"mt-1 text-[0.88rem] text-[#6b7d93]",children:[x.count," deals • ",k(x.share)," of total"]})]}),e.jsx("div",{className:"h-3 w-full rounded-full bg-[#e7eef6]","aria-hidden":!0,children:e.jsx("span",{className:"block h-full rounded-full bg-[#5c82a3]",style:{width:`${Math.max(x.share,x.count?3:0)}%`}})}),e.jsxs("div",{className:"flex flex-col items-end text-right",children:[e.jsxs("div",{className:"flex items-baseline gap-2 leading-none",children:[e.jsx("strong",{className:"text-[0.98rem] font-semibold text-[#142132]",children:x.count}),e.jsx("em",{className:"text-[0.78rem] not-italic font-medium text-[#6b7d93]",children:k(x.share)})]}),e.jsx("small",{className:"mt-1 text-[0.74rem] leading-none text-[#8da0b5]",children:x.dropOff>0?`${k(x.dropOff)} drop`:"No drop"})]})]},x.stageKey))})]}),e.jsxs("article",{className:"flex h-full flex-col rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]",children:[e.jsxs("div",{className:"mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsx("h4",{className:"text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:"Cash vs Bond"}),e.jsx("p",{className:"mt-1.5 text-[0.88rem] leading-5 text-[#6b7d93]",children:"Read the portfolio funding mix at a glance to understand where cash exposure and bank-dependency are building."})]}),e.jsxs("span",{className:"inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]",children:[e.jsx(Ze,{size:12}),o," active deals"]})]}),e.jsxs("div",{className:"grid gap-4 lg:grid-cols-[152px_minmax(0,1fr)] lg:items-center",children:[e.jsxs("div",{className:"relative mx-auto h-[152px] w-[152px] rounded-full",style:{background:s},"aria-hidden":"true",children:[e.jsx("div",{className:"absolute inset-[30px] rounded-full bg-white"}),e.jsxs("div",{className:"absolute inset-0 flex flex-col items-center justify-center",children:[e.jsx("strong",{className:"text-[1.55rem] font-semibold tracking-[-0.04em] text-[#142132]",children:o}),e.jsx("span",{className:"mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]",children:"Active"})]})]}),e.jsx("ul",{className:"grid gap-2",children:r.map(x=>e.jsxs("li",{className:"grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-3.5 py-2",children:[e.jsx("span",{className:"h-3 w-3 rounded-full",style:{background:x.color}}),e.jsxs("div",{className:"min-w-0",children:[e.jsx("strong",{className:"block text-[0.9rem] font-semibold text-[#142132]",children:x.label}),e.jsx("small",{className:"block text-[0.78rem] text-[#7c8ea4]",children:_(x.value||0)})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("em",{className:"block text-[0.94rem] not-italic font-semibold text-[#35546c]",children:x.count}),e.jsx("small",{className:"block text-[0.76rem] text-[#8aa0b8]",children:k(x.share)})]})]},x.key))})]}),e.jsxs("section",{className:"mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-3.5",children:[e.jsxs("div",{className:"mb-2.5",children:[e.jsx("strong",{className:"block text-[0.92rem] font-semibold text-[#142132]",children:"Finance Snapshot"}),e.jsx("span",{className:"text-[0.78rem] text-[#7c8ea4]",children:"Current funding mix at a glance"})]}),e.jsxs("div",{className:"grid gap-2.5 sm:grid-cols-2",children:[e.jsxs("article",{className:"rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3",children:[e.jsx("span",{className:"block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Cash Share"}),e.jsxs("strong",{className:"mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:[m,"%"]})]}),e.jsxs("article",{className:"rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3",children:[e.jsx("span",{className:"block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Bond Share"}),e.jsxs("strong",{className:"mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:[l,"%"]})]}),e.jsxs("article",{className:"rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3",children:[e.jsx("span",{className:"block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Hybrid Deals"}),e.jsx("strong",{className:"mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:v})]}),e.jsxs("article",{className:"rounded-[16px] border border-[#e3ebf4] bg-white px-3.5 py-3",children:[e.jsx("span",{className:"block text-[0.76rem] uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Avg Deal Value"}),e.jsx("strong",{className:"mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]",children:_(S||0)})]})]})]})]})]})}function ft({reportType:t,reportTypeLabel:r,title:s,transactionScopeLabel:o,generatedAt:a,summary:m,rows:l,marketingSummary:v,onReportTypeChange:S,filtersPanel:x=null}){const P=ze(),N=f.useMemo(()=>l.filter(T=>!["AVAIL","REG"].includes(w(T))),[l]),g=f.useMemo(()=>{const T=new Date,G=new Date(T.getFullYear(),T.getMonth(),1),F=10,D=l.filter(i=>w(i)==="REG"),Z=D.filter(i=>{const p=ie(i);return p?new Date(p)>=G:!1}).length,d=N.filter(i=>be(V(i))>=F),j=D.map(Ae).filter(i=>Number.isFinite(i)),A=j.length?Math.round(j.reduce((i,p)=>i+p,0)/j.length):0,q=l.length?(l.length-l.filter(i=>w(i)==="AVAIL").length)/l.length*100:0,te=N.reduce((i,p)=>i+(Number(Q(p))||0),0),X=L.filter(i=>!["AVAIL","REG"].includes(i)).map(i=>({key:i,label:ee[i],count:N.filter(p=>w(p)===i).length})),M=[...X].sort((i,p)=>p.count-i.count)[0]?.key||"",oe=l.map(i=>{const p=be(V(i)),u=Number(i?.checklistSummary?.missingCount||0);return String(i?.report?.riskStatus||"").toLowerCase().includes("blocked")?{row:i,severity:3,kind:"risk",message:`Blocked stage with ${u} missing documents.`}:p>=F?{row:i,severity:2,kind:"stale",message:`No update for ${p} days.`}:u>0&&w(i)!=="AVAIL"?{row:i,severity:1,kind:"docs",message:`${u} required documents still missing.`}:null}).filter(Boolean).sort((i,p)=>p.severity-i.severity).slice(0,6),H=new Map,K=new Map;l.forEach(i=>{const p=i?.development?.name||"Unknown development",u=H.get(p)||{label:p,value:0,revenue:0};u.value+=1,u.revenue+=Number(Q(i))||0,H.set(p,u),[i?.transaction?.agent,i?.transaction?.attorney,i?.transaction?.bond_originator].filter(Boolean).forEach(y=>{const b=K.get(y)||{label:y,value:0};b.value+=1,K.set(y,b)})});const le=[...H.values()].sort((i,p)=>p.value-i.value).slice(0,5),ce=[...K.values()].sort((i,p)=>p.value-i.value).slice(0,5),de=L.map((i,p)=>{const u=l.filter(R=>w(R)===i).length,h=l.length?u/l.length*100:0,y=p>0?l.filter(R=>w(R)===L[p-1]).length:u,b=p>0&&y?(y-u)/y*100:0;return{stageKey:i,label:ee[i],count:u,share:h,dropOff:b}}),re=[{key:"cash",label:"Cash",count:0,value:0,color:U.cash},{key:"bond",label:"Bond",count:0,value:0,color:U.bond},{key:"combination",label:"Combination",count:0,value:0,color:U.combination},{key:"unknown",label:"Unknown",count:0,value:0,color:U.unknown}];l.forEach(i=>{const p=Fe(i?.transaction?.finance_type),u=re.find(h=>h.key===p);u&&(u.count+=1,u.value+=Number(Q(i))||0)});const se=re.map(i=>({...i,share:l.length?i.count/l.length*100:0})),pe=Oe(se),W=Array.from({length:6},(i,p)=>{const u=new Date(T.getFullYear(),T.getMonth()-(5-p),1),h=new Date(u.getFullYear(),u.getMonth()+1,1),y=D.filter(b=>{const R=ie(b);if(!R)return!1;const I=new Date(R);return I>=u&&I<h}).length;return{label:u.toLocaleDateString("en-ZA",{month:"short"}),value:y}}),n=Array.from({length:6},(i,p)=>{const u=new Date(T.getFullYear(),T.getMonth()-(5-p),1),h=new Date(u.getFullYear(),u.getMonth()+1,1),b=D.filter(R=>{const I=ie(R);if(!I)return!1;const J=new Date(I);return J>=u&&J<h}).map(Ae).filter(R=>Number.isFinite(R));return{label:u.toLocaleDateString("en-ZA",{month:"short"}),value:b.length?Math.round(b.reduce((R,I)=>R+I,0)/b.length):0}}),c=l.reduce((i,p)=>i+Number(p?.checklistSummary?.totalRequired||0),0),E=l.reduce((i,p)=>i+Number(p?.checklistSummary?.uploadedCount||0),0),O=l.reduce((i,p)=>i+Number(p?.checklistSummary?.missingCount||0),0),C=new Map;l.forEach(i=>{(i?.requiredChecklist||[]).forEach(p=>{if(!p.complete){const u=C.get(p.label)||0;C.set(p.label,u+1)}})});const $=[...C.entries()].map(([i,p])=>({label:i,count:p})).sort((i,p)=>p.count-i.count).slice(0,5);return{completedMtd:Z,stuckRows:d,avgTimeToClose:A,conversionRate:q,pipelineValue:te,activeStageRows:X,bottleneck:M,attentionRows:oe,funnelRows:de,financeMix:se,financeDonut:pe,developmentRows:le,ownerRows:ce,closedSeries:W,cycleSeries:n,documentInsights:{completionRate:c?E/c*100:0,averageMissing:l.length?O/l.length:0,topMissing:$}}},[N,l]);function B(T){P(`/units/${T.unit.id}`)}return e.jsxs("section",{className:"space-y-6",children:[e.jsxs("section",{className:"report-export-shell investor-print-book hidden print:block",children:[e.jsx(ot,{title:s,transactionScopeLabel:o,generatedAt:a,summary:m,rows:l,marketingSummary:v}),e.jsx(dt,{rows:N,generatedAt:a,title:s,transactionScopeLabel:o})]}),e.jsxs("div",{className:"space-y-5 print:hidden",children:[e.jsxs("section",{className:"grid gap-4 md:grid-cols-2 xl:grid-cols-6",children:[e.jsx(Y,{label:"Active Transactions",value:xe(N.length)}),e.jsx(Y,{label:"Completed (MTD)",value:xe(g.completedMtd),tone:"success"}),e.jsx(Y,{label:"Deals Stuck",value:xe(g.stuckRows.length),tone:g.stuckRows.length?"warning":"default"}),e.jsx(Y,{label:"Avg Time to Close",value:`${g.avgTimeToClose||0}d`}),e.jsx(Y,{label:"Conversion Rate",value:k(g.conversionRate)}),e.jsx(Y,{label:"Pipeline Value",value:_(g.pipelineValue)})]}),e.jsxs("section",{className:"space-y-5",children:[e.jsxs("div",{className:"flex flex-col gap-3 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] md:flex-row md:items-center md:justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#7b8ca2]",children:"Report Mode"}),e.jsx("h3",{className:"mt-1 text-lg font-semibold tracking-[-0.025em] text-[#142132]",children:r})]}),e.jsx(mt,{reportType:t,onChange:S})]}),x,e.jsx(xt,{stageRows:g.activeStageRows,bottleneckKey:g.bottleneck}),e.jsx(ht,{funnelRows:g.funnelRows,financeMix:g.financeMix,financeDonut:g.financeDonut,totalRows:l.length}),e.jsx(ut,{rows:N,onOpen:B}),e.jsx(it,{marketingSummary:v})]})]}),e.jsx("footer",{className:"text-center text-sm text-[#7b8ca2] print:hidden",children:"Generated by Arch9 Sales Platform"})]})}const ve=[{value:"overview",label:"Overview"},{value:"unit_view",label:"Unit View"},{value:"performance",label:"Performance"}],Pe=[{value:"all_transactions",label:"All Transactions"},{value:"active_transactions",label:"Active Transactions"},{value:"in_transfer",label:"In Transfer"},{value:"registered",label:"Registered"},{value:"attention_needed",label:"Delayed / Attention Needed"}],gt=[{value:"all",label:"All Finance Types"},{value:"cash",label:"Cash"},{value:"bond",label:"Bond"},{value:"combination",label:"Combination"}],bt=[{value:"all",label:"All Stages"},...Ve.map(t=>({value:t,label:t}))],jt=[{value:"all",label:"All Risk Statuses"},...et.map(t=>({value:t,label:t}))],Me={property24:1250,website:420,show_day:280,referral:180,walk_in:240,facebook:560,other:320,unknown:250},vt=`
  @page {
    size: A4 portrait;
    margin: 12mm;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #eef3f8;
    color: #0f172a;
    font-family: Inter, "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  body.report-export-window {
    padding: 28px;
  }

  .report-export-shell {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    display: grid;
    gap: 18px;
  }

  .investor-print-page {
    display: grid !important;
    grid-template-rows: auto 1fr auto;
    gap: 20px;
    min-height: 254mm;
    padding: 18mm 16mm 14mm;
    border: 1px solid #dce3ee;
    border-radius: 24px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report-page-one {
    break-after: page;
    page-break-after: always;
  }

  .report-doc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 18px;
    border-bottom: 1px solid #e8eef5;
  }

  .report-doc-eyebrow {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #64748b;
  }

  .report-doc-head h1 {
    margin: 0;
    font-size: 30px;
    line-height: 0.98;
    letter-spacing: -0.045em;
    color: #102033;
  }

  .report-doc-subtitle {
    margin: 10px 0 0;
    font-size: 14px;
    color: #5d7085;
  }

  .report-doc-head-meta {
    min-width: 180px;
    display: grid;
    gap: 6px;
    text-align: right;
  }

  .report-doc-head-meta span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7b8ca2;
  }

  .report-doc-head-meta strong {
    font-size: 14px;
    color: #102033;
  }

  .report-doc-body {
    display: grid;
    gap: 18px;
    align-content: start;
  }

  .report-doc-body-table {
    gap: 0;
  }

  .report-doc-kpis {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .report-doc-kpis article,
  .report-doc-card {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report-doc-kpis article {
    padding: 16px 18px;
    border: 1px solid #dce3ee;
    border-radius: 18px;
    background: #fbfdff;
  }

  .report-doc-kpis span,
  .report-doc-card > header span,
  .report-doc-mini-kpis span {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7b8ca2;
  }

  .report-doc-kpis strong {
    display: block;
    margin-top: 12px;
    font-size: 22px;
    line-height: 1.05;
    color: #102033;
  }

  .report-doc-grid {
    display: grid;
    gap: 16px;
    align-items: start;
  }

  .report-doc-grid-primary,
  .report-doc-grid-secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-doc-card {
    padding: 18px 20px;
    border: 1px solid #dce3ee;
    border-radius: 20px;
    background: #ffffff;
  }

  .report-doc-card > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .report-doc-card > header h3 {
    margin: 0;
    font-size: 18px;
    line-height: 1.15;
    color: #102033;
  }

  .report-doc-mini-kpis {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .report-doc-mini-kpis div {
    padding: 14px;
    border: 1px solid #e6edf5;
    border-radius: 14px;
    background: #fbfdff;
  }

  .report-doc-mini-kpis strong {
    display: block;
    margin-top: 8px;
    font-size: 18px;
    line-height: 1.1;
    color: #102033;
  }

  .report-doc-source-list,
  .report-doc-stage-list,
  .report-doc-finance-list {
    display: grid;
    gap: 12px;
  }

  .report-doc-source-row,
  .report-doc-finance-row {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid #e6edf5;
    border-radius: 14px;
    background: #fbfdff;
  }

  .report-doc-source-row > div,
  .report-doc-finance-row > div {
    display: grid;
    gap: 4px;
    align-content: start;
  }

  .report-doc-source-row strong,
  .report-doc-finance-row strong,
  .report-doc-stage-row strong {
    display: block;
    margin: 0;
    font-size: 14px;
    color: #102033;
  }

  .report-doc-source-row span,
  .report-doc-finance-row span,
  .report-doc-stage-row span,
  .report-doc-empty,
  .report-doc-table td span {
    font-size: 13px;
    line-height: 1.45;
    color: #5d7085;
  }

  .report-doc-source-bar,
  .report-doc-stage-row .track {
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    background: #e7edf5;
  }

  .report-doc-source-bar em,
  .report-doc-stage-row .track em {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #35566f 0%, #6f90ab 100%);
  }

  .report-doc-mix {
    display: grid;
    grid-template-columns: 124px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
  }

  .report-doc-donut {
    position: relative;
    width: 108px;
    height: 108px;
    border-radius: 999px;
    margin: 0 auto;
  }

  .report-doc-donut > div {
    position: absolute;
    inset: 24px;
    border-radius: 999px;
    background: #ffffff;
  }

  .report-doc-finance-row {
    grid-template-columns: 10px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: flex-start;
  }

  .report-doc-finance-row .swatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
  }

  .report-doc-finance-row em {
    font-style: normal;
    font-size: 13px;
    font-weight: 700;
    color: #243b53;
    align-self: center;
  }

  .report-doc-stage-row {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr) 36px;
    gap: 12px;
    align-items: center;
  }

  .report-doc-stage-row strong {
    text-align: right;
  }

  .report-doc-mini-table,
  .report-doc-table {
    width: 100%;
    border-collapse: collapse;
  }

  .report-doc-mini-table th,
  .report-doc-mini-table td,
  .report-doc-table th,
  .report-doc-table td {
    padding: 12px 10px;
    border-bottom: 1px solid #e8eef5;
    text-align: left;
    vertical-align: top;
  }

  .report-doc-mini-table th,
  .report-doc-table th {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7b8ca2;
  }

  .report-doc-mini-table td,
  .report-doc-table td {
    font-size: 13px;
    line-height: 1.45;
    color: #102033;
  }

  .report-doc-card-table {
    padding: 18px 20px 10px;
  }

  .report-doc-table td strong {
    display: block;
    margin-bottom: 4px;
  }

  .report-doc-table td.comment-cell {
    color: #425466;
  }

  .report-doc-progress {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .report-doc-progress-node {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
  }

  .report-doc-progress-node:last-child {
    flex: 0 0 auto;
  }

  .report-doc-progress-node .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    border: 1px solid #c7d4e3;
    background: #ffffff;
    position: relative;
    z-index: 1;
  }

  .report-doc-progress-node .line {
    height: 2px;
    flex: 1 1 auto;
    margin: 0 3px;
    background: #dbe4ee;
  }

  .report-doc-progress-node.complete .dot,
  .report-doc-progress-node.complete .line {
    background: #35546c;
    border-color: #35546c;
  }

  .report-doc-progress-node.current .dot {
    width: 10px;
    height: 10px;
    background: #1f425c;
    border-color: #1f425c;
    box-shadow: 0 0 0 3px rgba(31, 66, 92, 0.14);
  }

  .report-doc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid #e8eef5;
    font-size: 11px;
    color: #6b7d93;
  }

  @media print {
    html, body {
      background: #ffffff;
    }

    body.report-export-window {
      padding: 0;
    }

    .report-export-shell {
      max-width: none;
      gap: 0;
    }

    .investor-print-page {
      min-height: auto;
      padding: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .report-page-one {
      gap: 12px;
    }

    .report-page-one .report-doc-head {
      gap: 12px;
      padding-bottom: 12px;
    }

    .report-doc-head h1 {
      font-size: 23px;
    }

    .report-page-one .report-doc-subtitle {
      margin-top: 6px;
      font-size: 12px;
    }

    .report-page-one .report-doc-head-meta {
      gap: 4px;
    }

    .report-page-one .report-doc-body {
      gap: 12px;
    }

    .report-page-one .report-doc-kpis {
      gap: 8px;
    }

    .report-page-one .report-doc-kpis article {
      padding: 10px 12px;
      border-radius: 14px;
    }

    .report-page-one .report-doc-kpis strong {
      margin-top: 8px;
      font-size: 18px;
    }

    .report-page-one .report-doc-grid {
      gap: 10px;
    }

    .report-page-one .report-doc-card {
      padding: 12px 14px;
      border-radius: 16px;
    }

    .report-page-one .report-doc-card > header {
      margin-bottom: 10px;
    }

    .report-page-one .report-doc-card > header h3 {
      font-size: 16px;
    }

    .report-page-one .report-doc-mini-kpis {
      gap: 8px;
      margin-bottom: 10px;
    }

    .report-page-one .report-doc-mini-kpis div {
      padding: 10px;
      border-radius: 12px;
    }

    .report-page-one .report-doc-mini-kpis strong {
      font-size: 16px;
      margin-top: 6px;
    }

    .report-page-one .report-doc-source-list,
    .report-page-one .report-doc-stage-list,
    .report-page-one .report-doc-finance-list {
      gap: 8px;
    }

    .report-page-one .report-doc-source-row,
    .report-page-one .report-doc-finance-row {
      padding: 10px;
      gap: 6px;
      border-radius: 12px;
    }

    .report-page-one .report-doc-source-row strong,
    .report-page-one .report-doc-finance-row strong,
    .report-page-one .report-doc-stage-row strong {
      font-size: 12px;
    }

    .report-page-one .report-doc-source-row span,
    .report-page-one .report-doc-finance-row span,
    .report-page-one .report-doc-stage-row span,
    .report-page-one .report-doc-empty,
    .report-page-one .report-doc-table td span {
      font-size: 11px;
      line-height: 1.35;
    }

    .report-page-one .report-doc-mix {
      grid-template-columns: 88px minmax(0, 1fr);
      gap: 10px;
    }

    .report-page-one .report-doc-donut {
      width: 80px;
      height: 80px;
    }

    .report-page-one .report-doc-donut > div {
      inset: 18px;
    }

    .report-page-one .report-doc-stage-row {
      grid-template-columns: 112px minmax(0, 1fr) 26px;
      gap: 8px;
    }

    .report-page-one .report-doc-mini-table th,
    .report-page-one .report-doc-mini-table td {
      padding: 8px 6px;
      font-size: 10px;
    }

    .report-page-one .report-doc-foot {
      padding-top: 10px;
      font-size: 10px;
    }

    .report-doc-card,
    .report-doc-kpis article {
      box-shadow: none;
    }
  }
`;function Nt(t){return String(t).trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||"unknown"}function yt(t){const r=String(t).trim();return r?r.replace(/[_-]+/g," ").replace(/\s+/g," ").replace(/\b\w/g,s=>s.toUpperCase()):"Unknown"}function De(t){const r=t.transaction?.sales_price??t.report?.purchasePrice??t.unit?.price,s=Number(r);return Number.isFinite(s)?s:0}function ue(t){const r=Number(t);return Number.isFinite(r)?new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",maximumFractionDigits:0}).format(r).replace("ZAR","R"):"R0"}function Ee(t){const r=String(t?.get("view")||"").trim().toLowerCase();return ve.some(s=>s.value===r)?r:"overview"}function wt({tracker:t={},draft:r,setDraft:s,saving:o,error:a,message:m,onSave:l}){const v=Number(t?.targetAmount||r.targetAmount||0),S=Number(t?.projectedCommission||t?.currentAmount||0),x=Math.max(0,v-S),P=v?Math.min(100,Math.round(S/v*100)):Number(t?.projectedPercentage||0);return e.jsxs("section",{className:"rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]",children:[e.jsxs("div",{className:"mb-5 flex flex-col gap-4 border-b border-[#edf2f7] pb-5 xl:flex-row xl:items-end xl:justify-between",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]",children:"Performance Targets"}),e.jsx("p",{className:"mt-2 text-sm leading-6 text-[#6b7d93]",children:"Manage agency targets across performance reporting. Commission is one KPI in the wider operating picture."})]}),e.jsxs("span",{className:"inline-flex w-fit items-center gap-2 rounded-full border border-[#d8f0de] bg-[#edfdf3] px-3 py-1.5 text-xs font-semibold text-[#1e7a46]",children:[e.jsx(Ie,{size:14}),P||0,"% forecast"]})]}),a?e.jsx("p",{className:"mb-4 rounded-[14px] border border-[#f3d2cc] bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]",children:a}):null,m?e.jsx("p",{className:"mb-4 rounded-[14px] border border-[#cfe8dc] bg-[#edf8f2] px-4 py-3 text-sm text-[#0f7f4f]",children:m}):null,e.jsxs("div",{className:"grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"grid gap-3 md:grid-cols-3",children:[e.jsx(he,{label:"Monthly Target",value:ue(v||5e5)}),e.jsx(he,{label:"Forecast",value:ue(S)}),e.jsx(he,{label:"Remaining",value:ue(x)})]}),e.jsx("div",{className:"mt-5 h-3 overflow-hidden rounded-full bg-[#dfe8f1]",children:e.jsx("span",{className:"block h-full rounded-full bg-[#1e7a46]",style:{width:`${Math.min(100,P||0)}%`}})}),e.jsxs("div",{className:"mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#60758d]",children:[e.jsxs("span",{children:[P||0,"% projected"]}),e.jsxs("span",{children:[t?.daysLeftInMonth??0," Days left"]})]})]}),e.jsxs("form",{className:"grid gap-4 rounded-[18px] border border-[#e4ecf5] bg-[#fbfdff] p-4",onSubmit:l,children:[e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Commission Target"}),e.jsx(z,{type:"number",min:"0",step:"1000",value:r.targetAmount,onChange:N=>s(g=>({...g,targetAmount:N.target.value}))})]}),e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Start Month"}),e.jsx(z,{type:"date",value:r.startMonth,onChange:N=>s(g=>({...g,startMonth:N.target.value}))})]}),e.jsxs(ge,{variant:"primary",type:"submit",disabled:o,children:[o?e.jsx(He,{size:15}):e.jsx(Ke,{size:15}),e.jsx("span",{children:o?"Saving...":"Save Target"})]})]})]})]})}function he({label:t,value:r}){return e.jsxs("article",{className:"rounded-[16px] border border-[#e4ecf5] bg-[#fbfdff] p-4",children:[e.jsx("p",{className:"text-xs font-bold uppercase tracking-[0.1em] text-[#7b8fa5]",children:t}),e.jsx("p",{className:"mt-2 text-lg font-semibold text-[#142132]",children:r})]})}function $r(){const{workspace:t}=We(),[r]=$e(),[s,o]=f.useState([]),[a,m]=f.useState({reportType:Ee(r),developmentId:t.id==="all"?"all":t.id,transactionScope:"all_transactions",financeType:"all",stage:"all",riskStatus:"all",marketingSpend:""}),[l,v]=f.useState([]),[S,x]=f.useState(""),[P,N]=f.useState(!0),[g,B]=f.useState(""),[T,G]=f.useState(null),[F,D]=f.useState({targetAmount:5e5,startMonth:new Date().toISOString().slice(0,7)+"-01"}),[Z,d]=f.useState(!1),[j,A]=f.useState(""),[q,te]=f.useState(""),X=f.useCallback(async()=>{if(!me){N(!1);return}try{B(""),N(!0);const n=await tt().catch(()=>null),c=String(n?.organisation?.id||"").trim(),[E,O,C]=await Promise.all([Je({developmentId:a.developmentId==="all"?null:a.developmentId,organisationId:c||null}),Qe({organisationId:c||null}),Se().catch(()=>null)]);v(E),o(O),G(C),C?.companyTracker&&D({targetAmount:C.companyTracker.targetAmount||5e5,startMonth:new Date().toISOString().slice(0,7)+"-01"}),a.developmentId!=="all"&&!O.some($=>$.id===a.developmentId)&&m($=>({...$,developmentId:"all"})),x(new Date().toLocaleString())}catch(n){B(n.message)}finally{N(!1)}},[a.developmentId]);f.useEffect(()=>{X()},[X]),f.useEffect(()=>{m(n=>({...n,developmentId:t.id==="all"?n.developmentId:t.id}))},[t.id]),f.useEffect(()=>{const n=Ee(r);m(c=>c.reportType===n?c:{...c,reportType:n})},[r]),f.useEffect(()=>(document.body.classList.remove("report-export-active"),()=>{document.body.classList.remove("report-export-active")}),[]),f.useEffect(()=>{x(new Date().toLocaleString())},[a.reportType,a.developmentId,a.transactionScope,a.financeType,a.stage,a.riskStatus,a.marketingSpend]);const M=f.useMemo(()=>{let n=[...l];return a.transactionScope==="active_transactions"&&(n=n.filter(c=>c.stage!=="Registered"&&c.stage!=="Available")),a.transactionScope==="in_transfer"&&(n=n.filter(c=>we(c.stage))),a.transactionScope==="registered"&&(n=n.filter(c=>c.stage==="Registered")),a.transactionScope==="attention_needed"&&(n=n.filter(c=>["Delayed","Blocked"].includes(c.report?.riskStatus||""))),a.financeType!=="all"&&(n=n.filter(c=>Ye(c.transaction?.finance_type,a.financeType))),a.stage!=="all"&&(n=n.filter(c=>c.stage===a.stage)),a.riskStatus!=="all"&&(n=n.filter(c=>(c.report?.riskStatus||"On Track")===a.riskStatus)),n},[l,a.financeType,a.riskStatus,a.stage,a.transactionScope]),oe=f.useMemo(()=>({totalTransactions:M.length,inProgress:M.filter(n=>n.stage!=="Registered"&&n.stage!=="Available").length,inTransfer:M.filter(n=>we(n.stage)).length,registered:M.filter(n=>n.stage==="Registered").length,delayedAttention:M.filter(n=>["Delayed","Blocked"].includes(n.report?.riskStatus||"")).length,totalRevenue:M.reduce((n,c)=>n+De(c),0)}),[M]),H=f.useMemo(()=>{const n={};let c=0,E=0,O=0,C=0;for(const h of M){const y=h.transaction?.marketing_source||h.transaction?.lead_source||"Unknown",b=Nt(y),R=yt(y),I=De(h),J=h.stage==="Registered";c+=1,J&&(E+=1),O+=I,n[b]||(n[b]={key:b,label:R,leads:0,converted:0,revenue:0,estimatedSpend:0}),n[b].leads+=1,n[b].revenue+=I,J&&(n[b].converted+=1)}const $=Object.values(n).map(h=>{const b=(Me[h.key]??Me.other)*h.leads;return C+=b,{...h,estimatedSpend:b,leadShare:c?h.leads/c*100:0,conversionRate:h.leads?h.converted/h.leads*100:0}}).sort((h,y)=>y.leads-h.leads),i=Number(a.marketingSpend),p=Number.isFinite(i)&&i>0?i:null,u=p??C;return{totalLeads:c,totalConverted:E,conversionRate:c?E/c*100:0,attributedRevenue:O,estimatedSpend:C,actualSpend:p,spendUsed:u,costPerLead:c?u/c:0,costPerConversion:E?u/E:0,topSource:$[0]?.label||"Unknown",sourceRows:$}},[M,a.marketingSpend]),K=s.find(n=>n.id===a.developmentId),le=a.developmentId==="all"?"All Developments":K?.name||"Selected Development",ce=Pe.find(n=>n.value===a.transactionScope)?.label||"All Transactions",de=ve.find(n=>n.value===a.reportType)?.label||"Overview";function re(){const n=Array.from(document.querySelectorAll(".report-export-shell .investor-print-page"));if(!n.length){window.print();return}const c=window.open("","_blank","width=1280,height=900");if(!c){window.print();return}const E=n.map(C=>C.outerHTML).join(`
`),O=`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Arch9 Portfolio Report</title>
    <style>${vt}</style>
  </head>
  <body class="report-export-window">
    <div class="report-export-shell">
      ${E}
    </div>
    <script>
      const runPrint = () => {
        window.focus();
        setTimeout(() => window.print(), 180);
      };

      if (document.readyState === 'complete') {
        runPrint();
      } else {
        window.addEventListener('load', runPrint, { once: true });
      }

      window.addEventListener('afterprint', () => {
        window.close();
      }, { once: true });
    <\/script>
  </body>
</html>`;c.document.open(),c.document.write(O),c.document.close()}function se(){m(n=>({...n,developmentId:t.id==="all"?"all":t.id,transactionScope:"all_transactions",financeType:"all",stage:"all",riskStatus:"all",marketingSpend:""}))}async function pe(n){n.preventDefault();try{d(!0),A(""),te(""),await rt({targetType:"company",targetMetric:"company_commission",period:"monthly",targetAmount:Number(F.targetAmount||0),startMonth:F.startMonth||new Date().toISOString().slice(0,7)+"-01"});const c=await Se().catch(()=>null);G(c),te("Performance target updated.")}catch(c){A(c.message||"Unable to save performance target.")}finally{d(!1)}}const W=t.id==="all"&&s.length>1;return e.jsxs("section",{className:"space-y-5",children:[me?null:e.jsx("p",{className:"rounded-[18px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]",children:"Supabase is not configured for this workspace."}),g?e.jsx("p",{className:"rounded-[18px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]",children:g}):null,P?e.jsx(Ue,{lines:10,className:"rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"}):null,!P&&me?e.jsx(ft,{reportType:a.reportType,reportTypeLabel:de,title:le,transactionScopeLabel:ce,generatedAt:S||new Date().toLocaleString(),summary:oe,rows:M,marketingSummary:H,onReportTypeChange:n=>m(c=>({...c,reportType:n})),filtersPanel:e.jsxs(e.Fragment,{children:[a.reportType==="performance"?e.jsx(wt,{tracker:T?.companyTracker||{},draft:F,setDraft:D,saving:Z,error:j,message:q,onSave:pe}):null,e.jsxs("section",{className:"no-print rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]",children:[e.jsxs("div",{className:"mb-5 flex flex-col gap-4 border-b border-[#edf2f7] pb-5 xl:flex-row xl:items-end xl:justify-between",children:[e.jsxs("div",{children:[e.jsx("h4",{className:"text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]",children:"Report Filters"}),e.jsx("p",{className:"mt-2 text-sm leading-6 text-[#6b7d93]",children:W?"Refine the snapshot across developments, stage exposure, finance mix, and risk.":"Refine the snapshot by scope, stage exposure, finance mix, and risk."})]}),e.jsxs("div",{className:"flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center",children:[e.jsxs(ge,{variant:"ghost",className:"w-full sm:w-auto",onClick:se,children:[e.jsx(qe,{size:15}),e.jsx("span",{children:"Reset Filters"})]}),e.jsxs(ge,{variant:"primary",className:"w-full sm:w-auto",onClick:re,children:[e.jsx(Xe,{size:15}),e.jsx("span",{children:"Export PDF"})]})]})]}),e.jsxs("div",{className:`grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${W?"2xl:grid-cols-6":"2xl:grid-cols-5"}`,children:[e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Report"}),e.jsx(z,{as:"select",className:"bg-[#fbfdff]",value:a.reportType,onChange:n=>m(c=>({...c,reportType:n.target.value})),children:ve.map(n=>e.jsx("option",{value:n.value,children:n.label},n.value))})]}),W?e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Development"}),e.jsxs(z,{as:"select",className:"bg-[#fbfdff]",value:a.developmentId,onChange:n=>m(c=>({...c,developmentId:n.target.value})),children:[e.jsx("option",{value:"all",children:"All Developments"}),s.map(n=>e.jsx("option",{value:n.id,children:n.name},n.id))]})]}):null,e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Transaction Scope"}),e.jsx(z,{as:"select",className:"bg-[#fbfdff]",value:a.transactionScope,onChange:n=>m(c=>({...c,transactionScope:n.target.value})),children:Pe.map(n=>e.jsx("option",{value:n.value,children:n.label},n.value))})]}),e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Finance Type"}),e.jsx(z,{as:"select",className:"bg-[#fbfdff]",value:a.financeType,onChange:n=>m(c=>({...c,financeType:n.target.value})),children:gt.map(n=>e.jsx("option",{value:n.value,children:n.label},n.value))})]}),e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Current Stage"}),e.jsx(z,{as:"select",className:"bg-[#fbfdff]",value:a.stage,onChange:n=>m(c=>({...c,stage:n.target.value})),children:bt.map(n=>e.jsx("option",{value:n.value,children:n.label},n.value))})]}),e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Risk Status"}),e.jsx(z,{as:"select",className:"bg-[#fbfdff]",value:a.riskStatus,onChange:n=>m(c=>({...c,riskStatus:n.target.value})),children:jt.map(n=>e.jsx("option",{value:n.value,children:n.label},n.value))})]}),e.jsxs("label",{className:"grid gap-2",children:[e.jsx("span",{className:"text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]",children:"Marketing Spend"}),e.jsx(z,{className:"bg-[#fbfdff]",type:"number",min:"0",step:"100",value:a.marketingSpend,onChange:n=>m(c=>({...c,marketingSpend:n.target.value})),placeholder:"Optional spend"})]})]})]})]})}):null]})}export{$r as default};
