import { useState } from 'react'
import { Building2, ChevronRight, Landmark, Mail, Phone, Scale, UserRound } from 'lucide-react'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

const captured = value => Boolean(value && !['Not captured', 'Not assigned', 'Client'].includes(value))
const iconFor = row => row.side || ['buyer', 'seller'].includes(row.key) ? UserRound
  : row.key.includes('attorney') ? Scale : row.key === 'bond_originator' ? Landmark : Building2

export default function RolePlayersWorkspaceTab({ contacts = [], teamCards = [], onAssignRole, canManageAssignments = false }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const rows = contacts.filter(row => row.visible !== false).map(row => ({
    ...row, assignment: teamCards.find(card => card.key === row.key && card.visible !== false),
  }))
  for (const card of teamCards.filter(item => item.visible !== false)) {
    if (!rows.some(row => row.key === card.key)) rows.push({ ...card, role: card.label, assignment: card })
  }
  const selected = rows.find(row => row.key === selectedKey)
  const assign = row => { setSelectedKey(null); onAssignRole?.(row.key) }
  return <section aria-label="Transaction contacts" className="space-y-4">
    <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
        {rows.map(row => {
          const Icon = iconFor(row)
          return <article key={row.key} className="flex h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button type="button" aria-label={`${row.role} details: ${row.contact || 'Not assigned'}`} onClick={() => setSelectedKey(row.key)} className="group flex h-full min-h-[216px] w-full flex-col gap-3 p-5 text-left transition-colors hover:bg-emerald-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 focus-visible:outline-offset-[-2px]">
              <div className="flex w-full items-center gap-3"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Icon size={20} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="text-xs font-medium text-slate-500">{row.role}</span><strong className="mt-1 block line-clamp-2 text-base font-semibold text-slate-950">{row.contact || 'Not assigned'}</strong></span><ChevronRight size={17} className="shrink-0 text-slate-400 group-hover:text-emerald-700" aria-hidden="true" /></div>
              <span className="min-h-5 text-sm text-slate-500">{captured(row.company) && row.company !== row.contact ? row.company : null}</span>
              <span className="mt-auto grid w-full min-w-0 gap-2 text-sm text-slate-600"><span className="flex min-w-0 items-center gap-2"><Mail size={14} className="shrink-0" aria-hidden="true" /><span className="truncate" title={captured(row.email) ? row.email : undefined}>{captured(row.email) ? row.email : 'Email not captured'}</span></span><span className="flex items-center gap-2"><Phone size={14} className="shrink-0" aria-hidden="true" />{captured(row.phone) ? row.phone : 'Phone not captured'}</span></span>
            </button>
          </article>
        })}
    </div>
    {!rows.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">No contacts have been added yet.</p> : null}
    {selected ? <Modal open title={selected.role} onClose={() => setSelectedKey(null)} className="max-w-lg">
      <h3 className="text-lg font-semibold text-slate-950">{selected.contact || 'Not assigned'}</h3>
      {captured(selected.company) && selected.company !== selected.contact ? <p className="mt-1 text-sm text-slate-500">{selected.company}</p> : null}
      <dl className="mt-5 space-y-4 text-sm"><div><dt className="text-slate-500">Email</dt><dd className="mt-1 break-all font-medium text-slate-800">{captured(selected.email) ? <a href={`mailto:${selected.email}`} className="text-emerald-700 hover:underline">{selected.email}</a> : 'Not captured'}</dd></div><div><dt className="text-slate-500">Phone</dt><dd className="mt-1 font-medium text-slate-800">{captured(selected.phone) ? <a href={`tel:${selected.phone.replace(/[^+\d]/g, '')}`} className="text-emerald-700 hover:underline">{selected.phone}</a> : 'Not captured'}</dd></div></dl>
      {canManageAssignments && selected.assignment ? <Button type="button" variant="secondary" className="mt-5" onClick={() => assign(selected)}>{selected.assignment.actionLabel}</Button> : null}
    </Modal> : null}
  </section>
}
