const Q="arch9-seller-terms-popi-v1";function q(){return{title:"Arch9 terms and conditions",body:"I accept the Arch9 terms and conditions applicable to this seller onboarding and transaction workflow.",popiBody:"I consent to Arch9, the appointed agency, and authorised transaction partners processing my personal information for onboarding, mandate, property disclosure, compliance, and transaction-administration purposes in line with POPI requirements.",checkboxLabel:"I accept the Arch9 terms and conditions",wordingVersion:Q,validationMessage:"Please accept the Arch9 terms and conditions before signing the declaration."}}function P(s){if(typeof s=="boolean")return s;const e=String(s??"").trim().toLowerCase();return["true","yes","y","1","on","accepted"].includes(e)}function w(s){return String(s??"").trim()}function pe(){const s=q(),e=new Date().toISOString();return{accepted:!0,acceptedAt:e,accepted_at:e,wordingVersion:s.wordingVersion,wording_version:s.wordingVersion,label:s.checkboxLabel,source:"seller_onboarding",popiConsentIncluded:!0,popi_consent_included:!0}}function R(s={}){const e=s?.arch9TermsAcceptance||s?.arch9_terms_acceptance||s?.propertyDisclosure?.arch9TermsAcceptance||s?.propertyDisclosure?.arch9_terms_acceptance||s?.property_disclosure?.arch9TermsAcceptance||s?.property_disclosure?.arch9_terms_acceptance||{},n=P(e.accepted??e.arch9TermsAccepted??e.arch9_terms_accepted??s?.arch9TermsAccepted??s?.arch9_terms_accepted??s?.propertyDisclosure?.arch9TermsAccepted??s?.propertyDisclosure?.arch9_terms_accepted??s?.property_disclosure?.arch9TermsAccepted??s?.property_disclosure?.arch9_terms_accepted),a=q();return{accepted:n,acceptedAt:w(e.acceptedAt||e.accepted_at||s?.arch9TermsAcceptedAt||s?.arch9_terms_accepted_at),accepted_at:w(e.accepted_at||e.acceptedAt||s?.arch9_terms_accepted_at||s?.arch9TermsAcceptedAt),wordingVersion:w(e.wordingVersion||e.wording_version)||a.wordingVersion,wording_version:w(e.wording_version||e.wordingVersion)||a.wordingVersion,label:w(e.label)||a.checkboxLabel,source:w(e.source)||"seller_onboarding",popiConsentIncluded:P(e.popiConsentIncluded??e.popi_consent_included??!0),popi_consent_included:P(e.popi_consent_included??e.popiConsentIncluded??!0)}}function T(s={}){return R(s).accepted===!0}const h=Object.freeze({none:"none",disclose:"disclose"}),t=Object.freeze({yes:"yes",no:"no",unsure:"unsure"}),b=Object.freeze({pendingSellerCompletion:"pending_seller_completion",pendingReview:"pending_review",reviewed:"reviewed",requiresClarification:"requires_clarification"}),k=Object.freeze([{key:"electrical_faults",number:1,text:"Are you aware of any electrical faults / problems regarding the electrical installation or appliances?",commentAnswers:[t.yes,t.unsure]},{key:"illegal_electrical_extensions",number:2,text:"Are there any illegal electrical extensions, or non-working points and has there been any disconnection or damage, to permanent fixtures / equipment? Eg stoves, oven, extractor fan, aircon, heaters, ceiling fans, light fixtures, water pumps etc...?",commentAnswers:[t.yes,t.unsure]},{key:"water_heater",number:3,text:"Are there any problems regarding the water heater for example: leaks, faulty gaskets, low pressure?",commentAnswers:[t.yes,t.unsure]},{key:"drainage_system",number:4,text:"Are there any problems with the drainage system e.g. clogged drainage pipes, drains, storm water drains or gutters?",commentAnswers:[t.yes,t.unsure]},{key:"leaking_taps_pipes",number:5,text:"Are there any leaking taps, pipes, burst pipes or water heating systems not working properly?",commentAnswers:[t.yes,t.unsure]},{key:"keys_to_all_doors",number:6,text:"Are there keys to all doors?",commentAnswers:[t.no,t.unsure]},{key:"remote_controls",number:7,text:"How many remote controls exist for electronic gates and garage doors?",extraLabel:"Provide quantity",commentAnswers:[t.unsure]},{key:"security_systems",number:8,text:"Are all security systems in good working order e.g. alarms, burglar bars and security gates?",commentAnswers:[t.no,t.unsure]},{key:"pool_equipment",number:9,text:"a) Is the pool pump, cleaning equipment and pipes in good working condition (general operation of equipment, pipes or filter, etc) b) Is there any damage to the fibreglass/marbelite and are there any cracks or loose tiles?",commentAnswers:[t.yes,t.no,t.unsure]},{key:"pool_repairs_six_months",number:10,text:"Were any repairs done to the items specified in 9 above, over the past six months?",commentAnswers:[t.yes,t.unsure]},{key:"rising_damp",number:11,text:"Is there any rising damp in walls in any of the rooms / buildings?",commentAnswers:[t.yes,t.unsure]},{key:"roof_leaks",number:12,text:"Are there any leaks in the roof?",commentAnswers:[t.yes,t.unsure]},{key:"sanitary_fittings",number:13,text:"Are there cracks, leaks or problems with bathtubs, sinks, toilets or showers?",commentAnswers:[t.yes,t.unsure]},{key:"tiles_floors",number:14,text:"Are there any cracked or broken tiles, damaged wooden floors?",commentAnswers:[t.yes,t.unsure]},{key:"structural_defects",number:15,text:"Are there any structural defects which you are aware of for example, cracks in walls or erosion etc?",commentAnswers:[t.yes,t.unsure]},{key:"carpet_damage",number:16,text:"Is there any damage to the carpets such as stains, burn marks, spots etc?",commentAnswers:[t.yes,t.unsure]},{key:"cupboards",number:17,text:"Are all cupboards in working order and acceptable condition?",commentAnswers:[t.no,t.unsure]},{key:"door_window_locks",number:18,text:"Are all door handles, back doors and window locking systems in working order?",commentAnswers:[t.no,t.unsure]},{key:"improvements_on_plans",number:19,text:"Are all the improvements carried out at the property reflected on the approved building plans?",commentAnswers:[t.no,t.unsure]},{key:"approved_plans_possession",number:20,text:"Are you in possession of such approved building plans?",commentAnswers:[t.no,t.unsure]}]);function de(s,e){const n=z(e);return!!(n&&Array.isArray(s?.commentAnswers)&&s.commentAnswers.includes(n))}const U=Object.freeze([{key:"structural",label:"Structural",issueTypes:["Structural defects","Cracks","Subsidence","Foundation issues"]},{key:"roof_damp",label:"Roof & Damp",issueTypes:["Roof leaks","Water ingress","Damp problems"]},{key:"plumbing",label:"Plumbing",issueTypes:["Plumbing defects","Drainage issues","Sewer problems"]},{key:"electrical",label:"Electrical",issueTypes:["Electrical defects","Compliance concerns","Safety concerns"]},{key:"alterations",label:"Alterations",issueTypes:["Unapproved alterations","Building plan discrepancies","Additions not approved"]},{key:"boundaries",label:"Boundaries",issueTypes:["Boundary disputes","Encroachments","Neighbour disputes"]},{key:"municipal",label:"Municipal",issueTypes:["Municipal disputes","Rates issues","Service issues"]},{key:"security_access",label:"Security & Access",issueTypes:["Access disputes","Servitudes","Right-of-way issues"]},{key:"other",label:"Other",issueTypes:["Other known issue"]}]),G=Object.freeze([...U,{key:"tenancies",label:"Tenancies",issueTypes:["Existing tenants","Tenant disputes","Rental arrears","Occupancy concerns"]},{key:"leases",label:"Leases",issueTypes:["Lease disputes","Early termination issues","Lease obligations affecting sale"]},{key:"zoning",label:"Zoning",issueTypes:["Zoning concerns","Consent use issues","Land use restrictions"]},{key:"commercial_compliance",label:"Compliance",issueTypes:["Fire compliance concerns","Occupational health and safety concerns","Compliance certificates unavailable"]},{key:"environmental",label:"Environmental",issueTypes:["Environmental risks","Contamination concerns","Hazardous material concerns"]},{key:"property_operations",label:"Property Operations",issueTypes:["Building management disputes","Common area disputes","Body corporate disputes"]},{key:"legal_matters",label:"Legal Matters",issueTypes:["Pending litigation","Legal notices","Municipal enforcement actions"]},{key:"access_servitudes",label:"Access & Servitudes",issueTypes:["Servitude disputes","Access restrictions","Shared access concerns"]}]);function r(s){return String(s||"").trim()}function _(s){return r(s).length>0}function z(s){const e=r(s).toLowerCase();return["yes","y","true","1"].includes(e)?t.yes:["no","n","false","0"].includes(e)?t.no:["unsure","unknown","not_sure","not sure","uncertain"].includes(e)?t.unsure:""}function Z(s={}){const e=s.responses&&typeof s.responses=="object"?s.responses:s.questionResponses&&typeof s.questionResponses=="object"?s.questionResponses:s.annexureAResponses&&typeof s.annexureAResponses=="object"?s.annexureAResponses:{},n={};return k.forEach(a=>{const o=e[a.key],p=e[String(a.number)]||e[`q${a.number}`],u=o&&typeof o=="object"?o.answer:o||(p&&typeof p=="object"?p.answer:p),l=z(u);n[a.key]={answer:l,note:r((o&&typeof o=="object"?o.note||o.comment||o.comments:"")||(p&&typeof p=="object"?p.note||p.comment||p.comments:""))}}),n}function J(s={}){const e=k.map(n=>s?.[n.key]?.answer).filter(Boolean);return e.length?e.some(n=>n===t.yes||n===t.unsure)?h.disclose:h.none:""}function i(s=""){return r(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function f(...s){for(const e of s){const n=r(e);if(n)return n}return""}function X(s=[]){return s.map(e=>r(e)).filter(Boolean).join(", ")}function B(s=""){return/^data:image\//i.test(r(s))}function ee(s="",e=""){const n=r(s);if(!n)return"";if(/^(https?:|data:|blob:)/i.test(n))return n;const a=n.startsWith("/")?n:`/${n}`,o=r(e).replace(/\/+$/,"");return o?`${o}${a}`:a}function ne(s={}){const e=s.branding&&typeof s.branding=="object"?s.branding:{},n=f(e.physicalAddress,e.physical_address,e.organisationPhysicalAddress,e.organisation_physical_address,e.address,s.physicalAddress,s.physical_address,s.organisationPhysicalAddress,s.organisation_physical_address,X([e.addressLine1,e.addressLine2,e.city,e.province,e.postalCode])),a=f(e.organisationName,e.organisation_name,e.agencyName,e.agency_name,e.name,s.organisationName,s.agencyName,"Agency Workspace"),o=ee(f(e.logoLightUrl,e.logo_light_url,e.logoLight,e.organisationLogoUrl,e.organisation_logo_url,e.agencyLogoUrl,e.agency_logo_url,e.logoUrl,e.logo_url,e.logoDarkUrl,e.logo_dark_url,e.logoDark,e.agencyLogoDarkUrl,e.agency_logo_dark_url,s.logoUrl),s.assetBaseUrl),p=[a,f(e.website,e.organisationWebsite,e.organisation_website,s.website,s.organisationWebsite),f(e.email,e.organisationEmail,e.organisation_email,s.email,s.organisationEmail),n,f(e.telephone,e.phoneNumber,e.phone_number,e.phone,e.organisationPhone,e.organisation_phone,s.telephone,s.phoneNumber,s.phone)].filter(Boolean);return{organisationName:a,agencyLogoUrl:o,companyDetails:p}}function W(s=[],e="",n="company-details"){const a=(s.length?s:[r(e)]).map(o=>r(o)).filter(o=>o&&!/^\d{4}-\d{2}-\d{2}t/i.test(o));return a.length?`<span class="${n}">${a.map(o=>`<span>${i(o)}</span>`).join("")}</span>`:""}function A(s={}){const e=s.agencyLogoUrl?`<img src="${i(s.agencyLogoUrl)}" alt="${i(s.organisationName)} logo" />`:i(s.organisationName),n=Array.isArray(s.companyDetails)?s.companyDetails:[],a=n.length>1||s.agencyLogoUrl?W(n,s.organisationName):"";return`
    <header class="doc-header">
      <span class="agency-brand">${e}</span>
      ${a}
    </header>
  `}function L(s={},e=1,n=1){const a=s.agencyLogoUrl?`<img src="${i(s.agencyLogoUrl)}" alt="${i(s.organisationName)} logo" />`:i(s.organisationName),o=Array.isArray(s.companyDetails)?s.companyDetails:[],p=o.length>1||s.agencyLogoUrl?W(o.slice(0,2),s.organisationName,"footer-company"):"";return`
    <footer class="doc-footer">
      <span class="footer-brand">${a}</span>
      <span class="page-no">Page ${e} of ${n}</span>
      ${p}
    </footer>
  `}function me(s=""){return{id:`disclosure-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,categoryKey:s,issueType:"",description:"",dateFirstIdentified:"",currentStatus:"",supportingDocuments:""}}function se(s="residential"){return s==="commercial"?G:U}function S(s={},{kind:e="residential"}={}){const n=s&&typeof s=="object"?s:{},a=se(e),o=new Set(a.map(c=>c.key)),u=(Array.isArray(n.issues)?n.issues:[]).filter(c=>c&&typeof c=="object").map((c,j)=>({id:r(c.id)||`disclosure-${j+1}`,categoryKey:(o.has(r(c.categoryKey||c.category_key)),r(c.categoryKey||c.category_key)),issueType:r(c.issueType||c.issue_type),description:r(c.description),dateFirstIdentified:r(c.dateFirstIdentified||c.date_first_identified),currentStatus:r(c.currentStatus||c.current_status),supportingDocuments:r(c.supportingDocuments||c.supporting_documents)})),l=r(n.decision||n.hasKnownIssues||n.has_known_issues),g=Z(n),y=J(g),x=l===h.none||l==="false"||l==="no"?h.none:l===h.disclose||l==="true"||l==="yes"?h.disclose:y;return{version:r(n.version)||"property_disclosure_annexure_a_2026_v1",kind:e,decision:x,responses:g,remoteControlsQuantity:r(n.remoteControlsQuantity||n.remote_controls_quantity),issues:u,otherDisclosure:r(n.otherDisclosure||n.other_disclosure||n.comments||n.commentary),comments:r(n.comments||n.commentary||n.otherDisclosure||n.other_disclosure),declarationAccepted:!!(n.declarationAccepted??n.declaration_accepted),signature:r(n.signature),signedAt:r(n.signedAt||n.signed_at),signedPlace:r(n.signedPlace||n.signed_place),sellerWitness1:r(n.sellerWitness1||n.seller_witness_1),sellerWitness2:r(n.sellerWitness2||n.seller_witness_2),purchaserSignature1:r(n.purchaserSignature1||n.purchaser_signature_1),purchaserSignature2:r(n.purchaserSignature2||n.purchaser_signature_2),purchaserSignedAt:r(n.purchaserSignedAt||n.purchaser_signed_at),purchaserSignedPlace:r(n.purchaserSignedPlace||n.purchaser_signed_place),purchaserWitness1:r(n.purchaserWitness1||n.purchaser_witness_1),purchaserWitness2:r(n.purchaserWitness2||n.purchaser_witness_2),arch9TermsAcceptance:R(n),arch9_terms_acceptance:R(n),arch9TermsAccepted:T(n),arch9_terms_accepted:T(n),uploadedDocumentReviewed:!!(n.uploadedDocumentReviewed??n.uploaded_document_reviewed),reviewedAt:r(n.reviewedAt||n.reviewed_at),reviewedBy:r(n.reviewedBy||n.reviewed_by),clarificationRequest:r(n.clarificationRequest||n.clarification_request),generatedDocument:n.generatedDocument&&typeof n.generatedDocument=="object"?n.generatedDocument:null,lockedSnapshot:n.lockedSnapshot&&typeof n.lockedSnapshot=="object"?n.lockedSnapshot:null}}function N(s={}){const e=S(s,{kind:s.kind||"residential"});return!e.declarationAccepted||!e.signature||!e.signedAt||!T(e)?!1:k.every(o=>z(e.responses?.[o.key]?.answer))?!0:e.decision?e.decision===h.none?!0:e.issues.some(o=>_(o.categoryKey)&&_(o.issueType)&&_(o.description)&&_(o.dateFirstIdentified)&&_(o.currentStatus))||_(e.otherDisclosure):!1}function ue(s={}){const e=S(s,{kind:s.kind||"residential"});return e.reviewedAt||e.reviewedBy?b.reviewed:e.clarificationRequest?b.requiresClarification:N(e)||e.uploadedDocumentReviewed?b.pendingReview:b.pendingSellerCompletion}function ge(s=""){const e=r(s);return e===b.reviewed?"Reviewed":e===b.requiresClarification?"Requires Clarification":e===b.pendingReview?"Pending Review":"Pending Seller Completion"}function ye(s={},e={}){const n=S(s,{kind:s.kind||e.kind||"residential"}),a=V(n,e);return{id:`property-disclosure-${r(e.listingId||e.propertyId||e.sellerId||"draft")}`,type:"property_disclosure",title:"Declaration by Seller - Annexure A",annexure:"Annexure A",status:N(n)?"ready_for_generation":"incomplete",generatedAt:new Date().toISOString(),sellerId:r(e.sellerId),propertyId:r(e.propertyId),listingId:r(e.listingId),transactionId:r(e.transactionId),fileName:"seller-disclosure-annexure-a.pdf",annexureSnapshot:a,disclosure:n}}function re(s={}){const e=S(s,{kind:s.kind||"residential"}),n=k.map(a=>e.responses?.[a.key]?.answer).filter(Boolean);return{answered:n.length,total:k.length,yes:n.filter(a=>a===t.yes).length,no:n.filter(a=>a===t.no).length,unsure:n.filter(a=>a===t.unsure).length}}function V(s={},e={}){const n=S(s,{kind:s.kind||e.kind||"residential"}),a=re(n);return{type:"property_disclosure_annexure_a",title:"Declaration by Seller - Annexure A",annexureLabel:"Annexure A",version:n.version,status:N(n)?"complete":"incomplete",generatedAt:r(e.generatedAt)||new Date().toISOString(),lockedAt:r(e.lockedAt),lockedByPacketId:r(e.lockedByPacketId),lockedByPacketVersionId:r(e.lockedByPacketVersionId),sellerId:r(e.sellerId),propertyId:r(e.propertyId),listingId:r(e.listingId),transactionId:r(e.transactionId),answers:k.map(o=>({key:o.key,number:o.number,question:o.text,answer:n.responses?.[o.key]?.answer||"",note:n.responses?.[o.key]?.note||"",extraLabel:o.extraLabel||"",extraValue:o.key==="remote_controls"?n.remoteControlsQuantity:""})),comments:n.comments||n.otherDisclosure,sellerName:r(e.sellerName),sellerIdNumber:r(e.sellerIdNumber||e.sellerIdNo||e.idNumber),sellerSignature:n.signature,sellerSignedAt:n.signedAt,sellerSignedPlace:n.signedPlace,sellerWitness1:n.sellerWitness1,sellerWitness2:n.sellerWitness2,purchaserSignature1:n.purchaserSignature1,purchaserSignature2:n.purchaserSignature2,purchaserSignedAt:n.purchaserSignedAt,purchaserSignedPlace:n.purchaserSignedPlace,purchaserWitness1:n.purchaserWitness1,purchaserWitness2:n.purchaserWitness2,summary:a}}function te(s=[]){return Array.isArray(s)?s.map(e=>({label:r(e?.label),value:r(e?.value),type:r(e?.type),people:Array.isArray(e?.people)?e.people.map(n=>({name:r(n?.name||n?.full_name),idNumber:r(n?.idNumber||n?.id_number),email:r(n?.email),phone:r(n?.phone||n?.mobile)})).filter(n=>n.name||n.idNumber||n.email||n.phone):[]})).filter(e=>e.label&&e.value):[]}function F(s=[]){return Array.isArray(s)?s.map(e=>({title:r(e?.title),rows:te(e?.rows)})).filter(e=>e.title&&e.rows.length):[]}function ae(s=""){return i(s).replace(/\n/g,"<br />")}function oe(s=[]){return s.length?`
    <div class="compliance-people">
      ${s.map((e,n)=>`
        <article class="compliance-person">
          <strong>${i(e.name||`Owner ${n+1}`)}</strong>
          <span>${[e.idNumber?`ID ${e.idNumber}`:"",e.email,e.phone].map(a=>i(a)).filter(Boolean).join(" &middot; ")}</span>
        </article>
      `).join("")}
    </div>
  `:""}function ie(s=[]){return`
    <dl class="compliance-list">
      ${s.map(e=>`
        <div class="compliance-row${e.type==="people"&&e.people.length?" compliance-row-wide":""}">
          <dt>${i(e.label)}</dt>
          <dd>${e.type==="people"&&e.people.length?oe(e.people):ae(e.value)}</dd>
        </div>
      `).join("")}
    </dl>
  `}function ce(s={},e={},n=1,a=1,o=""){const p=F(s.ficaSections);return p.length?`
    <section class="property-disclosure-page">
      ${A(e)}
      <section class="doc-title compliance-title">
        <p class="eyebrow">Seller Compliance Pack</p>
        <h1>FICA Summary</h1>
        <p>${i(s.subtitle||"Seller information captured during onboarding.")}<br />Document reference: ${i(o)}</p>
      </section>
      <section class="doc-body compliance-body">
        <p class="intro compliance-intro">Seller information captured for FICA, tax and property onboarding. Supporting documents stay attached separately where required.</p>
        <div class="compliance-section-grid">
          ${p.map(u=>`
            <section class="compliance-section">
              <h2>${i(u.title)}</h2>
              ${ie(u.rows)}
            </section>
          `).join("")}
        </div>
      </section>
      ${L(e,n,a)}
    </section>
  `:""}function le(s={},e={},n=1,a=1,o=""){const p=Array.isArray(s.signers)?s.signers:[];if(!p.length)return"";const u=s.signingSummary||{};return`
    <section class="property-disclosure-page">
      ${A(e)}
      <section class="doc-title compliance-title">
        <p class="eyebrow">Seller Compliance Pack</p>
        <h1>Signature Certificate</h1>
        <p>Document reference: ${i(o)}</p>
      </section>
      <section class="doc-body compliance-body">
        <p class="intro compliance-intro">Signature evidence for the combined FICA and property disclosure pack.</p>
        <div class="compliance-summary">
          <span>Status</span>
          <strong>${i(u.statusLabel||u.progressLabel||"Pending signatures")}</strong>
        </div>
        <div class="signer-card-grid">
          ${p.map(l=>{const g=r(l.signature),y=g?B(g)?`<img class="signer-signature-image" src="${i(g)}" alt="${i(l.name||"Signer")} signature" />`:i(g):"Awaiting signature";return`
              <article class="signer-card">
                <div class="signer-card-main">
                  <span class="signer-role">${i(l.roleLabel||"Seller")}</span>
                  <strong>${i(l.name||"Seller")}</strong>
                  ${l.email?`<span>${i(l.email)}</span>`:""}
                  ${l.mobile?`<span>${i(l.mobile)}</span>`:""}
                </div>
                <div class="signer-card-meta">
                  <span class="signer-status">${i(l.statusLabel||l.status||"Pending")}</span>
                  <span>${i(l.signedAt)||"Not signed yet"}</span>
                  <span>${l.authorityRequired?i(l.authorityLabel||"Authority document required"):"Own signature"}</span>
                </div>
                <div class="signer-card-signature">${y}</div>
              </article>
            `}).join("")}
        </div>
      </section>
      ${L(e,n,a)}
    </section>
  `}function fe(s={},e={}){const n=V(s,e),a=e.sellerCompliancePack&&typeof e.sellerCompliancePack=="object"?e.sellerCompliancePack:e.compliancePack&&typeof e.compliancePack=="object"?e.compliancePack:null,o=F(a?.ficaSections).length>0,p=Array.isArray(a?.signers)&&a.signers.length>0,u=r(e.sellerName||n.sellerName||"Seller"),l=r(e.sellerIdNumber||n.sellerIdNumber),g=r(e.propertyAddress),y=f(e.documentReference,e.listingReference,e.listingId,g,n.title),x=a?.title||n.title,c=ne(e),M=B(n.sellerSignature)?`<img class="signature-image" src="${i(n.sellerSignature)}" alt="Seller signature" />`:i(n.sellerSignature)||"&nbsp;",v=(d,m)=>d===m?'<span class="answer-mark">&#10003;</span>':"&nbsp;",$=3+(o?1:0)+(p?1:0);let I=1;const C=()=>L(c,I++,$),E=d=>d.map(m=>`
    <tr>
      <td class="question-cell">
        <span class="question-number">${m.number}.</span>
        <span class="question-text">${i(m.question)}</span>
        ${m.extraLabel?`<span class="question-extra">${i(m.extraLabel)}: ${i(m.extraValue)}</span>`:""}
        ${m.note?`<span class="question-note"><strong>Details:</strong> ${i(m.note).replace(/\n/g,"<br />")}</span>`:""}
      </td>
      <td class="answer-cell">${v(m.answer,t.yes)}</td>
      <td class="answer-cell">${v(m.answer,t.no)}</td>
      <td class="answer-cell">${v(m.answer,t.unsure)}</td>
    </tr>
  `).join(""),K=E(n.answers.filter(d=>Number(d.number)<=10)),H=E(n.answers.filter(d=>Number(d.number)>10)),Y=i(n.comments).replace(/\n/g,"<br />"),D=(d="")=>`
    <section class="doc-title">
      <h1>Declaration by Seller - Annexure A</h1>
      <p>Document reference: ${i(y)}${d?`<br />${i(d)}`:""}</p>
    </section>
  `,O=d=>`
    <table class="annexure-table">
      <colgroup>
        <col class="question-col" />
        <col class="answer-col" />
        <col class="answer-col" />
        <col class="answer-col" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Disclosure question</th>
          <th scope="col">Yes</th>
          <th scope="col">No</th>
          <th scope="col">Unsure</th>
        </tr>
      </thead>
      <tbody>${d}</tbody>
    </table>
  `;return`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${i(x)}</title>
  <style>
    * { box-sizing: border-box; }
    :root { color-scheme: light; font-family: Helvetica, Arial, sans-serif; }
    body { margin: 0; padding: 0; background: #ffffff; color: #1f2937; font-family: Helvetica, Arial, sans-serif; }
    .property-disclosure-document { width: 210mm; margin: 0 auto; background: #ffffff; }
    .property-disclosure-page { width: 210mm; height: 296mm; min-height: 296mm; margin: 0 auto; background: #ffffff; color: #1f2937; position: relative; overflow: hidden; }
    .doc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; padding: 11mm 18mm 6mm; border-bottom: 1px solid #e1e6e3; }
    .agency-brand { display: inline-flex; align-items: center; justify-content: flex-start; min-width: 0; color: #1f2937; font-size: 16px; font-weight: 800; letter-spacing: 0; }
    .agency-brand img { max-width: 54mm; max-height: 17mm; object-fit: contain; }
    .company-details { display: grid; justify-items: end; gap: 1px; max-width: 74mm; color: #43546a; font-size: 8.3pt; line-height: 1.25; text-align: right; }
    .company-details span:first-child { color: #111827; font-weight: 800; }
    .doc-title { padding: 7mm 18mm 5mm; text-align: center; border-bottom: 1px solid #e6ebe8; }
    .doc-title h1 { margin: 0; color: #111827; font-size: 20px; font-weight: 800; letter-spacing: 0; line-height: 1.2; text-transform: uppercase; }
    .doc-title p { margin: 5px 0 0; color: #66758a; font-size: 10.5px; line-height: 1.4; }
    .doc-title .eyebrow { margin: 0 0 2mm; color: #176c43; font-size: 8.5pt; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
    .compliance-title h1 { color: #0f2f22; letter-spacing: -0.01em; }
    .doc-body { padding: 7mm 18mm 24mm; }
    .compliance-body { padding-top: 7mm; }
    .intro { margin: 0 0 3mm; color: #1f2937; font-size: 11.5px; line-height: 1.5; }
    .compliance-intro { margin-bottom: 5mm; color: #334155; font-size: 10.3pt; }
    .meta { margin: 0 0 5mm; color: #3f4a56; font-size: 11px; line-height: 1.45; }
    .compliance-section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4.5mm; align-items: start; }
    .compliance-section { break-inside: avoid; page-break-inside: avoid; border: 1px solid #dfe9e3; border-radius: 3mm; overflow: hidden; background: #ffffff; }
    .compliance-section h2 { margin: 0; padding: 3mm 4mm; background: #edf8f1; color: #14543a; font-size: 9.2pt; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
    .compliance-list { display: grid; gap: 0; margin: 0; font-size: 8.4pt; line-height: 1.32; }
    .compliance-row { display: grid; grid-template-columns: 38% 1fr; gap: 2.5mm; padding: 2mm 3.5mm; border-top: 1px solid #edf1ee; }
    .compliance-row:first-child { border-top: 0; }
    .compliance-row-wide { display: block; }
    .compliance-row dt { margin: 0; color: #64748b; font-weight: 700; }
    .compliance-row dd { margin: 0; color: #111827; font-weight: 800; overflow-wrap: anywhere; }
    .compliance-people { display: grid; gap: 1.6mm; margin-top: 1.5mm; }
    .compliance-person { padding: 2mm; border: 1px solid #e1e8e3; border-radius: 2mm; background: #fbfdfb; }
    .compliance-person strong { display: block; color: #111827; font-size: 8.8pt; }
    .compliance-person span { display: block; margin-top: 0.7mm; color: #66758a; font-size: 7.8pt; line-height: 1.3; }
    .compliance-summary { display: flex; align-items: center; justify-content: space-between; gap: 5mm; margin: 0 0 5mm; padding: 3.5mm 5mm; border: 1px solid #b8dcc8; border-radius: 3mm; background: #f1fbf4; color: #0f5132; }
    .compliance-summary span { font-size: 8.3pt; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    .compliance-summary strong { font-size: 11.5pt; }
    .signer-card-grid { display: grid; gap: 4mm; }
    .signer-card { display: grid; grid-template-columns: 1.1fr 0.9fr 36mm; gap: 4mm; align-items: stretch; padding: 4mm; border: 1px solid #dfe5e1; border-radius: 3mm; break-inside: avoid; page-break-inside: avoid; }
    .signer-card-main, .signer-card-meta { display: grid; align-content: start; gap: 1mm; min-width: 0; }
    .signer-card-main strong { color: #111827; font-size: 11pt; line-height: 1.2; }
    .signer-card-main span, .signer-card-meta span { color: #64748b; font-size: 8.2pt; line-height: 1.3; overflow-wrap: anywhere; }
    .signer-role { color: #176c43 !important; font-size: 7.8pt !important; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; }
    .signer-status { width: max-content; max-width: 100%; padding: 1mm 2mm; border-radius: 999px; background: #e9f8ee; color: #136d42 !important; font-weight: 800; }
    .signer-card-signature { display: flex; align-items: center; justify-content: center; min-height: 18mm; border: 1px solid #d5ddd8; border-radius: 2mm; color: #64748b; font-size: 8pt; font-weight: 700; text-align: center; }
    .signer-signature-image { max-width: 30mm; max-height: 16mm; object-fit: contain; }
    .annexure-table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #1f2937; font-size: 9.35pt; line-height: 1.34; }
    .annexure-table th, .annexure-table td { border: 1px solid #d7d7d7; vertical-align: top; padding: 2mm 2.3mm; }
    .annexure-table th { background: #f6f7f8; color: #111827; font-size: 8.7pt; font-weight: 700; text-align: left; text-transform: uppercase; }
    .annexure-table th:not(:first-child) { text-align: center; }
    .question-col { width: 76%; }
    .answer-col { width: 8%; }
    .question-cell { color: #1f2937; }
    .question-number { display: inline-block; min-width: 5mm; color: #111827; font-weight: 700; }
    .question-extra { display: block; margin-top: 1.5mm; padding-left: 5mm; color: #3f4a56; font-size: 8.8pt; }
    .question-note { display: block; margin-top: 1.5mm; padding-left: 5mm; color: #7c3f13; font-size: 8.8pt; line-height: 1.35; }
    .answer-cell { text-align: center; vertical-align: middle; color: #111827; }
    .answer-mark { display: inline-block; font-size: 12pt; font-weight: 700; line-height: 1; }
    .comments-title { color: #111827; font-weight: 700; text-transform: uppercase; }
    .comments-box { min-height: 32mm; color: #1f2937; line-height: 1.45; }
    .signature-section { margin-top: 5mm; color: #1f2937; font-size: 10.5pt; line-height: 1.5; }
    .signature-section h2 { margin: 0 0 4mm; padding-bottom: 2mm; border-bottom: 1px solid #d7d7d7; color: #111827; font-size: 11pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .execution-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 5mm; }
    .execution-field { min-height: 15mm; border: 1px solid #dce2de; border-radius: 1.5mm; padding: 3mm; }
    .execution-label { display: block; color: #5c6670; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; }
    .execution-value { display: block; margin-top: 2mm; color: #111827; font-size: 11pt; font-weight: 700; }
    .signature-panel { margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
    .signature-box { display: flex; align-items: center; justify-content: center; min-height: 27mm; border: 1px solid #8c969f; border-radius: 1.5mm; background: #ffffff; padding: 3mm; color: #111827; font-size: 11pt; font-weight: 700; }
    .signature-image { max-width: 100%; max-height: 23mm; object-fit: contain; }
    .signature-label { margin-top: 1.5mm; color: #3f4a56; font-size: 10px; font-weight: 700; text-align: right; text-transform: uppercase; }
    .doc-footer { position: absolute; left: 18mm; right: 18mm; bottom: 6mm; display: flex; align-items: center; justify-content: space-between; gap: 8mm; padding-top: 4mm; border-top: 1px solid #d8d8d8; color: #606a75; font-size: 10px; }
    .footer-brand { display: inline-flex; align-items: center; min-width: 34mm; max-width: 48mm; }
    .doc-footer img { max-width: 34mm; max-height: 9mm; object-fit: contain; }
    .page-no { flex: 1; text-align: center; font-weight: 700; }
    .footer-company { display: grid; justify-items: end; min-width: 34mm; max-width: 55mm; text-align: right; line-height: 1.25; }
    .footer-company span:first-child { color: #111827; font-weight: 700; }
    @media print {
      body { background: #fff; }
      .property-disclosure-document, .property-disclosure-page { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="property-disclosure-document">
    ${o?ce(a,c,I++,$,y):""}
    <section class="property-disclosure-page">
      ${A(c)}
      ${D()}
      <section class="doc-body">
        <p class="intro">This statement declares the actual current state of the property according to the best of my knowledge. I/ We declare that as far as we are concerned no material defects to the building or equipment exist except those as stated below.</p>
        <p class="intro">Please answer Yes, No, or Unsure, and where necessary provide an explanation in clause 21 hereunder.</p>
        ${g?`<p class="meta"><strong>Property:</strong> ${i(g)}</p>`:""}
        ${O(K)}
      </section>
      ${C()}
    </section>
    <section class="property-disclosure-page">
      ${A(c)}
      ${D("Continuation and comments section")}
      <section class="doc-body">
        ${O(`${H}
          <tr><td class="comments-title" colspan="4">21. Comments or explanation for any of the above</td></tr>
          <tr><td class="comments-box" colspan="4">${Y||"&nbsp;"}</td></tr>
        `)}
      </section>
      ${C()}
    </section>
    <section class="property-disclosure-page">
      ${A(c)}
      ${D("Signature section")}
      <section class="doc-body">
        <section class="signature-section">
          <h2>Seller declaration and signature</h2>
          <p class="intro">I declare that the information in this Annexure A is true and complete to the best of my knowledge and that all known material facts relating to the property have been disclosed.</p>
          <div class="execution-grid">
            <div class="execution-field">
              <span class="execution-label">Seller name</span>
              <span class="execution-value">${i(u)}</span>
            </div>
            <div class="execution-field">
              <span class="execution-label">ID / passport number</span>
              <span class="execution-value">${i(l)||"&nbsp;"}</span>
            </div>
            <div class="execution-field">
              <span class="execution-label">Date signed</span>
              <span class="execution-value">${i(n.sellerSignedAt)||"&nbsp;"}</span>
            </div>
            <div class="execution-field">
              <span class="execution-label">Signed at</span>
              <span class="execution-value">${i(n.sellerSignedPlace)||"&nbsp;"}</span>
            </div>
          </div>
          <div class="signature-panel">
            <div class="signature-box">${M}</div>
            <div class="signature-label">Seller signature</div>
          </div>
        </section>
      </section>
      ${C()}
    </section>
    ${p?le(a,c,I++,$,y):""}
  </main>
</body>
</html>`}export{Q as A,h as P,ue as a,se as b,me as c,re as d,T as e,k as f,ge as g,fe as h,N as i,t as j,pe as k,q as l,V as m,S as n,ye as o,R as r,de as s};
