import { handleRentalClientPortalAccount, writeRentalClientPortalAccountResponse } from '../../server/services/rentalClientPortalAccountApi.js'

export default async function handler(request, response) {
  writeRentalClientPortalAccountResponse(response, await handleRentalClientPortalAccount({ method: request.method, headers: request.headers, body: request.body, query: request.query }))
}
