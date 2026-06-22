import { createAdminMobileDashboardResponse, writeNodeJsonResponse } from '../../server/services/adminMobileDashboardApi.js'

export default async function handler(request, response) {
  const payload = await createAdminMobileDashboardResponse({
    method: request.method,
    headers: request.headers,
  })
  writeNodeJsonResponse(response, payload)
}
