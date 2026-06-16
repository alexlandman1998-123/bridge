import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialSalesListingsPage() {
  return (
    <CommercialCrudPage
      config={{
        ...commercialCrudConfigs.listings,
        title: 'Listings',
        description: 'Manage commercial properties listed for sale.',
        emptyTitle: 'No listings yet',
        emptyDescription: 'Create a sale or investment listing to market commercial stock for acquisition.',
      }}
      presentation="cards"
      extraFilter={(record) => ['sale', 'investment'].includes(String(record.listing_type || '').toLowerCase())}
      searchPlaceholder="Search sales listings..."
    />
  )
}

export default CommercialSalesListingsPage
