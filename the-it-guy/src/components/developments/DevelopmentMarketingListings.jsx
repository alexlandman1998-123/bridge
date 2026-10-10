import { Building2 } from 'lucide-react'
import SalesListingIndexCard from '../listings/SalesListingIndexCard'
import { getListingPropertyFacts } from '../../services/listings/listingIndexCardPresentation'

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

export default function DevelopmentMarketingListings({ listings = [], organisationUsers = [], onOpenListing }) {
  if (!listings.length) return (
    <section className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-8 text-center">
      <Building2 className="mx-auto text-[#8da0b5]" size={24} aria-hidden="true" />
      <p className="mt-3 text-base font-semibold text-[#142132]">No linked agent listings yet.</p>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-[#6b7d93]">Agent listings linked to this development will appear here.</p>
    </section>
  )

  return (
    <section aria-label="Development listings" className="mt-4 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {listings.map((listing, index) => {
        const agent = organisationUsers.find(user =>
          [user.id, user.userId, user.user_id, user.email].filter(Boolean).some(key =>
            [listing.assignedAgentId, listing.assignedAgentEmail].filter(Boolean).some(value =>
              String(value).toLowerCase() === String(key).toLowerCase()
            )
          )
        )
        const name = agent?.fullName || agent?.name || listing.assignedAgent
        const email = agent?.email || listing.assignedAgentEmail
        const card = {
          title: listing.title,
          addressLabel: listing.location && listing.location !== 'Location pending' ? listing.location : listing.title,
          imageUrl: listing.coverImageUrl,
          propertyFacts: getListingPropertyFacts(listing),
          inventoryStatusKey: listing.status === 'draft' ? 'draft' : listing.status,
          inventoryStatusLabel: 'Draft Listing',
          liveChannels: listing.liveChannels || [],
          assignedAgent: {
            name: name === 'Agent pending' ? 'Unassigned' : name,
            email,
            avatarUrl: agent?.avatarUrl || agent?.avatar_url || listing.assignedAgentAvatarUrl,
            isAssigned: Boolean(agent || listing.assignedAgentId || email || (name && name !== 'Agent pending'))
          }
        }
        return <SalesListingIndexCard
          key={`${listing.organisationId || ''}:${listing.id}`}
          card={card}
          priority={index < 4}
          priceLabel={listing.price ? currency.format(listing.price) : 'Price pending'}
          onOpen={() => onOpenListing(listing.id)}
        />
      })}
    </section>
  )
}
