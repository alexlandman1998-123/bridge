import { createBondOnlineSigningService } from './bondOnlineSigningService.js'
// This production constructor intentionally has no provider, persistence or
// approval dependencies. Connecting a reviewed provider requires a server-side
// change and scoped repository integration, not an environment/browser flag.
const productionSigning = createBondOnlineSigningService()
export async function createBondOnlineSigningResponse({ method = 'GET', body = {}, headers = {} } = {}, service = productionSigning) {
  const response = (status, data) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: data })
  if (method === 'GET') return response(200, service.availability())
  if (method !== 'POST') return { ...response(405, { error: 'Method not allowed.' }), headers: { ...response().headers, Allow: 'GET, POST' } }
  if (!service.availability().available) return response(503, service.availability())
  const action = body?.action
  if (!['resume', 'prepare', 'start', 'verify', 'status', 'download'].includes(action)) return response(400, { error: 'Unknown signing action.' })
  const credentials = { token: headers['x-bridge-client-portal-token'], accessToken: headers['x-bridge-bond-application-token'] }
  if (!credentials.token && !credentials.accessToken) return response(403, { error: 'A secure application link is required.' })
  try {
    // Explicit argument allowlist: no provider, approval, participant or document
    // identifiers supplied by the browser are treated as authorization.
    const args = { credentials, envelopeId: body.envelopeId }
    if (action === 'prepare') args.expectedRevision = body.expectedRevision
    if (action === 'start') { args.consent = body.consent; args.intentToSign = body.intentToSign }
    if (action === 'verify') { args.sessionId = body.sessionId; args.code = body.code }
    const result = await service[action](args)
    if (action === 'download') return { status: 200, headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${result.filename}"`, 'X-Content-Type-Options': 'nosniff' }, body: result.bytes }
    return response(200, result)
  } catch (error) {
    return response(error.isBondSigningError ? error.status : 503, { code: error.isBondSigningError ? error.code : 'signing_unavailable', error: error.isBondSigningError ? error.message : 'Signing could not be completed. Please retry.' })
  }
}
