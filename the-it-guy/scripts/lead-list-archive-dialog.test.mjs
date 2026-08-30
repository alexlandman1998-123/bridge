import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyLeadListRoutePage.jsx', import.meta.url), 'utf8')

assert.doesNotMatch(source, /window\.confirm\('Archive this lead\?'/)
assert.match(source, /const \[archiveDialog, setArchiveDialog\] = useState\(\{ open: false, leadId: '' \}\)/)
assert.match(source, /onArchiveLead=\{\(leadId\) => \{ setError\(''\); setArchiveDialog\(\{ open: true, leadId \}\) \}\}/)
assert.match(source, /updateAgencyCrmLeadRecord\(organisationId, leadId, \{ stage: 'Archived', status: 'Archived' \}\)/)
assert.match(source, /confirmLabel="Archive lead"/)

console.log('lead list archive dialog checks passed')
