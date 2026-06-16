import { Building2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import CommercialLandlordOnboardingInviteModal from './CommercialLandlordOnboardingInviteModal'
import { createCommercialLandlordOnboarding } from '../services/commercialLandlordService'

function buildOptionFromLandlord(landlord = null) {
  if (!landlord?.id) return null
  return {
    value: landlord.id,
    label: landlord.legal_name || landlord.name || 'Landlord',
    email: landlord.main_email || landlord.email || '',
    phone: landlord.main_phone || landlord.phone || '',
    contactPerson: landlord.contact_person || landlord.main_contact_name || '',
  }
}

function CommercialLandlordOnboardingAction({
  organisationId = '',
  landlord = null,
  landlordOptions = [],
  label = 'Send Landlord Onboarding',
  buttonClassName = '',
  buttonIcon = null,
  onSent = null,
}) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => {
    if (landlordOptions.length) return landlordOptions
    const option = buildOptionFromLandlord(landlord)
    return option ? [option] : []
  }, [landlord, landlordOptions])

  const defaultLandlordId = landlord?.id || options[0]?.value || ''

  async function handleSubmit(payload = {}) {
    const result = await createCommercialLandlordOnboarding({
      ...payload,
      landlordId: payload.landlordId || defaultLandlordId,
    })
    await onSent?.(result)
    return result
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!organisationId}
        className={buttonClassName || 'inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60'}
      >
        {buttonIcon || <Building2 size={16} />}
        {label}
      </button>
      <CommercialLandlordOnboardingInviteModal
        open={open}
        landlordOptions={options}
        defaultLandlordId={defaultLandlordId}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  )
}

export default CommercialLandlordOnboardingAction
