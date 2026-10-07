import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button.jsx'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getRentalApplicationFeeSettings, saveRentalApplicationFeeSettings } from '../../services/rentals/rentalApplicationFeeSettingsService.js'

export default function RentalApplicationFeeSettingsPage() {
  const workspace = useWorkspace()
  const organisationId = workspace.currentWorkspace?.id || workspace.workspace?.id || workspace.currentMembership?.organisation_id
  const scope = useRef(organisationId)
  scope.current = organisationId
  const [settings, setSettings] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    setSaving(false); setSettings(null); setError(''); setNotice('')
    if (organisationId) getRentalApplicationFeeSettings(organisationId).then((value) => { if (active) setSettings(value) }).catch((cause) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [organisationId])
  const save = async () => {
    if (saving || !settings?.canEdit) return
    setSaving(true); setError(''); setNotice('')
    try {
      const result = await saveRentalApplicationFeeSettings(organisationId, settings)
      if (scope.current !== organisationId) return
      setSettings({ amount: result.amount, paymentInstructions: result.payment_instructions, version: result.version, canEdit: true })
      setNotice('Rental application fee saved. New applications will use these settings.')
    } catch (cause) { if (scope.current === organisationId) setError(cause.message) } finally { if (scope.current === organisationId) setSaving(false) }
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-5"><Link to="/agent/rentals/applications" className="text-sm font-semibold text-[#315f8f]">Back to applications</Link><header><p className="text-xs font-semibold uppercase tracking-wider text-[#60758b]">Rental settings</p><h1 className="mt-2 text-2xl font-semibold">Application fee</h1><p className="mt-2 text-sm text-[#60758b]">Configure the organisation’s application fee. It becomes payable after the applicant submits. Existing applications keep their original fee.</p></header>{error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p> : null}{notice ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p> : null}{!settings ? <p>{error ? 'Fee settings unavailable.' : 'Loading rental settings…'}</p> : <section className="space-y-5 rounded-2xl border bg-white p-6">{!settings.canEdit ? <p className="text-sm text-[#60758b]">Only organisation administrators can change this fee.</p> : null}<label className="form-field"><span>Total application fee (R)</span><input type="number" min="0" step="0.01" value={settings.amount} disabled={saving || !settings.canEdit} onChange={(event) => setSettings((current) => ({ ...current, amount: event.target.value }))} /><small>Enter the total payable, including VAT if applicable. Set 0 for no application fee.</small></label><label className="form-field"><span>Payment instructions</span><textarea maxLength={2000} value={settings.paymentInstructions} disabled={saving || !settings.canEdit} onChange={(event) => setSettings((current) => ({ ...current, paymentInstructions: event.target.value }))} /><small>Explain how to pay after submission. Required when a fee is charged.</small></label><p className="text-sm text-[#60758b]">Payment timing: after submission. This setting does not process payments or mark a fee as paid.</p><Button disabled={saving || !settings.canEdit || settings.amount === ''} onClick={() => void save()}>{saving ? 'Saving…' : 'Save rental settings'}</Button></section>}</main>
}
