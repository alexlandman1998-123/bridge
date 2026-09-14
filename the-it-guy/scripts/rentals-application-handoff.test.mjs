import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = join(appRoot, '..')
const read = (path) => readFile(join(appRoot, path), 'utf8')
const readRepository = (path) => readFile(join(repositoryRoot, path), 'utf8')
const leadWorkspace = await read('src/pages/rentals/RentalLeadWorkspacePage.jsx')
const invitePanel = await read('src/modules/rentals/shared/vacancies/RentalApplicationInvitePanel.jsx')
const applicationDetail = await read('src/pages/rentals/RentalApplicationDetailPage.jsx')
const decisionPanel = await read('src/modules/rentals/shared/applications/RentalApplicationDecisionPanel.jsx')
const approvalGuard = await readRepository('supabase/migrations/20260913120000_rental_application_approval_readiness.sql')

for (const token of ['leadId: lead.id', "toStage: 'application_submitted'", 'applicationReference: application.id']) {
  assert.ok(leadWorkspace.includes(token), `Lead-to-application handoff is missing: ${token}`)
}

for (const token of ['Start an application from a tenant lead', 'Open tenant leads', 'enquiry, viewing, applicant link, and decision trail']) {
  assert.ok(invitePanel.includes(token), `Vacancy application handoff is unclear: ${token}`)
}
assert.ok(!invitePanel.includes('createPersistedRentalApplication'), 'Vacancies must not create an unlinked application.')

for (const token of ['Documents and consent record', 'Required consents', 'REQUIRED_CONSENT_TYPES', 'Not recorded']) {
  assert.ok(applicationDetail.includes(token), `Application reviewer cannot inspect consent evidence: ${token}`)
}

for (const token of ['REQUIRED_DOCUMENT_TYPES', 'REQUIRED_CONSENT_TYPES', 'REQUIRED_SCREENING_CHECKS', 'approvalBlocked', 'Approval readiness', 'listRentalApplicationScreeningChecks']) {
  assert.ok(decisionPanel.includes(token), `Approval readiness is incomplete: ${token}`)
}

for (const token of ["p_decision = 'approved'", 'Approval requires uploaded identity and proof of income documents', 'Approval requires all applicant consents', 'Approval requires all screening checks to pass']) {
  assert.ok(approvalGuard.includes(token), `Server-side approval guard is missing: ${token}`)
}

console.log('Rentals application handoff and approval readiness checks passed.')
