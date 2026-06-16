import { useState } from 'react'
import CommercialLandlordOnboardingInviteModal from '../components/CommercialLandlordOnboardingInviteModal'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'
import { createCommercialLandlordOnboarding } from '../services/commercialLandlordService'

function CommercialLandlordsPage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [landlordOptions, setLandlordOptions] = useState([])

  async function handleCreateOnboarding(payload) {
    await createCommercialLandlordOnboarding(payload)
    if (typeof window !== 'undefined') window.location.reload()
  }

  return (
    <>
      <CommercialCrudPage
        config={commercialCrudConfigs.landlords}
        createLabel="Create Landlord Manually"
        secondaryActions={[
          {
            label: 'Send Landlord Onboarding',
            onClick: ({ records = [] }) => {
              setLandlordOptions((records || []).map((row) => ({
                value: row.id,
                label: row.legal_name || row.name || 'Landlord',
                email: row.main_email || row.email || '',
                phone: row.main_phone || row.phone || '',
                contactPerson: row.contact_person || '',
              })))
              setInviteOpen(true)
            },
          },
        ]}
      />
      <CommercialLandlordOnboardingInviteModal
        open={inviteOpen}
        landlordOptions={landlordOptions}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleCreateOnboarding}
      />
    </>
  )
}

export default CommercialLandlordsPage
