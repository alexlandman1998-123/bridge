import { listRentalLeadFollowUps } from './rentalLeadFollowUpService'
import { listRentalLeads } from './rentalLeadService'
import { buildRentalLeadManagementReport } from './rentalLeadManagementReportModel'

export async function getRentalLeadManagementReport(organisationId, options = {}, now = new Date()) {
  const reportOptions = { ...options, includeClosed: true }
  const [leads, tasks] = await Promise.all([listRentalLeads(organisationId, reportOptions), listRentalLeadFollowUps(organisationId, reportOptions)])
  return buildRentalLeadManagementReport({ leads, tasks, now })
}
