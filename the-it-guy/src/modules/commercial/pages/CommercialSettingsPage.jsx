import { ArrowRight, DatabaseZap, FileText, Layers3, Settings, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buildCommercialDocumentGeneratorPath } from '../../../services/documents/commercialDocumentAdapterService'

function CommercialSettingsPage() {
  return (
    <div className="grid gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Commercial Settings</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Commercial workspace controls, template management, and document creation entry points live here.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Settings size={14} /> Workspace ready
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link to="/commercial/settings/document-templates" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] transition hover:border-blue-200 hover:bg-[#fbfcfe]">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
            <Layers3 size={19} />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-[#102236]">Commercial Template Studio</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Manage commercial sales and leasing templates, merge fields, previews, and publishing.</p>
          <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1b6f55]">
            Open studio
            <ArrowRight size={14} />
          </span>
        </Link>

        <Link to={buildCommercialDocumentGeneratorPath()} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] transition hover:border-blue-200 hover:bg-[#fbfcfe]">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
            <FileText size={19} />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-[#102236]">Document Generator</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Create commercial sale and lease documents from the existing packet engine.</p>
          <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1b6f55]">
            Generate a document
            <ArrowRight size={14} />
          </span>
        </Link>

        <Link to="/commercial/documents" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] transition hover:border-blue-200 hover:bg-[#fbfcfe]">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
            <Wrench size={19} />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-[#102236]">Document Centre</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Review generated documents, requests, and compliance items across the portfolio.</p>
          <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1b6f55]">
            Open document centre
            <ArrowRight size={14} />
          </span>
        </Link>

        <Link to="/commercial/settings/bulk-upload" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)] transition hover:border-blue-200 hover:bg-[#fbfcfe]">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#123b61]">
            <DatabaseZap size={19} />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-[#102236]">Bulk Upload & Imports</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Configure upload access for vacancies, leads, and commercial canvassing prospects.</p>
          <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1b6f55]">
            Configure imports
            <ArrowRight size={14} />
          </span>
        </Link>
      </section>
    </div>
  )
}

export default CommercialSettingsPage
