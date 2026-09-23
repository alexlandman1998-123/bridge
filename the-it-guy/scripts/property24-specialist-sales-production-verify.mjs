import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createProperty24Client, normalizeProperty24Text, summarizeProperty24Payload } from '../server/services/property24Client.js'
import { resolveProperty24EnvironmentCredentials } from '../server/property24/environmentService.js'
import { verifyProperty24Phase2Catalogue } from '../server/property24/propertyTypeCatalogue.js'

export async function verifyProperty24SpecialistSalesProduction({ env = process.env, property24 = null } = {}) {
  const runtime = resolveProperty24EnvironmentCredentials({ env, environment: 'production' })
  if (!runtime.configured) {
    return { status: 'BLOCKED', environment: 'production', apiVersion: runtime.apiVersion, missingConfiguration: runtime.missing, safety: { property24ApiCalled: false, listingWritten: false } }
  }
  if (normalizeProperty24Text(runtime.apiVersion).toLowerCase() !== 'v55') {
    return { status: 'BLOCKED', environment: 'production', apiVersion: runtime.apiVersion, missingConfiguration: ['PROPERTY24_PRODUCTION_API_VERSION=v55'], safety: { property24ApiCalled: false, listingWritten: false } }
  }

  const client = property24 || createProperty24Client({
    baseUrl: runtime.baseUrl,
    username: runtime.username,
    password: runtime.password,
    userGroupId: runtime.sendUserGroupHeader ? runtime.userGroupId : '',
    apiVersion: runtime.apiVersion,
  })
  try {
    const response = await client.fetchPropertyTypes(1)
    const catalogue = verifyProperty24Phase2Catalogue(response.data)
    return {
      status: catalogue.matches ? 'PASS' : 'BLOCKED',
      environment: 'production',
      apiVersion: runtime.apiVersion,
      safety: { property24ApiCalled: true, listingWritten: false },
      propertyTypes: { httpStatus: response.status, response: summarizeProperty24Payload(response.data), catalogue },
    }
  } catch (error) {
    return {
      status: 'FAILED',
      environment: 'production',
      apiVersion: runtime.apiVersion,
      safety: { property24ApiCalled: true, listingWritten: false },
      error: { name: error.name || 'Error', message: error.message, httpStatus: error.status || null, response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null },
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  verifyProperty24SpecialistSalesProduction()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
      if (report.status !== 'PASS') process.exitCode = 1
    })
    .catch((error) => {
      console.error(JSON.stringify({ status: 'FAILED', message: error.message }, null, 2))
      process.exitCode = 1
    })
}
