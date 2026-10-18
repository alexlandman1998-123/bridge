import { invokeEdgeFunction } from '../lib/supabaseClient'

export async function metaIntegrationRequest(organisationId, action, fields = {}) {
  if (!organisationId) throw new Error('Choose an organisation workspace.')
  const response = await invokeEdgeFunction('meta-integrations', { body: { ...fields, organisationId, action } })
  if (response?.error) throw new Error(response.error.message || 'The Meta integration service could not be reached.')
  if (response?.data?.error) throw new Error(response.data.error)
  if (!response?.data) throw new Error('The Meta integration service returned no data.')
  return response.data
}

let sdkPromise
export function prepareFacebookSdk(appId, version) {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const initialize = () => {
      try {
        window.FB.init({ appId, version, autoLogAppEvents: false, xfbml: false })
        resolve(window.FB)
      } catch { sdkPromise = null; reject(new Error('Meta login could not be initialized. Reload and try again.')) }
    }
    if (window.FB) { initialize(); return }
    window.fbAsyncInit = initialize
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.onerror = () => { sdkPromise = null; script.remove(); reject(new Error('Meta login could not load. Check whether your browser blocks Facebook connections.')) }
    document.head.appendChild(script)
  })
  return sdkPromise
}

export function launchWhatsAppSignup({ sdk, intent, organisationId, coexistence = false, signal }) {
  return new Promise((resolve, reject) => {
    let assets, exchanged = false, finishing = false, stopped = false
    const cleanup = () => { stopped = true; window.removeEventListener('message', onMessage); signal?.removeEventListener('abort', onAbort); window.clearTimeout(timer) }
    const fail = (error) => { if (!stopped) { cleanup(); reject(error instanceof Error ? error : new Error('WhatsApp connection did not finish.')) } }
    const finish = async () => {
      if (stopped || finishing || !exchanged || !assets) return
      if (!/^[0-9]{1,32}$/.test(String(assets.waba_id||''))) { fail(new Error('Meta did not return a business account. Restart the connection.')); return }
      finishing = true
      try {
        const result = await metaIntegrationRequest(organisationId, 'finish_whatsapp', { state: intent.state, wabaId: assets.waba_id, phoneNumberId: assets.phone_number_id || '' })
        if (!stopped) { cleanup(); resolve(result) }
      } catch (error) { fail(error) }
    }
    function onMessage(event) {
      if (!['https://www.facebook.com', 'https://web.facebook.com', 'https://business.facebook.com'].includes(event.origin)) return
      try {
        if (typeof event.data === 'string' && event.data.length > 65536) return
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (['FINISH','FINISH_ONLY_WABA','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING','FINISH_GRANT_ONLY_API_ACCESS'].includes(data.event)) {
          if (data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' && !intent.coexistence) { fail(new Error('Restart the connection using the WhatsApp Business phone app option.')); return }
          if (!assets) { assets = data.data; void finish() }
        }
        else if (data.event === 'CANCEL') fail(new Error('WhatsApp connection was cancelled.'))
        else if (data.event === 'ERROR') fail(new Error('Meta could not complete WhatsApp signup. Check the business account in Meta and try again.'))
      } catch { /* Ignore messages that are not the Meta signup session event. */ }
    }
    const onAbort = () => fail(new Error('WhatsApp connection was closed.'))
    const timer = window.setTimeout(() => fail(new Error('WhatsApp connection expired. Start again.')), 600000)
    signal?.addEventListener('abort', onAbort, { once: true })
    window.addEventListener('message', onMessage)
    if (signal?.aborted) { onAbort(); return }
    sdk.login(async response => {
      if (stopped) return
      if (!response.authResponse?.code) { fail(new Error('Meta did not authorize the WhatsApp connection.')); return }
      try {
        // Exchange immediately: Meta codes expire before the whole session does.
        await metaIntegrationRequest(organisationId, 'exchange_whatsapp_code', { state: intent.state, code: response.authResponse.code })
        exchanged = true
        void finish()
      } catch (error) { fail(error) }
    }, { config_id: intent.configurationId, response_type: 'code', override_default_response_type: true, extras: { ...((intent.coexistence ?? coexistence) ? { featureType: 'whatsapp_business_app_onboarding' } : {}) } })
  })
}
