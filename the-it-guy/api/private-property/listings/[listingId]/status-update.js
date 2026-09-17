import { handlePrivatePropertyNodeRequest } from '../../../../server/private-property/api.js'

export default async function handler(request, response) {
  await handlePrivatePropertyNodeRequest(request, response, {
    listingId: request.query?.listingId,
  })
}
