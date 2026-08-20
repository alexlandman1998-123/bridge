import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { JOURNEY_STAGE_ACTIONS } from '../../core/journey/journeyStagePolicy.js'
import { buildJourneyStageOverrideActionModel } from '../../core/journey/journeyStageOverrideState.js'
import { createJourneyStageOverride } from '../../services/journeyStageOverrideService.js'

function normalizeText(value) {
  return String(value || '').trim()
}

export default function JourneyStageOverrideActions({
  entityType = '',
  entityId = '',
  organisationId = '',
  stage = null,
  compact = true,
  disabled = false,
  onCreated,
  onError,
}) {
  const [pendingAction, setPendingAction] = useState(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState('')
  const actionModel = useMemo(
    () => buildJourneyStageOverrideActionModel({ entityType, stage }),
    [entityType, stage],
  )
  const markCompleteAction = actionModel.actions.find((action) => action.key === JOURNEY_STAGE_ACTIONS.markComplete)
  if (!markCompleteAction || !entityType || !entityId || !organisationId) return null

  const openDialog = () => {
    setPendingAction(markCompleteAction)
    setReason('')
    setLocalError('')
  }

  const closeDialog = () => {
    if (saving) return
    setPendingAction(null)
    setReason('')
    setLocalError('')
  }

  const submitOverride = async () => {
    const normalizedReason = normalizeText(reason)
    if (normalizedReason.length < 8) {
      setLocalError('Enter a short reason for the override.')
      return
    }

    try {
      setSaving(true)
      setLocalError('')
      const override = await createJourneyStageOverride({
        organisationId,
        entityType,
        entityId,
        stageKey: stage?.key,
        actionType: pendingAction.key,
        reason: normalizedReason,
        notificationMode: pendingAction.notificationMode,
        metadata: {
          source: 'journey_rail',
          stageLabel: stage?.label || '',
        },
      })
      onCreated?.(override)
      setPendingAction(null)
      setReason('')
      setLocalError('')
    } catch (error) {
      const message = error?.message || 'Journey override could not be saved.'
      setLocalError(message)
      onError?.(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" size={compact ? 'sm' : undefined} variant="secondary" disabled={disabled || saving} onClick={openDialog}>
        <CheckCircle2 size={16} />
        {saving ? 'Saving...' : 'Mark complete'}
      </Button>
      <Modal open={Boolean(pendingAction)} onClose={closeDialog} title={`Mark ${stage?.label || 'stage'} complete`}>
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-[#60758b]">
            This records an internal-only journey override. It does not complete evidence gates such as OTPs, mandates, documents, or transaction records.
          </p>
          <label className="grid gap-2 text-sm font-semibold text-[#18324b]">
            Reason
            <textarea
              className="min-h-28 rounded-[12px] border border-[#d9e5f2] bg-white px-3 py-3 text-sm font-medium text-[#20364c] outline-none transition focus:border-[#2f7b9e] focus:ring-2 focus:ring-[#d9eaf3]"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Example: viewing happened in person and was captured after the fact."
            />
          </label>
          {localError ? <p className="rounded-[12px] border border-[#f8d7da] bg-[#fff5f6] px-3 py-2 text-sm font-semibold text-[#8d2831]">{localError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={submitOverride} disabled={saving}>{saving ? 'Saving...' : 'Save override'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
