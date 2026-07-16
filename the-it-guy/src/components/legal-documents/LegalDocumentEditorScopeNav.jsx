import { ArrowLeft, FileText, Layers3, LayoutList, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  buildLegalDocumentEditorPath,
  buildLegalDocumentsLandingPath,
} from '../../core/documents/legalDocumentRoutes'

const SCOPE_OPTIONS = Object.freeze([
  { key: 'standard', label: 'Standard template', Icon: FileText },
  { key: 'situations', label: 'Conditional clauses', Icon: Layers3 },
  { key: 'all', label: 'Full document', Icon: LayoutList },
  { key: 'signing', label: 'Signing fields', Icon: UsersRound },
])

export default function LegalDocumentEditorScopeNav({ documentKey, scope, templateId = '', situationKey = '', advancedMode = false }) {
  return (
    <div className="space-y-4">
      <Link
        to={buildLegalDocumentsLandingPath()}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#607387] transition hover:text-[#0f7f4f]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All legal documents
      </Link>

      <nav className="overflow-x-auto rounded-[16px] border border-[#dce6ee] bg-white p-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]" aria-label="Document editor areas">
        <div className="flex min-w-max gap-1">
          {SCOPE_OPTIONS.map((option) => {
            const ScopeIcon = option.Icon
            const active = scope === option.key
            return (
              <Link
                key={option.key}
                to={buildLegalDocumentEditorPath(documentKey, option.key, {
                  templateId,
                  situationKey: option.key === 'situations' ? situationKey : '',
                  advanced: advancedMode,
                })}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center gap-2 rounded-[11px] border px-3.5 py-2 text-sm font-semibold transition ${active
                  ? 'border-[#a9d8bd] bg-[#eef9f2] text-[#117443]'
                  : 'border-transparent text-[#607387] hover:border-[#dce6ee] hover:bg-[#f8fafc] hover:text-[#24364b]'}`}
              >
                <ScopeIcon className="h-4 w-4" aria-hidden="true" />
                {option.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
