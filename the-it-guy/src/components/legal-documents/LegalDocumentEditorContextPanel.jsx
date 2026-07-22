import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  HeartHandshake,
  Landmark,
  Layers3,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { listLegalDocumentEditorSituationGroups } from '../../core/documents/legalDocumentEditorSituations'
import { buildLegalDocumentEditorPath } from '../../core/documents/legalDocumentRoutes'

const SITUATION_ICONS = Object.freeze({
  individual: UserRound,
  company: Building2,
  trust: Landmark,
  consent: HeartHandshake,
  property: FileText,
  sectional: Layers3,
  finance: CircleDollarSign,
  cash: CircleDollarSign,
  combination: CircleDollarSign,
  conditional: Layers3,
})

function buildEditorLink(documentKey, scope, templateId, situationKey = '') {
  const query = new URLSearchParams()
  if (templateId) query.set('template', templateId)
  if (situationKey) query.set('situation', situationKey)
  const suffix = query.toString()
  return `${buildLegalDocumentEditorPath(documentKey, scope)}${suffix ? `?${suffix}` : ''}`
}

export default function LegalDocumentEditorContextPanel({ documentKey, documentLabel, scope, templateId = '', situationKey = '', packetType = '' }) {
  if (scope === 'situations') {
    const groups = listLegalDocumentEditorSituationGroups({ packetType })
    const situations = groups.flatMap((group) => group.items)
    const selected = situations.find((situation) => situation.key === situationKey) || null
    return (
      <section className="rounded-[18px] border border-[#cfe4d7] bg-[#f5fbf7] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.035)]" aria-labelledby="situation-picker-heading">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[#c3dfce] bg-white text-[#167449]">
            <Layers3 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#56806a]">Conditional master</p>
            <h2 id="situation-picker-heading" className="mt-1 text-lg font-semibold text-[#18372a]">Choose the conditional section to edit</h2>
            <p className="mt-1 text-sm leading-6 text-[#5f786b]">Each item is part of this same {documentLabel}. Bridge controls when it appears; your team controls its legal wording.</p>
          </div>
        </div>
        <div className="mt-5 space-y-5">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`conditional-group-${group.key}`}>
              <h3 id={`conditional-group-${group.key}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.13em] text-[#56806a]">{group.label}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="list">
                {group.items.map((situation) => {
                  const SituationIcon = SITUATION_ICONS[situation.iconKey] || Layers3
                  const active = situation.key === selected?.key
                  return (
                    <Link
                      key={situation.key}
                      role="listitem"
                      to={buildEditorLink(documentKey, 'situations', templateId, situation.key)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-[92px] items-start gap-3 rounded-[12px] border px-3 py-3 transition ${active ? 'border-[#63b783] bg-white text-[#146f42] shadow-[0_6px_16px_rgba(15,127,79,0.08)]' : 'border-[#d8e8de] bg-white/70 text-[#334d40] hover:border-[#9dcdb0] hover:bg-white'}`}
                    >
                      <SituationIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        <strong className="block text-sm font-semibold">{situation.label}</strong>
                        <span className="mt-0.5 block text-xs leading-5 text-[#708579]">{situation.description}</span>
                        <span className="mt-1 block text-[11px] font-semibold text-[#56806a]">Included when {situation.activationLabel}</span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        {selected ? (
          <p className="mt-4 flex items-center gap-2 rounded-[10px] border border-[#bfe0cc] bg-white px-3 py-2 text-sm font-semibold text-[#236d46]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Edit the {selected.label.toLowerCase()} wording below. Its inclusion rule remains locked.
          </p>
        ) : null}
      </section>
    )
  }

  if (scope === 'standard') {
    return (
      <section className="flex flex-col gap-4 rounded-[18px] border border-[#cfe4d7] bg-[#f5fbf7] p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="standard-context-heading">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[#c3dfce] bg-white text-[#167449]">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#56806a]">Applies to every {documentLabel}</p>
            <h2 id="standard-context-heading" className="mt-1 text-lg font-semibold text-[#18372a]">You are editing the shared foundation</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5f786b]">This wording appears for individuals, companies and trusts. Do not add company, trust, marriage or property-specific wording here.</p>
          </div>
        </div>
        <Link to={buildEditorLink(documentKey, 'situations', templateId)} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#a9d5b9] bg-white px-4 text-sm font-semibold text-[#176f43] transition hover:border-[#6db889] hover:bg-[#f1faf5]">
          Edit a conditional section
        </Link>
      </section>
    )
  }

  const isSigning = scope === 'signing'
  return (
    <section className="rounded-[18px] border border-[#dbe5ed] bg-white px-5 py-4" aria-labelledby="editor-context-heading">
      <h2 id="editor-context-heading" className="text-sm font-semibold text-[#2b3e53]">{isSigning ? 'You are editing signing rules' : 'You are viewing the whole document'}</h2>
      <p className="mt-1 text-sm leading-6 text-[#6c7e91]">{isSigning ? 'Signer rules are selected automatically from onboarding answers. Use the section list below to place signatures, initials and dates.' : 'For the safest edit, use Standard wording for shared text or Conditional sections for party, consent, property and finance wording.'}</p>
    </section>
  )
}
