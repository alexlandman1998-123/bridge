import { invokeEdgeFunction } from '../lib/supabaseClient'

export async function metaIntegrationRequest(organisationId, action, fields = {}) {
  if (!organisationId) throw new Error('Choose an organisation workspace.')
  const response = await invokeEdgeFunction('meta-integrations', { body: { ...fields, organisationId, action } })
  if (response?.error) throw Object.assign(new Error(response.error.message || 'The Meta integration service could not be reached.'), {status:response.error.context?.status})
  if (response?.data?.error) throw new Error(response.data.error)
  if (!response?.data) throw new Error('The Meta integration service returned no data.')
  return response.data
}

let sdkPromise
let sdkConfiguration
export function prepareFacebookSdk(appId, version) {
  if (!appId || !version) return Promise.reject(new Error('WhatsApp login is not configured. Contact your administrator.'))
  const configuration = `${appId}:${version}`
  if (sdkPromise && sdkConfiguration === configuration) return sdkPromise
  sdkConfiguration = configuration
  const loading = new Promise((resolve, reject) => {
    let settled = false, script
    const fail = message => {
      if (settled) return
      settled = true; window.clearTimeout(timer); script?.remove()
      reject(new Error(message))
    }
    const timer = window.setTimeout(() => fail('Meta login took too long to load. Check your connection and try again.'), 20000)
    const initialize = () => {
      if (settled) return
      try {
        if (typeof window.FB?.init !== 'function' || typeof window.FB?.login !== 'function') throw new Error('Invalid SDK')
        window.FB.init({ appId, version, autoLogAppEvents: false, xfbml: false })
        settled = true; window.clearTimeout(timer); resolve(window.FB)
      } catch { fail('Meta login could not be initialized. Reload and try again.') }
    }
    if (window.FB) { initialize(); return }
    window.fbAsyncInit = initialize
    script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.onerror = () => fail('Meta login could not load. Check whether your browser blocks Facebook connections.')
    document.head.appendChild(script)
  })
  sdkPromise = loading
  void loading.catch(() => { if (sdkPromise === loading) sdkPromise = null })
  return loading
}

export function launchWhatsAppSignup({ sdk, intent, organisationId, coexistence = false, signal }) {
  return new Promise((resolve, reject) => {
    let assets, exchanged = false, exchanging = false, finishing = false, stopped = false
    const cleanup = () => { stopped = true; window.removeEventListener('message', onMessage); signal?.removeEventListener('abort', onAbort); window.clearTimeout(timer) }
    const fail = (error) => { if (!stopped) { cleanup(); reject(error instanceof Error ? error : new Error('WhatsApp connection did not finish.')) } }
    const finish = async () => {
      if (stopped || finishing || !exchanged || !assets) return
      if (!/^[0-9]{1,32}$/.test(String(assets.waba_id || ''))) { fail(new Error('Meta did not return a business account. Start the connection again.')); return }
      finishing = true
      try {
        const result = await metaIntegrationRequest(organisationId, 'finish_whatsapp', { state: intent.state, wabaId: assets.waba_id, phoneNumberId: assets.phone_number_id })
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
          if (data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' && !(intent.coexistence ?? coexistence)) { fail(new Error('Restart the connection using the WhatsApp Business phone app option.')); return }
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
    // FB.login checks the callback's function type and rejects AsyncFunction.
    // Keep this callback synchronous; handle the exchange promise separately.
    try {
      sdk.login(response => {
        if (stopped || exchanging || exchanged) return
        if (!response?.authResponse?.code) { fail(new Error('Meta did not authorize the WhatsApp connection.')); return }
        exchanging = true
        void metaIntegrationRequest(organisationId, 'exchange_whatsapp_code', { state: intent.state, code: response.authResponse.code })
          .then(() => { if (!stopped) { exchanged = true; void finish() } })
          .catch(fail)
      }, { config_id: intent.configurationId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, ...((intent.coexistence ?? coexistence) ? { featureType: 'whatsapp_business_app_onboarding' } : {}) } })
    } catch (error) { fail(error) }
  })
}
