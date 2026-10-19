import { prepareTransactionSellerLink } from './transactionSellerOnboardingService.js'
import { loadTransactionSellerWorkspace } from './transactionSellerWorkspaceService.js'

export async function prepareSellerWorkspaceDelivery({ transactionId, context, mutationId, dependencies = {} }) {
  const latest=await (dependencies.load || loadTransactionSellerWorkspace)({transactionId})
  if(JSON.stringify(latest.revision)!==JSON.stringify(context.revision)) throw new Error('Seller details changed. Review the latest recipient before sending.')
  if(context.authority === 'listing') {
    const listing=context.listing
    if(listing?.id!==context.revision.listingId) throw new Error('The linked listing seller could not be confirmed.')
    const send=dependencies.prepareListing || (await import('./privateListingService.js')).sendSellerOnboarding
    const prepared=await send(listing.id,{
      listingSnapshot:listing,sellerContactEmail:context.details.email,sellerContactPhone:context.details.phone,
      deferStatusTransition:true,
    })
    if(!prepared?.link || !prepared?.onboarding?.id) throw new Error('The listing seller link could not be confirmed.')
    return {type:'seller_onboarding_link',listingId:listing.id,to:context.details.email,sellerName:context.details.name,onboardingLink:prepared.link}
  }
  const prepared=await (dependencies.prepareTransaction || prepareTransactionSellerLink)({transactionId,context,mutationId})
  return {type:'seller_onboarding_link',transactionId,transactionSellerLinkId:prepared.linkId,to:prepared.email,sellerName:prepared.name,onboardingLink:prepared.link}
}
