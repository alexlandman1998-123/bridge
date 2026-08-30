import { executeListingSyndicationJob } from '../../server/services/listingSyndicationWorkerService.js'

export const config = { maxDuration: 180 }

function send(response, status, body) {
  response.status(status).json(body)
}

export default async function handler(request, response) {
  const secret = String(process.env.LISTING_SYNDICATION_WORKER_SECRET || '')
  if (!secret || request.headers['x-listing-syndication-worker-secret'] !== secret) {
    return send(response, 401, { error: 'Unauthorized.', code: 'UNAUTHORIZED' })
  }
  if (request.method === 'GET') {
    return send(response, 200, {
      status: 'ready',
      productionEnabled: String(process.env.LISTING_SYNDICATION_PRODUCTION_ENABLED || '').toLowerCase() === 'true',
      providers: {
        property24: String(process.env.PROPERTY24_WORKER_ENABLED || '').toLowerCase() === 'true',
        privateProperty: String(process.env.PRIVATE_PROPERTY_WORKER_ENABLED || '').toLowerCase() === 'true',
      },
    })
  }
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' })
  try {
    const result = await executeListingSyndicationJob(request.body || {})
    return send(response, 200, result)
  } catch (error) {
    const status = error.code === 'SYNDICATION_NOT_SUBMITTED' ? 422 : 400
    return send(response, status, { error: error.message, code: error.code || 'SYNDICATION_WORKER_FAILURE', result: error.result || null })
  }
}
