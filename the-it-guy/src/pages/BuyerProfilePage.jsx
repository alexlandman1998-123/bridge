import { ArrowLeft, BriefcaseBusiness, FileText, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  getReusableBuyerProfile,
  listBuyerProfileTransactions,
  saveBuyerProfileIdentity,
  saveReusableBuyerProfile,
} from '../services/buyerProfileReuseService'

const profileFields = [
  ['physical_address', 'Physical address'],
  ['identity_number', 'ID / passport number'],
  ['marital_status', 'Marital status'],
  ['employment_type', 'Employment type'],
  ['employer', 'Employer'],
  ['gross_monthly_income', 'Gross monthly income'],
  ['bank', 'Primary bank'],
]

const text = (value) => String(value || '').trim()

export default function BuyerProfilePage() {
  const { buyerId } = useParams()
  const navigate = useNavigate()
  const [buyer, setBuyer] = useState(null)
  const [profileData, setProfileData] = useState({})
  const [documents, setDocuments] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      setLoading(true)
      setError('')
      const [profileResult, transactionResult] = await Promise.all([
        getReusableBuyerProfile({ buyerId }),
        listBuyerProfileTransactions({ buyerId }),
      ])
      setBuyer(profileResult.buyer)
      setProfileData(profileResult.profile?.profile_data || {})
      setDocuments(profileResult.documents || [])
      setTransactions(transactionResult || [])
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load the reusable buyer profile.')
    } finally {
      setLoading(false)
    }
  }, [buyerId])

  useEffect(() => { void load() }, [load])

  async function saveProfile(event) {
    event.preventDefault()
    if (!buyer) return
    try {
      setSaving(true)
      setError('')
      const [savedBuyer, savedProfile] = await Promise.all([
        saveBuyerProfileIdentity({ buyerId: buyer.id, name: buyer.name, email: buyer.email, phone: buyer.phone }),
        saveReusableBuyerProfile({ buyerId: buyer.id, profileData }),
      ])
      setBuyer(savedBuyer)
      setProfileData(savedProfile.profile_data || {})
      setNotice('Reusable buyer profile saved. Future transactions can reference this information without re-entry.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save the reusable buyer profile.')
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) return <p className="rounded-2xl border border-[#f3d2cc] bg-[#fef3f2] p-4 text-sm text-[#b42318]">Supabase must be configured to use Buyer Profiles.</p>
  if (loading) return <LoadingSkeleton lines={10} className="rounded-[24px] border border-borderDefault bg-surface p-6" />
  if (error && !buyer) return <p className="rounded-2xl border border-[#f3d2cc] bg-[#fef3f2] p-4 text-sm text-[#b42318]">{error}</p>

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <Button variant="ghost" className="px-0" onClick={() => navigate('/clients')}><ArrowLeft size={16} />Back to clients</Button>
      <header className="flex flex-col gap-4 rounded-[24px] border border-[#dce6f2] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#eef5ff] text-[#2f6fed]"><UserRound size={27} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#74869b]">Reusable Buyer Profile</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{buyer?.name}</h1><p className="mt-1 text-sm text-[#60758d]">Profile data and FICA documents are retained once and reused across transactions.</p></div></div>
        <Button onClick={() => window.dispatchEvent(new CustomEvent('itg:open-new-transaction', { detail: { buyerId: buyer?.id } }))}><BriefcaseBusiness size={16} />Create transaction</Button>
      </header>

      {error ? <p className="rounded-xl border border-[#f3d2cc] bg-[#fef3f2] p-3 text-sm text-[#b42318]">{error}</p> : null}
      {notice ? <p className="rounded-xl border border-[#ccebd9] bg-[#effaf3] p-3 text-sm text-[#16734b]">{notice}</p> : null}

      <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]" onSubmit={saveProfile}>
        <div className="rounded-[24px] border border-[#dce6f2] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-[#142132]">Reusable details</h2><p className="mt-1 text-sm text-[#60758d]">Changes become the profile source for future transactions.</p></div><ShieldCheck className="text-[#21865a]" size={22} /></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Full name"><input value={buyer?.name || ''} onChange={(event) => setBuyer((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Email"><input type="email" value={buyer?.email || ''} onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))} /></Field><Field label="Phone"><input value={buyer?.phone || ''} onChange={(event) => setBuyer((current) => ({ ...current, phone: event.target.value }))} /></Field>{profileFields.map(([key, label]) => <Field key={key} label={label}><input value={profileData?.[key] || ''} onChange={(event) => setProfileData((current) => ({ ...current, [key]: event.target.value }))} /></Field>)}</div>
          <div className="mt-6 flex justify-end"><Button type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save reusable profile'}</Button></div>
        </div>

        <aside className="space-y-5"><section className="rounded-[24px] border border-[#dce6f2] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"><h2 className="flex items-center gap-2 text-base font-semibold text-[#142132]"><FileText size={18} />Reusable documents</h2><p className="mt-1 text-sm text-[#60758d]">These source documents can be linked to future transactions without another upload.</p><div className="mt-4 space-y-2">{documents.length ? documents.map((document) => <div key={document.id} className="rounded-xl border border-[#e5ebf2] px-3 py-2"><strong className="block text-sm text-[#24394e]">{document.document_name}</strong><span className="text-xs text-[#6d8094]">{document.document_key} · v{document.source_version}</span></div>) : <p className="rounded-xl bg-[#f7f9fc] p-3 text-sm text-[#6d8094]">No reusable documents yet. Documents uploaded to a buyer profile will appear here.</p>}</div></section><section className="rounded-[24px] border border-[#dce6f2] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"><h2 className="text-base font-semibold text-[#142132]">Linked transactions</h2><div className="mt-3 space-y-2">{transactions.length ? transactions.map((transaction) => <button className="block w-full rounded-xl border border-[#e5ebf2] px-3 py-2 text-left hover:bg-[#f8fbff]" key={transaction.id} type="button" onClick={() => navigate(`/transactions/${transaction.id}`)}><strong className="block text-sm text-[#24394e]">{text(transaction.development?.name) || 'Transaction'} · Unit {text(transaction.unit?.unit_number) || '—'}</strong><span className="text-xs text-[#6d8094]">{transaction.current_main_stage || transaction.stage || 'Active'} · {transaction.transaction_reference || 'No reference'}</span></button>) : <p className="rounded-xl bg-[#f7f9fc] p-3 text-sm text-[#6d8094]">No linked transactions yet.</p>}</div></section></aside>
      </form>
    </section>
  )
}
