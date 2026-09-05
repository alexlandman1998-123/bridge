import {
  createAgencyCrmLeadActivity,
  createAgencyCrmLeadRecord,
  fetchAgencyCrmLeadWorkspace,
  listAgencyCrmLeadContacts,
  updateAgencyCrmLeadRecord,
} from '../../lib/agencyCrmRepository'
import { getRentalLeadMetadata, isRentalLead } from './rentalLeadClassificationModel'
import { createRentalCrmLeadMetadata, patchRentalCrmLeadMetadata } from './rentalCrmLeadModel'
import { appendRentalLeadWorkflowEvidence, buildRentalLeadWorkflowEvidence } from './rentalLeadWorkflowEvidenceModel'
import { getRentalLeadOutcome, isRentalLeadOperational } from './rentalLeadOutcomeModel'
import {
  getRentalLeadNextAction,
  getRentalLeadStageLabel,
  normaliseRentalLeadStage,
  resolveRentalLeadRole,
  transitionRentalLead,
} from './rentalLeadPipelineModel'

export const RENTAL_LEAD_SERVICE_VERSION = 'arch9_rental_lead_service_v1'

function text(value) { return String(value ?? '').trim() }
function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}
function contactName(contact = {}) { return [text(contact.firstName), text(contact.lastName)].filter(Boolean).join(' ') || 'Unnamed lead' }
function workflowEvidenceSummary(evidence = {}) {
  return [evidence.note, evidence.scheduledFor && `Scheduled: ${evidence.scheduledFor}`, evidence.mandateReference && `Mandate: ${evidence.mandateReference}`, evidence.applicationReference && `Application: ${evidence.applicationReference}`, evidence.ficaReference && `FICA: ${evidence.ficaReference}`, evidence.viewingOutcome && `Viewing: ${evidence.viewingOutcome}`].filter(Boolean).join(' · ')
}

function buildRentalLeadPayload(form = {}, role, context = {}, stage = 'new') {
  return createRentalCrmLeadMetadata({
    organisationId: context.organisationId,
    role,
    stage,
    source: text(form.source) || 'manual',
    campaign: text(form.campaign),
    branchId: text(context.branchId),
    assignedAgentId: text(context.assignedAgent?.userId || context.assignedAgent?.id),
    relationships: {
      portfolioId: text(form.portfolioId),
      propertyId: text(form.propertyId),
      unitId: text(form.unitId),
      vacancyId: text(form.vacancyId),
    },
    consents: form.consents,
    ingestion: form.ingestion,
    qualification: {
      desiredArea: text(form.desiredArea),
      monthlyBudget: numberOrNull(form.monthlyBudget),
      bedrooms: numberOrNull(form.bedrooms),
      occupationDate: text(form.occupationDate),
      pets: text(form.pets),
    },
    legacy: {
    propertyAddress: text(form.propertyAddress),
    propertyType: text(form.propertyType),
    expectedMonthlyRent: numberOrNull(form.expectedMonthlyRent),
    desiredArea: text(form.desiredArea),
    monthlyBudget: numberOrNull(form.monthlyBudget),
    bedrooms: numberOrNull(form.bedrooms),
    occupationDate: text(form.occupationDate),
    pets: text(form.pets),
    },
  })
}

export function buildRentalLeadView(lead = {}, contact = {}) {
  const metadata = getRentalLeadMetadata(lead)
  const role = resolveRentalLeadRole(metadata.role || lead.rentalLeadRole)
  const stage = normaliseRentalLeadStage(metadata.stage || lead.rentalStage || lead.stage, role)
  const isLandlord = role === 'landlord'
  const propertyAddress = text(metadata.propertyAddress || lead.sellerPropertyAddress || lead.formattedAddress)
  const desiredArea = text(metadata.desiredArea || lead.areaInterest)
  return {
    id: text(lead.leadId || lead.lead_id), raw: lead, role, stage, leadType: metadata.leadType,
    stageLabel: getRentalLeadStageLabel(stage, role), nextAction: getRentalLeadNextAction(stage, role),
    name: contactName(contact), email: text(contact.email || lead.sellerEmail), phone: text(contact.phone || lead.sellerPhone),
    source: text(lead.leadSource) || 'Manual', assignedAgentName: text(lead.assignedAgentName || lead.assignedAgentEmail) || 'Unassigned',
    propertyAddress, propertyType: text(metadata.propertyType), expectedMonthlyRent: numberOrNull(metadata.expectedMonthlyRent),
    desiredArea, monthlyBudget: numberOrNull(metadata.monthlyBudget || lead.budget), bedrooms: numberOrNull(metadata.bedrooms),
    occupationDate: text(metadata.occupationDate), pets: text(metadata.pets),
    campaign: text(metadata.campaign), relationships: metadata.relationships, consents: metadata.consents, ingestion: metadata.ingestion || {}, workflow: metadata.workflow || {}, outcome: getRentalLeadOutcome(lead),
    focus: isLandlord ? propertyAddress || 'Property details pending' : desiredArea || 'Rental requirement pending',
    createdAt: lead.createdAt, updatedAt: lead.updatedAt,
  }
}

export async function listRentalLeads(organisationId, options = {}) {
  const records = await listAgencyCrmLeadContacts(organisationId, {
    includeLocalFallback: false, includePrimaryRecords: true, includeRelatedRecords: false, ...options,
  })
  const contacts = new Map((records.contacts || []).map((contact) => [text(contact.contactId), contact]))
  const assignedAgentId = text(options.assignedAgentId)
  const branchId = text(options.branchId)
  const scopeLevel = text(options.scopeLevel)
  const includeAllOrganisationLeads = options.includeAllOrganisationLeads === true

  return (records.leads || [])
    .filter(isRentalLead)
    .filter((lead) => options.includeClosed === true || isRentalLeadOperational(lead))
    .filter((lead) => {
      if (includeAllOrganisationLeads) return true
      if (scopeLevel === 'branch' && branchId) return text(lead.branchId) === branchId
      if (!assignedAgentId) return false
      return [lead.assignedAgentId, lead.assignedUserId, lead.createdBy]
        .map(text)
        .includes(assignedAgentId)
    })
    .map((lead) => buildRentalLeadView(lead, contacts.get(text(lead.contactId))))
}

export async function getRentalLeadWorkspace(organisationId, leadId, options = {}) {
  const visibleLeads = await listRentalLeads(organisationId, options)
  if (!visibleLeads.some((lead) => lead.id === text(leadId))) throw new Error('This rental lead is not available in your current scope.')
  const workspace = await fetchAgencyCrmLeadWorkspace(organisationId, leadId)
  const rawLead = workspace.leads?.[0]
  if (!rawLead || !isRentalLead(rawLead)) throw new Error('Rental lead not found.')
  const contact = (workspace.contacts || []).find((item) => text(item.contactId) === text(rawLead.contactId)) || {}
  return { ...workspace, lead: buildRentalLeadView(rawLead, contact) }
}

export function validateRentalLeadForm(form = {}) {
  const errors = []
  if (!text(form.firstName)) errors.push('First name is required.')
  if (!text(form.phone) && !text(form.email)) errors.push('A phone number or email address is required.')
  if (resolveRentalLeadRole(form.role) === 'landlord' && !text(form.propertyAddress)) errors.push('Property address is required for a landlord lead.')
  if (resolveRentalLeadRole(form.role) === 'tenant' && !text(form.desiredArea)) errors.push('Desired area is required for a tenant lead.')
  return errors
}

export async function createRentalLead(form = {}, context = {}) {
  const errors = validateRentalLeadForm(form)
  if (errors.length) throw new Error(errors.join(' '))
  const role = resolveRentalLeadRole(form.role)
  const rawEnquiryPayload = buildRentalLeadPayload(form, role, { ...context, assignedAgent: context.assignedAgent || context.actor || {} })
  const isLandlord = role === 'landlord'
  const actor = context.actor || {}
  const assignedAgent = context.assignedAgent || actor
  const created = await createAgencyCrmLeadRecord(context.organisationId, {
    contact: { firstName: text(form.firstName), lastName: text(form.lastName), phone: text(form.phone), email: text(form.email), notes: text(form.notes), contactType: isLandlord ? 'Landlord' : 'Tenant' },
    assignedAgent, branchId: text(context.branchId), assignedUserId: text(assignedAgent.userId || assignedAgent.id), createdBy: text(actor.id || actor.userId),
    leadCategory: isLandlord ? 'seller' : 'buyer', leadDirection: text(form.direction) || 'Inbound', leadSource: text(form.source) || 'Manual',
    stage: 'New', status: 'New', priority: text(form.priority) || 'Medium',
    budget: isLandlord ? rawEnquiryPayload.expectedMonthlyRent || 0 : rawEnquiryPayload.monthlyBudget || 0,
    areaInterest: isLandlord ? '' : rawEnquiryPayload.desiredArea,
    propertyInterest: isLandlord ? rawEnquiryPayload.propertyType : `Rental in ${rawEnquiryPayload.desiredArea}`,
    sellerPropertyAddress: isLandlord ? rawEnquiryPayload.propertyAddress : '', formattedAddress: isLandlord ? rawEnquiryPayload.propertyAddress : '',
    notes: text(form.notes), rawEnquiryPayload,
  }, { actor })
  void createAgencyCrmLeadActivity(context.organisationId, created.leadId, {
    agent: assignedAgent, activityType: 'Rental Lead Created', activityNote: `${isLandlord ? 'Landlord' : 'Tenant'} rental lead captured.${rawEnquiryPayload.ingestion?.method === 'csv_import' ? ` Imported from ${rawEnquiryPayload.source}.` : ''}`, outcome: 'Created',
  }, { actor }).catch(() => null)
  return buildRentalLeadView(created, { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone })
}

export async function advanceRentalLead(lead = {}, context = {}) {
  const next = transitionRentalLead(lead, context.toStage)
  const currentMetadata = getRentalLeadMetadata(lead.raw)
  const evidence = buildRentalLeadWorkflowEvidence(lead, next.stage, context.evidence)
  const metadata = patchRentalCrmLeadMetadata(lead.raw, {
    role: next.role,
    stage: next.stage,
    relationships: context.relationships,
    workflow: appendRentalLeadWorkflowEvidence(currentMetadata, evidence),
  })
  const updated = await updateAgencyCrmLeadRecord(context.organisationId, lead.id, {
    stage: getRentalLeadStageLabel(next.stage, next.role), status: getRentalLeadStageLabel(next.stage, next.role), rawEnquiryPayload: metadata,
  })
  void createAgencyCrmLeadActivity(context.organisationId, lead.id, {
    agent: context.actor || {}, activityType: 'Rental Lead Stage Updated', activityNote: [`Moved to ${getRentalLeadStageLabel(next.stage, next.role)}.`, workflowEvidenceSummary(evidence)].filter(Boolean).join(' '), outcome: next.stage,
  }, { actor: context.actor || {} }).catch(() => null)
  return buildRentalLeadView(updated, { firstName: lead.name.split(' ')[0], lastName: lead.name.split(' ').slice(1).join(' '), email: lead.email, phone: lead.phone })
}
