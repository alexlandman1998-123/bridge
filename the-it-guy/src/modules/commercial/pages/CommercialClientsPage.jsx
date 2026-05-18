import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

const CLIENTS_CONFIG = {
  ...commercialCrudConfigs.tenants,
  title: 'Clients',
  description: 'Manage commercial tenants, buyers, investors, owner occupiers, contacts, requirements, and lease history.',
  createLabel: 'New client',
  emptyTitle: 'No clients yet',
  emptyDescription: 'Create client records for tenants, buyers, investors, and owner occupiers before linking requirements or deals.',
  columns: commercialCrudConfigs.tenants.columns.map((column) =>
    column.key === 'name' ? { ...column, label: 'Client' } : column,
  ),
}

function CommercialClientsPage() {
  return <CommercialCrudPage config={CLIENTS_CONFIG} />
}

export default CommercialClientsPage
