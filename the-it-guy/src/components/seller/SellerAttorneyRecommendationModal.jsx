import { BadgeCheck, Building2, CircleAlert, Scale } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  SELLER_TRANSFER_ATTORNEY_DECISIONS,
  SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES,
  normalizeSellerTransferAttorneyDecision,
} from '../../lib/sellerTransferAttorneyDecision'
import { listOrganisationPreferredPartners } from '../../lib/settingsApi'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

const RECOMMENDATION_MODE = Object.freeze({
  recommended: SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended,
  none: SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.none,
})

function normalizeText(value) {
  return String(value || '').trim()
}

function getInitialDecision(input) {
  return normalizeSellerTransferAttorneyDecision(input || {})
}

export default function SellerAttorneyRecommendationModal({
  open,
  sellerName = '',
  propertyLabel = '',
  actor = null,
  initialDecision = null,
  busy = false,
  onClose,
  onConfirm,
}) {
  const [attorneys, setAttorneys] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState(RECOMMENDATION_MODE.recommended)
  const [selectedAttorneyId, setSelectedAttorneyId] = useState('')
  const normalizedInitialDecision = useMemo(() => getInitialDecision(initialDecision), [initialDecision])

  useEffect(() => {
    if (!open) return undefined
    let active = true

    void Promise.resolve()
      .then(() => {
        if (!active) return []
        setLoading(true)
        setError('')
        return listOrganisationPreferredPartners()
      })
      .then((partners) => {
        if (!active) return
        const availableAttorneys = (partners || []).filter(
          (partner) => partner?.isActive && partner?.partnerType === 'transfer_attorney',
        )
        const savedAttorneyId = normalizeText(normalizedInitialDecision.recommendedAttorney.preferredPartnerId)
        const defaultAttorney = availableAttorneys.find((attorney) => String(attorney.id) === savedAttorneyId)
          || availableAttorneys.find((attorney) => attorney.isPreferredDefault)
          || availableAttorneys[0]
          || null
        const explicitlyNoRecommendation = normalizedInitialDecision.recommendationStatus === RECOMMENDATION_MODE.none
        setAttorneys(availableAttorneys)
        setSelectedAttorneyId(defaultAttorney?.id || '')
        setMode(explicitlyNoRecommendation || !defaultAttorney ? RECOMMENDATION_MODE.none : RECOMMENDATION_MODE.recommended)
      })
      .catch((loadError) => {
        if (!active) return
        setAttorneys([])
        setSelectedAttorneyId('')
        setMode(RECOMMENDATION_MODE.none)
        setError(loadError?.message || 'Preferred transfer attorneys could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [normalizedInitialDecision, open])

  const selectedAttorney = useMemo(
    () => attorneys.find((attorney) => String(attorney.id) === String(selectedAttorneyId)) || null,
    [attorneys, selectedAttorneyId],
  )
  const canConfirm = mode === RECOMMENDATION_MODE.none || Boolean(selectedAttorney)

  function handleConfirm() {
    if (!canConfirm || busy) return
    const recommendedAt = new Date().toISOString()
    onConfirm?.(normalizeSellerTransferAttorneyDecision({
      version: 1,
      decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.pending,
      recommendationStatus: mode,
      recommendedAttorney: mode === RECOMMENDATION_MODE.recommended ? selectedAttorney : null,
      recommendedBy: actor,
      recommendedAt,
      notes: mode === RECOMMENDATION_MODE.none ? 'Agent intentionally sent onboarding without an attorney recommendation.' : '',
    }))
  }

  const footer = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button type="button" onClick={handleConfirm} disabled={!canConfirm || busy || loading}>
        {busy ? 'Sending onboarding…' : 'Confirm and send onboarding'}
      </Button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Recommend a transferring attorney"
      subtitle={`Review what will be proposed for ${sellerName || 'the seller'} before sending onboarding.`}
      className="max-w-3xl"
      footer={footer}
    >
      <div className="space-y-4">
        <div className="rounded-[16px] border border-[#dbe7f4] bg-[#f5f9fd] px-4 py-3">
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 shrink-0 text-[#315f86]" size={19} />
            <div>
              <p className="text-sm font-semibold text-[#18344d]">This is a recommendation, not an appointment</p>
              <p className="mt-1 text-sm leading-6 text-[#5f748c]">
                The seller retains the right to appoint the transferring attorney. This choice prepares the recommendation that the seller will review.
              </p>
              {propertyLabel ? <p className="mt-2 text-xs font-semibold text-[#45647f]">Property: {propertyLabel}</p> : null}
            </div>
          </div>
        </div>

        <fieldset disabled={busy || loading} className="space-y-3">
          <legend className="text-sm font-semibold text-[#203a54]">What should be recommended?</legend>
          <label className={`block cursor-pointer rounded-[16px] border p-4 transition ${mode === RECOMMENDATION_MODE.recommended ? 'border-[#79a8d0] bg-[#f4f9fe] ring-2 ring-[#dcecf9]' : 'border-[#dfe7f0] bg-white'}`}>
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="transfer-attorney-recommendation-mode"
                value={RECOMMENDATION_MODE.recommended}
                checked={mode === RECOMMENDATION_MODE.recommended}
                onChange={() => setMode(RECOMMENDATION_MODE.recommended)}
                className="mt-1"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-[#18344d]"><BadgeCheck size={16} /> Recommend a preferred firm</span>
                <span className="mt-1 block text-sm text-[#60758c]">The seller will be shown this firm as the agency’s recommendation.</span>
              </span>
            </span>
          </label>

          {mode === RECOMMENDATION_MODE.recommended ? (
            <div className="ml-0 grid gap-2 sm:ml-8">
              {attorneys.map((attorney) => (
                <label key={attorney.id} className={`flex cursor-pointer items-start gap-3 rounded-[14px] border px-4 py-3 ${String(selectedAttorneyId) === String(attorney.id) ? 'border-[#8cb4d6] bg-white shadow-sm' : 'border-[#e3eaf2] bg-[#fbfcfe]'}`}>
                  <input
                    type="radio"
                    name="preferred-transfer-attorney"
                    value={attorney.id}
                    checked={String(selectedAttorneyId) === String(attorney.id)}
                    onChange={() => setSelectedAttorneyId(attorney.id)}
                    className="mt-1"
                  />
                  <Building2 className="mt-0.5 shrink-0 text-[#52718c]" size={17} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#18344d]">{attorney.companyName}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#637990]">
                      {[attorney.contactPerson, attorney.email, attorney.phone].filter(Boolean).join(' · ') || 'Contact details pending'}
                    </span>
                    {attorney.notes ? <span className="mt-1 block text-xs leading-5 text-[#526b82]">Why this firm: {attorney.notes}</span> : null}
                    {attorney.isPreferredDefault ? <span className="mt-2 inline-flex rounded-full bg-[#e8f5ee] px-2 py-1 text-[0.68rem] font-semibold text-[#28704c]">Agency default</span> : null}
                  </span>
                </label>
              ))}
              {!attorneys.length && !loading ? (
                <div className="rounded-[14px] border border-[#f0d6ae] bg-[#fff9ee] px-4 py-3 text-sm text-[#8a5b1f]">
                  No active preferred transfer attorneys are configured. Choose “No recommendation” or add one under Organisation → Partners.
                </div>
              ) : null}
            </div>
          ) : null}

          <label className={`block cursor-pointer rounded-[16px] border p-4 transition ${mode === RECOMMENDATION_MODE.none ? 'border-[#d5ad72] bg-[#fff9ef] ring-2 ring-[#f7e8cf]' : 'border-[#dfe7f0] bg-white'}`}>
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="transfer-attorney-recommendation-mode"
                value={RECOMMENDATION_MODE.none}
                checked={mode === RECOMMENDATION_MODE.none}
                onChange={() => setMode(RECOMMENDATION_MODE.none)}
                className="mt-1"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-[#5f471f]"><CircleAlert size={16} /> Send without a recommendation</span>
                <span className="mt-1 block text-sm text-[#7c6643]">Use this intentionally when the agency should not propose a preferred firm.</span>
              </span>
            </span>
          </label>
        </fieldset>

        {loading ? <p className="text-sm text-[#60758c]">Loading preferred transfer attorneys…</p> : null}
        {error ? <p role="alert" className="rounded-[12px] border border-[#f2c9c2] bg-[#fff5f3] px-3 py-2 text-sm font-semibold text-[#a24636]">{error}</p> : null}
      </div>
    </Modal>
  )
}
