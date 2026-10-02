import { getBranch, readScopedBranchRows } from './agencyBranchService'

function mergeSources(results, identity) {
  return { rows: [...new Map(results.flatMap((result) => result.rows).map((row) => [row[identity], row])).values()], available: results.every((result) => result.available) }
}

export async function getBranchDashboardData(branchId) {
  const branch = await getBranch(branchId)
  if (!branch) throw new Error('Branch not found or no longer accessible.')
  const organisationId = branch.organisationId
  const listingIds = branch.listings.map((row) => row.id)
  const leadIds = branch.leads.map((row) => row.lead_id)
  const transactionIds = branch.transactions.map((row) => row.id)
  const [appointmentByListing, appointmentByLead, appointmentByTransaction, offerByListing, offerByLead, offerByTransaction, activities, commissions, history, contacts] = await Promise.all([
    readScopedBranchRows('appointments', organisationId, 'listing_id', listingIds, 'appointment_id'),
    readScopedBranchRows('appointments', organisationId, 'lead_id', leadIds, 'appointment_id'),
    readScopedBranchRows('appointments', organisationId, 'transaction_id', transactionIds, 'appointment_id'),
    readScopedBranchRows('offers', organisationId, 'listing_id', listingIds),
    readScopedBranchRows('offers', organisationId, 'buyer_lead_id', leadIds),
    readScopedBranchRows('offers', organisationId, 'transaction_id', transactionIds),
    readScopedBranchRows('lead_activities', organisationId, 'lead_id', leadIds, 'activity_id'),
    readScopedBranchRows('transaction_commissions', organisationId, 'transaction_id', transactionIds),
    readScopedBranchRows('workflow_audit_log', organisationId, 'transaction_id', transactionIds),
    readScopedBranchRows('contacts', organisationId, 'contact_id', branch.leads.map((lead) => lead.contact_id), 'contact_id'),
  ])
  const appointments = mergeSources([appointmentByListing, appointmentByLead, appointmentByTransaction], 'appointment_id')
  const offers = mergeSources([offerByListing, offerByLead, offerByTransaction], 'id')
  const contactById = new Map(contacts.rows.map((contact) => [contact.contact_id, contact]))
  const leads = branch.leads.map((lead) => {
    const contact = contactById.get(lead.contact_id) || {}
    return { ...lead, name: lead.name || lead.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' '), phone: lead.phone || contact.phone || '', email: lead.email || contact.email || '' }
  })
  const availability = branch.dataAvailability
  return { ...branch, leads, appointments: appointments.rows, offers: offers.rows, leadActivities: activities.rows, commissionSnapshots: commissions.rows, transactionHistory: history.rows, dataAvailability: { ...availability, appointments: appointments.available && availability.listings && availability.leads && availability.transactions, offers: offers.available && availability.listings && availability.leads && availability.transactions, leadActivities: activities.available, commissionSnapshots: commissions.available, transactionHistory: history.available } }
}
