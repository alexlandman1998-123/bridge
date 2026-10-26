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
      setSettings({ policy: result.application_policy_json || {}, amount: result.amount, paymentInstructions: result.payment_instructions, version: result.version, canEdit: true })
      setNotice('Rental application settings saved. New applications will use these settings.')
    } catch (cause) { if (scope.current === organisationId) setError(cause.message) } finally { if (scope.current === organisationId) setSaving(false) }
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-5"><Link to="/agent/rentals/applications" className="text-sm font-semibold text-[#315f8f]">Back to applications</Link><header><p className="text-xs font-semibold uppercase tracking-wider text-[#60758b]">Rental settings</p><h1 className="mt-2 text-2xl font-semibold">Rental application settings</h1><p className="mt-2 text-sm text-[#60758b]">Configure the organisation’s application fee. It becomes payable after the applicant submits. Existing applications keep their original fee.</p></header>{error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p> : null}{notice ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p> : null}{!settings ? <p>{error ? 'Fee settings unavailable.' : 'Loading rental settings…'}</p> : <section className="space-y-5 rounded-2xl border bg-white p-6">{!settings.canEdit ? <p className="text-sm text-[#60758b]">Only organisation administrators can change this fee.</p> : null}<label className="form-field"><span>Total application fee (R)</span><input type="number" min="0" step="0.01" value={settings.amount} disabled={saving || !settings.canEdit} onChange={(event) => setSettings((current) => ({ ...current, amount: event.target.value }))} /><small>Enter the total payable, including VAT if applicable. Set 0 for no application fee.</small></label><label className="form-field"><span>Payment instructions</span><textarea maxLength={2000} value={settings.paymentInstructions} disabled={saving || !settings.canEdit} onChange={(event) => setSettings((current) => ({ ...current, paymentInstructions: event.target.value }))} /><small>Explain how to pay after submission. Required when a fee is charged.</small></label><fieldset disabled={saving || !settings.canEdit} className="space-y-4 border-t border-[#edf2f7] pt-5"><legend className="pt-5 font-semibold">Agency review guidance</legend><p className="text-sm text-[#60758b]">Optional guidance for new applications. Blank values leave the decision to your team. These settings do not automatically approve or decline applicants, or change required document types.</p>{[['maxRentToNetIncomePercent', 'Rent / net income guideline (%)', 100], ['documentMonths', 'Income document period (months)', 24]].map(([key, label, max]) => <label key={key} className="form-field"><span>{label}</span><input type="number" min="1" max={max} step={key === 'documentMonths' ? '1' : '0.1'} value={settings.policy?.[key] ?? ''} onChange={event => setSettings(current => ({ ...current, policy: { ...current.policy, [key]: event.target.value } }))} /></label>)}{[['sponsorPolicy', 'Sponsor preference'], ['guarantorPolicy', 'Guarantor preference']].map(([key, label]) => <label key={key} className="form-field"><span>{label}</span><select value={settings.policy?.[key] || 'manual_review'} onChange={event => setSettings(current => ({ ...current, policy: { ...current.policy, [key]: event.target.value } }))}><option value="manual_review">Review case by case</option><option value="considered">Normally considered, subject to review</option><option value="not_normally_accepted">Not normally accepted; discuss with the agent</option></select></label>)}</fieldset><p className="text-sm text-[#60758b]">Payment timing: after submission. This setting does not process payments or mark a fee as paid.</p><Button disabled={saving || !settings.canEdit || settings.amount === ''} onClick={() => void save()}>{saving ? 'Saving…' : 'Save rental settings'}</Button></section>}</main>
}
