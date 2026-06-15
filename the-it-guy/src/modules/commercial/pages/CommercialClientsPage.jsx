import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import CommercialCrudPage from '../components/CommercialCrudPage'
import { commercialCrudConfigs } from '../commercialCrudConfig'

const CLIENT_TABS = [
  { id: 'companies', label: 'Companies' },
  { id: 'contacts', label: 'Contacts' },
]

function CommercialClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = CLIENT_TABS.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'companies'

  const config = useMemo(
    () => (activeTab === 'contacts' ? commercialCrudConfigs.contacts : commercialCrudConfigs.companies),
    [activeTab],
  )

  return (
    <CommercialCrudPage
      config={config}
      pageTitle="Clients"
      pageDescription="Manage commercial companies and contacts in one place."
      tabs={CLIENT_TABS}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        const next = new URLSearchParams(searchParams)
        next.set('tab', tabId)
        setSearchParams(next, { replace: true })
      }}
      searchPlaceholder={`Search ${activeTab}...`}
    />
  )
}

export default CommercialClientsPage
