import { handlePublicRentalLandlordPortal, writePublicRentalLandlordPortalResponse } from '../../server/services/publicRentalLandlordPortalApi.js'
export default async function handler(request, response) { writePublicRentalLandlordPortalResponse(response, await handlePublicRentalLandlordPortal({ method: request.method, headers: request.headers, body: request.body })) }
