import { supabase } from '../lib/supabaseClient'

async function call(action, organisationId, payload = {}) {
  if (!supabase) throw new Error('Supabase is required for Meta Lead Ads.')
  const { data, error } = await supabase.functions.invoke('meta-lead-ads-admin', { body: { action, organisationId, ...payload } })
  if (error) throw error
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
export const disconnectMetaLeadAds = (organisationId, connectionId) => call('disconnect', organisationId, { connectionId })
