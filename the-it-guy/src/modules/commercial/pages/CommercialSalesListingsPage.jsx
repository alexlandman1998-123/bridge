import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialSalesListingsPage() {
  return (
    <CommercialCrudPage
      config={{
        ...commercialCrudConfigs.listings,
        title: 'Sales Listings',
        description: 'Market-facing commercial sales and investment listings linked to landlords, properties, brokers, teams, and branches.',
        emptyTitle: 'No sales listings yet',
        emptyDescription: 'Create a sale or investment listing to market commercial stock for acquisition.',
      }}
      presentation="cards"
      extraFilter={(record) => ['sale', 'investment'].includes(String(record.listing_type || '').toLowerCase())}
      searchPlaceholder="Search sales listings..."
    />
  )
}

export default CommercialSalesListingsPage
