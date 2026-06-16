import { useMemo, useState } from 'react'
import CommercialOnboardingSendModal from './CommercialOnboardingSendModal'
import { buildCommercialOnboardingInviteDraft, createCommercialOnboardingInvitation } from '../services/commercialOnboardingApi'

function CommercialOnboardingSendAction({
  organisationId = '',
  kind = '',
  record = null,
  lookups = {},
  label = '',
  buttonClassName = '',
  buttonIcon = null,
}) {
  const [open, setOpen] = useState(false)
  const draft = useMemo(() => buildCommercialOnboardingInviteDraft({ kind, record: record || {}, lookups }), [kind, lookups, record])

  async function handleSend(nextDraft = {}) {
    if (!organisationId) throw new Error('Commercial organisation context is not available.')
    return createCommercialOnboardingInvitation({
      organisationId,
      clientType: nextDraft.clientType || draft.clientType,
      transactionType: nextDraft.transactionType || draft.transactionType,
      assetCategory: nextDraft.assetCategory || draft.assetCategory,
      sourceRecord: nextDraft.sourceRecord || draft.sourceRecord || record || {},
      contact: nextDraft.contact || draft.contact || {},
      expiryDays: 30,
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!organisationId}
        className={buttonClassName || 'inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60'}
      >
        {buttonIcon}
        {label || draft.label}
      </button>
      <CommercialOnboardingSendModal
        open={open}
        kind={kind}
        record={record}
        lookups={lookups}
        onClose={() => setOpen(false)}
        onSend={handleSend}
      />
    </>
  )
}

export default CommercialOnboardingSendAction
