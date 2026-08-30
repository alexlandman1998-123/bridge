export const RENTAL_LEAD_CLASSIFICATION_VERSION = 'arch9_rental_lead_classification_v1'
export const RENTAL_LEAD_STAGES = Object.freeze(['new', 'contacted', 'viewing', 'application'])
const text=(v)=>String(v??'').trim()
export function createRentalLeadClassification({ leadId='', organisationId='', vacancyId='', unitId='', assignedAgentId='', source='' }={}){if(!text(leadId)||!text(organisationId)||!text(vacancyId)||!text(unitId))throw new Error('Lead, organisation, vacancy and unit are required.');return {leadId:text(leadId),organisationId:text(organisationId),vacancyId:text(vacancyId),unitId:text(unitId),assignedAgentId:text(assignedAgentId)||null,source:text(source)||'manual',stage:'new',classification:'rental'}}
export function isRentalLead(lead={}){return text(lead.classification||lead.lead_classification||lead.metadata?.classification).toLowerCase()==='rental'}
