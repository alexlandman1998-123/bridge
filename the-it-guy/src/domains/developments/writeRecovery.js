const pendingRequests = new Map()
const transient = error => !error?.code || Number(error.status) >= 500 || /fetch|network|timeout|connection/i.test(error.message || '')

// Persist only a hash and request ID, never development/seller content. A retry
// after a lost response or browser restart reuses the server's committed receipt.
export async function invokeDevelopmentWrite(client, name, developmentId, parameters, validate = () => true, { requestId: suppliedRequestId } = {}) {
  const session = await client.auth.getSession()
  const actor = session.data?.session?.user?.id
  if (session.error || !actor) throw new Error('Sign in again before saving this development.')
  const bytes = new TextEncoder().encode(JSON.stringify(suppliedRequestId ? [actor, name, developmentId, parameters, suppliedRequestId] : [actor, name, developmentId, parameters]))
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('')
  const key = `arch9:development-write:${actor}:${digest}`
  if (suppliedRequestId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(suppliedRequestId)) {
    throw new Error('Start a new event form before saving.')
  }
  let requestId = suppliedRequestId || pendingRequests.get(key)
  try { requestId ||= globalThis.localStorage?.getItem(key) } catch { /* Current-tab recovery still works. */ }
  if (requestId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)) requestId = null
  requestId ||= crypto.randomUUID()
  pendingRequests.set(key, requestId)
  try { globalThis.localStorage?.setItem(key, requestId) } catch { /* Current-tab recovery still works. */ }
  let result
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { result = await client.rpc(name, { ...parameters, p_development_id: developmentId, p_request_id: requestId }) }
    catch (error) { result = { error } }
    if (!result.error || !transient(result.error)) break
  }
  if (result.error) {
    if (result.error.code === '40001') {
      throw Object.assign(new Error('This development changed after you opened it. Your edits are still here. Refresh and review the latest version before saving again.'), { code: 'DEVELOPMENT_CONFLICT' })
    }
    if (['PGRST202', '42883', '42703'].includes(result.error.code)) {
      throw new Error('This development needs the latest database update before it can be saved.', { cause: result.error })
    }
    throw result.error
  }
  if (result.data?.requestId !== requestId || result.data?.developmentId !== developmentId || !validate(result.data)) {
    throw new Error('The save could not be confirmed. Retry to check the original request.')
  }
  pendingRequests.delete(key)
  try { globalThis.localStorage?.removeItem(key) } catch { /* The server receipt also makes replay safe. */ }
  return result.data
}
