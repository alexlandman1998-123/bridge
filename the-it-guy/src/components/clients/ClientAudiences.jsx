import MarketingAudiences from '../marketing/MarketingAudiences'

// Keep the established Clients entry point on the same catalogue as campaigns.
export default function ClientAudiences({ organisationId }) {
  return <MarketingAudiences organisationId={organisationId} channel="crm" />
}
