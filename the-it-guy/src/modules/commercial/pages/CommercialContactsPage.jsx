import { Link2, UserRound } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'

function CommercialContactsPage() {
  const config = useMemo(() => ({
    ...commercialCrudConfigs.contacts,
    columns: commercialCrudConfigs.contacts.columns.map((column) => (
      column.key === 'name'
        ? {
            ...column,
            render: (row) => (
              <Link to={`/commercial/contacts/${row.id}`} className="inline-flex items-center gap-2 font-semibold text-[#1267a3] transition hover:text-[#0f5485]">
                <UserRound size={14} />
                {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.name || 'Commercial contact'}
              </Link>
            ),
          }
        : column.key === 'company_id'
          ? {
              ...column,
              render: (row, lookups) => {
                const label = (lookups.companies || []).find((item) => item.value === row.company_id)?.label || 'Unlinked company'
                if (!row.company_id) return label
                return (
                  <Link to={`/commercial/companies/${row.company_id}`} className="inline-flex items-center gap-2 text-[#1267a3] transition hover:text-[#0f5485]">
                    <Link2 size={14} />
                    {label}
                  </Link>
                )
              },
            }
          : column
    )),
  }), [])

  return <CommercialCrudPage config={config} />
}

export default CommercialContactsPage
