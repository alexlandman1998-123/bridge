import { handleProperty24NodeRequest } from '../../../../server/property24/api.js'

export default async function handler(request, response) {
  await handleProperty24NodeRequest(request, response, {
    listingId: request.query?.listingId,
  })
}
