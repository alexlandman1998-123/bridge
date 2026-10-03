import { useEffect, useRef, useState } from 'react'
import { Building2, CheckCircle2, ChevronRight, Loader2, LockKeyhole, Plus, Search, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { RENTAL_SELECT_OPTIONS } from '../../services/rentals/rentalListingDraftModel'
import { buildRentalListingEditForm } from '../../services/rentals/rentalListingEditModel'
import { loadListingLandlordSetup, rentalListingHasLandlord, saveListingLandlord } from '../../services/rentals/rentalListingLandlordService'

function initial(listing) {
  const form = buildRentalListingEditForm(listing)
  return Object.fromEntries(['landlordName', 'landlordEmail', 'landlordPhone', 'landlordType'].map((key) => [key, form[key]]))
}
const cardClass = 'rounded-[20px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]'
export default function RentalListingLandlordPanel({ listing, scope, onSaved }) {
  const [values, setValues] = useState(() => initial(listing))
  const [setup, setSetup] = useState({ contacts: [], linkedLead: null })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [existingType, setExistingType] = useState(() => initial(listing).landlordType)
  const [retry, setRetry] = useState(0)
  const lock = useRef(false)
  const newContactId = useRef('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setValues(initial(listing)) }, [listing])
  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadError('')
    loadListingLandlordSetup(listing, scope).then((result) => { if (!cancelled) setSetup(result) }).catch((cause) => { if (!cancelled) setLoadError(cause?.message || 'Unable to load landlords.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [listing, scope, retry])
  const connected = rentalListingHasLandlord(listing, setup.linkedLead)
  const selected = setup.contacts.find((item) => item.id === selectedId)
  const filtered = setup.contacts.filter((item) => `${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query.toLowerCase().trim()))
  const update = (key) => (event) => { setValues((current) => ({ ...current, [key]: event.target.value })); setError(''); setNotice('') }
  async function save(mode, event) {
    event?.preventDefault()
    if (lock.current) return
    lock.current = true; setSaving(mode); setError(''); setNotice('')
    try {
      if (mode === 'new' && !newContactId.current) newContactId.current = crypto.randomUUID()
      const nextValues = mode === 'existing' && selected ? { ...values, landlordName: selected.name, landlordEmail: selected.email, landlordPhone: selected.phone, landlordType: existingType } : values
      const result = await saveListingLandlord(listing.id, nextValues, { organisationId: scope.organisationId, assignedAgentId: scope.assignedAgentId, mode, contactId: mode === 'new' ? newContactId.current : mode === 'existing' ? selectedId : '', linkedLead: setup.linkedLead })
      if (!mounted.current) return
      onSaved(result)
      setNotice(mode === 'profile' ? 'Landlord details saved.' : 'Landlord connected to this listing.')
    } catch (cause) { if (mounted.current) setError(cause?.message || 'Unable to save the landlord connection.') }
    finally { lock.current = false; if (mounted.current) setSaving('') }
  }
  const fields = <div className="grid gap-4 sm:grid-cols-2">
    <label className="grid gap-2 sm:col-span-2"><span className="text-sm font-semibold text-[#425970]">Landlord or entity name</span><Field required value={values.landlordName} onChange={update('landlordName')} /></label>
    <label className="grid gap-2"><span className="text-sm font-semibold text-[#425970]">Email address</span><Field type="email" value={values.landlordEmail} onChange={update('landlordEmail')} /></label>
    <label className="grid gap-2"><span className="text-sm font-semibold text-[#425970]">Phone number</span><Field type="tel" value={values.landlordPhone} onChange={update('landlordPhone')} /></label>
    <label className="grid gap-2 sm:col-span-2"><span className="text-sm font-semibold text-[#425970]">Landlord type</span><Field as="select" value={values.landlordType} onChange={update('landlordType')}>{RENTAL_SELECT_OPTIONS.landlordType.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Field></label>
  </div>
  return <div className="grid gap-5">
    <header className={cardClass}><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl border border-[#dbe6f2] bg-[#f8fbff] text-[#1f4f78]"><Building2 size={21}/></span><div><h2 className="text-xl font-semibold text-[#18324b]">Landlord</h2><p className="mt-1 text-sm text-[#607387]">{connected ? 'Landlord details for this rental listing.' : 'Create a landlord or connect someone already in Clients.'}</p></div>{connected ? <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#eef9f2] px-3 py-1 text-xs font-semibold text-[#257044]"><CheckCircle2 size={13}/>Connected</span> : null}</div></header>
    {loadError ? <div role="alert" className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-4 text-sm text-[#9f3131]">{loadError}<Button variant="secondary" size="sm" className="ml-3" onClick={() => setRetry((current) => current + 1)}>Retry</Button></div> : null}
    {error ? <p role="alert" className="rounded-xl border border-[#f2c6c6] bg-[#fff7f7] p-4 text-sm text-[#9f3131]">{error}</p> : null}
    {notice ? <p role="status" className="text-sm font-semibold text-[#257044]">{notice}</p> : null}
    {connected ? <form className={cardClass} onSubmit={(event) => void save('profile', event)}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-[#18324b]">Landlord profile</h3>{setup.linkedLead ? <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]" to={`/agent/rentals/pipeline/leads/${encodeURIComponent(setup.linkedLead.id)}`}>Open landlord lead<ChevronRight size={15}/></Link> : null}</div><fieldset disabled={Boolean(saving)}>{fields}</fieldset><div className="mt-5 flex justify-end"><Button type="submit" disabled={Boolean(saving)}>{saving ? <Loader2 size={16} className="animate-spin"/> : null}Save landlord details</Button></div></form> : <>
      <div className="grid gap-5 lg:grid-cols-2">
        <form className={cardClass} onSubmit={(event) => void save('new', event)}><h3 className="mb-5 flex items-center gap-2 font-semibold text-[#18324b]"><Plus size={18}/>Create new landlord</h3><fieldset disabled={Boolean(saving) || loading || Boolean(loadError)}>{fields}</fieldset><Button type="submit" className="mt-5" disabled={Boolean(saving) || loading || Boolean(loadError)}>{saving === 'new' ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>}Create and connect landlord</Button></form>
        <section className={cardClass}><h3 className="mb-5 flex items-center gap-2 font-semibold text-[#18324b]"><UserRound size={18}/>Select existing landlord</h3><label className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[#8294aa]"/><Field aria-label="Search landlords" placeholder="Search name, email or phone" className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} disabled={Boolean(saving) || loading}/></label><div className="mt-4 grid max-h-72 gap-2 overflow-y-auto">{loading ? <p className="text-sm text-[#607387]">Loading landlords…</p> : filtered.length ? filtered.slice(0, 50).map((contact) => <button type="button" key={contact.id} aria-pressed={selectedId === contact.id} disabled={Boolean(saving)} onClick={() => {setSelectedId(contact.id);setError('')}} className={`rounded-xl border p-3 text-left ${selectedId === contact.id ? 'border-[#1f4f78] bg-[#f2f7fc]' : 'border-[#e1e9f2] bg-white hover:bg-[#f8fbff]'}`}><span className="block text-sm font-semibold text-[#243d56]">{contact.name}</span><span className="mt-1 block break-all text-xs text-[#607387]">{[contact.email,contact.phone].filter(Boolean).join(' · ')}</span></button>) : <p className="rounded-xl bg-[#f8fbff] p-4 text-sm text-[#607387]">{query ? 'No landlords match your search.' : 'No landlord contacts found in this workspace.'}</p>}</div>{selected ? <label className="mt-4 grid gap-2"><span className="text-sm font-semibold text-[#425970]">Selected landlord type</span><Field as="select" value={existingType} onChange={(event) => setExistingType(event.target.value)} disabled={Boolean(saving)}>{RENTAL_SELECT_OPTIONS.landlordType.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Field></label> : null}<Button type="button" className="mt-5" disabled={!selected || Boolean(saving) || loading || Boolean(loadError)} onClick={() => void save('existing')}>{saving === 'existing' ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}Connect selected landlord</Button></section>
      </div>
      <section className="flex items-center gap-3 rounded-[20px] border border-dashed border-[#ccd9e7] bg-[#f8fbff] p-5 text-[#607387]"><LockKeyhole size={20}/><div><h3 className="font-semibold">Landlord profile locked</h3><p className="mt-1 text-sm">Create or select a landlord above to unlock this profile.</p></div></section>
    </>}
  </div>
}
