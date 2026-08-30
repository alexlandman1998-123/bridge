import { handlePublicRentalApplication, writeNodeJsonResponse } from '../../server/services/publicRentalApplicationApi.js'
export default async function handler(request, response) { writeNodeJsonResponse(response, await handlePublicRentalApplication({ method: request.method, headers: request.headers, body: request.body })) }
