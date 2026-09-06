import { assertEdgeFunctionSuccess, invokeEdgeFunction } from '../lib/supabaseClient'

async function call(action, organisationId, payload = {}) {
  const result = await invokeEdgeFunction('meta-lead-ads-admin', {
    body: { action, organisationId, ...payload },
  })
  assertEdgeFunctionSuccess(result, 'Meta Lead Ads request failed.')
  const { data } = result
  if (data?.error) throw new Error(data.error)
  return data || {}
}

export async function startMetaLeadAdsAuthorization(organisationId, returnUrl) {
  const result = await call('start_authorization', organisationId, { returnUrl })
  const state = new URL(result.authorizationUrl).searchParams.get('state') || ''
  if (state && typeof sessionStorage !== 'undefined') sessionStorage.setItem(`arch9:meta-lead-ads:${organisationId}`, state)
  return result.authorizationUrl
}
export const listMetaLeadAdsConnections = (organisationId) => call('list', organisationId)
export const completeMetaLeadAdsAuthorization = (organisationId, state) => call('complete_authorization', organisationId, { state })
export const connectMetaLeadAdsPage = (organisationId, state, pageId) => call('connect_page', organisationId, { state, pageId })
export const listMetaLeadAdsForms = (organisationId, connectionId) => call('list_forms', organisationId, { connectionId })
export const selectMetaLeadAdsForms = (organisationId, connectionId, forms) => call('select_forms', organisationId, { connectionId, forms })
export const listMetaLeadAdsImports = (organisationId, connectionId) => call('list_imports', organisationId, { connectionId })
export const previewMetaLeadAdsImport = (organisationId, connectionId, formId, requestedFrom, requestedTo) => call('preview_import', organisationId, { connectionId, formId, requestedFrom: requestedFrom || null, requestedTo: requestedTo || null })
export const processMetaLeadAdsImportBatch = (organisationId, connectionId, importId) => call('process_import_batch', organisationId, { connectionId, importId })
export const disconnectMetaLeadAds = (organisationId, connectionId) => call('disconnect', organisationId, { connectionId })
