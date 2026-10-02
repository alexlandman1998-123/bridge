import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { listRentalImportContacts, previewRentalClientImport, saveRentalImportedContact } from '../../services/rentals/rentalClientImportRepository.js'

export default function RentalClientImportModal({ organisationId, actorId, existingClients = [], onClose, onImported }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const guard = useRef(false)
  const ready = rows.filter((row) => row.state === 'ready').length
  const invalid = rows.filter((row) => row.state === 'invalid').length
  const saved = rows.filter((row) => row.state === 'saved').length
  const duplicates = rows.filter((row) => row.state === 'duplicate').length
  function template() {
    const url = URL.createObjectURL(new Blob(['Name,Email,Phone,Contact Type,Notes\n'], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'rental-clients-template.csv'; link.click(); URL.revokeObjectURL(url)
  }
  async function selectFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || guard.current) return
    guard.current = true; setBusy(true); setError(''); setRows([]); setFileName(file.name)
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a CSV smaller than 2 MB.')
      const contacts = await listRentalImportContacts(organisationId)
      setRows(previewRentalClientImport(await file.text(), [...contacts, ...existingClients]))
    } catch (cause) { setError(cause?.message || 'Unable to read this CSV.') }
    finally { guard.current = false; setBusy(false) }
  }
  async function importRows() {
    if (guard.current || invalid || !ready) return
    guard.current = true; setBusy(true); setError('')
    let completed = 0
    try {
      for (const row of rows.filter((item) => item.state === 'ready')) {
        await saveRentalImportedContact(organisationId, row, { actorId })
        completed += 1
        setRows((current) => current.map((item) => item.contactId === row.contactId ? { ...item, state: 'saved', message: 'Imported' } : item))
      }
    } catch (cause) { setError(`${cause?.message || 'Import failed.'} Imported rows have been kept. Retry imports the remaining rows.`) }
    finally {
      guard.current = false; setBusy(false)
      if (completed) await onImported?.()
    }
  }
  return <Modal open title="Import rental clients" onClose={busy ? undefined : onClose}>
    <div className="space-y-4">
      <p className="text-sm text-[#60758b]">Upload a CSV into the shared client database. Contact types: tenant, landlord, buyer, seller, investor, prospect or lead. Blank types default to tenant.</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={busy} onClick={template}><Download size={16} />CSV template</Button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#dbe4ee] bg-white px-4 py-2.5 text-sm font-semibold text-[#35546c]"><Upload size={16} />Choose CSV<input aria-label="Choose clients CSV" type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={selectFile} /></label></div>
      {fileName ? <p className="text-sm text-[#60758b]">{fileName}</p> : null}
      {rows.length ? <><p role="status" className="text-sm text-[#35546c]">{ready} ready · {saved} imported · {duplicates} duplicates skipped · {invalid} need correction</p><div className="max-h-72 overflow-auto rounded-xl border border-[#dbe4ee]"><table className="w-full min-w-[540px] text-left text-sm"><thead className="bg-[#f8fafc] text-[#60758b]"><tr><th className="p-3">Name</th><th className="p-3">Contact</th><th className="p-3">Type</th><th className="p-3">Result</th></tr></thead><tbody>{rows.map((row) => <tr key={row.contactId} className="border-t border-[#edf2f7]"><td className="p-3">{row.name || `Row ${row.rowNumber}`}</td><td className="p-3">{row.email || row.phone}</td><td className="p-3">{row.contactType}</td><td className={`p-3 ${row.state === 'invalid' ? 'text-[#9f3131]' : 'text-[#60758b]'}`}>{row.message}</td></tr>)}</tbody></table></div></> : null}
      {invalid ? <p className="text-sm text-[#9f3131]">Correct the invalid rows in your CSV and upload it again before importing.</p> : null}
      {error ? <p role="alert" className="text-sm text-[#9f3131]">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Close</Button><Button type="button" disabled={busy || invalid > 0 || !ready} onClick={() => void importRows()}>{busy ? 'Working…' : saved && ready ? `Retry ${ready} contacts` : `Import ${ready} contacts`}</Button></div>
    </div>
  </Modal>
}
