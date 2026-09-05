import { handlePublicRentalTenantPortal, writePublicRentalTenantPortalResponse } from '../../server/services/publicRentalTenantPortalApi.js'
export default async function handler(request, response) { writePublicRentalTenantPortalResponse(response, await handlePublicRentalTenantPortal({ method: request.method, headers: request.headers, body: request.body })) }
