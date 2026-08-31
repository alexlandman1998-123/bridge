export const RENTAL_LEAD_CLASSIFICATION_VERSION = 'arch9_rental_lead_classification_v1'
export const RENTAL_LEAD_STAGES = Object.freeze(['new', 'contacted', 'viewing', 'application'])
const text=(v)=>String(v??'').trim()
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
export function createRentalLeadClassification({ leadId='', organisationId='', vacancyId='', unitId='', assignedAgentId='', source='' }={}){if(!text(leadId)||!text(organisationId)||!text(vacancyId)||!text(unitId))throw new Error('Lead, organisation, vacancy and unit are required.');return {leadId:text(leadId),organisationId:text(organisationId),vacancyId:text(vacancyId),unitId:text(unitId),assignedAgentId:text(assignedAgentId)||null,source:text(source)||'manual',stage:'new',classification:'rental'}}
export function getRentalLeadMetadata(lead={}){
  const raw=object(lead.rawEnquiryPayload||lead.raw_enquiry_payload||lead.raw||lead.metadata||lead)
  return {...raw,role:text(raw.role||lead.rentalLeadRole||lead.rental_lead_role),stage:text(raw.stage||lead.rentalStage||lead.rental_stage||lead.stage),classification:text(raw.classification||lead.classification||lead.lead_classification)}
}
export function isRentalLead(lead={}){const metadata=getRentalLeadMetadata(lead);return text(metadata.classification).toLowerCase()==='rental'||metadata.arch9RentalLead===true}
