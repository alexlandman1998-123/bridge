import { Building2, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { commercialCrudConfigs } from '../commercialCrudConfig'
import CommercialCrudPage from '../components/CommercialCrudPage'
import { createCommercialCompany, createCommercialContact } from '../services/commercialApi'

function splitContactName(value = '') {
  const trimmed = String(value || '').trim()
  if (!trimmed) return { first_name: '', last_name: '' }
  const [first, ...rest] = trimmed.split(/\s+/)
  return { first_name: first || '', last_name: rest.join(' ') || '' }
}

function parseCsvLine(line = '') {
  const values = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values.map((value) => value.replace(/^"|"$/g, '').trim())
}

function parseCsv(text = '') {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((value) => value.toLowerCase())
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || ''
      return row
    }, {})
  }).filter((row) => row['company name'] || row.company_name)
}

function CsvImportModal({ open, brokerOptions = [], defaultBrokerId = '', organisationId = '', reload, onClose }) {
  const [csvText, setCsvText] = useState('')
  const [brokerId, setBrokerId] = useState(defaultBrokerId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  if (!open) return null

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
  }

  async function handleImport(event) {
    event.preventDefault()
    setError('')
    setSummary(null)
    const rows = parseCsv(csvText)
    if (!organisationId) {
      setError('Commercial organisation context is not available.')
      return
    }
    if (!brokerId) {
      setError('Select a broker owner before importing.')
      return
    }
    if (!rows.length) {
      setError('Add a CSV with at least one data row.')
      return
    }

    setSaving(true)
    try {
      let companiesCreated = 0
      let contactsCreated = 0
      for (const row of rows) {
        const companyName = row['company name'] || row.company_name
        if (!companyName) continue
        const contactName = row['contact name'] || row.contact_name
        const email = row.email
        const phone = row.phone
        const mobile = row.mobile
        const company = await createCommercialCompany({
          organisation_id: organisationId,
          broker_id: brokerId,
          company_name: companyName,
          email: email || null,
          phone: phone || mobile || null,
          company_type: 'tenant',
          status: 'active',
          notes: 'Imported from CSV',
        })
        companiesCreated += 1
        if (contactName || email || phone || mobile) {
          const name = splitContactName(contactName)
          await createCommercialContact({
            organisation_id: organisationId,
            company_id: company.id,
            broker_id: brokerId,
            ...name,
            email: email || null,
            phone: phone || null,
            mobile: mobile || null,
            is_primary: true,
            decision_maker: true,
          })
          contactsCreated += 1
        }
      }
      setSummary({ companiesCreated, contactsCreated })
      await reload?.()
      setCsvText('')
    } catch (saveError) {
      setError(saveError?.message || 'The CSV import could not be completed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form onSubmit={handleImport} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">CSV Import</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">Import Companies</h2>
            <p className="mt-2 text-sm text-slate-500">Use columns `Company Name`, `Contact Name`, `Email`, and `Phone`.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>
        <div className="grid gap-4 overflow-y-auto p-5">
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}
          {summary ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{summary.companiesCreated} companies and {summary.contactsCreated} contacts imported.</div> : null}
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Broker owner</span>
            <select value={brokerId} onChange={(event) => setBrokerId(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]">
              <option value="">Select broker...</option>
              {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">CSV file</span>
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-[#102236] transition hover:border-slate-400 hover:bg-white">
              <Upload size={16} />
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">CSV content</span>
            <textarea
              rows={12}
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder={'Company Name,Contact Name,Email,Phone\nGrowthpoint,John Smith,john@example.com,011 555 0101'}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
        </div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-2xl bg-[#102b46] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Importing...' : 'Import CSV'}
          </button>
        </footer>
      </form>
    </div>
  )
}

function CommercialCompaniesPage() {
  const [importState, setImportState] = useState({ open: false, organisationId: '', brokerOptions: [], defaultBrokerId: '', reload: null })

  const config = useMemo(() => ({
    ...commercialCrudConfigs.companies,
    secondaryActions: [
      {
        label: 'Import CSV',
        onClick: ({ organisationId, lookups, reload }) => {
          const brokers = lookups?.brokers || []
          setImportState({
            open: true,
            organisationId,
            brokerOptions: brokers,
            defaultBrokerId: brokers[0]?.value || '',
            reload,
          })
        },
      },
    ],
    columns: commercialCrudConfigs.companies.columns.map((column) => (
      column.key === 'company_name'
        ? {
            ...column,
            render: (row) => (
              <Link to={`/commercial/companies/${row.id}`} className="inline-flex items-center gap-2 font-semibold text-[#1267a3] transition hover:text-[#0f5485]">
                <Building2 size={14} />
                {row.company_name || row.name || 'Commercial company'}
              </Link>
            ),
          }
        : column
    )),
  }), [])

  return (
    <>
      <CommercialCrudPage config={config} />
      <CsvImportModal
        open={importState.open}
        organisationId={importState.organisationId}
        brokerOptions={importState.brokerOptions}
        defaultBrokerId={importState.defaultBrokerId}
        reload={importState.reload}
        onClose={() => setImportState({ open: false, organisationId: '', brokerOptions: [], defaultBrokerId: '', reload: null })}
      />
    </>
  )
}

export default CommercialCompaniesPage
