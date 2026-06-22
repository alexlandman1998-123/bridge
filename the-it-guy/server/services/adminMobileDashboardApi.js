import { getAdminMobileDashboard } from './adminMobileDashboardService.js'
import { writeNodeJsonResponse } from './hqMissionControlApi.js'

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

export async function createAdminMobileDashboardResponse({ method = 'GET', headers = {} } = {}) {
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
      message: 'Admin mobile dashboard only supports GET.',
    })
  }

  try {
    const dashboard = await getAdminMobileDashboard({ headers })
    return buildJsonResponse(200, dashboard)
  } catch (error) {
    const status = Number(error?.status || 500)
    const fallbackMessage = status >= 500 ? 'Admin mobile dashboard could not be loaded.' : 'Admin mobile dashboard access failed.'
    return buildJsonResponse(status, {
      error: error?.code || 'admin_mobile_dashboard_error',
      message: error?.message || fallbackMessage,
    })
  }
}

export { writeNodeJsonResponse }
