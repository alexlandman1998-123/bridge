import { buildPracticeActor, buildPracticeAuditEvent, buildPracticePolicyBinding, CONVEYANCER_PRACTICE_OPERATIONS_VERSION, PRACTICE_OPERATION_ROLES } from './conveyancerPracticeOperationsContract.js'

export const CONVEYANCER_INFORMATION_GOVERNANCE_VERSION = 'conveyancer_information_governance_g2_v1'
export const INFORMATION_CLASSIFICATIONS = Object.freeze(['internal','confidential','privileged','personal','special_personal','financial','restricted'])
export const INFORMATION_ACTIONS = Object.freeze(['view','edit','approve','download','export','share','delete','dispose'])

const R=PRACTICE_OPERATION_ROLES
const ACCESS=Object.freeze({
  internal:{responsible_attorney:'view edit approve download export share',supervising_attorney:'view edit approve download export share delete dispose',conveyancing_secretary:'view edit download',accounts:'view edit download export',compliance:'view edit approve download export',firm_manager:'view approve download export'},
  confidential:{responsible_attorney:'view edit approve download export share',supervising_attorney:'view edit approve download export share delete dispose',conveyancing_secretary:'view edit download',compliance:'view approve download export',firm_manager:'view approve'},
  privileged:{responsible_attorney:'view edit approve download export share',supervising_attorney:'view edit approve download export share delete dispose',conveyancing_secretary:'view',compliance:'view'},
  personal:{responsible_attorney:'view edit approve download share',supervising_attorney:'view edit approve download export share delete dispose',conveyancing_secretary:'view edit',compliance:'view edit approve download export'},
  special_personal:{responsible_attorney:'view edit download',supervising_attorney:'view approve download',compliance:'view edit approve download export'},
  financial:{responsible_attorney:'view edit download',supervising_attorney:'view edit approve download export share',accounts:'view edit approve download export',compliance:'view'},
  restricted:{},
})
for(const classification of Object.keys(ACCESS))for(const role of Object.keys(ACCESS[classification]))ACCESS[classification][role]=Object.freeze(ACCESS[classification][role].split(' '))

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text=(value='')=>String(value??'').trim();const key=(value='')=>text(value).toLowerCase().replace(/[\s/-]+/g,'_').replace(/[^a-z0-9_.:]+/g,'');const iso=(value)=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toISOString():null
function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.keys(value).sort().reduce((result,name)=>{result[name]=stable(value[name]);return result},{})}
function fingerprint(value){const source=JSON.stringify(stable(value));let hash=0x811c9dc5;for(let index=0;index<source.length;index+=1){hash^=source.charCodeAt(index);hash=Math.imul(hash,0x01000193)}return`fnv1a_${(hash>>>0).toString(16).padStart(8,'0')}`}
function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.values(value).forEach(freeze);return Object.freeze(value)}
function unique(values=[]){return[...new Set(values.map(key).filter(Boolean))].sort()}

export function buildInformationGovernancePolicy(input={}){
  const policy={version:CONVEYANCER_INFORMATION_GOVERNANCE_VERSION,policyId:text(input.policyId),policyVersion:text(input.policyVersion),organisationId:text(input.organisationId),attorneyFirmId:text(input.attorneyFirmId),effectiveAt:iso(input.effectiveAt),breakGlassClassifications:unique(input.breakGlassClassifications||['confidential','privileged','personal','special_personal','financial']),maximumDelegationHours:Math.max(1,Math.min(720,Number(input.maximumDelegationHours||168))),maximumBreakGlassMinutes:Math.max(5,Math.min(240,Number(input.maximumBreakGlassMinutes||60))),requireWatermarkFor:unique(input.requireWatermarkFor||['privileged','personal','special_personal','financial']),reason:text(input.reason)}
  policy.fingerprint=fingerprint(policy);const binding=buildPracticePolicyBinding({policyId:policy.policyId,policyVersion:policy.policyVersion,policyFingerprint:policy.fingerprint,effectiveAt:policy.effectiveAt});const errors=[...binding.errors]
  if(!UUID.test(policy.organisationId)||!UUID.test(policy.attorneyFirmId)||!policy.reason||policy.breakGlassClassifications.some((item)=>!INFORMATION_CLASSIFICATIONS.includes(item)))errors.push('information_policy_invalid')
  return freeze({ok:errors.length===0,errors:[...new Set(errors)],policy,binding:binding.binding})
}

export function buildInformationResource(input={}){
  const resource={resourceId:text(input.resourceId),resourceType:key(input.resourceType),organisationId:text(input.organisationId),attorneyFirmId:text(input.attorneyFirmId),transactionId:text(input.transactionId),branchId:text(input.branchId),teamId:text(input.teamId),assignedUserId:text(input.assignedUserId),classifications:unique(input.classifications),ethicalWallId:text(input.ethicalWallId),retentionClass:key(input.retentionClass)||'matter_record',retainUntil:iso(input.retainUntil),legalHold:input.legalHold===true,exportPolicy:key(input.exportPolicy)||'watermarked',explicitUserActions:Object.fromEntries(Object.entries(input.explicitUserActions||{}).map(([userId,actions])=>[text(userId),unique(actions)]))}
  resource.fingerprint=fingerprint(resource);const errors=[]
  if(!resource.resourceId||!resource.resourceType||!UUID.test(resource.organisationId)||!UUID.test(resource.attorneyFirmId)||!UUID.test(resource.transactionId)||!resource.classifications.length||resource.classifications.some((item)=>!INFORMATION_CLASSIFICATIONS.includes(item))||!['prohibited','attorney_only','watermarked','standard'].includes(resource.exportPolicy))errors.push('information_resource_invalid')
  return freeze({ok:errors.length===0,errors,resource})
}

function activeWindow(record,asOf,maxHours){const starts=iso(record?.startsAt);const ends=iso(record?.endsAt);if(!starts||!ends)return false;const duration=(new Date(ends)-new Date(starts))/36e5;return new Date(starts)<=new Date(asOf)&&new Date(ends)>new Date(asOf)&&duration>0&&duration<=maxHours}
function validBreakGlass({breakGlass,actor,resource,policy,action,asOf}){return action==='view'&&policy.breakGlassClassifications.some((item)=>resource.classifications.includes(item))&&text(breakGlass?.requestedBy)===actor.userId&&UUID.test(text(breakGlass?.approvedBy))&&text(breakGlass.approvedBy)!==actor.userId&&[R.firmManager,R.supervisingAttorney].includes(key(breakGlass.approvedByRole))&&text(breakGlass.reason)&&text(breakGlass.incidentReference)&&iso(breakGlass.approvedAt)&&activeWindow({startsAt:breakGlass.approvedAt,endsAt:breakGlass.expiresAt},asOf,policy.maximumBreakGlassMinutes/60)}

export function evaluateInformationAccess(input={}){
  const policyResult=buildInformationGovernancePolicy(input.policy||{});const resourceResult=buildInformationResource(input.resource||{});const actorResult=buildPracticeActor(input.actor||{});const policy=policyResult.policy;const resource=resourceResult.resource;const actor=actorResult.actor;const action=key(input.action);const asOf=iso(input.requestedAt)||new Date().toISOString();const blockers=[...policyResult.errors,...resourceResult.errors,...actorResult.errors];const basis=[];const obligations=['append_access_decision_audit']
  if(!INFORMATION_ACTIONS.includes(action))blockers.push('information_action_invalid')
  if(actor.organisationId!==resource.organisationId||actor.attorneyFirmId!==resource.attorneyFirmId||policy.organisationId!==resource.organisationId||policy.attorneyFirmId!==resource.attorneyFirmId)blockers.push('information_tenant_binding_mismatch')
  const membership=input.membership||{};let matterAccess=membership.active===true&&text(membership.organisationId)===resource.organisationId&&text(membership.attorneyFirmId)===resource.attorneyFirmId&&(membership.allMatters===true||(membership.transactionIds||[]).map(text).includes(resource.transactionId));const branchMissing=Boolean(resource.branchId)&&!(membership.branchIds||[]).map(text).includes(resource.branchId);const teamMissing=Boolean(resource.teamId)&&!(membership.teamIds||[]).map(text).includes(resource.teamId);let substitutionGrantsAction=false;let delegationGrantsAction=false
  const substitution=input.substitution||null
  if(!matterAccess&&substitution&&text(substitution.substituteUserId)===actor.userId&&text(substitution.absentUserId)===resource.assignedUserId&&UUID.test(text(substitution.approvedBy))&&text(substitution.approvedBy)!==actor.userId&&activeWindow(substitution,asOf,policy.maximumDelegationHours)&&!['approve','export','share','delete','dispose'].includes(action)&&resource.classifications.every((classification)=>(ACCESS[classification]?.[key(substitution.absentRole)]||[]).includes(action))){matterAccess=true;substitutionGrantsAction=true;basis.push('active_substitution');obligations.push('record_substitute_access')}
  const delegation=input.delegation||null
  if(!matterAccess&&delegation&&text(delegation.delegateUserId)===actor.userId&&text(delegation.transactionId)===resource.transactionId&&(delegation.actions||[]).map(key).includes(action)&&UUID.test(text(delegation.delegatedBy))&&activeWindow(delegation,asOf,policy.maximumDelegationHours)&&!['approve','delete','dispose'].includes(action)&&resource.classifications.every((classification)=>(ACCESS[classification]?.[key(delegation.delegatorRole)]||[]).includes(action))){matterAccess=true;delegationGrantsAction=true;basis.push('temporary_delegation');obligations.push('record_delegated_access')}
  const explicitActions=resource.explicitUserActions[actor.userId]||[];if(explicitActions.includes(action)){matterAccess=true;basis.push('explicit_resource_grant')}
  const wall=(input.ethicalWalls||[]).find((item)=>text(item.wallId)===resource.ethicalWallId);const wallDenied=Boolean(wall)&&((wall.deniedUserIds||[]).map(text).includes(actor.userId)||(wall.deniedRoles||[]).map(key).includes(actor.role)||(wall.deniedTeamIds||[]).map(text).some((team)=> (membership.teamIds||[]).map(text).includes(team)))&&!((wall.allowedUserIds||[]).map(text).includes(actor.userId))
  const emergency=validBreakGlass({breakGlass:input.breakGlass,actor,resource,policy,action,asOf})
  if(wallDenied&&!emergency)blockers.push('information_ethical_wall_denied')
  if(emergency){matterAccess=true;basis.push('approved_break_glass');obligations.push('notify_privacy_and_firm_manager','expire_emergency_access')}
  if(membership.onLeave===true&&!emergency)blockers.push('information_actor_on_leave')
  if(branchMissing&&!emergency&&!substitutionGrantsAction&&!delegationGrantsAction&&!explicitActions.includes(action))blockers.push('information_branch_access_missing')
  if(teamMissing&&!emergency&&!substitutionGrantsAction&&!delegationGrantsAction&&!explicitActions.includes(action))blockers.push('information_team_access_missing')
  if(!matterAccess)blockers.push('information_matter_membership_required')
  const roleAllowed=resource.classifications.every((classification)=>(ACCESS[classification]?.[actor.role]||[]).includes(action))
  if(!roleAllowed&&!explicitActions.includes(action)&&!emergency&&!substitutionGrantsAction&&!delegationGrantsAction)blockers.push('information_classification_action_denied')
  if((action==='export'||action==='share')&&resource.exportPolicy==='prohibited')blockers.push('information_export_prohibited')
  if((action==='export'||action==='share')&&resource.exportPolicy==='attorney_only'&&![R.responsibleAttorney,R.supervisingAttorney].includes(actor.role))blockers.push('information_export_attorney_only')
  if((action==='delete'||action==='dispose')&&resource.legalHold)blockers.push('information_legal_hold_active')
  if((action==='delete'||action==='dispose')&&resource.retainUntil&&new Date(resource.retainUntil)>new Date(asOf))blockers.push('information_retention_period_active')
  if(['download','export'].includes(action)&&resource.classifications.some((classification)=>policy.requireWatermarkFor.includes(classification)))obligations.push('watermark_export','record_export_receipt')
  if(action==='share')obligations.push('validate_every_recipient','record_share_receipt')
  if(!basis.length&&roleAllowed&&matterAccess)basis.push('role_and_matter_membership')
  const decision={version:CONVEYANCER_INFORMATION_GOVERNANCE_VERSION,decisionId:text(input.decisionId),resourceId:resource.resourceId,organisationId:resource.organisationId,attorneyFirmId:resource.attorneyFirmId,transactionId:resource.transactionId,userId:actor.userId,role:actor.role,action,allowed:blockers.length===0,basis:[...new Set(basis)],blockers:[...new Set(blockers)],obligations:[...new Set(obligations)].sort(),policy:{policyId:policy.policyId,policyVersion:policy.policyVersion,policyFingerprint:policy.fingerprint},resourceFingerprint:resource.fingerprint,requestedAt:asOf,purpose:text(input.purpose),channel:key(input.channel)||'application'}
  if(!decision.decisionId||!decision.purpose)decision.blockers.push('information_access_request_invalid');decision.allowed=decision.blockers.length===0;decision.fingerprint=fingerprint(decision)
  return freeze(decision)
}

export function buildInformationAccessMatrix(input={}){const decisions=Object.fromEntries(INFORMATION_ACTIONS.map((action)=>[action,evaluateInformationAccess({...input,decisionId:`${text(input.decisionIdPrefix)||'access'}:${action}`,action})]));return freeze({version:CONVEYANCER_INFORMATION_GOVERNANCE_VERSION,canSelect:decisions.view.allowed,canUpdate:decisions.edit.allowed,canApprove:decisions.approve.allowed,canDownload:decisions.download.allowed,canExport:decisions.export.allowed,canShare:decisions.share.allowed,canDelete:decisions.delete.allowed,canDispose:decisions.dispose.allowed,decisions,advisory:'RLS-ready decision input; database RLS remains authoritative.'})}

export function buildInformationAccessAuditEvent({decision={},eventId='',detailReference='',detailHash='',occurredAt=''}={}){return buildPracticeAuditEvent({eventId,eventType:decision.allowed?'information_access_allowed':'information_access_denied',operationId:decision.decisionId,organisationId:decision.organisationId,attorneyFirmId:decision.attorneyFirmId,transactionId:decision.transactionId,actorUserId:decision.userId,capability:`information_${decision.action}`,reason:decision.allowed?`Allowed by ${decision.basis.join(', ')}`:`Denied: ${decision.blockers.join(', ')}`,occurredAt:occurredAt||decision.requestedAt,correlationId:decision.decisionId,detailReference,detailHash,contractVersion:CONVEYANCER_PRACTICE_OPERATIONS_VERSION})}
