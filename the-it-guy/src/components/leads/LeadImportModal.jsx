import { Download, FileUp, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { csvEscape, mapCsvRowsToImportRows, parseCsvText, pickImportValue } from '../../lib/csvImport'
import { leadCategoryLabel, normalizeLeadCategory } from '../../lib/leadCategory'
import { processManualImportPayload } from '../../services/leadSourceConnectorService'

const LEAD_IMPORT_TEMPLATE_COLUMNS = [
  'Name',
  'Phone',
  'Email',
  'Lead Category',
  'Source',
  'Listing Reference',
  'Area',
  'Property Type',
  'Budget Min',
  'Budget Max',
  'Bedrooms',
  'Bathrooms',
  'Message',
  'External Reference',
]

const LEAD_IMPORT_TEMPLATE_ROWS = [
  ['Nomsa Dlamini', '082 555 0101', 'nomsa@example.com', 'buyer', 'Manual Import', 'P24-12345', 'Sandton', 'Apartment', '1200000', '1800000', '2', '2', 'Interested in viewing this week', 'IMPORT-001'],
  ['Pieter Botha', '083 555 0102', 'pieter@example.com', 'seller', 'Manual Import', '', 'Boksburg', 'House', '', '', '', '', 'Wants a valuation and sale estimate', 'IMPORT-002'],
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getLockedImportCategory(value = '') {
  const category = normalizeLeadCategory(value, '')
  return category === 'buyer' || category === 'seller' ? category : ''
}

function buildLeadImportTemplateCsv(defaultLeadCategory = '') {
  const lockedCategory = getLockedImportCategory(defaultLeadCategory)
  const categoryIndex = LEAD_IMPORT_TEMPLATE_COLUMNS.indexOf('Lead Category')
  const rows = lockedCategory
    ? LEAD_IMPORT_TEMPLATE_ROWS.filter((row) => normalizeLeadCategory(row[categoryIndex], '') === lockedCategory)
    : LEAD_IMPORT_TEMPLATE_ROWS
  return [LEAD_IMPORT_TEMPLATE_COLUMNS, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n')
}

function downloadTextFile(fileName, text) {
  if (typeof document === 'undefined') return
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

function lockImportRowCategory(row = {}, defaultLeadCategory = '') {
  const lockedCategory = getLockedImportCategory(defaultLeadCategory)
  if (!lockedCategory) return row
  return {
    ...row,
    'Lead Category': lockedCategory,
    leadCategory: lockedCategory,
  }
}

export default function LeadImportModal({ open, organisationId, actor, defaultLeadCategory = '', onClose, onImported }) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const lockedLeadCategory = getLockedImportCategory(defaultLeadCategory)
  const lockedLeadCategoryLabel = lockedLeadCategory ? leadCategoryLabel(lockedLeadCategory) : ''

  useEffect(() => {
    if (!open) {
      setFileName('')
      setRows([])
      setError('')
      setImporting(false)
      setResult(null)
    }
  }, [open])

  if (!open) return null

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setError('')
      setResult(null)
      const text = await file.text()
      const parsedRows = mapCsvRowsToImportRows(parseCsvText(text))
      if (!parsedRows.length) throw new Error('No lead rows found in this CSV.')
      setFileName(file.name)
      setRows(parsedRows.map((row) => lockImportRowCategory(row, lockedLeadCategory)))
    } catch (fileError) {
      setFileName(file.name || '')
      setRows([])
      setError(fileError?.message || 'Could not read this CSV.')
    }
  }

  async function handleImportRows() {
    if (!organisationId) {
      setError('Select an agency workspace before importing leads.')
      return
    }
    if (!rows.length) {
      setError('Choose a CSV file before importing.')
      return
    }

    try {
      setImporting(true)
      setError('')
      const importResult = await processManualImportPayload(rows, { organisationId, actor })
      setResult(importResult)
      await onImported?.()
    } catch (importError) {
      setError(importError?.message || 'Lead import failed.')
    } finally {
      setImporting(false)
    }
  }

  const previewRows = rows.slice(0, 5)
  const failedRows = result?.results
    ?.map((entry, index) => ({ entry, row: rows[index] }))
    .filter(({ entry }) => entry.ok === false) || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Bulk Upload</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{lockedLeadCategoryLabel ? `Import ${lockedLeadCategoryLabel} Leads` : 'Import Leads'}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {lockedLeadCategoryLabel
                ? `Upload a CSV of ${lockedLeadCategoryLabel.toLowerCase()} leads. Rows in this upload will be imported as ${lockedLeadCategoryLabel.toLowerCase()} leads.`
                : 'Upload a CSV of buyer or seller leads. Imported rows will create linked lead records where possible.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Close import modal">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          {result ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">{result.processed || 0} imported · {result.failed || 0} failed</p>
              {failedRows.length ? <p className="mt-1 text-emerald-700">Failed rows can be corrected and uploaded again.</p> : null}
            </div>
          ) : null}

          <section className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-950">{fileName || 'No CSV selected'}</p>
              <p className="mt-1 text-xs text-slate-500">
                {rows.length
                  ? `${rows.length} ${lockedLeadCategoryLabel ? `${lockedLeadCategoryLabel.toLowerCase()} ` : ''}rows ready to import`
                  : 'Use the template columns for the cleanest import.'}
              </p>
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <FileUp size={16} />
              Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleFileChange(event)} />
            </label>
            <button type="button" onClick={() => downloadTextFile('arch9-lead-import-template.csv', buildLeadImportTemplateCsv(lockedLeadCategory))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Download size={16} />
              Template
            </button>
          </section>

          {previewRows.length ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">Preview</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white text-xs uppercase tracking-[0.08em] text-slate-400">
                    <tr>
                      {['Row', 'Name', 'Phone', 'Email', 'Lead Category', 'Source', 'Area'].map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => (
                      <tr key={row.__rowNumber}>
                        <td className="px-4 py-3 text-slate-500">{row.__rowNumber}</td>
                        <td className="px-4 py-3 font-semibold text-slate-950">{pickImportValue(row, ['Name', 'name', 'Full Name', 'fullName']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Phone', 'phone', 'Mobile', 'mobile']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Email', 'email']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Lead Category', 'leadCategory', 'category']) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Source', 'source']) || 'Manual Import'}</td>
                        <td className="px-4 py-3 text-slate-600">{pickImportValue(row, ['Area', 'area', 'Suburb', 'suburb']) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {failedRows.length ? (
            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">Failed rows</p>
              <div className="mt-2 max-h-36 overflow-auto text-xs text-amber-700">
                {failedRows.slice(0, 8).map(({ entry, row }, index) => <p key={`${entry.error}-${index}`}>Row {row?.__rowNumber || index + 2}: {entry.error || 'Import failed'}</p>)}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{rows.length ? `${rows.length} rows loaded` : 'CSV format only'}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={handleImportRows} disabled={!rows.length || importing || !organisationId} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <FileUp size={16} />
              {importing ? 'Importing...' : 'Import Leads'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
