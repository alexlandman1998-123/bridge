import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  HeartHandshake,
  House,
  KeyRound,
  Landmark,
  Layers3,
  Link2,
  ReceiptText,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  LEGAL_DOCUMENT_EDITOR_SITUATION_GROUPS,
  listLegalDocumentEditorSituations,
} from '../../core/documents/legalDocumentEditorSituations'
import { buildLegalDocumentEditorPath } from '../../core/documents/legalDocumentRoutes'

const SITUATION_ICONS = Object.freeze({
  individual: UserRound,
  company: Building2,
  trust: Landmark,
  married_in_community: HeartHandshake,
  sectional_title: Layers3,
  estate_hoa: House,
  finance: CircleDollarSign,
  occupation_lease: KeyRound,
  linked_sale: Link2,
  tax_vat: ReceiptText,
})

function buildEditorLink(documentKey, scope, templateId, situationKey = '', advancedMode = false) {
  return buildLegalDocumentEditorPath(documentKey, scope, { templateId, situationKey, advanced: advancedMode })
}

export default function LegalDocumentEditorContextPanel({ documentKey, documentLabel, scope, templateId = '', situationKey = '', advancedMode = false }) {
  if (scope === 'situations') {
    const situations = listLegalDocumentEditorSituations()
    const selected = situations.find((situation) => situation.key === situationKey) || null
    return (
      <section className="rounded-[18px] border border-[#cfe4d7] bg-[#f5fbf7] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.035)]" aria-labelledby="situation-picker-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[#c3dfce] bg-white text-[#167449]">
              <Layers3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#56806a]">Conditional clauses</p>
              <h2 id="situation-picker-heading" className="mt-1 text-lg font-semibold text-[#18372a]">Added automatically from onboarding answers</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5f786b]">Choose the answer group you want to edit. These clauses are included only when the buyer, property or sale details make them relevant.</p>
            </div>
          </div>
          <Link to={buildEditorLink(documentKey, 'standard', templateId, '', advancedMode)} className="inline-flex min-h-11 shrink-0 items-center gap-3 rounded-[12px] border border-[#b8d9c5] bg-white px-4 text-left text-sm text-[#385647] shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:border-[#76b990] hover:bg-[#fbfefc]">
            <FileText className="h-5 w-5 text-[#167449]" aria-hidden="true" />
            <span>
              <strong className="block font-semibold text-[#18372a]">Standard template</strong>
              <span className="block text-xs text-[#708579]">Core wording always included</span>
            </span>
          </Link>
        </div>
        <div className="mt-5 space-y-5">
          {LEGAL_DOCUMENT_EDITOR_SITUATION_GROUPS.map((group) => {
            const groupSituations = situations.filter((situation) => situation.groupKey === group.key)
            return (
              <fieldset key={group.key} className="min-w-0">
                <legend className="w-full">
                  <span className="block text-sm font-semibold text-[#284838]">{group.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#708579]">{group.description}</span>
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {groupSituations.map((situation) => {
                    const SituationIcon = SITUATION_ICONS[situation.key] || FileText
                    const active = situation.key === selected?.key
                    return (
                      <Link
                        key={situation.key}
                        to={buildEditorLink(documentKey, 'situations', templateId, situation.key, advancedMode)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-[74px] items-start gap-3 rounded-[12px] border px-3 py-3 transition ${active ? 'border-[#63b783] bg-white text-[#146f42] shadow-[0_6px_16px_rgba(15,127,79,0.08)]' : 'border-[#d8e8de] bg-white/70 text-[#334d40] hover:border-[#9dcdb0] hover:bg-white'}`}
                      >
                        <SituationIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          <strong className="block text-sm font-semibold">{situation.label}</strong>
                          <span className="mt-0.5 block text-xs leading-5 text-[#708579]">{situation.description}</span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>
        {selected ? (
          <p className="mt-4 flex items-center gap-2 rounded-[10px] border border-[#bfe0cc] bg-white px-3 py-2 text-sm font-semibold text-[#236d46]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Editing {selected.label.toLowerCase()} clauses. Bridge includes them only when the matching onboarding answer applies.
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
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#56806a]">Always included</p>
            <h2 id="standard-context-heading" className="mt-1 text-lg font-semibold text-[#18372a]">{documentLabel} standard template</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5f786b]">This is the core wording that stays the same. Bridge adds conditional clauses automatically from the onboarding answers.</p>
          </div>
        </div>
        <Link to={buildEditorLink(documentKey, 'situations', templateId, '', advancedMode)} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#a9d5b9] bg-white px-4 text-sm font-semibold text-[#176f43] transition hover:border-[#6db889] hover:bg-[#f1faf5]">
          Manage conditional clauses
        </Link>
      </section>
    )
  }

  const isSigning = scope === 'signing'
  return (
    <section className="rounded-[18px] border border-[#dbe5ed] bg-white px-5 py-4" aria-labelledby="editor-context-heading">
      <h2 id="editor-context-heading" className="text-sm font-semibold text-[#2b3e53]">{isSigning ? 'You are editing signing rules' : 'You are viewing the whole document'}</h2>
      <p className="mt-1 text-sm leading-6 text-[#6c7e91]">{isSigning ? 'Signer rules are selected automatically from onboarding answers. Use the section list below to place signatures, initials and dates.' : 'The full document combines the standard template with every conditional clause. Use the focused areas when editing.'}</p>
    </section>
  )
}
