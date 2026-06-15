import { getMissionControlSnapshot } from './hqMissionControlSnapshotService.js'

function normalizeMethod(value = '') {
  return String(value || 'GET').trim().toUpperCase()
}

function buildJsonResponse(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body,
  }
}

export async function createMissionControlResponse({ method = 'GET', headers = {} } = {}) {
  const normalizedMethod = normalizeMethod(method)

  if (normalizedMethod === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-store',
      },
      body: null,
    }
  }

  if (normalizedMethod !== 'GET') {
    return buildJsonResponse(405, {
      error: 'method_not_allowed',
      message: 'Mission Control snapshot only supports GET.',
    })
  }

  try {
    const snapshot = await getMissionControlSnapshot({ headers })
    return buildJsonResponse(200, snapshot)
  } catch (error) {
    const status = Number(error?.status || 500)
    const fallbackMessage = status >= 500 ? 'Mission Control snapshot could not be loaded.' : 'Mission Control access failed.'
    return buildJsonResponse(status, {
      error: error?.code || 'hq_snapshot_error',
      message: error?.message || fallbackMessage,
    })
  }
}

export function writeNodeJsonResponse(response, payload) {
  response.statusCode = payload.status || 200
  for (const [key, value] of Object.entries(payload.headers || {})) {
    response.setHeader(key, value)
  }

  if (payload.body == null) {
    response.end()
    return
  }

  response.end(JSON.stringify(payload.body))
}
