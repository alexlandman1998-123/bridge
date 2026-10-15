import {convertRentalApplicationToTenancy,getRentalApplicationReview} from './rentalApplicationRepository.js'
const text=value=>String(value??'').trim()
export async function createRentalTenantPlacementHandoff(lead={},values={},listing={},application={},context={}){
 if(lead.role!=='tenant'||lead.stage!=='placement_ready')throw new Error('Choose a tenant lead at Placement ready.')
 const id=text(application.id||lead.relationships?.applicationId||values.applicationReference)
 if(!id)throw new Error('Choose the approved application linked to this tenant journey.')
 const saved=await getRentalApplicationReview(id)
 if(!saved||saved.leadId!==lead.id||saved.organisationId!==context.organisationId||saved.status!=='approved')throw new Error('Choose this tenant’s saved approved application.')
 if(listing.id&&saved.data?.property?.listingId&&listing.id!==saved.data.property.listingId)throw new Error('Continue with the property selected on the approved application.')
 const result=await convertRentalApplicationToTenancy({applicationId:saved.id,expectedVersion:saved.version})
 if(!result?.tenancy_id||!result?.lease_id)throw new Error('The saved tenancy could not be confirmed. Refresh before retrying.')
 return {tenancyId:result.tenancy_id,lease:{id:result.lease_id,tenancyId:result.tenancy_id,listingId:saved.data?.property?.listingId||'',status:'draft',reference:result.lease_id.slice(0,8)}}
}
export async function linkRentalTenantLeadToTenancy(lead={},tenancy={},context={}){
 const result=await createRentalTenantPlacementHandoff(lead,{}, {},{id:lead.relationships?.applicationId},context)
 if(tenancy.tenancyId&&tenancy.tenancyId!==result.tenancyId)throw new Error('This tenancy belongs to a different approved application.')
 return result
}
