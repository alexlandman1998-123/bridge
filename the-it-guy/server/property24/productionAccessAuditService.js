import { createProperty24Client, summarizeProperty24Payload } from '../services/property24Client.js'
import { verifyProperty24Phase2Catalogue } from './propertyTypeCatalogue.js'

function safeError(error = {}) {
  return {
    message: error.message || 'Property24 request failed.',
    httpStatus: error.status || null,
    statusText: error.statusText || '',
    responseSummary: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  }
}

async function check(report, name, request, { onSuccess } = {}) {
  try {
    const response = await request()
    if (typeof onSuccess === 'function') onSuccess(response.data)
    const result = { name, status: 'PASS', httpStatus: response.status, summary: summarizeProperty24Payload(response.data) }
    report.checks.push(result)
    return result
  } catch (error) {
    const result = { name, status: 'BLOCKED', ...safeError(error) }
    report.checks.push(result)
    return result
  }
}

function skipped(report, name, reason) {
  report.checks.push({ name, status: 'SKIPPED', reason })
}

export async function runProperty24ProductionAccessAudit({
  credentials = {},
  agencyId = '',
  createClient = createProperty24Client,
} = {}) {
  const report = {
    phase: 'property24-production-access-phase1',
    environment: 'production',
    generatedAt: new Date().toISOString(),
    agencyId: String(agencyId || '').trim() || null,
    explicitProductionCredentials: credentials.credentialSource === 'environment_specific',
    userGroupHeader: {
      configured: Boolean(credentials.userGroupId),
      enabled: credentials.sendUserGroupHeader === true,
    },
    checks: [],
    blockers: [],
    status: 'BLOCKED',
  }

  if (!credentials.configured) {
    report.blockers.push('missing_explicit_property24_production_credentials')
    report.missingConfiguration = credentials.missing || []
    return report
  }
  if (!report.agencyId) {
    report.blockers.push('missing_property24_production_agency_id')
    return report
  }

  const baseOptions = {
    baseUrl: credentials.baseUrl,
    username: credentials.username,
    password: credentials.password,
    apiVersion: credentials.apiVersion,
  }
  const unscoped = createClient(baseOptions)
  const basicAuth = await check(report, 'Basic Auth without a user-group header', () => unscoped.echoAuthenticated('Arch9 production access audit'))

  let scoped = unscoped
  if (credentials.sendUserGroupHeader) {
    if (!credentials.userGroupId) {
      report.blockers.push('production_user_group_header_enabled_without_group_id')
      skipped(report, 'Configured user-group authentication', 'No production user-group ID is configured.')
    } else {
      scoped = createClient({ ...baseOptions, userGroupId: credentials.userGroupId })
      const groupAuth = await check(report, 'Configured user-group authentication', () => scoped.echoAuthenticated('Arch9 production group audit'))
      if (basicAuth.status === 'PASS' && groupAuth.status === 'BLOCKED' && groupAuth.httpStatus === 401) {
        report.blockers.push('configured_property24_user_group_rejected')
      }
      if (groupAuth.status !== 'PASS') {
        skipped(report, 'Configured agency access', 'The configured user-group is not authenticated; agency checks were not attempted.')
        return report
      }
    }
  }

  const agency = await check(report, `Configured agency ${report.agencyId}`, () => scoped.fetchAgency(report.agencyId))
  await check(report, `Agents for agency ${report.agencyId}`, () => scoped.fetchAgencyAgents(report.agencyId))
  await check(report, `Listing reconciliation for agency ${report.agencyId}`, () => scoped.fetchListingReconciliation({ agencyId: report.agencyId }))
  await check(report, 'Property type catalogue', () => scoped.fetchPropertyTypes(), {
    onSuccess(records) {
      report.propertyTypeCatalogue = verifyProperty24Phase2Catalogue(records)
      if (!report.propertyTypeCatalogue.matches) report.blockers.push('property24_property_type_catalogue_changed')
    },
  })
  await check(report, 'Listing type catalogue', () => scoped.fetchListingTypes())

  if (agency.status === 'BLOCKED' && agency.httpStatus === 403) report.blockers.push('property24_account_not_authorised_for_configured_agency')
  if (report.checks.some((item) => item.status === 'BLOCKED')) report.blockers.push('property24_read_only_access_check_failed')
  report.blockers = [...new Set(report.blockers)]
  report.status = report.blockers.length ? 'BLOCKED' : 'READY'
  return report
}
