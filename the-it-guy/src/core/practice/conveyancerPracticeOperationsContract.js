export const CONVEYANCER_PRACTICE_OPERATIONS_VERSION = 'conveyancer_practice_operations_g1_v1'

export const PRACTICE_OPERATION_ROLES = Object.freeze({
  responsibleAttorney: 'responsible_attorney', supervisingAttorney: 'supervising_attorney', conveyancingSecretary: 'conveyancing_secretary',
  accounts: 'accounts', compliance: 'compliance', firmManager: 'firm_manager', service: 'service',
})

export const PRACTICE_OPERATION_CAPABILITIES = Object.freeze({
  viewMatter: 'view_matter', editMatter: 'edit_matter', allocateMatter: 'allocate_matter', captureEvidence: 'capture_evidence', reviewEvidence: 'review_evidence',
  legalReview: 'legal_review', approveLegalInstrument: 'approve_legal_instrument', prepareCorrespondence: 'prepare_correspondence', sendCorrespondence: 'send_correspondence',
  scheduleSigning: 'schedule_signing', preparePayment: 'prepare_payment', approveTrustPayment: 'approve_trust_payment', reconcileTrust: 'reconcile_trust',
  reviewCompliance: 'review_compliance', setComplianceHold: 'set_compliance_hold', delegateWork: 'delegate_work', approveBreakGlass: 'approve_break_glass',
  managePractice: 'manage_practice', recordIntegratedEvidence: 'record_integrated_evidence',
})

const C = PRACTICE_OPERATION_CAPABILITIES
export const PRACTICE_ROLE_CAPABILITIES = Object.freeze({
  responsible_attorney: Object.freeze([C.viewMatter,C.editMatter,C.captureEvidence,C.reviewEvidence,C.legalReview,C.approveLegalInstrument,C.prepareCorrespondence,C.sendCorrespondence,C.scheduleSigning,C.preparePayment,C.delegateWork]),
  supervising_attorney: Object.freeze([C.viewMatter,C.editMatter,C.allocateMatter,C.captureEvidence,C.reviewEvidence,C.legalReview,C.approveLegalInstrument,C.prepareCorrespondence,C.sendCorrespondence,C.scheduleSigning,C.preparePayment,C.delegateWork,C.approveBreakGlass,C.managePractice]),
  conveyancing_secretary: Object.freeze([C.viewMatter,C.editMatter,C.captureEvidence,C.prepareCorrespondence,C.sendCorrespondence,C.scheduleSigning]),
  accounts: Object.freeze([C.viewMatter,C.captureEvidence,C.preparePayment,C.approveTrustPayment,C.reconcileTrust]),
  compliance: Object.freeze([C.viewMatter,C.captureEvidence,C.reviewEvidence,C.reviewCompliance,C.setComplianceHold]),
  firm_manager: Object.freeze([C.viewMatter,C.allocateMatter,C.delegateWork,C.approveBreakGlass,C.managePractice]),
  service: Object.freeze([C.recordIntegratedEvidence]),
})

export const PRACTICE_EVIDENCE_SOURCE_MODES = Object.freeze({ manual: 'manual', integration: 'integration' })
export const PRACTICE_ALLOWED_SIDE_EFFECTS = Object.freeze(['persist_append_only','append_audit','queue_human_review','send_internal_notification','prepare_correspondence','send_approved_correspondence'])
export const PRACTICE_PROHIBITED_SIDE_EFFECTS = Object.freeze(['execute_trust_payment','approve_legal_document','waive_legal_risk','submit_regulatory_report','change_deeds_outcome','mark_registration_complete','store_raw_credential'])
export const PRACTICE_NON_DELEGABLE_CAPABILITIES = Object.freeze([C.approveLegalInstrument,C.approveTrustPayment,C.setComplianceHold,C.approveBreakGlass,C.managePractice])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const text = (value = '') => String(value ?? '').trim()
const key = (value = '') => text(value).toLowerCase().replace(/[\s/-]+/g,'_').replace(/[^a-z0-9_.:]+/g,'')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
function stable(value) { if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.keys(value).sort().reduce((result,name)=>{result[name]=stable(value[name]);return result},{}) }
function fingerprint(value) { const source=JSON.stringify(stable(value));let hash=0x811c9dc5;for(let index=0;index<source.length;index+=1){hash^=source.charCodeAt(index);hash=Math.imul(hash,0x01000193)}return `fnv1a_${(hash>>>0).toString(16).padStart(8,'0')}` }
function freeze(value) { if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.values(value).forEach(freeze);return Object.freeze(value) }
function secretPaths(value,path='') { if(!value||typeof value!=='object')return [];return Object.entries(value).flatMap(([name,item])=>{const current=path?`${path}.${name}`:name;if(/(api.?key|access.?token|refresh.?token|password|private.?key|client.?secret|credential|secret)$/i.test(name)&&!/reference$/i.test(name)&&text(item))return[current];return secretPaths(item,current)}) }

export function buildPracticeOperationIdentity(input = {}) {
  const identity={organisationId:text(input.organisationId),attorneyFirmId:text(input.attorneyFirmId),branchId:text(input.branchId),teamId:text(input.teamId),transactionId:text(input.transactionId),operationId:text(input.operationId),lane:key(input.lane)||'transfer'}
  const errors=[]
  if(!UUID.test(identity.organisationId)||!UUID.test(identity.attorneyFirmId)||!UUID.test(identity.transactionId)||!identity.operationId||!['transfer','bond','cancellation','shared'].includes(identity.lane))errors.push('practice_operation_identity_invalid')
  if(identity.branchId&&!UUID.test(identity.branchId))errors.push('practice_branch_identity_invalid')
  if(identity.teamId&&!UUID.test(identity.teamId))errors.push('practice_team_identity_invalid')
  return freeze({ok:errors.length===0,errors,identity})
}

export function buildPracticePolicyBinding(input = {}) {
  const binding={policyId:text(input.policyId),policyVersion:text(input.policyVersion),policyFingerprint:text(input.policyFingerprint),effectiveAt:iso(input.effectiveAt)}
  const errors=[];if(!binding.policyId||!binding.policyVersion||!binding.effectiveAt||!/^fnv1a_[a-f0-9]{8}$/i.test(binding.policyFingerprint))errors.push('practice_policy_binding_invalid')
  return freeze({ok:errors.length===0,errors,binding})
}

export function buildPracticeActor(input = {}) {
  const actor={userId:text(input.userId),membershipId:text(input.membershipId),role:key(input.role),organisationId:text(input.organisationId),attorneyFirmId:text(input.attorneyFirmId),branchId:text(input.branchId),teamId:text(input.teamId)}
  const errors=[];if(!UUID.test(actor.userId)||!actor.membershipId||!PRACTICE_ROLE_CAPABILITIES[actor.role]||!UUID.test(actor.organisationId)||!UUID.test(actor.attorneyFirmId))errors.push('practice_actor_invalid')
  return freeze({ok:errors.length===0,errors,actor})
}

export function buildPracticeEvidenceSource(input = {}) {
  const mode=key(input.mode);const source={mode,sourceReference:text(input.sourceReference),canonicalEvidenceType:key(input.canonicalEvidenceType),capturedBy:text(input.capturedBy),integrationProfileId:text(input.integrationProfileId),providerEventId:text(input.providerEventId),receivedAt:iso(input.receivedAt),reviewState:key(input.reviewState)||'proposed'}
  const errors=[]
  if(!Object.values(PRACTICE_EVIDENCE_SOURCE_MODES).includes(mode)||!source.sourceReference||!source.canonicalEvidenceType||!source.receivedAt||!['proposed','captured','under_review'].includes(source.reviewState))errors.push('practice_evidence_source_invalid')
  if(mode==='manual'&&!UUID.test(source.capturedBy))errors.push('practice_manual_source_actor_required')
  if(mode==='integration'&&(!UUID.test(source.integrationProfileId)||!source.providerEventId))errors.push('practice_integration_source_identity_required')
  if(mode==='integration'&&['accepted','approved'].includes(source.reviewState))errors.push('practice_integration_cannot_self_approve')
  return freeze({ok:errors.length===0,errors:[...new Set(errors)],source})
}

export function evaluatePracticeOperationAuthority({actor:actorInput={},identity:identityInput={},capability='',delegation=null,asOf=new Date().toISOString()}={}) {
  const actor=buildPracticeActor(actorInput);const identity=buildPracticeOperationIdentity(identityInput);const requested=key(capability);const blockers=[...actor.errors,...identity.errors]
  if(actor.actor.organisationId!==identity.identity.organisationId||actor.actor.attorneyFirmId!==identity.identity.attorneyFirmId)blockers.push('practice_actor_tenant_mismatch')
  let allowed=PRACTICE_ROLE_CAPABILITIES[actor.actor.role]?.includes(requested)===true
  let basis=allowed?'role_capability':'none'
  if(!allowed&&delegation){const starts=iso(delegation.startsAt);const ends=iso(delegation.endsAt);const valid=text(delegation.delegateUserId)===actor.actor.userId&&key(delegation.capability)===requested&&text(delegation.organisationId)===identity.identity.organisationId&&text(delegation.attorneyFirmId)===identity.identity.attorneyFirmId&&(!delegation.transactionId||text(delegation.transactionId)===identity.identity.transactionId)&&starts&&ends&&new Date(starts)<=new Date(asOf)&&new Date(ends)>new Date(asOf)&&!PRACTICE_NON_DELEGABLE_CAPABILITIES.includes(requested)&&UUID.test(text(delegation.delegatedBy))
    if(valid){allowed=true;basis='active_delegation'}else blockers.push('practice_delegation_invalid')
  }
  if(!Object.values(C).includes(requested))blockers.push('practice_capability_unknown')
  if(!allowed)blockers.push('practice_capability_not_granted')
  return freeze({allowed:allowed&&blockers.length===0,capability:requested,basis,blockers:[...new Set(blockers)]})
}

export function evaluatePracticeApprovals({initiatedBy='',approvals=[],requiredRoles=[],minimumApprovals=0,prohibitSelfApproval=true}={}) {
  const approved=approvals.filter((item)=>key(item.decision)==='approved'&&UUID.test(text(item.approvedBy))&&text(item.reason)&&iso(item.approvedAt))
  const blockers=[];for(const role of requiredRoles.map(key))if(!approved.some((item)=>key(item.role)===role))blockers.push(`practice_approval_role_missing:${role}`)
  if(approved.length<Number(minimumApprovals||requiredRoles.length))blockers.push('practice_minimum_approvals_missing')
  if(new Set(approved.map((item)=>text(item.approvedBy))).size!==approved.length)blockers.push('practice_approver_separation_required')
  if(prohibitSelfApproval&&approved.some((item)=>text(item.approvedBy)===text(initiatedBy)))blockers.push('practice_self_approval_prohibited')
  return freeze({approved:blockers.length===0,blockers:[...new Set(blockers)],approvals:approved.map((item)=>({role:key(item.role),approvedBy:text(item.approvedBy),reason:text(item.reason),approvedAt:iso(item.approvedAt)}))})
}

export function buildPracticeAuditEvent(input = {}) {
  const event={version:CONVEYANCER_PRACTICE_OPERATIONS_VERSION,eventId:text(input.eventId),eventType:key(input.eventType),operationId:text(input.operationId),organisationId:text(input.organisationId),attorneyFirmId:text(input.attorneyFirmId),transactionId:text(input.transactionId),actorUserId:text(input.actorUserId),capability:key(input.capability),reason:text(input.reason),occurredAt:iso(input.occurredAt),correlationId:text(input.correlationId),causationId:text(input.causationId),detailReference:text(input.detailReference),detailHash:text(input.detailHash)}
  event.fingerprint=fingerprint(event);const errors=[]
  if(!event.eventId||!event.eventType||!event.operationId||!UUID.test(event.organisationId)||!UUID.test(event.attorneyFirmId)||!UUID.test(event.transactionId)||!UUID.test(event.actorUserId)||!event.reason||!event.occurredAt||!event.detailReference||!HASH.test(event.detailHash))errors.push('practice_audit_event_invalid')
  return freeze({ok:errors.length===0,errors,event})
}

export function buildPracticeOperationContract(input = {}) {
  const identity=buildPracticeOperationIdentity(input.identity||input);const actor=buildPracticeActor(input.actor||{});const policy=buildPracticePolicyBinding(input.policy||{});const source=input.evidenceSource?buildPracticeEvidenceSource(input.evidenceSource):null;const capability=key(input.capability);const sideEffects=[...new Set((input.sideEffects||[]).map(key).filter(Boolean))].sort();const payloadReference=text(input.payloadReference);const payloadHash=text(input.payloadHash)
  const authority=evaluatePracticeOperationAuthority({actor:actor.actor,identity:identity.identity,capability,delegation:input.delegation,asOf:input.occurredAt});const approvals=evaluatePracticeApprovals({initiatedBy:actor.actor.userId,...(input.approvalRequirement||{}),approvals:input.approvals||[]});const errors=[...identity.errors,...actor.errors,...policy.errors,...authority.blockers]
  if(source&&!source.ok)errors.push(...source.errors)
  if(!payloadReference||!HASH.test(payloadHash)||input.payload!==undefined)errors.push('practice_operation_must_be_reference_only')
  if(sideEffects.some((effect)=>!PRACTICE_ALLOWED_SIDE_EFFECTS.includes(effect))||sideEffects.some((effect)=>PRACTICE_PROHIBITED_SIDE_EFFECTS.includes(effect)))errors.push('practice_side_effect_outside_boundary')
  if(input.approvalRequirement&&!approvals.approved)errors.push(...approvals.blockers)
  if(secretPaths(input).length)errors.push('practice_operation_contains_secret')
  const operation={version:CONVEYANCER_PRACTICE_OPERATIONS_VERSION,recordType:key(input.recordType),identity:identity.identity,actor:actor.actor,capability,authorityBasis:authority.basis,policy:policy.binding,evidenceSource:source?.source||null,payloadReference,payloadHash,sideEffects,approvalRequirement:input.approvalRequirement||null,approvals:approvals.approvals,occurredAt:iso(input.occurredAt),reason:text(input.reason)}
  if(!operation.recordType||!operation.occurredAt||!operation.reason)errors.push('practice_operation_record_invalid')
  operation.fingerprint=fingerprint(operation)
  return freeze({ok:errors.length===0,errors:[...new Set(errors)],operation,traceability:{firmBound:identity.ok,policyBound:policy.ok,actorBound:actor.ok,authorityBound:authority.allowed,sourceBound:source?source.ok:true,approvalBound:input.approvalRequirement?approvals.approved:true,sideEffectsBound:!errors.includes('practice_side_effect_outside_boundary')}})
}
