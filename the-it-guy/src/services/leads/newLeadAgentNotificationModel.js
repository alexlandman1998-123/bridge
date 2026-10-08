import { isRentalCrmLead } from '../rentals/rentalCrmLeadModel.js'

const text = (value) => String(value ?? '').trim()
const email = (value) => text(value).toLowerCase()

export function buildNewLeadAgentNotification({ organisationId, lead = {}, contact = {}, appUrl = 'https://app.arch9.co.za', externalReference = '' }) {
  const leadId = text(lead.leadId || lead.lead_id || lead.id)
  const ownerId = text(lead.assignedUserId || lead.assigned_user_id || lead.assignedAgentId || lead.assigned_agent_id)
  const recipient = email(lead.assignedAgentEmail || lead.assigned_agent_email)
  if (!leadId || !organisationId || !recipient) return null
  const leadOrganisationId = text(lead.organisationId || lead.organisation_id)
  const contactOrganisationId = text(contact.organisationId || contact.organisation_id)
  if ((leadOrganisationId && leadOrganisationId !== organisationId) || (contactOrganisationId && contactOrganisationId !== organisationId)) throw new Error('Lead notification organisation does not match the saved record.')
  const name = text([contact.firstName || contact.first_name, contact.lastName || contact.last_name].filter(Boolean).join(' ')) || text(lead.name || [lead.sellerName, lead.sellerSurname].filter(Boolean).join(' ')) || 'New lead'
  const source = text(lead.leadSource || lead.lead_source) || 'Manual Entry'
  const agentName = text(lead.assignedAgentName || lead.assigned_agent_name) || 'Agent'
  const property = text(lead.enquiredPropertyAddress || lead.enquired_property_address || lead.sellerPropertyAddress || lead.seller_property_address || lead.formattedAddress || lead.propertyInterest || lead.property_interest || lead.enquiredPropertyTitle || lead.enquired_property_title)
  const category = text(lead.leadCategory || lead.lead_category) || 'Lead'
  const baseUrl = text(appUrl).replace(/\/+$/, '')
  const rental = isRentalCrmLead(lead)
  const subjectCategory = rental ? 'rental ' : ['buyer', 'seller'].includes(category.toLowerCase()) ? `${category.toLowerCase()} ` : ''
  const route = rental ? '/agent/rentals/pipeline/leads' : '/pipeline/leads'
  return {
    type: 'lead_operations_notification', eventKind: 'new_enquiry_assigned_agent',
    to: recipient, recipientName: agentName, recipientRole: 'agent',
    organisationId, branchId: text(lead.branchId || lead.branch_id), leadId,
    assignedUserId: ownerId, assignedAgentName: agentName, assignedAgentEmail: recipient,
    leadName: name, leadEmail: email(contact.email || lead.email || lead.sellerEmail), leadPhone: text(contact.phone || lead.phone || lead.sellerPhone),
    leadSource: source, leadCategory: category, leadStatus: text(lead.status || lead.stage) || 'New Lead',
    propertyLabel: property, enquiryMessage: text(lead.notes),
    actionLink: `${baseUrl}${route}/${encodeURIComponent(leadId)}`,
    subject: `New ${subjectCategory}lead: ${source}`,
    title: 'A new lead just landed',
    message: `${name === 'New lead' ? `You have a new ${subjectCategory}lead` : `${name} is your new ${subjectCategory}lead`}${source === 'Manual Entry' ? '' : ` from ${source}`}. Their details are ready below. Take a look and say hello.`,
    source: 'agency_crm_new_lead',
    idempotencyKey: externalReference ? `portal-lead-agent-notification:${externalReference}:${recipient}` : `new-lead-agent:${organisationId}:${leadId}:${ownerId || recipient}`,
  }
}
