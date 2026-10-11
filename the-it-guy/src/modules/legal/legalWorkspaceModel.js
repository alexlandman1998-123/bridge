export const DISCIPLINE_LABELS = Object.freeze({wills_estates:'Wills & Estates',trusts:'Trusts',debt_collection:'Debt Collection',family_law:'Family Law'});
export function legalPilotAllowed(env, role, organisationId) {
  return role === 'attorney' && env.VITE_ARCH9_LEGAL_ENABLED === 'true' && Boolean(organisationId);
}
export function permittedDisciplines(context) {
  if (!context?.enabled || !context.capabilities) return [];
  return (context.settings?.disciplines || []).filter(d=>DISCIPLINE_LABELS[d] &&
    (context.capabilities.disciplines.includes(d) || (context.capabilities.can_manage && context.grants?.length>0)));
}
export const preferenceKey = (user, firm) => `arch9:legal-workspace:v1:${user}:${firm}`;
export function legalError(error) {
  if (error?.code==='42501') return 'Your access has changed. Return to Conveyancing or reload.';
  if (error?.code==='40001') return 'This matter changed. Reload before saving.';
  return error?.message || 'Could not save. Retry the same request or reload.';
}
export function firmCandidate(rows, organisationId, allowedFirmIds) {
  const eligible=rows.filter(r=>r.organisation_id===organisationId&&allowedFirmIds.includes(r.id));
  return eligible.length===1?eligible[0]:null;
}
