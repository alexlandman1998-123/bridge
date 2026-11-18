import { useRef, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react'
import Modal from '../ui/Modal'
import { readAudienceImportFile } from '../../services/audienceImportService.js'
import { pickImportValue } from '../../lib/csvImport.js'
import { createAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository.js'

const CONTACT_TYPES = new Set(['buyer', 'seller', 'investor', 'tenant', 'landlord', 'prospect', 'lead'])
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/
const phoneKey = (value = '') => {
  const digits = String(value).replace(/\D/g, '')
  return digits.length === 10 && digits.startsWith('0') ? `27${digits.slice(1)}` : digits
}
const identityKeys = (contact) => [
  contact.email && `email:${String(contact.email).trim().toLowerCase()}`,
  contact.phone && `phone:${phoneKey(contact.phone)}`,
].filter(Boolean)

function parseRows(sheet, existingContacts) {
  const seen = new Set(existingContacts.flatMap(identityKeys))
  return sheet.rows.map((source) => {
    const values = Object.fromEntries(sheet.headers.map((header, index) => [header, source.cells[index] || '']))
    const fullName = pickImportValue(values, ['Name', 'Full Name', 'Contact Name'])
    const firstName = pickImportValue(values, ['First Name', 'Given Name'])
    const lastName = pickImportValue(values, ['Last Name', 'Surname', 'Family Name'])
    const name = fullName || [firstName, lastName].filter(Boolean).join(' ')
    const email = pickImportValue(values, ['Email', 'Email Address']).toLowerCase()
    const phone = pickImportValue(values, ['Phone', 'Mobile', 'Telephone', 'Cellphone'])
    const typeValue = pickImportValue(values, ['Contact Type', 'Type', 'Role']).toLowerCase().replace(/\s+/g, '_') || 'prospect'
    const contactType = ({ buyers: 'buyer', sellers: 'seller', tenants: 'tenant', landlords: 'landlord', investors: 'investor', prospects: 'prospect' })[typeValue] || typeValue
    const budgetText = pickImportValue(values, ['Budget', 'Estimated Value', 'Price'])
    const budget = budgetText ? Number(budgetText.replace(/[\s,R$]/g, '')) : 0
    const contact = {
      name,
      email,
      phone,
      contactType,
      areaInterest: pickImportValue(values, ['Area', 'Area Interest', 'Suburb', 'City']),
      propertyInterest: pickImportValue(values, ['Property Interest', 'Property Type', 'Requirements']),
      sellerPropertyAddress: pickImportValue(values, ['Property Address', 'Seller Property Address', 'Address']),
      notes: pickImportValue(values, ['Notes', 'Comments']),
      budget,
    }
    const errors = []
    if (!name) errors.push('Name required')
    if (!email && !phone) errors.push('Email or phone required')
    if (email && !emailPattern.test(email)) errors.push('Invalid email')
    if (phone && phoneKey(phone).length < 7) errors.push('Invalid phone')
    if (!CONTACT_TYPES.has(contactType)) errors.push('Unknown contact type')
    if (budgetText && (!Number.isFinite(budget) || budget < 0)) errors.push('Invalid budget')
    const duplicate = !errors.length && identityKeys(contact).some((key) => seen.has(key))
    if (!errors.length && !duplicate) identityKeys(contact).forEach((key) => seen.add(key))
    return {
      ...contact,
      rowNumber: source.number,
      contactId: crypto.randomUUID(),
      leadId: crypto.randomUUID(),
      state: errors.length ? 'invalid' : duplicate ? 'duplicate' : 'ready',
      message: errors.join('; ') || (duplicate ? 'Existing or repeated contact' : 'Ready to import'),
    }
  })
}

export default function AgencyContactBulkImportModal({ organisationId, existingContacts = [], onClose, onImported }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const lock = useRef(false)
  const ready = rows.filter((row) => row.state === 'ready' || row.state === 'failed').length
  const imported = rows.filter((row) => row.state === 'saved').length
  const duplicates = rows.filter((row) => row.state === 'duplicate').length
  const invalid = rows.filter((row) => row.state === 'invalid').length

  function downloadTemplate() {
    const csv = 'Name,Email,Phone,Contact Type,Area,Property Interest,Budget,Property Address,Notes\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'arch9-contacts-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function chooseFile(file) {
    if (!file || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setRows([])
    setFileName(file.name)
    try {
      const sheet = await readAudienceImportFile(file)
      setRows(parseRows(sheet, existingContacts))
    } catch (cause) {
      setError(cause?.message || 'Unable to read this file.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  async function importContacts() {
    if (lock.current || !organisationId || !ready) return
    lock.current = true
    setBusy(true)
    setError('')
    let completed = 0
    for (const row of rows.filter((item) => item.state === 'ready' || item.state === 'failed')) {
      try {
        const [firstName, ...lastName] = row.name.trim().split(/\s+/)
        await createAgencyCrmLeadRecord(organisationId, {
          contact: { contactId: row.contactId, firstName, lastName: lastName.join(' '), email: row.email, phone: row.phone, contactType: row.contactType, notes: row.notes },
          lead: { leadId: row.leadId, leadCategory: row.contactType, leadDirection: 'Inbound', leadSource: 'Bulk import', stage: 'New Lead', status: 'New Lead', priority: 'Medium', areaInterest: row.areaInterest, propertyInterest: row.propertyInterest, budget: row.budget, sellerPropertyAddress: row.sellerPropertyAddress, notes: row.notes },
        }, { notifyAgent: false })
        completed += 1
        setRows((current) => current.map((item) => item.contactId === row.contactId ? { ...item, state: 'saved', message: 'Imported' } : item))
      } catch (cause) {
        setRows((current) => current.map((item) => item.contactId === row.contactId ? { ...item, state: 'failed', message: cause?.message || 'Could not save; retry is safe' } : item))
      }
    }
    lock.current = false
    setBusy(false)
    if (completed) await onImported?.()
    if (!completed && ready) setError('No contacts were imported. Review the row results and retry.')
  }

  return (
    <Modal open title="Bulk upload contacts" subtitle="Excel or CSV · Review the rows before importing" onClose={busy ? undefined : onClose}>
      <div className="space-y-4">
        {!rows.length ? (
          <>
            <div
              className={`flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition ${dragging ? 'border-[#248568] bg-[#f2f8f5]' : 'border-[#cfd8d3] bg-[#fbfdfc]'}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseFile(event.dataTransfer.files?.[0]) }}
            >
              <UploadCloud size={30} className="text-[#248568]" strokeWidth={1.6} />
              <strong className="mt-3 text-sm font-semibold text-[#202a33]">Drop a contact file here</strong>
              <span className="mt-1 text-xs text-[#74808a]">.xlsx, .xls or .csv · Up to 1,000 contacts · 5 MiB</span>
              <label className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#dfe3e8] bg-white px-4 text-sm font-medium text-[#43534a] hover:bg-[#f8faf9]">
                <FileSpreadsheet size={16} />{busy ? 'Reading file…' : 'Choose file'}
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy} onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = '' }} />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-xs leading-5 text-[#74808a]">Include a name and at least an email or phone. Contact type can be buyer, seller, investor, tenant, landlord, prospect or lead. Import does not send messages or grant marketing permission.</p>
              <button type="button" className="inline-flex items-center gap-2 text-sm font-medium text-[#17634d] hover:underline" onClick={downloadTemplate}><Download size={15} />Download template</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[#43534a]">{fileName}</p>
              <span className="text-xs text-[#74808a]">{rows.length} rows · {ready} ready · {imported} imported · {duplicates} duplicates · {invalid} invalid</span>
            </div>
            <div className="max-h-80 overflow-auto rounded-xl border border-[#dfe3e8]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-[#f7f9f8] text-xs font-semibold uppercase tracking-wide text-[#66736c]"><tr><th className="p-3">Row</th><th className="p-3">Name</th><th className="p-3">Email / phone</th><th className="p-3">Type</th><th className="p-3">Result</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={row.contactId} className="border-t border-[#edf0ee]"><td className="p-3 text-[#74808a]">{row.rowNumber}</td><td className="p-3 font-medium text-[#202a33]">{row.name || '—'}</td><td className="p-3 text-[#53615b]">{row.email || row.phone || '—'}</td><td className="p-3 capitalize text-[#53615b]">{row.contactType}</td><td className={`p-3 ${row.state === 'failed' || row.state === 'invalid' ? 'text-[#a53a32]' : row.state === 'saved' ? 'text-[#17634d]' : 'text-[#66736c]'}`}>{row.message}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
        {error ? <p role="alert" className="text-sm text-[#a53a32]">{error}</p> : null}
        <footer className="flex justify-end gap-2 border-t border-[#e4e8eb] pt-4">
          <button type="button" className="min-h-10 rounded-lg px-4 text-sm font-medium text-[#596671] hover:bg-[#f3f6f5]" disabled={busy} onClick={onClose}>Close</button>
          {rows.length ? <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#176b52] px-4 text-sm font-semibold text-white hover:bg-[#12553f] disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !ready || !organisationId} onClick={() => void importContacts()}><CheckCircle2 size={16} />{busy ? 'Importing…' : ready ? `Import ${ready} contacts` : 'Import complete'}</button> : null}
        </footer>
      </div>
    </Modal>
  )
}
