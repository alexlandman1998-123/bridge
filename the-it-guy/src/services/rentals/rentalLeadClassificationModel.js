import {
  createRentalCrmLeadMetadata,
  getRentalCrmLeadMetadata,
  isRentalCrmLead,
} from './rentalCrmLeadModel.js'
import { RENTAL_LEAD_PIPELINE_STAGES } from './rentalLeadPipelineModel.js'

export const RENTAL_LEAD_CLASSIFICATION_VERSION = 'arch9_rental_lead_classification_v2'
export const RENTAL_LEAD_STAGES = RENTAL_LEAD_PIPELINE_STAGES

export function createRentalLeadClassification({ leadId = '', organisationId = '', vacancyId = '', unitId = '', assignedAgentId = '', source = '', role = 'tenant' } = {}) {
  if (!String(leadId).trim()) throw new Error('Lead is required.')
  return createRentalCrmLeadMetadata({
    leadId,
    organisationId,
    role,
    assignedAgentId,
    source,
    relationships: { vacancyId, unitId },
  })
}

export function getRentalLeadMetadata(lead = {}) {
  return getRentalCrmLeadMetadata(lead)
}

export function isRentalLead(lead = {}) {
  return isRentalCrmLead(lead)
}
